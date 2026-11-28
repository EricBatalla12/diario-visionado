-- ============================================================================
-- KIROKU 記録 — Gacha de cartas (28-11-2026)
--
-- Se pega en Supabase → SQL Editor → Run ANTES de publicar la web que lo usa.
-- Es idempotente: se puede ejecutar varias veces.
--
-- · `cartas`: lo que ha salido en el Gacha (una fila por título y operador;
--   las repetidas suman `veces`). `numero` es el orden en el álbum de su pozo.
-- · `gacha`: el estado de cada operador: tickets gastados, fragmentos,
--   tickets canjeados, sets premiados, piedad de cada pozo y tirada del día.
--
-- Reglas:
--   · Se leen como el archivo: si este es público, o es tuyo, o te han dado
--     permiso (kiroku_puede_ver).
--   · No se escriben directamente: solo con las funciones de abajo, que lo
--     hacen todo de una vez (la carta, la repetida, el fragmento, la piedad)
--     y en orden aunque tengas dos pestañas abiertas.
--   · Los tickets que has ganado los calcula la web a partir de tu archivo
--     (nivel, terminados), igual que la experiencia: la base de datos no
--     puede comprobarlos. Solo guarda los gastados.
-- ============================================================================

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
