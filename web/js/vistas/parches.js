// NOVEDADES 更新 — las notas de cada parche de KIROKU, del último al primero.
// No va en la barra de pestañas: se abre desde el menú ⋮ o desde el aviso de
// parche nuevo. Abrirla marca el último parche como visto.
import { esc } from "../ui.js";
import { PARCHES, marcaVisto } from "../parches.js";

// Escapa el texto y convierte **así** en negrita
const texto = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

export function pinta(raiz) {
  marcaVisto();
  raiz.innerHTML = `
  <header class="vista-cab">
    <h1 class="vista-tit"><span>Novedades</span><i>更新</i></h1>
    <p class="vista-sub">Lo que cambia en KIROKU, parche a parche.</p>
  </header>
  <div class="parches">${PARCHES.map((p, i) => `
    <article class="parche panel esquinas ${i === 0 ? "ultimo" : ""}">
      <header class="pc-cab">
        <span class="pc-jp" aria-hidden="true">${esc(p.jp)}</span>
        <div><small>${esc(p.fecha)}${i === 0 ? ` · <em>último</em>` : ""}</small><h2>${esc(p.titulo)}</h2></div>
      </header>
      ${p.secciones.map((s) => `<section class="pc-sec">
        <h3><i aria-hidden="true">${esc(s.ico)}</i>${esc(s.titulo)}</h3>
        <ul>${s.items.map((t) => `<li>${texto(t)}</li>`).join("")}</ul>
      </section>`).join("")}
    </article>`).join("")}
  </div>`;
}
