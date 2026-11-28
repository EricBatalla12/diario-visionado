// Importar una lista de texto (.txt o pegada): un título por línea, con la
// nota, el estado o el tipo opcionales. Cada título se busca en AniList y se
// enseña lo que ha encontrado para revisarlo antes de importar, porque lo que
// entra sin vincular se queda sin portada ni datos.
//
// Pensado para quien llega con su lista de siempre en un bloc de notas. Lo
// importado va a ∞ Atemporal (no se sabe cuándo se vio) y se deshace de una vez.

import { esc, aviso, ESTADOS, FORMATOS, tituloApi, tipoDe, fmtNota } from "./ui.js";
import { anadeLote, porMedia, deshaz } from "./almacen.js";
import { buscar } from "./anilist.js";

const MAX_LINEAS = 400;
const ESTADO_PAL = {
  visto: "visto", vista: "visto", vistos: "visto", completado: "visto", completada: "visto", terminado: "visto", terminada: "visto",
  completed: "visto", watched: "visto", leido: "visto", leida: "visto", read: "visto", done: "visto",
  viendo: "viendo", watching: "viendo", leyendo: "viendo", reading: "viendo", siguiendo: "viendo",
  pendiente: "pendiente", "por ver": "pendiente", "por leer": "pendiente", "plan to watch": "pendiente", ptw: "pendiente", planeado: "pendiente",
  revisto: "revisto", "re-visto": "revisto", rewatch: "revisto", rewatched: "revisto", releido: "revisto",
  abandonado: "abandonado", abandonada: "abandonado", dropped: "abandonado", drop: "abandonado", dropeado: "abandonado", droppeado: "abandonado",
};
const TIPO_PAL = { anime: "anime", manga: "manga", manhwa: "manga", manhua: "manga", webtoon: "manga", peli: "peli", pelicula: "peli", movie: "peli", film: "peli" };
const norm = (t) => String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const esNota = (t) => { const m = /^(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:\/\s*10)?$/.exec(t.trim()); const n = m ? +m[1].replace(",", ".") : NaN; return n >= 0 && n <= 10 ? Math.round(n * 10) / 10 : null; };

// Una línea → { titulo, nota, estado, tipo } (lo que no diga, null)
export function leeLinea(linea) {
  let t = linea.replace(/^\s*(?:[-*•·>]|\d{1,4}[.)º])\s+/, "").trim();
  const r = { titulo: "", nota: null, estado: null, tipo: null };
  const clasifica = (pieza) => {
    const p = norm(pieza).replace(/^[([]|[)\]]$/g, "").trim();
    if (!p) return true;
    const n = esNota(p);
    if (n != null && r.nota == null) { r.nota = n; return true; }
    if (ESTADO_PAL[p] && !r.estado) { r.estado = ESTADO_PAL[p]; return true; }
    if (TIPO_PAL[p] && !r.tipo) { r.tipo = TIPO_PAL[p]; return true; }
    return false;
  };
  // Cosas entre paréntesis o corchetes al final: «(dropped)», «[9/10]»
  for (let m; (m = /\s*[([]([^()[\]]{1,20})[)\]]\s*$/.exec(t)) && clasifica(m[1]);) t = t.slice(0, m.index).trim();
  // Separadores: « - », «|», «;», tabulador, « → ». Lo que no es nota, estado
  // ni tipo vuelve al título con su separador original («Steins;Gate» sigue igual)
  const partes = t.split(/(\s*[|;\t]\s*|\s+[-–—→]\s+)/);
  let titulo = partes[0];
  for (let i = 2; i < partes.length; i += 2) if (!clasifica(partes[i])) titulo += partes[i - 1] + partes[i];
  t = titulo;
  // Nota pegada al final, solo si se nota que es una nota: «Frieren: 9», «Frieren 9/10»
  // («Kaiju No. 8» o «Mushoku Tensei 2» no, que son parte del título)
  if (r.nota == null) {
    const m = /^(.*\S)\s*(?::\s*|=\s*|\s)(\d{1,2}(?:[.,]\d)?)\s*\/\s*10$/.exec(t) || /^(.*\S):\s+(\d{1,2}(?:[.,]\d)?)$/.exec(t);
    if (m && esNota(m[2]) != null) { r.nota = esNota(m[2]); t = m[1].trim(); }
  }
  r.titulo = t.replace(/\s+/g, " ").trim();
  return r;
}

export function leeLista(texto) {
  const vistos = new Set(), lista = [];
  for (const linea of String(texto).split(/\r?\n/)) {
    if (!linea.trim() || /^\s*(#|\/\/)/.test(linea)) continue;
    const x = leeLinea(linea);
    if (!x.titulo || vistos.has(norm(x.titulo))) continue;
    vistos.add(norm(x.titulo));
    lista.push({ ...x, linea: linea.trim() });
  }
  return lista;
}

// ── Diálogo ──────────────────────────────────────────────────────────────
let dlg = null, corte = null;
function dialogo() {
  if (dlg) return dlg;
  dlg = document.createElement("dialog");
  dlg.className = "importar";
  dlg.setAttribute("aria-label", "Importar una lista");
  document.body.append(dlg);
  dlg.addEventListener("close", () => corte?.abort());
  return dlg;
}

const opcionesEstado = (sel) => Object.entries(ESTADOS).map(([k, v]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${v.nombre}</option>`).join("");

export function abre(texto = "", nombre = "") {
  const d = dialogo();
  d.innerHTML = `<div class="imp-caja panel">
    <header class="imp-cab"><h2 class="p-tit"><span>Importar una lista</span><i>取込</i></h2><button class="imp-x" data-cierra aria-label="Cerrar">✕</button></header>
    <div class="imp-paso">
      <p class="imp-intro">Pega tu lista o sube un <b>.txt</b>. Cada título se busca en AniList y antes de importar ves lo que ha encontrado.</p>
      <details class="imp-ayuda" ${texto ? "" : "open"}>
        <summary>Cómo escribir la lista</summary>
        <p>Un título por línea. Si quieres, después del título y separado con <code> - </code>, <code>|</code> o <code>;</code>: la <b>nota</b> (0 a 10), el <b>estado</b> (visto, viendo, pendiente, revisto, abandonado; también en inglés: watched, dropped…) o el <b>tipo</b> (anime, manga, peli). Las líneas que empiezan por <code>#</code> no cuentan.</p>
        <pre>Frieren - 9.5
One Piece | viendo
Berserk; manga; 10
Chainsaw Man (dropped)
Your Name - peli - 9/10</pre>
      </details>
      <textarea class="imp-texto" rows="8" placeholder="Pega aquí tu lista, un título por línea…">${esc(texto)}</textarea>
      <div class="imp-ops">
        <label class="btn imp-subir">↑ Subir .txt<input type="file" accept=".txt,.csv,.md,text/plain" hidden></label>
        <label class="campo imp-def"><span>Si no dice estado</span><select data-def-estado>${opcionesEstado("visto")}</select></label>
        <label class="campo imp-def"><span>Si no dice tipo</span><select data-def-tipo><option value="anime">Anime</option><option value="manga">Manga</option><option value="peli">Película</option></select></label>
      </div>
      <p class="imp-cuenta" aria-live="polite"></p>
      <div class="fi-acc"><button class="btn primario" data-busca disabled>Buscar en AniList</button><button class="btn" data-cierra>Cancelar</button></div>
    </div>
  </div>`;
  if (!d.open) d.showModal();
  const ta = d.querySelector(".imp-texto"), cuenta = d.querySelector(".imp-cuenta"), boton = d.querySelector("[data-busca]");
  d.querySelectorAll("[data-cierra]").forEach((b) => b.addEventListener("click", () => d.close()));
  const actualiza = () => {
    const n = leeLista(ta.value).length;
    boton.disabled = !n || n > MAX_LINEAS;
    boton.textContent = n ? `Buscar ${n === 1 ? "1 título" : n + " títulos"} en AniList` : "Buscar en AniList";
    // AniList deja unas 30 búsquedas por minuto: se avisa de lo que tardará
    const min = Math.ceil(n / 30);
    cuenta.textContent = !n ? "" : n > MAX_LINEAS ? `Son ${n} títulos: como mucho ${MAX_LINEAS} de una vez.` : n > 30 ? `Tardará unos ${min} minutos (AniList limita las búsquedas).` : "";
  };
  ta.addEventListener("input", actualiza);
  d.querySelector(".imp-subir input").addEventListener("change", async (ev) => {
    const f = ev.target.files[0];
    if (f) { ta.value = await f.text(); actualiza(); }
  });
  boton.addEventListener("click", () => {
    const def = { estado: d.querySelector("[data-def-estado]").value, tipo: d.querySelector("[data-def-tipo]").value };
    const lista = leeLista(ta.value).map((x) => ({ ...x, estado: x.estado || def.estado, tipo: x.tipo || def.tipo }));
    busca(d, lista);
  });
  actualiza();
  if (nombre && !cuenta.textContent) cuenta.textContent = nombre;
  ta.focus();
}

// ── Búsqueda en AniList ──────────────────────────────────────────────────
async function busca(d, lista) {
  corte = new AbortController();
  const caja = d.querySelector(".imp-paso");
  caja.innerHTML = `<p class="imp-intro">Buscando en AniList… <b data-n>0</b> de ${lista.length}</p>
    <div class="imp-barra"><span></span></div>
    <ol class="imp-lista"></ol>
    <div class="fi-acc"><button class="btn primario" data-importa disabled>Importar</button><button class="btn" data-cierra>Cancelar</button></div>`;
  caja.querySelector("[data-cierra]").addEventListener("click", () => d.close());
  const ol = caja.querySelector(".imp-lista"), barra = caja.querySelector(".imp-barra span"), num = caja.querySelector("[data-n]");
  const ids = new Set();
  for (let i = 0; i < lista.length; i++) {
    const x = lista[i];
    try {
      const r = await buscar(x.titulo, x.tipo === "manga" ? "MANGA" : "ANIME", { signal: corte.signal });
      // Las pelis se buscan como anime; si se dijo «peli», se prefiere una película
      const orden = x.tipo === "peli" ? [...r.filter((m) => m.format === "MOVIE"), ...r.filter((m) => m.format !== "MOVIE")] : r;
      x.opciones = orden.slice(0, 6);
    } catch (err) {
      if (err.name === "AbortError") return;
      x.opciones = []; x.fallo = true;
    }
    const m = x.opciones[0];
    // Lo que ya tienes (o ya sale antes en la lista) no se importa por defecto
    x.ya = m && (porMedia(m.id) || ids.has(m.id));
    x.eleccion = !m ? "solo" : x.ya ? "no" : "0";
    if (m) ids.add(m.id);
    ol.insertAdjacentHTML("beforeend", fila(x, i));
    num.textContent = i + 1;
    barra.style.width = ((i + 1) / lista.length * 100) + "%";
  }
  caja.querySelector(".imp-intro").innerHTML = `Revisa lo que ha encontrado AniList y elige en cada uno. Lo de <b>Sin vincular</b> entra sin portada.`;
  caja.querySelector(".imp-barra").remove();
  ol.addEventListener("change", (ev) => {
    const s = ev.target.closest("[data-elige]");
    if (!s) return;
    const x = lista[+s.dataset.elige];
    x.eleccion = s.value;
    const li = s.closest("li"), m = x.opciones[+s.value];
    li.classList.toggle("fuera", s.value === "no");
    li.querySelector(".imp-img").innerHTML = m?.coverImage ? `<img src="${esc(m.coverImage.large)}" alt="">` : "<span>?</span>";
    pintaBoton();
  });
  const imp = caja.querySelector("[data-importa]");
  const pintaBoton = () => {
    const n = lista.filter((x) => x.eleccion !== "no").length;
    imp.disabled = !n;
    imp.textContent = n ? `Importar ${n === 1 ? "1 título" : n + " títulos"}` : "Nada que importar";
  };
  pintaBoton();
  imp.addEventListener("click", () => importa(d, lista));
}

function fila(x, i) {
  const m = x.opciones[+x.eleccion];
  const es = ESTADOS[x.estado];
  return `<li class="imp-fila ${x.eleccion === "no" ? "fuera" : ""}">
    <span class="imp-img">${m?.coverImage ? `<img src="${esc(m.coverImage.large)}" alt="" loading="lazy">` : "<span>?</span>"}</span>
    <div class="imp-d">
      <small class="imp-orig">${esc(x.linea)}</small>
      <select data-elige="${i}" aria-label="Qué importar para «${esc(x.titulo)}»">
        ${x.opciones.map((o, k) => `<option value="${k}" ${String(k) === x.eleccion ? "selected" : ""}>${esc(tituloApi(o))} · ${esc([FORMATOS[o.format] || o.format, o.seasonYear || o.startDate?.year].filter(Boolean).join(" · "))}${porMedia(o.id) ? " · ya lo tienes" : ""}</option>`).join("")}
        <option value="solo" ${x.eleccion === "solo" ? "selected" : ""}>Sin vincular: «${esc(x.titulo)}»</option>
        <option value="no" ${x.eleccion === "no" ? "selected" : ""}>✕ No importar</option>
      </select>
      <span class="imp-meta"><b style="color:${es.color}">${es.nombre}</b>${x.nota != null ? ` · nota ${fmtNota(x.nota)}` : ""}${x.ya ? ` · <em>ya lo tienes</em>` : ""}${x.fallo ? ` · <em>AniList no respondió</em>` : !x.opciones.length ? ` · <em>AniList no lo encuentra</em>` : ""}</span>
    </div>
  </li>`;
}

function importa(d, lista) {
  const altas = [];
  for (const x of lista) {
    if (x.eleccion === "no") continue;
    const m = x.opciones[+x.eleccion];
    const conNota = x.estado !== "pendiente" ? x.nota : null;
    if (m) {
      if (porMedia(m.id) || altas.some((a) => a.mediaId === m.id)) continue;
      const total = (m.type === "MANGA" ? m.chapters : m.episodes) || 0;
      altas.push({ mediaId: m.id, media: m, titulo: tituloApi(m), tipo: tipoDe(m), estado: x.estado, nota: conNota,
        progreso: x.estado === "visto" || x.estado === "revisto" ? total : 0, anio: null, mes: null });
    } else {
      altas.push({ titulo: x.titulo.slice(0, 120), tipo: x.tipo, estado: x.estado, nota: conNota, anio: null, mes: null });
    }
  }
  if (!altas.length) { aviso("No había nada nuevo que importar."); return; }
  anadeLote(altas);
  d.close();
  aviso(`Importados ${altas.length} ${altas.length === 1 ? "título" : "títulos"} a ∞ Atemporal.`, { accion: "Deshacer", alPulsar: () => { deshaz(); aviso("Importación deshecha."); } });
  location.hash = "#/archivo";
}

// Para el menú: ¿el fichero es JSON (copia de KIROKU) o una lista de texto?
export const pareceJson = (nombre, texto) => /\.json$/i.test(nombre) || /^\s*[[{]/.test(texto);
