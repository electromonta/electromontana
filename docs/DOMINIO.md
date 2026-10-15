# Publicar la app y ponerle dominio propio

Etapa 4. Son pasos que hacen las personas (no se pueden hacer desde Claude): activar la publicación en GitHub y, si quieren, comprar un dominio.

La app ya está lista para cualquiera de las dos direcciones: todos sus archivos usan rutas relativas, así que funciona igual en `https://electromonta.github.io/electromontana/` que en un dominio propio.

---

## Paso 1. Activar GitHub Pages (gratis, obligatorio)

Lo hace **el dueño del repositorio** (la cuenta `electromonta`), o Kinan si le dan permiso de administrador.

1. Entrar a <https://github.com/electromonta/electromontana> con la cuenta dueña.
2. Tocar **Settings** (Configuración) → en el menú de la izquierda, **Pages**.
3. En **Build and deployment** → **Source**: elegir **Deploy from a branch**.
4. En **Branch**: elegir **main** y la carpeta **/ (root)**. Tocar **Save**.
5. Esperar 1 o 2 minutos y recargar la página. Arriba sale: *"Your site is live at https://electromonta.github.io/electromontana/"*.
6. Abrir esa dirección en el teléfono: debe salir la pantalla de entrada de Electro Montana.

Desde aquí, cada entrega que se sube a `main` se publica sola en 1 o 2 minutos.

### Instalarla en los teléfonos

- **iPhone (Safari):** abrir la dirección → botón **Compartir** → **Agregar a inicio** → **Agregar**.
- **Android (Chrome):** abrir la dirección → menú de los tres puntos → **Instalar app** (o "Agregar a la pantalla principal").

Queda como una app con el logo de la montaña y abre sin la barra del navegador.

### Antes de usarla con clientes reales (recordatorio)

- Pasar la base de Supabase a **Pro** (respaldo automático).
- Apagar el registro público en Supabase: **Authentication → Sign In / Providers → "Allow new users to sign up" → apagado**.
- En Supabase, **Authentication → URL Configuration → Site URL**: poner la dirección de la app (la de GitHub o la del dominio).

---

## Paso 2. Dominio propio (opcional, cuesta unos $10 a $15 al año)

### 2.1 Elegir y comprar el dominio

- Ideas: `electromontana.com`, `electromontana.net`, `electromontanave.com`. Revisar cuál está libre.
- Dónde comprarlo (aceptan tarjeta internacional): **Cloudflare Registrar**, **Porkbun** o **Namecheap**. Precio normal de un `.com`: entre $10 y $15 al año. Activar la **renovación automática** para no perderlo.
- Recomendación: usar un **subdominio** para la app, por ejemplo `app.electromontana.com`. Así el dominio principal queda libre para una página del negocio más adelante.

### 2.2 Apuntar el dominio a GitHub (en el panel donde se compró, sección DNS)

**Si se usa el subdominio `app` (recomendado):** crear un solo registro:

| Tipo  | Nombre | Valor                    |
|-------|--------|--------------------------|
| CNAME | app    | `electromonta.github.io` |

**Si se usa el dominio solo (sin `app.`):** crear estos cuatro registros A (y, si el panel lo permite, los AAAA):

| Tipo | Nombre | Valor             |
|------|--------|-------------------|
| A    | @      | `185.199.108.153` |
| A    | @      | `185.199.109.153` |
| A    | @      | `185.199.110.153` |
| A    | @      | `185.199.111.153` |
| AAAA | @      | `2606:50c0:8000::153` |
| AAAA | @      | `2606:50c0:8001::153` |
| AAAA | @      | `2606:50c0:8002::153` |
| AAAA | @      | `2606:50c0:8003::153` |

Si se compró en Cloudflare: dejar la **nube en gris** ("DNS only") en esos registros; con la nube naranja GitHub no puede sacar el certificado.

### 2.3 Decirle a GitHub cuál es el dominio

1. En el repositorio: **Settings → Pages → Custom domain**: escribir `app.electromontana.com` (o el que sea) → **Save**.
   GitHub crea solo un archivo `CNAME` en el repositorio; no hay que tocarlo.
2. Esperar a que salga **"DNS check successful"** (de unos minutos a unas horas).
3. Marcar **Enforce HTTPS** (la app necesita HTTPS para la cámara, la ubicación y el modo sin señal). Si la casilla está gris, esperar un rato más.

### 2.4 Verificar el dominio (protección)

Para que nadie más pueda usar el dominio en GitHub:

1. En GitHub, ir a la **configuración de la cuenta dueña** (foto de perfil → Settings) → **Pages** → **Add a domain**.
2. Escribir el dominio principal (`electromontana.com`). GitHub da un registro **TXT**.
3. Crear ese TXT en el panel DNS y volver a GitHub → **Verify**.

### 2.5 Avisarle a Supabase

**Authentication → URL Configuration → Site URL**: poner `https://app.electromontana.com` (la dirección nueva).

---

## Paso 3. Cambiar los teléfonos a la dirección nueva (MUY IMPORTANTE)

Cada dirección es, para el teléfono, una app distinta: **lo que esté "por enviar" en la app vieja no pasa solo a la nueva.**

En cada teléfono (Franklin, Daniel y el empleado de Pedraza):

1. Abrir la app vieja **con señal** y revisar que arriba **no diga "por enviar"** ni "con error" (si dice, tocarlo → **Enviar ahora** y esperar a que se vacíe).
2. Abrir la dirección nueva en el navegador, entrar con el usuario y la clave de siempre.
3. Instalarla en la pantalla de inicio (como en el Paso 1).
4. Borrar el ícono viejo de la pantalla de inicio.

Los datos no se pierden: viven en la base, no en el teléfono. Solo lo que estaba "por enviar" depende de ese teléfono.

---

## Si algo falla

- **La página sale en blanco o con error 404:** revisar en Settings → Pages que diga rama `main` y carpeta `/ (root)`, y esperar 2 minutos.
- **"DNS check unsuccessful":** el registro DNS todavía no se ha propagado o tiene un error de escritura. Revisar que el CNAME diga exactamente `electromonta.github.io` (sin `https://` ni `/electromontana`).
- **No deja marcar "Enforce HTTPS":** esperar; el certificado puede tardar hasta 24 horas la primera vez.
- **La app muestra una versión vieja:** cerrarla por completo y abrirla de nuevo (la versión nueva se instala sola). En Ajustes, abajo, sale el número de versión.
