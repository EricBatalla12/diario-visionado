// Panel de privacidad (solo en tu propio perfil): público o privado y, si es
// privado, la lista de operadores que pueden ver tu archivo.
// La lista se guarda aunque vuelvas a público: si después pasas a privado, esas
// personas siguen teniendo acceso.
import { esc, aviso } from "../ui.js";
import { yoMismo, ponPrivado } from "../almacen.js";
import { misPermisos, concede, retira, sb } from "../nube.js";

let permitidos = null;   // [{ id, alias, nombre, avatar_url }] — se carga una vez y se mantiene aquí
let operadores = null;   // todos los perfiles, para el desplegable de añadir
let cargadoEn = 0;
let ocupado = false;

async function carga(forzar = false) {
  if (!forzar && permitidos && Date.now() - cargadoEn < 60000) return;
  const yo = yoMismo();
  const [p, { data, error }] = await Promise.all([
    misPermisos(yo.id),
    sb.from("perfiles").select("id, alias, nombre, avatar_url").neq("id", yo.id).order("nombre"),
  ]);
  if (error) throw error;
  permitidos = p; operadores = data; cargadoEn = Date.now();
}

const avatar = (p) => p.avatar_url
  ? `<img src="${esc(p.avatar_url)}" alt="" referrerpolicy="no-referrer" loading="lazy">`
  : `<span>${esc((p.nombre[0] || "?").toUpperCase())}</span>`;

// Pinta el panel dentro de `caja` (un <section> que pone perfil.js)
export async function panel(caja) {
  if (!caja) return;
  const yo = yoMismo();
  if (!permitidos) caja.innerHTML = cabecera(yo) + `<div class="cargando"><span></span>Leyendo tu lista…</div>`;
  else pinta(caja);
  try { await carga(); } catch (err) {
    if (caja.isConnected) caja.innerHTML = cabecera(yo) + `<p class="ac-error">▲ No se pudo leer la privacidad: ${esc(err.message)}</p>`;
    return;
  }
  if (caja.isConnected) pinta(caja);
}

function cabecera(yo) {
  return `<h2 class="p-tit"><span>Privacidad</span><i>公開設定</i><small>${yo.privado ? "archivo privado" : "archivo público"}</small></h2>
  <div class="priv-modo" role="radiogroup" aria-label="Quién ve tu archivo">
    <button role="radio" aria-checked="${!yo.privado}" class="${yo.privado ? "" : "on"}" data-privado="0">
      <i>公開</i><b>Público</b><small>Cualquier operador con sesión ve tu archivo</small></button>
    <button role="radio" aria-checked="${yo.privado}" class="${yo.privado ? "on" : ""}" data-privado="1">
      <i>非公開</i><b>Privado</b><small>Solo tú y los operadores de tu lista</small></button>
  </div>`;
}

function pinta(caja) {
  const yo = yoMismo();
  const ids = new Set(permitidos.map((p) => p.id));
  const libres = operadores.filter((o) => !ids.has(o.id));
  caja.innerHTML = cabecera(yo) + (yo.privado ? `
    <div class="priv-lista">
      <h3>Pueden ver tu archivo <em>${permitidos.length}</em></h3>
      ${permitidos.length ? `<ul>${permitidos.map((p) => `<li>
          <a href="#/@${esc(p.alias)}" class="priv-av">${avatar(p)}</a>
          <span><b>${esc(p.nombre)}</b><small>@${esc(p.alias)}</small></span>
          <button class="btn" data-quita="${esc(p.id)}" aria-label="Quitar a ${esc(p.nombre)}">Quitar</button></li>`).join("")}</ul>`
        : `<p class="tenue">Nadie más. Ahora mismo tu archivo solo lo ves tú.</p>`}
      ${libres.length ? `<form class="priv-anade">
          <label class="sel"><span>Añadir operador</span><select name="op">
            ${libres.map((o) => `<option value="${esc(o.id)}">${esc(o.nombre)} · @${esc(o.alias)}</option>`).join("")}
          </select></label>
          <button class="btn primario" type="submit">＋ Dar acceso</button>
        </form>` : `<p class="tenue">${operadores.length ? "Ya has añadido a todos los operadores." : "Todavía no hay más operadores. Pásales el enlace desde Operadores."}</p>`}
    </div>`
    : `<p class="priv-nota">Ahora tu archivo lo ve cualquier operador con sesión.${permitidos.length
        ? ` Tu lista de ${permitidos.length} operador${permitidos.length === 1 ? "" : "es"} se conserva para cuando vuelvas a privado.` : ""}</p>`);

  caja.querySelectorAll("[data-privado]").forEach((b) => b.addEventListener("click", async () => {
    const privado = b.dataset.privado === "1";
    if (ocupado || privado === Boolean(yo.privado)) return;
    ocupado = true;
    try {
      await ponPrivado(privado);
      aviso(privado ? "Archivo privado: solo lo ven tú y tu lista." : "Archivo público: lo ve cualquier operador con sesión.");
    } catch (err) { aviso("No se pudo cambiar: " + err.message); }
    ocupado = false;
    panel(caja);
  }));
  caja.querySelectorAll("[data-quita]").forEach((b) => b.addEventListener("click", async () => {
    if (ocupado) return;
    ocupado = true; b.disabled = true;
    const p = permitidos.find((x) => x.id === b.dataset.quita);
    try {
      await retira(yo.id, p.id);
      permitidos = permitidos.filter((x) => x.id !== p.id);
      aviso(`${p.nombre} ya no puede ver tu archivo.`);
    } catch (err) { aviso("No se pudo quitar: " + err.message); }
    ocupado = false;
    pinta(caja);
  }));
  caja.querySelector(".priv-anade")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (ocupado) return;
    const id = ev.target.op.value;
    const p = operadores.find((o) => o.id === id);
    if (!p) return;
    ocupado = true;
    try {
      await concede(yo.id, id);
      permitidos = [...permitidos, p];
      aviso(`${p.nombre} ya puede ver tu archivo.`);
    } catch (err) { aviso("No se pudo añadir: " + err.message); }
    ocupado = false;
    pinta(caja);
  });
}
