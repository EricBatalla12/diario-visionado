// Caché de respuestas de AniList en el navegador (localStorage), con
// caducidad. AniList limita las peticiones por minuto y cada una tarda: lo que
// cambia poco (la ficha completa de un título, una temporada que ya pasó) no
// hace falta volver a pedirlo cada vez que se abre KIROKU.
//
// Cada respuesta va en su propia clave ("kiroku:c:det:123") para no leer ni
// reescribir todo de golpe, y un índice aparte guarda cuándo se guardó cada
// una, para saber si ha caducado y cuál sobra sin abrirlas.
//
// Nada de esto es imprescindible: si el navegador no deja guardar (modo
// privado, sin espacio), se pide a AniList como siempre.

const PRE = "kiroku:c:";
const INDICE = PRE + "indice";      // { clave: cuándo se guardó (ms) }
const MAX_EDAD = 14 * 864e5;        // lo que lleve más de 14 días se borra al arrancar

let indice = null;
function idx() {
  if (indice) return indice;
  try { indice = JSON.parse(localStorage.getItem(INDICE) || "{}") || {}; } catch { indice = {}; }
  return indice;
}
const guardaIndice = () => { try { localStorage.setItem(INDICE, JSON.stringify(indice)); } catch {} };
function quita(clave) {
  try { localStorage.removeItem(PRE + clave); } catch {}
  delete idx()[clave];
}

// `dura`: milisegundos que vale. `vale(v)`: comprobación extra sobre el
// contenido (p. ej. que no haya pasado ya un episodio que se anunciaba).
export function lee(clave, { dura, vale } = {}) {
  const t = idx()[clave];
  if (!t || Date.now() - t > dura) return undefined;
  let v;
  try { v = JSON.parse(localStorage.getItem(PRE + clave)); } catch { v = null; }
  if (v == null) { quita(clave); guardaIndice(); return undefined; }
  return !vale || vale(v) ? v : undefined;
}

// `max`: cuántas respuestas del mismo grupo (lo que va antes de ":") se
// guardan como mucho; al pasarse se borran las más viejas. Si el navegador
// se queda sin sitio, también se van borrando las más viejas, de cualquier grupo.
export function guarda(clave, valor, { max = 50 } = {}) {
  const i = idx(), texto = JSON.stringify(valor);
  for (let intento = 0; intento < 6; intento++) {
    try { localStorage.setItem(PRE + clave, texto); i[clave] = Date.now(); break; }
    catch {
      const vieja = Object.keys(i).filter((k) => k !== clave).sort((a, b) => i[a] - i[b])[0];
      if (!vieja) break;
      quita(vieja);
    }
  }
  const grupo = clave.split(":")[0] + ":";
  const delGrupo = Object.keys(i).filter((k) => k.startsWith(grupo)).sort((a, b) => i[b] - i[a]);
  delGrupo.slice(max).forEach(quita);
  guardaIndice();
}

// Al arrancar: fuera lo caducado de sobra y las claves que no están en el índice
try {
  const i = idx(), ahora = Date.now();
  for (const k of Object.keys(i)) if (ahora - i[k] > MAX_EDAD) quita(k);
  for (let n = localStorage.length - 1; n >= 0; n--) {
    const k = localStorage.key(n);
    if (k?.startsWith(PRE) && k !== INDICE && !(k.slice(PRE.length) in i)) localStorage.removeItem(k);
  }
  guardaIndice();
} catch {}

// Un episodio anunciado que ya ha salido deja la cuenta atrás en "ya": la
// respuesta guardada no sirve aunque no haya caducado
export function sinEmitidos(...listas) {
  const ahora = Date.now() / 1000;
  return listas.flat().every((m) => !m?.nextAiringEpisode || m.nextAiringEpisode.airingAt > ahora);
}
