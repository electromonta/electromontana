# Electro Montana

Contexto para Claude Code. Leer COMPLETO antes de tocar cualquier archivo.

## Qué es esto

Sistema de **Electro Montana**, de **Franklin y Daniel**. Son **coteros**: venden mercancía a crédito en la calle, casa por casa, con plazos de unos 2 meses y medio o más. El cliente firma un contrato y ellos se quedan con una copia. La mercancía se la compran al mayor a **Mercantil Yumana** (de Kinan Slikah).

Quien desarrolla y da las instrucciones es **Kinan** (colaborador del repo). El sistema lleva: clientes, ventas a crédito, abonos, inventario y a quién se le vendió cada cosa.

**Cuando esté en uso, ES PRODUCCIÓN CON DINERO REAL.** Un error de saldo es plata perdida o un cliente reclamando en la calle.

## Dónde vive cada cosa (y qué NO se toca)

- **Repo:** `electromonta/electromontana`, rama `main`. Es de ellos; Kinan es colaborador. **El repo es PÚBLICO.**
- **Base:** Supabase, proyecto `fyylawnpgodapwdfuqau` (`https://fyylawnpgodapwdfuqau.supabase.co`). Se trabaja **solo** con el conector **Electro Montana** (herramientas `mcp__Electro_Montana__*`).
- **PROHIBIDO usar el conector `Supabase`** (herramientas `mcp__Supabase__*`): es el de Yumana (`tkkiuxaamdyfbildcvtp`). Está bloqueado en `.claude/settings.json`. Si alguna herramienta apunta a un proyecto que no es `fyylawnpgodapwdfuqau`, parar y avisar.
- **Los datos de Yumana y de Electro Montana nunca se mezclan:** no se copian de una base a otra, no se consultan cruzado, no se conectan las bases. En Yumana, ellos son un cliente del mayor; eso vive allá y no se trae.
- **Repo de Yumana (`kianslikah/cxc-yumana`): solo lectura, como consulta** (reglas, helpers, login). La carpeta `jabella/` de ese repo es el modelo más parecido a este sistema (HTML/CSS/JS por secciones, RPC, pruebas en Postgres local). **Nunca modificarlo desde aquí.** Si algo requiere un cambio del lado de Yumana, se hace en una sesión de Yumana.
- **La base está en plan gratis, sin respaldo automático.** Avisarle a Kinan ANTES de cargar datos reales para pasarla a Pro. (El plan gratis además pausa el proyecto si pasa 7 días sin uso.)
- **Dominio y publicación con GitHub Pages: van al final.** Activar Pages lo hace el dueño del repo (Settings → Pages), o le da a Kinan permiso de administrador.

## Cómo trabajar con Kinan

- **Español siempre**, en respuestas y comentarios de código.
- **Pasos exactos y concretos.** Sin rodeos, sin teoría. Kinan no es programador y trabaja desde iPad/iPhone: entregar cosas funcionando, no explicaciones técnicas.
- Estilo directo: cuestionar lo que no cuadre, no aprobar todo.
- **Agrupar varios cambios en una entrega.** Nada de probar-subir-probar por cada cambio chico.
- **Diagnosticar antes de proponer.** Si algo falla, ir al código y a los datos; no mandarlo a probar a ciegas.
- **Validar antes de entregar:** `node --check` a cada archivo JS (y a los `<script>` extraídos de los HTML), pruebas de la base en un Postgres local (`supabase/pruebas/`) y prueba visual con Playwright en tamaño de teléfono cuando se pueda.
- Decir claramente cuándo una tarea terminó y cuándo empieza otra.
- **Publicación directa (autorizado por Kinan):** después de validar, subir directo a `main` sin pedir confirmación en cada entrega. **Una entrega = un commit claro**, para poder deshacerla con `git revert` si Kinan dice "deshaz lo último".
- **Una sesión por tarea:** Kinan paga por uso. Sesiones cortas; no leer archivos completos de miles de líneas (usar Grep y lecturas por tramos).
- Nada se construye sin el "dale" de Kinan cuando él pidió ver el plan primero.

## Stack

- **Frontend:** HTML/CSS/JavaScript puro, sin frameworks, sin build. Estructura como JABELLA: `index.html` + `css/app.css` + `js/` (un archivo por sección) + `js/config.js` (URL y key publishable).
- **Backend:** Supabase (PostgreSQL + Auth + Storage). Migraciones numeradas en `supabase/migrations/`, aplicadas con `apply_migration`. Pruebas de negocio en `supabase/pruebas/`.
- Sesión con `storageKey: 'electromontana-sesion'`.
- Se instala en el teléfono como app (Compartir → Agregar a inicio): `manifest.webmanifest` + íconos.
- Versionar los `?v=N` de los archivos en `index.html` en cada entrega (Safari cachea fuerte).
- Historial de entregas: `docs/HISTORIAL.md`.

## Diseño

- **Marca propia.** Nada de la paleta dorada de Yumana ni de sus letras (Fraunces/Outfit).
- **Primero el teléfono:** se usa en la calle, con una mano y a pleno sol. Fondo claro y alto contraste, botones grandes (mínimo 44 px de alto), lo importante arriba, navegación abajo al alcance del pulgar. En tablet y PC se adapta, pero se diseña para teléfono.
- **Cero emojis.** Íconos SVG de un solo color.
- Paleta y letras exactas: se definen con el logo de ellos. Cuando se aprueben, anotarlas aquí con sus códigos.

## REGLAS CRÍTICAS (heredadas de Yumana; romper una cuesta plata)

1. **Claves:** el repo es PÚBLICO. Nunca escribir claves secretas (service_role, contraseñas, tokens) en el código, en commits ni en los docs. Solo la key **publishable** de Supabase va en `js/config.js`. Lo que necesite la llave de servicio vive en una Edge Function, con la clave guardada como secreto del proyecto.
2. **RLS siempre cerrado:** toda tabla nueva nace con `ENABLE ROW LEVEL SECURITY` y políticas que exigen usuario activo (y rol cuando aplique). **Nunca `USING (true)`**: la key pública está en un repo público. Las funciones `SECURITY DEFINER` se saltan el RLS: llevan su propia guardia y `set search_path`. **Supabase da EXECUTE a todos por defecto en funciones nuevas:** cada migración revoca explícitamente (`anon` y `public` nunca; funciones internas sin EXECUTE para nadie; las RPC solo para `authenticated`).
3. **Dinero por RPC:** toda escritura de dinero o existencia (venta, abono, anulación, entrada de mercancía) va por una función RPC atómica, nunca escrita directo desde el JS. Cada venta y cada abono lleva una `clave` única generada en el teléfono: si se cae la señal y se reintenta, no se duplica.
4. **Nunca restar sobre datos en memoria.** El saldo de una venta se recalcula siempre desde la fuente (total − suma de abonos vivos), leyendo fresco de la base. Así cada operación se puede repetir sin descuadrar.
5. **Límite de 1000 filas:** Supabase corta las consultas en 1000 registros EN SILENCIO. Siempre paginar con `.range()` en bucle (helper `traerTodo()`).
6. **Anti-doble-clic obligatorio:** todo botón de guardar usa `protegerBoton()` (se deshabilita al primer toque). En Yumana un doble toque creó un descuadre de $17.
7. **Fecha de hoy = hora de Venezuela (UTC−4):** nunca `new Date().toISOString().slice(0,10)` para "hoy" (es UTC: desde las 8 p. m. da el día siguiente). En el JS, `hoyCaracas()` con `America/Caracas`; en SQL, `(now() at time zone 'America/Caracas')::date`.
8. **iPhone/iPad (Safari):** `input[type=date]` se desborda → `-webkit-appearance:none; width:100% !important`. Inputs de **16 px mínimo** (si no, Safari hace zoom). Menús flotantes fallan con el teclado → selectores y buscadores a pantalla completa.
9. **Rendimiento:** buscadores con `debounce`; listas largas se dibujan por partes (80 + "Mostrar más").
10. **Datos personales de los clientes** (cédula, fotos, contrato, ubicación): en un bucket **privado**, vistos con enlace temporal. Nunca en el repo ni en `docs/` (el repo es público): en el historial se nombra al cliente por su número, no por su cédula, teléfono o dirección. Las fotos se comprimen en el teléfono antes de subirlas.
11. **Nada se borra: se anula.** Borrado suave (`deleted_at`) o estado `anulada`, con quién y por qué.
12. **Base de datos (trabajo directo con el conector Electro Montana):**
    - **Respaldo antes de cambiar:** antes de una tanda de cambios, copiar todas las tablas de `public` a un esquema `respaldo_AAAAMMDD` (`CREATE TABLE respaldo_x.t AS TABLE public.t`), verificar que los conteos de filas coincidan y revocar el acceso de `anon`/`authenticated` a ese esquema. **Nunca borrar un esquema de respaldo sin permiso de Kinan.** (Mientras la base esté vacía no hace falta.)
    - **Leer es libre:** las consultas de diagnóstico (SELECT) se hacen sin preguntar.
    - **Agregar sí, destruir no:** se pueden crear tablas, columnas, índices, funciones y políticas sin borrar nada de lo que ya existe.
    - **Lo peligroso se consulta:** antes de borrar datos, hacer DROP o TRUNCATE, o cambiar montos de ventas, abonos o saldos, explicarle a Kinan en palabras simples qué se va a hacer y a cuántos registros afecta, y esperar su "dale".
    - **Correcciones de dinero con rastro:** toda corrección de montos deja el valor de antes y el de después en la tabla de auditoría.
    - Usar `apply_migration` para cambios de estructura, para que queden registrados, y guardar la misma migración en `supabase/migrations/`.
    - **Nunca `DELETE` desde el conector:** se cuelga esperando una confirmación que nunca llega y la transacción se deshace sola. Para quitar algo: borrado suave o anular. Un `UPDATE` suelto también se puede colgar: envolverlo en un bloque `DO $$ BEGIN ... END $$;`. Las pruebas en la base real van dentro de un `DO` que termina en `RAISE EXCEPTION` para que todo se deshaga.

## Cómo trabaja el negocio (respuestas de Kinan, 2026-10-15)

- **Dónde venden:** en Socopó, Franklin y Daniel venden en la calle, llevan ellos mismos la mercancía y cobran casa por casa. En **Pedraza** tienen una tienda con un **empleado** encargado, donde también venden a crédito. Muchos clientes viven **fuera del país** y pagan por Zelle.
- **Quién lo usa:** Franklin, Daniel y el empleado de Pedraza. El empleado registra créditos nuevos y ve lo de ventas.
- **Precio:** cada cosa vendida lleva su **costo** y el **precio al cliente**, para sacar la ganancia. No hay un % fijo de ganancia.
- **Inicial:** sí la piden. Ronda el 30 %, pero el monto lo escriben ellos en cada venta.
- **Cuotas:** casi siempre fijas, pero se pueden personalizar por cliente. El plazo también es personalizado.
- **Si se pasa del plazo:** poder poner un recargo, dar más tiempo o, al llegar al límite, retirar la mercancía.
- **Moneda:** casi todo en dólares. Métodos: efectivo $, Zelle, USDT y bolívares, a una tasa que ellos fijan para recibir.
- **Cuentas con Pedraza:** cada cierto tiempo Franklin y Daniel van a la tienda a recoger lo cobrado y sacar cuentas. En Socopó, cada pago se registra en el perfil del cliente.
- **Recibo por WhatsApp:** sí.
- **Señal:** en la calle hay señal, pero el internet es lento. Nada de lo que se registre se puede perder.
- **Datos del cliente:** cédula, dirección, punto de referencia (si aplica), trabajo, fiador, foto y ubicación.
- **Contrato:** idealmente siguen firmando en papel (con foto), o un formato digital firmado en el teléfono o la tablet. En los dos casos el contrato queda guardado en el perfil del cliente.
- **Mercancía:** no tienen depósito. Cuando venden, la buscan en Yumana; si es para Pedraza, la dejan en la tienda. Por ahora solo le compran a Yumana. Sin seriales por ahora.
- **Hoy llevan las cuentas por WhatsApp.** Hay que pasar al sistema los clientes que ya deben.
- **Marca:** no tienen logo ni colores.
- **Vínculo con Yumana:** ninguno, es un sistema aparte. Solo se deja la puerta abierta (por ejemplo, un código de producto de Yumana opcional) por si algún día se conecta.

## Estado

- **2026-10-15:** repo y base vacíos (sin tablas). CLAUDE.md listo y respuestas del cuestionario recibidas. Plan por etapas y diseño de la base propuestos a Kinan; esperando su "dale" para la etapa 1.
- Respaldos hechos: ninguno todavía.
