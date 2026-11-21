// Arranque y orquestación: secuencia de arranque, navegación por pestañas
// (#/archivo, #/perfil…), cabecera con el nivel, teletipo, atajos de teclado,
// refresco en segundo plano de las fichas de AniList y menú de datos.
import { $, $$, esc, aviso, tarjetaTitulo, activaHolo, reducido, cuentaAtras } from "./ui.js";
import * as A from "./almacen.js";
import { calcula } from "./stats.js";
import { refrescar } from "./anilist.js";
import * as ficha from "./ficha.js";
import * as paleta from "./paleta.js";
import * as archivo from "./vistas/archivo.js";
import * as perfil from "./vistas/perfil.js";
import * as tier from "./vistas/tier.js";
import * as temporada from "./vistas/temporada.js";
import * as gacha from "./vistas/gacha.js";

const VISTAS = {
  archivo:   { n: "01", nombre: "Archivo",   jp: "アーカイブ", mod: archivo },
  perfil:    { n: "02", nombre: "Perfil",    jp: "プロフィール", mod: perfil },
  tier:      { n: "03", nombre: "Tier",      jp: "ティア", mod: tier },
  temporada: { n: "04", nombre: "Temporada", jp: "シーズン", mod: temporada },
  gacha:     { n: "05", nombre: "Gacha",     jp: "ガチャ", mod: gacha },
};
const REFRESCO_MS = 12 * 3600 * 1000;
const CLAVE_LOGROS = "kiroku:logros";

let vista = "archivo";
let stats = null;
let primera = true;   // la primera vez las cifras del HUD cuentan hacia arriba

const abreFicha = (uid, previa) => ficha.abre(uid, previa);

// ── Pintado ──────────────────────────────────────────────────────────────
function pintaNav() {
  $("#nav").innerHTML = Object.entries(VISTAS).map(([k, v]) =>
    `<a href="#/${k}" class="pestana ${k === vista ? "on" : ""}" ${k === vista ? 'aria-current="page"' : ""}>
      <span class="pe-n">${v.n}</span><span class="pe-t">${v.nombre}</span><span class="pe-jp">${v.jp}</span></a>`).join("");
}

function pintaCabecera() {
  const op = stats.op;
  $("#op").innerHTML = `
    <div class="op-nv"><small>NV</small><b>${op.nivel}</b></div>
    <div class="op-d"><span class="op-nombre">${esc(A.operador())}</span><span class="op-rango">${esc(op.rango.nombre)} <i>${op.rango.jp}</i></span>
      <div class="op-xp" title="${op.xp.toLocaleString("es-ES")} / ${op.hasta.toLocaleString("es-ES")} XP">${Array.from({ length: 20 }, (_, i) => `<i class="${i < Math.round(op.k * 20) ? "on" : ""}"></i>`).join("")}</div></div>`;
}

function pintaTeletipo() {
  const s = stats;
  const prox = A.entradas().filter((e) => (e.estado === "viendo") && e.media?.nextAiringEpisode)
    .sort((a, b) => a.media.nextAiringEpisode.airingAt - b.media.nextAiringEpisode.airingAt);
  const diez = A.entradas().filter((e) => e.nota >= 10).sort((a, b) => b.editado - a.editado)[0];
  const top = [...s.generos.entries()].sort((a, b) => b[1] - a[1])[0];
  const items = [
    ...prox.slice(0, 3).map((e) => `PRÓXIMO EPISODIO ▸ ${esc(e.titulo)} #${e.media.nextAiringEpisode.episode} en ${cuentaAtras(e.media.nextAiringEpisode.airingAt - Date.now() / 1000)}`),
    `HORAS DE VIDA INVERTIDAS ▸ ${Math.round(s.horas).toLocaleString("es-ES")}`,
    `PENDIENTES ▸ ${s.porEstado.pendiente || 0}`,
    diez ? `ÚLTIMA OBRA MAESTRA ▸ ${esc(diez.titulo)}` : null,
    top ? `GÉNERO DOMINANTE ▸ ${esc(top[0]).toUpperCase()} ×${top[1]}` : null,
    `RANGO DEL OPERADOR ▸ ${esc(s.op.rango.nombre).toUpperCase()} ${s.op.rango.jp}`,
    `SINCRONIZACIÓN CON ANILIST ▸ ${A.sincronizado() ? new Date(A.sincronizado()).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "PENDIENTE"}`,
    `PULSA / PARA BUSCAR`,
  ].filter(Boolean);
  const pista = items.map((t) => `<span>${t}</span><b>◆</b>`).join("");
  $("#teletipo").innerHTML = `<div class="tt-pista">${pista}${pista}</div>`;
}

// `anima` solo al entrar en una vista: repintar por un cambio guardado no
// vuelve a lanzar la entrada escalonada de las cartas.
function pinta(anima = false) {
  stats = calcula(A.entradas());
  pintaNav();
  pintaCabecera();
  pintaTeletipo();
  const raiz = $("#vista");
  raiz.dataset.vista = vista;
  raiz.classList.toggle("anima", anima);
  VISTAS[vista].mod.pinta(raiz, { stats, abreFicha, primera: anima && primera });
  if (anima) primera = false;
}

// ── Subidas de nivel y logros ────────────────────────────────────────────
let nivelPrevio = null;
function vigila() {
  const s = stats;
  if (nivelPrevio != null && s.op.nivel > nivelPrevio) {
    const cambia = s.op.rango.min === s.op.nivel;
    tarjetaTitulo({ jp: cambia ? s.op.rango.jp : "昇格", linea1: `NIVEL ${s.op.nivel}`, linea2: cambia ? `Nuevo rango: ${s.op.rango.nombre}` : "Ascenso", clase: "nivel" });
  }
  nivelPrevio = s.op.nivel;
  let antes = null;
  try { antes = JSON.parse(localStorage.getItem(CLAVE_LOGROS) || "null"); } catch {}
  const ahora = s.logros.filter((l) => l.hecho).map((l) => l.id);
  if (antes) for (const l of s.logros) if (l.hecho && !antes.includes(l.id)) aviso(`Logro desbloqueado: ${l.jp} ${l.nombre}`, { tipo: "logro" });
  try { localStorage.setItem(CLAVE_LOGROS, JSON.stringify(ahora)); } catch {}
}

// ── Navegación ───────────────────────────────────────────────────────────
function desdeHash() {
  const k = location.hash.replace(/^#\/?/, "");
  vista = VISTAS[k] ? k : "archivo";
  pinta(true);
  scrollTo({ top: 0, behavior: reducido() ? "auto" : "smooth" });
}

// ── Refresco de AniList ──────────────────────────────────────────────────
async function refresca(forzar = false) {
  if (!forzar && Date.now() - A.sincronizado() < REFRESCO_MS) return;
  const ids = [...new Set(A.entradas().map((e) => e.mediaId).filter(Boolean))];
  if (!ids.length) return;
  $("#estado-red").className = "estado-red sinc";
  try {
    const fichas = await refrescar(ids);
    A.aplicaFichas(fichas);
    $("#estado-red").className = "estado-red ok";
    if (forzar) aviso(`${fichas.length} fichas actualizadas desde AniList.`);
  } catch (err) {
    $("#estado-red").className = "estado-red mal";
    if (forzar) aviso("AniList no responde: " + err.message);
  }
}

// ── Menú de datos ────────────────────────────────────────────────────────
function conectaMenu() {
  const menu = $("#menu");
  $("#btn-menu").addEventListener("click", (ev) => { ev.stopPropagation(); menu.hidden = !menu.hidden; });
  document.addEventListener("click", (ev) => { if (!menu.contains(ev.target)) menu.hidden = true; });
  menu.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-acc]");
    if (!b) return;
    menu.hidden = true;
    const acc = b.dataset.acc;
    if (acc === "exporta") aviso(`Exportados ${A.exporta()} registros.`);
    if (acc === "importa") $("#fichero").click();
    if (acc === "refresca") refresca(true);
    if (acc === "deshaz") aviso(A.deshaz() ? "Último cambio deshecho." : "No hay nada que deshacer.");
    if (acc === "restablece" && confirm("Esto sustituye tu archivo por la semilla original (el diario antiguo). Lo de ahora se puede recuperar con Deshacer solo en esta sesión. Exporta antes si dudas. ¿Seguir?")) {
      await A.restablece(); aviso("Archivo restablecido desde la semilla.", { accion: "Deshacer", alPulsar: () => A.deshaz() });
    }
  });
  $("#fichero").addEventListener("change", async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = "";
    if (!f) return;
    try {
      const r = await A.importa(f);
      aviso(r.modo === "sustituye" ? `Archivo importado: ${r.n} registros.` : `Añadidos ${r.n} registros del diario antiguo.`,
        { accion: "Deshacer", alPulsar: () => A.deshaz() });
      if (r.modo === "sustituye") refresca(true);
    } catch (err) { aviso("No se pudo importar: " + err.message); }
  });
}

// ── Teclado ──────────────────────────────────────────────────────────────
const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
let konami = 0;
function conectaTeclado() {
  document.addEventListener("keydown", (ev) => {
    konami = ev.key === KONAMI[konami] ? konami + 1 : (ev.key === KONAMI[0] ? 1 : 0);
    if (konami === KONAMI.length) { konami = 0; berserk(); }
    const escribiendo = ev.target.closest?.("input, textarea, select, [contenteditable]");
    const enDialogo = $("#ficha").open || $("#paleta").open;
    if ((ev.key === "k" && (ev.ctrlKey || ev.metaKey)) || (ev.key === "/" && !escribiendo)) {
      ev.preventDefault();
      if (!$("#paleta").open) paleta.abre();
      return;
    }
    if (escribiendo || enDialogo || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const i = +ev.key;
    if (i >= 1 && i <= 5) location.hash = "#/" + Object.keys(VISTAS)[i - 1];
    if (ev.key === "Enter" || ev.key === " ") {
      const c = ev.target.closest?.("[data-uid].carta, [data-uid].fila");
      if (c) { ev.preventDefault(); abreFicha(c.dataset.uid); }
    }
  });
  // Clic en una carta del archivo (delegado)
  $("#vista").addEventListener("click", (ev) => {
    const c = ev.target.closest("#coleccion [data-uid]");
    if (c) abreFicha(c.dataset.uid);
  });
}

function berserk() {
  document.body.classList.add("berserk");
  tarjetaTitulo({ jp: "暴走", linea1: "MODO BERSERK", linea2: "El operador ha perdido el control", clase: "rojo" });
  setTimeout(() => document.body.classList.remove("berserk"), 7000);
}

// ── Secuencia de arranque ────────────────────────────────────────────────
// Solo la primera vez en cada sesión del navegador, y se salta con un clic o una tecla.
async function arranque(origen) {
  let visto = false;
  try { visto = sessionStorage.getItem("kiroku:arrancado") === "1"; sessionStorage.setItem("kiroku:arrancado", "1"); } catch {}
  const capa = $("#arranque");
  if (visto || reducido()) { capa.remove(); return; }
  const n = A.entradas().length;
  const lineas = [
    ["KIROKU OS v2.6 — 記録システム起動", ""],
    ["> Montando archivo local", origen === "semilla" ? "SEMILLA" : "OK"],
    [`> Registros encontrados`, String(n)],
    ["> Enlace con AniList · graphql.anilist.co", "OK"],
    [`> Sincronía del operador`, `${(80 + (n % 19)).toFixed(1)}%`],
    ["> Acceso concedido", "承認"],
  ];
  const caja = capa.querySelector(".ar-lineas");
  let cancelado = false;
  const salta = () => { cancelado = true; capa.classList.add("fuera"); setTimeout(() => capa.remove(), 400); };
  capa.addEventListener("click", salta);
  addEventListener("keydown", salta, { once: true });
  for (const [t, ok] of lineas) {
    if (cancelado) return;
    const p = document.createElement("p");
    p.innerHTML = `<span>${esc(t)}</span><b>${esc(ok)}</b>`;
    caja.append(p);
    await new Promise((r) => setTimeout(r, 210));
  }
  await new Promise((r) => setTimeout(r, 450));
  if (!cancelado) salta();
}

// ── Inicio ───────────────────────────────────────────────────────────────
async function inicio() {
  let origen;
  try { origen = await A.carga(); }
  catch (err) {
    $("#vista").innerHTML = `<div class="vacio"><div class="vacio-jp">誤</div><p>No se pudo cargar el archivo.</p>
      <p class="tenue">Abre la web desde un servidor (python -m http.server), no con doble clic: ${esc(err.message)}</p></div>`;
    $("#arranque")?.remove();
    return;
  }
  ficha.conectaPaleta((o) => paleta.abre(o));
  activaHolo();
  conectaMenu();
  conectaTeclado();
  $("#btn-busca").addEventListener("click", () => paleta.abre());
  addEventListener("hashchange", desdeHash);

  A.escucha((motivo) => {
    // Desde la ficha se repinta la vista de detrás, pero sin la animación de entrada
    pinta();
    if (motivo !== "fichas") vigila();
  });

  desdeHash();
  nivelPrevio = stats.op.nivel;
  vigila();
  arranque(origen);
  refresca();
  // El teletipo lleva cuentas atrás: se refresca cada minuto
  setInterval(() => stats && pintaTeletipo(), 60000);
}

inicio();
