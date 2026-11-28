-- ============================================================================
-- KIROKU 記録 — esquema de la base de datos (Supabase / Postgres)
--
-- Se pega entero en Supabase → SQL Editor → Run. Es idempotente: se puede
-- volver a ejecutar sin perder datos.
--
-- Reglas (Row Level Security):
--   · Hay que haber iniciado sesión para leer nada; un visitante anónimo no ve
--     ni perfiles ni archivos.
--   · Con sesión, se ven los perfiles de todos y los archivos públicos; un
--     archivo privado solo lo ven su dueño y los operadores que él añada.
--   · Las recomendaciones solo las ven quien las manda y quien las recibe, y
--     solo se mandan a quien las acepta (nadie, su lista o cualquiera).
--   · Las cartas del Gacha se leen como el archivo y solo se escriben con las
--     funciones kiroku_invoca, kiroku_canjea y kiroku_premio.
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

-- La lectura de entradas depende de la privacidad: ver la sección final
drop policy if exists "entradas: leer con sesión" on public.entradas;

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

-- ── Privacidad: perfiles privados y operadores permitidos ──────────────────

alter table public.perfiles add column if not exists privado boolean not null default false;

create table if not exists public.permisos (
  dueno     uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  invitado  uuid not null references public.perfiles (id) on delete cascade,
  creado    timestamptz not null default now(),
  primary key (dueno, invitado),
  check (dueno <> invitado)
);
create index if not exists permisos_invitado_idx on public.permisos (invitado);

-- ¿Puede quien ha iniciado sesión ver el archivo de `objetivo`?
-- security definer: consulta perfiles y permisos sin pasar por sus propias
-- reglas (si no, las reglas de entradas y de permisos se llamarían en bucle).
create or replace function public.kiroku_puede_ver(objetivo uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select objetivo = auth.uid()
      or not coalesce((select privado from public.perfiles where id = objetivo), false)
      or exists (select 1 from public.permisos where dueno = objetivo and invitado = auth.uid());
$$;
revoke all on function public.kiroku_puede_ver(uuid) from public, anon;
grant execute on function public.kiroku_puede_ver(uuid) to authenticated;

-- Las entradas se leen solo si el archivo es tuyo, público o te han dado permiso
drop policy if exists "entradas: leer con sesión" on public.entradas;
drop policy if exists "entradas: leer si se puede" on public.entradas;
create policy "entradas: leer si se puede" on public.entradas
  for select to authenticated using (public.kiroku_puede_ver(usuario));

-- Permisos: cada uno ve los que da y los que recibe; solo el dueño los crea;
-- los borra el dueño (retirar) o el invitado (salirse)
alter table public.permisos enable row level security;
revoke all on public.permisos from anon;
grant select, insert, delete on public.permisos to authenticated;

drop policy if exists "permisos: ver los míos" on public.permisos;
create policy "permisos: ver los míos" on public.permisos
  for select to authenticated using (dueno = (select auth.uid()) or invitado = (select auth.uid()));

drop policy if exists "permisos: dar los míos" on public.permisos;
create policy "permisos: dar los míos" on public.permisos
  for insert to authenticated with check (dueno = (select auth.uid()));

drop policy if exists "permisos: quitar" on public.permisos;
create policy "permisos: quitar" on public.permisos
  for delete to authenticated using (dueno = (select auth.uid()) or invitado = (select auth.uid()));

-- ── Recomendaciones entre operadores ───────────────────────────────────────
-- Ver supabase/migraciones/2026-11-22-recomendaciones.sql para las reglas.

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

-- ── Gacha de cartas ─────────────────────────────────────────────────────────
-- Ver supabase/migraciones/2026-11-28-gacha-cartas.sql para las reglas.

create table if not exists public.cartas (
  usuario    uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  media_id   integer not null check (media_id > 0),
  pozo       text not null check (pozo in ('anime', 'manga')),
  rareza     text not null check (rareza in ('n', 'r', 'sr', 'ssr')),
  -- Ficha reducida de AniList (título, portada, nota, géneros…) para pintar la carta
  media      jsonb not null check (pg_column_size(media) <= 3000),
  numero     integer not null check (numero > 0),
  veces      integer not null default 1 check (veces between 1 and 100000),
  brillante  boolean not null default false,
  creado     timestamptz not null default now(),
  editado    timestamptz not null default now(),
  primary key (usuario, media_id)
);

create table if not exists public.gacha (
  usuario       uuid primary key default auth.uid() references public.perfiles (id) on delete cascade,
  gastados      integer not null default 0 check (gastados >= 0),
  fragmentos    integer not null default 0 check (fragmentos >= 0),
  canjeados     integer not null default 0 check (canjeados >= 0),
  premios       text[] not null default '{}' check (cardinality(premios) <= 200),
  piedad_anime  smallint not null default 0 check (piedad_anime between 0 and 1000),
  piedad_manga  smallint not null default 0 check (piedad_manga between 0 and 1000),
  diaria        date,
  racha         integer not null default 0 check (racha >= 0),
  editado       timestamptz not null default now()
);

-- ── Seguridad por filas: se leen como el archivo, no se escriben a mano ────
alter table public.cartas enable row level security;
alter table public.gacha enable row level security;
revoke all on public.cartas, public.gacha from anon, authenticated;
grant select on public.cartas, public.gacha to authenticated;

drop policy if exists "cartas: leer si se puede" on public.cartas;
create policy "cartas: leer si se puede" on public.cartas
  for select to authenticated using (public.kiroku_puede_ver(usuario));

drop policy if exists "gacha: leer si se puede" on public.gacha;
create policy "gacha: leer si se puede" on public.gacha
  for select to authenticated using (public.kiroku_puede_ver(usuario));

-- ── Invocar ────────────────────────────────────────────────────────────────
-- `p_cartas`: [{ media_id, rareza, media, brillante }], de 1 a 10, en el orden
-- en que salieron. Con `p_diaria` (la fecha de hoy del navegador) es la tirada
-- del día: una sola carta, gratis, una vez por día, y lleva la racha. Si no,
-- gasta un ticket por carta.
-- La piedad la cuenta la base de datos: cada carta sin SSR suma uno en su
-- pozo; una SSR la pone a cero. La tirada del día no la toca.
-- Devuelve { gacha: fila, cartas: [{ ...fila, nueva }] }.
create or replace function public.kiroku_invoca(p_pozo text, p_cartas jsonb, p_diaria date default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  yo       uuid := auth.uid();
  est      public.gacha;
  c        jsonb;
  fila     public.cartas;
  nueva    boolean;
  piedad   integer;
  salida   jsonb := '[]'::jsonb;
  n        integer := jsonb_array_length(coalesce(p_cartas, '[]'::jsonb));
begin
  if yo is null or not exists (select 1 from public.perfiles where id = yo) then
    raise exception 'kiroku_gacha_sesion: hace falta un perfil';
  end if;
  if p_pozo not in ('anime', 'manga') then raise exception 'kiroku_gacha_pozo: pozo desconocido'; end if;
  if n < 1 or n > 10 then raise exception 'kiroku_gacha_cartas: de 1 a 10 cartas por invocación'; end if;
  if p_diaria is not null and n <> 1 then raise exception 'kiroku_gacha_diaria: la tirada del día es de una carta'; end if;
  -- El día del navegador puede ir algo por delante o por detrás del servidor
  if p_diaria is not null and abs(p_diaria - current_date) > 1 then
    raise exception 'kiroku_gacha_diaria: fecha fuera de plazo';
  end if;

  -- Una invocación cada vez por operador: el número del álbum y los
  -- contadores no se pisan aunque haya dos pestañas
  perform pg_advisory_xact_lock(hashtextextended('kiroku_gacha:' || yo::text, 0));
  insert into public.gacha (usuario) values (yo) on conflict (usuario) do nothing;
  select * into est from public.gacha where usuario = yo;

  if p_diaria is not null then
    if est.diaria is not null and est.diaria >= p_diaria then
      raise exception 'kiroku_gacha_diaria: la tirada de hoy ya está hecha';
    end if;
    est.racha := case when est.diaria = p_diaria - 1 then est.racha + 1 else 1 end;
    est.diaria := p_diaria;
  else
    est.gastados := est.gastados + n;
  end if;

  if (select count(*) from public.cartas where usuario = yo) + n > 20000 then
    raise exception 'kiroku_gacha_tope: límite de 20000 cartas';
  end if;

  piedad := case when p_pozo = 'anime' then est.piedad_anime else est.piedad_manga end;
  for c in select * from jsonb_array_elements(p_cartas) loop
    if (c->>'rareza') not in ('n', 'r', 'sr', 'ssr') then raise exception 'kiroku_gacha_cartas: rareza desconocida'; end if;
    if p_diaria is null then
      piedad := case when c->>'rareza' = 'ssr' then 0 else least(piedad + 1, 1000) end;
    end if;
    select * into fila from public.cartas where usuario = yo and media_id = (c->>'media_id')::integer;
    nueva := not found;
    if nueva then
      insert into public.cartas (usuario, media_id, pozo, rareza, media, numero, brillante)
      values (yo, (c->>'media_id')::integer, p_pozo, c->>'rareza', c->'media',
              coalesce((select max(numero) from public.cartas where usuario = yo and pozo = p_pozo), 0) + 1,
              coalesce((c->>'brillante')::boolean, false))
      returning * into fila;
    else
      -- Repetida: un fragmento, y se queda la ficha más reciente
      update public.cartas set veces = veces + 1, rareza = c->>'rareza', media = c->'media',
             brillante = brillante or coalesce((c->>'brillante')::boolean, false), editado = now()
       where usuario = yo and media_id = fila.media_id
      returning * into fila;
      est.fragmentos := est.fragmentos + 1;
    end if;
    salida := salida || jsonb_build_array(to_jsonb(fila) || jsonb_build_object('nueva', nueva));
  end loop;
  if p_diaria is null then
    if p_pozo = 'anime' then est.piedad_anime := piedad; else est.piedad_manga := piedad; end if;
  end if;

  update public.gacha set gastados = est.gastados, fragmentos = est.fragmentos, piedad_anime = est.piedad_anime,
         piedad_manga = est.piedad_manga, diaria = est.diaria, racha = est.racha, editado = now()
   where usuario = yo returning * into est;
  return jsonb_build_object('gacha', to_jsonb(est), 'cartas', salida);
end $$;

-- ── Canjear fragmentos: 5 por ticket ───────────────────────────────────────
create or replace function public.kiroku_canjea(p_tickets integer default 1)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  yo  uuid := auth.uid();
  est public.gacha;
begin
  if yo is null then raise exception 'kiroku_gacha_sesion: hace falta un perfil'; end if;
  if p_tickets is null or p_tickets < 1 or p_tickets > 1000 then raise exception 'kiroku_gacha_canje: cantidad no válida'; end if;
  perform pg_advisory_xact_lock(hashtextextended('kiroku_gacha:' || yo::text, 0));
  update public.gacha set fragmentos = fragmentos - 5 * p_tickets, canjeados = canjeados + p_tickets, editado = now()
   where usuario = yo and fragmentos >= 5 * p_tickets
  returning * into est;
  if not found then raise exception 'kiroku_gacha_canje: no tienes fragmentos suficientes'; end if;
  return to_jsonb(est);
end $$;

-- ── Premio de un set completo (una vez por set) ────────────────────────────
-- Qué cartas forman cada set lo decide la web (salen de consultas a AniList).
create or replace function public.kiroku_premio(p_set text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  yo  uuid := auth.uid();
  est public.gacha;
begin
  if yo is null or not exists (select 1 from public.perfiles where id = yo) then
    raise exception 'kiroku_gacha_sesion: hace falta un perfil';
  end if;
  if p_set is null or p_set !~ '^[a-z0-9_-]{1,40}$' then raise exception 'kiroku_gacha_set: set no válido'; end if;
  perform pg_advisory_xact_lock(hashtextextended('kiroku_gacha:' || yo::text, 0));
  insert into public.gacha (usuario) values (yo) on conflict (usuario) do nothing;
  update public.gacha set premios = premios || p_set, editado = now()
   where usuario = yo and not (p_set = any (premios))
  returning * into est;
  if not found then select * into est from public.gacha where usuario = yo; end if;
  return to_jsonb(est);
end $$;

revoke all on function public.kiroku_invoca(text, jsonb, date) from public, anon;
revoke all on function public.kiroku_canjea(integer) from public, anon;
revoke all on function public.kiroku_premio(text) from public, anon;
grant execute on function public.kiroku_invoca(text, jsonb, date) to authenticated;
grant execute on function public.kiroku_canjea(integer) to authenticated;
grant execute on function public.kiroku_premio(text) to authenticated;
