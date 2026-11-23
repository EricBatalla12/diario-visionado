// 04 · TEMPORADA — lo que sigues en emisión con la cuenta atrás al próximo
// episodio, y el catálogo de la temporada de AniList para apuntarte cosas.
import { esc, cartel, cuentaAtras, FORMATOS, tituloApi, aviso, genero, tipoDe } from "../ui.js";
import { entradas, porMedia, anade, actualiza } from "../almacen.js";
import { recientes, haceDias } from "../terminados.js";
import { temporada, TEMPORADAS, temporadaActual, sagas, refrescar } from "../anilist.js";

let sel = temporadaActual();
let cache = new Map();    // "FALL-2026" → { media, hayMas, pagina }
let reloj = null;

// "En emisión en tu archivo" se puede plegar para ir directo al catálogo; se
// recuerda en este navegador (en el móvil ocupa casi toda la pantalla)
const CLAVE_PLIEGUE = "kiroku:emision-plegada";
let plegada = false;
try { plegada = localStorage.getItem(CLAVE_PLIEGUE) === "1"; } catch {}

export function pinta(raiz, { abreFicha }) {
  const t = TEMPORADAS[sel.i];
  const siguiendo = entradas().filter((e) => (e.estado === "viendo" || e.estado === "pendiente") && e.media?.nextAiringEpisode)
    .sort((a, b) => a.media.nextAiringEpisode.airingAt - b.media.nextAiringEpisode.airingAt);

  const acabados = recientes(entradas());

  raiz.innerHTML = `
  <header class="vista-cab">
    <h1 class="vista-tit"><span>Temporada</span><i>${t.jp}</i></h1>
    <div class="selector-temp">
      <button class="btn-icono" data-mueve="-1" aria-label="Temporada anterior">◀</button>
      <div class="st-actual"><b>${t.nombre}</b><span>${sel.anio}</span></div>
      <button class="btn-icono" data-mueve="1" aria-label="Temporada siguiente">▶</button>
    </div>
  </header>

  ${acabados.length ? `<section class="panel esquinas emision terminados">
    <h2 class="p-tit"><span>Ya terminados</span><i>完結</i><small>${acabados.length}</small></h2>
    <p class="tm-nota">Pendientes que esperaban a que acabase la emisión. Ya puedes verlos de tirón.</p>
    <div class="emision-lista">${acabados.map((e) => `
      <div class="em-item cn-item tm-item" style="--tinte:${esc(e.media.coverImage?.color || "var(--verde)")}">
        <button class="cn-abre" data-uid="${esc(e.uid)}">
          <div class="em-img">${cartel(e)}</div>
          <div class="em-t"><b>${esc(e.titulo)}</b><small>Terminó ${haceDias(e)}${e.media.episodes ? ` · ${e.media.episodes} ep` : ""}</small></div>
        </button>
        <button class="cn-anade tm-empieza" data-empieza="${esc(e.uid)}">▶ Empezar</button>
      </div>`).join("")}</div>
  </section>` : ""}

  ${siguiendo.length ? `<section class="panel esquinas emision ${plegada ? "plegada" : ""}">
    <h2 class="p-tit"><button class="em-pliega" data-pliega aria-expanded="${!plegada}" aria-controls="emision-lista">
      <span>En emisión en tu archivo</span><i>放送中</i><small>${siguiendo.length}</small><b aria-hidden="true">▾</b></button></h2>
    <div class="emision-lista" id="emision-lista" ${plegada ? "hidden" : ""}>${siguiendo.map((e) => {
      const n = e.media.nextAiringEpisode;
      return `<button class="em-item" data-uid="${esc(e.uid)}" style="--tinte:${esc(e.media.coverImage?.color || "var(--naranja)")}">
        <div class="em-img">${cartel(e)}</div>
        <div class="em-t"><b>${esc(e.titulo)}</b><small>Episodio ${n.episode}${e.media.episodes ? " de " + e.media.episodes : ""}</small></div>
        <div class="em-reloj" data-en="${n.airingAt}">${cuentaAtras(n.airingAt - Date.now() / 1000)}</div>
      </button>`; }).join("")}</div>
  </section>` : ""}

  <div id="continua"></div>

  <section id="catalogo"><div class="cargando"><span></span>Consultando AniList…</div></section>`;

  raiz.querySelectorAll("[data-mueve]").forEach((b) => b.addEventListener("click", () => {
    let i = sel.i + +b.dataset.mueve, anio = sel.anio;
    if (i < 0) { i = 3; anio--; } if (i > 3) { i = 0; anio++; }
    sel = { i, anio }; pinta(raiz, { abreFicha });
  }));
  raiz.querySelector("[data-pliega]")?.addEventListener("click", (ev) => {
    plegada = !plegada;
    try { localStorage.setItem(CLAVE_PLIEGUE, plegada ? "1" : "0"); } catch {}
    const sec = ev.currentTarget.closest(".emision");
    sec.classList.toggle("plegada", plegada);
    sec.querySelector(".emision-lista").hidden = plegada;
    ev.currentTarget.setAttribute("aria-expanded", !plegada);
  });
  raiz.querySelectorAll("button.em-item, .tm-item [data-uid]").forEach((b) => b.addEventListener("click", () => abreFicha(b.dataset.uid)));
  raiz.querySelectorAll("[data-empieza]").forEach((b) => b.addEventListener("click", () => {
    const h = new Date();
    const e = actualiza(b.dataset.empieza, { estado: "viendo", mes: h.getMonth() + 1, anio: h.getFullYear() });
    aviso(`«${e?.titulo || "Título"}» a viendo. ¡A por él!`);
  }));

  clearInterval(reloj);
  reloj = setInterval(() => {
    if (!raiz.isConnected) return clearInterval(reloj);
    raiz.querySelectorAll("[data-en]").forEach((r) => (r.textContent = cuentaAtras(+r.dataset.en - Date.now() / 1000)));
  }, 30000);

  continua(raiz.querySelector("#continua"), abreFicha);
  catalogo(raiz.querySelector("#catalogo"), abreFicha);
}

// ── Continúa… ────────────────────────────────────────────────────────────
// La siguiente temporada de las sagas que sigues: lo que está en emisión o
// anunciado, que aún no tienes y que va después de la última que has visto
// (o estás viendo). Sale de las mismas relaciones que agrupan las sagas.
const SIGUES = new Set(["visto", "revisto", "viendo"]);
const PROXIMA = new Set(["RELEASING", "NOT_YET_RELEASED"]);
const SEASON_ES = Object.fromEntries(TEMPORADAS.map((t) => [t.id, t.nombre]));
const tituloNodo = (n) => n.title?.english || n.title?.romaji || n.title?.native || "";
const VISIBLES = 6;
const CLAVE_CONTINUA = "kiroku:continua-plegada";
let continuaPlegada = false, continuaTodas = false;
try { continuaPlegada = localStorage.getItem(CLAVE_CONTINUA) === "1"; } catch {}

async function continua(caja, abreFicha) {
  const mias = entradas().filter((e) => e.mediaId && e.media?.saga);
  if (!mias.length) return;
  let s;
  try { s = await sagas([...new Set(mias.map((e) => e.mediaId))], { fondo: true }); } catch { return; }
  if (!caja.isConnected) return;

  const items = [], hechas = new Set();
  for (const e of mias) {
    const x = s.get(e.mediaId);
    if (!x || hechas.has(x.raiz)) continue;
    hechas.add(x.raiz);
    // La última de la cadena que ya sigues
    let ultima = -1;
    x.cadena.forEach((n, i) => { const m = porMedia(n.id); if (m && SIGUES.has(m.estado)) ultima = i; });
    if (ultima < 0) continue;
    const sig = x.cadena.slice(ultima + 1).find((n) => !porMedia(n.id) && PROXIMA.has(n.status) && n.format !== "MUSIC");
    if (sig) items.push({ n: sig, tras: x.cadena[ultima], cuando: sig.nextAiringEpisode?.airingAt || Infinity });
  }
  if (!items.length) { caja.innerHTML = ""; return; }
  items.sort((a, b) => a.cuando - b.cuando || a.n.inicio - b.n.inicio);

  const ahora = Date.now() / 1000;
  const estado = (n) => {
    const p = n.nextAiringEpisode;
    if (n.status === "RELEASING") return p ? `En emisión · EP ${p.episode} en ${cuentaAtras(p.airingAt - ahora)}` : "En emisión";
    if (p) return `Empieza en ${cuentaAtras(p.airingAt - ahora)}`;
    const anio = n.seasonYear || (n.inicio < 99990000 ? Math.floor(n.inicio / 10000) : null);
    return n.season && n.seasonYear ? `Próximamente · ${SEASON_ES[n.season]} ${n.seasonYear}` : anio ? `Próximamente · ${anio}` : "Anunciada, sin fecha";
  };
  const vistos = continuaTodas ? items : items.slice(0, VISIBLES);
  caja.innerHTML = `<section class="panel esquinas emision continua ${continuaPlegada ? "plegada" : ""}">
    <h2 class="p-tit"><button class="em-pliega" data-pliega-cn aria-expanded="${!continuaPlegada}" aria-controls="continua-lista">
      <span>Continúa</span><i>続き</i><small>${items.length}</small><b aria-hidden="true">▾</b></button></h2>
    <div class="emision-lista" id="continua-lista" ${continuaPlegada ? "hidden" : ""}>${vistos.map(({ n, tras }) => `
      <div class="em-item cn-item" style="--tinte:${esc(n.coverImage?.color || "var(--naranja)")}">
        <button class="cn-abre" data-cn="${n.id}">
          <div class="em-img">${n.coverImage?.large ? `<img src="${esc(n.coverImage.large)}" alt="" loading="lazy">` : ""}</div>
          <div class="em-t"><b>${esc(tituloNodo(n))}</b><small>${esc(estado(n))}</small><small class="cn-tras">Sigue a «${esc(tituloNodo(tras))}»</small></div>
        </button>
        <button class="cn-anade" data-cn-anade="${n.id}" title="Añadir a pendientes">＋ Pendiente</button>
      </div>`).join("")}
      ${items.length > VISIBLES ? `<button class="enlace cn-mas" data-cn-mas>${continuaTodas ? "Ver menos" : `Ver las ${items.length}`}</button>` : ""}</div>
  </section>`;

  // La ficha de la saga es corta: para abrirla o añadirla se pide la completa
  const completa = async (id) => (await refrescar([id]))[0];
  caja.onclick = async (ev) => {
    if (ev.target.closest("[data-pliega-cn]")) {
      continuaPlegada = !continuaPlegada;
      try { localStorage.setItem(CLAVE_CONTINUA, continuaPlegada ? "1" : "0"); } catch {}
      return continua(caja, abreFicha);
    }
    if (ev.target.closest("[data-cn-mas]")) { continuaTodas = !continuaTodas; return continua(caja, abreFicha); }
    const a = ev.target.closest("[data-cn]"), b = ev.target.closest("[data-cn-anade]");
    if (!a && !b) return;
    const id = +(a || b).dataset[a ? "cn" : "cnAnade"];
    const ya = porMedia(id);
    if (ya) return abreFicha(ya.uid);
    (a || b).disabled = true;
    let m;
    try { m = await completa(id); } catch (err) { aviso("AniList no responde: " + err.message); (a || b).disabled = false; return; }
    if (a) return abreFicha(null, m);
    const e = anade({ mediaId: m.id, media: m, titulo: tituloApi(m), tipo: tipoDe(m), estado: "pendiente" });
    aviso(`«${e.titulo}» a pendientes.`);
  };
}

async function catalogo(caja, abreFicha) {
  const k = `${TEMPORADAS[sel.i].id}-${sel.anio}`;
  try {
    if (!cache.has(k)) {
      const r = await temporada(TEMPORADAS[sel.i].id, sel.anio, 1);
      cache.set(k, { ...r, pagina: 1 });
    }
  } catch (err) {
    caja.innerHTML = `<div class="vacio"><div class="vacio-jp">断</div><p>No se pudo hablar con AniList.</p><p class="tenue">${esc(err.message)}</p></div>`;
    return;
  }
  if (!caja.isConnected) return;
  const c = cache.get(k);
  caja.innerHTML = `<div class="rejilla temp">${c.media.map(tarjeta).join("")}</div>
    ${c.hayMas ? `<div class="mas"><button class="btn" data-mas>Cargar más</button></div>` : ""}`;

  // onclick (y no addEventListener) para que repintar no acumule manejadores
  caja.onclick = async (ev) => {
    const mas = ev.target.closest("[data-mas]");
    if (mas) {
      mas.disabled = true; mas.textContent = "Cargando…";
      try {
        const r = await temporada(TEMPORADAS[sel.i].id, sel.anio, c.pagina + 1);
        c.media.push(...r.media); c.hayMas = r.hayMas; c.pagina++;
      } catch (err) { aviso("AniList no respondió: " + err.message); }
      catalogo(caja, abreFicha);
      return;
    }
    const b = ev.target.closest("[data-anade]");
    if (b) {
      const m = c.media.find((x) => x.id === +b.dataset.anade);
      const ya = porMedia(m.id);
      if (ya) return abreFicha(ya.uid);
      const e = anade({ mediaId: m.id, media: m, titulo: tituloApi(m), tipo: tipoDe(m), estado: "pendiente" });
      aviso(`«${e.titulo}» a pendientes.`);
      b.outerHTML = `<button class="t-ya" data-anade="${m.id}">✓ En el archivo</button>`;
      return;
    }
    const t = ev.target.closest("[data-abre]");
    if (t) {
      const ya = porMedia(+t.dataset.abre);
      if (ya) abreFicha(ya.uid);
      else abreFicha(null, c.media.find((x) => x.id === +t.dataset.abre));
    }
  };
}

function tarjeta(m) {
  const ya = porMedia(m.id);
  const falso = { titulo: tituloApi(m), media: m, tipo: "anime" };
  const sig = m.nextAiringEpisode;
  // AniList solo da `episodes` cuando el total está anunciado: si no, no se inventa
  const total = m.format !== "MOVIE" ? m.episodes : null;
  return `<article class="carta holo t-carta" style="--tinte:${esc(m.coverImage?.color || "#ff6b1a")}">
    <div class="carta-marco" data-abre="${m.id}" role="button" tabindex="0">
      <div class="carta-img">${cartel(falso)}</div>
      <div class="carta-brillo"></div>
      ${m.averageScore ? `<span class="carta-comunidad">${(m.averageScore / 10).toFixed(1)}</span>` : ""}
      ${sig ? `<span class="carta-emision" title="${total ? `Episodio ${sig.episode} de ${total}` : `Episodio ${sig.episode}; total sin confirmar`}">EP ${sig.episode}${total ? `/${total}` : ""} · ${cuentaAtras(sig.airingAt - Date.now() / 1000)}</span>`
        : total ? `<span class="carta-emision total" title="${total} episodios">${total} EP</span>` : ""}
      <div class="carta-pie"><h3>${esc(falso.titulo)}</h3>
        <p>${esc([FORMATOS[m.format] || m.format, m.studio, m.episodes ? m.episodes + " ep" : null].filter(Boolean).join(" · "))}</p>
        <p class="t-gen">${(m.genres || []).slice(0, 3).map((g) => esc(genero(g))).join(" / ")}</p></div>
    </div>
    ${ya ? `<button class="t-ya" data-anade="${m.id}">✓ En el archivo</button>` : `<button class="t-anade" data-anade="${m.id}">＋ Pendiente</button>`}
  </article>`;
}
