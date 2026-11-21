// Utilidades de interfaz compartidas por todas las vistas: escapado, rangos,
// carteles, avisos y las "tarjetas de título" a pantalla completa.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export const reducido = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// ── Catálogos ────────────────────────────────────────────────────────────
export const ESTADOS = {
  visto:      { nombre: "Visto",      jp: "視聴済", color: "var(--e-visto)" },
  viendo:     { nombre: "Viendo",     jp: "視聴中", color: "var(--e-viendo)" },
  pendiente:  { nombre: "Pendiente",  jp: "未視聴", color: "var(--e-pendiente)" },
  revisto:    { nombre: "Revisto",    jp: "再視聴", color: "var(--e-revisto)" },
  abandonado: { nombre: "Abandonado", jp: "中断",   color: "var(--e-abandonado)" },
};
export const TIPOS = {
  anime: { nombre: "Anime",    jp: "アニメ" },
  manga: { nombre: "Manga",    jp: "漫画" },
  peli:  { nombre: "Película", jp: "映画" },
  serie: { nombre: "Serie",    jp: "ドラマ" },
};
export const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio",
  "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
export const FORMATOS = { TV: "TV", TV_SHORT: "TV corto", MOVIE: "Película", SPECIAL: "Especial",
  OVA: "OVA", ONA: "ONA", MUSIC: "Musical", MANGA: "Manga", NOVEL: "Novela", ONE_SHOT: "One-shot" };
export const GENEROS_ES = {
  Action: "Acción", Adventure: "Aventura", Comedy: "Comedia", Drama: "Drama", Ecchi: "Ecchi",
  Fantasy: "Fantasía", Horror: "Terror", "Mahou Shoujo": "Mahō shōjo", Mecha: "Mecha", Music: "Música",
  Mystery: "Misterio", Psychological: "Psicológico", Romance: "Romance", "Sci-Fi": "Ciencia ficción",
  "Slice of Life": "Recuentos", Sports: "Deportes", Supernatural: "Sobrenatural", Thriller: "Thriller",
};
export const genero = (g) => GENEROS_ES[g] || g;

// ── Rangos por nota ──────────────────────────────────────────────────────
// La letra hace de "rango de carta": el 10 tiene su propia categoría (EX) y
// es la única que se pinta en oro holográfico.
export const RANGOS = [
  { r: "EX", min: 10,  clase: "r-ex" },
  { r: "S+", min: 9.5, clase: "r-sp" },
  { r: "S",  min: 9,   clase: "r-s" },
  { r: "A",  min: 8,   clase: "r-a" },
  { r: "B",  min: 7,   clase: "r-b" },
  { r: "C",  min: 6,   clase: "r-c" },
  { r: "D",  min: 5,   clase: "r-d" },
  { r: "F",  min: -1,  clase: "r-f" },
];
export const rango = (nota) => nota == null ? null : RANGOS.find((x) => nota >= x.min);
export const fmtNota = (n) => n == null ? "—" : (Number.isInteger(+n) ? String(+n) : (+n).toFixed(1));

// ── Títulos ──────────────────────────────────────────────────────────────
export const tituloApi = (m) => m ? (m.title.english || m.title.romaji || m.title.native) : "";
export const subtitulo = (e) => {
  const m = e.media;
  if (!m) return TIPOS[e.tipo]?.nombre || "";
  const t = m.title.romaji && m.title.romaji !== e.titulo ? m.title.romaji : (m.title.english || "");
  return t;
};

// ── Cartel ───────────────────────────────────────────────────────────────
export function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Sin AniList (series y pelis de imagen real) se genera un cartel tipográfico:
// el tono sale del título, así cada uno tiene su color y no cambia entre visitas.
export function cartel(e, { grande = false } = {}) {
  const m = e.media;
  if (m && m.coverImage) {
    const src = grande ? (m.coverImage.extraLarge || m.coverImage.large) : (m.coverImage.large || m.coverImage.extraLarge);
    return `<img src="${esc(src)}" alt="" loading="lazy" decoding="async">`;
  }
  const h = hash(e.titulo) % 360;
  const tipo = TIPOS[e.tipo] || TIPOS.anime;
  return `<div class="cartel-gen" style="--h:${h}">
    <span class="cg-jp">${tipo.jp}</span>
    <span class="cg-t">${esc(e.titulo)}</span>
    <span class="cg-tipo">${esc(tipo.nombre)} · sin AniList</span>
  </div>`;
}

export const tinte = (e) => e.media?.coverImage?.color || `hsl(${hash(e.titulo) % 360} 70% 55%)`;

// ── Capa superior ────────────────────────────────────────────────────────
// Un <dialog> modal (ficha, paleta) vive en la "top layer" del navegador y
// tapa cualquier z-index. Avisos y cortes se muestran como popover para
// quedar por encima; volver a abrirlo lo sube sobre lo último abierto.
function alFrente(el) {
  if (!el.showPopover) return;
  if (!el.hasAttribute("popover")) el.setAttribute("popover", "manual");
  try { if (el.matches(":popover-open")) el.hidePopover(); el.showPopover(); } catch {}
}

// ── Avisos ───────────────────────────────────────────────────────────────
export function aviso(texto, { accion, alPulsar, tipo = "" } = {}) {
  const caja = $("#avisos");
  const a = document.createElement("div");
  a.className = "aviso " + tipo;
  a.innerHTML = `<span class="aviso-ico">▶</span><span>${esc(texto)}</span>` +
    (accion ? `<button type="button">${esc(accion)}</button>` : "");
  if (accion) a.querySelector("button").addEventListener("click", () => { alPulsar(); a.remove(); });
  caja.append(a);
  alFrente(caja);
  setTimeout(() => a.classList.add("fuera"), 4600);
  setTimeout(() => a.remove(), 5000);
}

// ── Tarjeta de título a pantalla completa ────────────────────────────────
// Negro, serif enorme y kanji: el "corte" de episodio que marca los momentos
// importantes (un 10, subir de nivel, un logro).
export function tarjetaTitulo({ jp, linea1, linea2, clase = "" }) {
  if (reducido()) { aviso(`${linea1} — ${linea2 || ""}`); return; }
  const t = document.createElement("div");
  t.className = "tarjeta-titulo " + clase;
  t.innerHTML = `<div class="tt-jp">${esc(jp)}</div>
    <div class="tt-l1">${esc(linea1)}</div>
    ${linea2 ? `<div class="tt-l2">${esc(linea2)}</div>` : ""}`;
  t.setAttribute("popover", "manual");
  document.body.append(t);
  alFrente(t);
  t.addEventListener("click", () => t.remove());
  setTimeout(() => t.classList.add("fuera"), 1700);
  setTimeout(() => t.remove(), 2200);
}

// Cuenta hacia arriba un número dentro de un elemento (las cifras del HUD)
export function cuenta(el, fin, { dec = 0, ms = 900 } = {}) {
  if (reducido() || !isFinite(fin)) { el.textContent = fin.toLocaleString("es-ES", { maximumFractionDigits: dec, minimumFractionDigits: dec }); return; }
  const t0 = performance.now();
  const paso = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    const v = fin * (1 - Math.pow(1 - k, 3));
    el.textContent = v.toLocaleString("es-ES", { maximumFractionDigits: dec, minimumFractionDigits: dec });
    if (k < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

export function cuentaAtras(segundos) {
  if (segundos <= 0) return "ya";
  const d = Math.floor(segundos / 86400), h = Math.floor(segundos % 86400 / 3600), m = Math.floor(segundos % 3600 / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

// Inclinación + reflejo holográfico de las cartas: se delega en el documento
// para no colgar un listener por carta.
export function activaHolo() {
  if (reducido()) return;
  document.addEventListener("pointermove", (ev) => {
    const c = ev.target.closest?.(".holo");
    if (!c) return;
    const r = c.getBoundingClientRect();
    const x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
    c.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
    c.style.setProperty("--my", (y * 100).toFixed(1) + "%");
    c.style.setProperty("--rx", ((0.5 - y) * 14).toFixed(2) + "deg");
    c.style.setProperty("--ry", ((x - 0.5) * 16).toFixed(2) + "deg");
  }, { passive: true });
  document.addEventListener("pointerout", (ev) => {
    const c = ev.target.closest?.(".holo");
    if (c && !c.contains(ev.relatedTarget)) {
      c.style.removeProperty("--rx"); c.style.removeProperty("--ry");
    }
  });
}

// La sinopsis de AniList trae HTML: se reconstruye dejando solo texto,
// saltos de línea y cursivas/negritas, sin atributos.
export function htmlSeguro(html) {
  const plantilla = document.createElement("template");
  plantilla.innerHTML = String(html || "");
  const salida = document.createDocumentFragment();
  const PERMITIDAS = new Set(["BR", "I", "B", "EM", "STRONG"]);
  const copia = (nodo, destino) => {
    for (const n of nodo.childNodes) {
      if (n.nodeType === 3) destino.append(n.textContent);
      else if (n.nodeType === 1) {
        if (PERMITIDAS.has(n.tagName)) { const e = document.createElement(n.tagName); copia(n, e); destino.append(e); }
        else copia(n, destino);
      }
    }
  };
  copia(plantilla.content, salida);
  const div = document.createElement("div");
  div.append(salida);
  return div.innerHTML;
}
