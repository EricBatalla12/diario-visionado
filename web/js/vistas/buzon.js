// BUZÓN 受信箱 — lo que te recomiendan otros operadores (Recibidas) y lo que
// has mandado tú y aún no han resuelto (Enviadas, se pueden cancelar).
// No va en la barra de pestañas: se abre desde el icono de la cabecera.
import { esc, aviso, fmtNota, rango, tituloApi, FORMATOS, ESTADOS, genero } from "../ui.js";
import { porMedia } from "../almacen.js";
import * as R from "../recos.js";

let pestana = "recibidas";
let enviadas = null;        // se lee al abrir la pestaña
let quitarOyente = null;

const cuando = (iso) => {
  const d = (Date.now() - Date.parse(iso)) / 1000;
  if (d < 3600) return `hace ${Math.max(1, Math.round(d / 60))} min`;
  if (d < 86400) return `hace ${Math.round(d / 3600)} h`;
  if (d < 86400 * 30) return `hace ${Math.round(d / 86400)} d`;
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
};
const avatar = (p) => p?.avatar_url
  ? `<img src="${esc(p.avatar_url)}" alt="" referrerpolicy="no-referrer" loading="lazy">`
  : `<span>${esc((p?.nombre?.[0] || "?").toUpperCase())}</span>`;

export function pinta(raiz, { abreFicha }) {
  quitarOyente?.();
  // Si el sondeo trae algo mientras miras el buzón, se repinta solo
  quitarOyente = R.escucha(() => { if (raiz.isConnected && raiz.dataset.vista === "buzon") dibuja(raiz, abreFicha); });
  dibuja(raiz, abreFicha);
  R.lee();
}

function dibuja(raiz, abreFicha) {
  const n = R.cuenta();
  raiz.innerHTML = `
  <header class="vista-cab">
    <h1 class="vista-tit"><span>Buzón</span><i>受信箱</i></h1>
    <p class="vista-sub">Lo que te recomiendan otros operadores. Al resolver una recomendación desaparece; si la añades, tu registro recuerda quién te la pasó.</p>
    <div class="chips" role="tablist">
      <button class="chip ${pestana === "recibidas" ? "on" : ""}" data-pestana="recibidas" role="tab" aria-selected="${pestana === "recibidas"}">Recibidas <small>${n}</small></button>
      <button class="chip ${pestana === "enviadas" ? "on" : ""}" data-pestana="enviadas" role="tab" aria-selected="${pestana === "enviadas"}">Enviadas${enviadas ? ` <small>${enviadas.length}</small>` : ""}</button>
      <a class="chip" href="#/perfil" data-ajustes>Ajustes</a>
    </div>
  </header>
  <section class="buzon" id="buzon-lista">${pestana === "recibidas" ? recibidas() : `<div class="cargando"><span></span>Leyendo lo que has mandado…</div>`}</section>`;

  raiz.querySelectorAll("[data-pestana]").forEach((b) => b.addEventListener("click", () => {
    pestana = b.dataset.pestana; dibuja(raiz, abreFicha);
  }));
  raiz.querySelector("[data-ajustes]").addEventListener("click", (ev) => {
    ev.preventDefault();
    location.hash = "#/perfil";
    setTimeout(() => document.getElementById("ajustes-recos")?.scrollIntoView({ block: "start" }), 300);
  });
  if (pestana === "recibidas") conectaRecibidas(raiz, abreFicha);
  else cargaEnviadas(raiz, abreFicha);
}

// ── Recibidas ────────────────────────────────────────────────────────────
function carta(r, { pie, extra = "", suya = true }) {
  const m = r.media || {}, cover = R.portadaFiable(m), nota = r.nota == null ? null : +r.nota, rg = rango(nota);
  const meta = [FORMATOS[m.format] || m.format, m.episodes ? `${m.episodes} ep` : m.chapters ? `${m.chapters} cap` : null, m.seasonYear].filter(Boolean);
  return `<article class="bz-carta" style="--tinte:${esc(/^#[0-9a-f]{3,8}$/i.test(m.coverImage?.color || "") ? m.coverImage.color : "var(--naranja)")}">
    <button class="bz-img" data-previa="${esc(r.id)}" aria-label="Ver la ficha de ${esc(tituloApi(m))}">${cover ? `<img src="${esc(cover)}" alt="" loading="lazy">` : `<span>推</span>`}</button>
    <div class="bz-d">
      ${extra}
      <h3>${esc(tituloApi(m) || "Título sin nombre")}</h3>
      <p class="bz-meta">${meta.map(esc).join(" · ")}${(m.genres || []).length ? ` · ${m.genres.slice(0, 3).map((g) => esc(genero(g))).join(", ")}` : ""}</p>
      ${r.mensaje ? `<blockquote class="bz-msg">${esc(r.mensaje)}</blockquote>` : ""}
      ${pie}
    </div>
    ${nota != null ? `<div class="bz-nota ${rg.clase}" title="${suya ? "Nota de quien lo recomienda" : "La nota que mandaste"}"><small>${suya ? "Su nota" : "Tu nota"}</small><b>${fmtNota(nota)}</b><i>${rg.r}</i></div>` : ""}
  </article>`;
}

function recibidas() {
  const l = R.lista();
  if (!l.length) return `<div class="vacio"><div class="vacio-jp">空</div><p>No tienes recomendaciones pendientes.</p>
    <p class="tenue">Cuando un operador te recomiende algo aparecerá aquí. Tú puedes recomendar desde cualquier ficha con «Recomendar a…».</p></div>`;
  return l.map((r) => {
    const ya = porMedia(r.media_id), p = r.remitente;
    const de = `<p class="bz-de"><a href="#/@${esc(p?.alias || "")}" class="bz-av">${avatar(p)}</a><span><b>${esc(p?.nombre || "Operador")}</b> te lo recomienda <small>${cuando(r.creado)}</small></span></p>`;
    const pie = ya
      ? `<p class="bz-ya" style="--c:${ESTADOS[ya.estado].color}">Ya lo tienes en tu archivo · <b>${esc(ESTADOS[ya.estado].nombre.toLowerCase())}</b></p>
         <div class="fi-acc"><button class="btn" data-mio="${esc(ya.uid)}">Abrir tu registro</button><button class="btn" data-descarta="${esc(r.id)}">Quitar del buzón</button></div>`
      : `<div class="fi-acc"><button class="btn primario" data-acepta="pendiente" data-id="${esc(r.id)}">＋ Añadir a pendientes</button>
         <button class="btn" data-acepta="visto" data-id="${esc(r.id)}">Ya lo he visto</button>
         <button class="btn" data-descarta="${esc(r.id)}">Descartar</button></div>`;
    return carta(r, { pie, extra: de });
  }).join("");
}

function conectaRecibidas(raiz, abreFicha) {
  const busca = (id) => R.lista().find((r) => r.id === id);
  raiz.querySelectorAll("[data-acepta]").forEach((b) => b.addEventListener("click", async () => {
    const r = busca(b.dataset.id);
    if (!r) return;
    raiz.querySelectorAll(`[data-id="${CSS.escape(r.id)}"], [data-descarta="${CSS.escape(r.id)}"]`).forEach((x) => (x.disabled = true));
    const visto = b.dataset.acepta === "visto";
    try {
      const e = await R.acepta(r, visto ? "visto" : "pendiente");
      aviso(visto ? `«${e.titulo}» al archivo como visto: ponle nota.` : `«${e.titulo}» a pendientes.`);
      // "Ya lo he visto" abre la ficha para puntuarlo
      if (visto) abreFicha(e.uid);
    } catch (err) { aviso("No se pudo añadir: " + err.message); dibuja(raiz, abreFicha); }
  }));
  raiz.querySelectorAll("[data-descarta]").forEach((b) => b.addEventListener("click", () => {
    const r = busca(b.dataset.descarta);
    if (r) R.descarta(r);
  }));
  raiz.querySelectorAll("[data-mio]").forEach((b) => b.addEventListener("click", () => abreFicha(b.dataset.mio)));
  raiz.querySelectorAll("[data-previa]").forEach((b) => b.addEventListener("click", () => {
    const r = busca(b.dataset.previa);
    if (!r) return;
    const ya = porMedia(r.media_id);
    abreFicha(ya ? ya.uid : null, ya ? null : previa(r.media));
  }));
}

// La ficha reducida, con la portada solo si es de AniList; la ficha completa
// (sinopsis, personajes…) la descarga la propia ficha por el id
const previa = (m) => { const c = R.portadaFiable(m); return { ...m, coverImage: c ? { ...m.coverImage, large: c } : null }; };

// ── Enviadas ─────────────────────────────────────────────────────────────
async function cargaEnviadas(raiz, abreFicha) {
  const caja = raiz.querySelector("#buzon-lista");
  try { enviadas = await R.enviadas(); }
  catch (err) { if (caja.isConnected) caja.innerHTML = `<p class="ac-error">▲ No se pudieron leer: ${esc(err.message)}</p>`; return; }
  if (!caja.isConnected || pestana !== "enviadas") return;
  const chip = raiz.querySelector('[data-pestana="enviadas"]');
  if (chip) chip.innerHTML = `Enviadas <small>${enviadas.length}</small>`;
  if (!enviadas.length) { caja.innerHTML = `<div class="vacio"><div class="vacio-jp">空</div><p>No tienes recomendaciones pendientes de respuesta.</p>
    <p class="tenue">Abre cualquier ficha y pulsa «Recomendar a…».</p></div>`; return; }
  caja.innerHTML = enviadas.map((r) => {
    const p = r.receptor;
    const extra = `<p class="bz-de"><a href="#/@${esc(p?.alias || "")}" class="bz-av">${avatar(p)}</a><span>Para <b>${esc(p?.nombre || "Operador")}</b> <small>${cuando(r.creado)} · sin resolver</small></span></p>`;
    return carta(r, { extra, suya: false, pie: `<div class="fi-acc"><button class="btn" data-cancela="${esc(r.id)}">Cancelar</button></div>` });
  }).join("");
  caja.querySelectorAll("[data-cancela]").forEach((b) => b.addEventListener("click", async () => {
    const r = enviadas.find((x) => x.id === b.dataset.cancela);
    b.disabled = true;
    try {
      await R.cancela(r);
      enviadas = enviadas.filter((x) => x.id !== r.id);
      aviso(`Cancelada la recomendación a ${r.receptor?.nombre || "?"}.`);
    } catch (err) { aviso("No se pudo cancelar: " + err.message); }
    cargaEnviadas(raiz, abreFicha);
  }));
  caja.querySelectorAll("[data-previa]").forEach((b) => b.addEventListener("click", () => {
    const r = enviadas.find((x) => x.id === b.dataset.previa);
    const ya = r && porMedia(r.media_id);
    if (r) abreFicha(ya ? ya.uid : null, ya ? null : previa(r.media));
  }));
}
