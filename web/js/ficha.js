// Ficha de un título: datos de AniList arriba y tu registro (estado, nota,
// progreso, fecha, comentario) debajo, que se guarda solo al tocarlo. También
// sirve de vista previa para algo que aún no está en el archivo, y de ficha
// en solo lectura cuando el registro es de otro operador.
import { $, esc, cartel, rango, fmtNota, ESTADOS, TIPOS, MESES, FORMATOS, tituloApi, genero, aviso,
  tarjetaTitulo, htmlSeguro, cuentaAtras, tinte, formato, nombreTipo, totalDe, unidad, seLee, infoTipo, tipoDe } from "./ui.js";
import { entrada, actualiza, borra, anade, anadeLote, porMedia, deshaz, esMia, sujetoActual, yoMismo } from "./almacen.js";
import { detalle, sagas, refrescar, marcaSaga } from "./anilist.js";
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
  ${m?.id ? `<div id="fi-saga-aviso"></div>` : ""}
  ${e && esMia(e.uid) ? registro(e) : e ? ajeno(e) + alta(m, e) : alta(m)}
  ${m?.id ? `<div id="fi-saga"></div><div id="fi-recomienda"></div><div id="fi-otros"></div>` : ""}
  <div id="fi-det">${m?.id ? `<div class="cargando"><span></span>Descargando expediente…</div>` : ""}</div>`;
}

// Tu registro: una consola. Arriba un raíl con los cinco estados y una luz
// que se desliza al elegido; debajo la nota, con una barra recta que se
// arrastra; luego los episodios como segmentos que se encienden y se pulsan
// para saltar a uno.
const MAX_SEGMENTOS = 60;   // con más, una barra continua (también se pulsa)
function registro(e) {
  const r = rango(e.nota);
  const m = e.media;
  const total = totalDe(e);
  const conProg = e.tipo !== "peli";
  const cosa = seLee(e) ? "capítulo" : "episodio";
  const claves = Object.keys(ESTADOS), es = ESTADOS[e.estado];
  const hechos = e.progreso || 0;
  return `<section class="fi-reg reg" style="--ce:${es.color}" data-jp="${esc(es.jp)}">
    <h3 class="p-tit"><span>Tu registro</span><i>記録</i><small class="fi-guardado" aria-live="polite"></small></h3>
    ${e.recomendadoPor ? `<p class="fi-recomendado" hidden></p>` : ""}
    <div class="reg-estados" role="radiogroup" aria-label="Estado" style="--i:${claves.indexOf(e.estado)};--c:${es.color}">
      <span class="reg-luz" aria-hidden="true"></span>
      ${claves.map((k) => `<button role="radio" aria-checked="${e.estado === k}" class="${e.estado === k ? "on" : ""}" data-estado="${k}" style="--c:${ESTADOS[k].color}">
        <i>${ESTADOS[k].jp}</i><b>${ESTADO_AL[k]}</b></button>`).join("")}
    </div>
    <div class="reg-cuerpo">
      <div class="reg-dial ${r ? r.clase : "sin-nota"}" style="--nota:${e.nota ?? 0}">
        <div class="dial-lectura">
          <button class="fn-paso" data-paso="-1" aria-label="Bajar una décima" title="Bajar 0,1 (mantén pulsado para seguir)">−</button>
          <span class="dial-centro">
            <input id="fn-num" inputmode="decimal" autocomplete="off" maxlength="4" aria-label="Nota, escríbela, arrastra la barra o usa − y ＋"
              value="${e.nota == null ? "" : fmtNota(e.nota)}" placeholder="—">
            <i id="fn-r">${r ? r.r : ""}</i>
          </span>
          <button class="fn-paso" data-paso="1" aria-label="Subir una décima" title="Subir 0,1 (mantén pulsado para seguir)">＋</button>
        </div>
        <div class="dial-pista">
          <div class="dial" data-dial title="Arrastra para puntuar">
            <span class="dial-aro" aria-hidden="true"></span>
            <span class="dial-aguja" aria-hidden="true"><i></i></span>
          </div>
          <button class="enlace" data-sin-nota>${e.nota == null ? "Sin nota" : "Quitar nota"}</button>
        </div>
        <input type="range" id="fn-rango" class="solo-lector" min="0" max="10" step="0.1" value="${e.nota ?? 7}" aria-label="Nota de 0 a 10" ${e.nota == null ? 'data-vacia="1"' : ""}>
      </div>
      ${conProg ? `<div class="reg-prog">
        <div class="reg-prog-cab">
          <span class="reg-etq">${seLee(e) ? "Capítulos" : "Episodios"}</span>
          <div class="reg-paso"><button data-ep="-1" aria-label="Un ${cosa} menos">−</button>
            <input id="fi-prog" type="number" min="0" ${total ? `max="${total}"` : ""} value="${hechos}" style="--d:${String(hechos).length}" aria-label="${seLee(e) ? "Capítulos" : "Episodios"} hechos">
            <em>/ ${total || "?"}</em><button data-ep="1" aria-label="Un ${cosa} más">＋</button></div>
        </div>
        ${total ? (total <= MAX_SEGMENTOS
          ? `<div class="reg-segs" data-segs style="--total:${total}" title="Pulsa un ${cosa} para marcar hasta ahí">${Array.from({ length: total }, (_, i) => `<span data-seg="${i + 1}" class="${i < hechos ? "on" : ""}"></span>`).join("")}</div>`
          : `<div class="reg-segs continua" data-segs title="Pulsa para marcar hasta ahí"><span class="reg-lleno" style="width:${Math.min(100, hechos / total * 100)}%"></span></div>`) : ""}
      </div>` : ""}
      <label class="campo reg-tipo"><span>Tipo</span><select id="fi-tipo">${Object.entries(TIPOS[e.tipo] ? TIPOS : { ...TIPOS, [e.tipo]: infoTipo(e.tipo) }).map(([k, v]) => `<option value="${k}" ${e.tipo === k ? "selected" : ""}>${v.nombre}</option>`).join("")}</select></label>
      <label class="campo reg-titulo"><span>Tu título</span><input id="fi-titulo" value="${esc(e.titulo)}" maxlength="120"></label>
      <div class="reg-cuando">${cuando(e)}</div>
    </div>
    <label class="reg-log"><span class="reg-etq">› Comentario<i>_</i></span><textarea id="fi-com" rows="3" maxlength="600" placeholder="Lo que te pareció, sin spoilers… o con.">${esc(e.comentario || "")}</textarea></label>
    <div class="fi-acc">
      <button class="btn" data-vincula>${m ? `↺ <span class="largo">Cambiar vínculo de AniList</span><span class="corto">Vínculo</span>` : `⌁ <span class="largo">Vincular con AniList</span><span class="corto">Vincular</span>`}</button>
      ${m?.siteUrl ? `<a class="btn" href="${esc(m.siteUrl)}" target="_blank" rel="noopener"><span class="largo">Abrir en AniList</span><span class="corto">AniList</span> ↗</a>` : ""}
      <span class="hueco"></span>
      <button class="btn peligro" data-borra><span class="largo">Borrar del archivo</span><span class="corto">Borrar</span></button>
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

  // Estado: el botón elegido, la luz del raíl, el color de la consola y el
  // kanji grande de fondo
  const reg = d.querySelector(".reg"), rail = d.querySelector(".reg-estados");
  function pintaEstado(k) {
    d.querySelectorAll("[data-estado]").forEach((o) => { o.classList.toggle("on", o.dataset.estado === k); o.setAttribute("aria-checked", o.dataset.estado === k); });
    rail.style.setProperty("--i", Object.keys(ESTADOS).indexOf(k));
    rail.style.setProperty("--c", ESTADOS[k].color);
    reg.style.setProperty("--ce", ESTADOS[k].color);
    reg.dataset.jp = ESTADOS[k].jp;
  }
  d.querySelectorAll("[data-estado]").forEach((b) => b.addEventListener("click", () => {
    const estado = b.dataset.estado, x = e();
    const cambios = { estado };
    const total = totalDe(x);
    if ((estado === "visto" || estado === "revisto") && total && (x.progreso || 0) < total) cambios.progreso = total;
    if (estado === "visto" && x.estado !== "visto") { const h = new Date(); cambios.mes = h.getMonth() + 1; cambios.anio = h.getFullYear(); }
    pon(cambios);
    pintaEstado(estado);
    if (cambios.progreso != null) { const p = d.querySelector("#fi-prog"); if (p) { p.value = cambios.progreso; p.style.setProperty("--d", String(cambios.progreso).length); } }
    pintaBarra();
    if (cambios.mes) pintaCuando();
  }));

  // Nota: la barra para ir rápido; − y ＋ (o escribirla) para afinar la décima,
  // que con la barra cuesta acertar. Mantener − o ＋ pulsado sigue contando y
  // se guarda una sola vez al soltar.
  const rg = d.querySelector("#fn-rango"), num = d.querySelector("#fn-num"), letra = d.querySelector("#fn-r"), caja = d.querySelector(".reg-dial");
  const redondea = (n) => Math.min(10, Math.max(0, Math.round(n * 10) / 10));
  const pintaNota = (n, { tecleando = false } = {}) => {
    const r = rango(n);
    if (!tecleando) num.value = n == null ? "" : fmtNota(n);
    letra.textContent = r ? r.r : "";
    caja.className = "reg-dial " + (r ? r.clase : "sin-nota") + (arrastrando ? " arrastrando" : "");
    caja.style.setProperty("--nota", n ?? 0);
    if (n != null) { rg.value = n; rg.removeAttribute("data-vacia"); } else rg.setAttribute("data-vacia", "1");
    d.querySelector("[data-sin-nota]").textContent = n == null ? "Sin nota" : "Quitar nota";
  };
  const guardaNota = (n) => {
    const antes = e().nota;
    if (n === antes) return;
    pon({ nota: n });
    if (n >= 10 && (antes == null || antes < 10)) tarjetaTitulo({ jp: "傑作", linea1: "OBRA MAESTRA", linea2: e().titulo, clase: "oro" });
  };
  rg.addEventListener("input", () => pintaNota(+rg.value));
  // La barra de nota: la posición del puntero a lo largo de la barra da la
  // nota (fuera de ella, el extremo más cercano). Se pinta mientras
  // arrastras y se guarda al soltar.
  let arrastrando = false;
  const dial = d.querySelector("[data-dial]");
  const notaDe = (ev) => {
    const c = dial.getBoundingClientRect();
    return redondea(Math.max(0, Math.min(1, (ev.clientX - c.left) / c.width)) * 10);
  };
  dial.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    try { dial.setPointerCapture(ev.pointerId); } catch {}
    arrastrando = true;
    pintaNota(notaDe(ev));
  });
  dial.addEventListener("pointermove", (ev) => { if (arrastrando) pintaNota(notaDe(ev)); });
  const sueltaDial = (ev) => {
    if (!arrastrando) return;
    arrastrando = false;
    const n = notaDe(ev);
    pintaNota(n);
    guardaNota(n);
  };
  dial.addEventListener("pointerup", sueltaDial);
  dial.addEventListener("pointercancel", () => { arrastrando = false; pintaNota(e().nota); });
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

  // Progreso: los segmentos (o la barra continua) se encienden hasta el
  // episodio en el que vas; pulsar uno marca hasta ahí (pulsar el último
  // encendido lo apaga, para corregir un episodio de más)
  const prog = d.querySelector("#fi-prog"), segs = d.querySelector("[data-segs]");
  function pintaBarra() {
    if (!segs) return;
    const x = e(), total = totalDe(x), v = x.progreso || 0;
    if (segs.classList.contains("continua")) segs.querySelector(".reg-lleno").style.width = Math.min(100, v / total * 100) + "%";
    else segs.querySelectorAll("[data-seg]").forEach((s) => s.classList.toggle("on", +s.dataset.seg <= v));
  }
  segs?.addEventListener("click", (ev) => {
    const total = totalDe(e());
    const s = ev.target.closest("[data-seg]");
    if (s) { const k = +s.dataset.seg; return ponProg(k === (e().progreso || 0) ? k - 1 : k); }
    const c = segs.getBoundingClientRect();
    ponProg(Math.round((ev.clientX - c.left) / c.width * total));
  });
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
    pintaBarra();
    if (cambios.mes) pintaCuando();
    if (cambios.estado) pintaEstado(cambios.estado);
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
  // El botón de la saga: para añadir lo que falta o, si ya está todo, para
  // poner una misma nota a lo que tienes visto
  const conTodo = tiene < s.cadena.length || s.cadena.some((n) => VISTAS.has(porMedia(n.id)?.estado));
  caja.innerHTML = `<section class="fi-sec fi-saga">
    <h3 class="p-tit"><span>Temporadas</span><i>シリーズ</i><small>${tiene} de ${s.cadena.length} en tu archivo</small>
      ${conTodo ? `<button class="btn sg-todo" data-sg-todo aria-expanded="false">${tiene < s.cadena.length ? "⧉ Añadir la saga" : "⧉ Nota a la saga"}</button>` : ""}</h3>
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
    <div class="sg-form" hidden></div>
  </section>`;
  caja.querySelector("[data-sg-todo]")?.addEventListener("click", (ev) => {
    const f = caja.querySelector(".sg-form"), abierto = !f.hidden;
    ev.currentTarget.setAttribute("aria-expanded", !abierto);
    if (abierto) { f.hidden = true; f.innerHTML = ""; return; }
    formSaga(d, id, s, f);
    f.hidden = false;
  });
  avisoSaga(d, s, tiene, caja);
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

// Aviso de saga arriba de la ficha, antes de tu registro: la gente no veía el
// botón de la sección Temporadas (más abajo) y no se enteraba de que podía
// añadir todas las temporadas de golpe. Solo si falta alguna.
function avisoSaga(d, s, tiene, caja) {
  const sitio = d.querySelector("#fi-saga-aviso");
  if (!sitio) return;
  const n = s.cadena.length;
  if (tiene >= n) { sitio.innerHTML = ""; return; }
  const portadas = s.cadena.filter((x) => x.coverImage?.large).slice(0, 4);
  sitio.innerHTML = `<button class="sg-aviso" data-sg-aviso>
    <span class="sg-aviso-pila" style="--n:${portadas.length}" aria-hidden="true">${portadas.map((x, i) => `<img src="${esc(x.coverImage.large)}" alt="" style="--i:${i}">`).join("")}</span>
    <span class="sg-aviso-t"><b><i>⧉</i> Saga de ${n} temporadas</b>
      <small>${tiene ? `Tienes ${tiene}. Añade ${n - tiene === 1 ? "la que falta" : `las ${n - tiene} que faltan`} de una vez` : "Añádelas todas de una vez"}, con una sola nota para la saga entera.</small></span>
    <span class="sg-aviso-btn">Añadir la saga <i>▸</i></span>
  </button>`;
  sitio.querySelector("[data-sg-aviso]").addEventListener("click", () => {
    const f = caja.querySelector(".sg-form");
    if (f.hidden) caja.querySelector("[data-sg-todo]")?.click();
    caja.querySelector(".fi-saga").scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

// Añadir la saga entera de una vez: pensado para quien empieza a apuntar desde
// cero todo lo que ha visto. Una nota para toda la saga (y, si quieres, también
// para las temporadas que ya tenías vistas), un año o Atemporal, y todo entra
// en una sola operación que se deshace de golpe.
// Lo que aún no se ha estrenado no se marca de entrada (no puedes haberlo
// visto); si lo marcas, va a pendientes. Lo que está en emisión va a Viendo.
const VISTAS = new Set(["visto", "revisto", "viendo"]);
function formSaga(d, id, s, f) {
  const faltan = s.cadena.filter((n) => !porMedia(n.id));
  const tuyas = s.cadena.map((n) => porMedia(n.id)).filter((e) => e && VISTAS.has(e.estado));
  const titulo = (n) => n.title.english || n.title.romaji || n.title.native || "";
  const hoy = new Date().getFullYear();
  let estado = faltan.length ? "visto" : null, nota = null, anio = null;
  const marcadas = new Set(faltan.filter((n) => n.status !== "NOT_YET_RELEASED").map((n) => n.id));
  // Cómo entra cada una según lo elegido
  const comoEntra = (n) => estado === "pendiente" || n.status === "NOT_YET_RELEASED" ? "pendiente" : n.status === "RELEASING" ? "viendo" : "visto";

  f.innerHTML = `
    ${faltan.length ? `<div class="sgf-fila">
      <span class="sgf-etq">Entran como</span>
      <div class="sgf-estados" role="radiogroup" aria-label="Estado de las que añades">
        ${["visto", "pendiente"].map((k) => `<button role="radio" data-sgf-estado="${k}" style="--c:${ESTADOS[k].color}"><i>${ESTADOS[k].jp}</i>${k === "visto" ? "Vistas" : "Pendientes"}</button>`).join("")}
      </div></div>
    <div class="sgf-fila">
      <span class="sgf-etq">Temporadas <small data-sgf-n></small></span>
      <div class="sgf-lista">${faltan.map((n) => `<button class="sgf-t" data-sgf-t="${n.id}" title="${esc(titulo(n))}">
        <span class="sgf-caja"></span><b>${s.cadena.indexOf(n) + 1}</b><span class="sgf-nom">${esc(titulo(n))}</span><small data-sgf-como="${n.id}"></small></button>`).join("")}</div>
    </div>` : ""}
    <div class="sgf-fila" data-sgf-solo-visto>
      <span class="sgf-etq">Nota para toda la saga</span>
      <div class="reg-dial sin-nota" style="--nota:0">
        <div class="dial-lectura">
          <button class="fn-paso" data-sgf-paso="-1" aria-label="Bajar una décima">−</button>
          <span class="dial-centro"><input id="sgf-num" inputmode="decimal" autocomplete="off" maxlength="4" placeholder="—" aria-label="Nota de la saga, escríbela, arrastra la barra o usa − y ＋"><i></i></span>
          <button class="fn-paso" data-sgf-paso="1" aria-label="Subir una décima">＋</button>
        </div>
        <div class="dial-pista">
          <div class="dial" data-sgf-dial title="Arrastra para puntuar"><span class="dial-aro" aria-hidden="true"></span><span class="dial-aguja" aria-hidden="true"><i></i></span></div>
          <button class="enlace" data-sgf-sin-nota>Sin nota</button>
        </div>
      </div>
      ${tuyas.length ? `<label class="sgf-tambien"><input type="checkbox" data-sgf-tambien ${faltan.length ? "" : "checked"}>
        ${faltan.length ? "También a" : "A"} ${tuyas.length === 1 ? "la que ya tienes vista" : `las ${tuyas.length} que ya tienes vistas`}
        <small>(${tuyas.map((e) => fmtNota(e.nota)).join(" · ")})</small></label>` : ""}
    </div>
    ${faltan.length ? `<div class="sgf-fila" data-sgf-solo-visto>
      <span class="sgf-etq">Cuándo las viste</span>
      <div class="cuando ${anio ? "" : "atemporal"}"><div class="cu-cab">
        <div class="cu-anio"><button data-sgf-anio="-1" aria-label="Año anterior">◀</button>
          <input id="sgf-anio" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="∞" aria-label="Año"><button data-sgf-anio="1" aria-label="Año siguiente">▶</button></div>
        <button class="cu-atemporal on" data-sgf-atemporal aria-pressed="true" title="Sin fecha: no importa cuándo">∞ Atemporal</button>
      </div></div>
    </div>` : ""}
    <div class="fi-acc"><button class="btn primario" data-sgf-ok></button><button class="btn" data-sgf-cancela>Cancelar</button></div>`;

  const $f = (q) => f.querySelector(q), $$f = (q) => f.querySelectorAll(q);
  const tambien = () => $f("[data-sgf-tambien]")?.checked || false;
  const pinta = () => {
    $$f("[data-sgf-estado]").forEach((b) => { const on = b.dataset.sgfEstado === estado; b.classList.toggle("on", on); b.setAttribute("aria-checked", on); });
    for (const n of faltan) {
      const b = $f(`[data-sgf-t="${n.id}"]`), on = marcadas.has(n.id);
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", on);
      const como = comoEntra(n);
      $f(`[data-sgf-como="${n.id}"]`).textContent = n.status === "NOT_YET_RELEASED" ? "Sin estrenar" : como === "viendo" ? "En emisión → Viendo" : "";
    }
    const nSel = marcadas.size;
    if ($f("[data-sgf-n]")) $f("[data-sgf-n]").textContent = `${nSel} de ${faltan.length}`;
    // Nota y fecha solo tienen sentido si entran como vistas (o para las que ya tienes)
    const conVisto = estado === "visto" || !faltan.length;
    $$f("[data-sgf-solo-visto]").forEach((x) => (x.hidden = !conVisto));
    // La misma barra de nota que en Tu registro
    const r = rango(nota), caja = $f(".reg-dial");
    caja.className = "reg-dial " + (r ? r.clase : "sin-nota") + (arrastrando ? " arrastrando" : "");
    caja.style.setProperty("--nota", nota ?? 0);
    $f(".dial-centro i").textContent = r ? r.r : "";
    $f("[data-sgf-sin-nota]").textContent = nota == null ? "Sin nota" : "Quitar nota";
    const cu = $f(".cuando");
    if (cu) {
      cu.classList.toggle("atemporal", !anio);
      $f("#sgf-anio").value = anio || "";
      const at = $f("[data-sgf-atemporal]"); at.classList.toggle("on", !anio); at.setAttribute("aria-pressed", !anio);
    }
    const ok = $f("[data-sgf-ok]");
    const nTambien = conVisto && nota != null && tambien() ? tuyas.length : 0;
    ok.disabled = !nSel && !nTambien;
    ok.textContent = nSel ? `Añadir ${nSel === 1 ? "1 temporada" : nSel + " temporadas"}${nTambien ? ` · nota a ${nTambien} más` : ""}` : nTambien ? `Poner ${fmtNota(nota)} a ${nTambien === 1 ? "1 temporada" : nTambien + " temporadas"}` : faltan.length ? "Marca alguna temporada" : "Elige una nota";
  };
  const num = $f("#sgf-num");
  let arrastrando = false;
  const redondea = (n) => Math.min(10, Math.max(0, Math.round(n * 10) / 10));
  const ponNota = (n) => { nota = n == null ? null : redondea(n); num.value = nota == null ? "" : fmtNota(nota); pinta(); };

  $$f("[data-sgf-estado]").forEach((b) => b.addEventListener("click", () => {
    estado = b.dataset.sgfEstado;
    // Pendientes: también lo que no se ha estrenado; vistas: lo de antes
    marcadas.clear();
    faltan.filter((n) => estado === "pendiente" || n.status !== "NOT_YET_RELEASED").forEach((n) => marcadas.add(n.id));
    pinta();
  }));
  $$f("[data-sgf-t]").forEach((b) => b.addEventListener("click", () => {
    const nid = +b.dataset.sgfT;
    marcadas.has(nid) ? marcadas.delete(nid) : marcadas.add(nid);
    pinta();
  }));
  $$f("[data-sgf-paso]").forEach((b) => b.addEventListener("click", () => ponNota((nota ?? 7) + +b.dataset.sgfPaso / 10)));
  // Arrastrar la barra: la posición a lo ancho da la nota
  const dial = $f("[data-sgf-dial]");
  const notaDe = (ev) => { const c = dial.getBoundingClientRect(); return Math.max(0, Math.min(1, (ev.clientX - c.left) / c.width)) * 10; };
  dial.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    try { dial.setPointerCapture(ev.pointerId); } catch {}
    arrastrando = true;
    ponNota(notaDe(ev));
  });
  dial.addEventListener("pointermove", (ev) => { if (arrastrando) ponNota(notaDe(ev)); });
  const suelta = (ev) => { if (!arrastrando) return; arrastrando = false; ponNota(notaDe(ev)); };
  dial.addEventListener("pointerup", suelta);
  dial.addEventListener("pointercancel", () => { arrastrando = false; pinta(); });
  $f("[data-sgf-sin-nota]").addEventListener("click", () => { if (nota != null) ponNota(null); });
  num.addEventListener("focus", () => num.select());
  num.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); num.blur(); } });
  num.addEventListener("change", () => {
    const t = num.value.trim().replace(",", ".");
    ponNota(t && Number.isFinite(+t) ? +t : null);
  });
  $f("[data-sgf-tambien]")?.addEventListener("change", pinta);
  $$f("[data-sgf-anio]").forEach((b) => b.addEventListener("click", () => {
    anio = Math.min(hoy, Math.max(1960, anio ? anio + +b.dataset.sgfAnio : hoy)); pinta();
  }));
  $f("[data-sgf-atemporal]")?.addEventListener("click", () => { anio = anio ? null : hoy; pinta(); });
  const inAnio = $f("#sgf-anio");
  inAnio?.addEventListener("focus", () => inAnio.select());
  inAnio?.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); inAnio.blur(); } });
  inAnio?.addEventListener("change", () => {
    const a = parseInt(inAnio.value, 10);
    anio = a >= 1960 ? Math.min(hoy, a) : null; pinta();
  });
  $f("[data-sgf-cancela]").addEventListener("click", () => d.querySelector("[data-sg-todo]")?.click());

  $f("[data-sgf-ok]").addEventListener("click", async (ev) => {
    const b = ev.currentTarget;
    const conVisto = estado === "visto" || !faltan.length;
    const ids = faltan.filter((n) => marcadas.has(n.id)).map((n) => n.id);
    b.disabled = true; b.textContent = "Consultando AniList…";
    // Lo que no tienes llega con la ficha corta de la saga: se pide la completa
    // de todas en una sola consulta (AniList cuenta peticiones, no títulos)
    let fichas = [];
    try { fichas = ids.length ? await refrescar(ids) : []; }
    catch (err) { aviso("AniList no responde: " + err.message); pinta(); return; }
    const porId = new Map(fichas.map((m) => [m.id, m]));
    const lista = [];
    for (const nid of ids) {
      const m = porId.get(nid), n = s.cadena.find((x) => x.id === nid);
      if (!m || porMedia(nid)) continue;   // AniList no la dio, o se añadió mientras tanto
      const como = comoEntra(n);
      const total = (m.type === "MANGA" ? m.chapters : m.episodes) || 0;
      const media = { ...m, saga: marcaSaga({ raiz: s.raiz, n: s.cadena.indexOf(n) + 1, cadena: s.cadena }) };
      const alta = { mediaId: m.id, media, titulo: tituloApi(m), tipo: tipoDe(m), estado: como,
        progreso: como === "visto" ? total : como === "viendo" ? Math.max(0, (m.nextAiringEpisode?.episode || 1) - 1) : 0 };
      // La nota vale para lo visto y lo que estás viendo; el año, solo para lo visto
      if (como !== "pendiente" && conVisto) alta.nota = nota;
      if (como === "visto") Object.assign(alta, { anio, mes: null });
      lista.push(alta);
    }
    const cambios = conVisto && nota != null && tambien() ? Object.fromEntries(tuyas.map((e) => [e.uid, { nota }])) : {};
    if (!lista.length && !Object.keys(cambios).length) { aviso("No había nada que añadir."); pinta(); return; }
    const nuevas = anadeLote(lista, cambios);
    const nC = Object.keys(cambios).length, serie = s.cadena[0] ? titulo(s.cadena[0]) : "la saga";
    const partes = [nuevas.length ? `${nuevas.length} ${nuevas.length === 1 ? "temporada" : "temporadas"} al archivo` : null,
      nC ? `nota ${fmtNota(nota)} a ${nC === 1 ? "1 que ya tenías" : nC + " que ya tenías"}` : null].filter(Boolean);
    aviso(`«${serie}»: ${partes.join(" y ")}.`, { accion: "Deshacer", alPulsar: () => { deshaz(); aviso("Deshecho."); } });
    if (nota >= 10 && (nuevas.some((e) => e.nota >= 10) || nC)) tarjetaTitulo({ jp: "傑作", linea1: "OBRA MAESTRA", linea2: serie, clase: "oro" });
    // Repinta la ficha: si la que estaba abierta es tuya ahora, con su registro
    const abierta = porMedia(id);
    if (abierta) { const y = d.scrollTop; abre(abierta.uid); d.scrollTop = y; }
    else cargaSaga(d, id);
  });
  pinta();
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
