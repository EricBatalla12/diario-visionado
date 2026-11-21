// Pantallas previas a la web: terminal de acceso (Discord / Google), registro
// del operador la primera vez, y aviso si falta configurar Supabase.
import { $, esc } from "./ui.js";
import { entra, datosProveedor, aliasLibre, creaPerfil, proveedoresActivos } from "./nube.js";

const ICONOS = {
  discord: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.61 1.25a18.27 18.27 0 0 0-5.49 0 12.6 12.6 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.74 19.74 0 0 0-4.89 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.05 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-1.99a.08.08 0 0 0-.04-.1 13.1 13.1 0 0 1-1.87-.9.08.08 0 0 1 0-.12l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08 0l.37.3a.08.08 0 0 1 0 .12c-.6.35-1.22.65-1.88.9a.08.08 0 0 0-.04.1c.36.7.78 1.36 1.23 1.99a.08.08 0 0 0 .08.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42s.96-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.15-1.09-2.15-2.42s.95-2.42 2.15-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42Z"/></svg>`,
  google: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.66 4.1-5.5 4.1-3.31 0-6-2.74-6-6.2s2.69-6.2 6-6.2c1.88 0 3.15.8 3.87 1.5l2.64-2.54C16.84 3.2 14.64 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.66 0 9.4-3.98 9.4-9.58 0-.64-.07-1.13-.16-1.62H12Z"/></svg>`,
};

function capa() {
  let c = $("#acceso");
  if (!c) { c = document.createElement("div"); c.id = "acceso"; c.className = "acceso"; document.body.append(c); }
  document.body.classList.add("en-acceso");
  return c;
}
export function quitaCapa() {
  $("#acceso")?.remove();
  document.body.classList.remove("en-acceso");
}

const marco = (cuerpo) => `
  <div class="ac-fondo" aria-hidden="true"><span>認証</span></div>
  <div class="ac-caja panel esquinas">
    <div class="ac-logo"><span class="logo-kanji">記録</span><span class="logo-t"><b>KIROKU</b><small>Archivo de visionado · 視聴の記録</small></span></div>
    ${cuerpo}
  </div>
  <p class="ac-pie">Datos de anime y manga: <a href="https://anilist.co" target="_blank" rel="noopener">AniList</a></p>`;

// ── Inicio de sesión ─────────────────────────────────────────────────────
const PROVEEDORES = [
  { id: "discord", nombre: "Discord" },
  { id: "google", nombre: "Google" },
];

// Solo se enseñan los botones de los proveedores activados en Supabase
// (si no se puede saber, se enseñan todos).
export async function pantallaEntrada(error) {
  const c = capa();
  const activos = await proveedoresActivos();
  const visibles = PROVEEDORES.filter((p) => !activos || activos.has(p.id));
  c.innerHTML = marco(`
    <h1 class="ac-tit"><span>Terminal de acceso</span><i>アクセス端末</i></h1>
    <p class="ac-txt">Identifícate, operador. Si es tu primera vez, entrar crea tu expediente.</p>
    <div class="ac-botones">
      ${visibles.map((p) => `<button class="ac-btn ${p.id}" data-prov="${p.id}">${ICONOS[p.id]}<span>Entrar con ${p.nombre}</span></button>`).join("")
        || `<p class="ac-error">▲ No hay ningún método de acceso activado todavía.</p>`}
    </div>
    ${error ? `<p class="ac-error">▲ ${esc(error)}</p>` : ""}
    <ul class="ac-notas">
      <li>Tu archivo lo ven los demás operadores con sesión iniciada; solo tú puedes cambiarlo.</li>
      <li>De tu cuenta de ${visibles.map((p) => p.nombre).join(" o ") || "Discord o Google"} solo se usan el nombre y la foto.</li>
    </ul>`);
  c.querySelectorAll("[data-prov]").forEach((b) => b.addEventListener("click", async () => {
    c.querySelectorAll("[data-prov]").forEach((x) => (x.disabled = true));
    b.querySelector("span").textContent = "Conectando…";
    const { error: e } = await entra(b.dataset.prov);
    if (e) pantallaEntrada(e.message);
  }));
}

// ── Falta configurar ─────────────────────────────────────────────────────
export function pantallaSinConfig() {
  capa().innerHTML = marco(`
    <h1 class="ac-tit"><span>Sin enlace</span><i>未接続</i></h1>
    <p class="ac-txt">Falta conectar la web con Supabase: rellena <code>web/js/config.js</code> con la URL del proyecto y la clave anon.
    Los pasos están en <code>docs/puesta-en-marcha.md</code>.</p>`);
}

export function pantallaError(msg) {
  capa().innerHTML = marco(`
    <h1 class="ac-tit"><span>Fallo de enlace</span><i>接続エラー</i></h1>
    <p class="ac-txt">No se pudo hablar con la base de datos.</p>
    <p class="ac-error">▲ ${esc(msg)}</p>
    <div class="ac-botones"><button class="btn primario" onclick="location.reload()">Reintentar</button></div>`);
}

// ── Registro del operador (primera vez) ──────────────────────────────────
// Resuelve con el perfil creado.
export function pantallaRegistro(user) {
  return new Promise((resolver) => {
    const p = datosProveedor(user);
    const c = capa();
    c.innerHTML = marco(`
      <h1 class="ac-tit"><span>Registro de operador</span><i>登録</i></h1>
      <p class="ac-txt">Primera conexión detectada. Elige cómo te verán los demás.</p>
      <form class="ac-form" novalidate>
        <div class="ac-avatar">${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : `<span>${esc((p.nombre[0] || "?").toUpperCase())}</span>`}</div>
        <label class="campo"><span>Nombre visible</span><input name="nombre" maxlength="24" required value="${esc(p.nombre)}" autocomplete="off"></label>
        <label class="campo"><span>Alias · tu dirección será #/@alias</span>
          <div class="ac-alias"><b>@</b><input name="alias" maxlength="20" required value="${esc(p.alias)}" autocomplete="off" spellcheck="false" pattern="[a-z0-9_]{3,20}"></div>
          <small class="ac-ayuda" id="ac-ayuda">Minúsculas, números y _ · de 3 a 20</small></label>
        <button class="btn primario ac-crear" type="submit">Crear expediente ▸</button>
        <p class="ac-error" id="ac-error" hidden></p>
      </form>`);
    const f = c.querySelector("form"), ayuda = c.querySelector("#ac-ayuda"), err = c.querySelector("#ac-error");
    const alias = f.alias;
    let t;
    const valida = () => /^[a-z0-9_]{3,20}$/.test(alias.value);
    alias.addEventListener("input", () => {
      alias.value = alias.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
      clearTimeout(t);
      if (!valida()) { ayuda.textContent = "Minúsculas, números y _ · de 3 a 20"; ayuda.className = "ac-ayuda"; return; }
      ayuda.textContent = "Comprobando…";
      t = setTimeout(async () => {
        const libre = await aliasLibre(alias.value, user.id).catch(() => true);
        ayuda.textContent = libre ? `@${alias.value} está libre` : `@${alias.value} ya está cogido`;
        ayuda.className = "ac-ayuda " + (libre ? "ok" : "mal");
      }, 350);
    });
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      err.hidden = true;
      if (!valida()) { err.textContent = "El alias va en minúsculas, números o _, de 3 a 20 caracteres."; err.hidden = false; return; }
      const nombre = f.nombre.value.trim();
      if (!nombre) { err.textContent = "Pon un nombre."; err.hidden = false; return; }
      const b = f.querySelector("button"); b.disabled = true; b.textContent = "Creando…";
      try {
        resolver(await creaPerfil({ id: user.id, alias: alias.value, nombre, avatar_url: p.avatar }));
      } catch (e) {
        err.textContent = e.message; err.hidden = false; b.disabled = false; b.textContent = "Crear expediente ▸";
      }
    });
  });
}
