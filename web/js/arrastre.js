// Mantener pulsada una carta del archivo para cambiarle el estado sin abrir
// la ficha: la carta se levanta y flota bajo el dedo (o el ratón), abajo salen
// cajas con los cinco estados y ∞ Atemporal, y al soltarla en una se aplica.
// Una carta de saga apilada cambia todas sus temporadas de golpe. Todo se
// deshace de una vez desde el aviso.
//
// Por qué así: con una pulsación larga el toque normal sigue abriendo la
// ficha y el dedo sigue desplazando la página; solo si te quedas quieto un
// momento sobre la carta empieza el arrastre.

import { ESTADOS, aviso, totalDe } from "./ui.js";
import { entrada, actualizaVarios, deshaz, esPropio } from "./almacen.js";

const ESPERA_MS = 380;     // lo que hay que mantener pulsado
const TOLERANCIA = 9;      // píxeles que puede moverse el dedo mientras espera
const CAJAS = [
  ...Object.entries(ESTADOS).map(([k, v]) => ({ k, jp: v.jp, nombre: v.nombre, color: v.color })),
  { k: "atemporal", jp: "∞", nombre: "Atemporal", color: "var(--cian)" },
];

// `miembrosSaga(id)` da las entradas de una saga apilada tal como se ven
export function conectaArrastre(col, { miembrosSaga }) {
  if (!col || !esPropio()) return;
  let espera = null, arr = null, acabaDeSoltar = false;

  // Lo que se arrastra no abre la ficha ni despliega la saga al soltar
  col.addEventListener("click", (ev) => {
    if (arr || acabaDeSoltar) { ev.stopPropagation(); ev.preventDefault(); }
  }, true);
  // El menú contextual del navegador (pulsación larga en el móvil) estorba, y
  // con el ratón el navegador intentaría arrastrar la imagen de la portada
  col.addEventListener("contextmenu", (ev) => { if (espera || arr) ev.preventDefault(); });
  col.addEventListener("dragstart", (ev) => ev.preventDefault());
  // Mientras arrastras con el dedo, la página no se desplaza
  const frena = (ev) => { if (arr) ev.preventDefault(); };

  col.addEventListener("pointerdown", (ev) => {
    if (arr || (ev.pointerType === "mouse" && ev.button !== 0)) return;
    const carta = ev.target.closest(".carta[data-uid], .carta-saga[data-saga]");
    if (!carta) return;
    cancelaEspera();
    espera = { carta, x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY };
    espera.t = setTimeout(() => { const e = espera; espera = null; empieza(e); }, ESPERA_MS);
    addEventListener("pointermove", mueve);
    addEventListener("pointerup", suelta);
    addEventListener("pointercancel", cancela);
  });

  function cancelaEspera() {
    if (!espera) return;
    clearTimeout(espera.t);
    espera = null;
  }
  function quitaOyentes() {
    removeEventListener("pointermove", mueve);
    removeEventListener("pointerup", suelta);
    removeEventListener("pointercancel", cancela);
  }

  function empieza({ carta, x, y }) {
    const uids = carta.dataset.uid ? [carta.dataset.uid] : miembrosSaga(+carta.dataset.saga).map((e) => e.uid);
    if (!uids.length) return quitaOyentes();
    navigator.vibrate?.(12);
    const r = carta.getBoundingClientRect();
    // La copia que flota, del mismo tamaño y en el mismo sitio que la carta
    const clon = carta.cloneNode(true);
    clon.classList.add("carta-flotante");
    // Las temporadas de una saga desplegada llevan su propio transform y una
    // animación de entrada que pisarían el movimiento: la copia va sin ellas
    clon.classList.remove("abierta", "en-saga", ...[...clon.classList].filter((c) => c.startsWith("saga-")));
    clon.removeAttribute("tabindex");
    Object.assign(clon.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    // Encoge y se cuelga por encima del dedo (su borde de abajo en el puntero),
    // para que no tape la caja sobre la que la llevas
    // (sale en su sitio y a su tamaño, y en el siguiente fotograma se mueve, para que se vea)
    clon.style.setProperty("--escala", "1");
    clon.classList.add("levantando");
    document.body.append(clon);
    clon.getBoundingClientRect();
    clon.style.removeProperty("--escala");
    clon.style.setProperty("--ox", x - (r.left + r.width / 2) + "px");
    clon.style.setProperty("--oy", y - (r.top + r.height) - 34 + "px");
    setTimeout(() => clon.classList.remove("levantando"), 220);
    carta.classList.add("arrastrada");
    // Las cajas donde soltar; la del estado que ya tiene, apagada
    const actual = uids.length === 1 ? entrada(uids[0])?.estado : null;
    const sinFecha = uids.every((u) => !entrada(u)?.anio);
    const cajas = document.createElement("div");
    cajas.className = "soltar";
    cajas.innerHTML = `<p class="soltar-t">Suelta en…${uids.length > 1 ? ` <small>${uids.length} temporadas</small>` : ""}</p>
      <div class="soltar-cajas">${CAJAS.map((c) => {
        const ya = c.k === "atemporal" ? sinFecha : c.k === actual;
        return `<div class="soltar-caja ${ya ? "ya" : ""}" data-soltar="${c.k}" style="--c:${c.color}"><i>${c.jp}</i><b>${c.nombre}</b></div>`;
      }).join("")}</div>`;
    document.body.append(cajas);
    // Los avisos (el «Deshacer» de la carta de antes) suben por encima de las cajas
    document.body.style.setProperty("--alto-soltar", cajas.getBoundingClientRect().height + 12 + "px");
    document.body.classList.add("arrastrando");
    document.addEventListener("touchmove", frena, { passive: false });
    arr = { carta, clon, cajas, uids, x0: x, y0: y, vx: 0, ultX: x, encima: null };
    coloca(x, y);
  }

  function coloca(x, y) {
    // Se inclina hacia donde va, como si colgara del dedo
    arr.vx = arr.vx * 0.7 + (x - arr.ultX) * 0.3;
    arr.ultX = x;
    const giro = Math.max(-10, Math.min(10, arr.vx * 0.8));
    arr.clon.style.setProperty("--dx", x - arr.x0 + "px");
    arr.clon.style.setProperty("--dy", y - arr.y0 + "px");
    arr.clon.style.setProperty("--giro", giro + "deg");
    const caja = cajaCerca(arr.cajas, x, y);
    if (caja !== arr.encima) {
      arr.encima?.classList.remove("encima");
      caja?.classList.add("encima");
      if (caja && !caja.classList.contains("ya")) navigator.vibrate?.(6);
      arr.encima = caja;
    }
  }

  function mueve(ev) {
    if (espera) {
      espera.x = ev.clientX; espera.y = ev.clientY;
      if (Math.hypot(ev.clientX - espera.x0, ev.clientY - espera.y0) > TOLERANCIA) { cancelaEspera(); quitaOyentes(); }
      return;
    }
    if (arr) { ev.preventDefault(); coloca(ev.clientX, ev.clientY); }
  }

  function cancela() {
    cancelaEspera();
    quitaOyentes();
    if (arr) termina(null);
  }

  function suelta(ev) {
    cancelaEspera();
    quitaOyentes();
    if (!arr) return;
    coloca(ev.clientX, ev.clientY);
    const caja = arr.encima && !arr.encima.classList.contains("ya") ? arr.encima : null;
    termina(caja);
  }

  function termina(caja) {
    const { carta, clon, cajas, uids } = arr;
    arr = null;
    acabaDeSoltar = true;
    setTimeout(() => (acabaDeSoltar = false), 0);
    document.body.classList.remove("arrastrando");
    document.removeEventListener("touchmove", frena);
    cajas.classList.add("fuera");
    setTimeout(() => cajas.remove(), 250);
    if (caja) {
      // La carta se mete en la caja y se aplica el cambio
      const rc = caja.getBoundingClientRect(), rl = clon.getBoundingClientRect();
      clon.classList.add("entra");
      clon.style.setProperty("--dx", `${parseFloat(clon.style.getPropertyValue("--dx")) + rc.left + rc.width / 2 - (rl.left + rl.width / 2)}px`);
      clon.style.setProperty("--dy", `${parseFloat(clon.style.getPropertyValue("--dy")) + rc.top + rc.height / 2 - (rl.top + rl.height / 2)}px`);
      setTimeout(() => clon.remove(), 320);
      aplica(caja.dataset.soltar, uids);
      carta.classList.remove("arrastrada");
    } else {
      // Vuelve a su sitio
      clon.classList.add("vuelve");
      clon.style.setProperty("--dx", "0px");
      clon.style.setProperty("--dy", "0px");
      clon.style.setProperty("--ox", "0px");
      clon.style.setProperty("--oy", "0px");
      clon.style.setProperty("--giro", "0deg");
      setTimeout(() => { clon.remove(); carta.classList.remove("arrastrada"); }, 280);
    }
  }
}

// La caja a la que apuntas: no hace falta acertar dentro. Desde que el
// puntero está sobre el panel (o cerca, sobre todo por encima, que es por
// donde se llega) vale la caja más cercana.
function cajaCerca(panel, x, y) {
  const p = panel.getBoundingClientRect();
  if (x < p.left - 30 || x > p.right + 30 || y < p.top - 60 || y > p.bottom + 30) return null;
  let mejor = null, dist = Infinity;
  for (const b of panel.querySelectorAll("[data-soltar]")) {
    const r = b.getBoundingClientRect();
    const d = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
    if (d < dist) { dist = d; mejor = b; }
  }
  return mejor;
}

// Las mismas reglas que al cambiar el estado en la ficha: Visto o Revisto
// completan los episodios, y Visto pone la fecha de hoy si no lo estaba ya.
// Atemporal no toca el estado: quita el año y el mes.
function aplica(k, uids) {
  const hoy = new Date(), cambios = {};
  for (const uid of uids) {
    const x = entrada(uid);
    if (!x) continue;
    if (k === "atemporal") { if (x.anio) cambios[uid] = { anio: null, mes: null }; continue; }
    if (x.estado === k) continue;
    const c = { estado: k };
    const total = totalDe(x);
    if ((k === "visto" || k === "revisto") && total && (x.progreso || 0) < total) c.progreso = total;
    if (k === "visto" && x.estado !== "visto") { c.mes = hoy.getMonth() + 1; c.anio = hoy.getFullYear(); }
    cambios[uid] = c;
  }
  const n = Object.keys(cambios).length;
  if (!n) return;
  const primero = entrada(uids[0]);
  const destino = k === "atemporal" ? "∞ Atemporal" : ESTADOS[k].nombre;
  const quien = uids.length > 1 ? `${n} ${n === 1 ? "temporada" : "temporadas"} de «${primero.media?.saga?.t || primero.titulo}»` : `«${primero.titulo}»`;
  actualizaVarios(cambios);
  aviso(`${quien} → ${destino}`, { accion: "Deshacer", alPulsar: () => { deshaz(); aviso("Deshecho."); } });
}
