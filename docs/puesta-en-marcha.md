# Puesta en marcha de KIROKU

Para que tus amigos puedan entrar hacen falta tres piezas, todas gratis:

- **Supabase**: base de datos y login.
- **Discord y Google**: los botones de "Entrar con…".
- **Cloudflare Pages**: aloja la web y le da una dirección pública.

Las claves secretas (el *Client Secret* de Discord y de Google, la *service_role*
de Supabase) se pegan solo en el panel de Supabase. No van ni al repo ni a la web.

---

## 1. Proyecto de Supabase

1. Entra en <https://supabase.com>, crea una cuenta y luego **New project**.
   - Nombre: `kiroku`. Región: **Central EU (Frankfurt)** o **West EU (Paris)**.
   - Apunta la contraseña de la base de datos en tu gestor de contraseñas. La web no la usa.
2. Cuando termine de crearse, ve a **SQL Editor → New query**, pega entero
   [`supabase/esquema.sql`](../supabase/esquema.sql) y pulsa **Run**. Puede salir
   algún *NOTICE*: es normal.
3. En **Project Settings → API** (o **Data API**) copia:
   - **Project URL**: `https://xxxxxxxx.supabase.co`
   - La clave **anon** o **publishable**: es pública, puede ir en la web.

   Y apunta la **dirección de vuelta** de los logins, que se usa en los pasos 2 y 3:

   ```
   https://xxxxxxxx.supabase.co/auth/v1/callback
   ```

## 2. Entrar con Discord

1. Abre <https://discord.com/developers/applications> → **New Application** → nombre `KIROKU`.
2. En **OAuth2**:
   - Copia el **Client ID**.
   - Pulsa **Reset Secret** y copia el **Client Secret**.
   - En **Redirects**, añade la dirección de vuelta del paso 1.3 y guarda.
3. En Supabase → **Authentication → Sign In / Providers → Discord**: actívalo, pega
   el Client ID y el Client Secret y guarda.

## 3. Entrar con Google

1. Abre <https://console.cloud.google.com> y crea un proyecto `kiroku`.
2. **APIs y servicios → Pantalla de consentimiento de OAuth** (o *Google Auth Platform*):
   - Tipo **Externo**. Nombre de la app `KIROKU`, tu correo como contacto.
   - Permisos: deja los básicos (`email`, `profile`, `openid`). Con eso Google no
     pide verificación.
   - En **Público**, pulsa **Publicar la aplicación**. Si se queda en *Prueba*, solo
     podrán entrar los correos que añadas a mano como usuarios de prueba.
3. **Clientes → Crear cliente → Aplicación web**:
   - En **URIs de redirección autorizados**, añade la dirección de vuelta del paso 1.3.
   - Copia el **ID de cliente** y el **Secreto del cliente**.
4. En Supabase → **Authentication → Sign In / Providers → Google**: actívalo, pega
   los dos valores y guarda.

## 4. Conectar la web con Supabase

Rellena [`web/js/config.js`](../web/js/config.js) con la URL y la clave anon del
paso 1.3 (o pásamelas y lo hago yo). Luego haz commit y push.

## 5. Publicar en Cloudflare Pages

1. Entra en <https://dash.cloudflare.com> y crea una cuenta si no tienes.
   Ve a **Workers & Pages → Create → Pages → Connect to Git**.
2. Da acceso a GitHub al repo `diario-visionado`. Funciona aunque sea privado.
3. Configuración de compilación:
   - **Framework preset**: None
   - **Build command**: déjalo vacío
   - **Build output directory**: `web`
4. **Save and Deploy**. Te da una dirección tipo `https://kiroku.pages.dev`.
   Cada push a `main` vuelve a publicar la web solo.

## 6. Decirle a Supabase dónde vive la web

En Supabase → **Authentication → URL Configuration**:

- **Site URL**: la dirección de Cloudflare, p. ej. `https://kiroku.pages.dev`.
- **Redirect URLs**: añade esa misma dirección y `http://localhost:8640/`
  (esta última sirve para probar en local).

Sin este paso, tras entrar con Discord o Google se vuelve a una dirección equivocada.

## 7. Tu archivo

Entra en la web, crea tu expediente (nombre y alias) y, con el archivo vacío, pulsa
**Importar un archivo JSON** y elige [`datos/semilla.json`](../datos/semilla.json).
Son tus 121 títulos. La semilla vive fuera de `web/`, así que no se publica.

Después, pásale el enlace a tus amigos (en **06 · Operadores** está el botón
**Copiar enlace para invitar**).

---

## A tener en cuenta

- **Registro abierto**: cualquiera con el enlace puede crearse una cuenta y ver los
  archivos de los demás. Lo que no puede es cambiar nada que no sea suyo: la base
  de datos lo impide aunque se toque la web desde la consola.
- **Plan gratuito de Supabase**: si el proyecto pasa una semana sin ninguna visita,
  Supabase lo pausa. Se reactiva desde su panel con un clic y los datos siguen ahí.
  El límite es de 500 MB; cada operador tiene un tope de 5000 entradas.
- **Borrar cuenta** (menú ⋮) elimina el perfil y todo el archivo. El usuario de
  Discord o Google sigue registrado en Supabase, pero sin datos. Para quitarlo del
  todo: Supabase → Authentication → Users.
- **Probar en local**:

  ```fish
  python -m http.server 8640 --directory web
  ```

  y abre <http://localhost:8640>. Usa la misma base de datos que la web publicada.
