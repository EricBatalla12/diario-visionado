// Notas del parche: lo que cambia en KIROKU, en palabras de quien lo usa.
// El primero de la lista es el último. Para un parche nuevo, se añade arriba
// con un `id` nuevo (la fecha): a quien ya había entrado le sale el aviso de
// "Novedades" una vez y la marca de NUEVO en el menú hasta que lo abre.
//
// En los textos, **así** va en negrita; el resto se escapa al pintar.

export const PARCHES = [
  {
    id: "2026-11-28e",
    fecha: "28 de noviembre de 2026",
    titulo: "Cartas coleccionables",
    jp: "図鑑",
    secciones: [
      { titulo: "Novedades", ico: "✦", items: [
        "**El Gacha ahora es de cartas**: cada invocación saca anime o manga de AniList (dos pozos, cada uno con su álbum) como una **carta coleccionable**, con su rareza por la nota de AniList, su tipo y su número de colección.",
        "**Tickets**: se ganan viendo. **2 por cada nivel** (también los que ya tenías) y **1 por cada título terminado**. La **tirada del día** sigue siendo gratis, y cada 7 días seguidos es SR o más.",
        "**Descubre**: lo que no tienes en el archivo sale como **NUEVA**, con su sinopsis y un botón para **apuntarlo a pendientes**. Lo que ya terminaste sale **despertado 覚醒**, con marco dorado; y si terminas algo de lo que tienes carta, se despierta.",
        "**Invocar ×10** con una SR o más asegurada, y SSR segura si llevas 30 invocaciones sin ninguna. Las **repetidas dan fragmentos**: con 5, un ticket.",
        "**Álbum 図鑑** con filtros y **sets** (Leyendas, Studio Ghibli, Los 90, Manhwa…). Cada semana dos sets tienen su propio banner, y **completar un set da 3 tickets**.",
        "**3 logros nuevos**: Mazo, Set completo y Despertar. Y puedes ver el álbum de otros operadores desde su perfil.",
        "**Invocar luce más**: el portal se tiñe del color de lo mejor que viene, cada carta sale con un estallido de su rareza y, si te toca una **brillante ✦** (1 de cada 200 cartas), el altar entero lo celebra.",
      ] },
      { titulo: "A saber", ico: "ℹ", items: [
        "El Gacha de pendientes («¿qué veo ahora?») se ha ido: su sitio lo ocupan las cartas.",
        "Las cartas, los tickets gastados, la piedad y la racha se guardan en tu cuenta: ahora van igual en el móvil y en el ordenador. La racha de la tirada del día empieza de cero.",
      ] },
    ],
  },
  {
    id: "2026-11-28d",
    fecha: "28 de noviembre de 2026",
    titulo: "El Gacha se pone serio",
    jp: "ガチャ",
    secciones: [
      { titulo: "Novedades", ico: "✦", items: [
        "**Banners temáticos**: además del pozo completo, cada semana hay dos temáticos (Algo corto, Noche de peli, Para leer, Joyas olvidadas, Lo mejor valorado…). **Cambian cada lunes.**",
        "**SSR garantizado**: a la décima invocación sin SSR, la siguiente es SSR seguro. Lo que te falta sale debajo de Invocar.",
        "**Tirada del día**: una invocación gratis al día con más suerte de SR y SSR, y una **racha 🔥** de días seguidos. Si un día no tiras, la racha vuelve a empezar.",
      ] },
      { titulo: "A saber", ico: "ℹ", items: [
        "La racha y el SSR garantizado se guardan en cada dispositivo: en el móvil y en el ordenador van por separado.",
      ] },
    ],
  },
  {
    id: "2026-11-28c",
    fecha: "28 de noviembre de 2026",
    titulo: "Arrastrar, importar y sagas a la vista",
    jp: "移動",
    secciones: [
      { titulo: "Novedades", ico: "✦", items: [
        "**Mantén pulsada una carta** del Archivo: se levanta y abajo salen cajas con los estados y ∞ Atemporal. **Suéltala en una** para cambiarle el estado sin abrir la ficha. Una saga apilada cambia todas sus temporadas, y todo se deshace con un toque.",
        "**Importar una lista de texto**: en ⋮, sube un **.txt** o pega tu lista (un título por línea, con nota o estado si quieres). KIROKU busca cada título en AniList y te deja revisar lo que ha encontrado antes de importar.",
        "Si un título es parte de una **saga**, la ficha lo avisa arriba, con un botón para **añadir la saga entera** de una vez.",
      ] },
      { titulo: "Cambios", ico: "⚙", items: [
        "**7 logros nuevos** (61 en total): Paleta completa, Ensayista, Viajero en el tiempo, Recién salido, Paciencia infinita, Hallyu y Espíritu del bosque.",
        "**Mano blanda** y **Mano dura** ahora cuentan notas (10 de 9 o más / 10 por debajo de 6), así que se pueden tener las dos.",
      ] },
    ],
  },
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
      { titulo: "Cambios", ico: "⚙", items: [
        "**Nota a la saga** y **Añadir la saga** usan la misma barra de nota que Tu registro.",
      ] },
      { titulo: "Arreglos", ico: "✚", items: [
        "El **10** de la nota volvía a verse transparente, y el brillo del número dibujaba una caja. Ahora brilla limpio, y el 10 en dorado.",
        "La barra de nota ya no cambia de ancho al empezar a arrastrar.",
        "En la gráfica de **Sincronía**, «Tú» y «AniList» ya no se montan sobre los números.",
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
