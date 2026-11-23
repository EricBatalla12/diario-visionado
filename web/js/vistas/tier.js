// 03 · TIER — la tier list sale sola de tus notas. Se puede acotar por año y
// por tipo, y ver por sagas (cada saga, una sola portada con la nota media de
// sus temporadas puntuadas); pulsar una portada abre su ficha.
import { esc, cartel, RANGOS, fmtNota, TIPOS } from "../ui.js";
import { entradas } from "../almacen.js";

const NOMBRES = { "EX": "Obra maestra", "S+": "Leyenda", "S": "Brutal", "A": "Muy bueno", "B": "Bueno", "C": "Cumple", "D": "Flojo", "F": "Basura" };
let anio = "todos", tipo = "todos";
const CLAVE_SAGAS = "kiroku:tier-sagas";
let porSagas = false;
try { porSagas = localStorage.getItem(CLAVE_SAGAS) === "1"; } catch {}

// Junta las temporadas puntuadas de cada saga: nota media, portada y ficha
// de la última temporada. Una saga con una sola temporada puntuada se queda
// como está.
function agrupaSagas(lista) {
  const grupos = new Map(), out = [];
  for (const e of lista) {
    const id = e.media?.saga?.id;
    if (!id) { out.push(e); continue; }
    if (!grupos.has(id)) grupos.set(id, []);
    grupos.get(id).push(e);
  }
  for (const ms of grupos.values()) {
    if (ms.length < 2) { out.push(ms[0]); continue; }
    const ultima = ms.reduce((a, b) => (b.media.saga.n > a.media.saga.n ? b : a));
    const nota = Math.round(ms.reduce((a, e) => a + e.nota, 0) / ms.length * 10) / 10;
    out.push({ ...ultima, nota, titulo: ultima.media.saga.t || ultima.titulo, temporadas: ms.length });
  }
  return out;
}

export function pinta(raiz, { abreFicha }) {
  const todas = entradas().filter((e) => e.nota != null);
  const anios = [...new Set(todas.map((e) => e.anio).filter(Boolean))].sort((a, b) => b - a);
  const filtradas = todas.filter((e) => (anio === "todos" || String(e.anio) === anio) && (tipo === "todos" || e.tipo === tipo));
  const lista = (porSagas ? agrupaSagas(filtradas) : filtradas).sort((a, b) => b.nota - a.nota);

  raiz.innerHTML = `
  <header class="vista-cab">
    <h1 class="vista-tit"><span>Tier list</span><i>格付け</i></h1>
    <div class="chips">
      ${["todos", ...anios.map(String)].map((a) => `<button class="chip ${anio === a ? "on" : ""}" data-a="${a}">${a === "todos" ? "Siempre" : a}</button>`).join("")}
      <span class="sep"></span>
      ${["todos", ...Object.keys(TIPOS)].map((t) => `<button class="chip ${tipo === t ? "on" : ""}" data-t="${t}">${t === "todos" ? "Todo" : TIPOS[t].nombre}</button>`).join("")}
      <span class="sep"></span>
      <button class="chip chip-sagas ${porSagas ? "on" : ""}" data-sagas aria-pressed="${porSagas}" title="Una portada por saga, con la nota media de sus temporadas">⧉ Sagas</button>
    </div>
  </header>
  <section class="tiers">
    ${RANGOS.map((r, i) => {
      const hasta = i ? RANGOS[i - 1].min : 99;
      const items = lista.filter((e) => e.nota >= r.min && e.nota < hasta);
      return `<div class="tier ${r.clase}">
        <div class="tier-et"><b>${r.r}</b><small>${NOMBRES[r.r]}</small><em>${items.length}</em></div>
        <div class="tier-items">${items.map((e) => `<button class="tier-c holo ${e.temporadas ? "tier-saga" : ""}" data-uid="${esc(e.uid)}"
          title="${esc(e.titulo)} · ${fmtNota(e.nota)}${e.temporadas ? ` · media de ${e.temporadas} temporadas` : ""}">
          ${cartel(e)}${e.temporadas ? `<b class="tier-n">×${e.temporadas}</b>` : ""}<span>${fmtNota(e.nota)}</span></button>`).join("") || `<span class="tier-vacio">—</span>`}</div>
      </div>`;
    }).join("")}
  </section>`;

  raiz.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", () => { anio = b.dataset.a; pinta(raiz, { abreFicha }); }));
  raiz.querySelectorAll("[data-t]").forEach((b) => b.addEventListener("click", () => { tipo = b.dataset.t; pinta(raiz, { abreFicha }); }));
  raiz.querySelector("[data-sagas]").addEventListener("click", () => {
    porSagas = !porSagas;
    try { localStorage.setItem(CLAVE_SAGAS, porSagas ? "1" : "0"); } catch {}
    pinta(raiz, { abreFicha });
  });
  raiz.querySelectorAll("[data-uid]").forEach((b) => b.addEventListener("click", () => abreFicha(b.dataset.uid)));
}
