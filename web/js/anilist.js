// Cliente mínimo de la API GraphQL de AniList (https://graphql.anilist.co).
// No necesita clave. El límite es de unas 90 peticiones por minuto (a veces
// lo bajan a 30), así que todas pasan por una cola que las espacia, frena
// antes de agotar el cupo (cabeceras X-RateLimit) y, si llega un 429, espera
// lo que diga Retry-After.
//
// La cola tiene dos niveles: lo que pides en pantalla (abrir una ficha,
// buscar, el catálogo de la temporada) pasa por delante de lo que se hace de
// fondo (refrescos, sagas, "Continúa"). Sin esto, abrir una ficha al arrancar
// esperaba detrás de una docena de peticiones de fondo.

const URL_API = "https://graphql.anilist.co";
const HUECO_MS = 700;

// Lo que se guarda de cada título dentro del archivo: lo justo para pintar
// cartel, cifras y estadísticas sin volver a preguntar.
export const CAMPOS = `id idMal type format status episodes duration chapters season seasonYear countryOfOrigin
  genres averageScore popularity title { romaji english native }
  coverImage { extraLarge large color } bannerImage siteUrl
  studios(isMain: true) { nodes { name } } nextAiringEpisode { airingAt episode } endDate { year month day }`;

const pendientes = [];      // { fondo, query, variables, signal, resolve, reject }
let trabajando = false;
let ultima = 0;            // cuándo salió la última petición
let pausaHasta = 0;        // freno por cupo agotado o 429
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export function gql(query, variables = {}, { signal, fondo = false } = {}) {
  return new Promise((resolve, reject) => {
    const t = { fondo, query, variables, signal, resolve, reject };
    // Lo urgente se pone detrás de lo urgente que ya espera, pero delante de lo de fondo
    const i = fondo ? -1 : pendientes.findIndex((x) => x.fondo);
    if (i < 0) pendientes.push(t); else pendientes.splice(i, 0, t);
    procesa();
  });
}

async function procesa() {
  if (trabajando) return;
  trabajando = true;
  while (pendientes.length) {
    const t = pendientes.shift();
    try { t.resolve(await pide(t)); } catch (err) { t.reject(err); }
  }
  trabajando = false;
}

async function pide({ query, variables, signal }) {
  for (let intento = 0; intento < 3; intento++) {
    if (signal?.aborted) throw new DOMException("cancelada", "AbortError");
    const falta = Math.max(ultima + HUECO_MS, pausaHasta) - Date.now();
    if (falta > 0) await espera(falta);
    if (signal?.aborted) throw new DOMException("cancelada", "AbortError");
    ultima = Date.now();
    let r;
    try {
      r = await fetch(URL_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, variables }),
        signal,
      });
    } catch (err) {
      // AniList devuelve el 429 sin cabeceras CORS: el navegador solo ve un
      // fallo de red. Se trata igual que un 429: esperar y reintentar.
      if (err.name === "AbortError" || intento === 2) throw err;
      pausaHasta = Date.now() + 20000;
      continue;
    }
    if (r.status === 429) {
      pausaHasta = Date.now() + Math.min(+(r.headers.get("Retry-After") || 30), 60) * 1000;
      continue;
    }
    // Quedan pocas en este minuto: se para hasta que se renueve el cupo
    const quedan = r.headers.get("X-RateLimit-Remaining"), renueva = r.headers.get("X-RateLimit-Reset");
    if (quedan != null && +quedan <= 2) pausaHasta = renueva ? +renueva * 1000 + 500 : Date.now() + 30000;
    const json = await r.json();
    if (json.errors?.length && !json.data) throw new Error(json.errors[0].message);
    return json.data;
  }
  throw new Error("AniList no responde (límite de peticiones)");
}

// Aplana lo que devuelve la API al formato que guarda el archivo
export function ficha(m) {
  if (!m) return null;
  const { studios, ...resto } = m;
  return { ...resto, studio: studios?.nodes?.[0]?.name || resto.studio || null };
}

export async function buscar(texto, tipo = "ANIME", { signal } = {}) {
  const d = await gql(`query($q: String, $t: MediaType) {
    Page(perPage: 14) { media(search: $q, type: $t, isAdult: false, sort: SEARCH_MATCH) { ${CAMPOS} } } }`,
    { q: texto, t: tipo }, { signal });
  return d.Page.media.map(ficha);
}

const detalles = new Map();
export async function detalle(id) {
  if (detalles.has(id)) return detalles.get(id);
  const p = gql(`query($id: Int) { Media(id: $id) { ${CAMPOS}
      description(asHtml: true)
      synonyms
      tags { name rank isMediaSpoiler }
      rankings { rank type allTime context season year }
      relations { edges { relationType node { ${CAMPOS} } } }
      characters(sort: [ROLE, RELEVANCE], perPage: 10) {
        edges { role node { name { full } image { medium } } } }
      trailer { id site }
    } }`, { id }).then((d) => d.Media);
  detalles.set(id, p);
  p.catch(() => detalles.delete(id));
  return p;
}

// Refresca las fichas guardadas (episodios emitidos, próximo episodio, portada)
export async function refrescar(ids, { fondo = false } = {}) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const d = await gql(`query($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids) { ${CAMPOS} } } }`,
      { ids: ids.slice(i, i + 50) }, { fondo });
    out.push(...d.Page.media.map(ficha));
  }
  return out;
}

export async function temporada(season, year, page = 1) {
  const d = await gql(`query($s: MediaSeason, $y: Int, $p: Int) {
    Page(page: $p, perPage: 30) { pageInfo { hasNextPage }
      media(season: $s, seasonYear: $y, type: ANIME, isAdult: false, sort: POPULARITY_DESC, format_not_in: [MUSIC]) { ${CAMPOS} } } }`,
    { s: season, y: year, p: page });
  return { media: d.Page.media.map(ficha), hayMas: d.Page.pageInfo.hasNextPage };
}

export const TEMPORADAS = [
  { id: "WINTER", nombre: "Invierno",  jp: "冬" },
  { id: "SPRING", nombre: "Primavera", jp: "春" },
  { id: "SUMMER", nombre: "Verano",    jp: "夏" },
  { id: "FALL",   nombre: "Otoño",     jp: "秋" },
];

export function temporadaActual(fecha = new Date()) {
  return { i: Math.floor(fecha.getMonth() / 3), anio: fecha.getFullYear() };
}

// ── Sagas: las temporadas de un mismo anime ──────────────────────────────
// AniList trata cada temporada como un título distinto, unido a los demás
// por las relaciones PREQUEL/SEQUEL. Una saga es esa cadena entera: se
// recorre en anchura pidiendo en lotes de 50 solo lo que aún no se conoce, y
// se ordena por fecha de estreno. La raíz (la primera temporada) da el id.
const CAMPOS_SAGA = `id type format status season seasonYear episodes chapters nextAiringEpisode { airingAt episode }
  startDate { year month day } title { romaji english native } coverImage { large color }
  relations { edges { relationType node { id type format } } }`;
// id → nodo reducido. Se guarda en sessionStorage para que recargar la página
// no vuelva a pedir las sagas enteras (AniList limita las peticiones por minuto)
const CLAVE_NODOS = "kiroku:nodos-saga:v1";
const nodos = new Map();
try { for (const [k, v] of JSON.parse(sessionStorage.getItem(CLAVE_NODOS) || "[]")) nodos.set(k, v); } catch {}
const guardaNodos = () => { try { sessionStorage.setItem(CLAVE_NODOS, JSON.stringify([...nodos])); } catch {} };
const MAX_RONDAS = 8, MAX_NODOS = 60;

// Las novelas ligeras van por su lado: una secuela en novela no es otra
// temporada del manga
const enlazable = (a, b) => a.type === b.type && (a.format === "NOVEL") === (b.format === "NOVEL") && b.format !== "MUSIC";

function reduce(m) {
  const pre = [], suc = [];
  for (const ed of m.relations?.edges || []) {
    if (!ed.node || !enlazable(m, ed.node)) continue;
    if (ed.relationType === "PREQUEL") pre.push(ed.node.id);
    if (ed.relationType === "SEQUEL") suc.push(ed.node.id);
  }
  const d = m.startDate || {};
  return {
    id: m.id, type: m.type, format: m.format, status: m.status, season: m.season, seasonYear: m.seasonYear,
    nextAiringEpisode: m.nextAiringEpisode,
    episodes: m.episodes, chapters: m.chapters, title: m.title, coverImage: m.coverImage,
    inicio: (d.year || m.seasonYear || 9999) * 10000 + (d.month || 0) * 100 + (d.day || 0),
    pre, suc,
  };
}

async function pideNodos(ids, fondo) {
  const faltan = [...new Set(ids)].filter((id) => !nodos.has(id));
  for (let i = 0; i < faltan.length; i += 50) {
    const d = await gql(`query($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids) { ${CAMPOS_SAGA} } } }`,
      { ids: faltan.slice(i, i + 50) }, { fondo });
    for (const m of d.Page.media) nodos.set(m.id, reduce(m));
    // Los que AniList no devuelve (borrados, adultos) no se vuelven a pedir
    for (const id of faltan.slice(i, i + 50)) if (!nodos.has(id)) nodos.set(id, null);
  }
  if (faltan.length) guardaNodos();
}

// ids → Map(id → { raiz, n, cadena: [nodos en orden] }) para los ids pedidos
export async function sagas(ids, { fondo = false } = {}) {
  let frontera = [...new Set(ids)];
  const vistos = new Set(frontera);
  for (let r = 0; r < MAX_RONDAS && frontera.length; r++) {
    await pideNodos(frontera, fondo);
    const sig = [];
    for (const id of frontera) {
      const n = nodos.get(id);
      if (!n) continue;
      for (const x of [...n.pre, ...n.suc]) if (!vistos.has(x) && vistos.size < ids.length + MAX_NODOS * 4) { vistos.add(x); sig.push(x); }
    }
    frontera = sig;
  }
  // Componentes conexas por las relaciones, entre los nodos conocidos
  const out = new Map();
  for (const id of new Set(ids)) {
    if (out.has(id) || !nodos.get(id)) continue;
    const comp = [], pila = [id], dentro = new Set([id]);
    while (pila.length && comp.length < MAX_NODOS) {
      const n = nodos.get(pila.pop());
      if (!n) continue;
      comp.push(n);
      for (const x of [...n.pre, ...n.suc]) if (!dentro.has(x) && nodos.get(x)) { dentro.add(x); pila.push(x); }
    }
    comp.sort((a, b) => a.inicio - b.inicio || a.id - b.id);
    const raiz = comp[0];
    comp.forEach((n, i) => { if (ids.includes(n.id) || n.id === id) out.set(n.id, { raiz: raiz.id, n: i + 1, cadena: comp }); });
  }
  return out;
}

// Lo que se guarda en la ficha de cada entrada (va con `media` a la base de
// datos): la raíz, la posición, cuántos hay en la cadena y el título de la
// serie, para pintar la carta de la saga sin volver a preguntar
export function marcaSaga(s) {
  if (!s || s.cadena.length < 2) return null;
  const r = s.cadena[0];
  return { id: s.raiz, n: s.n, de: s.cadena.length, t: r.title?.english || r.title?.romaji || r.title?.native || "" };
}
