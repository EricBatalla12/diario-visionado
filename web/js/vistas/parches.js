// NOVEDADES 更新 — las notas de cada parche de KIROKU, del último al primero.
// No va en la barra de pestañas: se abre desde el menú ⋮ o desde el aviso de
// parche nuevo. Abrirla marca el último parche como visto.
//
// Se ven los POR_TANDA últimos; "Cargar más" añade otra tanda debajo sin
// repintar lo de arriba (así no se pierde por dónde ibas).
import { esc } from "../ui.js";
import { PARCHES, marcaVisto } from "../parches.js";

const POR_TANDA = 5;
let visibles = POR_TANDA;

// Escapa el texto y convierte **así** en negrita
const texto = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

const parche = (p, i) => `
    <article class="parche panel esquinas ${i === 0 ? "ultimo" : ""}">
      <header class="pc-cab">
        <span class="pc-jp" aria-hidden="true">${esc(p.jp)}</span>
        <div><small>${esc(p.fecha)}${i === 0 ? ` · <em>último</em>` : ""}</small><h2>${esc(p.titulo)}</h2></div>
      </header>
      ${p.secciones.map((s) => `<section class="pc-sec">
        <h3><i aria-hidden="true">${esc(s.ico)}</i>${esc(s.titulo)}</h3>
        <ul>${s.items.map((t) => `<li>${texto(t)}</li>`).join("")}</ul>
      </section>`).join("")}
    </article>`;

const boton = () => {
  const quedan = PARCHES.length - visibles;
  return quedan > 0 ? `<div class="cargar-mas"><button class="btn" data-mas>Cargar más <small>(${quedan} ${quedan === 1 ? "anterior" : "anteriores"})</small></button></div>` : "";
};

export function pinta(raiz) {
  marcaVisto();
  // Al entrar en la vista se empieza otra vez por los últimos; un repintado
  // estando dentro (p. ej. un cambio guardado) respeta lo ya cargado
  if (raiz.classList.contains("anima")) visibles = POR_TANDA;
  raiz.innerHTML = `
  <header class="vista-cab">
    <h1 class="vista-tit"><span>Novedades</span><i>更新</i></h1>
    <p class="vista-sub">Lo que cambia en KIROKU, parche a parche.</p>
  </header>
  <div class="parches">${PARCHES.slice(0, visibles).map(parche).join("")}</div>
  <div id="pc-mas">${boton()}</div>`;
  conecta(raiz);
}

function conecta(raiz) {
  raiz.querySelector("[data-mas]")?.addEventListener("click", () => {
    const desde = visibles;
    visibles = Math.min(PARCHES.length, visibles + POR_TANDA);
    raiz.querySelector(".parches").insertAdjacentHTML("beforeend", PARCHES.slice(desde, visibles).map((p, k) => parche(p, desde + k)).join(""));
    raiz.querySelector("#pc-mas").innerHTML = boton();
    conecta(raiz);
  });
}
