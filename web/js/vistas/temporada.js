// 04 · TEMPORADA — lo que sigues en emisión con la cuenta atrás al próximo
// episodio, y el catálogo de la temporada de AniList para apuntarte cosas.
import { esc, cartel, cuentaAtras, FORMATOS, tituloApi, aviso, genero, tipoDe } from "../ui.js";
import { entradas, porMedia, anade } from "../almacen.js";
import { temporada, TEMPORADAS, temporadaActual } from "../anilist.js";

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

  raiz.innerHTML = `
  <header class="vista-cab">
    <h1 class="vista-tit"><span>Temporada</span><i>${t.jp}</i></h1>
    <div class="selector-temp">
      <button class="btn-icono" data-mueve="-1" aria-label="Temporada anterior">◀</button>
      <div class="st-actual"><b>${t.nombre}</b><span>${sel.anio}</span></div>
      <button class="btn-icono" data-mueve="1" aria-label="Temporada siguiente">▶</button>
    </div>
  </header>

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
  raiz.querySelectorAll(".em-item").forEach((b) => b.addEventListener("click", () => abreFicha(b.dataset.uid)));

  clearInterval(reloj);
  reloj = setInterval(() => {
    if (!raiz.isConnected) return clearInterval(reloj);
    raiz.querySelectorAll("[data-en]").forEach((r) => (r.textContent = cuentaAtras(+r.dataset.en - Date.now() / 1000)));
  }, 30000);

  catalogo(raiz.querySelector("#catalogo"), abreFicha);
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
