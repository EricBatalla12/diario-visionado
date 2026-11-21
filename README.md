# Diario de visionado

Dos versiones del mismo diario:

- `diario-visionado.html`: la página original, publicada como artifact en claude.ai.
- `web/`: **KIROKU 記録**, la versión web con cuentas (Discord y Google), datos de
  [AniList](https://anilist.co) y perfiles visibles entre amigos.

## KIROKU

Web estática, sin compilación. La base de datos y el login son de
[Supabase](https://supabase.com); la web se publica en Cloudflare Pages.
Cómo montarlo todo, paso a paso: **[docs/puesta-en-marcha.md](docs/puesta-en-marcha.md)**.

Para probarla en local (usa la misma base de datos que la publicada):

```fish
python -m http.server 8640 --directory web
```

### Qué tiene

- **Archivo**: tus títulos como cartas holográficas (o en filas), agrupados por mes,
  con filtros por estado, tipo, año y género.
- **Perfil**: nivel y rango de operador, sincronía de tus notas con las de AniList,
  radar de géneros, estudios, reparto de notas, actividad y 24 logros.
- **Tier**: tier list automática a partir de tus notas (EX = 10).
- **Temporada**: catálogo de la temporada en AniList y cuenta atrás de lo que sigues.
- **Gacha**: invoca un pendiente al azar; la rareza sale de la nota de AniList.
- **Operadores**: todos los usuarios con su nivel, afinidad de notas contigo, lo que
  están viendo y la actividad reciente. Pulsando a alguien ves su archivo, perfil y
  tier list en solo lectura (`#/@alias`).
- **Ficha** de cada título: tu registro (se guarda solo), sinopsis, personajes,
  relacionados y la nota que le han puesto los demás operadores.
- Atajos: `/` o `Ctrl+K` busca en AniList, `1`–`6` cambia de sección, `Esc` cierra.

### Datos y seguridad

- Cada operador tiene su archivo en la tabla `entradas` de Supabase. Las reglas de
  [`supabase/esquema.sql`](supabase/esquema.sql) hacen que sin sesión no se lea nada
  y que con sesión se pueda leer todo, pero solo cambiar lo propio.
- La web guarda con una cola: agrupa los cambios seguidos y, si falla la red,
  reintenta sola (en el pie se ve "Guardado" / "Sin guardar · reintentando").
- **⋮ → Exportar** baja tu archivo en JSON; **Importar** acepta ese JSON, el de la
  versión local de KIROKU y el del diario antiguo, y nunca duplica lo que ya tienes.
- `datos/semilla.json` es tu diario antiguo ya cruzado con AniList, para importarlo
  en tu cuenta. Vive fuera de `web/`, así que no se publica.

### Archivos

| Ruta | Qué hace |
|---|---|
| `web/js/config.js` | URL y clave pública del proyecto de Supabase |
| `web/js/app.js` | Arranque, sesión, rutas, cabecera, teletipo, atajos y menú |
| `web/js/acceso.js` | Pantallas de entrada, registro del operador y errores de enlace |
| `web/js/nube.js` | Cliente de Supabase: sesión, perfiles y lecturas |
| `web/js/almacen.js` | Archivo en memoria, cola de guardado, deshacer, importar/exportar, visitas |
| `web/js/anilist.js` | Cliente GraphQL de AniList con cola contra el límite de peticiones |
| `web/js/stats.js` | Estadísticas, experiencia, niveles y logros |
| `web/js/ficha.js`, `paleta.js` | Ficha de un título y buscador |
| `web/js/vistas/*.js` | Una vista por pestaña |
| `web/css/kiroku.css` | Todo el estilo |
| `supabase/esquema.sql` | Tablas y reglas de la base de datos |
