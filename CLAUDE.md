# Diario de visionado / KIROKU 記録

Lee esto antes de nada. Estado al 28-11-2026: todo lo hecho está publicado (lo último, el Gacha
de cartas) y no hay trabajo a medias en la web ni ramas abiertas (salvo `diseno-limpio`, aparcada). Lo siguiente posible: el resto de ideas de «Ideas aparcadas», música y personajes
(`docs/ideas/musica-y-personajes.md`) y el enlace de donaciones.

## Qué es

- `diario-visionado.html`: el diario original (artifact de claude.ai). Ya no se toca.
- `web/`: **KIROKU**, la web de verdad. Estática, sin compilación, módulos ES.
  Estética de terminal friki (negro, naranja `#ff6b1a`, kanji, serif enorme,
  cartas holográficas). Datos de anime/manga de la API GraphQL de **AniList**.
  Cuentas y base de datos en **Supabase**; alojada en **Cloudflare Workers**.

## Producción

- Web: <https://kiroku.el-grimorio.workers.dev> (Worker `kiroku` de Cloudflare,
  conectado al repo; **cada push a `main` publica solo** en ~50 s).
  Deploy command en Cloudflare: `npx wrangler deploy --assets=./web --name=kiroku --compatibility-date=2025-09-01`.
- Supabase: `https://ihxokfwwoxzrynhfoips.supabase.co`. La clave *publishable* está en
  `web/js/config.js` (es pública). **Nunca** pedir ni guardar la secret/service_role.
- Login: solo **Discord** activo. Google sin configurar: la pantalla de acceso solo
  enseña los proveedores activos (consulta `/auth/v1/settings`).
- URL Configuration de Supabase: Site URL = la de Cloudflare; Redirect URLs = esa
  `/**` y `http://localhost:8640/**`.
- Usuarios reales: `@ratixx_batalla` (Eric: 184 entradas, 105 títulos contando sagas) y `@maza`.
- Certificado: Let's Encrypt para `*.el-grimorio.workers.dev`, lo renueva Cloudflare solo
  (el del 23-11 caduca el 5-1-2027). Comprobado bien: cadena hasta ISRG Root X1, SCTs, TLS 1.2/1.3.
- **iPhone "conexión no segura" / `ERR_SSL_PROTOCOL_ERROR`**: era la dirección con un **punto
  final** (`…workers.dev.`), casi seguro copiada de un mensaje. Sin el punto entra. No es la web.
- **AniList** puede bajar el límite a **30 peticiones/min** (así el 23-11; se ve en
  `X-RateLimit-Limit`). Manda el 429 **sin cabeceras CORS**: en el navegador es un fallo de red.

## Probar en local

- Servidor: `.claude/launch.json` → `kiroku` (python http.server en 8640, carpeta `web`).
  Usa el **Supabase real**. El navegador cachea: recargar con `fetch(url,{cache:'reload'})`.
- Página de pruebas con Supabase de imitación: `web/_prueba/index.html`
  (gitignored). `fake-sb.js` imita supabase-js en localStorage y aplica las mismas
  reglas que `esquema.sql` (propiedad, privacidad, permisos, recomendaciones). Sesiones falsas:
  `discord`, `google`, `tercero`. `web/_prueba/semilla.json` es copia de la semilla.
- Reglas de la base de datos: probarlas en Docker `postgres:16-alpine` con una
  réplica mínima de Supabase (roles `anon`/`authenticated` creados con `DO ... exception`,
  `auth.users`, `auth.uid()` leyendo `request.jwt.claim.sub`). Probar instalación
  nueva (`esquema.sql` ×2) y actualización (esquema de HEAD + migración ×2).
- La CLI de Supabase (`npx supabase`) la bloquea la política de permisos: no usarla.
- Con el panel del navegador: Eric usa a veces la web real en una pestaña; probar en una
  **pestaña propia** (`tabs_create`) y no recargar la suya. Antes de cada script, comprobar que
  la pestaña está en `/_prueba/` (`location.pathname`): Eric puede llevarla a la web real en
  local (`localhost:8640/`, Supabase de verdad) y ahí no se prueba nada.
- Si el panel está **oculto**, no avanzan animaciones, transiciones, `requestAnimationFrame`
  ni el desplazamiento suave (`behavior: "smooth"`): terminar con
  `document.getAnimations().forEach(a => a.finish())` antes de medir, y no fiarse de capturas
  ni de scrolls suaves. Las medidas con `getBoundingClientRect` sí valen.
- `web/_prueba/index.html` es una **copia** de `web/index.html` (con el import map de
  imitación y rutas absolutas `/css/…`, `/js/…`; **sin `<base>`**: con `<base href="/">` cada
  enlace `#/…` llevaba a `/#/…`, la web real, quitado el 28-11): lo que cambie en el HTML (menú ⋮, `#fichero`…) hay que copiarlo también ahí.
- Cada recarga de pruebas gasta cupo de AniList, salvo lo que está en la caché de `cache.js`
  (para forzar una petición, borrar las claves `kiroku:c:*` y `kiroku:nodos-saga:v2`). En la página de pruebas los filtros (p. ej. `agrupa`) se guardan en
  `localStorage` (`kiroku:filtros`) y pueden haberse quedado cambiados.
- Validar una consulta de PostgREST sin sesión: `42501` = se ha entendido, `PGRST100` = sintaxis mal.

## Arquitectura (web/js)

- `app.js` arranque y sesión (sin config → login → registro → archivo), rutas por
  hash (`#/archivo`… y `#/@alias/vista` para visitar), cabecera, teletipo, menú ⋮,
  refrescos de AniList (12 h todo; 3 h lo que se emite), sagas, avisos de arranque.
- `anilist.js` cliente GraphQL con **cola de dos niveles** (lo de pantalla antes que lo de
  `{ fondo: true }`), freno con `X-RateLimit-Remaining` ≤ 2, reintento en fallo de red;
  `sagas(ids)` y `marcaSaga`.
- `cache.js` caché de AniList en `localStorage` con caducidad (publicada el 28-11): una clave
  por respuesta (`kiroku:c:det:ID`, `kiroku:c:tmp:FALL-2026:1`) y un índice con las fechas.
  `detalle()` 3 días (máx. 40), `temporada()` 7 días si ya pasó / 3 h si no (máx. 16 páginas),
  nodos de saga en `kiroku:nodos-saga:v2` 3 días (12 h los que emiten). Todo deja de valer si ya
  salió un episodio que anunciaba (`sinEmitidos`). `refrescar()` y `buscar()` no se cachean.
- `stats.js` estadísticas del archivo (`calcula`), experiencia, niveles (`RANGOS_OP`) y
  logros (`LOGROS`, cada uno con `mide(s) → [actual, objetivo]`). Se recalcula siempre desde
  el archivo: no se guarda nada aparte.
- `arrastre.js` mantener pulsada una carta del Archivo para cambiarle el estado (ver 28-11).
- `importar.js` importar una lista de texto buscando cada título en AniList (ver 28-11).
- `ui.js` catálogos y utilidades: `TIPOS` (anime, manga, peli), `infoTipo` (también la
  vieja `serie`), `tipoDe(m)`, `formato(m)` (Manhwa/Manhua por `countryOfOrigin`),
  `totalDe`/`unidad`/`seLee` (capítulos en manga, episodios en lo demás).
- `nube.js` cliente Supabase (supabase-js 2.118.0 de jsDelivr, flujo PKCE), perfiles,
  lecturas paginadas, directorio, privacidad (`misPermisos`, `concede`, `retira`, `puedoVer`).
- `almacen.js` archivo en memoria + **cola de guardado** (agrupa, reintenta), deshacer
  por operación, importar/exportar, "sujeto" (tu archivo o el de un amigo en solo lectura).
  Para tocar varias entradas como **una sola operación** de Deshacer: `anadeLote(altas, cambios)`
  y `actualizaVarios(cambios)`.
- `acceso.js` pantallas de login/registro. `ficha.js`, `paleta.js` (buscador).
- `recos.js` recomendaciones: buzón, sondeo, envío y resolución.
- `terminados.js` pendientes en emisión recién terminados; `tutorial.js` recorrido guiado;
  `parches.js` notas de cada parche (datos).
- `vistas/`: archivo, perfil (+ `privacidad.js` y `ajustes-recos.js`), tier, temporada,
  gacha, operadores, y fuera de la barra de pestañas `buzon.js` (`#/buzon`) y
  `parches.js` (`#/novedades`).
- `supabase/esquema.sql` estado completo e idempotente; cambios nuevos además en
  `supabase/migraciones/AAAA-MM-DD-nombre.sql`. **El usuario ejecuta la migración en
  el SQL Editor ANTES de publicar** la web que la usa; luego comprobarla desde aquí
  (RPC/tabla nueva con la clave publishable: `42501 permission denied` = existe,
  `PGRST202/PGRST205` = no existe).

## Forma de trabajar en este repo

- Commits: rama temporal → `git merge --ff-only` a `main` → push → borrar rama.
  Solo cuando Eric lo pida. Buscar secretos antes (`grep -rIl sb_secret`).
- Tras el push, esperar en segundo plano a que la web publicada sirva el cambio (suele tardar
  ~50 s, alguna vez 3 min). Ojo: en producción `/index.html` redirige (307) a `/`; para
  comprobar el HTML, pedir `/` con `curl -sL`.
- Lo que no es un arreglo trivial se prueba antes en una rama `pruebas` en local y se le enseña
  a Eric; se publica cuando lo pide.
- **Novedades** (`web/js/parches.js`, vista `#/novedades`): al publicar algo que se note, añadir
  arriba de `PARCHES` un parche con `id` nuevo (la fecha) o ampliar el del día. Un `id` nuevo
  saca el aviso "KIROKU se ha actualizado" y la marca NUEVO del menú ⋮ a quien ya había entrado.
- Sueltos sin versionar a propósito: `kiroku-icono.png` (copia del usuario; el bueno
  está en `docs/marca/`), `datos/archivo-estrella.json` (gitignored, copia de seguridad).

## Publicado el 28-11-2026

Ese día salieron cuatro parches (Novedades): "La consola de registro", "Más niveles y logros",
"Arrastrar, importar y sagas a la vista" y "El Gacha se pone serio".

- **Tu registro** (`registro()` en `ficha.js`, CSS `.reg*`) es una consola:
  - **Barra** de nota (`[data-dial]`, nombre heredado de un dial redondo que se probó y se
    quitó el mismo día): la posición del puntero a lo ancho da la nota y se guarda al soltar;
    `@property --nota` para que se mueva suave; sin números y centrada en su fila. El
    `#fn-rango` sigue existiendo pero oculto (`.solo-lector`) para teclado y lectores.
  - **Raíl** de estados (`.reg-estados`, `--i` = índice): `pintaEstado()` mueve la luz y
    tiñe la consola (`--ce`, kanji de fondo en `data-jp`).
  - **Segmentos** de episodios (`[data-segs]`, hasta `MAX_SEGMENTOS` = 60; más, barra continua):
    pulsar marca hasta ahí, pulsar el último encendido lo apaga.
  - Se descartaron antes una "carta de rango" (letra de fondo + escala F…EX), un "relieve"
    de botones y el dial redondo: a Eric no le gustaron.
- **Archivo en móvil**: 3 cartas por fila (reglas bajo `#coleccion`), los 6 estados en
  rejilla 3×2, y tipo/año/género/orden tras el botón ⚙ (`filtrosAbiertos`, solo en móvil).
- **Caché de AniList** (`cache.js`, ver Arquitectura).
- **Niveles y logros**: 21 `RANGOS_OP` (hasta NV 100) y **61 `LOGROS`** en `stats.js`. `calcula`
  añade lo que miden (`caps` = capítulos de manga, `largos`, `sagasCompletas`, `maxMes`,
  `maxEstudio`, `rangosNota`, `altas`/`bajas`, `decadas`, `delAnio`, `manhwa`, `ghibli`,
  `paciencia`, `ensayo`). Cada logro da 100 de XP, así que añadir logros sube niveles. En
  `app.js`, más de 2 logros nuevos de golpe = un solo aviso. Los de nivel (Kami, Trascendencia)
  usan el nivel **sin** la XP de los logros.
  - **Requisito de Eric: todos los logros se tienen que poder tener a la vez.** Mano blanda y
    Mano dura eran por nota media (≥ 8,5 / ≤ 6,5) y se excluían; ahora cuentan notas (10 de 9+
    / 10 por debajo de 6). Al añadir logros, comprobar que no choquen con ninguno.
  - Los logros no se guardan: se pierden si deja de cumplirse (p. ej. «Al día» y «En la cresta
    de la ola» piden algo en emisión ahora). Si Eric quiere que no se pierdan, habría que guardarlos.
- La barra de nota (`.reg-dial`) se usa también en el formulario de saga (`#sgf-num`,
  `[data-sgf-dial]`); su CSS es común. **Trampa**: `grid-area: dial` va solo en
  `.reg-cuerpo > .reg-dial`: en otra rejilla un área desconocida crea columnas fantasma.
- **Arrastrar cartas** (`arrastre.js`, parche "Arrastrar, importar y sagas a la vista"):
  pulsación larga (380 ms, tolerancia 9 px) en `.carta` del `#coleccion` → copia `.carta-flotante`
  (sin `en-saga`, que traía transform y animación que la clavaban) y panel `.soltar` con 6 cajas;
  vale la caja más cercana desde cerca del panel (`cajaCerca`). Mismas reglas que la ficha;
  saga apilada = sus miembros visibles; una operación (`actualizaVarios`). `body.arrastrando`
  sube `.avisos` (`--alto-soltar`). Con el panel del navegador oculto, terminar las
  transiciones con `getAnimations()` antes de medir.
- **Importar .txt** (`importar.js`): `leeLinea` (separadores ` - `, `|`, `;`, tab; nota, estado
  y tipo en español o inglés; «Steins;Gate» y «Kaiju No. 8» se respetan), busca cada título en
  AniList (≈30/min) y deja revisar; importa a Atemporal con `anadeLote`. El menú ⋮ manda a
  `importa()` lo que parece JSON y aquí lo demás.
- **Aviso de saga** arriba de la ficha (`#fi-saga-aviso`, `avisoSaga`) si falta alguna temporada.
- **Gacha** (parche "El Gacha se pone serio", `vistas/gacha.js`): `BANNERS` temáticos (2 por
  semana, rotan el lunes por `semana()`; solo los que tienen ≥ 2 pendientes) + `COMPLETO`;
  piedad (`PIEDAD` = 10) y tirada del día con racha (pesos `PESO_DIARIA`) en `localStorage`
  `kiroku:gacha:<id>`, por dispositivo. Para compartirlo entre dispositivos haría falta una
  columna en Supabase.
- **Trampa**: `#fn-num` es un `<input>`: `background-clip: text` no funciona dentro y recorta el
  `text-shadow` a su caja. El brillo va en `.dial-centro` con `filter: drop-shadow`.
- **Arreglos**: historial del Gacha y listas de Sincronía no se salen del panel
  (`min-width: 0` / `minmax(0, 1fr)`); en la gráfica de Sincronía, «Tú» va en vertical y
  «AniList» bajo los números, con márgenes propios. **Trampa**: la clase `.mas` (cifra verde de
  Sincronía) chocaba con el contenedor de "Cargar más" de Temporada, que ahora es `.cargar-mas`.

## Publicado el 23-11-2026

Notas para usuarios en `web/js/parches.js` (parche "Sagas, avisos y móvil").

- **Tipos**: solo anime, manga (incluye manhwa/manhua) y peli (pelis de anime, filtrables).
  `serie` ya no se elige; las entradas viejas se pintan con `infoTipo()` y Eric gestiona las
  suyas a mano. No hubo migración.
- **Registro**: progreso por capítulos en manga; selector de año ◀ ▶ + 12 meses + "∞ Atemporal"
  (= sin año: grupo al final del archivo y opción en el filtro Año). El progreso "12 / 222" se
  centra como bloque: el `input` mide `--d` cifras (lo pone `ficha.js`) y el `em` lleva 1ch delante.
- **Ficha**: banner con `aspect-ratio: 1900/400` (el de AniList, se ve entero); la X va con
  `margin-top` en % del ancho. `abrePrevia(nodo)` abre al momento con la ficha corta de una saga
  y repinta con la completa sin mover el scroll.
- **Recomendar**: desactiva a quien ya lo vio/ve/abandonó (solo archivos legibles, vía
  `otrosDe`, que trae `usuario`); con pendiente se deja.
- **Sagas** (idea en `docs/ideas/temporadas.md`): `sagas()` recorre PREQUEL/SEQUEL en lotes de
  50 (tope 8 rondas/60 nodos, caché en `localStorage` `kiroku:nodos-saga:v2`, ver `cache.js`) y ordena por
  estreno; `marcaSaga` → `entradas.media.saga = {id raíz, n, de, t}` (`null` = suelto). Sin cambios
  en la base de datos. `actualizaSagas` al arrancar (lo que no la tiene), tras añadir y en el
  refresco de 12 h; `aplicaFichas` la conserva.
  - Archivo: "⧉ Sagas" (activo por defecto) → carta apilada por saga con 2+ temporadas.
    Desplegar **no repinta**: inserta/quita `.en-saga.saga-<id>` tras la carta.
  - "Títulos" cuenta cada saga como uno (`cuentaTitulos`), en Archivo y en Operadores
    (el directorio trae `sagaId:media->saga->id`).
  - Ficha: sección "Temporadas" con la cadena, lo tuyo marcado y ＋ para pendientes.
  - Tier list: chip "⧉ Sagas" (apagado por defecto): una portada por saga, nota media.
  - Temporada → "Continúa": por saga, la primera en emisión o anunciada que no tienes tras la
    última que sigues; 6 visibles + "Ver las N", plegable y recordado.
- **Pendientes que terminan** (idea en `docs/ideas/aviso-terminados.md`): recién terminado =
  pendiente + FINISHED + `endDate` hace < 30 días + apuntado antes de que acabara. Aviso al
  entrar (una vez por título y navegador), "Ya terminados" en Temporada con "▶ Empezar" y
  "✓ Completo" en la carta. `refrescaEmision` cada 3 h con `aplicaFichas(..., { marca: false })`
  para no retrasar el refresco de 12 h.
- **Móvil (≤ 720 px)**: pestañas fijas abajo con kanji de icono, cabecera fija, sin teletipo
  ni pie, todo más compacto; "En emisión" y "Continúa" plegables; Invocar a la vista.
  `manifest.webmanifest` + `web/img/` para instalarla como app.
- **Tutorial** (`tutorial.js`): a cuentas nuevas y desde ⋮ → Ver el tutorial.
- **Novedades** (`#/novedades`): aviso "KIROKU se ha actualizado" y marca en ⋮ con un parche
  nuevo; a las cuentas nuevas no.
- **Donaciones**: `DONAR` en `config.js` (vacío = oculto). Falta el enlace de Eric (se
  recomendó Ko-fi).
- **Trampa de animación**: `.vista.anima` relanza la entrada de todas las cartas en cualquier
  repintado. Los repintados internos del archivo (`repinta()`) quitan `anima` antes.

## Recomendaciones entre operadores (publicado el 22-11-2026)

Implementado el 22-11-2026 con las 4 decisiones recomendadas: por defecto
"cualquiera" con máximo 3; lista "pueden recomendarme" aparte de la de privacidad;
las pendientes no caducan; contador por sondeo (al arrancar, al volver a la pestaña
tras 30 s y cada 3 min a la vista), sin tiempo real.

- **Estado**: publicado el 22-11-2026; migración ejecutada en Supabase y comprobada.
- **Base de datos**: `perfiles.recibe_recos` ('nadie'|'lista'|'todos') y `recos_max`
  (1–10); tablas `permisos_reco (dueno, autorizado)` y `recomendaciones` (unique
  de+para+media_id, mensaje ≤ 280, media ≤ 4 KB, nota opcional); `entradas.recomendado_por`.
  `kiroku_acepta_recos(receptor)` en la regla de inserción; trigger `kiroku_tope_recos`
  (no acepta / máximo por remitente / 200 en total, con cerrojo); trigger
  `kiroku_limpia_recomendado` pone null si el perfil ya no existe (si no, la cola de
  guardado reintentaría sin fin con un id viejo en memoria). Probado en Docker.
- **Web**: `recos.js` (buzón en memoria, sondeo, aceptar/descartar con deshacer de 5 s,
  formulario "Recomendar a…" de la ficha), `vistas/buzon.js` (`#/buzon`, fuera de la
  barra de pestañas; Recibidas y Enviadas), `vistas/ajustes-recos.js` (en Perfil, junto
  a Privacidad). La portada que llega en una recomendación solo se pinta si es de
  `s*.anilist.co`; al añadirla al archivo se vuelve a pedir la ficha a AniList.
- **Logro "Ojo clínico"** (眼, 3 recomendaciones tuyas que el receptor puntúa con 9+):
  `nube.aciertosDe` cuenta entradas ajenas con `recomendado_por` = tú y nota ≥ 9. Pasa
  por las reglas de lectura: los archivos privados que no puedes ver **no cuentan**
  (a propósito, para no revelar nada de ellos). Se carga junto al archivo en
  `almacen.carga` para que el aviso de logro no se repita en cada arranque.

## Ficha y Temporada (publicado el 22-11-2026)

- **Nota en la ficha**: además de la barra, − y ＋ de 0,1 (mantener pulsado repite y
  guarda al soltar) y el número se puede escribir (coma o punto, Intro guarda, Esc deshace).
- **Temporada**: la etiqueta de cada carta dice «EP 9/12 · 5d 1h» si AniList tiene el
  total (`media.episodes`); sin próximo episodio, «12 EP» en gris; sin total, como antes.
- **Trampa de CSS**: `--rc` (color de rango) lo ponen `.r-ex`, `.r-s`… (línea ~402). Un
  valor por defecto de `--rc` en una clase posterior los pisa (pasó en `.fi-nota`,
  `.fa-nota`, `.fo-nota`…: la letra EX salía gris). Los valores por defecto van en
  `:where(.clase) { --rc: … }`.

## Gacha de cartas (publicado el 28-11-2026)

Rediseño pedido por Eric: el Gacha deja de sacar pendientes y saca **cartas coleccionables** de
AniList para descubrir títulos. Decisiones de Eric: tickets por nivel + terminados + diaria; **dos
pozos** (anime y manga, cada uno con su álbum); lo ya visto puede salir y sale **despertado**; el
Gacha de pendientes **se quita**.

- **Base de datos** (`supabase/migraciones/2026-11-28-gacha-cartas.sql`, también en `esquema.sql`):
  tablas `cartas` (PK usuario+media_id, `numero` por pozo, `veces`, `brillante`) y `gacha`
  (gastados, fragmentos, canjeados, premios, piedad por pozo, diaria, racha). Se leen como el
  archivo (`kiroku_puede_ver`); **no se escriben a mano**: solo con `kiroku_invoca`,
  `kiroku_canjea` y `kiroku_premio` (security definer, cerrojo por usuario, la piedad la cuenta la
  base de datos). Probado en Docker (instalación nueva ×2 y actualización = misma estructura).
  Los tickets **ganados** los calcula la web (no se pueden comprobar en el servidor).
- **Lógica** en `web/js/gacha.js`: tasas fijas (SSR 3 / SR 12 / R 35 / N 50; diaria 8/22/40/30),
  rareza por nota de AniList, `PIEDAD` 30, ×10 con SR o más, brillante 1/200 (antes 1/50), `PESO_FALTA` 4 en
  sets, `RACHA_PREMIO` 7. Pozo anime = popularidad > 20 000 (~3200 títulos), manga > 5000 (~2800);
  tamaño por rareza medido el 28-11 y corregido solo (`kiroku:gacha:tam`). Una tirada pide como
  mucho una página de 50 por rareza, todas en **una** petición con alias; páginas en caché 7 días
  (`gch:*`, máx. 40), miembros de sets 7 días (`gst:*`, la temporada 1 día).
- **Sets** (`SETS`): 12 de anime y 10 de manga; dos de cada pozo son banner cada semana; completar
  uno da 3 tickets (una vez, `premios`).
- **Vista** `vistas/gacha.js`: Invocar / Álbum, pozo, tickets (desglose en `<details>`), fragmentos
  y canje, revelado (carta grande con sinopsis, ＋ A pendientes, Ficha) y rejilla del ×10. Visible
  en el archivo de otros (`VISTAS_AJENAS`), solo el álbum. Carta = `.kc` (CSS con `cqi`); el
  tipo es el género por prioridad (`PRIORIDAD`), porque AniList los da por orden alfabético.
- **Logros** nuevos (64): Mazo, Set completo, Despertar; `calcula(lista, { coleccion })` y el
  directorio trae `cartas`/`gacha` para el nivel de los demás.
- **Estado**: migración ejecutada por Eric y comprobada (tablas y funciones dan 42501 sin sesión);
  publicado con el parche "Cartas coleccionables" (`2026-11-28e`). Barra: Invocar/Álbum como
  pestañas subrayadas con los tickets al lado; el pozo, un interruptor aparte debajo.
- **Fragmentos**: 1 por cada carta repetida (sin importar la rareza); 5 = 1 ticket con
  `kiroku_canjea` (canjea todos los posibles de golpe).
- **Piedad a 30** (decisión de Eric): con 10 y SSR al 3 % salía una SSR de cada ~8,6 tiradas
  (11,5 % medido en 100 000), demasiadas. Con 30 queda en torno al 5 %.

## Ramas e ideas sin publicar

- Rama `diseno-limpio`: la versión "lite" de la interfaz (`limpio.css`), guardada por si
  acaso. Eric se quedó con la original.
- `docs/ideas/` (local, sin versionar): `red-social.md`, `musica-y-personajes.md`
  (AnimeThemes para OP/ED: sin comprobar, no respondía el 22-11), `temporadas.md` (hecho),
  `aviso-terminados.md` (hecho salvo notificaciones push).

## Vídeos promocionales (`video/`, local y sin versionar)

- `video/` no está en git (las capturas pesan ~20 MB por proyecto): falta decidir qué
  versionar y qué ir a `.gitignore`. Tampoco `docs/ideas/` ni la línea de `.gitignore`
  que excluye `video/.chrome-perfil/`.
- Tres proyectos de HyperFrames: `a-la-147`, `b-kiroku-os`, `c-121-titulos`
  (guiones en `video/STORYLINES.md`, cada uno con su `SPEC.md` y `REVIEW.md`).
  Renders en `video/renders/`. Créditos de sonido CC BY en `video/CREDITOS.md`.
- Capturas reales: `node video/captura.mjs --prepara` (necesita el servidor
  `kiroku` en 8640) y luego los grupos; usa la página de pruebas con la semilla.
- Fuentes: `python3 video/comun/fuentes.py` baja solo los caracteres usados en
  las escenas; copiarlas a `assets/fonts/` de cada proyecto.
- Sin música: el catálogo de HyperFrames necesita el CLI `heygen`.
- En las escenas, nada de `tl.call` para cambiar texto: el render salta a cada fotograma
  y no lo ejecuta. Usar elementos apilados y `tl.set` de opacidad.

## Ideas aparcadas

- **Gacha** (lo que queda tras las cartas): banner de operador (lo que otro puntuó con 9+ y tú
  no has visto), animación especial de SSR.
- **Arrastrar cartas** es un gesto escondido: añadir un paso al tutorial (`tutorial.js`).
- **Logros permanentes**: guardar los conseguidos para que no se pierdan (ver 28-11).
- **Red social** (seguir perfiles, feed de actividad, publicaciones estilo Twitter):
  propuesta completa en `docs/ideas/red-social.md` (local, sin versionar). Eric la hará si hay usuarios;
  no empezarla sin que lo pida.

## Pendientes menores

- Eric debería **rotar** la secret de Supabase y el secret de Discord (se pegaron en el chat).
- Borrar en Supabase → Authentication → Users el usuario de Discord de "Estrella" (ya sin datos).
- Google: configurar cuando quiera (guía en `docs/puesta-en-marcha.md`, paso 3).
- Dominio propio: `kiroku.com` está cogido; libres `kirokuanime.com`, `getkiroku.com`,
  `kiroku.club`, `kiroku.fan`, `kiroku.watch` (RDAP, 21-11-2026). Recomendado comprar en
  Cloudflare y añadirlo como Custom domain del Worker + actualizar URL Configuration.
- Icono de la app de Discord: `docs/marca/kiroku-icono.png` (1024×1024), subirlo en
  General Information → App Icon si no lo ha hecho.
