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

// Qué proveedores de login están activados en Supabase, para no enseñar un
// botón que acabaría en "provider is not enabled". Si la consulta falla se
// devuelve null y la pantalla de acceso enseña todos.
export async function proveedoresActivos() {
  try {
    // Con límite de tiempo: si la red va lenta, mejor todos los botones que una pantalla vacía
    const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY }, signal: AbortSignal.timeout(3000) });
    if (!r.ok) return null;
    const { external = {} } = await r.json();
    return new Set(Object.keys(external).filter((k) => external[k] === true));
  } catch { return null; }
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
const COLS_PERFIL = "id, alias, nombre, avatar_url, privado, recibe_recos, recos_max, creado";

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

export const COLS_ENTRADA = "id, usuario, media_id, media, titulo, tipo, estado, nota, comentario, progreso, anio, mes, generos, recomendado_por, creado, editado";

export const entradasDe = (usuario) =>
  todas(() => sb.from("entradas").select(COLS_ENTRADA).eq("usuario", usuario).order("creado"));

// Para el directorio de operadores basta una versión ligera: sin la ficha
// entera de AniList, solo los campos que usan las estadísticas.
export async function directorio(yo) {
  const [perfiles, filas, recibidos] = await Promise.all([
    // Los perfiles se ven todos; las entradas de un perfil privado solo llegan
    // si te ha dado permiso (lo filtra la base de datos)
    todas(() => sb.from("perfiles").select(COLS_PERFIL).order("creado")),
    todas(() => sb.from("entradas").select(`id, usuario, media_id, titulo, tipo, estado, nota, comentario, progreso, anio, mes, generos, editado, recomendado_por,
      episodes:media->episodes, duration:media->duration, genres:media->genres, studio:media->>studio, seasonYear:media->seasonYear,
      status:media->>status, averageScore:media->averageScore, cover:media->coverImage->>large`).order("editado", { ascending: false })),
    permisosRecibidos(yo),
  ]);
  return { perfiles, filas, recibidos };
}

// Ojo clínico: cuántas entradas de otros, con 9 o más, vienen de una
// recomendación de `id`. Las reglas de lectura filtran: solo cuentan los
// archivos públicos y los privados que te dejan ver, así que no revela nada
// de un archivo privado.
export async function aciertosDe(id) {
  const { data, error } = await sb.from("entradas").select("id").eq("recomendado_por", id).gte("nota", 9).limit(1000);
  if (error) throw error;
  return data.length;
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
  if (/kiroku_recos_no_acepta|row-level security.*recomendaciones/.test(m)) return new Error("No acepta tus recomendaciones.");
  if (/kiroku_recos_max/.test(m)) return new Error("Ya tiene el máximo de recomendaciones tuyas pendientes.");
  if (/kiroku_recos_total/.test(m)) return new Error("Tienes 200 recomendaciones pendientes: espera a que las resuelvan.");
  if (/recomendaciones_de_para_media_id_key/.test(m)) return new Error("Ya se lo habías recomendado.");
  if (/recomendaciones_mensaje_check/.test(m)) return new Error("El mensaje va hasta 280 caracteres.");
  if (/JWT|session|401/.test(m)) return new Error("La sesión ha caducado: vuelve a entrar.");
  return new Error(m);
}

// ── Privacidad ───────────────────────────────────────────────────────────
// A quién has dado permiso para ver tu archivo (cuando es privado)
export async function misPermisos(yo) {
  const { data, error } = await sb.from("permisos")
    .select("invitado, creado, perfiles!permisos_invitado_fkey(id, alias, nombre, avatar_url)")
    .eq("dueno", yo).order("creado");
  if (error) throw traduce(error);
  return data.map((r) => r.perfiles).filter(Boolean);
}

// Quién te ha dado permiso a ti: conjunto de ids de dueños
export async function permisosRecibidos(yo) {
  const { data, error } = await sb.from("permisos").select("dueno").eq("invitado", yo);
  if (error) throw traduce(error);
  return new Set(data.map((r) => r.dueno));
}

export async function concede(yo, invitado) {
  const { error } = await sb.from("permisos").insert({ dueno: yo, invitado });
  if (error && !/duplicate key/.test(error.message)) throw traduce(error);
}

export async function retira(yo, invitado) {
  const { error } = await sb.from("permisos").delete().eq("dueno", yo).eq("invitado", invitado);
  if (error) throw traduce(error);
}

// ¿Puedo ver el archivo de este perfil? (la base de datos lo impone igual;
// esto solo sirve para enseñar "perfil privado" en vez de un archivo vacío)
export async function puedoVer(perfil, yo) {
  if (!perfil.privado || perfil.id === yo) return true;
  const { data, error } = await sb.from("permisos").select("dueno").eq("dueno", perfil.id).eq("invitado", yo).maybeSingle();
  if (error) throw traduce(error);
  return Boolean(data);
}

// ── Recomendaciones ──────────────────────────────────────────────────────
const COLS_RECO = "id, de, para, media_id, media, mensaje, nota, creado";
const PERFIL_CORTO = "id, alias, nombre, avatar_url";

export async function recosRecibidas(yo) {
  const { data, error } = await sb.from("recomendaciones")
    .select(`${COLS_RECO}, remitente:perfiles!recomendaciones_de_fkey(${PERFIL_CORTO})`)
    .eq("para", yo).order("creado", { ascending: false });
  if (error) throw traduce(error);
  return data;
}

export async function recosEnviadas(yo) {
  const { data, error } = await sb.from("recomendaciones")
    .select(`${COLS_RECO}, receptor:perfiles!recomendaciones_para_fkey(${PERFIL_CORTO})`)
    .eq("de", yo).order("creado", { ascending: false });
  if (error) throw traduce(error);
  return data;
}

// Una inserción por receptor: si uno no la acepta, a los demás les llega igual
export async function mandaReco(para, reco) {
  const { error } = await sb.from("recomendaciones").insert({ para, ...reco });
  if (error) throw traduce(error);
}

export async function borraReco(id) {
  const { error } = await sb.from("recomendaciones").delete().eq("id", id);
  if (error) throw traduce(error);
}

// A quién puedo recomendar: todos los perfiles con sus ajustes, las listas
// "pueden recomendarme" en las que estoy y lo que ya les he mandado
export async function destinatarios(yo) {
  const [perfiles, lista, enviadas] = await Promise.all([
    todas(() => sb.from("perfiles").select(`${PERFIL_CORTO}, recibe_recos, recos_max`).neq("id", yo).order("nombre")),
    sb.from("permisos_reco").select("dueno").eq("autorizado", yo),
    sb.from("recomendaciones").select("para, media_id").eq("de", yo),
  ]);
  if (lista.error) throw traduce(lista.error);
  if (enviadas.error) throw traduce(enviadas.error);
  return { perfiles, meAceptan: new Set(lista.data.map((r) => r.dueno)), enviadas: enviadas.data };
}

// Lista "pueden recomendarme" (aparte de la de privacidad)
export async function misPermisosReco(yo) {
  const { data, error } = await sb.from("permisos_reco")
    .select(`autorizado, creado, perfiles!permisos_reco_autorizado_fkey(${PERFIL_CORTO})`)
    .eq("dueno", yo).order("creado");
  if (error) throw traduce(error);
  return data.map((r) => r.perfiles).filter(Boolean);
}

export async function concedeReco(yo, autorizado) {
  const { error } = await sb.from("permisos_reco").insert({ dueno: yo, autorizado });
  if (error && !/duplicate key/.test(error.message)) throw traduce(error);
}

export async function retiraReco(yo, autorizado) {
  const { error } = await sb.from("permisos_reco").delete().eq("dueno", yo).eq("autorizado", autorizado);
  if (error) throw traduce(error);
}

const perfilesCortos = new Map();
export function perfilCorto(id) {
  if (!perfilesCortos.has(id)) {
    const p = sb.from("perfiles").select(PERFIL_CORTO).eq("id", id).maybeSingle()
      .then(({ data, error }) => { if (error) throw error; return data; });
    p.catch(() => perfilesCortos.delete(id));
    perfilesCortos.set(id, p);
  }
  return perfilesCortos.get(id);
}
