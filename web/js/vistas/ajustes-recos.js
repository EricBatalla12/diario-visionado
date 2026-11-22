// Ajustes de recomendaciones (solo en tu propio perfil, junto a Privacidad):
// quién puede recomendarte, cuántas pendientes admites de cada operador y la
// lista "pueden recomendarme", que es aparte de la de privacidad: dejar que
// alguien vea tu archivo no es lo mismo que dejarle escribirte.
import { esc, aviso } from "../ui.js";
import { yoMismo, ponRecos } from "../almacen.js";
import { misPermisosReco, concedeReco, retiraReco, sb } from "../nube.js";

const MODOS = [
  { id: "todos", jp: "全員", nombre: "Cualquiera", desc: "Cualquier operador puede recomendarte" },
  { id: "lista", jp: "名簿", nombre: "Mi lista", desc: "Solo los operadores que añadas" },
  { id: "nadie", jp: "停止", nombre: "Nadie", desc: "No recibes recomendaciones" },
];

let lista = null, operadores = null, cargadoEn = 0, ocupado = false;

async function carga(forzar = false) {
  if (!forzar && lista && Date.now() - cargadoEn < 60000) return;
  const yo = yoMismo();
  const [l, { data, error }] = await Promise.all([
    misPermisosReco(yo.id),
    sb.from("perfiles").select("id, alias, nombre, avatar_url").neq("id", yo.id).order("nombre"),
  ]);
  if (error) throw error;
  lista = l; operadores = data; cargadoEn = Date.now();
}

const avatar = (p) => p.avatar_url
  ? `<img src="${esc(p.avatar_url)}" alt="" referrerpolicy="no-referrer" loading="lazy">`
  : `<span>${esc((p.nombre[0] || "?").toUpperCase())}</span>`;

export async function panel(caja) {
  if (!caja) return;
  pinta(caja);
  if (yoMismo().recibe_recos !== "lista") return;
  try { await carga(); } catch (err) {
    if (caja.isConnected) caja.querySelector(".rc-lista").innerHTML = `<p class="ac-error">▲ No se pudo leer tu lista: ${esc(err.message)}</p>`;
    return;
  }
  if (caja.isConnected) pinta(caja);
}

function pinta(caja) {
  const yo = yoMismo(), modo = yo.recibe_recos || "todos", max = yo.recos_max || 3;
  caja.innerHTML = `<h2 class="p-tit"><span>Recomendaciones</span><i>推薦</i><small>${esc(MODOS.find((m) => m.id === modo).nombre.toLowerCase())}</small></h2>
    <div class="priv-modo rc-modo" role="radiogroup" aria-label="Quién puede recomendarte">
      ${MODOS.map((m) => `<button role="radio" aria-checked="${modo === m.id}" class="${modo === m.id ? "on" : ""}" data-modo="${m.id}">
        <i>${m.jp}</i><b>${m.nombre}</b><small>${m.desc}</small></button>`).join("")}
    </div>
    ${modo !== "nadie" ? `<label class="sel rc-max"><span>Pendientes como máximo de cada operador</span>
      <select data-max>${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}" ${max === i + 1 ? "selected" : ""}>${i + 1}</option>`).join("")}</select></label>` : ""}
    ${modo === "lista" ? `<div class="priv-lista rc-lista">${lista ? listaHtml() : `<div class="cargando"><span></span>Leyendo tu lista…</div>`}</div>` : ""}`;

  caja.querySelectorAll("[data-modo]").forEach((b) => b.addEventListener("click", async () => {
    if (ocupado || b.dataset.modo === modo) return;
    ocupado = true;
    try {
      await ponRecos({ recibe_recos: b.dataset.modo });
      aviso({ todos: "Cualquier operador puede recomendarte.", lista: "Solo te recomienda tu lista.", nadie: "Ya no recibes recomendaciones." }[b.dataset.modo]);
    } catch (err) { aviso("No se pudo cambiar: " + err.message); }
    ocupado = false;
    panel(caja);
  }));
  caja.querySelector("[data-max]")?.addEventListener("change", async (ev) => {
    if (ocupado) return;
    ocupado = true;
    try { await ponRecos({ recos_max: +ev.target.value }); aviso(`Máximo de ${ev.target.value} pendiente${ev.target.value === "1" ? "" : "s"} por operador.`); }
    catch (err) { aviso("No se pudo cambiar: " + err.message); }
    ocupado = false;
    pinta(caja);
  });
  if (modo !== "lista" || !lista) return;
  caja.querySelectorAll("[data-quita]").forEach((b) => b.addEventListener("click", async () => {
    if (ocupado) return;
    ocupado = true; b.disabled = true;
    const p = lista.find((x) => x.id === b.dataset.quita);
    try { await retiraReco(yo.id, p.id); lista = lista.filter((x) => x.id !== p.id); aviso(`${p.nombre} ya no puede recomendarte.`); }
    catch (err) { aviso("No se pudo quitar: " + err.message); }
    ocupado = false;
    pinta(caja);
  }));
  caja.querySelector(".priv-anade")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (ocupado) return;
    const p = operadores.find((o) => o.id === ev.target.op.value);
    if (!p) return;
    ocupado = true;
    try { await concedeReco(yo.id, p.id); lista = [...lista, p]; aviso(`${p.nombre} ya puede recomendarte.`); }
    catch (err) { aviso("No se pudo añadir: " + err.message); }
    ocupado = false;
    pinta(caja);
  });
}

function listaHtml() {
  const ids = new Set(lista.map((p) => p.id));
  const libres = operadores.filter((o) => !ids.has(o.id));
  return `<h3>Pueden recomendarte <em>${lista.length}</em></h3>
    ${lista.length ? `<ul>${lista.map((p) => `<li>
        <a href="#/@${esc(p.alias)}" class="priv-av">${avatar(p)}</a>
        <span><b>${esc(p.nombre)}</b><small>@${esc(p.alias)}</small></span>
        <button class="btn" data-quita="${esc(p.id)}" aria-label="Quitar a ${esc(p.nombre)}">Quitar</button></li>`).join("")}</ul>`
      : `<p class="tenue">Nadie todavía: ahora mismo no te llega ninguna recomendación.</p>`}
    ${libres.length ? `<form class="priv-anade">
        <label class="sel"><span>Añadir operador</span><select name="op">
          ${libres.map((o) => `<option value="${esc(o.id)}">${esc(o.nombre)} · @${esc(o.alias)}</option>`).join("")}
        </select></label>
        <button class="btn primario" type="submit">＋ Puede recomendarme</button>
      </form>` : `<p class="tenue">${operadores.length ? "Ya has añadido a todos los operadores." : "Todavía no hay más operadores."}</p>`}`;
}
