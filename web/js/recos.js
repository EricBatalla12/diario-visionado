// Recomendaciones entre operadores: el buzón (lo que te mandan), lo que tú
// has mandado y el formulario "Recomendar a…" de la ficha.
//
// No hay tiempo real: el buzón se consulta al arrancar, al volver a la
// pestaña y cada pocos minutos mientras está a la vista. Con pocos usuarios
// es más barato y más simple que mantener una conexión abierta.
//
// No hay historial: resolver una recomendación la borra. Si la añades al
// archivo, la entrada guarda quién te la recomendó (`recomendadoPor`).
import { esc, aviso, fmtNota, tituloApi, rango, tipoDe } from "./ui.js";
import { yoMismo, porMedia, anade } from "./almacen.js";
import { recosRecibidas, recosEnviadas, mandaReco, borraReco, destinatarios, otrosDe } from "./nube.js";
import { refrescar } from "./anilist.js";

const SONDEO_MS = 3 * 60 * 1000;
const MAX_MENSAJE = 280;

let recibidas = null;       // null = aún sin leer
let leidoEn = 0;
let ocultas = new Set();    // descartadas que aún se pueden deshacer
const oyentes = new Set();
export const escucha = (fn) => (oyentes.add(fn), () => oyentes.delete(fn));
const avisa = () => oyentes.forEach((fn) => fn());

export const lista = () => (recibidas || []).filter((r) => !ocultas.has(r.id));
export const cuenta = () => lista().length;

// ── Sondeo ───────────────────────────────────────────────────────────────
let enCurso = null;
export function lee() {
  if (enCurso) return enCurso;
  enCurso = (async () => {
    const antes = recibidas ? new Set(recibidas.map((r) => r.id)) : null;
    try {
      recibidas = await recosRecibidas(yoMismo().id);
      leidoEn = Date.now();
    } catch { return; } finally { enCurso = null; }
    // Aviso solo de lo nuevo desde la última lectura (no al arrancar)
    const nuevas = antes ? recibidas.filter((r) => !antes.has(r.id)) : [];
    if (nuevas.length === 1) aviso(`${nuevas[0].remitente?.nombre || "Alguien"} te recomienda «${tituloApi(nuevas[0].media)}».`, { tipo: "logro" });
    else if (nuevas.length > 1) aviso(`${nuevas.length} recomendaciones nuevas en tu buzón.`, { tipo: "logro" });
    avisa();
  })();
  return enCurso;
}

export function arranca() {
  lee();
  setInterval(() => { if (document.visibilityState === "visible") lee(); }, SONDEO_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - leidoEn > 30000) lee();
  });
}

// ── Ficha reducida que viaja con la recomendación ────────────────────────
// Lo justo para pintar la carta del buzón (la base de datos admite 4 KB).
export function reducida(m) {
  return {
    id: m.id, type: m.type, format: m.format, episodes: m.episodes ?? null, chapters: m.chapters ?? null, countryOfOrigin: m.countryOfOrigin ?? null,
    seasonYear: m.seasonYear ?? null, genres: (m.genres || []).slice(0, 6),
    title: { romaji: m.title?.romaji || null, english: m.title?.english || null, native: m.title?.native || null },
    coverImage: { large: m.coverImage?.large || null, color: m.coverImage?.color || null },
  };
}

// La ficha llega del remitente: solo se pinta una portada si es de AniList
export const portadaFiable = (m) => {
  const u = m?.coverImage?.large;
  return typeof u === "string" && /^https:\/\/s\d+\.anilist\.co\//.test(u) ? u : null;
};

// ── Resolver ─────────────────────────────────────────────────────────────
// Al archivo con la ficha completa de AniList (la de la recomendación es
// reducida y la ha escrito otro); si AniList no responde, con la reducida, y
// el refresco periódico la completará.
async function fichaCompleta(r) {
  try { const [m] = await refrescar([r.media_id]); if (m) return m; } catch {}
  const c = portadaFiable(r.media);
  return { ...r.media, coverImage: c ? { ...r.media.coverImage, large: c } : null };
}

export async function acepta(r, estado) {
  const ya = porMedia(r.media_id);
  if (ya) { await quita(r); return ya; }
  const m = await fichaCompleta(r);
  const e = anade({
    mediaId: m.id, media: m, titulo: tituloApi(m), estado, recomendadoPor: r.de,
    tipo: tipoDe(m),
    progreso: estado === "visto" ? ((m.type === "MANGA" ? m.chapters : m.episodes) || 0) : 0,
  });
  await quita(r).catch((err) => aviso("Añadido, pero no se pudo quitar del buzón: " + err.message));
  return e;
}

async function quita(r) {
  await borraReco(r.id);
  recibidas = (recibidas || []).filter((x) => x.id !== r.id);
  avisa();
}

// Descartar se puede deshacer unos segundos: la carta se esconde y el
// borrado de verdad espera a que pase el aviso.
export function descarta(r) {
  ocultas.add(r.id);
  avisa();
  let deshecho = false;
  aviso(`Descartada «${tituloApi(r.media)}».`, { accion: "Deshacer", alPulsar: () => { deshecho = true; ocultas.delete(r.id); avisa(); } });
  setTimeout(async () => {
    if (deshecho) return;
    try { await quita(r); } catch (err) { aviso("No se pudo descartar: " + err.message); }
    ocultas.delete(r.id);
    avisa();
  }, 5200);
}

export const enviadas = () => recosEnviadas(yoMismo().id);
export const cancela = (r) => borraReco(r.id);

// ── Formulario "Recomendar a…" (dentro de la ficha) ──────────────────────
// Quién puede recibirla y, si no, por qué. Si ya lo ha visto, no tiene
// sentido recomendárselo. Eso solo se sabe de los archivos que puedes leer
// (públicos o privados que te dejan ver): de un privado sin permiso no se
// pregunta nada, para no revelarlo. Si lo tiene en pendientes sí se puede:
// es un empujón para que lo vea.
const YA = { visto: "Ya lo ha visto", revisto: "Ya lo ha visto", viendo: "Lo está viendo", abandonado: "Lo abandonó" };
function motivo(p, { meAceptan, enviadas }, mediaId, suyo) {
  const modo = p.recibe_recos || "todos";
  if (suyo && YA[suyo.estado]) return YA[suyo.estado] + (suyo.nota != null ? ` · ${fmtNota(suyo.nota)}` : "");
  if (modo === "nadie") return "No acepta recomendaciones";
  if (modo === "lista" && !meAceptan.has(p.id)) return "Solo de su lista";
  if (enviadas.some((x) => x.para === p.id && x.media_id === mediaId)) return "Ya se lo has recomendado";
  const n = enviadas.filter((x) => x.para === p.id).length;
  if (n >= (p.recos_max || 3)) return `Ya tiene ${n} tuya${n === 1 ? "" : "s"} sin resolver (su máximo)`;
  return null;
}

const avatar = (p) => p.avatar_url
  ? `<img src="${esc(p.avatar_url)}" alt="" referrerpolicy="no-referrer" loading="lazy">`
  : `<span>${esc((p.nombre[0] || "?").toUpperCase())}</span>`;

// Pinta el botón en `caja` y, al pulsarlo, despliega el formulario
export function boton(caja, m) {
  if (!caja || !m?.id) return;
  caja.innerHTML = `<section class="fi-sec fi-reco"><button class="btn" data-abre-reco><i class="rc-ico">推</i> Recomendar a…</button></section>`;
  caja.querySelector("[data-abre-reco]").addEventListener("click", () => formulario(caja, m));
}

async function formulario(caja, m) {
  caja.innerHTML = `<section class="fi-sec fi-reco"><div class="cargando"><span></span>Buscando operadores…</div></section>`;
  let datos, suyos;
  try {
    const [d, otros] = await Promise.all([destinatarios(yoMismo().id), otrosDe(m.id, yoMismo().id).catch(() => [])]);
    datos = d; suyos = new Map(otros.map((x) => [x.usuario, x]));
  }
  catch (err) { if (caja.isConnected) caja.innerHTML = `<section class="fi-sec fi-reco"><p class="ac-error">▲ ${esc(err.message)}</p></section>`; return; }
  if (!caja.isConnected) return;
  const mia = porMedia(m.id);
  const ops = datos.perfiles.map((p) => ({ ...p, suyo: suyos.get(p.id), motivo: motivo(p, datos, m.id, suyos.get(p.id)) }))
    .sort((a, b) => (a.motivo ? 1 : 0) - (b.motivo ? 1 : 0) || a.nombre.localeCompare(b.nombre, "es"));
  const elegidos = new Set();
  const r = mia?.nota != null ? rango(mia.nota) : null;

  caja.innerHTML = `<section class="fi-sec fi-reco panel esquinas">
    <h3 class="p-tit"><span>Recomendar</span><i>推薦</i></h3>
    ${ops.length ? `<div class="rc-ops" role="group" aria-label="Operadores">${ops.map((p) => `
      <button class="rc-op" data-para="${esc(p.id)}" ${p.motivo ? `disabled title="${esc(p.motivo)}"` : ""} aria-pressed="false">
        <span class="rc-av">${avatar(p)}</span><span class="rc-n"><b>${esc(p.nombre)}</b><small>${p.motivo ? esc(p.motivo) : "@" + esc(p.alias) + (p.suyo?.estado === "pendiente" ? " · lo tiene pendiente" : "")}</small></span>
      </button>`).join("")}</div>`
      : `<p class="tenue">Todavía no hay más operadores. Pásales el enlace desde Operadores.</p>`}
    <label class="campo rc-msg"><span>Mensaje · <b>sin spoilers</b></span>
      <textarea rows="3" maxlength="${MAX_MENSAJE}" placeholder="Por qué le va a gustar, sin destripar nada."></textarea>
      <small class="rc-cuenta">0/${MAX_MENSAJE}</small></label>
    ${mia?.nota != null ? `<label class="rc-nota"><input type="checkbox" checked> Incluir tu nota <b class="${r.clase}">${fmtNota(mia.nota)} ${r.r}</b></label>` : ""}
    <div class="fi-acc"><button class="btn primario" data-manda disabled>Elige a quién</button><button class="btn" data-cancela>Cancelar</button></div>
  </section>`;

  const enviar = caja.querySelector("[data-manda]"), texto = caja.querySelector("textarea");
  const pintaBoton = () => {
    enviar.disabled = !elegidos.size;
    enviar.textContent = elegidos.size ? `Mandar a ${elegidos.size}` : "Elige a quién";
  };
  caja.querySelectorAll(".rc-op:not([disabled])").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.para;
    if (elegidos.has(id)) elegidos.delete(id); else elegidos.add(id);
    b.classList.toggle("on", elegidos.has(id));
    b.setAttribute("aria-pressed", elegidos.has(id));
    pintaBoton();
  }));
  texto.addEventListener("input", () => { caja.querySelector(".rc-cuenta").textContent = `${texto.value.length}/${MAX_MENSAJE}`; });
  caja.querySelector("[data-cancela]").addEventListener("click", () => boton(caja, m));
  enviar.addEventListener("click", async () => {
    enviar.disabled = true; enviar.textContent = "Mandando…";
    const conNota = caja.querySelector(".rc-nota input")?.checked;
    const reco = { media_id: m.id, media: reducida(m), mensaje: texto.value.trim().slice(0, MAX_MENSAJE), nota: conNota ? mia.nota : null };
    const ids = [...elegidos];
    const res = await Promise.allSettled(ids.map((id) => mandaReco(id, reco)));
    const nombre = (id) => ops.find((p) => p.id === id)?.nombre || "?";
    const bien = ids.filter((_, i) => res[i].status === "fulfilled");
    const mal = ids.map((id, i) => [id, res[i]]).filter(([, x]) => x.status === "rejected");
    if (bien.length) aviso(`Recomendado a ${bien.map(nombre).join(", ")}.`);
    for (const [id, x] of mal) aviso(`${nombre(id)}: ${x.reason.message}`);
    if (caja.isConnected) boton(caja, m);
  });
}
