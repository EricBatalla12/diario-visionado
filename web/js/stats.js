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
// Capítulos leídos de un manga (manhwa, manhua), con las mismas reglas que los episodios
export function capitulos(e) {
  if (e.tipo !== "manga") return 0;
  if (e.estado === "visto" || e.estado === "revisto") return e.progreso || e.media?.chapters || 0;
  if (e.estado === "viendo" || e.estado === "abandonado") return e.progreso || 0;
  return 0;
}
export const minutos = (e) => episodios(e) * (e.media?.duration || DURACION[e.tipo] || 24);
export const generosDe = (e) => [...new Set([...(e.media?.genres || []), ...(e.generos || [])])];

// ── Niveles ──────────────────────────────────────────────────────────────
// El nivel n pide 25·n² de experiencia: los primeros suben rápido y a partir
// del 30 cuesta de verdad.
export const RANGOS_OP = [
  { min: 0,   nombre: "Civil",                 jp: "一般人" },
  { min: 1,   nombre: "Curioso",               jp: "好奇心" },
  { min: 3,   nombre: "Novato",                jp: "新人" },
  { min: 5,   nombre: "Espectador habitual",   jp: "常連" },
  { min: 8,   nombre: "Aprendiz de weeb",      jp: "見習い" },
  { min: 11,  nombre: "Cazador de temporadas", jp: "狩人" },
  { min: 14,  nombre: "Weeb certificado",      jp: "ウィーブ" },
  { min: 17,  nombre: "Coleccionista",         jp: "収集家" },
  { min: 20,  nombre: "Otaku",                 jp: "オタク" },
  { min: 24,  nombre: "Senpai",                jp: "先輩" },
  { min: 28,  nombre: "Otaku de élite",        jp: "精鋭" },
  { min: 32,  nombre: "Ermitaño del anime",    jp: "隠者" },
  { min: 36,  nombre: "Sensei",                jp: "先生" },
  { min: 40,  nombre: "Maestro del maratón",   jp: "達人" },
  { min: 45,  nombre: "Kami del sofá",         jp: "神" },
  { min: 50,  nombre: "Leyenda viva",          jp: "伝説" },
  { min: 55,  nombre: "Emperador otaku",       jp: "皇帝" },
  { min: 60,  nombre: "Ser trascendido",       jp: "超越" },
  { min: 70,  nombre: "Entidad multiversal",   jp: "多元" },
  { min: 80,  nombre: "Guardián del archivo",  jp: "守護者" },
  { min: 100, nombre: "Dios del registro",     jp: "記録神" },
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
    total: lista.length, porEstado: {}, porTipo: {}, eps: 0, caps: 0, minutos: 0, notas: [], largos: 0,
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
    s.caps += capitulos(e);
    if (e.estado === "visto" || e.estado === "revisto") {
      s.terminados++;
      if ((e.media?.episodes || 0) >= 100) s.largos++;
    }
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

  // Sagas completas: todas sus temporadas vistas (o revistas)
  const porSaga = new Map();
  for (const e of lista) {
    const sg = e.media?.saga;
    if (!sg || sg.de < 2) continue;
    const x = porSaga.get(sg.id) || { de: sg.de, vistas: 0 };
    if (e.estado === "visto" || e.estado === "revisto") x.vistas++;
    porSaga.set(sg.id, x);
  }
  s.sagasCompletas = [...porSaga.values()].filter((x) => x.vistas >= x.de).length;
  s.maxMes = Math.max(0, ...s.porMes.values());
  s.maxEstudio = Math.max(0, ...[...s.estudios.values()].map((x) => x.n));
  // Para los logros de notas, épocas, manhwa, Ghibli, paciencia y comentarios
  const letra = (n) => n >= 10 ? "EX" : n >= 9.5 ? "S+" : n >= 9 ? "S" : n >= 8 ? "A" : n >= 7 ? "B" : n >= 6 ? "C" : n >= 5 ? "D" : "F";
  s.rangosNota = new Set(s.notas.map(letra)).size;
  s.altas = s.notas.filter((n) => n >= 9).length;
  s.bajas = s.notas.filter((n) => n < 6).length;
  const hechos = lista.filter((e) => e.estado !== "pendiente");
  s.decadas = new Set(hechos.map((e) => e.media?.seasonYear).filter(Boolean).map((y) => Math.floor(y / 10))).size;
  s.delAnio = hechos.filter((e) => e.media?.seasonYear === new Date().getFullYear()).length;
  s.manhwa = lista.filter((e) => e.tipo === "manga" && e.media?.countryOfOrigin === "KR").length;
  s.ghibli = hechos.filter((e) => /ghibli/i.test(e.media?.studio || "")).length;
  s.paciencia = lista.some((e) => e.estado === "pendiente" && e.creado && Date.now() - e.creado > 365 * 864e5) ? 1 : 0;
  s.ensayo = lista.some((e) => (e.comentario || "").trim().length >= 300) ? 1 : 0;

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
const nivelSinLogros = (s) => Math.floor(Math.sqrt(s.xp / 25));
export const LOGROS = [
  // Primeros pasos y cantidad
  { id: "primer",  jp: "初", nombre: "Primer contacto",      desc: "Termina tu primer título",            mide: (s) => [s.terminados, 1] },
  { id: "colec",   jp: "蔵", nombre: "Coleccionista",        desc: "100 títulos en el archivo",           mide: (s) => [s.total, 100] },
  { id: "archiv",  jp: "庫", nombre: "Archivista",           desc: "250 títulos en el archivo",           mide: (s) => [s.total, 250] },
  { id: "alejan",  jp: "館", nombre: "Alejandría",           desc: "500 títulos en el archivo",           mide: (s) => [s.total, 500] },
  // Episodios y horas
  { id: "marat",   jp: "走", nombre: "Maratón",              desc: "100 episodios vistos",                mide: (s) => [s.eps, 100] },
  { id: "sinvida", jp: "籠", nombre: "Sin vida social",      desc: "1.000 episodios vistos",              mide: (s) => [s.eps, 1000] },
  { id: "hikiko",  jp: "引", nombre: "Hikikomori",           desc: "2.500 episodios vistos",              mide: (s) => [s.eps, 2500] },
  { id: "limite",  jp: "極", nombre: "Al límite",            desc: "5.000 episodios vistos",              mide: (s) => [s.eps, 5000] },
  { id: "largo",   jp: "長", nombre: "Ultramaratón",         desc: "Termina un título de 100 episodios o más", mide: (s) => [s.largos, 1] },
  { id: "dia",     jp: "日", nombre: "Un día entero",        desc: "24 horas delante de la pantalla",     mide: (s) => [Math.floor(s.horas), 24] },
  { id: "semana",  jp: "週", nombre: "Una semana sin salir", desc: "168 horas vistas",                    mide: (s) => [Math.floor(s.horas), 168] },
  { id: "mes",     jp: "月", nombre: "Un mes de tu vida",    desc: "720 horas vistas",                    mide: (s) => [Math.floor(s.horas), 720] },
  // Manga y pelis
  { id: "lector",  jp: "読", nombre: "Lector",               desc: "Ten un manga en el archivo",          mide: (s) => [s.porTipo.manga || 0, 1] },
  { id: "tomos",   jp: "頁", nombre: "Devorador de tomos",   desc: "500 capítulos leídos",                mide: (s) => [s.caps, 500] },
  { id: "biblio",  jp: "書", nombre: "Biblioteca andante",   desc: "2.000 capítulos leídos",              mide: (s) => [s.caps, 2000] },
  { id: "cine",    jp: "映", nombre: "Cinéfilo",             desc: "10 películas en el archivo",          mide: (s) => [s.porTipo.peli || 0, 10] },
  { id: "hallyu",  jp: "韓", nombre: "Hallyu",               desc: "5 manhwa en el archivo",              mide: (s) => [s.manhwa, 5] },
  { id: "ghibli",  jp: "森", nombre: "Espíritu del bosque",  desc: "Ve 3 títulos de Studio Ghibli",       mide: (s) => [s.ghibli, 3] },
  // Sagas y temporadas
  { id: "saga",    jp: "完", nombre: "Saga completa",        desc: "Ve todas las temporadas de una saga", mide: (s) => [s.sagasCompletas, 1] },
  { id: "sagas",   jp: "連", nombre: "Devorasagas",          desc: "Completa 5 sagas",                    mide: (s) => [s.sagasCompletas, 5] },
  { id: "aldia",   jp: "今", nombre: "Al día",               desc: "Sigue un anime mientras se emite",    mide: (s) => [s.enEmision.length, 1] },
  { id: "ola",     jp: "波", nombre: "En la cresta de la ola", desc: "Sigue 3 animes en emisión a la vez", mide: (s) => [s.enEmision.length, 3] },
  { id: "racha",   jp: "熱", nombre: "Racha",                desc: "10 títulos en un mismo mes",          mide: (s) => [s.maxMes, 10] },
  { id: "vetera",  jp: "歴", nombre: "Veterano",             desc: "Registros en 3 años distintos",       mide: (s) => [s.porAnio.size, 3] },
  { id: "retro",   jp: "古", nombre: "Arqueólogo",           desc: "Ve algo estrenado antes del 2000",    mide: (s) => [s.retro && s.retro < 2000 ? 1 : 0, 1] },
  { id: "decadas", jp: "代", nombre: "Viajero en el tiempo", desc: "Títulos estrenados en 4 décadas distintas", mide: (s) => [s.decadas, 4] },
  { id: "nuevo",   jp: "新", nombre: "Recién salido",        desc: "5 títulos estrenados este año",       mide: (s) => [s.delAnio, 5] },
  { id: "paciencia", jp: "待", nombre: "Paciencia infinita", desc: "Un pendiente que lleva más de un año en tu archivo", mide: (s) => [s.paciencia, 1] },
  // Notas y crítica
  { id: "diez",    jp: "傑", nombre: "Obra maestra",         desc: "Pon un 10",                           mide: (s) => [s.diez, 1] },
  { id: "dieces",  jp: "宝", nombre: "Galería de obras maestras", desc: "Pon cinco dieces",              mide: (s) => [s.diez, 5] },
  { id: "verdugo", jp: "斬", nombre: "Verdugo",              desc: "Pon una nota por debajo de 5",        mide: (s) => [s.minNota != null && s.minNota < 5 ? 1 : 0, 1] },
  { id: "puntua",  jp: "点", nombre: "Puntuador",            desc: "Pon 100 notas",                       mide: (s) => [s.notas.length, 100] },
  // Antes eran por nota media (8,5 o más / 6,5 o menos) y no se podían tener los dos a la vez
  { id: "blanda",  jp: "甘", nombre: "Mano blanda",          desc: "Pon 10 notas de 9 o más",             mide: (s) => [s.altas, 10] },
  { id: "dura",    jp: "厳", nombre: "Mano dura",            desc: "Pon 10 notas por debajo de 6",        mide: (s) => [s.bajas, 10] },
  { id: "paleta",  jp: "虹", nombre: "Paleta completa",      desc: "Una nota de cada rango, de F a EX",   mide: (s) => [s.rangosNota, 8] },
  { id: "contra",  jp: "逆", nombre: "A contracorriente",    desc: "Discrepa 1,5 puntos de AniList en 5", mide: (s) => [s.contra, 5] },
  { id: "escrit",  jp: "筆", nombre: "Escritor",             desc: "Escribe 10 comentarios",              mide: (s) => [s.comentarios, 10] },
  { id: "critico", jp: "評", nombre: "Crítico",              desc: "Escribe 50 comentarios",              mide: (s) => [s.comentarios, 50] },
  { id: "ensayo",  jp: "論", nombre: "Ensayista",            desc: "Escribe un comentario de 300 caracteres o más", mide: (s) => [s.ensayo, 1] },
  { id: "ojo",     jp: "眼", nombre: "Ojo clínico",          desc: "3 recomendaciones tuyas acaban con 9+", mide: (s) => [s.aciertos, 3] },
  // Géneros y estudios
  { id: "shonen",  jp: "拳", nombre: "Sangre shōnen",        desc: "25 títulos de acción",                mide: (s) => [g(s, "Action"), 25] },
  { id: "shojo",   jp: "恋", nombre: "Corazón de shōjo",     desc: "15 títulos de romance",               mide: (s) => [g(s, "Romance"), 15] },
  { id: "isekai",  jp: "異", nombre: "Otro mundo",           desc: "15 títulos de fantasía",              mide: (s) => [g(s, "Fantasy"), 15] },
  { id: "risa",    jp: "笑", nombre: "Risa fácil",           desc: "15 títulos de comedia",               mide: (s) => [g(s, "Comedy"), 15] },
  { id: "lagrima", jp: "涙", nombre: "Lágrima fácil",        desc: "15 títulos de drama",                 mide: (s) => [g(s, "Drama"), 15] },
  { id: "calma",   jp: "和", nombre: "Vida tranquila",       desc: "10 títulos de recuentos de la vida",  mide: (s) => [g(s, "Slice of Life"), 10] },
  { id: "estelar", jp: "星", nombre: "Viajero estelar",      desc: "10 títulos de ciencia ficción",       mide: (s) => [g(s, "Sci-Fi"), 10] },
  { id: "medium",  jp: "霊", nombre: "Médium",               desc: "10 títulos sobrenaturales",           mide: (s) => [g(s, "Supernatural"), 10] },
  { id: "detect",  jp: "謎", nombre: "Detective",            desc: "5 títulos de misterio",               mide: (s) => [g(s, "Mystery"), 5] },
  { id: "mente",   jp: "狂", nombre: "Mente retorcida",      desc: "5 de terror o psicológico",           mide: (s) => [g(s, "Horror", "Psychological"), 5] },
  { id: "melo",    jp: "音", nombre: "Melómano",             desc: "2 títulos de música",                 mide: (s) => [g(s, "Music"), 2] },
  { id: "sofa",    jp: "球", nombre: "Deportista de sofá",   desc: "3 títulos de deportes",               mide: (s) => [g(s, "Sports"), 3] },
  { id: "mecha",   jp: "機", nombre: "Piloto",               desc: "3 títulos de mecha",                  mide: (s) => [g(s, "Mecha"), 3] },
  { id: "arcoiris",jp: "彩", nombre: "Arcoíris",             desc: "Títulos de 12 géneros distintos",     mide: (s) => [s.generos.size, 12] },
  { id: "fiel",    jp: "社", nombre: "Fiel a un estudio",    desc: "5 títulos del mismo estudio",         mide: (s) => [s.maxEstudio, 5] },
  { id: "trotam",  jp: "巡", nombre: "Trotamundos",          desc: "Títulos de 20 estudios distintos",    mide: (s) => [s.estudios.size, 20] },
  // Hábitos
  { id: "soltar",  jp: "捨", nombre: "Sin miedo a soltar",   desc: "Abandona 5 títulos",                  mide: (s) => [s.porEstado.abandonado || 0, 5] },
  { id: "dejavu",  jp: "再", nombre: "Déjà vu",              desc: "Vuelve a ver 3 títulos",              mide: (s) => [s.porEstado.revisto || 0, 3] },
  { id: "monte",   jp: "山", nombre: "Montaña de pendientes",desc: "20 pendientes a la vez",              mide: (s) => [s.porEstado.pendiente || 0, 20] },
  // Nivel (sin contar la experiencia de los propios logros)
  { id: "kami",    jp: "神", nombre: "Kami",                 desc: "Llega al nivel 45",                   mide: (s) => [nivelSinLogros(s), 45] },
  { id: "trasc",   jp: "超", nombre: "Trascendencia",        desc: "Llega al nivel 60",                   mide: (s) => [nivelSinLogros(s), 60] },
];
