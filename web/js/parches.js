// Notas del parche: lo que cambia en KIROKU, en palabras de quien lo usa.
// El primero de la lista es el último. Para un parche nuevo, se añade arriba
// con un `id` nuevo (la fecha): a quien ya había entrado le sale el aviso de
// "Novedades" una vez y la marca de NUEVO en el menú hasta que lo abre.
//
// En los textos, **así** va en negrita; el resto se escapa al pintar.

export const PARCHES = [
  {
    id: "2026-11-28b",
    fecha: "28 de noviembre de 2026",
    titulo: "Más niveles y logros",
    jp: "実績",
    secciones: [
      { titulo: "Novedades", ico: "✦", items: [
        "**12 títulos de nivel nuevos**, de Curioso (NV 1) a **Dios del registro** (NV 100), pasando por Senpai, Maestro del maratón, Leyenda viva o Entidad multiversal.",
        "**29 logros nuevos** (54 en total): capítulos de manga leídos, pelis, **sagas completas**, rachas del mes, más géneros, estudios, notas y el nivel 60.",
        "Si desbloqueas varios logros a la vez, un solo aviso los junta todos. Cada logro da experiencia, así que es posible que subas algún nivel nada más entrar.",
      ] },
      { titulo: "Arreglos", ico: "✚", items: [
        "El **10** de la nota volvía a verse transparente, y el brillo del número dibujaba una caja. Ahora brilla limpio, y el 10 en dorado.",
      ] },
    ],
  },
  {
    id: "2026-11-28",
    fecha: "28 de noviembre de 2026",
    titulo: "La consola de registro",
    jp: "操作盤",
    secciones: [
      { titulo: "Novedades", ico: "✦", items: [
        "**Tu registro** es ahora una consola. La nota se pone **arrastrando la barra**, que se llena del color de tu rango (siguen − y ＋ para afinar, y se puede escribir).",
        "Los **estados** son un raíl: una luz se desliza hasta el que eliges y la consola se tiñe de su color.",
        "Cada **episodio es un segmento**: pulsa uno para marcar hasta ahí (pulsar el último lo desmarca).",
        "El **comentario** parece una terminal.",
      ] },
      { titulo: "Móvil", ico: "▯", items: [
        "Archivo más compacto: **tres cartas por fila**, los seis estados a la vista sin deslizar y tipo, año, género y orden recogidos tras el botón **⚙**.",
      ] },
      { titulo: "Cambios", ico: "⚙", items: [
        "KIROKU **recuerda lo que pide a AniList** (fichas, temporadas y sagas): la segunda vez se abren al momento y AniList se satura menos.",
      ] },
      { titulo: "Arreglos", ico: "✚", items: [
        "Los títulos largos en **Últimas** del Gacha ya no se salen del panel.",
        "En **Sincronía** del Perfil, las listas caben y la diferencia va en la misma línea que el título.",
      ] },
    ],
  },
  {
    id: "2026-11-23b",
    fecha: "23 de noviembre de 2026",
    titulo: "Sagas de un golpe",
    jp: "一括",
    secciones: [
      { titulo: "Novedades", ico: "✦", items: [
        "**⧉ Añadir la saga**, en la sección Temporadas de la ficha: apunta todas las temporadas de golpe, como vistas o pendientes, con **una nota para toda la saga** y el año en que la viste (o ∞ Atemporal). Ideal para pasar a KIROKU todo lo que ya habías visto. Se deshace de una vez.",
        "Si ya tienes todas las temporadas, **⧉ Nota a la saga** les pone a todas la misma nota.",
      ] },
      { titulo: "Cambios", ico: "⚙", items: [
        "Con **⧉ Sagas** activo, los contadores de **Todos, Visto, Viendo…** del Archivo cuentan cada saga como un título, igual que la cifra de Títulos.",
      ] },
    ],
  },
  {
    id: "2026-11-23",
    fecha: "23 de noviembre de 2026",
    titulo: "Sagas, avisos y móvil",
    jp: "連作",
    secciones: [
      { titulo: "Novedades", ico: "✦", items: [
        "**Sagas**: las temporadas de un mismo anime se juntan en una sola carta apilada en el Archivo. Tócala para ver sus temporadas; el botón **⧉ Sagas** lo desactiva. Cada saga cuenta como un título.",
        "Sección **Temporadas** en la ficha: la saga entera en orden, con tu estado y tu nota en cada una, y **＋** para apuntar las que te faltan.",
        "**Tier list por sagas** (⧉ Sagas): una portada por saga con la nota media de sus temporadas.",
        "**Continúa**, en Temporada: la siguiente temporada de lo que sigues, en emisión, con fecha o anunciada.",
        "**Ya terminados**: si tenías en pendientes un anime en emisión, KIROKU te avisa cuando termina, con **▶ Empezar** en Temporada y la etiqueta **✓ Completo** en su carta.",
        "Progreso por **capítulos** en manga, manhwa y manhua; los manhwa y manhua salen con su nombre.",
        "Elegir **cuándo lo viste**: el año con ◀ ▶, los 12 meses a la vista y **∞ Atemporal** para lo que no tiene fecha.",
        "Ya no puedes **recomendar** algo que el otro ya ha visto, está viendo o abandonó (si lo tiene pendiente, sí: es un empujón).",
        "**Tutorial guiado** para quien llega nuevo; se repite en ⋮ → Ver el tutorial.",
        "Este apartado de **Novedades**.",
      ] },
      { titulo: "Móvil", ico: "▯", items: [
        "Pestañas **abajo**, como una app, y cabecera más compacta.",
        "Menos información y botones más pequeños en archivo, ficha, perfil, Temporada y Gacha.",
        "«En emisión en tu archivo» se puede **plegar**.",
        "El botón **Invocar** del Gacha se ve sin bajar.",
        "Se puede **añadir a la pantalla de inicio** y se abre como una app.",
      ] },
      { titulo: "Cambios", ico: "⚙", items: [
        "KIROKU es de **anime, manga, manhwa y manhua**: ya no se añaden series de imagen real (las que tenías siguen ahí). Las pelis de anime siguen como Película y se pueden filtrar.",
        "El **banner** de la ficha se ve entero, sin recortes.",
        "El progreso (**13 / 13**) sale centrado.",
      ] },
      { titulo: "Arreglos", ico: "✚", items: [
        "Las fichas cargan aunque **AniList vaya lento**: lo que abres pasa por delante de lo que se actualiza de fondo, y si AniList se satura se reintenta solo.",
        "Pulsar una **temporada que no tienes** abre su ficha al momento.",
        "En **Operadores**, los títulos cuentan cada saga como uno, igual que en el Archivo.",
        "**Desplegar una saga** es instantáneo, y filtrar el Archivo ya no deja la página en negro un momento.",
      ] },
    ],
  },
  {
    id: "2026-11-22",
    fecha: "22 de noviembre de 2026",
    titulo: "Recomendaciones y privacidad",
    jp: "推薦",
    secciones: [
      { titulo: "Novedades", ico: "✦", items: [
        "**Recomendaciones** entre operadores: «Recomendar a…» desde la ficha y un **buzón** con lo que te mandan. Tú decides quién puede recomendarte y cuántas a la vez.",
        "Logro **Ojo clínico**: 3 recomendaciones tuyas que el otro puntúa con 9 o más.",
        "**Perfil privado**, con la lista de operadores que pueden verlo.",
        "La **nota** se afina con − y ＋ de 0,1 o escribiéndola.",
        "Las cartas de **Temporada** dicen cuántos episodios tendrá cada anime.",
      ] },
      { titulo: "Arreglos", ico: "✚", items: [
        "La letra del rango de la nota vuelve a tener su color.",
      ] },
    ],
  },
];

const CLAVE = "kiroku:parche-visto";
export const ultimo = () => PARCHES[0];
export function visto() { try { return localStorage.getItem(CLAVE); } catch { return PARCHES[0].id; } }
export function marcaVisto() { try { localStorage.setItem(CLAVE, PARCHES[0].id); } catch {} }
// Hay novedades si nunca se abrió este apartado o el último parche es posterior
export const hayNuevo = () => visto() !== PARCHES[0].id;
