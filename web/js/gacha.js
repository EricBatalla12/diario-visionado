// Gacha de cartas: de dónde salen las cartas (pozos de AniList), cuánto
// brillan (rareza por la nota media), los sets temáticos y los tickets.
// La vista (vistas/gacha.js) solo pinta; esto decide qué sale.
//
// Cómo se elige una carta sin descargar el pozo entero (3000 títulos):
// 1. Se sortea la rareza con las tasas fijas (o la piedad la fuerza).
// 2. Se sortea una posición dentro de esa rareza: AniList ordena el pozo por
//    popularidad, así que la posición dice qué página de 50 pedir.
// 3. Esa página se guarda 7 días en el navegador: las siguientes tiradas que
//    caigan en ella no gastan cupo de AniList.
// Una invocación ×10 pide como mucho una página por rareza, y todas en una
// sola petición (alias de GraphQL).
import { gql } from "./anilist.js";
import * as cache from "./cache.js";
import { temporadaActual, TEMPORADAS } from "./anilist.js";

export const RAREZAS = [
  { id: "ssr", nombre: "SSR", estrellas: 5, min: 85, tasa: 3,  diaria: 8,  desc: "8,5 o más en AniList" },
  { id: "sr",  nombre: "SR",  estrellas: 4, min: 78, tasa: 12, diaria: 22, desc: "7,8 – 8,4" },
  { id: "r",   nombre: "R",   estrellas: 3, min: 70, tasa: 35, diaria: 40, desc: "7,0 – 7,7" },
  { id: "n",   nombre: "N",   estrellas: 2, min: -1, tasa: 50, diaria: 30, desc: "Menos de 7" },
];
export const RAREZA = Object.fromEntries(RAREZAS.map((r) => [r.id, r]));
export const rarezaDe = (score) => RAREZAS.find((r) => (score ?? -1) >= r.min);
// Límites de nota de cada rareza para AniList (estrictos: greater / lesser)
const FILTRO_NOTA = { ssr: "averageScore_greater: 84", sr: "averageScore_greater: 77, averageScore_lesser: 85",
  r: "averageScore_greater: 69, averageScore_lesser: 78", n: "averageScore_lesser: 70" };

// A la trigésima invocación sin SSR, SSR segura. Con 10 (lo primero que se
// probó) salía una SSR de cada ~8,6 tiradas y dejaban de ser especiales; con
// 30, una de cada ~20 (5 %).
export const PIEDAD = 30;
export const FRAG_TICKET = 5;      // fragmentos (repetidas) por ticket
export const TICKETS_NIVEL = 2;    // por cada nivel
export const TICKETS_SET = 3;      // por completar un set
export const RACHA_PREMIO = 7;     // cada 7 días seguidos, la del día es SR o más
// Variante brillante: 1 de cada 200 cartas (0,5 %). Con 1/50 salían demasiadas
// (una ×10 traía alguna casi una vez de cada cinco).
const BRILLO = 1 / 200;

// ── Pozos ────────────────────────────────────────────────────────────────
// `pop`: usuarios de AniList que lo tienen en su lista, como mínimo: deja
// fuera lo que casi nadie conoce. `tam`: cuántos títulos hay de cada rareza
// (medido el 28-11-2026); se corrige solo al ver dónde acaban las páginas.
export const POZOS = {
  anime: { id: "anime", nombre: "Anime", jp: "アニメ", tipo: "ANIME", formatos: "[TV, TV_SHORT, MOVIE, ONA, OVA]", pop: 20000,
    tam: { ssr: 168, sr: 701, r: 1305, n: 1051 } },
  manga: { id: "manga", nombre: "Manga", jp: "マンガ", tipo: "MANGA", formatos: "[MANGA, ONE_SHOT]", pop: 5000,
    tam: { ssr: 125, sr: 731, r: 1272, n: 710 } },
};
const filtroPozo = (p, pop = p.pop) => `type: ${p.tipo}, isAdult: false, format_in: ${p.formatos}, status_not: NOT_YET_RELEASED, popularity_greater: ${pop}`;
const POR_PAGINA = 50;

export const CAMPOS_CARTA = `id type format status episodes chapters seasonYear countryOfOrigin genres averageScore popularity
  title { romaji english native } coverImage { extraLarge large color } studios(isMain: true) { nodes { name } }`;

// Lo que se guarda de cada carta: lo justo para pintarla (cabe en 3 KB)
export function aCarta(m) {
  return {
    id: m.id, type: m.type, format: m.format, status: m.status, episodes: m.episodes, chapters: m.chapters,
    seasonYear: m.seasonYear, countryOfOrigin: m.countryOfOrigin, genres: (m.genres || []).slice(0, 8),
    averageScore: m.averageScore, popularity: m.popularity,
    title: { romaji: m.title?.romaji || null, english: m.title?.english || null, native: m.title?.native || null },
    coverImage: { large: m.coverImage?.large || null, extraLarge: m.coverImage?.extraLarge || null, color: m.coverImage?.color || null },
    studio: m.studios?.nodes?.[0]?.name || m.studio || null,
  };
}

// Tamaños corregidos, por navegador
const CLAVE_TAM = "kiroku:gacha:tam";
function tamanos() {
  let t = {};
  try { t = JSON.parse(localStorage.getItem(CLAVE_TAM) || "{}") || {}; } catch {}
  return Object.fromEntries(Object.values(POZOS).map((p) => [p.id, { ...p.tam, ...(t[p.id] || {}) }]));
}
function ponTamano(pozo, rar, n) {
  const t = tamanos();
  t[pozo][rar] = Math.max(1, n);
  try { localStorage.setItem(CLAVE_TAM, JSON.stringify(t)); } catch {}
}

const DURA_PAGINA = 7 * 864e5;
// Pide (o lee de la caché) las páginas [{ rar, pag }] de un pozo, todas en una petición
async function paginas(pozo, lista) {
  const p = POZOS[pozo], out = new Map();
  const faltan = [];
  for (const x of lista) {
    const k = `gch:${pozo}:${x.rar}:${x.pag}`;
    const v = cache.lee(k, { dura: DURA_PAGINA });
    if (v) out.set(`${x.rar}:${x.pag}`, v); else faltan.push(x);
  }
  if (faltan.length) {
    const q = faltan.map((x, i) => `p${i}: Page(page: ${x.pag}, perPage: ${POR_PAGINA}) { pageInfo { hasNextPage }
      media(${filtroPozo(p)}, ${FILTRO_NOTA[x.rar]}, sort: [POPULARITY_DESC, ID]) { ${CAMPOS_CARTA} } }`).join("\n");
    const d = await gql(`query { ${q} }`);
    faltan.forEach((x, i) => {
      const r = d[`p${i}`];
      const v = { media: r.media.map(aCarta), sigue: r.pageInfo.hasNextPage };
      // Corrige el tamaño: si la página es la última o se ha quedado corta
      const tam = tamanos()[pozo][x.rar];
      if (!v.sigue) ponTamano(pozo, x.rar, (x.pag - 1) * POR_PAGINA + v.media.length);
      else if (x.pag * POR_PAGINA >= tam) ponTamano(pozo, x.rar, x.pag * POR_PAGINA + 1);
      if (v.media.length) cache.guarda(`gch:${pozo}:${x.rar}:${x.pag}`, v, { max: 40 });
      out.set(`${x.rar}:${x.pag}`, v);
    });
  }
  return out;
}

// ── Sets: colecciones temáticas con sus miembros fijos ───────────────────
// Cada uno es una consulta a AniList. Hay dos de cada pozo en el banner de la
// semana (para poder completarlos: en el pozo completo hay 3000 títulos) y
// todos en el álbum con su progreso. Completar uno da TICKETS_SET tickets.
const act = temporadaActual();
const tempAct = TEMPORADAS[act.i];
const g = (genero) => `genre: "${genero}", sort: POPULARITY_DESC`;
export const SETS = {
  anime: [
    { id: "leyendas", nombre: "Leyendas", jp: "伝説", desc: "Las 30 mejor valoradas de AniList", n: 30, args: "sort: SCORE_DESC", pop: 150000 },
    { id: "ghibli", nombre: "Studio Ghibli", jp: "吉卜力", desc: "Las películas del estudio", n: 20, ghibli: true },
    { id: `temporada-${tempAct.id.toLowerCase()}-${act.anio}`, nombre: `${tempAct.nombre} ${act.anio}`, jp: "今季", desc: "Lo más popular de esta temporada", n: 20,
      args: `season: ${tempAct.id}, seasonYear: ${act.anio}, sort: POPULARITY_DESC`, pop: 1000 },
    { id: "noventa", nombre: "Los 90", jp: "九十年代", desc: "Las 24 más populares de los noventa", n: 24, args: "startDate_greater: 19900000, startDate_lesser: 20000000, sort: POPULARITY_DESC" },
    { id: "dosmil", nombre: "Los 2000", jp: "〇〇年代", desc: "Las 24 más populares de 2000 a 2009", n: 24, args: "startDate_greater: 20000000, startDate_lesser: 20100000, sort: POPULARITY_DESC" },
    { id: "pelis", nombre: "Gran pantalla", jp: "映画", desc: "Las 24 películas más populares", n: 24, args: "format: MOVIE, sort: POPULARITY_DESC" },
    { id: "mecha", nombre: "Pilotos", jp: "機", desc: "Mecha", n: 20, args: g("Mecha") },
    { id: "deporte", nombre: "Espíritu deportivo", jp: "球", desc: "Deportes", n: 20, args: g("Sports") },
    { id: "terror", nombre: "Noche de miedo", jp: "怖", desc: "Terror", n: 20, args: g("Horror") },
    { id: "romance", nombre: "Corazones", jp: "恋", desc: "Romance", n: 24, args: g("Romance") },
    { id: "mente", nombre: "Mente retorcida", jp: "心", desc: "Psicológico", n: 20, args: g("Psychological") },
    { id: "isekai", nombre: "Otro mundo", jp: "異世界", desc: "Isekai", n: 20, args: 'tag: "Isekai", sort: POPULARITY_DESC' },
  ],
  manga: [
    { id: "leyendas-m", nombre: "Leyendas del manga", jp: "伝説", desc: "Los 30 mejor valorados", n: 30, args: "sort: SCORE_DESC", pop: 40000 },
    { id: "manhwa", nombre: "Manhwa", jp: "漫画", desc: "Los 24 coreanos más populares", n: 24, args: "countryOfOrigin: KR, sort: POPULARITY_DESC" },
    { id: "manhua", nombre: "Manhua", jp: "漫画", desc: "Los 16 chinos más populares", n: 16, args: "countryOfOrigin: CN, sort: POPULARITY_DESC" },
    { id: "clasicos-m", nombre: "Clásicos", jp: "古典", desc: "Los 24 más populares de antes de 2000", n: 24, args: "startDate_lesser: 20000000, sort: POPULARITY_DESC" },
    { id: "seinen", nombre: "Seinen", jp: "青年", desc: "Los 24 seinen más populares", n: 24, args: 'tag: "Seinen", sort: POPULARITY_DESC' },
    { id: "terror-m", nombre: "Pesadillas", jp: "怖", desc: "Terror", n: 20, args: g("Horror") },
    { id: "romance-m", nombre: "Corazones de tinta", jp: "恋", desc: "Romance", n: 24, args: g("Romance") },
    { id: "deporte-m", nombre: "En la cancha", jp: "球", desc: "Deportes", n: 20, args: g("Sports") },
    { id: "mente-m", nombre: "Laberintos", jp: "心", desc: "Psicológico", n: 20, args: g("Psychological") },
    { id: "risa-m", nombre: "A carcajadas", jp: "笑", desc: "Comedia", n: 20, args: g("Comedy") },
  ],
};
export const setDe = (id) => [...SETS.anime, ...SETS.manga].find((s) => s.id === id);
const pozoDeSet = (s) => SETS.anime.includes(s) ? "anime" : "manga";

const DURA_SET = 7 * 864e5, DURA_SET_TEMPORADA = 864e5;
const claveSet = (s) => `gst:${s.id}`;
export const miembrosGuardados = (s) => cache.lee(claveSet(s), { dura: s.id.startsWith("temporada-") ? DURA_SET_TEMPORADA : DURA_SET });

function consultaSet(s, alias) {
  const p = POZOS[pozoDeSet(s)];
  if (s.ghibli) return `${alias}: Studio(id: 21) { media(isMain: true, sort: POPULARITY_DESC, perPage: 50) { nodes { ${CAMPOS_CARTA} } } }`;
  return `${alias}: Page(perPage: ${s.n}) { media(${filtroPozo(p, s.pop ?? p.pop)}, ${s.args}) { ${CAMPOS_CARTA} } }`;
}
const listaSet = (s, r) => s.ghibli
  ? r.media.nodes.filter((m) => m.type === "ANIME" && m.format === "MOVIE").slice(0, s.n)
  : r.media;

// Los miembros de varios sets: lo que no está guardado, en una sola petición
// (o en dos o tres, si son muchos, para no pasarse de la complejidad que acepta AniList)
const pidiendo = new Map();
export async function miembros(sets) {
  const faltan = sets.filter((s) => !miembrosGuardados(s) && !pidiendo.has(s.id));
  for (let i = 0; i < faltan.length; i += 4) {
    const lote = faltan.slice(i, i + 4);
    const p = gql(`query { ${lote.map((s, k) => consultaSet(s, "s" + k)).join("\n")} }`).then((d) => {
      lote.forEach((s, k) => cache.guarda(claveSet(s), listaSet(s, d["s" + k]).map(aCarta), { max: 30 }));
    });
    lote.forEach((s) => pidiendo.set(s.id, p));
    p.catch(() => {}).finally(() => lote.forEach((s) => pidiendo.delete(s.id)));
  }
  await Promise.all(sets.map((s) => pidiendo.get(s.id)).filter(Boolean));
  return new Map(sets.map((s) => [s.id, miembrosGuardados(s) || null]));
}

// Dos sets de cada pozo por semana (semana que empieza en lunes, contada
// desde el lunes 1-1-2024)
export const semana = () => { const h = new Date(); h.setHours(0, 0, 0, 0); return Math.floor((h - new Date(2024, 0, 1)) / (7 * 864e5)); };
export const diasACambio = () => { const d = new Date().getDay(); return d === 1 ? 7 : (8 - d) % 7 || 7; };
export function setsDeLaSemana(pozo) {
  const l = SETS[pozo], i = (semana() * 2) % l.length;
  return [l[i], l[(i + 1) % l.length]];
}

// ── Sorteo ───────────────────────────────────────────────────────────────
const azar = (n) => Math.floor(Math.random() * n);
function sorteaRareza(pesos) {
  const total = Object.values(pesos).reduce((a, b) => a + b, 0);
  let t = Math.random() * total;
  for (const r of RAREZAS) if (pesos[r.id] && (t -= pesos[r.id]) < 0) return r.id;
  return RAREZAS.filter((r) => pesos[r.id]).at(-1).id;
}
const mejor = (a) => a === "ssr" || a === "sr";

// Qué rarezas salen en una invocación de `n` cartas, con la piedad y la SR
// asegurada del ×10. `hay`: las rarezas que existen en el banner.
// Devuelve también la piedad que quedará (la base de datos la cuenta igual).
export function rarezas(n, { piedad = 0, diaria = false, rachaPremio = false, hay = null }) {
  const disponibles = hay || { ssr: 1, sr: 1, r: 1, n: 1 };
  const pesos = Object.fromEntries(RAREZAS.map((r) => [r.id, disponibles[r.id] ? (diaria ? r.diaria : r.tasa) : 0]));
  const out = [];
  let pd = piedad;
  for (let i = 0; i < n; i++) {
    let r = !diaria && pd >= PIEDAD - 1 && disponibles.ssr ? "ssr" : sorteaRareza(pesos);
    if (diaria && rachaPremio && !mejor(r)) r = disponibles.sr ? "sr" : disponibles.ssr ? "ssr" : r;
    if (!diaria) pd = r === "ssr" ? 0 : pd + 1;
    out.push(r);
  }
  // ×10: al menos una SR o mejor
  if (n >= 10 && !out.some(mejor)) {
    const sube = disponibles.sr ? "sr" : disponibles.ssr ? "ssr" : null;
    if (sube) out[n - 1] = sube;
    if (sube === "ssr") pd = 0;
  }
  return { lista: out, piedad: pd };
}

// La tirada: rarezas → cartas. `banner`: null (pozo completo) o un set.
// Devuelve [{ media_id, rareza, media, brillante }] listo para kiroku_invoca.
export async function tira(pozo, n, { banner = null, piedad = 0, diaria = false, rachaPremio = false, tengo = new Set() } = {}) {
  let elegidas;
  if (banner) elegidas = await delSet(banner, n, { piedad, diaria, rachaPremio, tengo });
  else {
    const { lista: rs } = rarezas(n, { piedad, diaria, rachaPremio });
    elegidas = await delPozo(pozo, rs);
  }
  return elegidas.map((m) => ({ media_id: m.id, rareza: rarezaDe(m.averageScore).id, media: m, brillante: Math.random() < BRILLO }));
}

// En un set no se sortea la rareza: con las tasas del pozo, un set con una
// sola N la daría la mitad de las veces. Todas sus cartas pesan lo mismo y
// las que te faltan, cuatro veces más, para que completarlo no sea eterno. La piedad
// sí cuenta (si el set tiene SSR) y no se repite carta en la misma invocación.
export const PESO_FALTA = 4;
async function delSet(set, n, { piedad, diaria, rachaPremio, tengo }) {
  const lista = (await miembros([set])).get(set.id);
  if (!lista?.length) throw new Error("No se pudo cargar el set de este banner.");
  const rar = (m) => rarezaDe(m.averageScore).id;
  const usadas = new Set(), out = [];
  let pd = piedad;
  for (let i = 0; i < n; i++) {
    let cand = lista.filter((m) => !usadas.has(m.id));
    if (!cand.length) cand = lista;
    const forzada = !diaria && pd >= PIEDAD - 1 ? cand.filter((m) => rar(m) === "ssr")
      : diaria && rachaPremio ? cand.filter((m) => mejor(rar(m))) : [];
    if (forzada.length) cand = forzada;
    const pesos = cand.map((m) => tengo.has(m.id) ? 1 : PESO_FALTA);
    let t = Math.random() * pesos.reduce((a, b) => a + b, 0);
    const m = cand[pesos.findIndex((p) => (t -= p) < 0)] || cand.at(-1);
    if (!diaria) pd = rar(m) === "ssr" ? 0 : pd + 1;
    usadas.add(m.id);
    out.push(m);
  }
  return out;
}

// Una página al azar por rareza (todas en una petición) y de cada una, las
// cartas que hagan falta, sin repetir dentro de la misma invocación
async function delPozo(pozo, rs, intento = 0) {
  const tam = tamanos()[pozo];
  const cuantas = {};
  for (const r of rs) cuantas[r] = (cuantas[r] || 0) + 1;
  const pags = Object.keys(cuantas).map((rar) => ({ rar, pag: 1 + Math.floor(azar(tam[rar]) / POR_PAGINA) }));
  const res = await paginas(pozo, pags);
  const vacias = pags.filter((x) => !res.get(`${x.rar}:${x.pag}`).media.length);
  // Página vacía: el pozo es más pequeño de lo que se creía (ya corregido); otra vez
  if (vacias.length && intento < 2) return delPozo(pozo, rs, intento + 1);
  const restos = Object.fromEntries(pags.map((x) => [x.rar, [...res.get(`${x.rar}:${x.pag}`).media]]));
  return rs.map((r) => {
    const l = restos[r];
    if (!l?.length) throw new Error("AniList no ha devuelto cartas.");
    return l.length > 1 ? l.splice(azar(l.length), 1)[0] : l[0];
  });
}

// ── Tickets ──────────────────────────────────────────────────────────────
// Se ganan con el archivo (como la experiencia, se recalculan siempre) y con
// lo guardado en la base de datos (canjes y sets). Solo se guardan los gastados.
export function tickets(stats, estado) {
  const e = estado || {};
  const porNivel = TICKETS_NIVEL * stats.op.nivel, porTerminados = stats.terminados;
  const porCanjes = e.canjeados || 0, porSets = TICKETS_SET * (e.premios?.length || 0);
  const ganados = porNivel + porTerminados + porCanjes + porSets, gastados = e.gastados || 0;
  return { porNivel, porTerminados, porCanjes, porSets, ganados, gastados, quedan: Math.max(0, ganados - gastados) };
}

// ── Tipo de la carta (como en las cartas de monstruos): el género principal ─
export const TIPOS_CARTA = {
  Action: { jp: "闘", nombre: "Acción", c: "#ff4d2e" }, Adventure: { jp: "冒", nombre: "Aventura", c: "#ff8a1f" },
  Comedy: { jp: "笑", nombre: "Comedia", c: "#ffd23f" }, Drama: { jp: "劇", nombre: "Drama", c: "#a77bff" },
  Fantasy: { jp: "幻", nombre: "Fantasía", c: "#c77dff" }, Horror: { jp: "怖", nombre: "Terror", c: "#d1264a" },
  Mystery: { jp: "謎", nombre: "Misterio", c: "#6b7bff" }, Psychological: { jp: "心", nombre: "Psicológico", c: "#ff3d81" },
  Romance: { jp: "恋", nombre: "Romance", c: "#ff7eb6" }, "Sci-Fi": { jp: "宇", nombre: "Ciencia ficción", c: "#39d8ff" },
  "Slice of Life": { jp: "日", nombre: "Recuentos", c: "#37f29a" }, Sports: { jp: "球", nombre: "Deportes", c: "#b6f23c" },
  Supernatural: { jp: "霊", nombre: "Sobrenatural", c: "#2fd6c3" }, Mecha: { jp: "機", nombre: "Mecha", c: "#9aa7b8" },
  Music: { jp: "音", nombre: "Música", c: "#5ec8ff" }, Thriller: { jp: "緊", nombre: "Thriller", c: "#e05252" },
  "Mahou Shoujo": { jp: "魔", nombre: "Mahou shoujo", c: "#f7a8ff" }, Ecchi: { jp: "艶", nombre: "Ecchi", c: "#ff9ec7" },
};
// AniList da los géneros por orden alfabético, así que el "principal" se
// elige por prioridad: lo más característico antes que lo genérico (Haikyuu
// es Comedy, Drama y Sports, y su tipo es Deportes)
const PRIORIDAD = ["Sports", "Mecha", "Music", "Mahou Shoujo", "Horror", "Psychological", "Mystery", "Thriller", "Romance",
  "Sci-Fi", "Slice of Life", "Supernatural", "Fantasy", "Adventure", "Action", "Drama", "Comedy", "Ecchi"];
export const tipoCarta = (m) => TIPOS_CARTA[PRIORIDAD.find((x) => m?.genres?.includes(x))] || { jp: "無", nombre: "Sin género", c: "#8a879c" };
