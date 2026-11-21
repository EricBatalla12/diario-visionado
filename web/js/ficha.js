// Ficha de un título: datos de AniList arriba y tu registro (estado, nota,
// progreso, fecha, comentario) debajo, que se guarda solo al tocarlo. También
// sirve de vista previa para algo que aún no está en el archivo, y de ficha
// en solo lectura cuando el registro es de otro operador.
import { $, esc, cartel, rango, fmtNota, ESTADOS, TIPOS, MESES, FORMATOS, tituloApi, genero, aviso,
  tarjetaTitulo, htmlSeguro, cuentaAtras, tinte } from "./ui.js";
import { entrada, actualiza, borra, anade, porMedia, deshaz, esMia, sujetoActual, yoMismo } from "./almacen.js";
import { detalle } from "./anilist.js";
import { otrosDe } from "./nube.js";

const dlg = () => $("#ficha");
let actual = null;          // uid abierto (o null en vista previa)
let alAbrirPaleta = null;   // lo inyecta app.js para "vincular con AniList"

export const conectaPaleta = (fn) => (alAbrirPaleta = fn);

const ESTADO_AL = { visto: "Visto", viendo: "Viendo", pendiente: "Pendiente", revisto: "Revisto", abandonado: "Abandonado" };
const STATUS = { FINISHED: "Finalizado", RELEASING: "En emisión", NOT_YET_RELEASED: "Próximamente", CANCELLED: "Cancelado", HIATUS: "En pausa" };
const SEASON = { WINTER: "Invierno", SPRING: "Primavera", SUMMER: "Verano", FALL: "Otoño" };
const RELACION = { SEQUEL: "Secuela", PREQUEL: "Precuela", SIDE_STORY: "Historia paralela", SPIN_OFF: "Spin-off",
  ADAPTATION: "Adaptación", SOURCE: "Original", ALTERNATIVE: "Alternativa", PARENT: "Principal", SUMMARY: "Resumen", OTHER: "Relacionado", CHARACTER: "Personajes", COMPILATION: "Compilación", CONTAINS: "Contiene" };

const ORDEN_REL = ["PREQUEL", "SEQUEL", "PARENT", "SIDE_STORY", "SPIN_OFF", "ADAPTATION", "SOURCE", "ALTERNATIVE"];
const ordenRel = (r) => { const i = ORDEN_REL.indexOf(r.relationType); return i < 0 ? 99 : i; };

export function abre(uid, previa = null) {
  const e = uid ? entrada(uid) : null;
  if (uid && !e) return;
  actual = uid;
  const m = e ? e.media : previa;
  const d = dlg();
  d.innerHTML = plantilla(e, m);
  d.style.setProperty("--tinte", e ? tinte(e) : (m?.coverImage?.color || "#ff6b1a"));
  if (!d.open) d.showModal();
  d.scrollTop = 0;
  if (e && esMia(e.uid)) conectaRegistro(d, e);
  else conectaAlta(d, m, e);
  d.querySelector("[data-cierra]").addEventListener("click", () => d.close());
  d.querySelector("[data-mio]")?.addEventListener("click", (ev) => abre(ev.currentTarget.dataset.mio));
  if (m?.id) { cargaDetalle(d, m.id); cargaOtros(d, m.id, e); }
}

export function cierra() { if (dlg().open) dlg().close(); }

function plantilla(e, m) {
  const titulo = e ? e.titulo : tituloApi(m);
  const tipo = e ? TIPOS[e.tipo] : TIPOS[m?.type === "MANGA" ? "manga" : m?.format === "MOVIE" ? "peli" : "anime"];
  const falso = e || { titulo, media: m, tipo: "anime" };
  const meta = m ? [
    FORMATOS[m.format] || m.format,
    m.episodes ? `${m.episodes} ep${m.duration ? " × " + m.duration + " min" : ""}` : (m.chapters ? m.chapters + " capítulos" : null),
    m.season ? `${SEASON[m.season]} ${m.seasonYear}` : m.seasonYear,
    m.studio, STATUS[m.status],
  ].filter(Boolean) : [tipo?.nombre, "Sin vincular a AniList"];
  const sig = m?.nextAiringEpisode;
  return `
  <div class="fi-banner" ${m?.bannerImage ? `style="background-image:url('${esc(m.bannerImage)}')"` : ""}></div>
  <button class="fi-cierra" data-cierra aria-label="Cerrar">✕<small>ESC</small></button>
  <header class="fi-cab">
    <div class="fi-cartel holo"><div class="carta-img">${cartel(falso, { grande: true })}</div><div class="carta-brillo"></div></div>
    <div class="fi-tit">
      <span class="etq">${esc(tipo?.jp || "")} · ${esc(tipo?.nombre || "")}</span>
      <h2>${esc(titulo)}</h2>
      ${m ? `<p class="fi-alt">${esc([m.title.romaji !== titulo ? m.title.romaji : null, m.title.native].filter(Boolean).join(" · "))}</p>` : ""}
      <ul class="fi-meta">${meta.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <div class="fi-cifras">
        ${m?.averageScore ? `<div><small>AniList</small><b>${(m.averageScore / 10).toFixed(1)}</b></div>` : ""}
        ${m?.popularity ? `<div><small>Popularidad</small><b>${m.popularity.toLocaleString("es-ES")}</b></div>` : ""}
        ${sig ? `<div class="fi-sig"><small>Ep ${sig.episode} en</small><b>${cuentaAtras(sig.airingAt - Date.now() / 1000)}</b></div>` : ""}
      </div>
      ${m?.genres?.length ? `<div class="fi-gen">${m.genres.map((g) => `<span>${esc(genero(g))}</span>`).join("")}</div>` : ""}
    </div>
  </header>
  ${e && esMia(e.uid) ? registro(e) : e ? ajeno(e) + alta(m, e) : alta(m)}
  ${m?.id ? `<div id="fi-otros"></div>` : ""}
  <div id="fi-det">${m?.id ? `<div class="cargando"><span></span>Descargando expediente…</div>` : ""}</div>`;
}

function registro(e) {
  const r = rango(e.nota);
  const m = e.media;
  const total = m?.episodes;
  const conEp = e.tipo !== "manga" && e.tipo !== "peli";
  const anio = new Date().getFullYear();
  return `<section class="fi-reg panel esquinas">
    <h3 class="p-tit"><span>Tu registro</span><i>記録</i><small class="fi-guardado" aria-live="polite"></small></h3>
    <div class="fi-estados" role="radiogroup" aria-label="Estado">
      ${Object.entries(ESTADOS).map(([k, v]) => `<button role="radio" aria-checked="${e.estado === k}" class="${e.estado === k ? "on" : ""}" data-estado="${k}" style="--c:${v.color}">
        <i>${v.jp}</i>${ESTADO_AL[k]}</button>`).join("")}
    </div>
    <div class="fi-rejilla">
      <div class="fi-nota ${r ? r.clase : "sin-nota"}">
        <span class="etq">Nota</span>
        <div class="fn-lectura"><b id="fn-num">${e.nota == null ? "—" : fmtNota(e.nota)}</b><i id="fn-r">${r ? r.r : ""}</i></div>
        <input type="range" id="fn-rango" min="0" max="10" step="0.1" value="${e.nota ?? 7}" aria-label="Nota de 0 a 10" ${e.nota == null ? 'data-vacia="1"' : ""}>
        <div class="fn-pie"><span>0</span><button class="enlace" data-sin-nota>${e.nota == null ? "Arrastra para puntuar" : "Quitar nota"}</button><span>10</span></div>
      </div>
      <div class="fi-campos">
        ${conEp ? `<label class="campo"><span>Progreso</span>
          <div class="paso"><button data-ep="-1" aria-label="Un episodio menos">−</button>
          <input id="fi-prog" type="number" min="0" ${total ? `max="${total}"` : ""} value="${e.progreso || 0}">
          <em>/ ${total || "?"}</em><button data-ep="1" aria-label="Un episodio más">＋</button></div></label>` : ""}
        <label class="campo"><span>Cuándo</span><div class="cuando">
          <select id="fi-mes"><option value="">Sin mes</option>${MESES.map((n, i) => `<option value="${i + 1}" ${e.mes === i + 1 ? "selected" : ""}>${n}</option>`).join("")}</select>
          <input id="fi-anio" type="number" min="1960" max="${anio + 1}" value="${e.anio || ""}" placeholder="Año"></div></label>
        <label class="campo"><span>Tipo</span><select id="fi-tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${e.tipo === k ? "selected" : ""}>${v.nombre}</option>`).join("")}</select></label>
        <label class="campo"><span>Tu título</span><input id="fi-titulo" value="${esc(e.titulo)}" maxlength="120"></label>
      </div>
    </div>
    <label class="campo"><span>Comentario</span><textarea id="fi-com" rows="3" maxlength="600" placeholder="Lo que te pareció, sin spoilers… o con.">${esc(e.comentario || "")}</textarea></label>
    <div class="fi-acc">
      <button class="btn" data-vincula>${m ? "↺ Cambiar vínculo de AniList" : "⌁ Vincular con AniList"}</button>
      ${m?.siteUrl ? `<a class="btn" href="${esc(m.siteUrl)}" target="_blank" rel="noopener">Abrir en AniList ↗</a>` : ""}
      <span class="hueco"></span>
      <button class="btn peligro" data-borra>Borrar del archivo</button>
    </div>
  </section>`;
}

// Registro de otro operador, en solo lectura
function ajeno(e) {
  const r = rango(e.nota), es = ESTADOS[e.estado], dueno = sujetoActual();
  const total = e.media?.episodes;
  return `<section class="fi-reg panel esquinas fi-ajeno">
    <h3 class="p-tit"><span>Registro de ${esc(dueno?.nombre || "otro operador")}</span><i>記録</i><small>@${esc(dueno?.alias || "")} · solo lectura</small></h3>
    <div class="fa-fila">
      <div class="fa-nota ${r ? r.clase : "sin-nota"}"><b>${e.nota == null ? "—" : fmtNota(e.nota)}</b><i>${r ? r.r : ""}</i></div>
      <div class="fa-datos">
        <span class="fa-estado" style="--c:${es.color}"><i>${es.jp}</i>${es.nombre}</span>
        <small>${[total ? `${e.progreso || 0}/${total} ep` : null, e.mes ? MESES[e.mes - 1] : null, e.anio].filter(Boolean).join(" · ")}</small>
      </div>
    </div>
    ${e.comentario ? `<blockquote class="fa-com">${esc(e.comentario)}</blockquote>` : ""}
  </section>`;
}

function alta(m, ajena = null) {
  const mia = m?.id ? porMedia(m.id) : null;
  if (mia) return `<section class="fi-reg panel esquinas fi-alta"><h3 class="p-tit"><span>Tu archivo</span><i>登録</i></h3>
    <div class="fi-acc"><button class="btn primario" data-mio="${esc(mia.uid)}">Ya lo tienes · abrir tu registro ▸</button></div></section>`;
  return `<section class="fi-reg panel esquinas fi-alta">
    <h3 class="p-tit"><span>${ajena ? "Añadir a tu archivo" : "Añadir al archivo"}</span><i>登録</i></h3>
    <div class="fi-estados">${["pendiente", "viendo", "visto"].map((k) => `<button data-alta="${k}" style="--c:${ESTADOS[k].color}"><i>${ESTADOS[k].jp}</i>Como ${ESTADO_AL[k].toLowerCase()}</button>`).join("")}</div>
    ${m?.siteUrl ? `<div class="fi-acc"><a class="btn" href="${esc(m.siteUrl)}" target="_blank" rel="noopener">Abrir en AniList ↗</a></div>` : ""}
  </section>`;
}

function conectaAlta(d, m, ajena = null) {
  d.querySelectorAll("[data-alta]").forEach((b) => b.addEventListener("click", () => {
    const ya = m?.id ? porMedia(m.id) : null;
    if (ya) return abre(ya.uid);
    const estado = b.dataset.alta;
    // Sin ficha de AniList (serie o peli de un amigo) se copia su título y tipo
    const e = m ? anade({ mediaId: m.id, media: m, titulo: tituloApi(m), estado,
      tipo: m.type === "MANGA" ? "manga" : m.format === "MOVIE" ? "peli" : "anime",
      progreso: estado === "visto" ? (m.episodes || 0) : 0 })
      : anade({ titulo: ajena.titulo, tipo: ajena.tipo, estado });
    aviso(`«${e.titulo}» entra en el archivo.`);
    abre(e.uid);
  }));
}

function conectaRegistro(d, e0) {
  const uid = e0.uid;
  const e = () => entrada(uid);
  const guardado = d.querySelector(".fi-guardado");
  let t;
  const marca = () => { guardado.textContent = "● guardado"; clearTimeout(t); t = setTimeout(() => (guardado.textContent = ""), 1400); };
  const pon = (cambios, opc) => { actualiza(uid, cambios, opc); marca(); };

  // Estado
  d.querySelectorAll("[data-estado]").forEach((b) => b.addEventListener("click", () => {
    const estado = b.dataset.estado, x = e();
    const cambios = { estado };
    const total = x.media?.episodes;
    if ((estado === "visto" || estado === "revisto") && total && (x.progreso || 0) < total) cambios.progreso = total;
    if (estado === "visto" && x.estado !== "visto") { const h = new Date(); cambios.mes = h.getMonth() + 1; cambios.anio = h.getFullYear(); }
    pon(cambios);
    d.querySelectorAll("[data-estado]").forEach((o) => { o.classList.toggle("on", o === b); o.setAttribute("aria-checked", o === b); });
    if (cambios.progreso != null) { const p = d.querySelector("#fi-prog"); if (p) p.value = cambios.progreso; }
    if (cambios.mes) { d.querySelector("#fi-mes").value = cambios.mes; d.querySelector("#fi-anio").value = cambios.anio; }
  }));

  // Nota
  const rg = d.querySelector("#fn-rango"), num = d.querySelector("#fn-num"), letra = d.querySelector("#fn-r"), caja = d.querySelector(".fi-nota");
  const pintaNota = (n) => {
    const r = rango(n);
    num.textContent = n == null ? "—" : fmtNota(n);
    letra.textContent = r ? r.r : "";
    caja.className = "fi-nota " + (r ? r.clase : "sin-nota");
    d.querySelector("[data-sin-nota]").textContent = n == null ? "Arrastra para puntuar" : "Quitar nota";
  };
  rg.addEventListener("input", () => pintaNota(+rg.value));
  rg.addEventListener("change", () => {
    const antes = e().nota, n = +(+rg.value).toFixed(1);
    pon({ nota: n });
    if (n >= 10 && (antes == null || antes < 10)) tarjetaTitulo({ jp: "傑作", linea1: "OBRA MAESTRA", linea2: e().titulo, clase: "oro" });
  });
  d.querySelector("[data-sin-nota]").addEventListener("click", () => { if (e().nota != null) { pon({ nota: null }); pintaNota(null); } });

  // Progreso
  const prog = d.querySelector("#fi-prog");
  const ponProg = (v) => {
    const x = e(), total = x.media?.episodes;
    v = Math.max(0, total ? Math.min(total, v) : v);
    prog.value = v;
    const cambios = { progreso: v };
    if (x.estado === "pendiente" && v > 0) cambios.estado = "viendo";
    if (total && v >= total && x.estado === "viendo") {
      cambios.estado = "visto"; const h = new Date(); cambios.mes = h.getMonth() + 1; cambios.anio = h.getFullYear();
      tarjetaTitulo({ jp: "完", linea1: "TERMINADA", linea2: x.titulo });
    }
    pon(cambios, { agrupa: true });
    if (cambios.estado) d.querySelectorAll("[data-estado]").forEach((o) => { o.classList.toggle("on", o.dataset.estado === cambios.estado); o.setAttribute("aria-checked", o.dataset.estado === cambios.estado); });
  };
  d.querySelectorAll("[data-ep]").forEach((b) => b.addEventListener("click", () => ponProg((+prog.value || 0) + +b.dataset.ep)));
  prog?.addEventListener("change", () => ponProg(+prog.value || 0));

  // Campos sueltos
  d.querySelector("#fi-mes").addEventListener("change", (ev) => pon({ mes: +ev.target.value || null }));
  d.querySelector("#fi-anio").addEventListener("change", (ev) => pon({ anio: +ev.target.value || null }));
  d.querySelector("#fi-tipo").addEventListener("change", (ev) => pon({ tipo: ev.target.value }));
  let tt;
  d.querySelector("#fi-titulo").addEventListener("input", (ev) => { clearTimeout(tt); tt = setTimeout(() => { const v = ev.target.value.trim(); if (v) { pon({ titulo: v }, { agrupa: true }); d.querySelector(".fi-tit h2").textContent = v; } }, 400); });
  let tc;
  d.querySelector("#fi-com").addEventListener("input", (ev) => { clearTimeout(tc); tc = setTimeout(() => pon({ comentario: ev.target.value }, { agrupa: true }), 500); });

  d.querySelector("[data-vincula]").addEventListener("click", () => alAbrirPaleta?.({ revincula: uid, texto: e().media ? tituloApi(e().media) : e().titulo }));
  d.querySelector("[data-borra]").addEventListener("click", () => {
    const t = e().titulo;
    borra(uid); d.close();
    aviso(`«${t}» borrado.`, { accion: "Deshacer", alPulsar: () => { deshaz(); aviso("Recuperado."); } });
  });
}

async function cargaDetalle(d, id) {
  const caja = d.querySelector("#fi-det");
  let x;
  try { x = await detalle(id); }
  catch (err) { if (caja.isConnected) caja.innerHTML = `<p class="tenue fi-error">No se pudo descargar el expediente de AniList (${esc(err.message)}).</p>`; return; }
  if (!caja.isConnected || !d.open) return;
  const tags = (x.tags || []).filter((t) => !t.isMediaSpoiler && t.rank >= 60).slice(0, 10);
  const ranks = (x.rankings || []).filter((r) => r.allTime || r.rank <= 50).slice(0, 3);
  const rel = (x.relations?.edges || []).filter((r) => r.relationType !== "CHARACTER")
    .sort((a, b) => ordenRel(a) - ordenRel(b)).slice(0, 12);
  const pers = x.characters?.edges || [];
  caja.innerHTML = `
    ${x.description ? `<section class="fi-sec"><h3 class="p-tit"><span>Sinopsis</span><i>あらすじ</i><small>en inglés, de AniList</small></h3>
      <div class="fi-sinopsis">${htmlSeguro(x.description)}</div></section>` : ""}
    ${ranks.length || tags.length ? `<section class="fi-sec"><div class="fi-ranks">${ranks.map((r) => `<span class="rk">#${r.rank}<small>${esc(r.context)}${r.year && !r.allTime ? " " + r.year : ""}</small></span>`).join("")}</div>
      <div class="fi-tags">${tags.map((t) => `<span>${esc(t.name)}<i>${t.rank}%</i></span>`).join("")}</div></section>` : ""}
    ${pers.length ? `<section class="fi-sec"><h3 class="p-tit"><span>Personajes</span><i>登場人物</i></h3>
      <div class="fi-pers">${pers.map((p) => `<figure><img src="${esc(p.node.image?.medium || "")}" alt="" loading="lazy"><figcaption>${esc(p.node.name.full)}<small>${p.role === "MAIN" ? "Principal" : p.role === "SUPPORTING" ? "Secundario" : "Extra"}</small></figcaption></figure>`).join("")}</div></section>` : ""}
    ${rel.length ? `<section class="fi-sec"><h3 class="p-tit"><span>Relacionados</span><i>関連</i></h3>
      <div class="fi-rel">${rel.map((r) => { const n = r.node; const ya = porMedia(n.id);
        return `<button class="rel ${ya ? "ya" : ""}" data-rel="${n.id}"><div class="rel-img">${n.coverImage ? `<img src="${esc(n.coverImage.large)}" alt="" loading="lazy">` : ""}</div>
          <span class="rel-t"><small>${RELACION[r.relationType] || r.relationType} · ${esc(FORMATOS[n.format] || n.format || "")}${n.seasonYear ? " · " + n.seasonYear : ""}</small>${esc(tituloApi(n))}</span>
          <em>${ya ? "✓" : "＋"}</em></button>`; }).join("")}</div></section>` : ""}`;
  caja.querySelectorAll("[data-rel]").forEach((b) => b.addEventListener("click", () => {
    const n = x.relations.edges.find((r) => r.node.id === +b.dataset.rel).node;
    const ya = porMedia(n.id);
    const { studios, ...resto } = n;
    abre(ya ? ya.uid : null, ya ? null : { ...resto, studio: studios?.nodes?.[0]?.name || null });
  }));
}

// Lo que el resto de operadores ha registrado de este título
async function cargaOtros(d, mediaId, e) {
  const caja = d.querySelector("#fi-otros");
  if (!caja) return;
  let filas;
  try { filas = await otrosDe(mediaId, yoMismo().id); } catch { return; }
  if (!caja.isConnected || !filas.length) return;
  const conNota = filas.filter((f) => f.nota != null);
  const media = conNota.length ? conNota.reduce((a, f) => a + +f.nota, 0) / conNota.length : null;
  caja.innerHTML = `<section class="fi-sec"><h3 class="p-tit"><span>Otros operadores</span><i>仲間</i>
      <small>${filas.length} lo tienen${media != null ? ` · media ${fmtNota(+media.toFixed(1))}` : ""}</small></h3>
    <ul class="fi-otros">${filas.map((f) => { const r = f.nota != null ? rango(+f.nota) : null; const es = ESTADOS[f.estado]; const p = f.perfiles;
      return `<li><a href="#/@${esc(p.alias)}" class="fo-av">${p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="" referrerpolicy="no-referrer">` : `<span>${esc(p.nombre[0] || "?")}</span>`}</a>
        <div class="fo-d"><b>${esc(p.nombre)}</b> <span style="color:${es.color}">${es.nombre.toLowerCase()}</span>
        ${f.comentario ? `<p>«${esc(f.comentario)}»</p>` : ""}</div>
        <span class="fo-nota ${r ? r.clase : ""}">${r ? `${fmtNota(+f.nota)}<i>${r.r}</i>` : "—"}</span></li>`; }).join("")}</ul></section>`;
  caja.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => d.close()));
}
