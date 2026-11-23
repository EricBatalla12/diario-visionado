// Tutorial guiado: un recorrido corto por la interfaz que ilumina cada parte
// y explica para qué sirve. Sale solo la primera vez que alguien crea su
// cuenta y se puede repetir desde el menú ⋮. No guarda nada en la base de
// datos: basta con recordarlo en este navegador.
import { reducido } from "./ui.js";

const CLAVE = "kiroku:tutorial";

// `sel` puede no existir (archivo vacío, perfil ajeno…): ese paso se salta
const PASOS = [
  { titulo: "Bienvenido a KIROKU", jp: "記録",
    texto: "Tu archivo de anime, manga, manhwa y manhua. Te enseño lo básico en un minuto; puedes saltarlo cuando quieras." },
  { sel: "#btn-busca", titulo: "Buscar y añadir", jp: "検索",
    texto: "Busca cualquier anime o manga en AniList y añádelo a tu archivo como pendiente, viendo o visto. En el ordenador, la tecla / también abre el buscador." },
  { sel: ".filtros", titulo: "Tu archivo", jp: "蔵",
    texto: "Aquí está todo lo que registras, agrupado por el mes en que lo viste. Filtra por estado, tipo, año o género, o busca dentro." },
  { sel: "#coleccion .carta, #coleccion .fila", titulo: "La ficha", jp: "札",
    texto: "Toca una carta para abrir su ficha: cambia el estado, ponle nota, apunta por qué capítulo o episodio vas y cuándo lo viste (o márcalo como atemporal)." },
  { sel: "#nav", titulo: "Secciones", jp: "道",
    texto: "Perfil con tus estadísticas y logros, la tier list que sale de tus notas, la temporada en emisión, el gacha para decidir qué ver y los demás operadores." },
  { sel: "#btn-buzon", titulo: "Buzón", jp: "受",
    texto: "Las recomendaciones que te mandan otros operadores. Tú también puedes recomendar desde la ficha de cualquier título." },
  { sel: "#op", titulo: "Tu nivel", jp: "級",
    texto: "Subes viendo episodios, terminando títulos, puntuando y comentando. Toca aquí para ir a tu perfil." },
  { sel: "#btn-menu", titulo: "Menú", jp: "⋮",
    texto: "Exportar una copia, importar, la privacidad del perfil… y volver a ver este tutorial." },
];

export const visto = () => { try { return localStorage.getItem(CLAVE) === "1"; } catch { return true; } };
const marca = () => { try { localStorage.setItem(CLAVE, "1"); } catch {} };

let activo = null;

export function arranca() {
  if (activo) return;
  if (!/^#\/?(archivo)?$/.test(location.hash) && location.hash !== "") {
    // El recorrido explica el archivo: se empieza allí
    location.hash = "#/archivo";
    setTimeout(arranca, 350);
    return;
  }
  const pasos = PASOS.filter((p) => !p.sel || visible(p.sel));
  let i = 0;

  const capa = document.createElement("div");
  capa.className = "tuto";
  capa.innerHTML = `<div class="tuto-foco"></div>
    <div class="tuto-burbuja" role="dialog" aria-modal="true" aria-labelledby="tuto-t" aria-describedby="tuto-x">
      <div class="tuto-cab"><i aria-hidden="true"></i><h2 id="tuto-t"></h2><small></small></div>
      <p id="tuto-x"></p>
      <div class="tuto-acc">
        <button class="enlace" data-tuto="salta">Saltar</button>
        <span class="hueco"></span>
        <button class="btn" data-tuto="atras">◀</button>
        <button class="btn primario" data-tuto="sigue"></button>
      </div>
    </div>`;
  document.body.append(capa);
  const foco = capa.querySelector(".tuto-foco"), burbuja = capa.querySelector(".tuto-burbuja");

  const cierra = () => {
    marca();
    removeEventListener("resize", coloca); removeEventListener("scroll", coloca, true);
    document.removeEventListener("keydown", tecla, true);
    capa.classList.add("fuera");
    setTimeout(() => capa.remove(), 250);
    activo = null;
  };
  const muestra = (n) => {
    i = Math.max(0, Math.min(pasos.length - 1, n));
    const p = pasos[i];
    burbuja.querySelector(".tuto-cab i").textContent = p.jp;
    burbuja.querySelector("h2").textContent = p.titulo;
    burbuja.querySelector("small").textContent = `${i + 1}/${pasos.length}`;
    burbuja.querySelector("p").textContent = p.texto;
    burbuja.querySelector("[data-tuto=atras]").hidden = i === 0;
    burbuja.querySelector("[data-tuto=sigue]").textContent = i === pasos.length - 1 ? "Empezar" : "Siguiente ▶";
    const el = objetivo(p);
    if (el) el.scrollIntoView({ block: "center", behavior: reducido() ? "auto" : "smooth" });
    coloca();
    // El scroll suave mueve el objetivo: se vuelve a colocar al terminar
    setTimeout(coloca, 380);
    burbuja.querySelector("[data-tuto=sigue]").focus({ preventScroll: true });
  };
  function coloca() {
    const el = objetivo(pasos[i]);
    const m = 8, vw = innerWidth, vh = innerHeight;
    if (!el) {
      foco.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0`;
      capa.classList.add("centro");
      burbuja.style.cssText = "";
      return;
    }
    capa.classList.remove("centro");
    const r = el.getBoundingClientRect();
    const top = Math.max(4, r.top - m), bottom = Math.min(vh - 4, r.bottom + m);
    foco.style.cssText = `left:${r.left - m}px;top:${top}px;width:${r.width + m * 2}px;height:${bottom - top}px`;
    // La burbuja va debajo si cabe; si no, encima
    const b = burbuja.getBoundingClientRect();
    const ancho = Math.min(380, vw - 24);
    const x = Math.max(12, Math.min(vw - ancho - 12, r.left + r.width / 2 - ancho / 2));
    const debajo = bottom + 12 + b.height < vh;
    const y = debajo ? bottom + 12 : Math.max(12, top - 12 - b.height);
    burbuja.style.cssText = `left:${x}px;top:${y}px;width:${ancho}px`;
  }
  function tecla(ev) {
    if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); cierra(); }
    else if (ev.key === "ArrowRight") { ev.preventDefault(); ev.stopPropagation(); i === pasos.length - 1 ? cierra() : muestra(i + 1); }
    else if (ev.key === "ArrowLeft") { ev.preventDefault(); ev.stopPropagation(); muestra(i - 1); }
  }
  capa.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-tuto]");
    if (!b) return;
    const acc = b.dataset.tuto;
    if (acc === "salta") cierra();
    if (acc === "atras") muestra(i - 1);
    if (acc === "sigue") i === pasos.length - 1 ? cierra() : muestra(i + 1);
  });
  addEventListener("resize", coloca);
  addEventListener("scroll", coloca, true);
  document.addEventListener("keydown", tecla, true);
  activo = capa;
  muestra(0);
}

function objetivo(p) {
  if (!p.sel) return null;
  return [...document.querySelectorAll(p.sel)].find((el) => el.getClientRects().length) || null;
}
const visible = (sel) => !!objetivo({ sel });
