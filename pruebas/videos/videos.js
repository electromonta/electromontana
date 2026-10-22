// Videos cortos de la guía, uno por tema. Se graban contra la copia LOCAL con datos inventados.
// Uso: NODE_PATH=/opt/node22/lib/node_modules node pruebas/videos/videos.js <carpeta> [número ...]
'use strict';
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { Video } = require('./motor');

const RAIZ = path.join(__dirname, '..', '..');
const TOTAL = 11;
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
const masDias = (f, n) => { const d = new Date(f + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Base local nueva con los clientes inventados de la guía (+ algo extra si el video lo necesita)
function baseNueva(extra) {
  execFileSync(path.join(RAIZ, 'pruebas', 'preparar-local.sh'), { stdio: 'ignore' });
  const psql = ['-h', '127.0.0.1', '-p', '54329', '-U', 'postgres', '-d', 'em_local', '-v', 'ON_ERROR_STOP=1', '-q'];
  execFileSync('psql', psql.concat(['-f', path.join(RAIZ, 'pruebas', 'guia', 'demo.sql')]), { stdio: 'ignore' });
  if (extra) execFileSync('psql', psql.concat(['-c', extra]), { stdio: 'ignore' });
}
const COMO_EMPLEADO = "select set_config('request.jwt.claims', '{\"sub\":\"00000000-0000-0000-0000-00000000000e\",\"role\":\"authenticated\"}', false); set role authenticated; ";

const VIDEOS = [
  { n: 1, archivo: '01-conoce-la-app', titulo: 'Conoce la app', usuario: 'franklin', async guion(v) {
    await v.portada('VIDEO 1 DE ' + TOTAL, 'Conoce la app', 'La pantalla de inicio, los colores y la tasa del día');
    await v.decir('Al abrir la app sale <b>Cobrar</b>: a quién hay que cobrarle hoy.', 3200);
    await v.acercar('#cbKpis', 1.55);
    await v.marco('#cbKpis .kpi:nth-child(1)');
    await v.decir('<b>Por cobrar</b>: todo lo que deben los clientes.', 2800);
    await v.marco('#cbKpis .kpi:nth-child(2)');
    await v.decir('<b>Atrasado</b>: lo que ya debieron pagar y no han pagado.', 3000);
    await v.marco('#cbKpis .kpi:nth-child(3)');
    await v.decir('<b>Cobrado hoy</b> y <b>Les toca hoy</b>: cómo va el día.', 2800);
    await v.alejar();
    await v.decir('Los colores siempre dicen lo mismo:', 1600);
    await v.acercar('.cobro.atrasado', 1.6);
    await v.marco('.cobro.atrasado');
    await v.decir('<b>Rojo</b>: atrasado. Dice cuánto y desde hace cuántos días.', 3400);
    await v.alejar(700);
    await v.bajar(1100, 1200);
    await v.acercar('.cobro.hoy:not(:has(.etiqueta.e-info:has-text("Prometió")))', 1.6);
    await v.marco('.cobro.hoy:not(:has(.etiqueta.e-info:has-text("Prometió")))');
    await v.decir('<b>Azul</b>: le toca pagar hoy.', 2600);
    await v.alejar();
    await v.arriba();
    await v.decir('Abajo está todo a la mano: <b>Cobrar</b>, <b>Clientes</b>, <b>Vender</b>, <b>Cobros</b> y <b>Más</b>.', 1200);
    await v.acercar('#navTabs', 1.9);
    await v.marco('#navTabs');
    await v.esperar(3000);
    await v.alejar();
    await v.decir('Cada mañana, uno de ustedes pone la <b>tasa del día</b>.', 1500);
    await v.tocar('#chipTasa');
    await v.escribir('#tasaNueva', '41,5', { lento: true });
    await v.decir('Esa tasa se usa en <b>todos los teléfonos</b> para recibir bolívares.', 2600);
    await v.tocar('#tasaGuardar', { despues: 1200 });
    await v.acercar('#chipTasa', 2.2);
    await v.decir('Listo: arriba dice la tasa de hoy.', 2400);
    await v.alejar();
    await v.decir('En <b>Más</b> están los reportes, la mercancía, los ajustes y esta guía.', 1000);
    await v.tocar('#navTabs [data-mas]', { despues: 2600 });
    await v.cerrarHojas();
    await v.cierre('Conoce la app', 'Siguiente: cobrar un abono');
  } },

  { n: 2, archivo: '02-cobrar-un-abono', titulo: 'Cobrar un abono', usuario: 'franklin', async guion(v) {
    await v.portada('VIDEO 2 DE ' + TOTAL, 'Cobrar un abono', 'En bolívares o en dólares, con su recibo por WhatsApp');
    await v.decir('María está atrasada. En su tarjeta, toca <b>Abonar</b>.', 800);
    await v.tocar('.cobro:has-text("María González") [data-abonar]', { despues: 1000 });
    await v.acercar('#abMetodos', 1.6);
    await v.decir('Elige <b>cómo pagó</b>: dólares, Zelle, USDT, pago móvil o bolívares.', 2600);
    await v.tocar('#abMetodos [data-m="5"]');
    await v.decir('Pagó en bolívares: el monto se escribe <b>en bolívares</b>.', 300);
    await v.escribir('#abMonto', '3200', { lento: true });
    await v.acercar('#abEquiv', 2.0);
    await v.marco('#abEquiv');
    await v.decir('La app dice cuánto es <b>en dólares</b>, con la tasa del día.', 3200);
    await v.marco(null);
    await v.acercar('#abRapidos', 1.9);
    await v.marco('#abRapidos');
    await v.decir('Estos botones ponen solo <b>lo atrasado</b> o <b>todo</b> lo que debe.', 3000);
    await v.alejar();
    await v.decir('Toca <b>Guardar abono</b>. Se bloquea al primer toque: nunca se guarda dos veces.', 1600);
    await v.tocar('#abGuardar', { despues: 1800 });
    await v.esperarQue('.hoja h2:has-text("Abono registrado")');
    await v.acercar('.hoja .aviso', 1.8);
    await v.decir('Listo: ya se restó de lo que debe.', 2600);
    await v.alejar();
    await v.decir('Toca <b>Enviar recibo por WhatsApp</b>.', 600);
    await v.tocar('#agRecibo', { despues: 400 });
    await v.decir('Le llega su recibo con lo que abonó y lo que le falta.');
    await v.whatsapp(6500);
    await v.tocar('#agListo', { despues: 900 });
    await v.decir('En <b>Cobros</b> se ve todo lo cobrado del día.', 600);
    await v.tocar('#navTabs [data-ir="cobros"]', { despues: 1500 });
    await v.acercar('#coTotales', 1.45);
    await v.decir('Por método de pago y por quién lo recibió.', 3400);
    await v.alejar();
    await v.cierre('Cobrar un abono', 'Siguiente: registrar un cliente nuevo');
  } },

  { n: 3, archivo: '03-cliente-nuevo', titulo: 'Cliente nuevo', usuario: 'franklin', async guion(v) {
    await v.portada('VIDEO 3 DE ' + TOTAL, 'Registrar un cliente nuevo', 'Sus datos, el fiador, la foto de la cédula y la ubicación');
    await v.tocar('#navTabs [data-ir="clientes"]', { despues: 900 });
    await v.decir('En <b>Clientes</b>, toca <b>Nuevo cliente</b>.', 800);
    await v.tocar('[data-nuevo]', { despues: 900 });
    await v.acercar('#fNombre', 1.6, 900);
    await v.decir('Solo el nombre es obligatorio, pero llena todo lo que puedas.', 300);
    await v.escribir('#fNombre', 'Daniela Torres');
    await v.escribir('#fCedula', '23456789');
    await v.escribir('#fTelefono', '0414-5550909');
    await v.acercar('#fSede', 1.7);
    await v.decir('Elige si es de <b>Socopó</b> o de <b>Pedraza</b>.', 1400);
    await v.tocar('#fSede [data-v="socopo"]');
    await v.alejar(700);
    await v.decir('Dónde vive: sector, dirección y un punto de referencia.', 300);
    await v.acercar('#fDireccion', 1.5, 900);
    await v.escribir('#fSector', 'El Progreso');
    await v.escribir('#fDireccion', 'Calle 9, casa 3');
    await v.escribir('#fReferencia', 'Frente a la cancha');
    await v.escribir('#fTrabajo', 'Enfermera');
    await v.decir('El <b>fiador</b>: quien paga si el cliente no paga.', 300);
    await v.acercar('#fFiNombre', 1.6, 900);
    await v.escribir('#fFiNombre', 'Luis Torres');
    await v.escribir('#fFiCedula', '9876001');
    await v.escribir('#fFiTel', '0424-5551212');
    await v.soltar();
    await v.alejar(700);
    await v.decir('Toma la foto de la <b>cédula</b> con la cámara.', 300);
    await v.foto('[data-tomar="cedula"]', path.join(RAIZ, 'img', 'icono-512.png'));
    await v.decir('Estando en su casa, guarda la <b>ubicación</b> para encontrarla en el mapa.', 300);
    await v.tocar('#fUbicar', { despues: 2200 });
    await v.decir('Toca <b>Guardar cliente</b>.', 500);
    await v.tocar('#fGuardar', { despues: 2500 });
    await v.esperarQue('.ficha-cab');
    await v.decir('Queda su <b>ficha</b>: lo que debe, sus ventas, abonos, notas y datos.', 3200);
    await v.acercar('.ficha-cab .acciones-rapidas', 1.8);
    await v.decir('Desde aquí: llamar, WhatsApp, recordar y el mapa de su casa.', 3200);
    await v.alejar();
    await v.cierre('Cliente nuevo', 'Siguiente: vender a crédito');
  } },

  { n: 4, archivo: '04-vender-a-credito', titulo: 'Vender a crédito', usuario: 'franklin', async guion(v) {
    await v.portada('VIDEO 4 DE ' + TOTAL, 'Vender a crédito', 'Producto, inicial y cuotas en un minuto');
    await v.tocar('#navTabs [data-ir="clientes"]', { despues: 900 });
    await v.tocar('.item:has-text("Rosa Pérez")', { despues: 1200 });
    await v.decir('En la ficha del cliente, toca <b>Nueva venta</b>.', 600);
    await v.tocar('[data-vender]', { despues: 1000 });
    await v.acercar('#vItems', 1.55);
    await v.decir('Escribe el producto: la app sugiere los que ya se han vendido.', 300);
    await v.escribir('#vItems [data-campo="descripcion"]', 'cocina', { lento: true });
    await v.tocar('#vItems .sugerencias [data-p]', { despues: 900 });
    await v.marco('#vItems .tres');
    await v.decir('Sale el <b>precio al cliente</b> y el <b>costo</b>. El costo solo lo ven los dueños.', 3600);
    await v.marco('#vItems .casilla');
    await v.decir('Está guardada en la tienda de Pedraza: marca la casilla y se descuenta sola.', 1800);
    await v.tocar('#vItems [data-tienda="pedraza"]');
    await v.marco(null);
    await v.alejar(700);
    await v.acercar('#vInicial', 1.5);
    await v.decir('<b>Inicial</b>: escribe el monto o toca <b>Usar el 30 %</b>.', 600);
    await v.tocar('#vUsarPct');
    await v.decir('Si la pagó en el momento, elige cómo pagó.', 300);
    await v.tocar('#vMetodos [data-m="1"]', { despues: 1400 });
    await v.alejar(700);
    await v.decir('<b>Cuotas</b>: semanal, quincenal o mensual, y cuántas.', 300);
    await v.acercar('#vCuotas', 1.35);
    await v.tocar('#vFrec [data-f="semanal"]');
    await v.escribir('#vNumero', '6', { lento: true });
    await v.soltar();
    await v.decir('El calendario se arma solo, con sus fechas y montos.', 3400);
    await v.alejar();
    await v.decir('Abajo está el resumen. Toca <b>Guardar venta</b>.', 1200);
    await v.tocar('#vGuardar', { despues: 2000 });
    await v.esperarQue('.hoja h2:has-text("guardada")');
    await v.decir('Venta guardada. Ahora se puede <b>firmar en la pantalla</b>, mandar el <b>resumen</b> o el <b>contrato en PDF</b>.', 4200);
    await v.tocar('.hoja [data-resumen]', { despues: 400 });
    await v.decir('El resumen le llega por WhatsApp, con todas sus cuotas.');
    await v.whatsapp(6500);
    await v.cierre('Vender a crédito', 'Siguiente: firmar el contrato en la pantalla');
  } },

  { n: 5, archivo: '05-firmar-el-contrato', titulo: 'Firmar el contrato', usuario: 'franklin', async guion(v) {
    const firma1 = [[[.10, .60], [.15, .38], [.21, .62], [.27, .36], [.34, .64], [.40, .44], [.47, .58], [.54, .40], [.62, .60], [.70, .44], [.78, .56], [.88, .50]], [[.14, .76], [.86, .72]]];
    const firma2 = [[[.12, .50], [.20, .34], [.26, .60], [.33, .40], [.40, .62], [.48, .36], [.56, .58], [.64, .42], [.74, .60], [.84, .46]], [[.30, .74], [.80, .70]]];
    await v.portada('VIDEO 5 DE ' + TOTAL, 'Firmar el contrato en la pantalla', 'El cliente y el fiador firman con el dedo');
    await v.tocar('#navTabs [data-ir="clientes"]', { despues: 900 });
    await v.tocar('.item:has-text("María González")', { despues: 1300 });
    await v.decir('En la venta, toca <b>Firmar en la pantalla</b>.', 600);
    await v.tocar('[data-firmar]', { despues: 1200 });
    await v.acercar('.firma-texto', 1.55);
    await v.decir('Arriba dice, en palabras simples, lo que el cliente acepta.', 3600);
    await v.alejar(700);
    await v.decir('Con <b>Leer el contrato completo</b> ve todas las condiciones.', 300);
    await v.tocar('[data-leer]', { despues: 1400 });
    await v.bajarHoja(1500, 1800);
    await v.bajarHoja(900, 1500);
    await v.tocar('.velo >> nth=-1 >> [data-cerrar]', { despues: 700 });
    await v.decir('El cliente firma con el dedo. Si sale mal, <b>Borrar</b>.', 300);
    await v.firmar(firma1);
    await v.decir('Si tiene fiador, toca <b>Siguiente</b> y firma el fiador.', 300);
    await v.tocar('.hoja-pie [data-seguir]', { despues: 1300 });
    await v.acercar('.firma-texto', 1.6);
    await v.decir('El fiador se compromete a pagar si el cliente no paga.', 3200);
    await v.alejar(700);
    await v.firmar(firma2);
    await v.decir('Toca <b>Guardar firmas</b>.', 300);
    await v.tocar('.hoja-pie [data-seguir]', { despues: 2600 });
    await v.acercar('.etiqueta:has-text("Firmado en pantalla")', 2.0);
    await v.decir('Queda <b>firmado</b>, con la fecha y la hora. Funciona aunque no haya señal.', 3600);
    await v.alejar(700);
    await v.tocar('[data-imprimir]', { despues: 2600 });
    await v.acercar('.hoja .ct-firmas', 1.9);
    await v.decir('El contrato sale con las dos firmas. Se imprime o se manda en PDF.', 4000);
    await v.alejar();
    await v.cierre('Firmar el contrato', 'Siguiente: qué pasa si no hay señal');
  } },

  { n: 6, archivo: '06-sin-senal', titulo: 'Sin señal', usuario: 'pedraza', async guion(v) {
    await v.portada('VIDEO 6 DE ' + TOTAL, 'Sin señal no se pierde nada', 'Lo que se registra se guarda en el teléfono y se envía solo');
    await v.decir('En la calle la señal se va. La app está hecha para eso.', 2800);
    await v.tocar('.cobro:has-text("Luis Mendoza") .cobro-cuerpo', { despues: 1400 });
    await v.sinSenal(true);
    await v.decir('Ahora el teléfono está <b>sin señal</b>. Igual se cobra.', 600);
    await v.tocar('.ficha-cab [data-abonar]', { despues: 900 });
    await v.tocar('#abMetodos [data-m="1"]');
    await v.escribir('#abMonto', '75', { lento: true });
    await v.tocar('#abGuardar', { despues: 600 });
    await v.esperarQue('.hoja h2:has-text("Guardado en el teléfono")', 30000);
    await v.acercar('.hoja .aviso', 1.8);
    await v.decir('El abono queda <b>guardado en el teléfono</b>. No se pierde.', 3600);
    await v.alejar(700);
    await v.cerrarHojas();
    await v.acercar('#chipCola', 2.3);
    await v.marco('#chipCola');
    await v.decir('Arriba dice <b>"1 por enviar"</b>.', 2800);
    await v.alejar(700);
    await v.acercar('.ficha-cab .aviso:has-text("por enviar")', 1.8);
    await v.decir('Mientras no se envíe, todavía no se resta de lo que debe.', 3400);
    await v.alejar(700);
    await v.decir('Vuelve la señal…', 800);
    await v.sinSenal(false);
    await v.f.waitForFunction(() => document.getElementById('chipCola').hidden, null, { timeout: 30000 });
    await v.esperar(1200);
    await v.acercar('.ficha-cab .deuda-caja', 1.8);
    await v.decir('…y se envía <b>solo</b>, una sola vez. Ya se restó.', 3800);
    await v.alejar();
    await v.cierre('Sin señal', 'Siguiente: clientes que ya debían');
  } },

  { n: 7, archivo: '07-clientes-que-ya-debian', titulo: 'Clientes que ya debían', usuario: 'franklin', async guion(v) {
    await v.portada('VIDEO 7 DE ' + TOTAL, 'Clientes que ya debían', 'Cómo pasar a la app los créditos que llevan por WhatsApp');
    await v.tocar('#navTabs [data-ir="vender"]', { despues: 900 });
    await v.decir('En <b>Vender</b>, arriba, elige <b>Ya debía</b>.', 600);
    await v.tocar('#vTipo [data-t="carga"]', { despues: 900 });
    await v.acercar('#vTipoAyuda', 1.9);
    await v.decir('Es para los clientes que ya tenían un crédito antes de la app.', 3000);
    await v.alejar(700);
    await v.tocar('#vCliente [data-elegir]', { despues: 900 });
    await v.escribir('#ecBusca', 'yeli', { lento: true });
    await v.tocar('[data-ref]:has-text("Yelitza")', { despues: 900 });
    await v.decir('Lo que se llevó y el precio total.', 300);
    await v.escribir('#vItems [data-campo="descripcion"]', 'Lavadora 9 kg');
    await v.escribir('#vItems [data-campo="precio"]', '400');
    await v.acercar('#vInicial', 1.5);
    await v.decir('La <b>fecha en que se vendió</b> y <b>todo lo que ha pagado</b> hasta hoy.', 300);
    await v.fecha('#vFecha', '2026-08-10');
    await v.escribir('#vAntes', '150', { lento: true });
    await v.soltar();
    await v.esperar(2200);
    await v.alejar(700);
    await v.acercar('#vCuotas', 1.35);
    await v.decir('Las cuotas que <b>le faltan</b>, con sus fechas de verdad.', 300);
    await v.tocar('#vFrec [data-f="mensual"]');
    await v.escribir('#vNumero', '3');
    await v.fecha('#vPrimera', '2026-09-10');
    await v.soltar();
    await v.decir('Las que ya pasaron y no pagó quedan como <b>atrasadas</b>.', 3600);
    await v.alejar();
    await v.tocar('#vGuardar', { despues: 2000 });
    await v.esperarQue('.hoja h2:has-text("Cliente cargado")');
    await v.decir('Listo: ya está en la app con lo que debe. Lo pagado antes no cuenta como cobrado hoy.', 4200);
    await v.cerrarHojas();
    await v.cierre('Clientes que ya debían', 'Siguiente: notas, promesas y recordatorios');
  } },

  { n: 8, archivo: '08-notas-y-recordatorios', titulo: 'Notas y recordatorios', usuario: 'franklin', async guion(v) {
    await v.portada('VIDEO 8 DE ' + TOTAL, 'Notas, promesas y recordatorios', 'Para no olvidar qué dijo cada cliente');
    await v.decir('No estaba, o te dijo cuándo paga: <b>anótalo</b> con el botón <b>Nota</b>.', 800);
    await v.tocar('.cobro:has-text("Jesús Contreras") [data-nota]', { despues: 1000 });
    await v.acercar('#ngTipos', 1.6);
    await v.decir('Elige qué pasó: visita, llamada, no estaba, promesa…', 2400);
    await v.tocar('#ngTipos [data-t="promesa"]', { despues: 800 });
    await v.decir('Si prometió pagar, pon <b>para cuándo</b> y <b>cuánto</b>.', 300);
    await v.fecha('#ngFecha', hoy());
    await v.escribir('#ngMonto', '90', { lento: true });
    await v.alejar(700);
    await v.escribir('#ngNota', 'Cobra hoy en la tarde');
    await v.tocar('#ngGuardar', { despues: 2200 });
    await v.acercar('.cobro:has-text("Jesús Contreras")', 1.6);
    await v.marco('.cobro:has-text("Jesús Contreras")');
    await v.decir('El día de la promesa sale arriba, en <b>Prometieron pagar hoy</b>.', 3800);
    await v.alejar(700);
    await v.decir('Para recordarle a los atrasados: <b>Recordar a todos</b>.', 500);
    await v.tocar('[data-recordar-todos]', { despues: 1300 });
    await v.acercar('.hoja [data-enviar]', 1.7);
    await v.decir('Toca <b>Enviar</b> en cada uno: se abre WhatsApp con el mensaje listo.', 1200);
    await v.tocar('.hoja [data-enviar]', { despues: 400 });
    await v.alejar(500);
    await v.whatsapp(5500);
    await v.acercar('.hoja .etiqueta.e-verde', 2.0);
    await v.decir('Queda marcado <b>Enviado</b>. Sigue con el próximo.', 3200);
    await v.alejar(700);
    await v.cerrarHojas();
    await v.cierre('Notas y recordatorios', 'Siguiente: cuando no pagan');
  } },

  { n: 9, archivo: '09-cuando-no-pagan', titulo: 'Cuando no pagan', usuario: 'franklin', async guion(v) {
    await v.portada('VIDEO 9 DE ' + TOTAL, 'Cuando no pagan', 'Recargo, más tiempo y retirar la mercancía');
    await v.tocar('#navTabs [data-ir="clientes"]', { despues: 900 });
    await v.tocar('.item:has-text("Jesús Contreras")', { despues: 1300 });
    await v.acercar('.ficha-cab .aviso-ambar', 1.8);
    await v.decir('Lleva <b>3 cuotas sin pagar</b>: según el contrato ya se puede retirar la mercancía.', 4000);
    await v.alejar(700);
    await v.acercar('[data-accion="recargo"]', 1.5);
    await v.marco('.venta-det .fila:has([data-accion="recargo"])');
    await v.decir('En la venta están los <b>cambios</b>. Solo los ven los dueños, y todos piden un motivo.', 3800);
    await v.alejar(700);
    await v.tocar('[data-accion="recargo"]', { despues: 900 });
    await v.decir('<b>Recargo</b> por demora: se suma a lo que debe.', 300);
    await v.escribir('#ajMonto', '15', { lento: true });
    await v.escribir('#ajMotivo', 'Tres meses de atraso');
    await v.tocar('#ajGuardar', { despues: 2000 });
    await v.tocar('[data-accion="tiempo"]', { despues: 1000 });
    await v.decir('<b>Más tiempo</b>: un calendario nuevo para lo que falta.', 300);
    await v.escribir('#rpNum', '5', { lento: true });
    await v.soltar();
    await v.acercar('#rpVista', 1.4);
    await v.esperar(2600);
    await v.alejar(700);
    await v.escribir('#rpMotivo', 'Se quedó sin trabajo');
    await v.tocar('#rpGuardar', { despues: 2000 });
    await v.tocar('[data-accion="retirar"]', { despues: 1000 });
    await v.decir('<b>Retirar la mercancía</b>, como dice su contrato: sigue debiendo y se le devuelve al terminar de pagar.', 1500);
    await v.escribir('#cfValor', 'No ha vuelto a pagar');
    await v.tocar('#cfSi', { despues: 2200 });
    await v.acercar('.venta .venta-cab', 1.7);
    await v.marco('.venta .venta-cab .etiqueta:has-text("Retirada")');
    await v.decir('La venta queda <b>Retirada</b>: sigue debiendo y todo queda anotado.', 3200);
    await v.marco(null);
    await v.acercar('.venta-det .cuotas', 1.35);
    await v.decir('Y con su <b>calendario nuevo</b>, que ya incluye el recargo.', 3200);
    await v.alejar();
    await v.cierre('Cuando no pagan', 'Siguiente: mercancía y efectivo de Pedraza');
  } },

  { n: 10, archivo: '10-mercancia-y-efectivo', titulo: 'Mercancía y efectivo', usuario: 'franklin',
    extra: () => COMO_EMPLEADO + "select public.registrar_abono('{\"cliente_id\":4,\"metodo_id\":1,\"monto\":75}'); select public.registrar_abono('{\"cliente_id\":5,\"metodo_id\":5,\"monto\":800,\"tasa\":40}');",
    async guion(v) {
    await v.portada('VIDEO 10 DE ' + TOTAL, 'Mercancía y efectivo de Pedraza', 'Lo que hay en la tienda y cómo recibir el efectivo del empleado');
    await v.tocar('#navTabs [data-mas]', { despues: 700 });
    await v.tocar('.hoja [data-ir="mercancia"]', { despues: 1300 });
    await v.acercar('#mcKpis', 1.7);
    await v.decir('Lo que está guardado en la <b>tienda de Pedraza</b> y cuánto vale.', 3200);
    await v.alejar(700);
    await v.decir('Cuando llevan mercancía de Yumana: <b>Entrada de mercancía</b>.', 500);
    await v.tocar('#mcEntrada', { despues: 1000 });
    await v.escribir('#emFilas [data-c="nombre"]', 'ventil', { lento: true });
    await v.tocar('#emFilas .sugerencias [data-p]', { despues: 700 });
    await v.escribir('#emFilas [data-c="cantidad"]', '4');
    await v.escribir('#emNota', 'Factura Yumana 2088');
    await v.soltar();
    await v.decir('Cantidad, costo y precio. El número de factura va en la nota.', 2600);
    await v.tocar('#emGuardar', { despues: 2200 });
    await v.decir('Cada producto dice todo lo que entró y salió, y a qué cliente.', 300);
    await v.tocar('#mcLista .item:has-text("Ventilador")', { despues: 1800 });
    await v.acercar('.hoja .lista', 1.4);
    await v.esperar(3000);
    await v.alejar(700);
    await v.cerrarHojas();
    await v.decir('Lo que el empleado cobra en efectivo queda <b>en sus manos</b> hasta que lo entrega.', 600);
    await v.tocar('#navTabs [data-mas]', { despues: 700 });
    await v.tocar('.hoja [data-ir="efectivo"]', { despues: 1500 });
    await v.acercar('.deuda-caja', 1.8);
    await v.decir('Aquí se ve cuánto tiene, en dólares y en bolívares.', 3200);
    await v.alejar(700);
    await v.tocar('[data-recibir]', { despues: 1000 });
    await v.decir('Cuenta el dinero y escribe lo que te entregó de verdad.', 300);
    await v.escribir('#enUsd', '75');
    await v.escribir('#enBs', '800');
    await v.soltar();
    await v.acercar('#enDif', 1.7);
    await v.marco('#enDif');
    await v.decir('La app dice si <b>cuadra</b> o cuánto falta.', 3000);
    await v.alejar(700);
    await v.tocar('#enGuardar', { despues: 2400 });
    await v.decir('La entrega queda anotada, con lo que se esperaba y lo que entregó.', 300);
    await v.acercar('.seccion .lista .item', 1.7);
    await v.esperar(3300);
    await v.alejar();
    await v.cierre('Mercancía y efectivo', 'Siguiente: reportes');
  } },

  { n: 11, archivo: '11-reportes', titulo: 'Reportes', usuario: 'franklin', async guion(v) {
    await v.portada('VIDEO 11 DE ' + TOTAL, 'Reportes', 'Cómo va el negocio, en una pantalla');
    await v.tocar('#navTabs [data-mas]', { despues: 700 });
    await v.tocar('.hoja [data-ir="reportes"]', { despues: 1800 });
    await v.acercar('#rpCuerpo .kpis', 1.5);
    await v.decir('Por cobrar, atrasado, cobrado este mes y la <b>ganancia del mes</b>.', 3800);
    await v.alejar(700);
    await v.acercar('.seccion:has-text("Cobrado por semana") .tarjeta', 1.3);
    await v.decir('Lo cobrado cada semana y por método de pago.', 3400);
    await v.alejar(700);
    await v.acercar('.seccion:has-text("Ventas por mes") .tarjeta', 1.3);
    await v.decir('Lo vendido cada mes y su <b>ganancia</b> (lo vendido menos lo que costó en Yumana).', 3800);
    await v.alejar(700);
    await v.acercar('.seccion:has-text("Cómo van") .tarjeta', 1.4);
    await v.decir('Cuántos están al día y cuántos atrasados, por días de atraso.', 3400);
    await v.alejar(700);
    await v.acercar('.seccion:has-text("Atrasados") .lista', 1.35);
    await v.decir('Los atrasados, con su último abono y su última nota.', 3400);
    await v.alejar();
    await v.cierre('Reportes', 'Fin de los videos. La guía completa está en Más → Guía de uso.');
  } },

  // Video para el encargado de la tienda: todo lo que hace él, desde su teléfono
  { n: 12, archivo: '12-encargado-de-pedraza', titulo: 'Para el encargado de Pedraza', usuario: 'pedraza', async guion(v) {
    await v.portada('PARA EL ENCARGADO DE LA TIENDA', 'Tu app de la tienda de Pedraza', 'Cobrar, vender a crédito o de contado, la mercancía y tu efectivo', 4600);
    await v.decir('Entras con <b>tu usuario</b> y <b>tu clave</b>. La primera vez, la app te pide una clave nueva que <b>solo sabes tú</b>.', 4600);
    await v.decir('Al abrir sale <b>Cobrar</b>, solo con los clientes de la <b>tienda de Pedraza</b>.', 3200);
    await v.acercar('.cobro:has-text("Luis Mendoza")', 1.6);
    await v.marco('.cobro:has-text("Luis Mendoza")');
    await v.decir('Cada cliente dice cuánto debe, si está <b>atrasado</b> (en rojo) y lo que prometió.', 3600);
    await v.alejar(700);

    await v.decir('<b>1. Cobrar.</b> Toca <b>Abonar</b> en el cliente.', 600);
    await v.tocar('.cobro:has-text("Luis Mendoza") [data-abonar]', { despues: 900 });
    await v.decir('Elige cómo pagó y escribe el monto.', 300);
    await v.tocar('#abMetodos [data-m="1"]');
    await v.escribir('#abMonto', '75', { lento: true });
    await v.soltar();
    await v.tocar('#abGuardar', { despues: 1200 });
    await v.esperarQue('.hoja h2:has-text("Abono registrado")');
    await v.decir('Listo. Mándale su <b>recibo por WhatsApp</b>: le dice lo que pagó y lo que le falta.', 600);
    await v.tocar('#agRecibo', { despues: 400 });
    await v.whatsapp(5200);
    await v.cerrarHojas();

    await v.decir('<b>2. Vender a crédito.</b> El botón redondo <b>Vender</b>.', 600);
    await v.tocar('#navTabs [data-ir="vender"]', { despues: 1000 });
    await v.tocar('#vCliente [data-elegir]', { despues: 700 });
    await v.escribir('#ecBusca', 'Rosa', { lento: true });
    await v.tocar('#ecLista [data-ref]:has-text("Rosa Pérez")', { despues: 800 });
    await v.acercar('#vItems', 1.5);
    await v.decir('Escribe el producto y elígelo de la lista.', 300);
    await v.escribir('#vItems [data-campo="descripcion"]', 'licua', { lento: true });
    await v.tocar('#vItems .sugerencias [data-p]', { despues: 900 });
    await v.marco('#vItems .casilla');
    await v.decir('Si está en la tienda, sale marcado: <b>se descuenta solo</b>.', 3200);
    await v.marco(null);
    await v.alejar(700);
    await v.acercar('#vInicial', 1.5);
    await v.decir('La <b>inicial</b>: toca <b>Usar el 30 %</b> y cómo la pagó.', 500);
    await v.tocar('#vUsarPct');
    await v.tocar('#vMetodos [data-m="1"]', { despues: 1000 });
    await v.alejar(700);
    await v.acercar('#vCuotas', 1.35);
    await v.decir('Las <b>cuotas</b>: cada cuánto y cuántas. Las fechas se ponen solas.', 300);
    await v.escribir('#vNumero', '4', { lento: true });
    await v.soltar();
    await v.esperar(2600);
    await v.alejar();
    await v.tocar('#vGuardar', { despues: 1600 });
    await v.esperarQue('.hoja h2:has-text("guardada")');
    await v.marco('.hoja [data-firmar]');
    await v.decir('Guardada. Ahora el cliente <b>firma el contrato</b> con el dedo, en la pantalla.', 4200);
    await v.marco(null);
    await v.cerrarHojas();

    await v.decir('<b>3. Vender de contado.</b> Arriba toca <b>De contado</b>.', 600);
    await v.tocar('#vForma [data-c="1"]', { despues: 900 });
    await v.tocar('#vCliente [data-elegir]', { despues: 700 });
    await v.escribir('#ecBusca', 'Luis', { lento: true });
    await v.tocar('#ecLista [data-ref]:has-text("Luis Mendoza")', { despues: 800 });
    await v.escribir('#vItems [data-campo="descripcion"]', 'ventil', { lento: true });
    await v.tocar('#vItems .sugerencias [data-p]', { despues: 900 });
    await v.acercar('#vInicial', 1.5);
    await v.decir('Paga todo hoy: solo elige <b>cómo pagó</b>. Sin cuotas ni contrato.', 300);
    await v.tocar('#vMetodos [data-m="1"]', { despues: 2400 });
    await v.alejar(700);
    await v.tocar('#vGuardar', { despues: 1600 });
    await v.esperarQue('.hoja h2:has-text("contado")');
    await v.decir('Y su <b>recibo por WhatsApp</b>.', 500);
    await v.tocar('.hoja [data-resumen]', { despues: 400 });
    await v.whatsapp(4600);
    await v.cerrarHojas();

    await v.decir('<b>4. Cuando llega mercancía:</b> Más → Mercancía.', 600);
    await v.tocar('#navTabs [data-mas]', { despues: 700 });
    await v.tocar('.hoja [data-ir="mercancia"]', { despues: 1300 });
    await v.decir('Ves lo que hay en la tienda. Toca <b>Anotar mercancía que llegó</b>.', 500);
    await v.tocar('#mcEntrada', { despues: 1000 });
    await v.escribir('#emFilas [data-c="nombre"]', 'Plancha Oster', { lento: true });
    await v.escribir('#emFilas [data-c="cantidad"]', '3');
    await v.decir('Cuántos llegaron. Si es un producto nuevo, su <b>precio de venta</b>.', 300);
    await v.escribir('#emFilas [data-c="precio"]', '28');
    await v.soltar();
    await v.decir('Los <b>costos</b> los ponen Franklin y Daniel: tú no los ves.', 3200);
    await v.tocar('#emGuardar', { despues: 2200 });
    await v.cerrarHojas();

    await v.decir('<b>5. Tu efectivo.</b> Lo que cobras en efectivo queda <b>a tu nombre</b>.', 600);
    await v.tocar('#navTabs [data-mas]', { despues: 700 });
    await v.tocar('.hoja [data-ir="efectivo"]', { despues: 1500 });
    await v.acercar('.deuda-caja', 1.8);
    await v.decir('Cuando Franklin o Daniel vienen, cuentan contigo y lo anotan. Si cuadra, queda en cero.', 4200);
    await v.alejar();

    await v.decir('<b>6. Sin señal</b> igual registras: se guarda en el teléfono y se envía solo cuando vuelve.', 4200);
    await v.decir('No te toca anular, descontar ni cambiar la tasa: eso lo hacen <b>Franklin o Daniel</b>.', 4200);
    await v.cierre('Listo', 'Tu guía está en la app: Más → Guía de uso', 4200);
  } },

  // Para los dueños: dejar listo al encargado (crearle el usuario, mandarle sus datos y su primera entrada)
  { n: 13, archivo: '13-dejar-listo-al-encargado', titulo: 'Dejar listo al encargado', usuario: 'franklin', async guion(v) {
    await v.portada('PARA FRANKLIN Y DANIEL', 'Dejar listo al encargado', 'Su usuario, su clave y su primera vez en la app', 4400);
    await v.decir('<b>1. Crearle su usuario.</b> En <b>Más → Ajustes</b>, en <b>Usuarios</b>.', 600);
    await v.tocar('#navTabs [data-mas]', { despues: 700 });
    await v.tocar('.hoja [data-ir="ajustes"]', { despues: 1300 });
    await v.decir('Toca <b>Nuevo</b>.', 300);
    await v.tocar('[data-nuevo-usuario]', { despues: 900 });
    await v.decir('Su <b>nombre</b>, un <b>usuario</b> corto sin espacios y una <b>clave temporal</b> (mínimo 6).', 300);
    await v.escribir('#usNombre', 'José Rivas', { lento: true });
    await v.escribir('#usUsuario', 'jose', { lento: true });
    await v.escribir('#usClave', 'temporal1', { lento: true });
    await v.soltar();
    await v.decir('Rol <b>Empleado</b> y sede <b>Pedraza</b>: así solo ve los clientes de esa tienda.', 400);
    await v.tocar('#usRol [data-v="empleado"]');
    await v.tocar('#usSede [data-v="pedraza"]', { despues: 700 });
    await v.acercar('#usPermisos', 1.5);
    await v.marco('#usPermisos');
    await v.decir('Aquí dice lo que <b>podrá</b> y lo que <b>no podrá</b> hacer: no ve costos, ganancias ni reportes, ni la otra tienda.', 5600);
    await v.marco(null);
    await v.alejar();
    await v.decir('Toca <b>Crear usuario</b>.', 300);
    await v.tocar('#usGuardar', { despues: 1500 });
    await v.esperarQue('.hoja h2:has-text("Usuario listo")');
    // Se graba en la copia local: en pantalla se muestra la dirección real de la app
    await v.f.evaluate(() => document.querySelectorAll('.hoja .dato .crece').forEach(e => {
      e.textContent = e.textContent.replace('http://localhost:8080/', 'https://electromonta.github.io/electromontana/');
    }));
    await v.decir('<b>2. Mandarle sus datos.</b> Sale <b>Usuario listo</b>, con el link, su usuario y su clave temporal.', 4200);
    await v.decir('Toca <b>Mandarle sus datos por WhatsApp</b> y elige su chat.', 600);
    await v.tocar('#deWhatsApp', { despues: 400 });
    await v.whatsapp(8500, [['http://localhost:8080/', 'https://electromonta.github.io/electromontana/']]);
    await v.decir('Le llega todo escrito: el link, su usuario, su clave, cómo ponerla como app y su guía.', 3800);
    await v.tocar('#deListo', { despues: 600 });

    // Ahora, en el teléfono de él (mientras se ve la portada, se sale de la cuenta de Franklin)
    await v.decir('');
    await v.p.evaluate(a => esc.portada(a[0], a[1], a[2]), ['3. EN EL TELÉFONO DE JOSÉ', 'Su primera vez', 'Abre el link que le mandaron']);
    await v.f.evaluate(() => { salir(); });
    await v.esperarQue('#pantallaLogin:not([hidden])', 20000);
    await v.esperar(3200);
    await v.p.evaluate(() => esc.quitarPortada());
    await v.esperar(800);
    await v.decir('Entra con el <b>usuario</b> y la <b>clave temporal</b> que le mandaron.', 300);
    await v.escribir('#loginUsuario', 'jose', { lento: true });
    await v.escribir('#loginClave', 'temporal1', { lento: true });
    await v.soltar();
    await v.tocar('#btnEntrar', { despues: 600 });
    await v.esperarQue('.hoja h2:has-text("Pon tu clave")', 20000);
    await v.decir('La app le pide <b>su propia clave</b>. Esa solo la sabe él: ni ustedes la ven.', 1200);
    await v.escribir('#clave1', 'jose2026', { lento: true });
    await v.escribir('#clave2', 'jose2026', { lento: true });
    await v.soltar();
    await v.tocar('#claveGuardar', { despues: 700 });
    await v.decir('<b>¡Listo!</b> Ya está en <b>Cobrar</b>, solo con los clientes de la <b>tienda de Pedraza</b>.', 4400);
    await v.decir('Su guía está en <b>Más → Guía de uso</b>, hecha para él.', 600);
    await v.tocar('#navTabs [data-mas]', { despues: 900 });
    await v.marco('.hoja a.item[href*="guia"]');
    await v.esperar(3000);
    await v.marco(null);
    await v.cerrarHojas();
    await v.decir('<b>Si se le olvida la clave:</b> Ajustes → Usuarios → José → <b>Ponerle una clave nueva</b>, y se la mandan igual por WhatsApp.', 5200);
    await v.decir('<b>Si deja de trabajar con ustedes:</b> le quitan <b>"Puede entrar"</b>. Todo lo que hizo queda guardado.', 4800);
    await v.cierre('Encargado listo', 'Pásenle también su video: "Para el encargado de Pedraza"', 4600);
  } }
];

(async () => {
  const salida = process.argv[2];
  const elegidos = process.argv.slice(3).map(Number);
  fs.mkdirSync(salida, { recursive: true });
  const b = await chromium.launch({ args: ['--force-device-scale-factor=1'] });
  for (const def of VIDEOS) {
    if (elegidos.length && !elegidos.includes(def.n)) continue;
    console.log('Video ' + def.n + ': ' + def.titulo);
    baseNueva(def.extra && def.extra());
    const v = new Video(b);
    await v.preparar(def.usuario, def.titulo);
    if (def.antes) await def.antes(v);
    await v.grabar();
    try { await def.guion(v); }
    catch (e) { console.log('  !!! se detuvo:', e.message.split('\n')[0]); }
    const r = await v.terminar(path.join(salida, def.archivo + '.mp4'));
    const mb = (fs.statSync(path.join(salida, def.archivo + '.mp4')).size / 1048576).toFixed(1);
    console.log('  listo: ' + r.segundos + ' s, ' + r.cuadros + ' cuadros, ' + mb + ' MB');
  }
  await b.close();
})().catch(e => { console.error('SE DETUVO:', e); process.exit(2); });

module.exports = { hoy, masDias, COMO_EMPLEADO };
