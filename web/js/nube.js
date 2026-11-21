// Conexión con Supabase: sesión (Discord y Google), perfiles y lectura de
// archivos. La escritura de entradas vive en almacen.js, que es quien lleva la
// cola de guardado.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const configurado = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// PKCE: el proveedor vuelve con ?code=… en la URL (no con #access_token=…),
// que así no choca con las rutas por hash de la web (#/archivo, #/@alias…).
export const sb = configurado ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
}) : null;

// ── Sesión ───────────────────────────────────────────────────────────────
export async function sesion() {
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  // Quita el ?code= de la barra de direcciones tras volver del proveedor
  if (location.search.includes("code=")) history.replaceState(null, "", location.pathname + location.hash);
  return data.session;
}

export function entra(proveedor) {
  return sb.auth.signInWithOAuth({
    provider: proveedor,
    options: { redirectTo: location.origin + location.pathname },
  });
}

export const sal = () => sb.auth.signOut();
export const alCambiarSesion = (fn) => sb.auth.onAuthStateChange((ev, s) => fn(ev, s));

// Nombre, alias y avatar que propone el proveedor para el registro
export function datosProveedor(user) {
  const m = user?.user_metadata || {};
  const nombre = m.custom_claims?.global_name || m.full_name || m.name || m.user_name || (user?.email || "").split("@")[0] || "Operador";
  const alias = String(m.user_name || m.preferred_username || nombre).toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 20);
  const avatar = m.avatar_url || m.picture || null;
  return { nombre: nombre.slice(0, 24), alias: alias.length >= 3 ? alias : (alias + "_op").slice(0, 20), avatar: avatar && avatar.startsWith("https://") ? avatar : null };
}

// ── Perfiles ─────────────────────────────────────────────────────────────
const COLS_PERFIL = "id, alias, nombre, avatar_url, creado";

export async function miPerfil(id) {
  const { data, error } = await sb.from("perfiles").select(COLS_PERFIL).eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function perfilPorAlias(alias) {
  const { data, error } = await sb.from("perfiles").select(COLS_PERFIL).eq("alias", alias.toLowerCase()).maybeSingle();
  if (error) throw error;
  return data;
}

export async function aliasLibre(alias, miId) {
  const { data, error } = await sb.from("perfiles").select("id").eq("alias", alias).maybeSingle();
  if (error) throw error;
  return !data || data.id === miId;
}

export async function creaPerfil(p) {
  const { data, error } = await sb.from("perfiles").insert(p).select(COLS_PERFIL).single();
  if (error) throw traduce(error);
  return data;
}

export async function cambiaPerfil(id, cambios) {
  const { data, error } = await sb.from("perfiles").update(cambios).eq("id", id).select(COLS_PERFIL).single();
  if (error) throw traduce(error);
  return data;
}

// Borra perfil y, en cascada, todas sus entradas. La cuenta de Discord/Google
// en Supabase (auth.users) queda, pero sin datos; al volver se registra de cero.
export async function borraPerfil(id) {
  const { error } = await sb.from("perfiles").delete().eq("id", id);
  if (error) throw traduce(error);
}

// ── Lectura de entradas ──────────────────────────────────────────────────
// PostgREST devuelve como mucho 1000 filas por petición: se pagina.
async function todas(consulta) {
  const out = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta().range(desde, desde + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

export const COLS_ENTRADA = "id, usuario, media_id, media, titulo, tipo, estado, nota, comentario, progreso, anio, mes, generos, creado, editado";

export const entradasDe = (usuario) =>
  todas(() => sb.from("entradas").select(COLS_ENTRADA).eq("usuario", usuario).order("creado"));

// Para el directorio de operadores basta una versión ligera: sin la ficha
// entera de AniList, solo los campos que usan las estadísticas.
export async function directorio() {
  const [perfiles, filas] = await Promise.all([
    todas(() => sb.from("perfiles").select(COLS_PERFIL).order("creado")),
    todas(() => sb.from("entradas").select(`id, usuario, media_id, titulo, tipo, estado, nota, comentario, progreso, anio, mes, generos, editado,
      episodes:media->episodes, duration:media->duration, genres:media->genres, studio:media->>studio, seasonYear:media->seasonYear,
      status:media->>status, averageScore:media->averageScore, cover:media->coverImage->>large`).order("editado", { ascending: false })),
  ]);
  return { perfiles, filas };
}

// Lo que otros operadores tienen registrado de un mismo título
export async function otrosDe(mediaId, yo) {
  const { data, error } = await sb.from("entradas")
    .select("id, estado, nota, comentario, progreso, editado, perfiles!inner(alias, nombre, avatar_url)")
    .eq("media_id", mediaId).neq("usuario", yo).order("nota", { ascending: false, nullsFirst: false }).limit(50);
  if (error) throw error;
  return data;
}

// Mensajes de error de Postgres en cristiano
export function traduce(error) {
  const m = error?.message || String(error);
  if (/perfiles_alias_key|duplicate key.*alias/.test(m)) return new Error("Ese alias ya está cogido.");
  if (/perfiles_alias_check/.test(m)) return new Error("El alias va en minúsculas, números o _, de 3 a 20 caracteres.");
  if (/perfiles_nombre_check/.test(m)) return new Error("El nombre va de 1 a 24 caracteres.");
  if (/Límite de 5000/.test(m)) return new Error("Has llegado al límite de 5000 entradas.");
  if (/JWT|session|401/.test(m)) return new Error("La sesión ha caducado: vuelve a entrar.");
  return new Error(m);
}
