// Cliente mínimo de la API GraphQL de AniList (https://graphql.anilist.co).
// No necesita clave. El límite es de unas 90 peticiones por minuto (a veces
// lo bajan a 30), así que todas pasan por una cola que las espacia y, si llega
// un 429, espera lo que diga Retry-After antes de seguir.

const URL_API = "https://graphql.anilist.co";
const HUECO_MS = 700;

// Lo que se guarda de cada título dentro del archivo: lo justo para pintar
// cartel, cifras y estadísticas sin volver a preguntar.
export const CAMPOS = `id idMal type format status episodes duration chapters season seasonYear countryOfOrigin
  genres averageScore popularity title { romaji english native }
  coverImage { extraLarge large color } bannerImage siteUrl
  studios(isMain: true) { nodes { name } } nextAiringEpisode { airingAt episode }`;

let cola = Promise.resolve();
let ultima = 0;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export function gql(query, variables = {}, { signal } = {}) {
  const tarea = cola.then(async () => {
    if (signal?.aborted) throw new DOMException("cancelada", "AbortError");
    const falta = ultima + HUECO_MS - Date.now();
    if (falta > 0) await espera(falta);
    for (let intento = 0; intento < 3; intento++) {
      ultima = Date.now();
      const r = await fetch(URL_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, variables }),
        signal,
      });
      if (r.status === 429) {
        const s = +(r.headers.get("Retry-After") || 30);
        await espera(Math.min(s, 60) * 1000);
        continue;
      }
      const json = await r.json();
      if (json.errors?.length && !json.data) throw new Error(json.errors[0].message);
      return json.data;
    }
    throw new Error("AniList no responde (límite de peticiones)");
  });
  cola = tarea.catch(() => {});
  return tarea;
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
export async function refrescar(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const d = await gql(`query($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids) { ${CAMPOS} } } }`,
      { ids: ids.slice(i, i + 50) });
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
