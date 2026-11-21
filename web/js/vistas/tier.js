// 03 · TIER — la tier list sale sola de tus notas. Se puede acotar por año y
// por tipo; pulsar una portada abre su ficha.
import { esc, cartel, RANGOS, fmtNota, TIPOS } from "../ui.js";
import { entradas } from "../almacen.js";

const NOMBRES = { "EX": "Obra maestra", "S+": "Leyenda", "S": "Brutal", "A": "Muy bueno", "B": "Bueno", "C": "Cumple", "D": "Flojo", "F": "Basura" };
let anio = "todos", tipo = "todos";

export function pinta(raiz, { abreFicha }) {
  const todas = entradas().filter((e) => e.nota != null);
  const anios = [...new Set(todas.map((e) => e.anio).filter(Boolean))].sort((a, b) => b - a);
  const lista = todas.filter((e) => (anio === "todos" || String(e.anio) === anio) && (tipo === "todos" || e.tipo === tipo))
    .sort((a, b) => b.nota - a.nota);

  raiz.innerHTML = `
  <header class="vista-cab">
    <h1 class="vista-tit"><span>Tier list</span><i>格付け</i></h1>
    <div class="chips">
      ${["todos", ...anios.map(String)].map((a) => `<button class="chip ${anio === a ? "on" : ""}" data-a="${a}">${a === "todos" ? "Siempre" : a}</button>`).join("")}
      <span class="sep"></span>
      ${["todos", ...Object.keys(TIPOS)].map((t) => `<button class="chip ${tipo === t ? "on" : ""}" data-t="${t}">${t === "todos" ? "Todo" : TIPOS[t].nombre}</button>`).join("")}
    </div>
  </header>
  <section class="tiers">
    ${RANGOS.map((r, i) => {
      const hasta = i ? RANGOS[i - 1].min : 99;
      const items = lista.filter((e) => e.nota >= r.min && e.nota < hasta);
      return `<div class="tier ${r.clase}">
        <div class="tier-et"><b>${r.r}</b><small>${NOMBRES[r.r]}</small><em>${items.length}</em></div>
        <div class="tier-items">${items.map((e) => `<button class="tier-c holo" data-uid="${esc(e.uid)}" title="${esc(e.titulo)} · ${fmtNota(e.nota)}">
          ${cartel(e)}<span>${fmtNota(e.nota)}</span></button>`).join("") || `<span class="tier-vacio">—</span>`}</div>
      </div>`;
    }).join("")}
  </section>`;

  raiz.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", () => { anio = b.dataset.a; pinta(raiz, { abreFicha }); }));
  raiz.querySelectorAll("[data-t]").forEach((b) => b.addEventListener("click", () => { tipo = b.dataset.t; pinta(raiz, { abreFicha }); }));
  raiz.querySelectorAll("[data-uid]").forEach((b) => b.addEventListener("click", () => abreFicha(b.dataset.uid)));
}
