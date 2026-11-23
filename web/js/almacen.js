// El archivo vive en Supabase. Aquí se guarda una copia en memoria con la que
// pintan las vistas al instante; cada cambio se aplica a esa copia y se manda
// a la base de datos por una cola que agrupa los cambios seguidos (pulsar +1
// episodio cinco veces es una sola escritura) y reintenta si falla la red.
//
// También lleva el "sujeto": de quién es el archivo que se está mirando. Por
// defecto el tuyo; al visitar a un amigo, el suyo, en solo lectura.

import { sb, entradasDe, perfilPorAlias, cambiaPerfil, traduce, puedoVer, aciertosDe } from "./nube.js";

const oyentes = new Set();
export const escucha = (fn) => (oyentes.add(fn), () => oyentes.delete(fn));
const avisa = (motivo) => oyentes.forEach((fn) => fn(motivo));

let yo = null;          // perfil propio { id, alias, nombre, avatar_url }
let mias = [];          // entradas propias
let sujeto = null;      // null = tú; si no, { perfil, entradas, bloqueado } del amigo visitado
let historial = [];     // deshacer: [{ uid: copia previa | null }]
let misAciertos = 0;    // recomendaciones tuyas que otros puntuaron con 9+ (logro Ojo clínico)

// No es grave si falla: el logro espera a la siguiente lectura
const aciertos = (id) => aciertosDe(id).catch(() => 0);

// ── Filas de la base de datos ↔ entradas de la web ───────────────────────
const deFila = (r) => ({
  uid: r.id, usuario: r.usuario, mediaId: r.media_id, media: r.media, titulo: r.titulo, tipo: r.tipo,
  estado: r.estado, nota: r.nota == null ? null : +r.nota, comentario: r.comentario || "", progreso: r.progreso || 0,
  anio: r.anio, mes: r.mes, generos: r.generos || [], recomendadoPor: r.recomendado_por || null,
  creado: Date.parse(r.creado) || 0, editado: Date.parse(r.editado) || 0,
});
const aFila = (e) => ({
  id: e.uid, usuario: yo.id, media_id: e.mediaId || null, media: e.media || null, titulo: String(e.titulo).slice(0, 120),
  tipo: e.tipo, estado: e.estado, nota: e.nota == null ? null : Math.round(e.nota * 10) / 10,
  comentario: String(e.comentario || "").slice(0, 600), progreso: Math.max(0, e.progreso | 0),
  anio: e.anio || null, mes: e.mes || null, generos: (e.generos || []).slice(0, 20),
  recomendado_por: e.recomendadoPor || null, creado: new Date(e.creado || Date.now()).toISOString(),
});

// ── Carga ────────────────────────────────────────────────────────────────
export async function carga(perfil) {
  yo = perfil;
  const [filas, n] = await Promise.all([entradasDe(perfil.id), aciertos(perfil.id)]);
  mias = filas.map(deFila);
  misAciertos = n;
  historial = [];
  avisa("todo");
}

// Al volver a la pestaña tras un rato, se recarga por si cambiaste algo en otro dispositivo
export async function recarga() {
  if (!yo || cola.size) return;
  const [filas, n] = await Promise.all([entradasDe(yo.id), aciertos(yo.id)]);
  const nuevas = filas.map(deFila);
  const firma = (l) => l.map((e) => e.uid + ":" + e.editado).sort().join("|");
  const cambian = n !== misAciertos;
  misAciertos = n;
  if (firma(nuevas) !== firma(mias)) { mias = nuevas; avisa("fuera"); }
  else if (cambian) avisa("fuera");
}

// ── Sujeto (tu archivo o el de un amigo) ─────────────────────────────────
export const yoMismo = () => yo;
export const esPropio = () => !sujeto;
export const sujetoActual = () => sujeto ? sujeto.perfil : yo;
export const entradas = () => sujeto ? sujeto.entradas : mias;
export const propias = () => mias;
export const aciertosPropios = () => misAciertos;
export const aciertosSujeto = () => sujeto ? sujeto.aciertos : misAciertos;
export const operador = () => sujetoActual()?.nombre || "Operador";

export async function visita(alias) {
  if (!alias || alias === yo.alias) { sujeto = null; return true; }
  if (sujeto?.perfil.alias === alias) return true;
  const perfil = await perfilPorAlias(alias);
  if (!perfil) return false;
  // Perfil privado sin permiso: la base de datos devolvería 0 entradas; se marca
  // como bloqueado para enseñar "perfil privado" en vez de un archivo vacío
  const bloqueado = !(await puedoVer(perfil, yo.id));
  const [filas, n] = bloqueado ? [[], 0] : await Promise.all([entradasDe(perfil.id), aciertos(perfil.id)]);
  sujeto = { perfil, bloqueado, entradas: filas.map(deFila), aciertos: n };
  return true;
}
export const sujetoBloqueado = () => Boolean(sujeto?.bloqueado);
export const vuelve = () => { sujeto = null; };

// Busca primero en lo tuyo (para "ya lo tienes") y luego en lo que se mira
export const entrada = (uid) => mias.find((e) => e.uid === uid) || sujeto?.entradas.find((e) => e.uid === uid);
export const porMedia = (id) => id ? mias.find((e) => e.mediaId === id) : undefined;
export const esMia = (uid) => mias.some((e) => e.uid === uid);

// ── Cola de guardado ─────────────────────────────────────────────────────
const cola = new Map();   // uid → "guarda" | "borra"
let temporizador = null, enVuelo = false, fallos = 0;
const estadoCola = new Set();
export const escuchaCola = (fn) => (estadoCola.add(fn), () => estadoCola.delete(fn));
const avisaCola = (estado, detalle) => estadoCola.forEach((fn) => fn(estado, detalle));

function encola(uid, op) {
  cola.set(uid, op);
  avisaCola("pendiente");
  clearTimeout(temporizador);
  temporizador = setTimeout(vacia, 450);
}

export async function vacia() {
  if (enVuelo || !cola.size) return;
  enVuelo = true;
  const lote = new Map(cola);
  cola.clear();
  avisaCola("guardando");
  try {
    const guardar = [...lote].filter(([, op]) => op === "guarda").map(([uid]) => mias.find((e) => e.uid === uid)).filter(Boolean);
    const borrar = [...lote].filter(([, op]) => op === "borra").map(([uid]) => uid);
    for (let i = 0; i < guardar.length; i += 200) {
      const { error } = await sb.from("entradas").upsert(guardar.slice(i, i + 200).map(aFila), { onConflict: "id" });
      if (error) throw error;
    }
    for (let i = 0; i < borrar.length; i += 200) {
      const { error } = await sb.from("entradas").delete().in("id", borrar.slice(i, i + 200));
      if (error) throw error;
    }
    fallos = 0;
    avisaCola(cola.size ? "pendiente" : "guardado");
  } catch (err) {
    // Lo que falló vuelve a la cola, sin pisar cambios hechos mientras tanto
    for (const [uid, op] of lote) if (!cola.has(uid)) cola.set(uid, op);
    fallos++;
    avisaCola("error", traduce(err).message);
    setTimeout(vacia, Math.min(30000, 2000 * 2 ** Math.min(fallos, 4)));
  } finally {
    enVuelo = false;
    if (cola.size && !fallos) { clearTimeout(temporizador); temporizador = setTimeout(vacia, 300); }
  }
}
export const pendientes = () => cola.size + (enVuelo ? 1 : 0);

// Último intento al cerrar o esconder la pestaña
addEventListener("pagehide", () => { vacia(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") vacia(); });
addEventListener("online", () => vacia());

// ── Mutaciones (solo sobre lo propio) ────────────────────────────────────
const copia = (e) => e ? JSON.parse(JSON.stringify(e)) : null;
function recuerda(previos) {
  historial.push(previos);
  if (historial.length > 40) historial.shift();
}

export function anade(datos) {
  const hoy = new Date();
  const e = {
    uid: crypto.randomUUID(), usuario: yo.id, mediaId: null, media: null, titulo: "", tipo: "anime", estado: "pendiente",
    nota: null, comentario: "", progreso: 0, anio: hoy.getFullYear(), mes: hoy.getMonth() + 1,
    generos: [], recomendadoPor: null, creado: Date.now(), editado: Date.now(),
    ...datos,
  };
  mias.push(e);
  recuerda({ [e.uid]: null });
  encola(e.uid, "guarda");
  avisa("anade");
  return e;
}

// Con `agrupa`, varios cambios seguidos de la misma entrada (teclear el
// comentario, pulsar +1) cuentan como uno solo para Deshacer.
let ultimoAgrupado = null;
export function actualiza(uid, cambios, { agrupa = false } = {}) {
  const e = mias.find((x) => x.uid === uid);
  if (!e) return null;
  if (!agrupa || ultimoAgrupado !== uid) recuerda({ [uid]: copia(e) });
  ultimoAgrupado = agrupa ? uid : null;
  Object.assign(e, cambios, { editado: Date.now() });
  encola(uid, "guarda");
  avisa("cambio");
  return e;
}

export function borra(uid) {
  const e = mias.find((x) => x.uid === uid);
  if (!e) return;
  recuerda({ [uid]: copia(e) });
  mias = mias.filter((x) => x.uid !== uid);
  encola(uid, "borra");
  avisa("borra");
}

export const puedeDeshacer = () => historial.length > 0;
export function deshaz() {
  const previos = historial.pop();
  if (!previos) return false;
  ultimoAgrupado = null;
  for (const [uid, antes] of Object.entries(previos)) {
    if (antes === null) { mias = mias.filter((x) => x.uid !== uid); encola(uid, "borra"); }
    else {
      const i = mias.findIndex((x) => x.uid === uid);
      if (i >= 0) mias[i] = antes; else mias.push(antes);
      encola(uid, "guarda");
    }
  }
  avisa("todo");
  return true;
}

export async function ponOperador(nombre) {
  const n = String(nombre).trim().slice(0, 24);
  if (!n) return;
  yo = await cambiaPerfil(yo.id, { nombre: n });
  avisa("operador");
}

export async function ponPrivado(privado) {
  yo = await cambiaPerfil(yo.id, { privado: Boolean(privado) });
  avisa("operador");
  return yo;
}

// Quién puede recomendarte ('nadie' | 'lista' | 'todos') y cuántas pendientes por remitente
export async function ponRecos(cambios) {
  yo = await cambiaPerfil(yo.id, cambios);
  avisa("operador");
  return yo;
}

export async function ponAlias(alias) {
  yo = await cambiaPerfil(yo.id, { alias });
  avisa("operador");
  return yo;
}

// ── Fichas de AniList ────────────────────────────────────────────────────
const CLAVE_SINC = () => `kiroku:sinc:${yo?.id}`;
export function sincronizado() { try { return +localStorage.getItem(CLAVE_SINC()) || 0; } catch { return 0; } }

// Solo se reescriben las entradas cuya ficha ha cambiado de verdad
// `marca: false` en los refrescos parciales (solo lo que está en emisión), para
// que no retrasen el refresco completo de 12 h
export function aplicaFichas(fichas, { marca = true } = {}) {
  const porId = new Map(fichas.map((m) => [m.id, m]));
  let n = 0;
  for (const e of mias) {
    let m = porId.get(e.mediaId);
    // La saga no viene en la ficha de AniList: se calcula aparte y se conserva
    if (m && e.media && "saga" in e.media && !("saga" in m)) m = { ...m, saga: e.media.saga };
    if (m && JSON.stringify(m) !== JSON.stringify(e.media)) { e.media = m; encola(e.uid, "guarda"); n++; }
  }
  if (marca) try { localStorage.setItem(CLAVE_SINC(), String(Date.now())); } catch {}
  avisa("fichas");
  return n;
}

// Sagas: `marcas` es Map(mediaId → marca | null). null = calculada y sin
// saga (un título suelto), para no volver a calcularla en cada arranque.
export const sinSaga = () => mias.filter((e) => e.mediaId && e.media && !("saga" in e.media)).map((e) => e.mediaId);
export function ponSagas(marcas) {
  let n = 0;
  for (const e of mias) {
    if (!e.mediaId || !e.media || !marcas.has(e.mediaId)) continue;
    const nueva = marcas.get(e.mediaId);
    if ("saga" in e.media && JSON.stringify(e.media.saga) === JSON.stringify(nueva)) continue;
    e.media = { ...e.media, saga: nueva };
    encola(e.uid, "guarda");
    n++;
  }
  if (n) avisa("fichas");
  return n;
}

// ── Exportar / importar ──────────────────────────────────────────────────
export function exporta() {
  const datos = {
    formato: "kiroku", version: 2, exportado: new Date().toISOString(), operador: yo.nombre, alias: yo.alias,
    entradas: mias.map(({ usuario, ...e }) => e),
  };
  const blob = new Blob([JSON.stringify(datos, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `kiroku-${yo.alias}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return mias.length;
}

const EST_ANTIGUO = { "Visto": "visto", "Revisto": "revisto", "Viendo": "viendo", "Por ver": "pendiente", "Dropeado": "abandonado" };
const TIPO_ANTIGUO = { "Anime": "anime", "Serie": "serie", "Película": "peli", "Manga": "manga" };
const MES_ANTIGUO = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const ESTADOS = new Set(["visto", "viendo", "pendiente", "revisto", "abandonado"]);
const TIPOS = new Set(["anime", "manga", "peli", "serie"]);
const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// Acepta: un export de KIROKU (con o sin envoltorio, como datos/semilla.json)
// o la lista del diario antiguo. Siempre AÑADE a lo que hay, saltándose lo que
// ya tienes (mismo título de AniList y mismo nombre). Se deshace de una vez.
export async function importa(fichero) {
  let datos;
  try { datos = JSON.parse(await fichero.text()); } catch { throw new Error("El archivo no es un JSON válido"); }
  const lista = Array.isArray(datos) ? datos : (datos?.formato === "kiroku" && Array.isArray(datos.entradas) ? datos.entradas : null);
  if (!lista || !lista.every((x) => x && typeof x.titulo === "string")) throw new Error("No reconozco el formato del archivo");

  const kiroku = lista.every((x) => ESTADOS.has(x.estado));
  const ya = new Set(mias.map((e) => `${e.mediaId || ""}|${norm(e.titulo)}`));
  const nuevas = [];
  lista.forEach((x, i) => {
    const e = kiroku ? {
      mediaId: x.mediaId || null, media: x.media || null, titulo: x.titulo, tipo: TIPOS.has(x.tipo) ? x.tipo : "anime",
      estado: x.estado, nota: typeof x.nota === "number" ? Math.min(10, Math.max(0, x.nota)) : null, comentario: x.comentario || "",
      progreso: x.progreso || 0, anio: x.anio || null, mes: x.mes || null, generos: x.generos || [],
    } : {
      mediaId: null, media: null, titulo: x.titulo, tipo: TIPO_ANTIGUO[x.tipo] || "anime",
      estado: EST_ANTIGUO[x.estado] || "visto", nota: typeof x.nota === "number" ? x.nota : null, comentario: x.comentario || "",
      progreso: 0, anio: x.anio || null, mes: MES_ANTIGUO.indexOf(x.mes) + 1 || null, generos: x.generos || [],
    };
    const clave = `${e.mediaId || ""}|${norm(e.titulo)}`;
    if (!e.titulo.trim() || ya.has(clave)) return;
    ya.add(clave);
    nuevas.push({ ...e, uid: crypto.randomUUID(), usuario: yo.id, creado: Date.now() + i, editado: Date.now() });
  });
  if (mias.length + nuevas.length > 5000) throw new Error("Superarías el límite de 5000 entradas");
  mias.push(...nuevas);
  recuerda(Object.fromEntries(nuevas.map((e) => [e.uid, null])));
  nuevas.forEach((e) => encola(e.uid, "guarda"));
  avisa("todo");
  return { n: nuevas.length, saltadas: lista.length - nuevas.length };
}
