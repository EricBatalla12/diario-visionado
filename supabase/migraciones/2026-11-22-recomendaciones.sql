-- ============================================================================
-- KIROKU — migración: recomendaciones entre operadores
--
-- Se pega en Supabase → SQL Editor → Run ANTES de publicar la web que la usa.
-- Es idempotente. supabase/esquema.sql ya la incluye para instalaciones nuevas.
--
-- Reglas:
--   · Cada operador decide quién puede recomendarle: nadie, solo su lista
--     (aparte de la de privacidad) o cualquiera (por defecto), y cuántas
--     recomendaciones pendientes acepta de cada remitente (1–10, por defecto 3).
--   · Una recomendación la ven y la borran solo quien la manda y quien la
--     recibe. No se editan: se resuelven (se borran) o se cancelan.
--   · No hay historial: al resolverla se borra. Si se añade al archivo, la
--     entrada guarda quién la recomendó en `recomendado_por`.
--   · El remitente nunca sabe si el receptor ya tenía el título (filtraría
--     archivos privados): la inserción no lo comprueba.
-- ============================================================================

alter table public.perfiles add column if not exists recibe_recos text not null default 'todos';
alter table public.perfiles add column if not exists recos_max smallint not null default 3;
do $$ begin
  alter table public.perfiles add constraint perfiles_recibe_recos_check check (recibe_recos in ('nadie', 'lista', 'todos'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.perfiles add constraint perfiles_recos_max_check check (recos_max between 1 and 10);
exception when duplicate_object then null; end $$;

-- Quién puede recomendarte cuando eliges "solo mi lista"
create table if not exists public.permisos_reco (
  dueno       uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  autorizado  uuid not null references public.perfiles (id) on delete cascade,
  creado      timestamptz not null default now(),
  primary key (dueno, autorizado),
  check (dueno <> autorizado)
);
create index if not exists permisos_reco_autorizado_idx on public.permisos_reco (autorizado);

-- `media` es una ficha reducida de AniList (título, portada, formato…) para
-- pintar la carta del buzón; al añadirla al archivo se vuelve a pedir a AniList.
create table if not exists public.recomendaciones (
  id        uuid primary key default gen_random_uuid(),
  de        uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  para      uuid not null references public.perfiles (id) on delete cascade,
  media_id  integer not null check (media_id > 0),
  media     jsonb not null check (pg_column_size(media) <= 4000),
  mensaje   text not null default '' check (char_length(mensaje) <= 280),
  nota      numeric(3, 1) check (nota is null or nota between 0 and 10),
  creado    timestamptz not null default now(),
  unique (de, para, media_id),
  check (de <> para)
);
create index if not exists recomendaciones_para_idx on public.recomendaciones (para);

alter table public.entradas add column if not exists recomendado_por uuid
  references public.perfiles (id) on delete set null;

-- Si quien lo recomendó borra su cuenta, la base de datos pone null aquí, pero
-- la web puede tener aún su id en memoria y volver a mandarlo al guardar: en
-- vez de fallar (y reintentar sin fin), se guarda null.
create or replace function public.kiroku_limpia_recomendado()
returns trigger language plpgsql as $$
begin
  if new.recomendado_por is not null
     and not exists (select 1 from public.perfiles where id = new.recomendado_por) then
    new.recomendado_por := null;
  end if;
  return new;
end $$;

drop trigger if exists entradas_recomendado on public.entradas;
create trigger entradas_recomendado
  before insert or update on public.entradas
  for each row execute function public.kiroku_limpia_recomendado();

-- ¿Acepta `receptor` recomendaciones de quien ha iniciado sesión?
-- security definer: lee perfiles y permisos_reco sin depender de sus reglas.
create or replace function public.kiroku_acepta_recos(receptor uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select receptor <> auth.uid() and coalesce(
    (select case p.recibe_recos
              when 'todos' then true
              when 'lista' then exists (select 1 from public.permisos_reco r
                                         where r.dueno = receptor and r.autorizado = auth.uid())
              else false end
       from public.perfiles p where p.id = receptor),
    false);
$$;
revoke all on function public.kiroku_acepta_recos(uuid) from public, anon;
grant execute on function public.kiroku_acepta_recos(uuid) to authenticated;

-- Tope de pendientes: el que pone el receptor por remitente, y 200 en total
-- por remitente para que nadie llene la base de datos. El cerrojo evita que
-- dos envíos a la vez se cuelen los dos por encima del tope.
create or replace function public.kiroku_tope_recos()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  maximo smallint;
begin
  -- La regla de inserción ya lo impide; esto solo da un error que se entienda
  -- (el trigger corre antes que la regla)
  if not public.kiroku_acepta_recos(new.para) then
    raise exception 'kiroku_recos_no_acepta: este operador no acepta tus recomendaciones';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('kiroku_reco:' || new.de::text, 0));
  select recos_max into maximo from public.perfiles where id = new.para;
  if (select count(*) from public.recomendaciones where de = new.de and para = new.para) >= coalesce(maximo, 3) then
    raise exception 'kiroku_recos_max: este operador ya tiene % recomendaciones tuyas pendientes', coalesce(maximo, 3);
  end if;
  if (select count(*) from public.recomendaciones where de = new.de) >= 200 then
    raise exception 'kiroku_recos_total: límite de 200 recomendaciones pendientes';
  end if;
  return new;
end $$;

drop trigger if exists recomendaciones_tope on public.recomendaciones;
create trigger recomendaciones_tope
  before insert on public.recomendaciones
  for each row execute function public.kiroku_tope_recos();

-- ── Seguridad por filas ─────────────────────────────────────────────────────
alter table public.permisos_reco enable row level security;
alter table public.recomendaciones enable row level security;
revoke all on public.permisos_reco, public.recomendaciones from anon;
grant select, insert, delete on public.permisos_reco, public.recomendaciones to authenticated;

-- Lista de "pueden recomendarme": como la de privacidad
drop policy if exists "permisos_reco: ver los míos" on public.permisos_reco;
create policy "permisos_reco: ver los míos" on public.permisos_reco
  for select to authenticated using (dueno = (select auth.uid()) or autorizado = (select auth.uid()));

drop policy if exists "permisos_reco: dar los míos" on public.permisos_reco;
create policy "permisos_reco: dar los míos" on public.permisos_reco
  for insert to authenticated with check (dueno = (select auth.uid()));

drop policy if exists "permisos_reco: quitar" on public.permisos_reco;
create policy "permisos_reco: quitar" on public.permisos_reco
  for delete to authenticated using (dueno = (select auth.uid()) or autorizado = (select auth.uid()));

-- Recomendaciones: las ven y las borran remitente y receptor; solo se mandan
-- en tu nombre y a quien las acepta
drop policy if exists "recomendaciones: ver las mías" on public.recomendaciones;
create policy "recomendaciones: ver las mías" on public.recomendaciones
  for select to authenticated using (de = (select auth.uid()) or para = (select auth.uid()));

drop policy if exists "recomendaciones: mandar" on public.recomendaciones;
create policy "recomendaciones: mandar" on public.recomendaciones
  for insert to authenticated with check (de = (select auth.uid()) and public.kiroku_acepta_recos(para));

drop policy if exists "recomendaciones: resolver o cancelar" on public.recomendaciones;
create policy "recomendaciones: resolver o cancelar" on public.recomendaciones
  for delete to authenticated using (de = (select auth.uid()) or para = (select auth.uid()));
