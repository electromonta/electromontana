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

- **Frontend:** HTML/CSS/JavaScript puro, sin frameworks, sin build. `index.html` + `css/app.css` + `js/` (un archivo por sección) + `js/config.js` (URL y key publishable). supabase-js va copiado en `js/vendor/` y las letras en `fonts/` (para que la app abra sin internet).
  - `cuentas.js` calendario de cuotas y atraso (solo para mostrar; también corre en node) · `base.js` utilidades · `datos.js` memoria, copia en el teléfono (IndexedDB) y **cola de envío** · `app.js` arranque y navegación · `cobrar.js`, `clientes.js` (lista, ficha, formulario), `vender.js` (venta y "Ya debía"), `abonos.js` (abono, recibo, Cobros), `ventas.js` (cambios de dueño), `contrato.js` (contrato imprimible y resumen), `firma.js` (firma en la pantalla), `entregas.js` (efectivo de Pedraza), `ajustes.js`, `notas.js` (notas de cobro, promesas y recordatorios), `mercancia.js` (existencia de las tiendas), `reportes.js` (solo dueños).
- **Sin señal:** lo que se registra se guarda primero en la cola del teléfono y `Cola.procesar()` lo manda cuando hay internet (al volver la señal, cada 20 s y al abrir la app). Cada operación lleva su `clave`: si se reintenta, la base devuelve el mismo resultado sin repetir. `sw.js` guarda solo los archivos de la app (nunca datos). La app abre con la última copia de los datos guardada en el teléfono.
- **Backend:** Supabase (PostgreSQL + Auth + Storage). Migraciones numeradas en `supabase/migrations/`, aplicadas con `apply_migration`. Pruebas de negocio en `supabase/pruebas/`.
- Sesión con `storageKey: 'electromontana-sesion'`.
- Se instala en el teléfono como app (Compartir → Agregar a inicio): `manifest.webmanifest` + íconos.
- **En cada entrega:** subir los `?v=N` de `index.html`, la lista de `sw.js` y su `VERSION` (Safari y el modo sin conexión guardan los archivos viejos), y `VERSION_APP` en `js/ajustes.js`.
- **Usuarios:** entran con un nombre corto (`franklin`); por dentro es `franklin@electromontana.app` (nunca se mandan correos). Los crea un dueño desde Ajustes con la Edge Function `usuarios` (`supabase/functions/usuarios`, `verify_jwt` apagado porque revisa la sesión por dentro). Al entrar por primera vez se obliga a cambiar la clave. Las claves temporales nunca van al repo.
- Historial de entregas: `docs/HISTORIAL.md`.

## Diseño

- **Marca propia.** Nada de la paleta dorada de Yumana ni de sus letras (Fraunces/Outfit).
- **Primero el teléfono:** se usa en la calle, con una mano y a pleno sol. Fondo claro y alto contraste, botones grandes (mínimo 44 px de alto), lo importante arriba, navegación abajo al alcance del pulgar. En tablet y PC se adapta, pero se diseña para teléfono.
- **Cero emojis.** Íconos SVG de un solo color.
- **Logo (hecho el 2026-10-15, ellos no tenían):** emblema redondo de línea, una montaña de dos picos con un rayo que cae entre ellos. Archivos `img/logo.svg`, `img/logo-blanco.svg` e íconos `img/icono-*.png`; en el código, `logoSVG()` en `base.js`. Lema "Todo a tu alcance" (sale en su contrato de papel).
- **Paleta:** azul noche `#172b4d` (encabezados), cobre `#a9541f` (botón principal y rayo; `#e0904f` sobre fondo oscuro), fondo arena `#f6f4f0`, superficie `#ffffff`, texto `#18202e`. Estados: verde `#1f7a45` al día, azul `#1d5fa8` le toca hoy, rojo `#b42318` atrasado. Todo en variables de `css/app.css`.
- **Letras:** Barlow (texto) y Barlow Semi Condensed (títulos y montos), servidas desde `fonts/`.

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
- **Hoy llevan las cuentas por WhatsApp.** Hay que pasar al sistema los clientes que ya deben (no saben cuántos son): se cargan desde Vender → "Ya debía".
- **El empleado de Pedraza solo ve los clientes de Pedraza.** USDT se toma 1 a 1 con el dólar.
- **Su contrato de papel** (foto del 2026-10-15) dice: recargo por demora si no paga a tiempo; con tres "giros" (cuotas) sin pagar se retira el artículo y se devuelve cuando pague todo; "firmando el contrato no se devuelve dinero". El contrato nuevo del sistema (`js/contrato.js`) lleva esas condiciones y más; los dueños las editan en Ajustes.
- **Marca:** no tienen logo ni colores.
- **Vínculo con Yumana:** ninguno, es un sistema aparte. Solo se deja la puerta abierta (por ejemplo, un código de producto de Yumana opcional) por si algún día se conecta.

## Base de datos (etapa 1)

Migraciones: `001_base.sql` (todo) y `002_respaldo_diario.sql` (copia diaria con pg_cron en `respaldo_diario.copias`, 2:30 a. m.; no reemplaza el plan Pro).
- Tablas: `usuarios` (rol `dueno`/`empleado` + `sede`), `config` (tasa, % inicial, giros para retiro, condiciones del contrato), `tasas`, `metodos_pago` (`en_mano` = efectivo), `clientes` (sede `socopo`/`pedraza`, fiador, fotos, ubicación, `no_venderle`), `productos` + `producto_costos`, `ventas`, `venta_items` + `venta_item_costos`, `cuotas` (calendario; `vigente`), `abonos` (un pago repartido = varias filas con el mismo `grupo`), `entregas`, `eventos_venta`, `auditoria`, `contadores`, `operaciones` (claves).
- **Cuentas:** debe = `total + ajuste − pagado` (`saldo`, columna calculada). `pagado` lo recalcula `interno.recalcular_venta` desde los abonos vivos. Siempre se cumple `plan_base + cuotas vigentes = total + ajuste` (lo revisa la prueba `cuadre()`). Atrasado = lo que debió pagar **antes de hoy** y no pagó.
- La inicial es la "cuota 0" del día de la venta. "Ya debía" (carga inicial): `plan_base` = lo que pagó antes, con un abono `antes_del_sistema` sin método ni quién lo recibió (no cuenta en cobros ni en el efectivo).
- Recargo = cuota extra en una fecha. Descuento = rebaja las últimas cuotas. Más tiempo = calendario nuevo para lo que falta (`plan_base` = pagado; las cuotas viejas quedan `vigente = false`).
- Retiro (como su contrato): `ventas.mercancia = 'retirada'`; la venta sigue activa y se sigue cobrando; al pagar se devuelve. Cerrar = `estado 'cerrada'` (se deja de cobrar). Anular solo si no tiene abonos.
- Funciones internas en el esquema `interno` (la API no las ve). RPC públicas solo para `authenticated`; la app solo puede LEER tablas (sin insert/update/delete).
- Fotos en el bucket privado `fotos`, ruta `cli/<id del cliente>/<tipo>-<…>.jpg`; se ven con enlace temporal y solo si se ve al cliente (`ve_ruta_foto`).
- Errores con código: `EM001` referencia repetida (la app ofrece "Guardar igual"), `EM002` cédula repetida.
- Reglas del empleado (revisión del 2026-10-15): en Bs solo puede usar la tasa que pusieron los dueños (la de hoy o una de los últimos 8 días, `interno.revisar_tasa`); no puede cargar "Ya debía"; no ve costos (ni en `eventos_venta`). La entrega marca solo los cobros que el dueño contó (`p_abonos`).
- La app reintenta sola (no toma como rechazo) los errores del servidor (5xx, `40001`, `40P01`, `57014`, `PGRST00x`, `PGRST30x`), y usa una sola clave por formulario: tocar Guardar dos veces no duplica.
- `pg_net` está instalado: sirve para probar desde la base que la entrada de un usuario o la Edge Function responden (el contenedor de Claude no llega directo a Supabase).

## Base de datos (etapa 2, migración `003_etapa2.sql`)

- **Mercancía:** `existencias` (producto + sede, nunca baja de cero) y `movimientos_inventario` (entrada, venta, retiro, ajuste, anulación; con lo que queda). Todo pasa por `interno.mover_stock`. Ventas: cada item puede llevar `sede_salida` (sale de esa tienda y se descuenta); sin ella es mercancía que se busca en Yumana. El empleado solo saca de su tienda y solo ve la existencia de su sede. Dueños: `entrada_mercancia`, `ajustar_existencia` (conteo), `guardar_producto`, `reingresar_mercancia` (venta cerrada con mercancía retirada → vuelve a una tienda, una sola vez).
- **Notas de cobro:** `gestiones` (visita, llamada, mensaje, promesa con fecha y monto, no_estaba, recordatorio, otro), por `registrar_gestion` con clave (van por la cola). Se quitan con `anular_gestion` (quien la escribió o un dueño). La app trae las de los últimos 120 días. Una promesa se da por cumplida si hay un abono hecho después de prometer (`resumen_abonos_clientes` da la fecha y hora del último abono).

## Base de datos (etapa 3, migración `004_firma.sql`)

- Firma en pantalla: `ventas.firma_cliente`, `firma_fiador` (rutas `cli/<cliente>/firma-….jpg` en el bucket `fotos`), `firmado_en`, `firmado_por` y `contrato_firmado` (copia fija: cliente, fiador, items, cuotas vigentes y condiciones tal como se leyeron). Se firma con `firmar_venta` (clave; acepta `venta_clave` si la venta todavía estaba en la cola). En el teléfono es la operación de cola `firma` (sube las dos imágenes y luego llama la función). Una venta firmada solo la vuelve a firmar un dueño (`reemplazar`), con lo de antes en `auditoria`.
- El contrato de una venta firmada se dibuja con `contrato_firmado`, no con los datos de hoy.

## Pruebas (correr antes de cada entrega)

- `supabase/pruebas/correr.sh` → escenarios de la base en un Postgres local (`escenarios.sql`). Todo `ok`.
- `node pruebas/cuentas.test.js` → calendario y atraso.
- `pruebas/preparar-local.sh` + `NODE_PATH=/opt/node22/lib/node_modules node pruebas/e2e.js <carpeta>` → copia local (Postgres + PostgREST + `pruebas/servidor-local.js`, que imita auth y fotos) y recorrido completo en tamaño teléfono, con prueba sin señal. Usuarios locales: franklin, daniel, pedraza (clave `prueba123`, solo local).
- Antes de aplicar a la base real: `get_advisors` de seguridad después de la migración.

## Estado

- **2026-10-15 — Entrega 1 (etapa 1) hecha y aplicada a la base real** (migraciones `001_base` y `002_respaldo_diario`, las 47 funciones con la misma huella que las probadas; Edge Function `usuarios` desplegada). Cuentas creadas: `franklin` y `daniel` (dueños, clave temporal que Kinan les pasa; al entrar la cambian). La base no tiene clientes todavía. Detalle en `docs/HISTORIAL.md`.
- **Falta antes de usarla con clientes reales:** (1) pasar la base a **Pro**; (2) que Franklin o Daniel activen GitHub Pages (Settings → Pages → rama `main`, carpeta raíz); (3) apagar el registro público en Supabase (Authentication → Sign In / Providers → "Allow new users to sign up"); (4) crear al empleado de Pedraza desde Ajustes cuando se sepa su nombre; (5) que revisen las condiciones del contrato (Ajustes → Contrato).
- Respaldos hechos: ninguno todavía (la base no tiene datos reales).
- **Pedido de Kinan (2026-10-15):** al terminar el sistema completo, hacer una **guía completa de uso** para dársela a Franklin y Daniel y para que Kinan aprenda a mostrarlo.
- **2026-10-15 — Entrega 2 (etapa 2) hecha y aplicada a la base real** (migración `003_etapa2`, 56 funciones con la misma huella que las probadas): mercancía de las tiendas, venta desde la tienda, notas de cobro y promesas, recordatorios por WhatsApp, reportes.
- **2026-10-15 — Entrega 3 (etapa 3) hecha y aplicada a la base real** (migración `004_firma`, 58 funciones con la misma huella): contrato firmado en la pantalla, también sin señal.
- **Siguiente:** Etapa 4: dominio (solo documento de pasos, `docs/DOMINIO.md`). Después: guía completa de uso.
