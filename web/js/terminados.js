// Pendientes que esperaban a que terminase su emisión: cuando AniList los da
// por terminados, KIROKU avisa para verlos de tirón. No se guarda nada en la
// base de datos: sale de la ficha de cada entrada (estado de emisión y fecha
// de fin), así que se ve igual en todos los dispositivos y caduca solo a los
// 30 días o en cuanto lo empiezas.
import { aviso } from "./ui.js";

const DIAS = 30;
const DIA_MS = 864e5;

export function finDe(m) {
  const d = m?.endDate;
  if (!d?.year) return null;
  return new Date(d.year, (d.month || 1) - 1, d.day || 1).getTime();
}

// Pendiente, terminado hace menos de 30 días y apuntado antes de que acabara
// (si lo añadiste ya terminado, no hay nada que avisar)
export function esReciente(e, ahora = Date.now()) {
  if (e.estado !== "pendiente" || e.media?.status !== "FINISHED") return false;
  const fin = finDe(e.media);
  return fin != null && fin <= ahora && ahora - fin < DIAS * DIA_MS && (e.creado || 0) < fin + DIA_MS;
}

export const recientes = (lista) => lista.filter((e) => esReciente(e)).sort((a, b) => finDe(b.media) - finDe(a.media));

export function haceDias(e) {
  const d = Math.floor((Date.now() - finDe(e.media)) / DIA_MS);
  return d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`;
}

// Aviso al entrar, una vez por título en este navegador
export function avisaNuevos(lista, usuario) {
  const clave = `kiroku:terminados-avisados:${usuario}`;
  let ya = [];
  try { ya = JSON.parse(localStorage.getItem(clave) || "[]"); } catch {}
  const nuevos = recientes(lista).filter((e) => !ya.includes(e.mediaId));
  if (!nuevos.length) return;
  if (nuevos.length <= 2) {
    for (const e of nuevos) {
      const ep = e.media.episodes;
      aviso(`«${e.titulo}» ha terminado${ep ? `: ${ep} episodios para verlo de tirón` : ""}.`, { tipo: "logro" });
    }
  } else aviso(`${nuevos.length} de tus pendientes han terminado de emitirse. Míralos en Temporada.`, { tipo: "logro" });
  // Solo se recuerdan los de los últimos 30 días: la lista no crece sin fin
  const vigentes = new Set(recientes(lista).map((e) => e.mediaId));
  try { localStorage.setItem(clave, JSON.stringify([...ya.filter((id) => vigentes.has(id)), ...nuevos.map((e) => e.mediaId)])); } catch {}
}
