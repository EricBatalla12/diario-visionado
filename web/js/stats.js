// Estadísticas, experiencia, nivel y logros del operador. Todo se deriva del
// archivo cada vez: no se guarda nada aparte, así que editar una nota o
// borrar un título recalcula el nivel al momento.

// Duración por defecto (min/ep) cuando el título no está en AniList
const DURACION = { anime: 24, peli: 110, serie: 45, manga: 0 };

export function episodios(e) {
  if (e.tipo === "manga") return 0;
  const total = e.media?.episodes ?? (e.tipo === "peli" ? 1 : null);
  if (e.estado === "visto" || e.estado === "revisto") return e.progreso || total || 0;
  if (e.estado === "viendo" || e.estado === "abandonado") return e.progreso || 0;
  return 0;
}
export const minutos = (e) => episodios(e) * (e.media?.duration || DURACION[e.tipo] || 24);
export const generosDe = (e) => [...new Set([...(e.media?.genres || []), ...(e.generos || [])])];

// ── Niveles ──────────────────────────────────────────────────────────────
// El nivel n pide 25·n² de experiencia: los primeros suben rápido y a partir
// del 30 cuesta de verdad.
export const RANGOS_OP = [
  { min: 0,  nombre: "Civil",            jp: "一般人" },
  { min: 3,  nombre: "Novato",           jp: "新人" },
  { min: 8,  nombre: "Aprendiz de weeb", jp: "見習い" },
  { min: 14, nombre: "Weeb certificado", jp: "ウィーブ" },
  { min: 20, nombre: "Otaku",            jp: "オタク" },
  { min: 28, nombre: "Otaku de élite",   jp: "精鋭" },
  { min: 36, nombre: "Sensei",           jp: "先生" },
  { min: 45, nombre: "Kami del sofá",    jp: "神" },
  { min: 60, nombre: "Ser trascendido",  jp: "超越" },
];
const xpNivel = (n) => 25 * n * n;

export function nivelDe(xp) {
  const n = Math.floor(Math.sqrt(xp / 25));
  const base = xpNivel(n), sig = xpNivel(n + 1);
  const rango = [...RANGOS_OP].reverse().find((r) => n >= r.min);
  const siguiente = RANGOS_OP.find((r) => r.min > n);
  return { nivel: n, rango, siguiente, xp, desde: base, hasta: sig, k: (xp - base) / (sig - base) };
}

// ── Estadísticas ─────────────────────────────────────────────────────────
// `aciertos`: títulos que este operador recomendó y que quien los recibió
// puntuó con 9 o más (sale de otros archivos, así que se pasa desde fuera).
export function calcula(lista, { aciertos = 0 } = {}) {
  const s = {
    aciertos,
    total: lista.length, porEstado: {}, porTipo: {}, eps: 0, minutos: 0, notas: [],
    generos: new Map(), estudios: new Map(), pares: [], porMes: new Map(), porAnio: new Map(),
    retro: null, enEmision: [], comentarios: 0, terminados: 0,
  };
  for (const e of lista) {
    s.porEstado[e.estado] = (s.porEstado[e.estado] || 0) + 1;
    s.porTipo[e.tipo] = (s.porTipo[e.tipo] || 0) + 1;
    if (e.estado === "pendiente") continue;
    const ep = episodios(e);
    s.eps += ep;
    s.minutos += minutos(e);
    if (e.estado === "visto" || e.estado === "revisto") s.terminados++;
    if (e.nota != null) {
      s.notas.push(e.nota);
      if (e.media?.averageScore) s.pares.push({ e, tuya: e.nota, ellos: e.media.averageScore / 10 });
    }
    if (e.comentario?.trim()) s.comentarios++;
    for (const g of generosDe(e)) s.generos.set(g, (s.generos.get(g) || 0) + 1);
    if (e.media?.studio) {
      const x = s.estudios.get(e.media.studio) || { n: 0, suma: 0, conNota: 0 };
      x.n++; if (e.nota != null) { x.suma += e.nota; x.conNota++; }
      s.estudios.set(e.media.studio, x);
    }
    const y = e.media?.seasonYear;
    if (y && (s.retro == null || y < s.retro)) s.retro = y;
    if (e.estado === "viendo" && e.media?.status === "RELEASING") s.enEmision.push(e);
    if (e.anio) {
      s.porAnio.set(e.anio, (s.porAnio.get(e.anio) || 0) + 1);
      if (e.mes) { const k = `${e.anio}-${String(e.mes).padStart(2, "0")}`; s.porMes.set(k, (s.porMes.get(k) || 0) + 1); }
    }
  }
  s.horas = s.minutos / 60;
  s.media = s.notas.length ? s.notas.reduce((a, b) => a + b, 0) / s.notas.length : null;
  s.mediaComunidad = s.pares.length ? s.pares.reduce((a, p) => a + p.ellos, 0) / s.pares.length : null;
  s.delta = s.pares.length ? s.pares.reduce((a, p) => a + p.tuya - p.ellos, 0) / s.pares.length : 0;
  s.diez = s.notas.filter((n) => n >= 10).length;
  s.minNota = s.notas.length ? Math.min(...s.notas) : null;
  s.contra = s.pares.filter((p) => Math.abs(p.tuya - p.ellos) >= 1.5).length;

  s.xp = Math.round(s.eps * 10 + s.terminados * 40 + s.notas.length * 5 + s.comentarios * 5);
  s.logros = LOGROS.map((l) => {
    const [a, b] = l.mide(s);
    return { ...l, actual: Math.min(a, b), objetivo: b, hecho: a >= b };
  });
  s.xp += s.logros.filter((l) => l.hecho).length * 100;
  s.op = nivelDe(s.xp);
  return s;
}

const g = (s, ...nombres) => nombres.reduce((a, n) => a + (s.generos.get(n) || 0), 0);

// mide(s) → [actual, objetivo]
export const LOGROS = [
  { id: "primer",  jp: "初", nombre: "Primer contacto",      desc: "Termina tu primer título",            mide: (s) => [s.terminados, 1] },
  { id: "marat",   jp: "走", nombre: "Maratón",              desc: "100 episodios vistos",                mide: (s) => [s.eps, 100] },
  { id: "sinvida", jp: "籠", nombre: "Sin vida social",      desc: "1.000 episodios vistos",              mide: (s) => [s.eps, 1000] },
  { id: "hikiko",  jp: "引", nombre: "Hikikomori",           desc: "2.500 episodios vistos",              mide: (s) => [s.eps, 2500] },
  { id: "dia",     jp: "日", nombre: "Un día entero",        desc: "24 horas delante de la pantalla",     mide: (s) => [Math.floor(s.horas), 24] },
  { id: "mes",     jp: "月", nombre: "Un mes de tu vida",    desc: "720 horas vistas",                    mide: (s) => [Math.floor(s.horas), 720] },
  { id: "diez",    jp: "傑", nombre: "Obra maestra",         desc: "Pon un 10",                           mide: (s) => [s.diez, 1] },
  { id: "verdugo", jp: "斬", nombre: "Verdugo",              desc: "Pon una nota por debajo de 5",        mide: (s) => [s.minNota != null && s.minNota < 5 ? 1 : 0, 1] },
  { id: "colec",   jp: "蔵", nombre: "Coleccionista",        desc: "100 títulos en el archivo",           mide: (s) => [s.total, 100] },
  { id: "shonen",  jp: "拳", nombre: "Sangre shōnen",        desc: "25 títulos de acción",                mide: (s) => [g(s, "Action"), 25] },
  { id: "shojo",   jp: "恋", nombre: "Corazón de shōjo",     desc: "15 títulos de romance",               mide: (s) => [g(s, "Romance"), 15] },
  { id: "mente",   jp: "狂", nombre: "Mente retorcida",      desc: "5 de terror o psicológico",           mide: (s) => [g(s, "Horror", "Psychological"), 5] },
  { id: "melo",    jp: "音", nombre: "Melómano",             desc: "2 títulos de música",                 mide: (s) => [g(s, "Music"), 2] },
  { id: "sofa",    jp: "球", nombre: "Deportista de sofá",   desc: "3 títulos de deportes",               mide: (s) => [g(s, "Sports"), 3] },
  { id: "mecha",   jp: "機", nombre: "Piloto",               desc: "3 títulos de mecha",                  mide: (s) => [g(s, "Mecha"), 3] },
  { id: "soltar",  jp: "捨", nombre: "Sin miedo a soltar",   desc: "Abandona 5 títulos",                  mide: (s) => [s.porEstado.abandonado || 0, 5] },
  { id: "dejavu",  jp: "再", nombre: "Déjà vu",              desc: "Vuelve a ver 3 títulos",              mide: (s) => [s.porEstado.revisto || 0, 3] },
  { id: "retro",   jp: "古", nombre: "Arqueólogo",           desc: "Ve algo estrenado antes del 2000",    mide: (s) => [s.retro && s.retro < 2000 ? 1 : 0, 1] },
  { id: "aldia",   jp: "今", nombre: "Al día",               desc: "Sigue un anime mientras se emite",    mide: (s) => [s.enEmision.length, 1] },
  { id: "lector",  jp: "読", nombre: "Lector",               desc: "Ten un manga en el archivo",          mide: (s) => [s.porTipo.manga || 0, 1] },
  { id: "monte",   jp: "山", nombre: "Montaña de pendientes",desc: "20 pendientes a la vez",              mide: (s) => [s.porEstado.pendiente || 0, 20] },
  { id: "critico", jp: "評", nombre: "Crítico",              desc: "Escribe 50 comentarios",              mide: (s) => [s.comentarios, 50] },
  { id: "contra",  jp: "逆", nombre: "A contracorriente",    desc: "Discrepa 1,5 puntos de AniList en 5", mide: (s) => [s.contra, 5] },
  { id: "ojo",     jp: "眼", nombre: "Ojo clínico",          desc: "3 recomendaciones tuyas acaban con 9+", mide: (s) => [s.aciertos, 3] },
  { id: "kami",    jp: "神", nombre: "Kami",                 desc: "Llega al nivel 45",                   mide: (s) => [Math.floor(Math.sqrt(s.xp / 25)), 45] },
];
