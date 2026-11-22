// 02 · PERFIL — tarjeta de operador, sincronía con AniList, radar de géneros,
// estudios, reparto de notas, actividad por mes y logros.
import { esc, fmtNota, rango, genero, MESES, ESTADOS } from "../ui.js";
import { operador, ponOperador, sujetoActual, esPropio } from "../almacen.js";
import { aviso } from "../ui.js";
import { panel as panelPrivacidad } from "./privacidad.js";

export function pinta(raiz, { stats: s, abreFicha }) {
  const op = s.op;
  const quien = sujetoActual(), propio = esPropio();
  const hechos = s.logros.filter((l) => l.hecho).length;
  raiz.innerHTML = `
  <section class="id-op panel esquinas">
    <div class="id-avatar">
      ${anillo(op.k)}
      ${quien?.avatar_url ? `<img class="id-foto" src="${esc(quien.avatar_url)}" alt="" referrerpolicy="no-referrer"><div class="id-kanji-mini">${op.rango.jp}</div>`
        : `<div class="id-kanji" style="--n:${[...op.rango.jp].length}">${op.rango.jp}</div>`}
      <div class="id-nv">NV<b>${op.nivel}</b></div>
    </div>
    <div class="id-datos">
      <span class="etq">OPERADOR · オペレーター · @${esc(quien?.alias || "")}${quien?.privado ? " · 非公開 PRIVADO" : ""}</span>
      <h2 class="id-nombre ${propio ? "editable" : ""}" id="op-nombre" ${propio ? 'contenteditable="plaintext-only" spellcheck="false" title="Pulsa para cambiar el nombre"' : ""}>${esc(operador())}</h2>
      <div class="id-rango">${esc(op.rango.nombre)} <i>${op.rango.jp}</i></div>
      <div class="xp"><div class="xp-barra"><span style="width:${(op.k * 100).toFixed(1)}%"></span></div>
        <small>${op.xp.toLocaleString("es-ES")} XP · faltan ${(op.hasta - op.xp).toLocaleString("es-ES")} para el NV ${op.nivel + 1}
        ${op.siguiente ? ` · rango «${esc(op.siguiente.nombre)}» en el NV ${op.siguiente.min}` : ""}</small></div>
      <dl class="id-cifras">
        <div><dt>Terminados</dt><dd>${s.terminados}</dd></div>
        <div><dt>Episodios</dt><dd>${s.eps.toLocaleString("es-ES")}</dd></div>
        <div><dt>Horas</dt><dd>${Math.round(s.horas).toLocaleString("es-ES")}</dd></div>
        <div><dt>Días</dt><dd>${(s.horas / 24).toFixed(1).replace(".", ",")}</dd></div>
        <div><dt>Logros</dt><dd>${hechos}/${s.logros.length}</dd></div>
      </dl>
    </div>
    <div class="id-codigo" aria-hidden="true">${codigo(operador() + op.nivel)}</div>
  </section>
  ${propio ? `<section class="panel esquinas p-priv" id="privacidad"></section>` : ""}

  <div class="paneles">
    <section class="panel esquinas p-sinc">
      <h2 class="p-tit"><span>Sincronía</span><i>同期率</i></h2>
      ${sincronia(s)}
    </section>
    <section class="panel esquinas p-radar">
      <h2 class="p-tit"><span>Perfil de géneros</span><i>ジャンル</i></h2>
      ${radar(s)}
    </section>
    <section class="panel esquinas p-notas">
      <h2 class="p-tit"><span>Cómo puntúas</span><i>評価</i></h2>
      ${histograma(s)}
    </section>
    <section class="panel esquinas p-estudios">
      <h2 class="p-tit"><span>Estudios</span><i>制作</i></h2>
      ${estudios(s)}
    </section>
    <section class="panel esquinas p-meses">
      <h2 class="p-tit"><span>Actividad</span><i>記録</i></h2>
      ${meses(s)}
    </section>
    <section class="panel esquinas p-estados">
      <h2 class="p-tit"><span>Reparto</span><i>状態</i></h2>
      ${estados(s)}
    </section>
  </div>

  <section class="panel esquinas p-logros">
    <h2 class="p-tit"><span>Logros</span><i>実績</i><small>${hechos} de ${s.logros.length}</small></h2>
    <div class="logros">${s.logros.map((l) => `
      <div class="logro ${l.hecho ? "hecho" : ""}" title="${esc(l.desc)}">
        <div class="logro-jp">${l.jp}</div>
        <div><b>${esc(l.nombre)}</b><small>${esc(l.desc)}</small>
        ${l.hecho ? "" : `<div class="logro-prog"><span style="width:${(l.actual / l.objetivo * 100).toFixed(1)}%"></span></div><em>${l.actual.toLocaleString("es-ES")}/${l.objetivo.toLocaleString("es-ES")}</em>`}</div>
      </div>`).join("")}</div>
  </section>`;

  if (propio) panelPrivacidad(raiz.querySelector("#privacidad"));
  const nom = raiz.querySelector("#op-nombre");
  if (propio) {
    nom.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); nom.blur(); } });
    nom.addEventListener("blur", async () => {
      const t = nom.textContent.trim().slice(0, 24);
      if (!t || t === operador()) { nom.textContent = operador(); return; }
      try { await ponOperador(t); aviso("Nombre cambiado."); } catch (err) { nom.textContent = operador(); aviso("No se pudo cambiar: " + err.message); }
    });
  }
  raiz.querySelectorAll("[data-uid]").forEach((n) => n.addEventListener("click", () => abreFicha(n.dataset.uid)));
}

function anillo(k) {
  const r = 54, c = 2 * Math.PI * r;
  return `<svg class="id-anillo" viewBox="0 0 128 128" aria-hidden="true">
    <circle cx="64" cy="64" r="${r}" class="an-fondo"/>
    <circle cx="64" cy="64" r="${r}" class="an-xp" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - k)}" transform="rotate(-90 64 64)"/>
    ${Array.from({ length: 36 }, (_, i) => { const a = i / 36 * Math.PI * 2; const r1 = 61, r2 = i % 3 ? 63 : 66;
      return `<line x1="${64 + Math.cos(a) * r1}" y1="${64 + Math.sin(a) * r1}" x2="${64 + Math.cos(a) * r2}" y2="${64 + Math.sin(a) * r2}"/>`; }).join("")}
  </svg>`;
}

// "Código de barras" decorativo derivado del nombre y el nivel
function codigo(sem) {
  let h = 7;
  return Array.from({ length: 42 }, (_, i) => { h = (h * 31 + sem.charCodeAt(i % sem.length)) % 9973; return `<i style="flex:${1 + h % 4}"></i>`; }).join("");
}

function sincronia(s) {
  if (!s.pares.length) return `<p class="tenue">Puntúa títulos vinculados a AniList para comparar.</p>`;
  const W = 300, H = 220, P = 26;
  const x = (v) => P + (v - 3) / 7 * (W - P - 8), y = (v) => H - P - (v - 3) / 7 * (H - P - 8);
  const sinc = Math.max(0, 100 - s.pares.reduce((a, p) => a + Math.abs(p.tuya - p.ellos), 0) / s.pares.length * 20);
  const d = s.delta;
  const veredicto = Math.abs(d) < 0.15 ? "Puntúas igual que la comunidad." :
    d > 0 ? `Tus notas van <b>${d.toFixed(2).replace(".", ",")}</b> puntos por encima de AniList: mano blanda.` :
    `Tus notas van <b>${(-d).toFixed(2).replace(".", ",")}</b> puntos por debajo de AniList: mano dura.`;
  const extremos = [...s.pares].sort((a, b) => (b.tuya - b.ellos) - (a.tuya - a.ellos));
  const pts = s.pares.map((p) => `<circle cx="${x(p.ellos).toFixed(1)}" cy="${y(Math.max(3, p.tuya)).toFixed(1)}" r="3.6"
      class="${p.tuya - p.ellos >= 0 ? "pt-mas" : "pt-menos"}" data-uid="${esc(p.e.uid)}"><title>${esc(p.e.titulo)} — tú ${fmtNota(p.tuya)} · AniList ${p.ellos.toFixed(1)}</title></circle>`).join("");
  const ejes = [4, 6, 8, 10].map((v) => `<line x1="${x(v)}" y1="${y(3)}" x2="${x(v)}" y2="${y(10)}" class="rej"/><text x="${x(v)}" y="${H - 8}" class="eje">${v}</text>
    <line x1="${x(3)}" y1="${y(v)}" x2="${x(10)}" y2="${y(v)}" class="rej"/><text x="6" y="${y(v) + 3}" class="eje">${v}</text>`).join("");
  return `<div class="sinc-cifra"><b>${sinc.toFixed(1).replace(".", ",")}</b><span>%</span><small>tasa de sincronía con AniList</small></div>
    <svg viewBox="0 0 ${W} ${H}" class="graf disp" role="img" aria-label="Tu nota frente a la de AniList">
      ${ejes}<line x1="${x(3)}" y1="${y(3)}" x2="${x(10)}" y2="${y(10)}" class="diag"/>
      ${pts}<text x="${W - 6}" y="${H - 8}" class="eje fin">AniList →</text><text x="${P + 4}" y="14" class="eje">↑ tú</text>
    </svg>
    <p class="veredicto">${veredicto}</p>
    <div class="extremos">
      <div><small>Más por encima</small>${extremos.slice(0, 3).map(mini).join("")}</div>
      <div><small>Más por debajo</small>${extremos.slice(-3).reverse().map(mini).join("")}</div>
    </div>`;
}
const mini = (p) => `<button class="mini" data-uid="${esc(p.e.uid)}"><span>${esc(p.e.titulo)}</span><b class="${p.tuya >= p.ellos ? "mas" : "menos"}">${p.tuya >= p.ellos ? "+" : ""}${(p.tuya - p.ellos).toFixed(1).replace(".", ",")}</b></button>`;

function radar(s) {
  const top = [...s.generos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (top.length < 3) return `<p class="tenue">Faltan datos de género.</p>`;
  const R = 92, C = 120, max = top[0][1];
  const p = (i, v) => { const a = -Math.PI / 2 + i / top.length * Math.PI * 2; return [C + Math.cos(a) * R * v, C + Math.sin(a) * R * v]; };
  const anillos = [0.25, 0.5, 0.75, 1].map((k) => `<polygon class="rej" points="${top.map((_, i) => p(i, k).join(",")).join(" ")}"/>`).join("");
  const radios = top.map((_, i) => `<line class="rej" x1="${C}" y1="${C}" x2="${p(i, 1)[0]}" y2="${p(i, 1)[1]}"/>`).join("");
  const forma = top.map(([, n], i) => p(i, n / max).join(",")).join(" ");
  const etiquetas = top.map(([g, n], i) => { const [x, y] = p(i, 1.2); return `<text x="${x}" y="${y}" class="r-et" text-anchor="${x < C - 5 ? "end" : x > C + 5 ? "start" : "middle"}">${esc(genero(g))} <tspan>${n}</tspan></text>`; }).join("");
  return `<svg viewBox="-40 0 320 240" class="graf radar" role="img" aria-label="Géneros más vistos">${anillos}${radios}
    <polygon class="r-forma" points="${forma}"/>${top.map(([, n], i) => `<circle class="r-pt" cx="${p(i, n / max)[0]}" cy="${p(i, n / max)[1]}" r="3"/>`).join("")}${etiquetas}</svg>`;
}

function histograma(s) {
  if (!s.notas.length) return `<p class="tenue">Sin notas todavía.</p>`;
  const cubos = Array.from({ length: 11 }, () => 0);
  s.notas.forEach((n) => cubos[Math.min(10, Math.floor(n))]++);
  const max = Math.max(...cubos);
  return `<div class="histo">${cubos.map((n, i) => { const r = rango(i === 10 ? 10 : i + 0.5);
      return `<div class="histo-c ${r.clase}" title="${n} con nota ${i}${i < 10 ? "–" + (i + 0.9).toFixed(1) : ""}"><span style="height:${max ? n / max * 100 : 0}%"><em>${n || ""}</em></span><small>${i}</small></div>`; }).join("")}</div>
    <p class="histo-pie">Media <b>${fmtNota(+s.media.toFixed(2))}</b> · Mediana <b>${fmtNota(mediana(s.notas))}</b> · ${s.diez} diez</p>`;
}
const mediana = (a) => { const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : +((b[m - 1] + b[m]) / 2).toFixed(2); };

function estudios(s) {
  const top = [...s.estudios.entries()].sort((a, b) => b[1].n - a[1].n || (b[1].suma / (b[1].conNota || 1)) - (a[1].suma / (a[1].conNota || 1))).slice(0, 7);
  if (!top.length) return `<p class="tenue">Sin estudios todavía.</p>`;
  const max = top[0][1].n;
  return `<ol class="barras">${top.map(([n, x]) => `<li><span class="b-n">${esc(n)}</span>
    <span class="b-b"><span style="width:${x.n / max * 100}%"></span></span><b>${x.n}</b>
    <em>${x.conNota ? "⌀ " + (x.suma / x.conNota).toFixed(1).replace(".", ",") : ""}</em></li>`).join("")}</ol>`;
}

function meses(s) {
  const hoy = new Date();
  const cols = Array.from({ length: 12 }, (_, i) => { const d = new Date(hoy.getFullYear(), hoy.getMonth() - 11 + i, 1);
    return { k: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, m: d.getMonth(), y: d.getFullYear() }; });
  const max = Math.max(1, ...cols.map((c) => s.porMes.get(c.k) || 0));
  return `<div class="meses">${cols.map((c) => { const n = s.porMes.get(c.k) || 0;
      return `<div class="mes-c" title="${MESES[c.m]} ${c.y}: ${n}"><span style="height:${n / max * 100}%"><em>${n || ""}</em></span><small>${MESES[c.m].slice(0, 3)}</small></div>`; }).join("")}</div>
    <p class="histo-pie">Últimos 12 meses · ${[...s.porAnio.entries()].sort((a, b) => b[0] - a[0]).map(([a, n]) => `${a}: <b>${n}</b>`).join(" · ")}</p>`;
}

function estados(s) {
  const tot = s.total || 1;
  return `<div class="reparto">${Object.entries(ESTADOS).map(([k, v]) => `<span style="flex:${s.porEstado[k] || 0};--c:${v.color}" title="${v.nombre}: ${s.porEstado[k] || 0}"></span>`).join("")}</div>
    <ul class="leyenda">${Object.entries(ESTADOS).map(([k, v]) => `<li style="--c:${v.color}"><i></i>${v.nombre}<b>${s.porEstado[k] || 0}</b><small>${Math.round((s.porEstado[k] || 0) / tot * 100)}%</small></li>`).join("")}</ul>`;
}
