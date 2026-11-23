// 05 · GACHA — ¿qué veo ahora? Invoca un pendiente al azar. La rareza sale de
// la nota media de AniList: cuanto mejor valorado, más brilla al salir.
import { esc, cartel, tinte, reducido, aviso, formato, infoTipo } from "../ui.js";
import { entradas, actualiza } from "../almacen.js";

const RAREZAS = [
  { id: "ssr", nombre: "SSR", estrellas: 5, min: 85, desc: "≥ 8,5 en AniList" },
  { id: "sr",  nombre: "SR",  estrellas: 4, min: 78, desc: "7,8 – 8,4" },
  { id: "r",   nombre: "R",   estrellas: 3, min: 70, desc: "7,0 – 7,7" },
  { id: "n",   nombre: "N",   estrellas: 2, min: -1, desc: "< 7 o sin nota" },
];
const rareza = (e) => RAREZAS.find((r) => (e.media?.averageScore ?? -1) >= r.min);

let historial = [];
let ultimo = null;
let girando = false;

export function pinta(raiz, { abreFicha }) {
  const pool = entradas().filter((e) => e.estado === "pendiente");
  const porR = Object.fromEntries(RAREZAS.map((r) => [r.id, pool.filter((e) => rareza(e) === r).length]));

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
      <button class="btn-invocar" id="invocar" ${pool.length ? "" : "disabled"}>
        <span class="bi-jp">召喚</span><span class="bi-t">Invocar ×1</span><small>${pool.length} en el pozo</small>
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
  raiz.querySelectorAll(".historial [data-uid]").forEach((b) => b.addEventListener("click", () => abreFicha(b.dataset.uid)));
  conecta(raiz, abreFicha);
}

function revelada(e) {
  const r = rareza(e);
  const m = e.media;
  return `<div class="carta-gacha holo r-${r.id}" style="--tinte:${esc(tinte(e))}">
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

function invoca(raiz, pool, abreFicha) {
  if (girando || !pool.length) return;
  // Evita repetir el último si hay más donde elegir
  const opciones = pool.length > 1 && ultimo ? pool.filter((e) => e.uid !== ultimo.uid) : pool;
  const e = opciones[Math.floor(Math.random() * opciones.length)];
  const r = rareza(e);
  const altar = raiz.querySelector("#altar");
  const fin = () => {
    girando = false;
    ultimo = e;
    historial.unshift(e);
    pinta(raiz, { abreFicha });
  };
  if (reducido()) return fin();
  girando = true;
  altar.className = "altar invocando r-" + r.id;
  raiz.querySelector("#revelada").innerHTML = "";
  setTimeout(() => altar.classList.add("destello"), 1500);
  setTimeout(fin, 1900);
}
