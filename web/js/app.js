// Arranque y orquestación: sesión (login → registro → archivo), navegación
// por pestañas (#/archivo, #/perfil… y #/@alias para visitar a otro operador),
// cabecera con el nivel, teletipo, atajos, refresco de AniList, estado del
// guardado y menú de datos.
import { $, esc, aviso, tarjetaTitulo, activaHolo, reducido, cuentaAtras } from "./ui.js";
import * as A from "./almacen.js";
import { calcula } from "./stats.js";
import { refrescar, sagas, marcaSaga } from "./anilist.js";
import { configurado, sesion, miPerfil, sal, alCambiarSesion, borraPerfil } from "./nube.js";
import { pantallaEntrada, pantallaRegistro, pantallaSinConfig, pantallaError, quitaCapa } from "./acceso.js";
import * as ficha from "./ficha.js";
import * as paleta from "./paleta.js";
import * as archivo from "./vistas/archivo.js";
import * as perfil from "./vistas/perfil.js";
import * as tier from "./vistas/tier.js";
import * as temporada from "./vistas/temporada.js";
import * as gacha from "./vistas/gacha.js";
import * as operadores from "./vistas/operadores.js";
import * as buzon from "./vistas/buzon.js";
import * as recos from "./recos.js";
import * as tutorial from "./tutorial.js";
import * as terminados from "./terminados.js";
// Como espacio de nombres: si a config.js le falta DONAR (copias viejas,
// página de pruebas) no rompe el arranque
import * as config from "./config.js";

// `ic`: el kanji que hace de icono en la barra de abajo del móvil
const VISTAS = {
  archivo:    { n: "01", ic: "蔵", nombre: "Archivo",    jp: "アーカイブ", mod: archivo },
  perfil:     { n: "02", ic: "人", nombre: "Perfil",     jp: "プロフィール", mod: perfil },
  tier:       { n: "03", ic: "格", nombre: "Tier",       jp: "ティア", mod: tier },
  temporada:  { n: "04", ic: "季", nombre: "Temporada",  jp: "シーズン", mod: temporada },
  gacha:      { n: "05", ic: "運", nombre: "Gacha",      jp: "ガチャ", mod: gacha },
  operadores: { n: "06", ic: "友", nombre: "Operadores", jp: "オペレーター", mod: operadores },
};
// Vistas que no van en la barra de pestañas (se abren desde la cabecera)
const OCULTAS = { buzon: { nombre: "Buzón", jp: "受信箱", mod: buzon } };
const vistaDe = (k) => VISTAS[k] || OCULTAS[k];
// Lo que se puede mirar del archivo de otro
const VISTAS_AJENAS = ["archivo", "perfil", "tier"];
const REFRESCO_MS = 12 * 3600 * 1000;
const REFRESCO_EMISION_MS = 3 * 3600 * 1000;

let vista = "archivo";
let stats = null;        // del archivo que se está mirando
let mias = null;         // estadísticas propias (cabecera, niveles, logros)
let primera = true;      // la primera vez las cifras del HUD cuentan hacia arriba

const abreFicha = (uid, previa) => ficha.abre(uid, previa);
const ruta = (v) => A.esPropio() ? `#/${v}` : `#/@${A.sujetoActual().alias}/${v}`;

// ── Pintado ──────────────────────────────────────────────────────────────
function pintaNav() {
  const ajeno = !A.esPropio();
  const claves = ajeno ? VISTAS_AJENAS : Object.keys(VISTAS);
  const s = A.sujetoActual();
  // De quién es el archivo: en escritorio va dentro de la barra; en el móvil,
  // con la barra abajo, en una franja aparte encima de la vista
  const visita = ajeno ? `<div class="visita">${s.avatar_url ? `<img src="${esc(s.avatar_url)}" alt="" referrerpolicy="no-referrer">` : ""}<span><small>Archivo de</small><b>${esc(s.nombre)}</b><em>@${esc(s.alias)}</em></span></div>` : "";
  $("#nav").innerHTML = (ajeno ? `<a href="#/operadores" class="pestana volver" title="Volver"><span class="pe-ic" aria-hidden="true">◀</span><span class="pe-n">◀</span><span class="pe-t">Volver</span><span class="pe-jp">戻る</span></a>
      ${visita}` : "") +
    claves.map((k) => { const v = VISTAS[k];
      return `<a href="${ruta(k)}" class="pestana ${k === vista ? "on" : ""}" ${k === vista ? 'aria-current="page"' : ""}>
        <span class="pe-ic" aria-hidden="true">${v.ic}</span><span class="pe-n">${v.n}</span><span class="pe-t">${v.nombre}</span><span class="pe-jp">${v.jp}</span></a>`; }).join("");
  $("#visita-movil").innerHTML = visita;
  document.body.classList.toggle("visitando", ajeno);
}

function pintaCabecera() {
  const op = mias.op, yo = A.yoMismo();
  $("#op").innerHTML = `
    <a class="op-enlace" href="#/perfil" title="Tu perfil">
    <div class="op-nv">${yo.avatar_url ? `<img src="${esc(yo.avatar_url)}" alt="" referrerpolicy="no-referrer">` : ""}<small>NV</small><b>${op.nivel}</b></div>
    <div class="op-d"><span class="op-nombre">${esc(yo.nombre)}</span><span class="op-rango">${esc(op.rango.nombre)} <i>${op.rango.jp}</i></span>
      <div class="op-xp" title="${op.xp.toLocaleString("es-ES")} / ${op.hasta.toLocaleString("es-ES")} XP">${Array.from({ length: 20 }, (_, i) => `<i class="${i < Math.round(op.k * 20) ? "on" : ""}"></i>`).join("")}</div></div></a>`;
}

// Icono del buzón con el número de recomendaciones sin resolver
function pintaBuzon() {
  const n = recos.cuenta(), b = $("#btn-buzon");
  b.querySelector(".buzon-n").textContent = n > 99 ? "99+" : String(n);
  b.classList.toggle("con", n > 0);
  b.classList.toggle("on", vista === "buzon");
  b.setAttribute("aria-label", n ? `Buzón: ${n} recomendaci${n === 1 ? "ón" : "ones"}` : "Buzón de recomendaciones");
}

function pintaTeletipo() {
  const s = mias, lista = A.propias();
  const prox = lista.filter((e) => e.estado === "viendo" && e.media?.nextAiringEpisode)
    .sort((a, b) => a.media.nextAiringEpisode.airingAt - b.media.nextAiringEpisode.airingAt);
  const diez = lista.filter((e) => e.nota >= 10).sort((a, b) => b.editado - a.editado)[0];
  const top = [...s.generos.entries()].sort((a, b) => b[1] - a[1])[0];
  const items = [
    ...prox.slice(0, 3).map((e) => `PRÓXIMO EPISODIO ▸ ${esc(e.titulo)} #${e.media.nextAiringEpisode.episode} en ${cuentaAtras(e.media.nextAiringEpisode.airingAt - Date.now() / 1000)}`),
    `HORAS DE VIDA INVERTIDAS ▸ ${Math.round(s.horas).toLocaleString("es-ES")}`,
    `PENDIENTES ▸ ${s.porEstado.pendiente || 0}`,
    recos.cuenta() ? `BUZÓN 受信箱 ▸ ${recos.cuenta()} recomendaci${recos.cuenta() === 1 ? "ón" : "ones"} sin resolver` : null,
    diez ? `ÚLTIMA OBRA MAESTRA ▸ ${esc(diez.titulo)}` : null,
    top ? `GÉNERO DOMINANTE ▸ ${esc(top[0]).toUpperCase()} ×${top[1]}` : null,
    `RANGO DEL OPERADOR ▸ ${esc(s.op.rango.nombre).toUpperCase()} ${s.op.rango.jp}`,
    `OPERADOR ▸ @${esc(A.yoMismo().alias)}`,
    `PULSA / PARA BUSCAR`,
  ].filter(Boolean);
  const pista = items.map((t) => `<span>${t}</span><b>◆</b>`).join("");
  $("#teletipo").innerHTML = `<div class="tt-pista">${pista}${pista}</div>`;
}

// `anima` solo al entrar en una vista: repintar por un cambio guardado no
// vuelve a lanzar la entrada escalonada de las cartas.
function pinta(anima = false) {
  mias = calcula(A.propias(), { aciertos: A.aciertosPropios() });
  stats = A.esPropio() ? mias : calcula(A.entradas(), { aciertos: A.aciertosSujeto() });
  pintaNav();
  pintaCabecera();
  pintaTeletipo();
  pintaBuzon();
  const raiz = $("#vista");
  raiz.dataset.vista = vista;
  raiz.classList.toggle("anima", anima);
  if (A.sujetoBloqueado()) pintaBloqueado(raiz);
  else vistaDe(vista).mod.pinta(raiz, { stats, abreFicha, primera: anima && primera, propio: A.esPropio() });
  if (anima) primera = false;
}

// Perfil privado de otro operador que no te ha dado acceso
function pintaBloqueado(raiz) {
  const s = A.sujetoActual();
  raiz.innerHTML = `<div class="vacio bloqueo">
    <div class="bloqueo-av">${s.avatar_url ? `<img src="${esc(s.avatar_url)}" alt="" referrerpolicy="no-referrer">` : ""}<span>非公開</span></div>
    <h2>${esc(s.nombre)} <small>@${esc(s.alias)}</small></h2>
    <p>Este archivo es <b>privado</b>.</p>
    <p class="tenue">Solo pueden verlo los operadores que @${esc(s.alias)} añada a su lista. Pídele que te dé acceso desde su perfil.</p>
    <a class="btn" href="#/operadores">◀ Volver a Operadores</a>
  </div>`;
}

// ── Subidas de nivel y logros (solo los propios) ─────────────────────────
let nivelPrevio = null;
function vigila() {
  const s = mias, clave = `kiroku:logros:${A.yoMismo().id}`;
  if (nivelPrevio != null && s.op.nivel > nivelPrevio) {
    const cambia = s.op.rango.min === s.op.nivel;
    tarjetaTitulo({ jp: cambia ? s.op.rango.jp : "昇格", linea1: `NIVEL ${s.op.nivel}`, linea2: cambia ? `Nuevo rango: ${s.op.rango.nombre}` : "Ascenso", clase: "nivel" });
  }
  nivelPrevio = s.op.nivel;
  let antes = null;
  try { antes = JSON.parse(localStorage.getItem(clave) || "null"); } catch {}
  const ahora = s.logros.filter((l) => l.hecho).map((l) => l.id);
  if (antes) for (const l of s.logros) if (l.hecho && !antes.includes(l.id)) aviso(`Logro desbloqueado: ${l.jp} ${l.nombre}`, { tipo: "logro" });
  try { localStorage.setItem(clave, JSON.stringify(ahora)); } catch {}
}

// ── Navegación ───────────────────────────────────────────────────────────
// #/vista · #/@alias · #/@alias/vista
async function desdeHash() {
  const partes = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  let alias = null, v = partes[0] || "archivo";
  if (v.startsWith("@")) { alias = v.slice(1).toLowerCase(); v = partes[1] || "perfil"; }
  if (alias && alias !== A.yoMismo().alias) {
    if (!VISTAS_AJENAS.includes(v)) v = "perfil";
    if (A.sujetoActual()?.alias !== alias) {
      $("#vista").innerHTML = `<div class="cargando"><span></span>Abriendo el archivo de @${esc(alias)}…</div>`;
      let ok = false;
      try { ok = await A.visita(alias); } catch (err) { aviso("No se pudo abrir: " + err.message); }
      if (!ok) { aviso(`No hay ningún operador @${alias}.`); location.hash = "#/operadores"; return; }
    }
  } else {
    A.vuelve();
    if (alias) { location.replace(`#/${partes[1] && VISTAS[partes[1]] ? partes[1] : "perfil"}`); return; }
  }
  vista = vistaDe(v) ? v : "archivo";
  ficha.cierra();
  pinta(true);
  scrollTo({ top: 0, behavior: reducido() ? "auto" : "smooth" });
}

// ── Refresco de AniList ──────────────────────────────────────────────────
async function refresca(forzar = false) {
  if (!forzar && Date.now() - A.sincronizado() < REFRESCO_MS) return;
  const ids = [...new Set(A.propias().map((e) => e.mediaId).filter(Boolean))];
  if (!ids.length) return;
  try {
    const fichas = await refrescar(ids);
    const n = A.aplicaFichas(fichas);
    actualizaSagas(true);
    terminados.avisaNuevos(A.propias(), A.yoMismo().id);
    if (forzar) aviso(`${fichas.length} fichas revisadas en AniList, ${n} con cambios.`);
  } catch (err) {
    if (forzar) aviso("AniList no responde: " + err.message);
  }
}

// Lo que tienes en pendiente o viendo y aún se emite se mira cada 3 h (son
// pocos títulos, una petición): así el aviso de "ha terminado" llega pronto.
// También lo que aún no tiene fecha de fin guardada (fichas de antes de pedirla).
async function refrescaEmision() {
  const clave = `kiroku:sinc-emision:${A.yoMismo().id}`;
  let ultima = 0;
  try { ultima = +localStorage.getItem(clave) || 0; } catch {}
  if (Date.now() - ultima < REFRESCO_EMISION_MS) return;
  const ids = [...new Set(A.propias().filter((e) => e.mediaId && (e.estado === "pendiente" || e.estado === "viendo")
    && (e.media?.status === "RELEASING" || e.media?.status === "NOT_YET_RELEASED" || (e.media && !("endDate" in e.media))))
    .map((e) => e.mediaId))];
  try {
    if (ids.length) A.aplicaFichas(await refrescar(ids), { marca: false });
    localStorage.setItem(clave, String(Date.now()));
  } catch { return; }
  terminados.avisaNuevos(A.propias(), A.yoMismo().id);
}

// ── Sagas ────────────────────────────────────────────────────────────────
// Agrupan las temporadas de un mismo anime. Se calculan al arrancar para lo
// que aún no la tiene (lo recién añadido, o todo la primera vez), y para
// todo en el refresco de 12 h (AniList anuncia temporadas nuevas).
let sagaEnCurso = null, sagaPendiente = false;
async function actualizaSagas(todas = false) {
  if (sagaEnCurso) { sagaPendiente = true; return; }
  const ids = todas ? [...new Set(A.propias().map((e) => e.mediaId).filter(Boolean))] : A.sinSaga();
  if (!ids.length) return;
  sagaEnCurso = (async () => {
    try {
      const s = await sagas(ids);
      A.ponSagas(new Map(ids.map((id) => [id, marcaSaga(s.get(id))])));
    } catch { /* AniList no responde: se reintenta en el próximo arranque */ }
  })();
  await sagaEnCurso;
  sagaEnCurso = null;
  if (sagaPendiente) { sagaPendiente = false; actualizaSagas(); }
}
let tSaga = null;
const sagaLuego = () => { clearTimeout(tSaga); tSaga = setTimeout(() => actualizaSagas(), 2500); };

// ── Estado del guardado (pie) ────────────────────────────────────────────
function conectaGuardado() {
  const el = $("#estado-guardado"), punto = $("#estado-red");
  let avisado = false;
  A.escuchaCola((estado, detalle) => {
    punto.className = "estado-red " + ({ guardado: "ok", guardando: "sinc", pendiente: "sinc", error: "mal" }[estado] || "");
    el.textContent = { guardado: "Guardado", guardando: "Guardando…", pendiente: "Guardando…", error: "Sin guardar · reintentando" }[estado] || "";
    if (estado === "error" && !avisado) { avisado = true; aviso(`No se pudo guardar (${detalle}). Se reintenta solo.`); }
    if (estado === "guardado") avisado = false;
  });
  addEventListener("beforeunload", (ev) => { if (A.pendientes()) { A.vacia(); ev.preventDefault(); ev.returnValue = ""; } });
}

// ── Menú de datos ────────────────────────────────────────────────────────
function conectaMenu() {
  const menu = $("#menu");
  // Donaciones: el enlace sale solo si config.js tiene DONAR
  const donar = typeof config.DONAR === "string" && /^https:\/\//.test(config.DONAR) ? config.DONAR : null;
  for (const a of document.querySelectorAll("[data-donar]")) { a.hidden = !donar; if (donar) a.href = donar; }
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
    if (acc === "privacidad") {
      if (location.hash !== "#/perfil") { location.hash = "#/perfil"; await new Promise((r) => setTimeout(r, 300)); }
      document.getElementById("privacidad")?.scrollIntoView({ behavior: reducido() ? "auto" : "smooth", block: "start" });
    }
    if (acc === "tutorial") tutorial.arranca();
    if (acc === "sal") { await A.vacia(); await sal(); location.hash = ""; location.reload(); }
    if (acc === "borra-cuenta") borraCuenta();
  });
  $("#fichero").addEventListener("change", async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = "";
    if (!f) return;
    try {
      const r = await A.importa(f);
      aviso(`Importados ${r.n} registros${r.saltadas ? ` (${r.saltadas} ya los tenías)` : ""}.`, r.n ? { accion: "Deshacer", alPulsar: () => A.deshaz() } : {});
      if (r.n) { location.hash = "#/archivo"; refresca(true); }
    } catch (err) { aviso("No se pudo importar: " + err.message); }
  });
}

async function borraCuenta() {
  const yo = A.yoMismo();
  const escrito = prompt(`Esto borra tu perfil y TODO tu archivo (${A.propias().length} registros) para siempre. Exporta antes si quieres conservarlo.\n\nEscribe tu alias (${yo.alias}) para confirmar:`);
  if (escrito == null) return;
  if (escrito.trim().toLowerCase() !== yo.alias) { aviso("El alias no coincide; no se ha borrado nada."); return; }
  try { await borraPerfil(yo.id); await sal(); location.hash = ""; location.reload(); }
  catch (err) { aviso("No se pudo borrar: " + err.message); }
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
    const claves = A.esPropio() ? Object.keys(VISTAS) : VISTAS_AJENAS;
    const i = +ev.key;
    if (i >= 1 && i <= claves.length) location.hash = ruta(claves[i - 1]);
    if (ev.key === "Enter" || ev.key === " ") {
      const c = ev.target.closest?.("[data-uid].carta, [data-uid].fila");
      if (c) { ev.preventDefault(); abreFicha(c.dataset.uid); }
    }
  });
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
async function arranque() {
  let visto = false;
  try { visto = sessionStorage.getItem("kiroku:arrancado") === "1"; sessionStorage.setItem("kiroku:arrancado", "1"); } catch {}
  const capa = $("#arranque");
  if (visto || reducido()) { capa.remove(); return; }
  capa.hidden = false;
  const yo = A.yoMismo(), n = A.propias().length;
  const lineas = [
    ["KIROKU OS v3.0 — 記録システム起動", ""],
    [`> Operador identificado`, "@" + yo.alias],
    [`> Registros en tu archivo`, String(n)],
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
  if (!configurado) return pantallaSinConfig();
  let s, yo, nuevo = false;
  try {
    s = await sesion();
    if (!s) return pantallaEntrada(new URLSearchParams(location.search).get("error_description"));
    yo = await miPerfil(s.user.id);
  } catch (err) { return pantallaError(err.message); }
  if (!yo) { yo = await pantallaRegistro(s.user); nuevo = true; }
  try { await A.carga(yo); } catch (err) { return pantallaError(err.message); }
  quitaCapa();
  document.body.classList.remove("sin-sesion");

  ficha.conectaPaleta((o) => paleta.abre(o));
  activaHolo();
  conectaMenu();
  conectaTeclado();
  conectaGuardado();
  $("#btn-busca").addEventListener("click", () => paleta.abre());
  addEventListener("hashchange", desdeHash);
  alCambiarSesion((ev) => { if (ev === "SIGNED_OUT") location.reload(); });

  A.escucha((motivo) => {
    // Desde la ficha se repinta la vista de detrás, pero sin la animación de entrada
    pinta();
    if (motivo !== "fichas") { vigila(); if (A.sinSaga().length) sagaLuego(); }
  });

  // Al volver a la pestaña tras un rato, trae lo hecho en otro dispositivo
  let oculto = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") oculto = Date.now();
    else if (oculto && Date.now() - oculto > 60000) A.recarga().catch(() => {});
  });

  recos.escucha(() => { pintaBuzon(); pintaTeletipo(); });
  recos.arranca();

  await desdeHash();
  nivelPrevio = mias.op.nivel;
  vigila();
  if (nuevo) {
    tarjetaTitulo({ jp: "登録", linea1: "EXPEDIENTE CREADO", linea2: `@${yo.alias} · acceso concedido` });
    try { sessionStorage.setItem("kiroku:arrancado", "1"); } catch {}
    $("#arranque")?.remove();
    // El tutorial, cuando se haya ido la tarjeta de bienvenida
    if (!tutorial.visto()) setTimeout(tutorial.arranca, 2600);
  } else arranque();
  refresca();
  setTimeout(() => actualizaSagas(), 3000);
  terminados.avisaNuevos(A.propias(), yo.id);
  setTimeout(refrescaEmision, 5000);
  setInterval(refrescaEmision, 30 * 60 * 1000);
  setInterval(() => mias && pintaTeletipo(), 60000);
}

inicio();
