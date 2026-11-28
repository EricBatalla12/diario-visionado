// 06 · OPERADORES — todos los que usan KIROKU: nivel, cifras, afinidad de
// notas contigo y lo último que han registrado.
import { esc, aviso, fmtNota, ESTADOS, rango } from "../ui.js";
import { yoMismo, propias, coleccionPropia } from "../almacen.js";
import { directorio } from "../nube.js";
import { calcula } from "../stats.js";
import { cuentaTitulos } from "./archivo.js";

let cache = null, cargado = 0;

// Las filas ligeras del directorio se rehacen como entradas para reutilizar las estadísticas
const comoEntrada = (f) => ({
  uid: f.id, mediaId: f.media_id, titulo: f.titulo, tipo: f.tipo, estado: f.estado, nota: f.nota == null ? null : +f.nota,
  comentario: f.comentario || "", progreso: f.progreso || 0, anio: f.anio, mes: f.mes, generos: f.generos || [],
  editado: Date.parse(f.editado), cover: f.cover,
  media: f.media_id ? { episodes: f.episodes, duration: f.duration, genres: f.genres || [], studio: f.studio,
    seasonYear: f.seasonYear, status: f.status, averageScore: f.averageScore, saga: f.sagaId ? { id: f.sagaId } : null } : null,
});

// Afinidad: con al menos 3 títulos puntuados por los dos, 100 % menos 10
// puntos por cada punto de diferencia media.
function afinidad(mias, suyas) {
  const mis = new Map(mias.filter((e) => e.mediaId && e.nota != null).map((e) => [e.mediaId, e.nota]));
  const comunes = suyas.filter((e) => e.mediaId && e.nota != null && mis.has(e.mediaId));
  const enComun = new Set(suyas.filter((e) => e.mediaId && mias.some((m) => m.mediaId === e.mediaId)).map((e) => e.mediaId)).size;
  if (comunes.length < 3) return { pct: null, n: comunes.length, enComun };
  const dif = comunes.reduce((a, e) => a + Math.abs(e.nota - mis.get(e.mediaId)), 0) / comunes.length;
  return { pct: Math.max(0, Math.round(100 - dif * 10)), n: comunes.length, enComun };
}

const hace = (t) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "ahora";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 30) return `hace ${Math.floor(s / 86400)} d`;
  return new Date(t).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
};

export function pinta(raiz) {
  raiz.innerHTML = `
  <header class="vista-cab">
    <h1 class="vista-tit"><span>Operadores</span><i>オペレーター</i></h1>
    <p class="vista-sub">Todos los que usan KIROKU. Pulsa a alguien para ver su archivo.</p>
    <button class="btn vista-accion" data-copia>⧉ Copiar enlace para invitar</button>
  </header>
  <div id="op-cuerpo"><div class="cargando"><span></span>Consultando el registro de operadores…</div></div>`;
  raiz.querySelector("[data-copia]").addEventListener("click", async () => {
    const url = location.origin + location.pathname;
    try { await navigator.clipboard.writeText(url); aviso("Enlace copiado: pásaselo a quien quieras."); } catch { aviso(url); }
  });
  carga(raiz.querySelector("#op-cuerpo"));
}

async function carga(caja) {
  try {
    if (!cache || Date.now() - cargado > 60000) { cache = await directorio(yoMismo().id); cargado = Date.now(); }
  } catch (err) {
    caja.innerHTML = `<div class="vacio"><div class="vacio-jp">断</div><p>No se pudo leer el registro.</p><p class="tenue">${esc(err.message)}</p></div>`;
    return;
  }
  if (!caja.isConnected) return;
  const yo = yoMismo();
  const porUsuario = new Map(cache.perfiles.map((p) => [p.id, []]));
  for (const f of cache.filas) porUsuario.get(f.usuario)?.push(comoEntrada(f));
  // Lo tuyo se toma de memoria, que va al día aunque la cola no haya guardado aún
  porUsuario.set(yo.id, propias());
  // Ojo clínico: entradas con 9+ que vienen de una recomendación de cada uno
  const aciertos = new Map();
  // (las tuyas, de memoria: puntuar algo que te recomendaron cuenta al momento)
  const suma = (por, nota) => { if (por && nota != null && +nota >= 9) aciertos.set(por, (aciertos.get(por) || 0) + 1); };
  for (const f of cache.filas) if (f.usuario !== yo.id) suma(f.recomendado_por, f.nota);
  for (const e of propias()) suma(e.recomendadoPor, e.nota);

  // Colección del Gacha de cada uno (la tuya, de memoria)
  const colec = new Map(cache.perfiles.map((p) => [p.id, { cartas: [], premios: [] }]));
  for (const c of cache.cartas) colec.get(c.usuario)?.cartas.push({ mediaId: c.media_id });
  for (const g of cache.gachas) if (colec.has(g.usuario)) colec.get(g.usuario).premios = g.premios || [];
  const mia = coleccionPropia();
  colec.set(yo.id, { cartas: mia.cartas, premios: mia.gacha?.premios || [] });

  const ops = cache.perfiles.map((p) => {
    const lista = porUsuario.get(p.id) || [];
    const s = calcula(lista, { aciertos: aciertos.get(p.id) || 0, coleccion: colec.get(p.id) });
    const ultima = lista.reduce((a, e) => Math.max(a, e.editado || 0), 0);
    const viendo = lista.filter((e) => e.estado === "viendo").sort((a, b) => b.editado - a.editado).slice(0, 4);
    // Privado y sin permiso: la base de datos no ha mandado sus entradas
    const bloqueado = p.id !== yo.id && p.privado && !cache.recibidos.has(p.id);
    // Títulos como en el Archivo: cada saga cuenta como uno
    const titulos = p.id === yo.id ? cuentaTitulos(propias()) : cuentaTitulos(lista);
    return { p, s, titulos, ultima, viendo, bloqueado, af: p.id === yo.id || bloqueado ? null : afinidad(propias(), lista), soyYo: p.id === yo.id };
  }).sort((a, b) => (a.bloqueado - b.bloqueado) || (b.s.op.xp - a.s.op.xp));

  const nombres = new Map(cache.perfiles.map((p) => [p.id, p]));
  const feed = cache.filas.filter((f) => f.usuario !== yo.id && f.estado !== "pendiente").slice(0, 24);

  caja.innerHTML = `
  <div class="ops">
    <section class="ops-lista">${ops.map((o, i) => tarjeta(o, i)).join("")}</section>
    <aside class="panel esquinas ops-feed">
      <h2 class="p-tit"><span>Actividad</span><i>活動</i></h2>
      ${feed.length ? `<ol class="feed">${feed.map((f) => { const p = nombres.get(f.usuario); const es = ESTADOS[f.estado];
        return `<li><a href="#/@${esc(p.alias)}" class="feed-av">${avatar(p)}</a>
          <div><p><a href="#/@${esc(p.alias)}">${esc(p.nombre)}</a> · <span style="color:${es.color}">${es.nombre.toLowerCase()}</span>
          ${f.nota != null ? `<b class="${rango(+f.nota).clase}">${fmtNota(+f.nota)}</b>` : ""}</p>
          <p class="feed-t">${esc(f.titulo)}</p>${f.comentario ? `<p class="feed-c">«${esc(f.comentario.slice(0, 120))}»</p>` : ""}
          <small>${hace(Date.parse(f.editado))}</small></div></li>`; }).join("")}</ol>`
        : `<p class="tenue">Aún no hay actividad de otros operadores. Pásales el enlace.</p>`}
    </aside>
  </div>`;
}

function avatar(p) {
  return p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="av-ini">${esc((p.nombre[0] || "?").toUpperCase())}</span>`;
}

function tarjeta({ p, s, titulos, ultima, viendo, af, soyYo, bloqueado }, i) {
  if (bloqueado) return `<a class="op-tarjeta panel bloqueado" href="#/@${esc(p.alias)}" style="--i:${i}">
    <div class="opt-av">${avatar(p)}<span class="opt-nv opt-candado">非公開</span></div>
    <div class="opt-d">
      <h3>${esc(p.nombre)}</h3>
      <p class="opt-alias">@${esc(p.alias)}</p>
      <p class="opt-priv"><b>Perfil privado</b>Solo pueden verlo los operadores que @${esc(p.alias)} añada. Pídele acceso.</p>
    </div>
  </a>`;
  const etiqueta = p.privado ? `<small class="opt-privado">${soyYo ? "privado" : "privado · tienes acceso"}</small>` : "";
  return `<a class="op-tarjeta panel ${soyYo ? "soy-yo" : ""}" href="#/${soyYo ? "perfil" : "@" + esc(p.alias)}" style="--i:${i}">
    <div class="opt-puesto">#${i + 1}</div>
    <div class="opt-av">${avatar(p)}<span class="opt-nv">NV ${s.op.nivel}</span></div>
    <div class="opt-d">
      <h3>${esc(p.nombre)} ${soyYo ? `<small class="opt-tu">TÚ</small>` : ""}</h3>${etiqueta}
      <p class="opt-alias">@${esc(p.alias)} · ${esc(s.op.rango.nombre)} <i>${s.op.rango.jp}</i></p>
      <dl class="opt-cifras"><div><dt>Títulos</dt><dd>${titulos}</dd></div><div><dt>Horas</dt><dd>${Math.round(s.horas)}</dd></div>
        <div><dt>Media</dt><dd>${s.media == null ? "—" : fmtNota(+s.media.toFixed(2))}</dd></div><div><dt>Logros</dt><dd>${s.logros.filter((l) => l.hecho).length}</dd></div></dl>
      ${af ? `<div class="opt-af"><span>Afinidad</span>${af.pct == null
        ? `<em>${af.enComun ? `${af.enComun} en común · faltan notas` : "nada en común aún"}</em>`
        : `<div class="opt-af-b"><span style="width:${af.pct}%"></span></div><b>${af.pct}%</b><em>${af.n} notas en común</em>`}</div>` : ""}
      ${viendo.length ? `<div class="opt-viendo"><span>Viendo</span>${viendo.map((e) => (e.cover || e.media?.coverImage?.large) ? `<img src="${esc(e.cover || e.media.coverImage.large)}" alt="" title="${esc(e.titulo)}" loading="lazy">` : `<i title="${esc(e.titulo)}">${esc(e.titulo[0])}</i>`).join("")}</div>` : ""}
      <small class="opt-ult">${ultima ? "Última actividad " + hace(ultima) : "Sin actividad"}</small>
    </div>
  </a>`;
}
