-- ============================================================================
-- KIROKU — migración: perfiles privados con lista de operadores permitidos
--
-- Se pega en Supabase → SQL Editor → Run ANTES de publicar la web que la usa.  
-- Es idempotente. supabase/esquema.sql ya la incluye para instalaciones nuevas.
--
-- Reglas:
--   · Perfil público (por defecto): cualquiera con sesión ve tu archivo.
--   · Perfil privado: tu archivo solo lo ves tú y los operadores de tu lista.
--     El perfil en sí (nombre, alias, avatar) sigue visible para poder
--     encontrarte y añadirte.
--   · La lista solo la cambia su dueño; un invitado puede salirse de ella.
-- ============================================================================

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
