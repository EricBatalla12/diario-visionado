// 05 · GACHA — ¿qué veo ahora? Invoca un pendiente al azar. La rareza sale de
// la nota media de AniList: cuanto mejor valorado, más brilla al salir.
//
// Además, como en los gacha de verdad:
// - Banners temáticos que rotan cada semana (algo corto, una peli, manga…),
//   cada uno con su parte del pozo. «Pozo completo» siempre está.
// - Piedad: a la décima invocación sin SSR, la siguiente es SSR seguro.
// - Tirada del día: una gratis cada día, con más suerte, y una racha de días.
// Piedad y racha se guardan en este navegador (por usuario), no en la nube.
import { esc, cartel, tinte, reducido, aviso, formato, infoTipo, totalDe } from "../ui.js";
import { entradas, actualiza, yoMismo } from "../almacen.js";

const RAREZAS = [
  { id: "ssr", nombre: "SSR", estrellas: 5, min: 85, desc: "≥ 8,5 en AniList" },
  { id: "sr",  nombre: "SR",  estrellas: 4, min: 78, desc: "7,8 – 8,4" },
  { id: "r",   nombre: "R",   estrellas: 3, min: 70, desc: "7,0 – 7,7" },
  { id: "n",   nombre: "N",   estrellas: 2, min: -1, desc: "< 7 o sin nota" },
];
const rareza = (e) => RAREZAS.find((r) => (e.media?.averageScore ?? -1) >= r.min);
const PIEDAD = 10;                                  // a la décima sin SSR, SSR seguro
const PESO_DIARIA = { ssr: 4, sr: 2, r: 1, n: 1 };  // la del día tiene más suerte

// ── Banners ──────────────────────────────────────────────────────────────
const anio = () => new Date().getFullYear();
const BANNERS = [
  { id: "corto",   nombre: "Algo corto",          jp: "短編", desc: "13 episodios o menos", f: (e) => e.tipo !== "manga" && (e.tipo === "peli" || (totalDe(e) || 99) <= 13) },
  { id: "peli",    nombre: "Noche de peli",       jp: "映画", desc: "Solo películas", f: (e) => e.tipo === "peli" || e.media?.format === "MOVIE" },
  { id: "manga",   nombre: "Para leer",           jp: "読書", desc: "Manga, manhwa y manhua", f: (e) => e.tipo === "manga" },
  { id: "olvido",  nombre: "Joyas olvidadas",     jp: "埋蔵", desc: "Pendientes desde hace más de medio año", f: (e) => e.creado && Date.now() - e.creado > 182 * 864e5 },
  { id: "top",     nombre: "Lo mejor valorado",   jp: "名作", desc: "8 o más en AniList", f: (e) => (e.media?.averageScore || 0) >= 80 },
  { id: "accion",  nombre: "Acción a tope",       jp: "激闘", desc: "Acción", f: (e) => e.media?.genres?.includes("Action") },
  { id: "risa",    nombre: "Para reír",           jp: "爆笑", desc: "Comedia", f: (e) => e.media?.genres?.includes("Comedy") },
  { id: "amor",    nombre: "Corazón",             jp: "恋愛", desc: "Romance", f: (e) => e.media?.genres?.includes("Romance") },
  { id: "nuevo",   nombre: "Recién salidos",      jp: "新作", desc: "Estrenados este año o el pasado", f: (e) => (e.media?.seasonYear || 0) >= anio() - 1 },
  { id: "clasico", nombre: "Clásicos",            jp: "古典", desc: "Estrenados antes de 2010", f: (e) => e.media?.seasonYear && e.media.seasonYear < 2010 },
];
const COMPLETO = { id: "todo", nombre: "Pozo completo", jp: "全部", desc: "Todos tus pendientes", f: () => true };
// Semana que empieza en lunes, contada desde el lunes 1-1-2024
const semana = () => { const h = new Date(); h.setHours(0, 0, 0, 0); return Math.floor((h - new Date(2024, 0, 1)) / (7 * 864e5)); };
const diasACambio = () => { const d = new Date().getDay(); return d === 1 ? 7 : (8 - d) % 7 || 7; };
// Los dos de esta semana (de los que tienen al menos 2 pendientes), más el completo
function bannersDeLaSemana(pendientes) {
  const con = BANNERS.filter((b) => pendientes.filter(b.f).length >= 2);
  if (!con.length) return [COMPLETO];
  const i = (semana() * 2) % con.length;
  const elegidos = [con[i], con[(i + 1) % con.length]].filter((b, k, l) => l.indexOf(b) === k);
  return [COMPLETO, ...elegidos];
}

// ── Lo que se recuerda: piedad, tirada del día y racha ───────────────────
const hoyClave = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ayerClave = () => { const d = new Date(); d.setDate(d.getDate() - 1); return hoyClave(d); };
const claveEstado = () => `kiroku:gacha:${yoMismo()?.id || "anon"}`;
function leeEstado() {
  try { return { piedad: 0, diaria: null, racha: 0, diariaUid: null, ...JSON.parse(localStorage.getItem(claveEstado()) || "{}") }; }
  catch { return { piedad: 0, diaria: null, racha: 0, diariaUid: null }; }
}
const guardaEstado = (st) => { try { localStorage.setItem(claveEstado(), JSON.stringify(st)); } catch {} };
// La racha se rompe si ayer no hubo tirada del día
const rachaViva = (st) => st.diaria === hoyClave() || st.diaria === ayerClave() ? st.racha : 0;
const hastaManana = () => { const m = new Date(); m.setHours(24, 0, 0, 0); const min = Math.ceil((m - Date.now()) / 60000); return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`; };

let bannerSel = "todo";
let historial = [];
let ultimo = null;
let girando = false;

export function pinta(raiz, { abreFicha }) {
  const pendientes = entradas().filter((e) => e.estado === "pendiente");
  const banners = bannersDeLaSemana(pendientes);
  const banner = banners.find((b) => b.id === bannerSel) || banners[0];
  bannerSel = banner.id;
  const pool = pendientes.filter(banner.f);
  const porR = Object.fromEntries(RAREZAS.map((r) => [r.id, pool.filter((e) => rareza(e) === r).length]));
  const st = leeEstado(), racha = rachaViva(st), diariaHecha = st.diaria === hoyClave();
  const faltan = PIEDAD - st.piedad;

  raiz.innerHTML = `
  <header class="vista-cab">
    <h1 class="vista-tit"><span>Invocación</span><i>召喚</i></h1>
    <p class="vista-sub">Un pendiente al azar. Sin cristales, sin tasas abusivas, sin arrepentimiento.</p>
  </header>
  <div class="gacha">
    <section class="altar ${ultimo ? "con-carta r-" + rareza(ultimo).id : ""}" id="altar">
      <div class="portal" aria-hidden="true">
        <div class="pt-anillo a1"></div><div class="pt-anillo a2"></div><div class="pt-anillo a3"></div>
        <svg class="pt-runas" viewBox="0 0 200 200"><defs><path id="circ" d="M100,100 m-82,0 a82,82 0 1,1 164,0 a82,82 0 1,1 -164,0"/></defs>
          <text><textPath href="#circ">記録召喚 · KIROKU · 視聴の門 · 未視聴の扉を開け · 記録召喚 · KIROKU · 視聴の門 ·</textPath></text></svg>
        <div class="pt-nucleo"></div>
      </div>
      <div class="rayos" aria-hidden="true"></div>
      <div id="revelada">${ultimo ? revelada(ultimo) : ""}</div>
    </section>

    <aside class="panel esquinas gacha-lado">
      <div class="banners" role="tablist" aria-label="Banner">
        ${banners.map((b) => `<button role="tab" class="banner ${b.id === banner.id ? "on" : ""}" aria-selected="${b.id === banner.id}" data-banner="${b.id}" title="${esc(b.desc)}">
          <i>${b.jp}</i><b>${esc(b.nombre)}</b><small>${pendientes.filter(b.f).length}</small></button>`).join("")}
      </div>
      <p class="banner-pie">${esc(banner.desc)}${banners.length > 1 ? ` · los temáticos cambian en ${diasACambio()} ${diasACambio() === 1 ? "día" : "días"}` : ""}</p>
      <button class="btn-invocar" id="invocar" ${pool.length ? "" : "disabled"}>
        <span class="bi-jp">召喚</span><span class="bi-t">Invocar ×1</span><small>${pool.length} en el pozo</small>
      </button>
      <div class="piedad ${porR.ssr ? "" : "sin-ssr"}" title="Cada invocación sin SSR suma; a la décima, SSR seguro">
        ${porR.ssr ? `<span>SSR garantizado en <b>${faltan}</b> ${faltan === 1 ? "invocación" : "invocaciones"}</span>
          <span class="piedad-barra"><i style="width:${st.piedad / PIEDAD * 100}%"></i></span>` : `<span>Este pozo no tiene SSR</span>`}
      </div>
      <button class="btn diaria ${diariaHecha ? "hecha" : ""}" id="diaria" ${diariaHecha || !pendientes.length ? "disabled" : ""}>
        <i>日</i><span><b>${diariaHecha ? "Tirada del día hecha" : "Tirada del día"}</b>
        <small>${diariaHecha ? `Vuelve en ${hastaManana()}` : "Gratis, con más suerte de SR y SSR"}</small></span>
        <em title="Días seguidos con tirada del día">${racha ? `🔥 ${racha}` : ""}</em>
      </button>
      <h2 class="p-tit"><span>Tasas del pozo</span><i>確率</i></h2>
      <ul class="tasas">${RAREZAS.map((r) => `<li class="r-${r.id}"><b>${r.nombre}</b><span>${"★".repeat(r.estrellas)}</span>
        <small>${r.desc}</small><em>${pool.length ? Math.round(porR[r.id] / pool.length * 100) : 0}%</em></li>`).join("")}</ul>
      ${historial.length ? `<h2 class="p-tit"><span>Últimas</span><i>履歴</i></h2>
        <ol class="historial">${historial.slice(0, 8).map((e) => `<li class="r-${rareza(e).id}"><button data-uid="${esc(e.uid)}">${esc(e.titulo)}</button><b>${rareza(e).nombre}</b></li>`).join("")}</ol>` : ""}
      ${pool.length ? "" : `<p class="tenue">No tienes pendientes. Añade algo desde Temporada o con <kbd>/</kbd>.</p>`}
    </aside>
  </div>`;

  raiz.querySelector("#invocar").addEventListener("click", () => invoca(raiz, pool, abreFicha));
  raiz.querySelector("#diaria").addEventListener("click", () => invoca(raiz, pendientes, abreFicha, { diaria: true }));
  raiz.querySelectorAll("[data-banner]").forEach((b) => b.addEventListener("click", () => { bannerSel = b.dataset.banner; raiz.classList.remove("anima"); pinta(raiz, { abreFicha }); }));
  raiz.querySelectorAll(".historial [data-uid]").forEach((b) => b.addEventListener("click", () => abreFicha(b.dataset.uid)));
  conecta(raiz, abreFicha);
}

function revelada(e) {
  const r = rareza(e);
  const m = e.media;
  const delDia = leeEstado().diariaUid === e.uid && leeEstado().diaria === hoyClave();
  return `<div class="carta-gacha holo r-${r.id}" style="--tinte:${esc(tinte(e))}">
    ${delDia ? `<span class="cg-dia">日 Carta del día</span>` : ""}
    <div class="cg-marco"><div class="carta-img">${cartel(e, { grande: true })}</div><div class="carta-brillo"></div>
      <span class="cg-rar">${r.nombre}</span><span class="cg-est">${"★".repeat(r.estrellas)}</span></div>
    <div class="cg-info"><h3>${esc(e.titulo)}</h3>
      <p>${esc([m ? formato(m) : infoTipo(e.tipo).nombre, m?.episodes ? m.episodes + " ep" : null, m?.averageScore ? "AniList " + (m.averageScore / 10).toFixed(1) : null].filter(Boolean).join(" · "))}</p>
      <div class="cg-acc"><button class="btn primario" data-empieza="${esc(e.uid)}">▶ ${e.tipo === "manga" ? "Empezar a leerlo" : "Empezar a verla"}</button>
      <button class="btn" data-ficha="${esc(e.uid)}">Ficha</button></div></div>
  </div>`;
}

function conecta(raiz, abreFicha) {
  raiz.querySelector("[data-empieza]")?.addEventListener("click", (ev) => {
    // Se vacía antes de guardar: guardar repinta la vista al momento
    ultimo = null;
    const e = actualiza(ev.currentTarget.dataset.empieza, { estado: "viendo", mes: new Date().getMonth() + 1, anio: new Date().getFullYear() });
    aviso(`«${e.titulo}» pasa a Viendo. Que la disfrutes.`);
  });
  raiz.querySelector("[data-ficha]")?.addEventListener("click", (ev) => abreFicha(ev.currentTarget.dataset.ficha));
}

function invoca(raiz, pool, abreFicha, { diaria = false } = {}) {
  if (girando || !pool.length) return;
  const st = leeEstado();
  if (diaria && st.diaria === hoyClave()) return;
  // Evita repetir el último si hay más donde elegir
  let opciones = pool.length > 1 && ultimo ? pool.filter((e) => e.uid !== ultimo.uid) : pool;
  let e;
  if (diaria) {
    // Más suerte: cada carta pesa según su rareza
    const pesos = opciones.map((x) => PESO_DIARIA[rareza(x).id]);
    let t = Math.random() * pesos.reduce((a, b) => a + b, 0);
    e = opciones[pesos.findIndex((p) => (t -= p) < 0)] || opciones[0];
  } else {
    // Piedad: a la décima sin SSR, solo entran las SSR (si este pozo tiene)
    const ssr = opciones.filter((x) => rareza(x).id === "ssr");
    if (st.piedad >= PIEDAD - 1 && ssr.length) opciones = ssr;
    e = opciones[Math.floor(Math.random() * opciones.length)];
  }
  const r = rareza(e);
  if (diaria) {
    st.racha = st.diaria === ayerClave() ? (st.racha || 0) + 1 : 1;
    st.diaria = hoyClave();
    st.diariaUid = e.uid;
  } else {
    st.piedad = r.id === "ssr" ? 0 : Math.min(PIEDAD - 1, (st.piedad || 0) + 1);
  }
  guardaEstado(st);
  const altar = raiz.querySelector("#altar");
  const fin = () => {
    girando = false;
    ultimo = e;
    historial.unshift(e);
    raiz.classList.remove("anima");
    pinta(raiz, { abreFicha });
    if (diaria && st.racha > 1) aviso(`Tirada del día: llevas ${st.racha} días seguidos 🔥`);
  };
  if (reducido()) return fin();
  girando = true;
  altar.className = "altar invocando r-" + r.id;
  raiz.querySelector("#revelada").innerHTML = "";
  setTimeout(() => altar.classList.add("destello"), 1500);
  setTimeout(fin, 1900);
}
