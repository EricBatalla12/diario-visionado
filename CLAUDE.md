# Diario de visionado / KIROKU 記録

Lee esto antes de nada. Estado al 28-11-2026: todo lo hecho está publicado y no hay
trabajo a medias en la web. Lo siguiente posible: música y personajes
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
  **pestaña propia** (`tabs_create`) y no recargar la suya. Si el panel está oculto, las
  animaciones no avanzan (opacidad 0 eterna): medir con `getAnimations()`, no con capturas.
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
- `ui.js` catálogos y utilidades: `TIPOS` (anime, manga, peli), `infoTipo` (también la
  vieja `serie`), `tipoDe(m)`, `formato(m)` (Manhwa/Manhua por `countryOfOrigin`),
  `totalDe`/`unidad`/`seLee` (capítulos en manga, episodios en lo demás).
- `nube.js` cliente Supabase (supabase-js 2.118.0 de jsDelivr, flujo PKCE), perfiles,
  lecturas paginadas, directorio, privacidad (`misPermisos`, `concede`, `retira`, `puedoVer`).
- `almacen.js` archivo en memoria + **cola de guardado** (agrupa, reintenta), deshacer
  por operación, importar/exportar, "sujeto" (tu archivo o el de un amigo en solo lectura).
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
- Tras el push, esperar en segundo plano a que la web publicada sirva el cambio.
- **Novedades** (`web/js/parches.js`, vista `#/novedades`): al publicar algo que se note, añadir
  arriba de `PARCHES` un parche con `id` nuevo (la fecha) o ampliar el del día. Un `id` nuevo
  saca el aviso "KIROKU se ha actualizado" y la marca NUEVO del menú ⋮ a quien ya había entrado.
- Sueltos sin versionar a propósito: `kiroku-icono.png` (copia del usuario; el bueno
  está en `docs/marca/`), `datos/archivo-estrella.json` (gitignored, copia de seguridad).

## Publicado el 28-11-2026

Notas para usuarios en `web/js/parches.js` (parche "La consola de registro").

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
- **Niveles y logros** (parche "Más niveles y logros"): 21 `RANGOS_OP` (hasta NV 100) y 54
  `LOGROS` en `stats.js`; `calcula` añade `caps` (capítulos de manga), `largos`, `sagasCompletas`,
  `maxMes`, `maxEstudio`. Cada logro da 100 de XP. En `app.js`, más de 2 logros nuevos de golpe
  = un solo aviso. Los logros de nivel usan el nivel **sin** la XP de los logros.
- **Trampa**: `#fn-num` es un `<input>`: `background-clip: text` no funciona dentro y recorta el
  `text-shadow` a su caja. El brillo va en `.dial-centro` con `filter: drop-shadow`.
- **Arreglos**: historial del Gacha y listas de Sincronía no se salen del panel
  (`min-width: 0` / `minmax(0, 1fr)`). **Trampa**: la clase `.mas` (cifra verde de
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
