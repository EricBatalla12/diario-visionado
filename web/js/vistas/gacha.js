// 05 · GACHA — cartas coleccionables de anime y manga de AniList.
//
// Los tickets se ganan viendo (por nivel y por cada título terminado), más
// la tirada del día gratis. Cada invocación saca cartas de un pozo (anime o
// manga): lo que no conoces sale como NUEVA y se puede apuntar a pendientes,
// y lo que ya terminaste sale "despertado". Las repetidas dan fragmentos, y
// 5 fragmentos son un ticket. El álbum enseña lo conseguido y los sets.
//
// La lógica del sorteo vive en ../gacha.js; aquí solo se pinta. Lo guardado
// (cartas, tickets gastados, piedad, racha) está en Supabase: va igual en
// todos los dispositivos.
import { esc, aviso, reducido, formato, genero, tituloApi, tipoDe } from "../ui.js";
import { coleccionPropia, coleccionSujeto, aplicaGacha, porMedia, entradas, anade, esPropio, sujetoActual } from "../almacen.js";
import { invoca as invocaNube, canjea, premia } from "../nube.js";
import { detalle, refrescar } from "../anilist.js";
import { abrePrevia } from "../ficha.js";
import * as G from "../gacha.js";

// ── Estado de la vista (dura mientras no se recarga la página) ───────────
const CLAVE_VISTA = "kiroku:gacha:vista";
let pref = { modo: "invocar", pozo: "anime", banner: { anime: "todo", manga: "todo" } };
try { pref = { ...pref, ...JSON.parse(localStorage.getItem(CLAVE_VISTA) || "{}") }; } catch {}
const guardaPref = () => { try { localStorage.setItem(CLAVE_VISTA, JSON.stringify(pref)); } catch {} };

let revelado = null;      // { pozo, cartas: [filas con `nueva`], i: índice enfocado o null (rejilla del ×10), diaria }
let historial = [];       // lo invocado en esta sesión
let girando = false;
let ctx = null;           // { raiz, stats, abreFicha }
let filtro = { rar: "", ver: "", orden: "numero" };
let setAbierto = null;
const setsCargados = new Set();   // pozos cuyos sets ya se han pedido en esta sesión
const premiando = new Set();

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const fecha = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hoyClave = () => fecha(new Date());
const ayerClave = () => { const d = new Date(); d.setDate(d.getDate() - 1); return fecha(d); };
const hastaManana = () => { const m = new Date(); m.setHours(24, 0, 0, 0); const min = Math.ceil((m - Date.now()) / 60000); return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`; };
const plural = (n, uno, varios) => `${n.toLocaleString("es-ES")} ${n === 1 ? uno : varios}`;

// ¿Terminado en el archivo que se mira? (propio o del amigo visitado)
function enArchivo(mediaId) {
  return esPropio() ? porMedia(mediaId) : entradas().find((e) => e.mediaId === mediaId);
}
const terminado = (e) => e && (e.estado === "visto" || e.estado === "revisto");

// ── La carta ─────────────────────────────────────────────────────────────
// Como una carta de monstruos: nombre y "PS" (la nota de AniList) arriba,
// la portada, el tipo (género principal) con su kanji, datos y número de
// colección. Marco del color de la rareza; dorado si la has despertado.
function carta(c, { mini = false, k = 0 } = {}) {
  const m = c.media, r = G.RAREZA[c.rareza], tp = G.tipoCarta(m);
  const desp = terminado(enArchivo(c.mediaId ?? c.media_id));
  const titulo = tituloApi(m);
  const datos = [m.studio, m.type === "MANGA" ? (m.chapters ? m.chapters + " cap" : null) : (m.episodes ? m.episodes + " ep" : null)].filter(Boolean).join(" · ");
  const num = String(c.numero).padStart(4, "0");
  return `<article class="kc holo r-${r.id} ${c.brillante ? "brilla" : ""} ${desp ? "despierta" : ""} ${mini ? "mini" : ""}"
      style="--tp:${tp.c};--tinte:${esc(m.coverImage?.color || tp.c)};--k:${k}" data-carta="${c.mediaId ?? c.media_id}">
    <div class="kc-marco">
      <header class="kc-cab"><b class="kc-tit">${esc(titulo)}</b><span class="kc-ps"><small>PS</small>${m.averageScore ?? "—"}</span></header>
      <div class="kc-arte">${m.coverImage?.large ? `<img src="${esc(mini ? m.coverImage.large : m.coverImage.extraLarge || m.coverImage.large)}" alt="" loading="lazy" decoding="async">` : ""}
        ${desp ? `<span class="kc-sello" title="Despertada: la has terminado">覚醒</span>` : ""}
        ${c.veces > 1 ? `<span class="kc-veces" title="La tienes ${c.veces} veces">×${c.veces}</span>` : ""}</div>
      <div class="kc-tipo"><i>${tp.jp}</i><span>${esc(tp.nombre)}</span><em>${esc([formato(m), m.seasonYear].filter(Boolean).join(" · "))}</em></div>
      ${mini ? "" : `<p class="kc-datos">${esc(datos || "—")}</p>`}
      <footer class="kc-pie"><span>#${num}</span><span class="kc-est">${"★".repeat(r.estrellas)}</span><b>${r.nombre}</b></footer>
      <div class="carta-brillo"></div>
    </div>
  </article>`;
}

// ── Pintado ──────────────────────────────────────────────────────────────
export function pinta(raiz, { stats, abreFicha, propio }) {
  ctx = { raiz, stats, abreFicha };
  const col = propio ? coleccionPropia() : coleccionSujeto();
  const modo = propio ? pref.modo : "album", pozo = pref.pozo;
  const dePozo = col.cartas.filter((c) => c.pozo === pozo);
  const cab = `<header class="vista-cab">
    <h1 class="vista-tit"><span>${modo === "invocar" ? "Invocación" : "Álbum"}</span><i>${modo === "invocar" ? "召喚" : "図鑑"}</i></h1>
    <p class="vista-sub">${propio ? "Cartas de anime y manga. Se ganan viendo y te descubren lo que aún no conoces." : `Las cartas de ${esc(sujetoActual().nombre)}.`}</p>
  </header>`;
  if (propio && !col.listo) {
    raiz.innerHTML = cab + `<div class="vacio"><div class="vacio-jp">断</div><p>El Gacha no está disponible ahora mismo.</p>
      <p class="tenue">No se ha podido leer tu colección. Vuelve a intentarlo en un rato.</p></div>`;
    return;
  }
  const t = propio ? G.tickets(stats, col.gacha) : null;
  raiz.innerHTML = cab + `
  ${propio ? `<div class="gch-barra">
    <div class="gch-modos" role="tablist" aria-label="Sección del Gacha">
      <button role="tab" class="gch-modo ${modo === "invocar" ? "on" : ""}" aria-selected="${modo === "invocar"}" data-modo="invocar"><i>召喚</i>Invocar</button>
      <button role="tab" class="gch-modo ${modo === "album" ? "on" : ""}" aria-selected="${modo === "album"}" data-modo="album"><i>図鑑</i>Álbum <small>${col.cartas.length}</small></button>
    </div>
    ${cuenta(t, col.gacha)}
  </div>` : ""}
  <div class="gch-pozos">
    <span class="gch-pozos-et">Pozo</span>
    <div class="gch-interruptor" role="tablist" aria-label="Pozo" style="--i:${Object.keys(G.POZOS).indexOf(pozo)}">
      <span class="gch-luz" aria-hidden="true"></span>
      ${Object.values(G.POZOS).map((p) => `<button role="tab" class="gch-pozo ${p.id === pozo ? "on" : ""}" aria-selected="${p.id === pozo}" data-pozo="${p.id}"><i>${p.jp}</i>${p.nombre}
        <small>${col.cartas.filter((c) => c.pozo === p.id).length}</small></button>`).join("")}
    </div>
  </div>
  ${modo === "invocar" ? invocar(pozo, col, t, stats) : album(pozo, dePozo, col, propio)}`;
  conecta(raiz, propio);
  if (modo === "album") cargaSets(pozo, propio);
  if (revelado && modo === "invocar") rellenaSinopsis(raiz);
}

// Tickets y fragmentos, con de dónde salen
function cuenta(t, est) {
  const frag = est?.fragmentos || 0;
  return `<div class="gch-cuenta">
    <details class="gch-tk">
      <summary title="De dónde salen tus tickets"><i>券</i><b>${t.quedan.toLocaleString("es-ES")}</b><small>${t.quedan === 1 ? "ticket" : "tickets"}</small></summary>
      <div class="gch-tk-det">
        <p class="p-tit"><span>Tus tickets</span><i>券</i></p>
        <dl>
          <div><dt>${G.TICKETS_NIVEL} por nivel</dt><dd>+${t.porNivel}</dd></div>
          <div><dt>1 por título terminado</dt><dd>+${t.porTerminados}</dd></div>
          ${t.porCanjes ? `<div><dt>Canjeados con fragmentos</dt><dd>+${t.porCanjes}</dd></div>` : ""}
          ${t.porSets ? `<div><dt>Sets completos (${G.TICKETS_SET} cada uno)</dt><dd>+${t.porSets}</dd></div>` : ""}
          <div class="menos"><dt>Gastados</dt><dd>−${t.gastados}</dd></div>
          <div class="total"><dt>Te quedan</dt><dd>${t.quedan}</dd></div>
        </dl>
        <p class="tenue">Además, la tirada del día es gratis. Las cartas repetidas dan un fragmento; con ${G.FRAG_TICKET}, un ticket.</p>
      </div>
    </details>
    <div class="gch-frag" title="Fragmentos: uno por cada carta repetida">
      <i>欠片</i><b>${frag}</b><small>/${G.FRAG_TICKET}</small>
      ${frag >= G.FRAG_TICKET ? `<button class="btn" data-canjea>Canjear ${Math.floor(frag / G.FRAG_TICKET)}</button>` : ""}
    </div>
  </div>`;
}

// ── Invocar ──────────────────────────────────────────────────────────────
function bannerActual(pozo) {
  const sets = G.setsDeLaSemana(pozo);
  const id = pref.banner[pozo];
  return sets.find((s) => s.id === id) || null;
}

function invocar(pozo, col, t, stats) {
  const sets = G.setsDeLaSemana(pozo), banner = bannerActual(pozo);
  const est = col.gacha || {};
  const piedad = est[`piedad_${pozo}`] || 0, faltan = G.PIEDAD - Math.min(piedad, G.PIEDAD - 1);
  const diariaHecha = est.diaria === hoyClave();
  const racha = est.diaria === hoyClave() || est.diaria === ayerClave() ? est.racha || 0 : 0;
  const rachaSig = est.diaria === ayerClave() ? (est.racha || 0) + 1 : 1;
  const premioRacha = rachaSig % G.RACHA_PREMIO === 0;
  const tengo = new Set(col.cartas.map((c) => c.mediaId));
  const miembrosDe = (s) => G.miembrosGuardados(s);
  const progreso = (s) => { const l = miembrosDe(s); return l ? `${l.filter((m) => tengo.has(m.id)).length}/${l.length}` : ""; };
  const lb = banner && miembrosDe(banner);
  const conSSR = !banner || !lb || lb.some((m) => G.rarezaDe(m.averageScore).id === "ssr");
  const rev = revelado?.pozo === pozo ? revelado : null;
  const enfocada = rev && rev.i != null ? rev.cartas[rev.i] : null;
  return `<div class="gacha">
    <section class="altar ${rev ? "con-carta r-" + (enfocada || mejorDe(rev.cartas)).rareza : ""}" id="altar">
      <div class="portal" aria-hidden="true">
        <div class="pt-anillo a1"></div><div class="pt-anillo a2"></div><div class="pt-anillo a3"></div>
        <svg class="pt-runas" viewBox="0 0 200 200"><defs><path id="circ" d="M100,100 m-82,0 a82,82 0 1,1 164,0 a82,82 0 1,1 -164,0"/></defs>
          <text><textPath href="#circ">記録召喚 · KIROKU · 視聴の門 · 未視聴の扉を開け · 記録召喚 · KIROKU · 視聴の門 ·</textPath></text></svg>
        <div class="pt-nucleo"></div>
      </div>
      <div class="rayos" aria-hidden="true"></div>
      <div id="revelada">${rev ? (enfocada ? revela(enfocada, rev) : rejilla(rev)) : `<p class="altar-pista">${t.quedan ? `Tienes ${plural(t.quedan, "ticket", "tickets")}. Invoca y descubre algo nuevo.` : diariaHecha ? "Sin tickets: sube de nivel o termina algo para ganar más." : "Sin tickets, pero la tirada del día es gratis."}</p>`}</div>
    </section>

    <aside class="panel esquinas gacha-lado">
      <div class="banners" role="tablist" aria-label="Banner">
        <button role="tab" class="banner ${!banner ? "on" : ""}" aria-selected="${!banner}" data-banner="todo" title="Todo el pozo de ${G.POZOS[pozo].nombre.toLowerCase()} de AniList">
          <i>全部</i><b>Pozo completo</b><small>${G.POZOS[pozo].nombre}</small></button>
        ${sets.map((s) => `<button role="tab" class="banner ${banner === s ? "on" : ""}" aria-selected="${banner === s}" data-banner="${s.id}" title="${esc(s.desc)}">
          <i>${s.jp}</i><b>${esc(s.nombre)}</b><small>${progreso(s)}</small></button>`).join("")}
      </div>
      <p class="banner-pie">${banner ? `Set: ${esc(banner.desc)}. Las cartas que te faltan salen más.` : `${G.POZOS[pozo].nombre} con más de ${G.POZOS[pozo].pop.toLocaleString("es-ES")} usuarios en AniList.`} Los sets del banner cambian en ${plural(G.diasACambio(), "día", "días")}.</p>
      <div class="invocar-x">
        <button class="btn-invocar" data-invoca="1" ${t.quedan >= 1 && !girando ? "" : "disabled"}>
          <span class="bi-jp">召喚</span><span class="bi-t">Invocar ×1</span><small>1 ticket</small></button>
        <button class="btn-invocar x10" data-invoca="10" ${t.quedan >= 10 && !girando ? "" : "disabled"}>
          <span class="bi-jp">十連</span><span class="bi-t">Invocar ×10</span><small>${banner ? "10 tickets" : "10 tickets · SR o más segura"}</small></button>
      </div>
      <div class="piedad ${conSSR ? "" : "sin-ssr"}" title="Cada carta sin SSR suma; a la ${G.PIEDAD}.ª, SSR segura. Cada pozo lleva la suya.">
        ${conSSR ? `<span>SSR segura en <b>${faltan}</b> ${faltan === 1 ? "invocación" : "invocaciones"}</span>
          <span class="piedad-barra"><i style="width:${Math.min(piedad, G.PIEDAD - 1) / (G.PIEDAD - 1) * 100}%"></i></span>` : `<span>Este set no tiene SSR</span>`}
      </div>
      <button class="btn diaria ${diariaHecha ? "hecha" : ""}" data-diaria ${diariaHecha || girando ? "disabled" : ""}>
        <i>日</i><span><b>${diariaHecha ? "Tirada del día hecha" : "Tirada del día"}</b>
        <small>${diariaHecha ? `Vuelve en ${hastaManana()}` : premioRacha ? `Día ${rachaSig} seguido: SR o más segura` : "Gratis, con más suerte de SR y SSR"}</small></span>
        <em title="Días seguidos con tirada del día (cada ${G.RACHA_PREMIO}, SR o más segura)">${racha ? `🔥 ${racha}` : ""}</em>
      </button>
      ${banner ? "" : `<h2 class="p-tit"><span>Tasas</span><i>確率</i></h2>
      <ul class="tasas">${G.RAREZAS.map((r) => `<li class="r-${r.id}"><b>${r.nombre}</b><span>${"★".repeat(r.estrellas)}</span>
        <small>${r.desc}</small><em>${r.tasa}%</em></li>`).join("")}</ul>`}
      ${historial.length ? `<h2 class="p-tit"><span>Últimas</span><i>履歴</i></h2>
        <ol class="historial">${historial.slice(0, 10).map((c) => `<li class="r-${c.rareza}"><button data-hist="${c.media_id}">${esc(tituloApi(c.media))}</button>${c.nueva ? `<em>NUEVA</em>` : ""}<b>${G.RAREZA[c.rareza].nombre}</b></li>`).join("")}</ol>` : ""}
    </aside>
  </div>`;
}

const ORDEN_R = { ssr: 0, sr: 1, r: 2, n: 3 };
const mejorDe = (cartas) => [...cartas].sort((a, b) => ORDEN_R[a.rareza] - ORDEN_R[b.rareza])[0];

// Una carta enfocada: grande, con lo que hace falta para decidir si verla
function revela(c, rev) {
  const m = c.media, e = enArchivo(c.media_id);
  const estado = e ? { visto: "Vista", revisto: "Revista", viendo: "Viéndola", pendiente: "En pendientes", abandonado: "Abandonada" }[e.estado] : null;
  const etiquetas = [
    c.nueva ? `<span class="gc-etq nueva">NUEVA</span>` : `<span class="gc-etq repe">Repetida · +1 欠片</span>`,
    c.brillante ? `<span class="gc-etq brilla">✦ Brillante</span>` : "",
    terminado(e) ? `<span class="gc-etq desp">覚醒 Despertada</span>` : !e ? `<span class="gc-etq descubre">Sin ver</span>` : "",
    rev.diaria ? `<span class="gc-etq dia">日 Carta del día</span>` : "",
  ].join("");
  const generos = (m.genres || []).map(genero).join(" · ");
  return `<div class="gc-revela">
    ${rev.cartas.length > 1 ? `<button class="btn gc-volver" data-rejilla>◀ Las ${rev.cartas.length} cartas</button>` : ""}
    <div class="gc-carta">${carta({ ...c, mediaId: c.media_id })}</div>
    <div class="gc-info">
      <div class="gc-etqs">${etiquetas}</div>
      <h3>${esc(tituloApi(m))}</h3>
      <p class="gc-meta">${esc([formato(m), m.seasonYear, m.studio, generos].filter(Boolean).join(" · "))}</p>
      <p class="gc-sinopsis" id="gc-sinopsis" data-id="${m.id}"><span class="tenue">Leyendo la sinopsis…</span></p>
      <div class="cg-acc">
        ${e ? `<span class="gc-ya">En tu archivo · ${esc(estado)}</span><button class="btn" data-ficha-uid="${esc(e.uid)}">Ficha</button>`
          : `<button class="btn primario" data-pendiente="${m.id}">＋ A pendientes</button><button class="btn" data-previa="${m.id}">Ficha</button>`}
      </div>
    </div>
  </div>`;
}

// Las diez del ×10, que aparecen de una en una
function rejilla(rev) {
  return `<div class="gc-rejilla">
    ${rev.cartas.map((c, k) => `<button class="gc-hueco ${c.nueva ? "nueva" : ""}" style="--k:${k}" data-enfoca="${k}" title="${esc(tituloApi(c.media))}">
      ${carta({ ...c, mediaId: c.media_id }, { mini: true, k })}${c.nueva ? `<span class="gc-etq nueva">NUEVA</span>` : ""}</button>`).join("")}
    <p class="gc-rejilla-pie">${plural(rev.cartas.filter((c) => c.nueva).length, "nueva", "nuevas")} · pulsa una carta para verla</p>
  </div>`;
}

// La sinopsis llega aparte (la ficha completa, que se guarda 3 días)
function rellenaSinopsis(raiz) {
  const p = raiz.querySelector("#gc-sinopsis");
  if (!p) return;
  const id = +p.dataset.id;
  detalle(id).then((d) => {
    if (!p.isConnected || +p.dataset.id !== id) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = (d?.description || "").replace(/<br\s*\/?>/gi, " ");
    const texto = tmp.textContent.replace(/\s+/g, " ").trim();
    p.textContent = texto ? (texto.length > 320 ? texto.slice(0, 320).replace(/\s+\S*$/, "") + "…" : texto) : "Sin sinopsis en AniList.";
  }).catch(() => { if (p.isConnected) p.textContent = "No se pudo leer la sinopsis."; });
}

async function invoca(n, { diaria = false } = {}) {
  if (girando) return;
  const col = coleccionPropia(), est = col.gacha || {}, pozo = pref.pozo, banner = bannerActual(pozo);
  if (!diaria && G.tickets(ctx.stats, est).quedan < n) return aviso("No tienes tickets suficientes.");
  if (diaria && est.diaria === hoyClave()) return;
  const rachaSig = est.diaria === ayerClave() ? (est.racha || 0) + 1 : 1;
  girando = true;
  const raiz = ctx.raiz, altar = raiz.querySelector("#altar");
  raiz.querySelectorAll("[data-invoca], [data-diaria]").forEach((b) => (b.disabled = true));
  const t0 = Date.now(), anima = !reducido();
  if (anima) { altar.className = "altar invocando"; raiz.querySelector("#revelada").innerHTML = ""; }
  try {
    const cartas = await G.tira(pozo, n, { banner, piedad: est[`piedad_${pozo}`] || 0, diaria,
      rachaPremio: diaria && rachaSig % G.RACHA_PREMIO === 0, tengo: new Set(col.cartas.map((c) => c.mediaId)) });
    const res = await invocaNube(pozo, cartas, diaria ? hoyClave() : null);
    if (anima) {
      altar.classList.add("r-" + mejorDe(res.cartas).rareza);
      await espera(Math.max(0, 1500 - (Date.now() - t0)));
      altar.classList.add("destello");
      await espera(400);
    }
    revelado = { pozo, cartas: res.cartas, i: res.cartas.length === 1 ? 0 : null, diaria };
    historial.unshift(...res.cartas);
    historial = historial.slice(0, 30);
    girando = false;
    aplicaGacha(res);   // repinta la vista
    if (diaria && res.gacha.racha > 1) aviso(`Tirada del día: llevas ${res.gacha.racha} días seguidos 🔥`);
    const ssr = res.cartas.filter((c) => c.rareza === "ssr" && c.nueva).length;
    if (ssr) aviso(`¡${ssr > 1 ? ssr + " SSR nuevas" : "SSR nueva"}!`, { tipo: "logro" });
    compruebaSets(pozo);
  } catch (err) {
    girando = false;
    aviso("No se pudo invocar: " + err.message);
    pinta(raiz, { ...ctx, propio: true });
  }
}

// ── Álbum ────────────────────────────────────────────────────────────────
function album(pozo, dePozo, col, propio) {
  const tengo = new Map(dePozo.map((c) => [c.mediaId, c]));
  const premios = col.gacha?.premios || [];
  const porR = Object.fromEntries(G.RAREZAS.map((r) => [r.id, dePozo.filter((c) => c.rareza === r.id).length]));
  const desp = dePozo.filter((c) => terminado(enArchivo(c.mediaId))).length;
  const brillan = dePozo.filter((c) => c.brillante).length;
  const sinVer = dePozo.filter((c) => !enArchivo(c.mediaId)).length;
  let lista = dePozo.filter((c) => (!filtro.rar || c.rareza === filtro.rar)
    && (filtro.ver !== "desp" || terminado(enArchivo(c.mediaId)))
    && (filtro.ver !== "nuevo" || !enArchivo(c.mediaId))
    && (filtro.ver !== "brilla" || c.brillante));
  const orden = { numero: (a, b) => a.numero - b.numero, rareza: (a, b) => ORDEN_R[a.rareza] - ORDEN_R[b.rareza] || a.numero - b.numero,
    reciente: (a, b) => b.numero - a.numero, nota: (a, b) => (b.media.averageScore || 0) - (a.media.averageScore || 0) };
  lista = [...lista].sort(orden[filtro.orden] || orden.numero);
  const sets = G.SETS[pozo];
  const abierto = sets.find((s) => s.id === setAbierto);
  const chip = (k, v, txt) => `<button class="chip ${filtro[k] === v ? "on" : ""}" data-f="${k}" data-v="${v}">${txt}</button>`;
  return `<div class="album">
    <section class="panel esquinas album-cifras">
      <div><b>${dePozo.length}</b><small>cartas</small></div>
      ${G.RAREZAS.map((r) => `<div class="r-${r.id}"><b>${porR[r.id]}</b><small>${r.nombre}</small></div>`).join("")}
      <div class="desp"><b>${desp}</b><small>despertadas</small></div>
      <div><b>${sinVer}</b><small>sin ver</small></div>
      <div class="brilla"><b>${brillan}</b><small>brillantes</small></div>
    </section>

    <section class="panel esquinas album-sets">
      <h2 class="p-tit"><span>Sets</span><i>揃</i><small>${G.TICKETS_SET} tickets por set completo</small></h2>
      <div class="sets">${sets.map((s) => {
        const l = G.miembrosGuardados(s), n = l ? l.filter((m) => tengo.has(m.id)).length : null;
        const hecho = premios.includes(s.id);
        return `<button class="set ${hecho ? "hecho" : ""} ${s === abierto ? "on" : ""}" data-set="${s.id}" title="${esc(s.desc)}">
          <i>${s.jp}</i><b>${esc(s.nombre)}</b>
          <small>${l ? `${n}/${l.length}` : "…"}${hecho ? " ✓" : ""}</small>
          <span class="set-barra"><span style="width:${l ? n / l.length * 100 : 0}%"></span></span></button>`;
      }).join("")}</div>
      ${abierto ? miembrosSet(abierto, tengo) : ""}
    </section>

    <div class="album-filtros">
      <div class="chips">${chip("rar", "", "Todas")}${G.RAREZAS.map((r) => chip("rar", r.id, r.nombre)).join("")}</div>
      <div class="chips">${chip("ver", "", "Todo")}${chip("ver", "nuevo", "Sin ver")}${chip("ver", "desp", "覚醒 Despertadas")}${chip("ver", "brilla", "✦ Brillantes")}</div>
      <label class="album-orden">Orden <select data-orden>
        ${[["numero", "Número"], ["rareza", "Rareza"], ["reciente", "Recientes"], ["nota", "Nota de AniList"]].map(([v, t]) => `<option value="${v}" ${filtro.orden === v ? "selected" : ""}>${t}</option>`).join("")}
      </select></label>
    </div>
    ${lista.length ? `<div class="album-rejilla">${lista.map((c) => `<button class="album-hueco" data-abre="${c.mediaId}">${carta(c, { mini: true })}</button>`).join("")}</div>`
      : `<div class="vacio"><div class="vacio-jp">空</div><p>${dePozo.length ? "Ninguna carta con estos filtros." : propio ? `Aún no tienes cartas de ${G.POZOS[pozo].nombre.toLowerCase()}.` : "Sin cartas de este pozo."}</p>
        ${propio && !dePozo.length ? `<button class="btn primario" data-modo="invocar">Ir a invocar</button>` : ""}</div>`}
  </div>`;
}

// Las cartas de un set: las tuyas y, de las que faltan, solo la silueta y la rareza
function miembrosSet(s, tengo) {
  const l = G.miembrosGuardados(s);
  if (!l) return `<div class="cargando"><span></span>Cargando el set…</div>`;
  return `<div class="set-miembros">${l.map((m, k) => {
    const c = tengo.get(m.id);
    return c ? `<button class="album-hueco" data-abre="${m.id}">${carta(c, { mini: true })}</button>`
      : `<div class="kc-falta r-${G.rarezaDe(m.averageScore).id}" title="Te falta"><span>？</span><small>${k + 1}/${l.length}</small><b>${G.rarezaDe(m.averageScore).nombre}</b></div>`;
  }).join("")}</div>`;
}

// Los sets del álbum se piden la primera vez que se abre (una o dos
// peticiones por pozo; luego 7 días en la caché)
function cargaSets(pozo, propio) {
  if (setsCargados.has(pozo)) return;
  setsCargados.add(pozo);
  G.miembros(G.SETS[pozo]).then(() => {
    if (ctx?.raiz.isConnected && ctx.raiz.dataset.vista === "gacha") pinta(ctx.raiz, { ...ctx, propio: esPropio() });
    if (propio) compruebaSets(pozo);
  }).catch(() => { setsCargados.delete(pozo); });
}

// Set completo y sin cobrar → 3 tickets (una vez por set)
async function compruebaSets(pozo) {
  if (!esPropio()) return;
  const col = coleccionPropia(), tengo = new Set(col.cartas.map((c) => c.mediaId)), premios = col.gacha?.premios || [];
  for (const s of G.SETS[pozo]) {
    const l = G.miembrosGuardados(s);
    if (!l?.length || premios.includes(s.id) || premiando.has(s.id) || !l.every((m) => tengo.has(m.id))) continue;
    premiando.add(s.id);
    try {
      const est = await premia(s.id);
      aplicaGacha({ gacha: est });
      aviso(`Set completo: ${s.nombre}. +${G.TICKETS_SET} tickets`, { tipo: "logro" });
    } catch (err) { aviso("No se pudo cobrar el set: " + err.message); }
    finally { premiando.delete(s.id); }
  }
}

// ── Eventos ──────────────────────────────────────────────────────────────
function conecta(raiz, propio) {
  const repinta = () => { raiz.classList.remove("anima"); pinta(raiz, { ...ctx, propio }); };
  raiz.querySelectorAll("[data-modo]").forEach((b) => b.addEventListener("click", () => { pref.modo = b.dataset.modo; guardaPref(); repinta(); }));
  raiz.querySelectorAll("[data-pozo]").forEach((b) => b.addEventListener("click", () => { pref.pozo = b.dataset.pozo; setAbierto = null; guardaPref(); repinta(); }));
  raiz.querySelectorAll("[data-banner]").forEach((b) => b.addEventListener("click", () => {
    pref.banner[pref.pozo] = b.dataset.banner; guardaPref(); repinta();
    const s = bannerActual(pref.pozo);
    if (s && !G.miembrosGuardados(s)) G.miembros([s]).then(repinta).catch(() => {});
  }));
  raiz.querySelectorAll("[data-invoca]").forEach((b) => b.addEventListener("click", () => invoca(+b.dataset.invoca)));
  raiz.querySelector("[data-diaria]")?.addEventListener("click", () => invoca(1, { diaria: true }));
  raiz.querySelector("[data-canjea]")?.addEventListener("click", async (ev) => {
    const n = Math.floor((coleccionPropia().gacha?.fragmentos || 0) / G.FRAG_TICKET);
    ev.currentTarget.disabled = true;
    try { aplicaGacha({ gacha: await canjea(n) }); aviso(`${plural(n * G.FRAG_TICKET, "fragmento", "fragmentos")} → ${plural(n, "ticket", "tickets")}`); }
    catch (err) { aviso(err.message); repinta(); }
  });
  raiz.querySelectorAll("[data-enfoca]").forEach((b) => b.addEventListener("click", () => { revelado.i = +b.dataset.enfoca; repinta(); }));
  raiz.querySelector("[data-rejilla]")?.addEventListener("click", () => { revelado.i = null; repinta(); });
  raiz.querySelectorAll("[data-hist]").forEach((b) => b.addEventListener("click", () => {
    const c = historial.find((x) => x.media_id === +b.dataset.hist);
    if (c) { revelado = { pozo: c.pozo, cartas: [c], i: 0 }; pref.pozo = c.pozo; repinta(); }
  }));
  raiz.querySelector("[data-ficha-uid]")?.addEventListener("click", (ev) => ctx.abreFicha(ev.currentTarget.dataset.fichaUid));
  raiz.querySelector("[data-previa]")?.addEventListener("click", (ev) => {
    const c = revelado?.cartas.find((x) => x.media_id === +ev.currentTarget.dataset.previa);
    if (c) abrePrevia(c.media);
  });
  raiz.querySelector("[data-pendiente]")?.addEventListener("click", async (ev) => {
    const id = +ev.currentTarget.dataset.pendiente, b = ev.currentTarget;
    if (porMedia(id)) return repinta();
    b.disabled = true;
    try {
      // La ficha completa (la de la carta es reducida)
      const [m] = await refrescar([id]);
      if (!m) throw new Error("AniList no lo encuentra");
      if (porMedia(id)) return repinta();
      const e = anade({ mediaId: m.id, media: m, titulo: tituloApi(m), tipo: tipoDe(m), estado: "pendiente" });
      aviso(`«${e.titulo}» a pendientes.`);
    } catch (err) { aviso("No se pudo añadir: " + err.message); b.disabled = false; }
  });
  // Álbum
  raiz.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => { filtro[b.dataset.f] = b.dataset.v; repinta(); }));
  raiz.querySelector("[data-orden]")?.addEventListener("change", (ev) => { filtro.orden = ev.target.value; repinta(); });
  raiz.querySelectorAll("[data-set]").forEach((b) => b.addEventListener("click", () => { setAbierto = setAbierto === b.dataset.set ? null : b.dataset.set; repinta(); }));
  raiz.querySelectorAll("[data-abre]").forEach((b) => b.addEventListener("click", () => {
    const id = +b.dataset.abre, e = enArchivo(id);
    if (e) return ctx.abreFicha(e.uid);
    const c = (esPropio() ? coleccionPropia() : coleccionSujeto()).cartas.find((x) => x.mediaId === id);
    if (c) abrePrevia(c.media);
  }));
}
