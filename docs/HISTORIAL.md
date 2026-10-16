# Historial de entregas — Electro Montana

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
