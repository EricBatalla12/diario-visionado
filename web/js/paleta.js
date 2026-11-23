// Paleta de búsqueda (tecla / o Ctrl+K): busca a la vez en tu archivo y en
// AniList. Intro abre la ficha previa; los botones de cada resultado lo añaden
// directamente. En modo "revincula" sirve para cambiar el título de AniList al
// que apunta una entrada.
import { $, esc, FORMATOS, tituloApi, ESTADOS, aviso, TIPOS, infoTipo, tipoDe } from "./ui.js";
import { propias, porMedia, anade, actualiza, entrada } from "./almacen.js";
import { buscar } from "./anilist.js";
import * as ficha from "./ficha.js";

const dlg = () => $("#paleta");
let modo = {};
let tipo = "ANIME";
let resultados = [];   // [{ clase: 'local'|'api'|'manual', ... }]
let activo = 0;
let ctrl = null, temporizador = null;

const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function abre(opciones = {}) {
  modo = opciones;
  const d = dlg();
  d.innerHTML = `
    <div class="pa-caja">
      <div class="pa-cab">
        <span class="pa-prompt">${modo.revincula ? "VINCULAR&gt;" : "BUSCAR&gt;"}</span>
        <input id="pa-q" type="text" autocomplete="off" spellcheck="false" placeholder="${modo.revincula ? "Busca el título correcto en AniList…" : "Título de anime o manga…"}" value="${esc(modo.texto || "")}">
        <button class="pa-tipo" id="pa-tipo" title="Tab cambia entre anime y manga">${tipo === "ANIME" ? "アニメ ANIME" : "漫画 MANGA"}</button>
      </div>
      <div class="pa-res" id="pa-res" role="listbox"></div>
      <div class="pa-pie"><span><kbd>↑</kbd><kbd>↓</kbd> moverse</span><span><kbd>↵</kbd> ${modo.revincula ? "vincular" : "abrir ficha"}</span><span><kbd>Tab</kbd> anime/manga</span><span><kbd>Esc</kbd> cerrar</span><span class="pa-fuente">datos: AniList</span></div>
    </div>`;
  if (!d.open) d.showModal();
  const q = d.querySelector("#pa-q");
  q.focus(); q.select();
  q.addEventListener("input", () => programa(q.value));
  q.addEventListener("keydown", teclas);
  d.querySelector("#pa-tipo").addEventListener("click", () => { cambiaTipo(); q.focus(); });
  d.onclick = (ev) => { if (ev.target === d) d.close(); };
  programa(q.value, 0);
}

function cambiaTipo() {
  tipo = tipo === "ANIME" ? "MANGA" : "ANIME";
  dlg().querySelector("#pa-tipo").textContent = tipo === "ANIME" ? "アニメ ANIME" : "漫画 MANGA";
  programa(dlg().querySelector("#pa-q").value, 0);
}

function programa(texto, ms = 380) {
  clearTimeout(temporizador);
  const t = texto.trim();
  // Lo local sale al instante; AniList espera a que dejes de teclear
  const locales = !t || modo.revincula ? [] : propias().filter((e) => norm(e.titulo + " " + (e.media?.title.romaji || "") + " " + (e.media?.title.english || "")).includes(norm(t)))
    .slice(0, 5).map((e) => ({ clase: "local", e }));
  resultados = [...locales];
  if (t && !modo.revincula) resultados.push({ clase: "manual", texto: t });
  activo = 0;
  pinta(t ? "cargando" : "vacio");
  if (!t) return;
  temporizador = setTimeout(async () => {
    ctrl?.abort(); ctrl = new AbortController();
    try {
      const api = await buscar(t, tipo, { signal: ctrl.signal });
      const manual = resultados.find((r) => r.clase === "manual");
      resultados = [...locales, ...api.map((m) => ({ clase: "api", m })), ...(manual ? [manual] : [])];
      pinta(api.length ? "" : "nada");
    } catch (err) {
      if (err.name !== "AbortError") pinta("error", err.message);
    }
  }, ms);
}

function pinta(estado, msg) {
  const caja = dlg().querySelector("#pa-res");
  if (!caja) return;
  const loc = resultados.filter((r) => r.clase === "local");
  const api = resultados.filter((r) => r.clase === "api");
  const man = resultados.filter((r) => r.clase === "manual");
  let i = 0;
  const fila = (r) => {
    const idx = i++;
    if (r.clase === "local") {
      const e = r.e, es = ESTADOS[e.estado];
      return `<div class="pa-f ${idx === activo ? "on" : ""}" data-i="${idx}" role="option">
        <div class="pa-img">${e.media?.coverImage ? `<img src="${esc(e.media.coverImage.large)}" alt="">` : `<span>${esc(infoTipo(e.tipo).jp)}</span>`}</div>
        <div class="pa-t"><b>${esc(e.titulo)}</b><small style="color:${es.color}">${es.jp} ${es.nombre}${e.nota != null ? " · " + e.nota : ""}</small></div>
        <span class="pa-k">abrir</span></div>`;
    }
    if (r.clase === "manual") return `<div class="pa-f pa-manual ${idx === activo ? "on" : ""}" data-i="${idx}" role="option">
        <div class="pa-img"><span>＋</span></div>
        <div class="pa-t"><b>Añadir «${esc(r.texto)}» sin AniList</b><small>Para lo que AniList no tiene</small></div>
        <div class="pa-btns">${["anime", "manga"].map((k) => `<button data-manual="${k}" data-i="${idx}">${TIPOS[k].nombre}</button>`).join("")}</div></div>`;
    const m = r.m, ya = porMedia(m.id);
    return `<div class="pa-f ${idx === activo ? "on" : ""} ${ya ? "ya" : ""}" data-i="${idx}" role="option">
      <div class="pa-img">${m.coverImage ? `<img src="${esc(m.coverImage.large)}" alt="">` : ""}</div>
      <div class="pa-t"><b>${esc(tituloApi(m))}</b><small>${esc([m.title.romaji !== tituloApi(m) ? m.title.romaji : null, FORMATOS[m.format] || m.format, m.seasonYear, m.episodes ? m.episodes + " ep" : m.chapters ? m.chapters + " cap" : null, m.studio].filter(Boolean).join(" · "))}</small></div>
      ${m.averageScore ? `<span class="pa-nota">${(m.averageScore / 10).toFixed(1)}</span>` : ""}
      ${modo.revincula ? `<span class="pa-k">vincular</span>` : ya ? `<span class="pa-k ya">✓ en archivo</span>` :
        `<div class="pa-btns">${["pendiente", "viendo", "visto"].map((k) => `<button data-anade="${k}" data-i="${idx}" style="--c:${ESTADOS[k].color}">${ESTADOS[k].nombre}</button>`).join("")}</div>`}
    </div>`;
  };
  let html = "";
  if (loc.length) html += `<h4>En tu archivo</h4>` + loc.map(fila).join("");
  if (api.length) html += `<h4>AniList</h4>` + api.map(fila).join("");
  if (estado === "cargando") html += `<div class="cargando"><span></span>Consultando AniList…</div>`;
  if (estado === "nada") html += `<p class="pa-nada">AniList no encuentra nada con ese nombre${tipo === "ANIME" ? " (prueba en manga con Tab)" : ""}.</p>`;
  if (estado === "error") html += `<p class="pa-nada">AniList no responde: ${esc(msg)}</p>`;
  if (estado === "vacio") html += `<div class="pa-ayuda"><div class="pa-ayuda-jp">検索</div><p>Escribe para buscar en AniList.<br><span class="tenue">Prueba «frieren», «bocchi» o «one piece».</span></p></div>`;
  if (man.length) html += man.map(fila).join("");
  caja.innerHTML = html;

  caja.querySelectorAll(".pa-f").forEach((f) => {
    f.addEventListener("click", (ev) => {
      if (ev.target.closest("button")) return;
      activo = +f.dataset.i; elige();
    });
    f.addEventListener("mousemove", () => { if (activo !== +f.dataset.i) { activo = +f.dataset.i; marcaActivo(); } });
  });
  caja.querySelectorAll("[data-anade]").forEach((b) => b.addEventListener("click", () => anadeApi(resultados[+b.dataset.i].m, b.dataset.anade)));
  caja.querySelectorAll("[data-manual]").forEach((b) => b.addEventListener("click", () => anadeManual(resultados[+b.dataset.i].texto, b.dataset.manual)));
}

function marcaActivo() {
  dlg().querySelectorAll(".pa-f").forEach((f) => f.classList.toggle("on", +f.dataset.i === activo));
  dlg().querySelector(".pa-f.on")?.scrollIntoView({ block: "nearest" });
}

function teclas(ev) {
  if (ev.key === "ArrowDown") { ev.preventDefault(); activo = Math.min(resultados.length - 1, activo + 1); marcaActivo(); }
  else if (ev.key === "ArrowUp") { ev.preventDefault(); activo = Math.max(0, activo - 1); marcaActivo(); }
  else if (ev.key === "Enter") { ev.preventDefault(); elige(); }
  else if (ev.key === "Tab") { ev.preventDefault(); cambiaTipo(); }
}

function elige() {
  const r = resultados[activo];
  if (!r) return;
  if (r.clase === "local") { dlg().close(); ficha.abre(r.e.uid); return; }
  if (r.clase === "manual") { anadeManual(r.texto, tipo === "MANGA" ? "manga" : "anime"); return; }
  if (modo.revincula) {
    const e = entrada(modo.revincula);
    actualiza(modo.revincula, { mediaId: r.m.id, media: r.m, tipo: tipoDe(r.m) });
    aviso(`Vinculado con «${tituloApi(r.m)}».`);
    dlg().close(); ficha.abre(modo.revincula);
    return;
  }
  const ya = porMedia(r.m.id);
  dlg().close();
  ya ? ficha.abre(ya.uid) : ficha.abre(null, r.m);
}

function anadeApi(m, estado) {
  const ya = porMedia(m.id);
  if (ya) { dlg().close(); ficha.abre(ya.uid); return; }
  const e = anade({ mediaId: m.id, media: m, titulo: tituloApi(m), estado,
    tipo: tipoDe(m),
    progreso: estado === "visto" ? ((m.type === "MANGA" ? m.chapters : m.episodes) || 0) : 0 });
  aviso(`«${e.titulo}» → ${ESTADOS[estado].nombre}.`);
  dlg().close();
  ficha.abre(e.uid);
}

function anadeManual(texto, tipoE) {
  const e = anade({ titulo: texto, tipo: tipoE, estado: "pendiente" });
  aviso(`«${texto}» añadido sin AniList.`);
  dlg().close();
  ficha.abre(e.uid);
}
