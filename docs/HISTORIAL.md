# Historial de entregas — Electro Montana

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

**Pendiente de Kinan / dueños**: plan Pro antes de cargar clientes reales, activar GitHub Pages, apagar el registro público de Supabase, crear al empleado, revisar las condiciones del contrato.
