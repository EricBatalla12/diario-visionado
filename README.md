# Diario de visionado

Dos versiones del mismo diario:

- `diario-visionado.html`: la página original, publicada como artifact en claude.ai.
- `web/`: **KIROKU 記録**, la versión web con datos de [AniList](https://anilist.co).

## KIROKU

Web estática, sin dependencias ni compilación. Usa módulos ES, así que hay que
servirla por HTTP (con doble clic no carga):

```fish
python -m http.server 8640 --directory web
```

y abrir <http://localhost:8640>.

### Qué tiene

- **Archivo**: tus títulos como cartas holográficas (o en filas), agrupados por mes,
  con filtros por estado, tipo, año y género.
- **Perfil**: nivel y rango de operador (sale de episodios vistos, títulos terminados,
  notas y logros), sincronía de tus notas con las de AniList, radar de géneros,
  estudios, reparto de notas, actividad y 24 logros.
- **Tier**: tier list automática a partir de tus notas (EX = 10).
- **Temporada**: catálogo de la temporada en AniList y cuenta atrás de lo que sigues.
- **Gacha**: invoca un pendiente al azar; la rareza sale de la nota de AniList.
- **Ficha** de cada título: estado, nota, progreso por episodios, fecha y comentario
  (se guarda solo), más sinopsis, personajes y relacionados de AniList.
- Atajos: `/` o `Ctrl+K` busca en AniList, `1`–`5` cambia de sección, `Esc` cierra.

### Dónde viven los datos

En el `localStorage` del navegador. La primera vez se carga `web/datos/semilla.json`,
que es el diario antiguo (los 109 originales más los cambios hechos desde el artifact)
ya cruzado con AniList. Cada navegador tiene su propia copia: para guardarla o
pasarla a otro, usa **⋮ → Exportar copia** e **Importar**. Importar también acepta
el JSON que exportaba el diario antiguo.

### Archivos

| Ruta | Qué hace |
|---|---|
| `web/js/app.js` | Arranque, navegación, cabecera, teletipo, atajos y menú de datos |
| `web/js/almacen.js` | Guardado en `localStorage`, semilla, deshacer, importar/exportar |
| `web/js/anilist.js` | Cliente GraphQL de AniList con cola contra el límite de peticiones |
| `web/js/stats.js` | Estadísticas, experiencia, niveles y logros |
| `web/js/ficha.js`, `paleta.js` | Ficha de un título y buscador |
| `web/js/vistas/*.js` | Una vista por pestaña |
| `web/css/kiroku.css` | Todo el estilo |
