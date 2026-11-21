-- ============================================================================
-- KIROKU 記録 — esquema de la base de datos (Supabase / Postgres)
--
-- Se pega entero en Supabase → SQL Editor → Run. Es idempotente: se puede
-- volver a ejecutar sin perder datos.
--
-- Reglas (Row Level Security):
--   · Hay que haber iniciado sesión para leer nada; un visitante anónimo no ve
--     ni perfiles ni archivos.
--   · Con sesión, se ven los perfiles y los archivos de todos (perfiles
--     visibles entre operadores).
--   · Cada uno solo crea, cambia o borra lo suyo: la base de datos lo impone,
--     no solo la web.
-- ============================================================================

-- ── Perfiles ────────────────────────────────────────────────────────────────
create table if not exists public.perfiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  alias       text not null unique
              check (alias ~ '^[a-z0-9_]{3,20}$'),
  nombre      text not null default 'Operador'
              check (char_length(nombre) between 1 and 24),
  avatar_url  text
              check (avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) <= 500)),
  creado      timestamptz not null default now()
);

-- ── Entradas del archivo ────────────────────────────────────────────────────
-- `media` es la ficha de AniList cacheada (portada, episodios, géneros…):
-- va con cada entrada para pintar sin preguntar a AniList y la refresca la web.
create table if not exists public.entradas (
  id          uuid primary key default gen_random_uuid(),
  usuario     uuid not null default auth.uid()
              references public.perfiles (id) on delete cascade,
  media_id    integer check (media_id is null or media_id > 0),
  media       jsonb check (media is null or pg_column_size(media) <= 16000),
  titulo      text not null check (char_length(titulo) between 1 and 120),
  tipo        text not null default 'anime'
              check (tipo in ('anime', 'manga', 'peli', 'serie')),
  estado      text not null default 'pendiente'
              check (estado in ('visto', 'viendo', 'pendiente', 'revisto', 'abandonado')),
  nota        numeric(3, 1) check (nota is null or nota between 0 and 10),
  comentario  text not null default '' check (char_length(comentario) <= 600),
  progreso    integer not null default 0 check (progreso between 0 and 100000),
  anio        smallint check (anio is null or anio between 1900 and 2200),
  mes         smallint check (mes is null or mes between 1 and 12),
  generos     text[] not null default '{}' check (cardinality(generos) <= 20),
  creado      timestamptz not null default now(),
  editado     timestamptz not null default now()
);

create index if not exists entradas_usuario_idx on public.entradas (usuario);
create index if not exists entradas_media_idx   on public.entradas (media_id) where media_id is not null;
create index if not exists entradas_editado_idx on public.entradas (editado desc);

-- `editado` lo pone la base de datos, no el navegador (relojes desajustados)
create or replace function public.kiroku_toca_editado()
returns trigger language plpgsql as $$
begin
  new.editado := now();
  return new;
end $$;

drop trigger if exists entradas_editado on public.entradas;
create trigger entradas_editado
  before update on public.entradas
  for each row execute function public.kiroku_toca_editado();

-- El registro es abierto: un tope por usuario evita que alguien llene la base
-- de datos (el plan gratuito de Supabase tiene 500 MB).
create or replace function public.kiroku_tope_entradas()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.entradas where usuario = new.usuario) >= 5000 then
    raise exception 'Límite de 5000 entradas por operador';
  end if;
  return new;
end $$;

drop trigger if exists entradas_tope on public.entradas;
create trigger entradas_tope
  before insert on public.entradas
  for each row execute function public.kiroku_tope_entradas();

-- ── Seguridad por filas ─────────────────────────────────────────────────────
alter table public.perfiles enable row level security;
alter table public.entradas enable row level security;

-- Sin sesión no hay nada que leer ni escribir
revoke all on public.perfiles, public.entradas from anon;
grant select, insert, update, delete on public.perfiles, public.entradas to authenticated;

drop policy if exists "perfiles: leer con sesión" on public.perfiles;
create policy "perfiles: leer con sesión" on public.perfiles
  for select to authenticated using (true);

drop policy if exists "perfiles: crear el propio" on public.perfiles;
create policy "perfiles: crear el propio" on public.perfiles
  for insert to authenticated with check (id = (select auth.uid()));

drop policy if exists "perfiles: cambiar el propio" on public.perfiles;
create policy "perfiles: cambiar el propio" on public.perfiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "perfiles: borrar el propio" on public.perfiles;
create policy "perfiles: borrar el propio" on public.perfiles
  for delete to authenticated using (id = (select auth.uid()));

drop policy if exists "entradas: leer con sesión" on public.entradas;
create policy "entradas: leer con sesión" on public.entradas
  for select to authenticated using (true);

drop policy if exists "entradas: crear las propias" on public.entradas;
create policy "entradas: crear las propias" on public.entradas
  for insert to authenticated with check (usuario = (select auth.uid()));

drop policy if exists "entradas: cambiar las propias" on public.entradas;
create policy "entradas: cambiar las propias" on public.entradas
  for update to authenticated
  using (usuario = (select auth.uid())) with check (usuario = (select auth.uid()));

drop policy if exists "entradas: borrar las propias" on public.entradas;
create policy "entradas: borrar las propias" on public.entradas
  for delete to authenticated using (usuario = (select auth.uid()));
