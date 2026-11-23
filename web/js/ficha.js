// Ficha de un título: datos de AniList arriba y tu registro (estado, nota,
// progreso, fecha, comentario) debajo, que se guarda solo al tocarlo. También
// sirve de vista previa para algo que aún no está en el archivo, y de ficha
// en solo lectura cuando el registro es de otro operador.
import { $, esc, cartel, rango, fmtNota, ESTADOS, TIPOS, MESES, FORMATOS, tituloApi, genero, aviso,
  tarjetaTitulo, htmlSeguro, cuentaAtras, tinte, formato, nombreTipo, totalDe, unidad, seLee, infoTipo, tipoDe } from "./ui.js";
import { entrada, actualiza, borra, anade, porMedia, deshaz, esMia, sujetoActual, yoMismo } from "./almacen.js";
import { detalle, sagas, refrescar } from "./anilist.js";
import { otrosDe, perfilCorto } from "./nube.js";
import { boton as botonRecomendar } from "./recos.js";

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
  d.dataset.media = m?.id || "";
  d.innerHTML = plantilla(e, m);
  d.style.setProperty("--tinte", e ? tinte(e) : (m?.coverImage?.color || "#ff6b1a"));
  if (!d.open) d.showModal();
  d.scrollTop = 0;
  if (e && esMia(e.uid)) conectaRegistro(d, e);
  else conectaAlta(d, m, e);
  d.querySelector("[data-cierra]").addEventListener("click", () => d.close());
  d.querySelector("[data-mio]")?.addEventListener("click", (ev) => abre(ev.currentTarget.dataset.mio));
  if (m?.id) { cargaDetalle(d, m.id); cargaSaga(d, m.id); cargaOtros(d, m.id, e); botonRecomendar(d.querySelector("#fi-recomienda"), m); }
  if (e?.recomendadoPor) quienRecomendo(d, e.recomendadoPor);
}

export function cierra() { if (dlg().open) dlg().close(); }

// Vista previa de algo que no tienes, a partir de la ficha corta de una saga
// (título, portada, formato, año…): se abre al momento y, cuando llega la
// completa de AniList (banner, géneros, nota…), se repinta sin mover el
// scroll. Antes se esperaba a la completa y, si AniList iba lento, parecía
// que pulsar no hacía nada.
const CAMPOS_CORTA = ["id", "type", "format", "status", "season", "seasonYear", "episodes", "chapters", "title", "coverImage", "nextAiringEpisode"];
export function abrePrevia(nodo) {
  const ya = porMedia(nodo.id);
  if (ya) return abre(ya.uid);
  abre(null, Object.fromEntries(CAMPOS_CORTA.map((k) => [k, nodo[k] ?? null])));
  refrescar([nodo.id]).then(([m]) => {
    const d = dlg();
    if (!m || !d.open || actual !== null || d.dataset.media !== String(nodo.id)) return;
    const y = d.scrollTop;
    abre(null, m);
    d.scrollTop = y;
  }).catch(() => {});
}

function plantilla(e, m) {
  const titulo = e ? e.titulo : tituloApi(m);
  const claveTipo = e ? e.tipo : tipoDe(m);
  const tipo = infoTipo(claveTipo);
  const falso = e || { titulo, media: m, tipo: "anime" };
  const meta = m ? [
    formato(m),
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
      <span class="etq">${esc(tipo?.jp || "")} · ${esc(nombreTipo(claveTipo, m))}</span>
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
  ${m?.id ? `<div id="fi-saga"></div><div id="fi-recomienda"></div><div id="fi-otros"></div>` : ""}
  <div id="fi-det">${m?.id ? `<div class="cargando"><span></span>Descargando expediente…</div>` : ""}</div>`;
}

function registro(e) {
  const r = rango(e.nota);
  const m = e.media;
  const total = totalDe(e);
  const conProg = e.tipo !== "peli";
  const cosa = seLee(e) ? "capítulo" : "episodio";
  return `<section class="fi-reg panel esquinas">
    <h3 class="p-tit"><span>Tu registro</span><i>記録</i><small class="fi-guardado" aria-live="polite"></small></h3>
    ${e.recomendadoPor ? `<p class="fi-recomendado" hidden></p>` : ""}
    <div class="fi-estados" role="radiogroup" aria-label="Estado">
      ${Object.entries(ESTADOS).map(([k, v]) => `<button role="radio" aria-checked="${e.estado === k}" class="${e.estado === k ? "on" : ""}" data-estado="${k}" style="--c:${v.color}">
        <i>${v.jp}</i>${ESTADO_AL[k]}</button>`).join("")}
    </div>
    <div class="fi-rejilla">
      <div class="fi-nota ${r ? r.clase : "sin-nota"}">
        <span class="etq">Nota</span>
        <div class="fn-lectura">
          <button class="fn-paso" data-paso="-1" aria-label="Bajar una décima" title="Bajar 0,1 (mantén pulsado para seguir)">−</button>
          <span class="fn-centro"><input id="fn-num" inputmode="decimal" autocomplete="off" maxlength="4" aria-label="Nota, escríbela o usa − y ＋"
            value="${e.nota == null ? "" : fmtNota(e.nota)}" placeholder="—"><i id="fn-r">${r ? r.r : ""}</i></span>
          <button class="fn-paso" data-paso="1" aria-label="Subir una décima" title="Subir 0,1 (mantén pulsado para seguir)">＋</button>
        </div>
        <input type="range" id="fn-rango" min="0" max="10" step="0.1" value="${e.nota ?? 7}" aria-label="Nota de 0 a 10" ${e.nota == null ? 'data-vacia="1"' : ""}>
        <div class="fn-pie"><span>0</span><button class="enlace" data-sin-nota>${e.nota == null ? "Arrastra para puntuar" : "Quitar nota"}</button><span>10</span></div>
      </div>
      <div class="fi-campos">
        ${conProg ? `<label class="campo"><span>Progreso · ${seLee(e) ? "capítulos" : "episodios"}</span>
          <div class="paso"><button data-ep="-1" aria-label="Un ${cosa} menos">−</button>
          <input id="fi-prog" type="number" min="0" ${total ? `max="${total}"` : ""} value="${e.progreso || 0}" style="--d:${String(e.progreso || 0).length}">
          <em>/ ${total || "?"}</em><button data-ep="1" aria-label="Un ${cosa} más">＋</button></div></label>` : ""}
        <label class="campo"><span>Tipo</span><select id="fi-tipo">${Object.entries(TIPOS[e.tipo] ? TIPOS : { ...TIPOS, [e.tipo]: infoTipo(e.tipo) }).map(([k, v]) => `<option value="${k}" ${e.tipo === k ? "selected" : ""}>${v.nombre}</option>`).join("")}</select></label>
        ${cuando(e)}
        <label class="campo campo-ancho"><span>Tu título</span><input id="fi-titulo" value="${esc(e.titulo)}" maxlength="120"></label>
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

// Cuándo lo viste: año con ◀ ▶ (o escrito), los doce meses a la vista y
// "Atemporal" para lo que no tiene fecha (lo de la infancia, lo que ya ni
// recuerdas). Atemporal es simplemente no tener año: va al final del archivo.
function cuando(e) {
  const sin = !e.anio;
  return `<div class="campo campo-ancho"><span>Cuándo</span>
    <div class="cuando ${sin ? "atemporal" : ""}" id="fi-cuando">
      <div class="cu-cab">
        <div class="cu-anio">
          <button data-cu-anio="-1" aria-label="Año anterior">◀</button>
          <input id="fi-anio" inputmode="numeric" maxlength="4" autocomplete="off" value="${e.anio || ""}" placeholder="∞" aria-label="Año">
          <button data-cu-anio="1" aria-label="Año siguiente">▶</button>
        </div>
        <button class="cu-atemporal ${sin ? "on" : ""}" data-atemporal aria-pressed="${sin}" title="Sin fecha: no importa cuándo lo viste">∞ Atemporal</button>
      </div>
      <div class="cu-meses" role="group" aria-label="Mes (púlsalo otra vez para quitarlo)">
        ${MESES.map((n, i) => { const on = !sin && e.mes === i + 1;
          return `<button data-mes="${i + 1}" class="${on ? "on" : ""}" aria-pressed="${on}" title="${n}">${n.slice(0, 3)}</button>`; }).join("")}
      </div>
    </div></div>`;
}

// Registro de otro operador, en solo lectura
function ajeno(e) {
  const r = rango(e.nota), es = ESTADOS[e.estado], dueno = sujetoActual();
  const total = totalDe(e);
  return `<section class="fi-reg panel esquinas fi-ajeno">
    <h3 class="p-tit"><span>Registro de ${esc(dueno?.nombre || "otro operador")}</span><i>記録</i><small>@${esc(dueno?.alias || "")} · solo lectura</small></h3>
    <div class="fa-fila">
      <div class="fa-nota ${r ? r.clase : "sin-nota"}"><b>${e.nota == null ? "—" : fmtNota(e.nota)}</b><i>${r ? r.r : ""}</i></div>
      <div class="fa-datos">
        <span class="fa-estado" style="--c:${es.color}"><i>${es.jp}</i>${es.nombre}</span>
        <small>${[total ? `${e.progreso || 0}/${total} ${unidad(e)}` : null, e.anio && e.mes ? MESES[e.mes - 1] : null, e.anio || "∞ Atemporal"].filter(Boolean).join(" · ")}</small>
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
    // Sin ficha de AniList (algo que AniList no tiene) se copia su título y tipo
    const e = m ? anade({ mediaId: m.id, media: m, titulo: tituloApi(m), estado,
      tipo: tipoDe(m),
      progreso: estado === "visto" ? ((m.type === "MANGA" ? m.chapters : m.episodes) || 0) : 0 })
      : anade({ titulo: ajena.titulo, tipo: TIPOS[ajena.tipo] ? ajena.tipo : "anime", estado });
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
    const total = totalDe(x);
    if ((estado === "visto" || estado === "revisto") && total && (x.progreso || 0) < total) cambios.progreso = total;
    if (estado === "visto" && x.estado !== "visto") { const h = new Date(); cambios.mes = h.getMonth() + 1; cambios.anio = h.getFullYear(); }
    pon(cambios);
    d.querySelectorAll("[data-estado]").forEach((o) => { o.classList.toggle("on", o === b); o.setAttribute("aria-checked", o === b); });
    if (cambios.progreso != null) { const p = d.querySelector("#fi-prog"); if (p) p.value = cambios.progreso; }
    if (cambios.mes) pintaCuando();
  }));

  // Nota: la barra para ir rápido; − y ＋ (o escribirla) para afinar la décima,
  // que con la barra cuesta acertar. Mantener − o ＋ pulsado sigue contando y
  // se guarda una sola vez al soltar.
  const rg = d.querySelector("#fn-rango"), num = d.querySelector("#fn-num"), letra = d.querySelector("#fn-r"), caja = d.querySelector(".fi-nota");
  const redondea = (n) => Math.min(10, Math.max(0, Math.round(n * 10) / 10));
  const pintaNota = (n, { tecleando = false } = {}) => {
    const r = rango(n);
    if (!tecleando) num.value = n == null ? "" : fmtNota(n);
    letra.textContent = r ? r.r : "";
    caja.className = "fi-nota " + (r ? r.clase : "sin-nota");
    if (n != null) { rg.value = n; rg.removeAttribute("data-vacia"); } else rg.setAttribute("data-vacia", "1");
    d.querySelector("[data-sin-nota]").textContent = n == null ? "Arrastra para puntuar" : "Quitar nota";
  };
  const guardaNota = (n) => {
    const antes = e().nota;
    if (n === antes) return;
    pon({ nota: n });
    if (n >= 10 && (antes == null || antes < 10)) tarjetaTitulo({ jp: "傑作", linea1: "OBRA MAESTRA", linea2: e().titulo, clase: "oro" });
  };
  rg.addEventListener("input", () => pintaNota(+rg.value));
  rg.addEventListener("change", () => guardaNota(redondea(+rg.value)));
  d.querySelector("[data-sin-nota]").addEventListener("click", () => { if (e().nota != null) { pon({ nota: null }); pintaNota(null); } });

  // − / ＋
  let enCurso = null, repite = null;
  const paso = (dir) => { enCurso = redondea((enCurso ?? e().nota ?? +rg.value) + dir / 10); pintaNota(enCurso); };
  const suelta = () => {
    clearTimeout(repite); clearInterval(repite);
    if (enCurso != null) { guardaNota(enCurso); enCurso = null; }
  };
  d.querySelectorAll("[data-paso]").forEach((b) => {
    const dir = +b.dataset.paso;
    b.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      b.setPointerCapture(ev.pointerId);
      paso(dir);
      repite = setTimeout(() => { repite = setInterval(() => paso(dir), 80); }, 420);
    });
    b.addEventListener("pointerup", suelta);
    b.addEventListener("pointercancel", suelta);
    // Con teclado (Intro o espacio sobre el botón) llega un clic sin puntero
    b.addEventListener("click", (ev) => { if (ev.detail === 0) { paso(dir); suelta(); } });
  });

  // Escribirla: admite coma o punto; Intro o salir del campo guarda, Esc deshace
  const leeTecleada = () => {
    const t = num.value.trim().replace(",", ".");
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? redondea(n) : undefined;
  };
  num.addEventListener("focus", () => num.select());
  num.addEventListener("input", () => { const n = leeTecleada(); if (n != null) pintaNota(n, { tecleando: true }); });
  num.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") { ev.preventDefault(); num.blur(); }
    if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); num.value = ""; pintaNota(e().nota); num.blur(); }
    if (ev.key === "ArrowUp" || ev.key === "ArrowDown") { ev.preventDefault(); paso(ev.key === "ArrowUp" ? 1 : -1); suelta(); }
  });
  num.addEventListener("blur", () => {
    const n = leeTecleada();
    // Vacío o algo que no es un número: se queda la nota que había
    if (n == null) { pintaNota(e().nota); return; }
    pintaNota(n);
    guardaNota(n);
  });

  // Progreso
  const prog = d.querySelector("#fi-prog");
  const ponProg = (v) => {
    const x = e(), total = totalDe(x);
    v = Math.max(0, total ? Math.min(total, v) : v);
    prog.value = v;
    prog.style.setProperty("--d", String(v).length);
    const cambios = { progreso: v };
    if (x.estado === "pendiente" && v > 0) cambios.estado = "viendo";
    if (total && v >= total && x.estado === "viendo") {
      cambios.estado = "visto"; const h = new Date(); cambios.mes = h.getMonth() + 1; cambios.anio = h.getFullYear();
      tarjetaTitulo({ jp: "完", linea1: seLee(x) ? "LEÍDO" : "TERMINADA", linea2: x.titulo });
    }
    pon(cambios, { agrupa: true });
    if (cambios.mes) pintaCuando();
    if (cambios.estado) d.querySelectorAll("[data-estado]").forEach((o) => { o.classList.toggle("on", o.dataset.estado === cambios.estado); o.setAttribute("aria-checked", o.dataset.estado === cambios.estado); });
  };
  d.querySelectorAll("[data-ep]").forEach((b) => b.addEventListener("click", () => ponProg((+prog.value || 0) + +b.dataset.ep)));
  prog?.addEventListener("change", () => ponProg(+prog.value || 0));
  // El campo mide lo que el número, para que "12 / 222" quede centrado
  prog?.addEventListener("input", () => prog.style.setProperty("--d", Math.max(1, prog.value.length)));

  // Cuándo
  const cu = d.querySelector("#fi-cuando"), inAnio = d.querySelector("#fi-anio");
  function pintaCuando() {
    const x = e(), sin = !x.anio;
    cu.classList.toggle("atemporal", sin);
    inAnio.value = x.anio || "";
    const at = cu.querySelector("[data-atemporal]");
    at.classList.toggle("on", sin); at.setAttribute("aria-pressed", sin);
    cu.querySelectorAll("[data-mes]").forEach((b) => {
      const on = !sin && x.mes === +b.dataset.mes;
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", on);
    });
  }
  const hoy = () => new Date();
  const ponCuando = (cambios) => { pon(cambios); pintaCuando(); };
  const ponAnio = (a) => ponCuando({ anio: Math.min(hoy().getFullYear() + 1, Math.max(1960, a)) });
  // Desde Atemporal, ◀ ▶ empiezan en el año actual
  cu.querySelectorAll("[data-cu-anio]").forEach((b) => b.addEventListener("click", () => {
    const a = e().anio;
    ponAnio(a ? a + +b.dataset.cuAnio : hoy().getFullYear());
  }));
  inAnio.addEventListener("focus", () => inAnio.select());
  inAnio.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); inAnio.blur(); } });
  inAnio.addEventListener("change", () => {
    const v = inAnio.value.trim();
    if (!v) return ponCuando({ anio: null, mes: null });
    const a = parseInt(v, 10);
    if (a >= 1960) ponAnio(a); else pintaCuando();
  });
  cu.querySelectorAll("[data-mes]").forEach((b) => b.addEventListener("click", () => {
    const x = e(), mes = +b.dataset.mes;
    if (!x.anio) ponCuando({ anio: hoy().getFullYear(), mes });
    else ponCuando({ mes: x.mes === mes ? null : mes });
  }));
  cu.querySelector("[data-atemporal]").addEventListener("click", () => {
    if (e().anio) ponCuando({ anio: null, mes: null });
    else ponCuando({ anio: hoy().getFullYear(), mes: hoy().getMonth() + 1 });
  });

  // Campos sueltos
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
          <span class="rel-t"><small>${RELACION[r.relationType] || r.relationType} · ${esc(formato(n) || "")}${n.seasonYear ? " · " + n.seasonYear : ""}</small>${esc(tituloApi(n))}</span>
          <em>${ya ? "✓" : "＋"}</em></button>`; }).join("")}</div></section>` : ""}`;
  caja.querySelectorAll("[data-rel]").forEach((b) => b.addEventListener("click", () => {
    const n = x.relations.edges.find((r) => r.node.id === +b.dataset.rel).node;
    const ya = porMedia(n.id);
    const { studios, ...resto } = n;
    abre(ya ? ya.uid : null, ya ? null : { ...resto, studio: studios?.nodes?.[0]?.name || null });
  }));
}

// Temporadas: la saga entera en orden, con lo que tienes de cada una. Lo que
// no tienes se abre como vista previa o se apunta como pendiente con ＋.
const ESTADO_CORTO = { visto: "Vista", viendo: "Viendo", pendiente: "Pendiente", revisto: "Revista", abandonado: "Abandonada" };
async function cargaSaga(d, id) {
  const caja = d.querySelector("#fi-saga");
  let s;
  try { s = (await sagas([id])).get(id); } catch { return; }
  if (!caja?.isConnected || !d.open || !s || s.cadena.length < 2) return;
  const tiene = s.cadena.filter((n) => porMedia(n.id)).length;
  caja.innerHTML = `<section class="fi-sec fi-saga">
    <h3 class="p-tit"><span>Temporadas</span><i>シリーズ</i><small>${tiene} de ${s.cadena.length} en tu archivo</small></h3>
    <ol class="sg-lista">${s.cadena.map((n, i) => {
      const mia = porMedia(n.id), es = mia ? ESTADOS[mia.estado] : null, r = mia ? rango(mia.nota) : null;
      const t = n.title.english || n.title.romaji || n.title.native || "";
      const extra = n.format && !["TV", "TV_SHORT", "ONA", "MANGA"].includes(n.format) ? FORMATOS[n.format] || n.format : null;
      return `<li class="sg-item ${n.id === id ? "actual" : ""} ${mia ? "mia" : ""}" style="--c:${es ? es.color : "var(--linea-2)"}">
        <button class="sg-abre" data-sg="${n.id}" title="${esc(t)}" ${n.id === id ? 'aria-current="true"' : ""}>
          <span class="sg-img">${n.coverImage?.large ? `<img src="${esc(n.coverImage.large)}" alt="" loading="lazy">` : ""}<b>${i + 1}</b></span>
          <span class="sg-t"><small>${esc([extra, n.seasonYear || (n.status === "NOT_YET_RELEASED" ? "Próx." : null)].filter(Boolean).join(" · "))}</small>
            <em>${mia ? `${ESTADO_CORTO[mia.estado]}${mia.nota != null ? ` · <i class="${r.clase}">${fmtNota(mia.nota)}</i>` : ""}` : "—"}</em></span>
        </button>
        ${mia ? "" : `<button class="sg-anade" data-sg-anade="${n.id}" title="Añadir a pendientes" aria-label="Añadir «${esc(t)}» a pendientes">＋</button>`}
      </li>`; }).join("")}</ol>
  </section>`;
  // La temporada abierta, a la vista dentro de la fila (sin mover la ficha)
  const lista = caja.querySelector(".sg-lista"), act = lista.querySelector(".actual");
  if (act) lista.scrollLeft = act.offsetLeft - lista.offsetLeft - (lista.clientWidth - act.offsetWidth) / 2;
  // Lo que no tienes llega con la ficha corta de la saga: antes de abrirlo o
  // añadirlo se pide la completa, como cualquier otro título
  const completa = async (nid) => (await refrescar([nid]))[0];
  caja.querySelectorAll("[data-sg]").forEach((b) => b.addEventListener("click", () => {
    const nid = +b.dataset.sg;
    if (nid === id) return;   // es la que ya tienes abierta
    abrePrevia(s.cadena.find((n) => n.id === nid));
  }));
  caja.querySelectorAll("[data-sg-anade]").forEach((b) => b.addEventListener("click", async () => {
    const nid = +b.dataset.sgAnade;
    b.disabled = true; b.textContent = "…";
    try {
      const m = await completa(nid);
      const ya = porMedia(nid);
      const e = ya || anade({ mediaId: m.id, media: m, titulo: tituloApi(m), tipo: tipoDe(m), estado: "pendiente" });
      aviso(`«${e.titulo}» a pendientes.`);
      cargaSaga(d, id);
    } catch (err) { aviso("AniList no responde: " + err.message); b.disabled = false; b.textContent = "＋"; }
  }));
}

// "Te lo recomendó…": el perfil se pide aparte (puede haber borrado su cuenta)
async function quienRecomendo(d, id) {
  const caja = d.querySelector(".fi-recomendado");
  if (!caja) return;
  let p;
  try { p = await perfilCorto(id); } catch { return; }
  if (!p || !caja.isConnected) return;
  caja.innerHTML = `<span>推</span> Te lo recomendó <a href="#/@${esc(p.alias)}">${esc(p.nombre)}</a>`;
  caja.hidden = false;
  caja.querySelector("a").addEventListener("click", () => d.close());
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
