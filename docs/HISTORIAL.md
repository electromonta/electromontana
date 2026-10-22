# Historial de entregas — Electro Montana

## Entrega 11 — El encargado de Pedraza completo, botón Volver y de quién es cada crédito (2026-10-22)

Pedidos de Franklin y Daniel (por Kinan), ya usando el sistema: cómo entra y qué hace el encargado de la tienda de Pedraza (con video para él), un botón para volver a la pantalla anterior, y ver quién anotó cada cliente y de quién es cada crédito.

- **El encargado de Pedraza:** se le crea su usuario en Ajustes → Usuarios → Nuevo (rol Empleado, sede Pedraza; Ajustes ahora explica ahí qué puede y qué no). Ahora además:
  - **Vende de contado** (Vender → De contado): paga todo en el momento, sin cuotas ni contrato, recibo por WhatsApp. Después de una de contado, la siguiente viene de contado.
  - **Anota la mercancía que llega a su tienda** (Más → Mercancía → Anotar mercancía que llegó): solo en su sede, sin costos (los ponen los dueños), y el precio solo en un producto nuevo. Queda a su nombre.
  - Su propia guía, `guia-empleado.html` (9 capítulos), que le abre Más → Guía de uso. Los dueños tienen la suya con un capítulo nuevo sobre cómo darle de alta.
  - Videos (no van al repo): "Para el encargado de Pedraza" (2 min 28 s) y "Dar de alta al encargado" (52 s).
- **Botón Volver:** flecha arriba a la izquierda en toda pantalla que tenga una anterior. El "atrás" del teléfono (Android) también vuelve a la pantalla anterior y, si hay una ventana abierta, la cierra. Antes "atrás" sacaba de la app.
- **Quién anotó y de quién es:**
  - La ficha del cliente dice **quién lo anotó y cuándo**; cada venta dice **de quién es el crédito** y, si la anotó otra persona, quién.
  - Al vender (y en "Ya debía"), un dueño elige **"¿De quién es este crédito?"** (él, el otro socio o el empleado). El empleado no elige: sus ventas son suyas.
  - Cambiarlo después: botón **De quién es** en la venta; lo aprueba el otro socio y queda en el historial de la venta y en el historial de cambios.
  - Filtros **De Franklin / De Daniel** en Clientes y Cobrar, y en Reportes "De quién son los créditos" (créditos activos, cuánto le deben a cada uno, atrasado y vendido en el mes).
- Arreglo: después de guardar una venta de contado, el formulario no se quedaba de contado.
- Base: migración `008_empleado_y_creditos.sql` (`entrada_mercancia` para el empleado; `registrar_venta` con `vendedor_id`; solicitud `cambiar_vendedor`; columna `solicitudes.usuario_id`; un tipo más en las listas de tipos de `solicitudes` y `eventos_venta`, sin tocar datos).
- **Aplicado a la base real el 2026-10-22:** respaldo antes en `respaldo_20261022` (21 tablas, mismos conteos; sin acceso para la app). Huella de las 72 funciones igual a la probada; el inspector de seguridad no muestra nada nuevo. Prueba en la base real dentro de una transacción que se deshizo: Franklin anota una venta a nombre de Daniel, pide pasarla a él, Daniel aprueba, queda en el historial; entrada de mercancía.
- Las 5 ventas que ya había quedaron de quien las anotó (2 de `kinan`, 3 de `franklin`); si alguna es de otro, se pasa con **De quién es**.
- Guía con 19 capítulos y 54 capturas (dueños) + guía del encargado. Versión 9 de la app.
- Pruebas: 305 escenarios de base, 29 de cuentas, 97 del recorrido en teléfono.

## Entrega 10 — Límite a la copia de cada noche (2026-10-16) — FALTA APLICARLA EN LA BASE REAL

- Kinan dio el "dale": la copia de cada noche guarda **todas las de los últimos 30 días** y, de ahí para atrás, **la primera de cada mes**. La limpieza corre sola cada noche, después de guardar la copia del día y en la misma transacción (si la copia falla, no se borra nada). Solo toca `respaldo_diario.copias`, nunca los datos del negocio.
- Migración `007_copias_limpieza.sql` (función `respaldo_diario.limpiar` y `respaldar()` con la limpieza al final). Probada en local: 289 copias diarias de prueba → quedan 40 (los 31 días y el primero de cada mes); correrla dos veces no borra más; la app no la puede llamar.
- Las pruebas locales ahora aplican también la migración `002` (todo menos lo de pg_cron), así la copia de cada noche se prueba.
- Pruebas: 275 escenarios de base, 29 de cuentas, 75 del recorrido en teléfono.
- **Pendiente:** aplicarla a la base real. El conector pide una confirmación de la persona porque la función contiene un DELETE, y esa confirmación no le llegó a Kinan desde el teléfono (dos intentos; no se aplicó nada). Se aplica desde la app de Claude en una computadora aprobando la confirmación, o pegando el archivo en Supabase → SQL Editor → Run. No es urgente: solo importa cuando haya más de 30 días de copias.

## Entrega 9 — Seguridad entre los dos socios (2026-10-16)

Pedido de Kinan: que entre los dos dueños todo sea riguroso, que nadie pueda borrar ni cambiar datos sin que quede registrado, y que no se puedan anular abonos así no más.

- **Doble aprobación:** anular un abono, hacer un descuento, anular una venta y cerrar una venta (dejar de cobrar) ahora **los pide un dueño y los aprueba el otro socio**. Hasta que el otro aprueba, no cambia nada. Nadie se aprueba a sí mismo. Solo aprueban las cuentas marcadas como socio (`franklin`, `daniel`); la cuenta `kinan` (soporte) y cualquier dueño nuevo pueden pedir pero no aprobar. Quien pidió puede cancelar mientras nadie responda; el que rechaza escribe por qué.
- Aviso en **Cobrar** ("Un cambio espera tu aprobación") y **Más → Aprobaciones**.
- **Historial de cambios** (Más → Historial de cambios, solo dueños): quién cambió qué y cuándo, con lo de antes y lo de después. En la base: la tabla `auditoria` no se puede cambiar, borrar ni vaciar; **ninguna tabla acepta DELETE ni TRUNCATE**; y lo que alguien cambie **directo en la base** (panel de Supabase, SQL, llave de servicio) queda anotado como "Por fuera de la app".
- La cuenta de un socio solo la cambia él mismo: el otro no le quita el rol, no la desactiva y no le pone clave nueva (la base y la función `usuarios` lo revisan). Si un socio olvida la clave, la pone soporte desde el panel de Supabase.
- **Arreglos de la revisión independiente de la base:** el recargo lleva clave (con internet lento, tocar Guardar dos veces ya no lo duplica); no se puede devolver al cliente ni anular una venta cuya mercancía ya volvió a la tienda (se contaba dos veces). La tasa del empleado (acepta una tasa de los últimos 8 días) se deja así a propósito, por lo que queda en la cola sin señal; en la app el empleado no puede cambiar la tasa.
- Base: migración `006_seguridad.sql` (columna `usuarios.puede_aprobar`, tabla `solicitudes`, funciones `pedir_aprobacion`, `responder_aprobacion`, `cancelar_aprobacion`, `recargo_venta`; `anular_abono`, `ajustar_venta`, `anular_venta` y `cerrar_venta` quedan pero ya no lo hacen directo; `devolver_mercancia` y `actualizar_usuario` reemplazadas con la misma firma; 60 disparadores de protección). Función `usuarios` versión 2.
- **Aplicado a la base real el 2026-10-16:** respaldo antes en `respaldo_20261016` (20 tablas, mismos conteos; sin acceso para la app). Huella de las 70 funciones igual a la probada; nada abierto para `anon`. Prueba en la base real dentro de una transacción que se deshizo: Franklin pide, ni él ni `kinan` pueden aprobar, Daniel aprueba y la deuda vuelve a subir; el recargo repetido no se duplica; borrar está bloqueado; un cambio directo queda anotado.
- Guía: capítulo nuevo "Seguridad entre los socios" (19 capítulos, 40 capturas). Versión 8 de la app.
- Pruebas: 267 escenarios de base, 29 de cuentas, 75 del recorrido en teléfono (Franklin pide anular un abono, Daniel lo aprueba desde su teléfono, sale en el historial).

## Entrega 8 — Contrato en PDF y arreglos de la revisión independiente (2026-10-16)

- **Contrato en PDF para WhatsApp:** el botón del contrato (en la venta guardada y en la ficha: **Contrato PDF**) ya no abre la ventana de imprimir. Arma un PDF tamaño carta con las firmas y en el teléfono abre "Compartir": WhatsApp (el chat del cliente, o el propio para imprimirlo después) o Guardar en Archivos. En la computadora se descarga. **Imprimir** queda abajo como segunda opción. El PDF se arma en el mismo teléfono (`js/pdf.js`, sin librerías): el contrato sin firmar sale aun sin señal; el firmado necesita internet para traer las firmas, salvo que estén en el mismo teléfono por enviar.
- **Revisión independiente de la app** (otra IA leyó el código buscando errores). Arreglado:
  - Con la app cerrada más de 1 hora y **sin señal**, al abrirla pedía la clave (el permiso de la sesión vence cada hora y sin internet no se renueva). Ahora abre con lo guardado en el teléfono y renueva la sesión sola cuando vuelve la señal.
  - Con la sesión vencida, lo que estaba por enviar se podía dar por "rechazado: sin permiso" al volver una señal débil. Ahora espera a renovar la sesión.
  - Si el iPhone cierra la conexión con la memoria del teléfono, lo por enviar podía quedarse solo en la memoria de la app. Ahora la vuelve a abrir y, si aun así no puede, avisa en rojo que no se cierre la app.
  - Al abrir sin señal no se reintentaba cada 20 s; las fotos colgadas con internet lento trancaban la cola (ahora se sueltan a los 90 s); la página guardada para abrir sin señal podía quedar de una versión distinta a sus archivos; dos lecturas podían cortarse en 1000 filas.
- En el iPhone, "Compartir" solo abre en el mismo toque: la **copia de seguridad** ahora se prepara y luego se ofrece con un botón **Guardar o enviar** (antes podía terminar en una descarga suelta).
- Guía actualizada (contrato en PDF; las capturas muestran el iPhone).
- Pruebas: 212 escenarios de base, 29 de cuentas, 68 del recorrido en teléfono (PDF de una hoja con las dos firmas; abrir sin señal con la sesión vencida, guardar y enviar al volver).
- La revisión de la base encontró 3 puntos (ninguno grave); van en la entrega 9 con la migración `006`.

## Entrega 7 — Copias de seguridad y pantallas grandes (2026-10-16)

- **Copia de seguridad descargable** (Más → Ajustes → Copia de seguridad, solo dueños): un archivo con **todos** los datos que queda fuera del sistema (en el teléfono se abre "Compartir": Archivos, Drive o WhatsApp; en la computadora se descarga). La app anota la fecha y quién la hizo, y si hay clientes y pasan 7 días sin copia, Cobrar avisa. También **lista de clientes y saldos** para Excel o Google Sheets.
- **Salir del usuario ya no borra** lo que está por enviar: queda en el teléfono y se envía cuando esa persona vuelve a entrar. Y sin señal, salir ahora sí cierra la sesión del teléfono (antes la dejaba abierta sin avisar).
- **Computadora e iPad horizontal:** menú a la izquierda (con Mercancía, Reportes, Efectivo y Ajustes a la vista), listas en dos columnas, ficha del cliente en dos partes y reportes en dos columnas. El teléfono no cambia.
- `docs/RESPALDOS.md`: qué protege los datos, límites del plan gratis y cómo recuperar.
- Base: migración `005_copias.sql` (dos columnas en `config` y la función `anotar_copia`), aplicada a la base real; huella de las 59 funciones igual a la probada.
- Guía: capítulo nuevo "Copias de seguridad" y cómo se ve en la computadora (18 capítulos, 36 capturas).
- Pruebas: 212 escenarios de base, 29 de cuentas, 64 del recorrido en teléfono (copia completa, lista para Excel, salir con algo por enviar).
- Cuenta `kinan` (dueño) creada en la base real para probar y enseñar el sistema.

## Publicación (2026-10-16)

- La cuenta `electromonta` activó GitHub Pages (rama `main`, carpeta raíz, HTTPS obligatorio). La app quedó en **https://electromonta.github.io/electromontana/**. Primera publicación correcta; la página, los archivos de la app (versión 5), la guía y las letras responden bien.

## Entrega 6 — Arreglo en "Recordar por WhatsApp" (2026-10-16)

- Al tocar **Enviar** en la lista de recordatorios, el cliente a veces volvía a decir "Enviar" por un momento (mientras la nota llegaba a la base), y se podía mandar dos veces. Ahora queda **Enviado** al instante. Lo encontró la grabación de los videos.
- Prueba nueva en el recorrido del teléfono. Pruebas: 206 escenarios de base, 29 de cuentas, 57 del recorrido en teléfono.
- Herramienta de videos: `pruebas/videos/` (escenario, motor y guiones de 11 videos cortos con subtítulos y acercamientos; se graban contra la copia local con clientes inventados).

## Entrega 5 — Guía de uso (2026-10-16)

- **Guía completa** en `guia.html` (dentro de la app: **Más → Guía de uso**): para empezar, Cobrar, abonos, clientes, vender, firmar el contrato, clientes que ya debían, cuando no pagan, notas y recordatorios, mercancía, cobros y efectivo de Pedraza, reportes, ajustes, sin señal, lo que puede hacer el empleado, preguntas frecuentes y "cómo mostrarlo en 10 minutos" para Kinan. 34 capturas de la app con clientes inventados.
- La guía se rehace con `pruebas/guia/armar.sh`.
- Arreglo: cuando el cliente está atrasado, la ficha decía "Próxima cuota" con una fecha ya pasada. Ahora dice lo atrasado y "Además, la próxima cuota" con la que viene. El recibo por WhatsApp también dice "Atrasado: $X" y la próxima cuota que viene.
- Pruebas: 206 escenarios de base, 29 de cuentas, 55 del recorrido en teléfono.

## Entrega 4 — Etapa 4: pasos del dominio (2026-10-15)

- `docs/DOMINIO.md`: activar GitHub Pages (Settings → Pages → `main` / raíz), instalar la app en iPhone y Android, comprar un dominio (recomendado `app.<dominio>` con un CNAME a `electromonta.github.io`), Enforce HTTPS, verificar el dominio, avisarle a Supabase, y cómo pasar cada teléfono a la dirección nueva sin perder lo que esté "por enviar".
- No cambia la app ni la base.

## Entrega 3 — Etapa 3: contrato firmado en la pantalla (2026-10-15)

**Qué hace la app**
- Al guardar una venta sale el botón **"Firmar el contrato en la pantalla"** (también en la ficha del cliente, en la parte Contrato de cada venta).
- Primero firma el **cliente** con el dedo (en el teléfono o en la tablet); arriba sale lo que está aceptando en palabras simples (qué se lleva, el total, la inicial, lo que falta) y el botón "Leer el contrato completo". Si el cliente tiene **fiador**, después firma el fiador (o "Sin fiador" si no está).
- Las firmas se guardan **primero en el teléfono** y suben solas (sirve sin señal, como los abonos).
- Al llegar a la base se guarda una **copia fija del contrato** (datos del cliente y del fiador, lo que se llevó, las cuotas y las condiciones tal como se leyeron). Si después se cambia la dirección del cliente o las condiciones en Ajustes, el contrato firmado sigue igual.
- El contrato impreso o en PDF sale con las **dos firmas**, la cédula debajo y "Firmado en la pantalla el … a las …, registrado por …". Sigue cabiendo en una hoja carta.
- Un contrato firmado no se puede volver a firmar; solo un dueño puede "Volver a firmar" (la firma de antes queda en la auditoría).

**Base**: migración `004_firma.sql` (columnas `ventas.firma_cliente`, `firma_fiador`, `firmado_en`, `firmado_por`, `contrato_firmado`; función `firmar_venta`). Las firmas van al mismo bucket privado de fotos (`cli/<cliente>/firma-….jpg`).

**Pruebas**: 206 escenarios de la base, 27 de cuentas y 55 revisiones del recorrido en teléfono (firma con fiador, contrato con las firmas a la vista, firma sin señal que sube sola).

**Aplicado a la base real el 2026-10-15**: huella de las 58 funciones igual a la probada; nada abierto para `anon`; prueba de cliente + venta + firma dentro de una transacción que se deshizo.

## Entrega 2 — Etapa 2: mercancía, notas de cobro, recordatorios y reportes (2026-10-15)

**Qué hace la app**
- **Mercancía** (Más → Mercancía): lo que hay guardado en la tienda de Pedraza (y en Socopó si algún día guardan algo), con buscador y lo que vale a costo. Los dueños anotan la **entrada de mercancía** (lo que traen de Yumana: cantidad, costo y precio sugerido; si el producto es nuevo se agrega al catálogo), **cuentan** (se escribe lo que hay de verdad y la diferencia queda anotada) y **editan** el producto (nombre, precio, costo, código de Yumana, si se sigue vendiendo). Cada producto muestra todo lo que entró y salió y a qué cliente.
- **Vender desde la tienda**: si el producto está en la tienda, sale la casilla "Sale de la tienda de Pedraza (hay N)"; al guardar se descuenta. Al empleado le sale marcada sola. Si no se marca, es mercancía que se busca en Yumana después (como hasta ahora). Anular la venta devuelve lo que salió de la tienda.
- **Mercancía retirada que vuelve a la tienda**: en una venta cerrada con la mercancía retirada, el dueño toca "Volver a la tienda" y queda otra vez para vender.
- **Notas de cobro** (ficha del cliente y botón "Nota" en Cobrar): visita, llamada, no estaba, mensaje, **promesa de pago** (fecha y monto) u otro. Se guardan sin señal como todo lo demás.
- **Promesas**: en Cobrar aparece la sección "Prometieron pagar hoy" y cada tarjeta dice "Prometió $X el …" o "No cumplió la promesa del …". Si el cliente abona después de prometer, la promesa se da por cumplida.
- **Recordatorios por WhatsApp**: "Recordar a todos" en Cobrar (y en Más) abre la lista de atrasados, a los que les toca hoy o mañana; se manda uno por uno con el mensaje listo y queda anotado "Recordado hoy".
- **Reportes** (solo dueños, Más → Reportes): por cobrar, atrasado, cobrado este mes, ganancia del mes; cobrado por semana (8 semanas) y por método; ventas y ganancia por mes (6 meses); cómo van los que deben por días de atraso; lista de atrasados con último abono y última nota; lo más vendido (90 días); lo que vale la mercancía guardada. Filtro Todo / Socopó / Pedraza.

**Base**: migración `003_etapa2.sql` (tablas `existencias`, `movimientos_inventario`, `gestiones`; columnas `venta_items.sede_salida`, `ventas.reingresada_en/sede`; funciones `entrada_mercancia`, `ajustar_existencia`, `reingresar_mercancia`, `guardar_producto`, `registrar_gestion`, `anular_gestion`, `resumen_abonos_clientes`; `registrar_venta` y `anular_venta` reemplazadas con la misma firma). La existencia nunca baja de cero; el empleado solo ve y saca mercancía de su tienda.

**Pruebas**: 186 escenarios de la base, 27 de cuentas y 46 revisiones del recorrido en tamaño teléfono (entrada de mercancía, venta del empleado desde la tienda, promesa, recordatorio, reportes).

**Aplicado a la base real el 2026-10-15**: la base seguía sin clientes (no hizo falta respaldo aparte); huella de las 56 funciones igual a la probada; nada abierto para `anon`; prueba de entrada + venta desde la tienda + promesa dentro de una transacción que se deshizo. El respaldo diario ya incluye las tablas nuevas (recorre todas).

## Entrega 1 — Etapa 1: cobrar desde el teléfono (2026-10-15)

**Qué hace la app**
- Entrada con usuario y clave (Franklin y Daniel como dueños; el empleado de Pedraza se crea desde Ajustes). Primera vez: obliga a cambiar la clave.
- **Cobrar** (inicio): por cobrar, atrasado, cobrado hoy, les toca hoy; listas de atrasados, hoy y próximos 7 días con Abonar, Recordar (WhatsApp) y Llamar. Filtros Socopó / Pedraza / Exterior para los dueños.
- **Clientes**: buscador, filtros, ficha (lo que debe, atrasado, próxima cuota, ventas con su calendario, abonos, datos, fiador, fotos de cliente y cédula, ubicación con mapa), formulario con cliente en el exterior y persona que recibe aquí, marca "No venderle" (solo dueños), quitar cliente sin deuda.
- **Vender**: productos con precio al cliente y costo (el costo solo lo ven los dueños), inicial con el % sugerido, inicial pagada en $ o Bs a la tasa del día, cuotas semanales, quincenales (15 y último), mensuales o a mano, número de contrato en papel, foto del contrato. Modo **"Ya debía"** para pasar a los clientes que vienen de WhatsApp.
- **Abonos**: efectivo $, Zelle, USDT, pago móvil, efectivo Bs, transferencia; aviso de referencia repetida; foto del comprobante; "a la cuenta" reparte a la venta más vieja; recibo por WhatsApp. Anular solo dueños.
- **Cambios de dueño**: recargo, descuento, más tiempo (calendario nuevo), retirar mercancía (sigue debiendo, como su contrato), devolver mercancía, cerrar y reabrir, anular, corregir costo. Historial de cada venta.
- **Contrato** nuevo imprimible (lleno con la venta o en blanco), una hoja carta, con condiciones editables en Ajustes. Resumen de la venta por WhatsApp.
- **Cobros**: por día, semana o mes; totales por método y por quién lo recibió.
- **Efectivo de Pedraza**: lo que el empleado cobró en efectivo ($ y Bs aparte) y no ha entregado; "Recibir entrega" anota lo entregado y si faltó o sobró.
- **Sin señal**: abre con los datos guardados en el teléfono; ventas, abonos, clientes y fotos se guardan en la cola y se envían solos; nunca se duplican.
- Logo y marca nuevos (azul noche y cobre), instalable en el teléfono.

**Base**: migraciones `001_base.sql` y `002_respaldo_diario.sql`. Función `usuarios` (Edge Function).

**Pruebas**: 131 escenarios de la base, 27 de cuentas y 33 revisiones del recorrido completo en tamaño teléfono (incluye sin señal y reintento sin duplicar).

**Revisión independiente antes de producción** (7 hallazgos, todos corregidos y con prueba): el empleado podía mandar una tasa inventada; veía costos en el historial de la venta; un error 5xx del servidor se tomaba como rechazo (podía trabar o duplicar un abono); "Guardar igual" no servía para ventas en cola; el empleado podía usar "Ya debía" para esconder efectivo; anular un abono no bloqueaba la venta; la entrega podía marcar un cobro que no se contó. Quedaron 142 escenarios de base.

**Aplicado a la base real el 2026-10-15**: huellas de las 47 funciones iguales a las probadas; inspector de seguridad sin problemas (solo lo esperado); prueba de venta y abono dentro de una transacción que se deshizo; entrada de Franklin, lectura por la API y Edge Function comprobadas desde la base con `pg_net`. Cuentas `franklin` y `daniel` creadas.

**Pendiente de Kinan / dueños**: plan Pro antes de cargar clientes reales, activar GitHub Pages, apagar el registro público de Supabase, crear al empleado, revisar las condiciones del contrato.
