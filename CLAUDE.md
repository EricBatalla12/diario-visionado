# Diario de visionado / KIROKU 記録

Lee esto antes de nada. Estado al 22-11-2026.

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
  reglas que `esquema.sql` (propiedad, privacidad, permisos). Sesiones falsas:
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
- `vistas/`: archivo, perfil (+ `privacidad.js`), tier, temporada, gacha, operadores.
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

## Siguiente trabajo: recomendaciones entre operadores (propuesto, falta el "adelante")

Idea de Eric: compartir un anime con otro usuario con un texto corto sin spoilers.
Propuesta hecha (esperando confirmación de las 4 decisiones):

- **Enviar**: botón "Recomendar a…" en cualquier ficha; elegir uno o varios
  operadores (solo los que te aceptan; el resto en gris con motivo); mensaje ≤ 280
  caracteres con recordatorio "sin spoilers"; lleva tu nota si tienes el título.
- **Buzón 受信箱**: icono con contador en la cabecera; cartas con portada, remitente,
  mensaje y nota; acciones **Añadir a pendientes** / **Ya lo he visto** (abre ficha) /
  **Descartar**; marca si ya lo tienes. Pestaña **Enviadas** (pendientes, cancelables).
- **Ajustes** (junto a Privacidad): quién puede recomendarte (nadie / mi lista /
  cualquiera) y máximo de pendientes por remitente (1–10).
- **Sin historial**: al resolver, la recomendación se borra; si se añade al archivo,
  la entrada guarda `recomendado_por` (historial gratis + posible logro tipo "Ojo
  clínico: N recomendaciones tuyas acabaron con 9+").
- **Base de datos** (migración nueva): en `perfiles` → `recibe_recos` ('nadie'|'lista'|'todos')
  y `recos_max` (1–10); tabla `permisos_reco (dueno, autorizado)`; tabla
  `recomendaciones (id, de, para, media_id, media jsonb reducido, mensaje ≤280, creado)`
  con unique (de, para, media_id); RLS: leer/borrar solo `de` o `para`; insertar solo
  `de = auth.uid()` y si el receptor acepta (función security definer) y no se pasa
  de su máximo (trigger); `entradas.recomendado_por uuid references perfiles on delete set null`.
  No revelar al remitente si el receptor ya tiene el título (filtraría archivos privados).
- **Decisiones recomendadas** (pendientes de que Eric diga "adelante"):
  1. Por defecto "cualquier operador" con máximo 3.
  2. Lista "pueden recomendarme" **aparte** de la de privacidad.
  3. Las pendientes **no caducan**.
  4. Contador por sondeo (al abrir, al volver a la pestaña, cada pocos minutos), sin tiempo real.

## Pendientes menores

- Eric debería **rotar** la secret de Supabase y el secret de Discord (se pegaron en el chat).
- Borrar en Supabase → Authentication → Users el usuario de Discord de "Estrella" (ya sin datos).
- Google: configurar cuando quiera (guía en `docs/puesta-en-marcha.md`, paso 3).
- Dominio propio: `kiroku.com` está cogido; libres `kirokuanime.com`, `getkiroku.com`,
  `kiroku.club`, `kiroku.fan`, `kiroku.watch` (RDAP, 21-11-2026). Recomendado comprar en
  Cloudflare y añadirlo como Custom domain del Worker + actualizar URL Configuration.
- Icono de la app de Discord: `docs/marca/kiroku-icono.png` (1024×1024), subirlo en
  General Information → App Icon si no lo ha hecho.
