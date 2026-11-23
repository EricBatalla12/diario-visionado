// 01 · ARCHIVO — la colección: cifras del HUD, filtros y cartas holográficas
// (o la vista "dossier", en filas).
import { esc, cartel, rango, fmtNota, ESTADOS, TIPOS, MESES, subtitulo, tinte, cuenta, genero, formato, totalDe, unidad, seLee, infoTipo } from "../ui.js";
import { entradas, esPropio, sujetoActual } from "../almacen.js";
import { episodios, generosDe } from "../stats.js";
import { esReciente } from "../terminados.js";

const CLAVE_F = "kiroku:filtros";
const def = { estado: "todos", tipo: "todos", anio: "todos", genero: "todos", orden: "fecha", texto: "", modo: "cartas", agrupa: true };
let f = { ...def };
try { f = { ...def, ...JSON.parse(localStorage.getItem(CLAVE_F) || "{}"), texto: "" }; } catch {}
const guardaF = () => { try { localStorage.setItem(CLAVE_F, JSON.stringify({ ...f, texto: "" })); } catch {} };

// Sagas desplegadas en esta visita (por id de la primera temporada)
const abiertas = new Set();
const sagaDe = (e) => e.media?.saga?.id || null;

// Junta las temporadas de una misma saga en un solo elemento, en la posición
// de la primera que aparezca (con el orden por fecha, la más reciente). Una
// saga de la que solo hay una temporada se pinta como carta normal.
function agrupa(l) {
  const out = [], porSaga = new Map();
  for (const e of l) {
    const id = sagaDe(e);
    if (!id) { out.push({ e }); continue; }
    if (!porSaga.has(id)) { const g = { saga: id, e, miembros: [] }; porSaga.set(id, g); out.push(g); }
    porSaga.get(id).miembros.push(e);
  }
  return out.map((x) => x.saga && x.miembros.length < 2 ? { e: x.e } : x);
}
// Títulos distintos: una saga cuenta como uno
export const cuentaTitulos = (l) => new Set(l.map((e) => sagaDe(e) ? "s" + sagaDe(e) : e.uid)).size;

const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Fecha de "cuándo lo viste": año y mes del registro; sin mes va al principio del año
const clave = (e) => (e.anio || 0) * 100 + (e.mes || 0);

function filtra(lista) {
  const q = norm(f.texto);
  return lista.filter((e) =>
    (f.estado === "todos" || e.estado === f.estado) &&
    (f.tipo === "todos" || e.tipo === f.tipo) &&
    (f.anio === "todos" || (f.anio === "sin" ? !e.anio : String(e.anio) === f.anio)) &&
    (f.genero === "todos" || generosDe(e).includes(f.genero)) &&
    (!q || norm(e.titulo + " " + (e.media?.title.romaji || "") + " " + (e.media?.title.english || "") + " " + e.comentario).includes(q)));
}

const ORDENES = {
  fecha:   { nombre: "Más reciente",      fn: (a, b) => clave(b) - clave(a) || b.creado - a.creado },
  nota:    { nombre: "Tu nota",           fn: (a, b) => (b.nota ?? -1) - (a.nota ?? -1) },
  anilist: { nombre: "Nota de AniList",   fn: (a, b) => (b.media?.averageScore ?? -1) - (a.media?.averageScore ?? -1) },
  delta:   { nombre: "Discrepancia",      fn: (a, b) => dif(b) - dif(a) },
  titulo:  { nombre: "Título (A-Z)",      fn: (a, b) => a.titulo.localeCompare(b.titulo, "es") },
  estreno: { nombre: "Año de estreno",    fn: (a, b) => (b.media?.seasonYear ?? 0) - (a.media?.seasonYear ?? 0) },
};
function dif(e) { return e.nota != null && e.media?.averageScore ? Math.abs(e.nota - e.media.averageScore / 10) : -1; }

export function carta(e, { indice = 0, clase = "" } = {}) {
  const r = rango(e.nota);
  const es = ESTADOS[e.estado];
  const m = e.media;
  const total = totalDe(e);
  const meta = [m ? formato(m) : infoTipo(e.tipo).nombre, m?.seasonYear, total ? `${total} ${unidad(e)}` : null].filter(Boolean).join(" · ");
  const prog = e.estado === "viendo" && total ? Math.min(1, (e.progreso || 0) / total) : null;
  const sig = e.estado !== "visto" && m?.nextAiringEpisode;
  return `<article class="carta holo ${r ? r.clase : "sin-nota"} ${clase}" data-uid="${esc(e.uid)}" tabindex="0" role="button"
      aria-label="${esc(e.titulo)}" style="--tinte:${esc(tinte(e))};--i:${indice}">
    <div class="carta-marco">
      <div class="carta-img">${cartel(e)}</div>
      <div class="carta-brillo"></div>
      <span class="carta-estado" style="--c:${es.color}"><i>${es.jp}</i>${es.nombre}</span>
      ${r ? `<span class="carta-rango"><b>${fmtNota(e.nota)}</b><i>${r.r}</i></span>` : ""}
      ${sig ? `<span class="carta-emision">EP ${sig.episode} · ${diasA(sig.airingAt)}</span>`
        : esReciente(e) ? `<span class="carta-emision completo" title="Terminó de emitirse: ya puedes verlo de tirón">✓ Completo</span>` : ""}
      <div class="carta-pie">
        <h3>${esc(e.titulo)}</h3>
        <p>${esc(meta)}</p>
        ${prog != null ? `<div class="carta-prog"><span style="width:${(prog * 100).toFixed(1)}%"></span></div>` : ""}
      </div>
    </div>
  </article>`;
}
// Carta de una saga: la portada de la temporada que va primero, la nota
// media de las puntuadas y cuántas tienes de cuántas hay
function cartaSaga(g, indice) {
  const ms = g.miembros, rep = ms[0], sg = rep.media.saga;
  const notas = ms.filter((e) => e.nota != null).map((e) => e.nota);
  const media = notas.length ? Math.round(notas.reduce((a, b) => a + b, 0) / notas.length * 10) / 10 : null;
  const r = rango(media);
  const vistas = ms.filter((e) => e.estado === "visto" || e.estado === "revisto").length;
  const estado = ms.some((e) => e.estado === "viendo") ? "viendo" : vistas === ms.length ? "visto" : rep.estado;
  const es = ESTADOS[estado];
  const abierta = abiertas.has(g.saga);
  const titulo = sg.t || rep.titulo;
  return `<article class="carta holo carta-saga ${abierta ? "abierta" : ""} ${r ? r.clase : "sin-nota"}" data-saga="${g.saga}" tabindex="0" role="button"
      aria-expanded="${abierta}" aria-label="${esc(titulo)}: ${ms.length} temporadas en tu archivo" style="--tinte:${esc(tinte(rep))};--i:${indice}">
    <div class="carta-marco">
      <div class="carta-img">${cartel(rep)}</div>
      <div class="carta-brillo"></div>
      <span class="carta-estado" style="--c:${es.color}"><i>${es.jp}</i>${es.nombre}</span>
      ${r ? `<span class="carta-rango" title="Nota media de la saga"><b>${fmtNota(media)}</b><i>${r.r}</i></span>` : ""}
      <span class="carta-saga-n">${ms.length}<small>${abierta ? "▴" : "▾"}</small></span>
      <div class="carta-pie">
        <h3>${esc(titulo)}</h3>
        <p>Saga · ${ms.length} de ${sg.de} · ${vistas} vista${vistas === 1 ? "" : "s"}</p>
      </div>
    </div>
  </article>`;
}

const diasA = (t) => { const s = t - Date.now() / 1000; const d = Math.floor(s / 86400); return d > 0 ? `${d}d` : `${Math.max(0, Math.floor(s / 3600))}h`; };

function fila(e) {
  const r = rango(e.nota);
  const es = ESTADOS[e.estado];
  const total = totalDe(e);
  const ep = seLee(e) ? e.progreso || 0 : episodios(e);
  return `<article class="fila ${r ? r.clase : ""}" data-uid="${esc(e.uid)}" tabindex="0" role="button" style="--tinte:${esc(tinte(e))}">
    <div class="fila-img">${cartel(e)}</div>
    <div class="fila-t"><h3>${esc(e.titulo)}</h3><p>${esc(subtitulo(e))}</p></div>
    <span class="fila-estado" style="--c:${es.color}">${es.jp} ${es.nombre}</span>
    <div class="fila-ep">${total ? `<div class="barra"><span style="width:${Math.min(100, ep / total * 100)}%"></span></div><small>${ep}/${total}</small>` : `<small>${infoTipo(e.tipo).nombre}</small>`}</div>
    <p class="fila-com">${esc(e.comentario || "")}</p>
    <span class="fila-nota">${r ? `<b>${fmtNota(e.nota)}</b><i>${r.r}</i>` : "—"}</span>
  </article>`;
}

export function pinta(raiz, { stats, primera }) {
  const todas = entradas();
  const lista = filtra(todas).sort(ORDENES[f.orden]?.fn || ORDENES.fecha.fn);
  const anios = [...new Set(todas.map((e) => e.anio).filter(Boolean))].sort((a, b) => b - a);
  const generos = [...stats.generos.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
  const cuentaEst = (k) => todas.filter((e) => k === "todos" || e.estado === k).length;

  raiz.innerHTML = `
  <section class="hud-cifras">
    ${cifra("TÍTULOS", "作品数", cuentaTitulos(todas), 0, "")}
    ${cifra("EPISODIOS", "話数", stats.eps, 0, "")}
    ${cifra("HORAS DE VIDA", "時間", stats.horas, 0, "h")}
    ${cifra("NOTA MEDIA", "平均", stats.media ?? 0, 2, "")}
  </section>

  <section class="filtros panel">
    <div class="chips" role="group" aria-label="Estado">
      ${["todos", ...Object.keys(ESTADOS)].map((k) => `<button class="chip ${f.estado === k ? "on" : ""}" data-f="estado" data-v="${k}"
        style="--c:${k === "todos" ? "var(--texto)" : ESTADOS[k].color}">${k === "todos" ? "Todos" : ESTADOS[k].nombre}<small>${cuentaEst(k)}</small></button>`).join("")}
    </div>
    <div class="filtros-fila">
      <label class="campo-busca"><span>⌕</span><input id="f-texto" type="search" placeholder="Filtrar el archivo…" value="${esc(f.texto)}" autocomplete="off"></label>
      ${sel("tipo", "Tipo", [["todos", "Todo"], ...Object.entries(TIPOS).map(([k, v]) => [k, v.nombre])])}
      ${sel("anio", "Año", [["todos", "Siempre"], ...anios.map((a) => [String(a), String(a)]), ...(todas.some((e) => !e.anio) ? [["sin", "∞ Atemporal"]] : [])])}
      ${sel("genero", "Género", [["todos", "Cualquiera"], ...generos.map((g) => [g, genero(g)])])}
      ${sel("orden", "Orden", Object.entries(ORDENES).map(([k, v]) => [k, v.nombre]))}
      <div class="conmuta" role="group" aria-label="Vista">
        <button class="${f.modo === "cartas" ? "on" : ""}" data-f="modo" data-v="cartas" title="Cartas">▦</button>
        <button class="${f.modo === "dossier" ? "on" : ""}" data-f="modo" data-v="dossier" title="Dossier">☰</button>
      </div>
      ${f.modo === "cartas" ? `<button class="btn-sagas ${f.agrupa ? "on" : ""}" data-agrupa aria-pressed="${f.agrupa}" title="Agrupar las temporadas de un mismo anime en una carta">⧉ Sagas</button>` : ""}
    </div>
  </section>

  <div class="resultado-cuenta"><span>${lista.length}</span> registros ${lista.length !== todas.length ? `de ${todas.length}` : ""}
    ${f.texto || f.estado !== "todos" || f.tipo !== "todos" || f.anio !== "todos" || f.genero !== "todos" ? `<button class="enlace" data-limpia>Quitar filtros</button>` : ""}</div>

  <section id="coleccion">${lista.length ? cuerpo(lista) : vacio(todas.length)}</section>`;

  raiz.querySelectorAll(".cifra b[data-n]").forEach((b) => primera ? cuenta(b, +b.dataset.n, { dec: +b.dataset.d }) :
    (b.textContent = (+b.dataset.n).toLocaleString("es-ES", { maximumFractionDigits: +b.dataset.d, minimumFractionDigits: +b.dataset.d })));

  // Eventos. Repintar por un filtro no relanza la entrada animada de las
  // cartas (la página se quedaba en negro un momento): eso es solo al entrar.
  const repinta = () => { raiz.classList.remove("anima"); pinta(raiz, { stats }); };
  raiz.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => { f[b.dataset.f] = b.dataset.v; guardaF(); repinta(); }));
  raiz.querySelectorAll("select[data-sel]").forEach((s) => s.addEventListener("change", () => { f[s.dataset.sel] = s.value; guardaF(); repinta(); }));
  raiz.querySelector("[data-agrupa]")?.addEventListener("click", () => { f.agrupa = !f.agrupa; guardaF(); repinta(); });
  // Desplegar o plegar una saga: sus temporadas salen detrás de la carta
  const col = raiz.querySelector("#coleccion");
  // Se tocan solo esa carta y sus temporadas: repintar la colección entera
  // relanzaba la entrada animada de todas las cartas y la página se quedaba
  // en negro un momento
  const despliega = (c) => {
    const id = +c.dataset.saga, abrir = !abiertas.has(id);
    abrir ? abiertas.add(id) : abiertas.delete(id);
    c.classList.toggle("abierta", abrir);
    c.setAttribute("aria-expanded", abrir);
    const flecha = c.querySelector(".carta-saga-n small");
    if (flecha) flecha.textContent = abrir ? "▴" : "▾";
    if (!abrir) { col.querySelectorAll(`.saga-${id}`).forEach((x) => x.remove()); return; }
    const l = filtra(todas).sort(ORDENES[f.orden]?.fn || ORDENES.fecha.fn);
    const g = agrupa(l).find((x) => x.saga === id);
    if (!g) return;
    c.insertAdjacentHTML("afterend", g.miembros.map((e, k) => carta(e, { indice: k, clase: `en-saga saga-${id}` })).join(""));
  };
  col.onclick = (ev) => { const c = ev.target.closest("[data-saga]"); if (c) despliega(c); };
  col.onkeydown = (ev) => { const c = ev.target.closest?.("[data-saga]"); if (c && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); despliega(c); } };
  raiz.querySelector("[data-limpia]")?.addEventListener("click", () => { f = { ...def, orden: f.orden, modo: f.modo }; guardaF(); repinta(); });
  const t = raiz.querySelector("#f-texto");
  t.addEventListener("input", () => {
    f.texto = t.value;
    raiz.classList.remove("anima");   // sin la entrada animada en cada tecla
    const l = filtra(todas).sort(ORDENES[f.orden].fn);
    raiz.querySelector("#coleccion").innerHTML = l.length ? cuerpo(l) : vacio(todas.length);
    raiz.querySelector(".resultado-cuenta span").textContent = l.length;
  });

  function cuerpo(l) {
    if (f.modo === "dossier") return `<div class="dossier">${l.map(fila).join("")}</div>`;
    const items = f.agrupa ? agrupa(l) : l.map((e) => ({ e }));
    let i = 0;
    const pintaItem = (x) => !x.saga ? carta(x.e, { indice: i++ })
      : cartaSaga(x, i++) + (abiertas.has(x.saga) ? x.miembros.map((e) => carta(e, { indice: i++, clase: `en-saga saga-${x.saga}` })).join("") : "");
    // Ordenado por fecha, las cartas se agrupan por mes con un rótulo (una
    // saga va en el mes de su temporada más reciente)
    if (f.orden !== "fecha") return `<div class="rejilla">${items.map(pintaItem).join("")}</div>`;
    const grupos = [];
    for (const x of items) {
      const e = x.e;
      const k = e.anio ? `${e.anio}-${e.mes || 0}` : "sin";
      if (!grupos.length || grupos.at(-1).k !== k) grupos.push({ k, e, items: [] });
      grupos.at(-1).items.push(x);
    }
    return grupos.map((g) => `<div class="grupo">
      <h2 class="rotulo ${g.e.anio ? "" : "rotulo-atemporal"}"><span class="rotulo-n">${g.e.anio || "∞"}</span><span class="rotulo-m">${g.e.mes ? MESES[g.e.mes - 1] : (g.e.anio ? "Sin mes" : "Atemporal")}</span>
      <span class="rotulo-jp">${g.e.mes ? g.e.mes + "月" : g.e.anio ? "年" : "永遠"}</span><span class="rotulo-c">${g.items.length}</span></h2>
      <div class="rejilla">${g.items.map(pintaItem).join("")}</div></div>`).join("");
  }
}

function sel(k, etiqueta, ops) {
  return `<label class="sel"><span>${etiqueta}</span><select data-sel="${k}">${ops.map(([v, n]) =>
    `<option value="${esc(v)}" ${f[k] === v ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>`;
}
function cifra(et, jp, n, d, suf) {
  return `<div class="cifra panel"><span class="cifra-et">${et}<i>${jp}</i></span><b data-n="${n}" data-d="${d}">0</b><em>${suf}</em></div>`;
}
function vacio(hay) {
  if (hay) return `<div class="vacio"><div class="vacio-jp">無</div><p>Nada coincide con los filtros.</p></div>`;
  if (!esPropio()) return `<div class="vacio"><div class="vacio-jp">無</div><p>@${esc(sujetoActual().alias)} aún no ha registrado nada.</p></div>`;
  // Archivo propio vacío: lo normal en un operador recién llegado
  return `<div class="vacio vacio-nuevo"><div class="vacio-jp">始</div><p>Tu archivo está vacío. Empieza por aquí:</p>
    <div class="vacio-acc">
      <button class="btn primario" onclick="document.getElementById('btn-busca').click()">⌕ Buscar en AniList</button>
      <a class="btn" href="#/temporada">Ver la temporada</a>
      <button class="btn" onclick="document.getElementById('fichero').click()">↑ Importar un archivo JSON</button>
    </div>
    <p class="tenue">¿Venías de la versión local de KIROKU o del diario antiguo? Exporta allí e importa aquí.</p></div>`;
}
