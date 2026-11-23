# Diario de visionado / KIROKU 記録

Lee esto antes de nada. Estado al 23-11-2026: publicadas las ideas del 22-11 (móvil, tutorial, Atemporal…) y
las sagas (pasos 1 y 2). Pendiente: el "Continúa…" de las sagas y el aviso de iPhone.

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
- Usuarios reales: `@ratixx_batalla` (Eric, 121 títulos, su archivo) y `@maza`.

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

## Arquitectura (web/js)

- `app.js` arranque y sesión (sin config → login → registro → archivo), rutas por
  hash (`#/archivo`… y `#/@alias/vista` para visitar), cabecera, teletipo, menú ⋮.
- `nube.js` cliente Supabase (supabase-js 2.118.0 de jsDelivr, flujo PKCE), perfiles,
  lecturas paginadas, directorio, privacidad (`misPermisos`, `concede`, `retira`, `puedoVer`).
- `almacen.js` archivo en memoria + **cola de guardado** (agrupa, reintenta), deshacer
  por operación, importar/exportar, "sujeto" (tu archivo o el de un amigo en solo lectura).
- `acceso.js` pantallas de login/registro. `ficha.js`, `paleta.js` (buscador).
- `recos.js` recomendaciones: buzón, sondeo, envío y resolución.
- `vistas/`: archivo, perfil (+ `privacidad.js` y `ajustes-recos.js`), tier, temporada,
  gacha, operadores, y `buzon.js` (fuera de la barra de pestañas).
- `supabase/esquema.sql` estado completo e idempotente; cambios nuevos además en
  `supabase/migraciones/AAAA-MM-DD-nombre.sql`. **El usuario ejecuta la migración en
  el SQL Editor ANTES de publicar** la web que la usa; luego comprobarla desde aquí
  (RPC/tabla nueva con la clave publishable: `42501 permission denied` = existe,
  `PGRST202/PGRST205` = no existe).

## Forma de trabajar en este repo

- Commits: rama temporal → `git merge --ff-only` a `main` → push → borrar rama.
  Solo cuando Eric lo pida. Buscar secretos antes (`grep -rIl sb_secret`).
- Tras el push, esperar en segundo plano a que la web publicada sirva el cambio.
- Sueltos sin versionar a propósito: `kiroku-icono.png` (copia del usuario; el bueno
  está en `docs/marca/`), `datos/archivo-estrella.json` (gitignored, copia de seguridad).

## Recomendaciones entre operadores (publicado)

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

## Ficha y Temporada (publicado)

- **Nota en la ficha**: además de la barra, − y ＋ de 0,1 (mantener pulsado repite y
  guarda al soltar) y el número se puede escribir (coma o punto, Intro guarda, Esc deshace).
- **Temporada**: la etiqueta de cada carta dice «EP 9/12 · 5d 1h» si AniList tiene el
  total (`media.episodes`); sin próximo episodio, «12 EP» en gris; sin total, como antes.
- **Trampa de CSS**: `--rc` (color de rango) lo ponen `.r-ex`, `.r-s`… (línea ~402). Un
  valor por defecto de `--rc` en una clase posterior los pisa (pasó en `.fi-nota`,
  `.fa-nota`, `.fo-nota`…: la letra EX salía gris). Los valores por defecto van en
  `:where(.clase) { --rc: … }`.

## Sagas (publicado el 23-11-2026)

- Idea completa en `docs/ideas/temporadas.md` (local). Hecho: pasos 1 y 2.
- `anilist.js` → `sagas(ids)`: recorre PREQUEL/SEQUEL en lotes de 50 (caché de sesión, tope
  8 rondas/60 nodos), ordena por fecha de estreno; `marcaSaga` da `{id raíz, n, de, t}` que se
  guarda en `entradas.media.saga` (`null` = título suelto). Sin cambios en la base de datos.
- `app.js` → `actualizaSagas`: al arrancar para lo que no la tiene, tras añadir algo y en el
  refresco de 12 h para todo. `aplicaFichas` conserva la saga al refrescar.
- Archivo: botón "⧉ Sagas" (por defecto activo) → una carta apilada por saga con 2+
  temporadas; se despliega al tocarla. El HUD "Títulos" cuenta cada saga como uno.
- Ficha: sección "Temporadas" con la cadena entera, lo tuyo marcado y ＋ para pendientes.
- Temporada → "Continúa" (publicado el 23-11): por saga, la primera temporada en
  emisión o anunciada que no tienes y va después de la última que sigues; 6 visibles + "Ver
  las N", plegable y recordado. Los nodos de la saga traen `nextAiringEpisode` y `season`.

- Tier list: chip "⧉ Sagas" (publicado el 23-11): una portada por saga con la
  nota media de sus temporadas puntuadas; se recuerda en `localStorage`.
- **Aviso de pendientes que terminan** (publicado el 23-11; idea en
  `docs/ideas/aviso-terminados.md`): `terminados.js` → recién terminado = pendiente + FINISHED +
  `endDate` (nuevo en `CAMPOS`) hace < 30 días + apuntado antes de que acabara. Aviso al entrar
  (una vez por título y navegador), "Ya terminados" en Temporada con "▶ Empezar" y "✓ Completo"
  en la carta. `refrescaEmision` mira cada 3 h lo pendiente/viendo en emisión
  (`aplicaFichas(..., { marca: false })` para no retrasar el refresco de 12 h).
- Cola de AniList (`anilist.js`, publicado el 23-11): dos niveles; lo de
  pantalla va antes que lo de fondo (`{ fondo: true }` en refrescos, sagas y "Continúa"). Frena
  con `X-RateLimit-Remaining` ≤ 2. El 23-11 AniList estaba en 30 peticiones/min.
- `gql` reintenta los fallos de red (AniList manda el 429 sin CORS). Los nodos de las sagas se
  guardan en `sessionStorage` (`kiroku:nodos-saga:v1`) para no repetir peticiones al recargar.

## Ideas del 22-11 (publicado el 23-11)

- Progreso por **capítulos** en manga (`totalDe`/`unidad`/`seLee` en `ui.js`). Manhwa y
  manhua salen de `media.countryOfOrigin` (KR/CN/TW), que ahora pide `CAMPOS`.
- Ficha: selector de **año (◀ ▶) + 12 meses + "∞ Atemporal"** (= sin año; grupo al final del
  archivo y opción en el filtro Año).
- Recomendar: desactiva a quien **ya lo ha visto/viendo/abandonado** (solo archivos que puedes
  leer, vía `otrosDe`, que ahora trae `usuario`); con pendiente se deja.
- Móvil (≤720 px): **pestañas abajo** con kanji de icono, cabecera fija, sin teletipo ni pie,
  archivo compacto. `manifest.webmanifest` + `web/img/` para instalarla como app.
- `tutorial.js`: recorrido guiado; sale solo a cuentas nuevas y desde ⋮ → Ver el tutorial.
- Donaciones: `DONAR` en `config.js` (vacío = oculto). Falta el enlace de Eric.
- **Sin series**: `TIPOS` = anime, manga y peli (pelis de anime, filtrables). `serie` ya no se
  elige; las entradas viejas se pintan con `infoTipo()` y Eric gestiona las suyas a mano.
- Móvil compactado (ficha, perfil, temporada, gacha); «En emisión» plegable y recordado.
- Idea de agrupar temporadas en sagas: `docs/ideas/temporadas.md`.
- Rama `diseno-limpio`: la versión "lite" (`limpio.css`), guardada por si acaso.

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
