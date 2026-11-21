// El archivo vive en el navegador (localStorage). La primera vez se rellena con
// datos/semilla.json, que es el diario antiguo ya cruzado con AniList. Como
// localStorage puede vaciarse (modo privado, limpiar datos del sitio), la
// copia de seguridad de verdad es el botón Exportar: un JSON que Importar
// vuelve a cargar, y que también acepta el formato del diario antiguo.

const CLAVE = "kiroku:v1";
const oyentes = new Set();

let est = { version: 1, operador: "", entradas: [], sincronizado: 0 };
let deshacer = [];

export const escucha = (fn) => (oyentes.add(fn), () => oyentes.delete(fn));
const avisa = (motivo) => oyentes.forEach((fn) => fn(motivo));

function lee() {
  try { return JSON.parse(localStorage.getItem(CLAVE) || "null"); } catch { return null; }
}
function escribe() {
  try { localStorage.setItem(CLAVE, JSON.stringify(est)); return true; }
  catch { return false; }
}

export async function carga() {
  const guardado = lee();
  if (guardado && Array.isArray(guardado.entradas)) { est = { ...est, ...guardado }; return "local"; }
  await desdeSemilla();
  return "semilla";
}

async function desdeSemilla() {
  const r = await fetch("datos/semilla.json");
  const semilla = await r.json();
  est.entradas = semilla.map((e) => ({ ...e, editado: Date.now() }));
  est.sincronizado = 0;
  escribe();
}

export async function restablece() {
  instantanea();
  await desdeSemilla();
  avisa("todo");
}

// Otra pestaña ha guardado: se recarga para no pisar sus cambios
addEventListener("storage", (ev) => {
  if (ev.key !== CLAVE) return;
  const g = lee();
  if (g && Array.isArray(g.entradas)) { est = { ...est, ...g }; avisa("fuera"); }
});

export const entradas = () => est.entradas;
export const entrada = (uid) => est.entradas.find((e) => e.uid === uid);
export const porMedia = (id) => est.entradas.find((e) => e.mediaId === id);
export const operador = () => est.operador || "Operador";
export const sincronizado = () => est.sincronizado || 0;

function instantanea() {
  deshacer.push(JSON.stringify(est.entradas));
  if (deshacer.length > 30) deshacer.shift();
}

export function puedeDeshacer() { return deshacer.length > 0; }
export function deshaz() {
  const previo = deshacer.pop();
  if (!previo) return false;
  est.entradas = JSON.parse(previo);
  escribe(); avisa("todo");
  return true;
}

const nuevoUid = (t) => "k" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) +
  "-" + String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").slice(0, 24);

export function anade(datos) {
  instantanea();
  const hoy = new Date();
  const e = {
    uid: nuevoUid(datos.titulo || "titulo"),
    mediaId: null, media: null, titulo: "", tipo: "anime", estado: "pendiente",
    nota: null, comentario: "", progreso: 0, anio: hoy.getFullYear(), mes: hoy.getMonth() + 1,
    generos: [], creado: Date.now(), editado: Date.now(),
    ...datos,
  };
  est.entradas.push(e);
  escribe(); avisa("anade");
  return e;
}

// Cambios de la ficha: con `agrupa` se evita llenar el historial de deshacer
// con cada pulsación de tecla del comentario.
let ultimoAgrupado = null;
export function actualiza(uid, cambios, { agrupa = false } = {}) {
  const e = entrada(uid);
  if (!e) return null;
  if (!agrupa || ultimoAgrupado !== uid) instantanea();
  ultimoAgrupado = agrupa ? uid : null;
  Object.assign(e, cambios, { editado: Date.now() });
  if (!escribe()) return e;
  avisa("cambio");
  return e;
}

export function borra(uid) {
  instantanea();
  est.entradas = est.entradas.filter((e) => e.uid !== uid);
  escribe(); avisa("borra");
}

export function ponOperador(nombre) {
  est.operador = String(nombre).trim().slice(0, 24);
  escribe(); avisa("operador");
}

// Mezcla las fichas recién bajadas de AniList sin tocar lo que es tuyo
export function aplicaFichas(fichas) {
  const porId = new Map(fichas.map((m) => [m.id, m]));
  let n = 0;
  for (const e of est.entradas) {
    const m = porId.get(e.mediaId);
    if (m) { e.media = m; n++; }
  }
  est.sincronizado = Date.now();
  escribe(); avisa("fichas");
  return n;
}

// ── Exportar / importar ──────────────────────────────────────────────────
export function exporta() {
  const datos = { formato: "kiroku", version: 1, exportado: new Date().toISOString(), operador: est.operador, entradas: est.entradas };
  const blob = new Blob([JSON.stringify(datos, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `kiroku-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return est.entradas.length;
}

const EST_ANTIGUO = { "Visto": "visto", "Revisto": "revisto", "Viendo": "viendo", "Por ver": "pendiente", "Dropeado": "abandonado" };
const TIPO_ANTIGUO = { "Anime": "anime", "Serie": "serie", "Película": "peli", "Manga": "manga" };
const MES_ANTIGUO = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// Devuelve cuántas entradas quedan. Un export de KIROKU sustituye el archivo;
// una lista del diario antiguo se añade (sin vínculo a AniList: se vincula
// luego desde cada ficha).
export async function importa(fichero) {
  const datos = JSON.parse(await fichero.text());
  instantanea();
  if (datos && datos.formato === "kiroku" && Array.isArray(datos.entradas)) {
    est.entradas = datos.entradas;
    if (datos.operador) est.operador = datos.operador;
    est.sincronizado = 0;
    escribe(); avisa("todo");
    return { modo: "sustituye", n: est.entradas.length };
  }
  if (Array.isArray(datos) && datos.every((x) => x && typeof x.titulo === "string")) {
    const nuevos = datos.map((x, i) => ({
      uid: nuevoUid(x.titulo) + i, mediaId: null, media: null, titulo: x.titulo,
      tipo: TIPO_ANTIGUO[x.tipo] || "anime", estado: EST_ANTIGUO[x.estado] || "visto",
      nota: typeof x.nota === "number" ? x.nota : null, comentario: x.comentario || "",
      progreso: 0, anio: x.anio || null, mes: MES_ANTIGUO.indexOf(x.mes) + 1 || null,
      generos: x.generos || [], creado: Date.now() + i, editado: Date.now(),
    }));
    est.entradas.push(...nuevos);
    escribe(); avisa("todo");
    return { modo: "anade", n: nuevos.length };
  }
  deshacer.pop();
  throw new Error("No reconozco el formato del archivo");
}
