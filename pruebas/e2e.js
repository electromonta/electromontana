// Recorrido completo de la app en un teléfono simulado contra la copia LOCAL (pruebas/preparar-local.sh).
// Uso: node pruebas/e2e.js [carpeta-de-capturas]
'use strict';
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const URL_APP = 'http://localhost:8080/';
const CAPTURAS = process.argv[2] || '/tmp/em-capturas';
const FOTO = path.join(__dirname, '..', 'img', 'icono-512.png');
fs.mkdirSync(CAPTURAS, { recursive: true });
const sql = q => execFileSync('psql', ['-h', '127.0.0.1', '-p', '54329', '-U', 'postgres', '-d', 'em_local', '-At', '-c', q], { encoding: 'utf8' }).trim();

let ok = 0, mal = 0;
const errores = [];
function revisar(nombre, cond, detalle) {
  if (cond) { ok++; console.log('ok  ' + nombre); } else { mal++; console.log('!!! ' + nombre + (detalle ? ' → ' + detalle : '')); }
}

async function nuevoTelefono(b) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    timezoneId: 'America/Caracas', locale: 'es-VE', geolocation: { latitude: 8.2312, longitude: -70.8201 }, permissions: ['geolocation'] });
  const p = await ctx.newPage();
  p.on('pageerror', e => errores.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|net::|TypeError: Failed to fetch/.test(m.text())) errores.push('console: ' + m.text()); });
  await p.addInitScript(() => { window.__abiertos = []; window.open = function (u) { window.__abiertos.push(u); return null; }; });
  return { ctx, p };
}
async function foto(p, nombre) { await p.waitForTimeout(250); await p.screenshot({ path: path.join(CAPTURAS, nombre + '.png') }); }
async function entrar(p, usuario) {
  await p.goto(URL_APP);
  await p.fill('#loginUsuario', usuario);
  await p.fill('#loginClave', 'prueba123');
  await p.click('#btnEntrar');
  await p.waitForSelector('#app:not([hidden])');
  await p.waitForTimeout(400);
}
async function cerrarHojas(p) {
  while (await p.locator('.velo').count()) { await p.locator('.velo [data-cerrar]').last().click(); await p.waitForTimeout(150); }
}
async function firmarConDedo(p) {
  const box = await p.locator('.firma-caja canvas').boundingBox();
  await p.mouse.move(box.x + 30, box.y + 150); await p.mouse.down();
  for (let i = 0; i <= 24; i++) await p.mouse.move(box.x + 30 + i * 11, box.y + 150 - Math.sin(i / 2) * 45);
  await p.mouse.up();
}
async function tomarFoto(p, selector) {
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click(selector)]);
  await fc.setFiles(FOTO);
  await p.waitForTimeout(500);
}

(async () => {
  const b = await chromium.launch();
  const { ctx, p } = await nuevoTelefono(b);

  // 1. Entrada
  await p.goto(URL_APP);
  await p.waitForSelector('#pantallaLogin:not([hidden])');
  await foto(p, '01-entrada');
  await p.fill('#loginUsuario', 'franklin'); await p.fill('#loginClave', 'mala'); await p.click('#btnEntrar');
  await p.waitForSelector('#loginError:not([hidden])');
  revisar('clave mala avisa', (await p.textContent('#loginError')).includes('incorrectos'));
  await entrar(p, 'franklin');
  revisar('Cobrar vacío', await p.locator('text=Todavía no hay ventas por cobrar').count() === 1);
  await foto(p, '02-cobrar-vacio');

  // 2. Tasa
  await p.click('[data-tasa]');
  await p.fill('#tasaNueva', '40');
  await p.click('#tasaGuardar');
  await p.waitForTimeout(500);
  revisar('tasa guardada', (await p.textContent('#chipTasa')).includes('40'));

  // 3. Cliente nuevo
  await p.click('#navTabs [data-ir="clientes"]');
  await p.click('[data-nuevo]');
  await p.fill('#fNombre', 'Ana Pérez');
  await p.fill('#fCedula', 'V-12.345.678');
  await p.fill('#fTelefono', '0414-1234567');
  await p.fill('#fSector', 'Barrio Nuevo');
  await p.fill('#fDireccion', 'Calle 3, casa 15');
  await p.fill('#fReferencia', 'Frente a la bodega azul');
  await p.fill('#fTrabajo', 'Maestra, escuela Bolívar');
  await p.fill('#fFiNombre', 'Carmen Pérez');
  await p.fill('#fFiCedula', '9876543');
  await p.fill('#fFiTel', '0424-5550000');
  await tomarFoto(p, '[data-tomar="cedula"]');
  await p.click('#fUbicar');
  await p.waitForTimeout(800);
  await foto(p, '03-cliente-formulario');
  await p.click('#fGuardar');
  await p.waitForSelector('.ficha-cab');
  await p.waitForTimeout(1500);
  revisar('ficha del cliente nuevo', (await p.textContent('.ficha-cab')).includes('Ana Pérez'));
  revisar('cliente en la base con cédula normalizada', sql("select cedula || '/' || sede || '/' || (lat is not null) from clientes where nombre = 'Ana Pérez'") === 'V12345678/socopo/true');
  revisar('foto de la cédula subida', sql("select foto_cedula like 'cli/%/cedula-%' from clientes where nombre = 'Ana Pérez'") === 't');

  // 4. Venta nueva: nevera $300, inicial 30 % en pago móvil, 7 semanales
  await p.click('[data-vender]');
  await p.waitForSelector('#vItems');
  await p.fill('#vItems [data-campo="descripcion"]', 'Nevera Mabe 14 pies');
  await p.fill('#vItems [data-campo="precio"]', '300');
  await p.fill('#vItems [data-campo="costo"]', '200');
  await p.click('#vUsarPct');
  revisar('la inicial tampoco trae método marcado', await p.locator('#vMetodos .chip.activo').count() === 0);
  await p.click('#vMetodos [data-m="4"]');
  await p.fill('#vRef', '0102-5566');
  await p.fill('#vNumero', '7');
  revisar('Bs de la inicial a la tasa', (await p.textContent('#vPagoBs')).includes('3.600,00'));
  revisar('cuotas suman', (await p.textContent('#vSuma')).includes('7 cuotas suman $210,00'));
  await p.fill('#vPapel', '000412');
  await tomarFoto(p, '#vFoto');
  await foto(p, '04-vender');
  await p.click('#vGuardar');
  await p.waitForSelector('.hoja h2:has-text("Venta #1 guardada")');
  await foto(p, '05-venta-guardada');
  await p.click('.hoja [data-resumen]');
  const resumen = await p.evaluate(() => decodeURIComponent(window.__abiertos.pop() || ''));
  revisar('resumen por WhatsApp', resumen.includes('wa.me/584141234567') && resumen.includes('Contrato #1') && resumen.includes('7 semanales de $30,00'), resumen.slice(0, 200));
  await p.click('.hoja [data-imprimir]');
  await p.waitForSelector('.ct');
  await foto(p, '06-contrato');
  revisar('contrato lleno', (await p.textContent('.ct')).includes('Nevera Mabe 14 pies') && (await p.textContent('.ct')).includes('000001'));
  await cerrarHojas(p);
  await p.waitForTimeout(1500);
  revisar('venta en la base', sql("select numero || '/' || total || '/' || pagado || '/' || saldo || '/' || contrato_papel || '/' || (foto_contrato is not null) from ventas") === '1/300.00/90.00/210.00/000412/true');

  // 5. Cliente de Pedraza que ya debía
  await p.click('#navTabs [data-ir="clientes"]');
  await p.click('[data-nuevo]');
  await p.fill('#fNombre', 'Luis Rojas');
  await p.click('#fSede [data-v="pedraza"]');
  await p.fill('#fTelefono', '0426-1112233');
  await p.click('#fGuardar');
  await p.waitForSelector('.ficha-cab');
  await p.click('[data-vender]');
  await p.click('#vTipo [data-t="carga"]');
  await p.fill('#vItems [data-campo="descripcion"]', 'Juego de cuarto');
  await p.fill('#vItems [data-campo="precio"]', '500');
  await p.fill('#vFecha', '2026-07-01');
  await p.fill('#vAntes', '200');
  await p.click('#vFrec [data-f="mensual"]');
  await p.fill('#vNumero', '3');
  await p.fill('#vPrimera', '2026-10-01');
  await p.dispatchEvent('#vPrimera', 'change');
  revisar('cuotas de la carga', (await p.textContent('#vSuma')).includes('3 cuotas suman $300,00'));
  await p.click('#vGuardar');
  await p.waitForSelector('.hoja h2:has-text("Cliente cargado")');
  await cerrarHojas(p);
  revisar('carga en la base', sql("select origen || '/' || plan_base || '/' || saldo from ventas where numero = 2") === 'carga_inicial/200.00/300.00');

  // 6. Cobrar: Luis atrasado
  await p.click('#navTabs [data-ir="cobrar"]');
  await p.waitForTimeout(600);
  const txtCobrar = await p.textContent('#cbListas');
  revisar('Luis aparece atrasado', /Atrasado \$100,00 · \d+ días/.test(txtCobrar), txtCobrar.slice(0, 300));
  await foto(p, '07-cobrar');
  await p.click('.cobro:has-text("Luis Rojas") [data-abonar]');
  await p.waitForSelector('#abMetodos');
  revisar('el abono no trae ningún método marcado y el monto espera', await p.locator('#abMetodos .chip.activo').count() === 0 && await p.isDisabled('#abMonto'));
  await p.click('#abGuardar');
  await p.waitForTimeout(300);
  revisar('sin elegir cómo pagó no guarda', await p.locator('#abMetodos.falta').count() === 1 && await p.locator('.hoja h2:has-text("Abono de")').count() === 1);
  await p.click('#abMetodos [data-m="1"]');
  revisar('al elegir el método se puede escribir el monto', !(await p.isDisabled('#abMonto')) && await p.locator('#abMetodos.falta').count() === 0);
  await p.click('[data-rapido]');
  revisar('botón de lo atrasado', (await p.inputValue('#abMonto')) === '100,00');
  await foto(p, '08-abono');
  await p.click('#abGuardar');
  await p.waitForSelector('.hoja h2:has-text("Abono registrado")');
  await p.click('#agRecibo');
  const recibo = await p.evaluate(() => decodeURIComponent(window.__abiertos.pop() || ''));
  revisar('recibo por WhatsApp', recibo.includes('Recibo de abono') && recibo.includes('Saldo pendiente: *$200,00*'), recibo.slice(0, 300));
  await foto(p, '09-abono-guardado');
  await cerrarHojas(p);

  // 7. Ficha de Ana con la venta abierta
  await p.click('#navTabs [data-ir="clientes"]');
  await p.click('.item:has-text("Ana Pérez")');
  await p.waitForSelector('.venta-det');
  await p.waitForTimeout(800);
  await foto(p, '10-ficha');
  await p.screenshot({ path: path.join(CAPTURAS, '10b-ficha-completa.png'), fullPage: true });
  // Recargo y más tiempo (dueño)
  await p.click('[data-accion="recargo"]');
  await p.fill('#ajMonto', '10'); await p.fill('#ajMotivo', 'Prueba de recargo');
  await p.click('#ajGuardar');
  await p.waitForTimeout(1200);
  revisar('recargo aplicado', sql("select saldo from ventas where numero = 1") === '220.00');
  await p.click('[data-accion="tiempo"]');
  await p.fill('#rpNum', '4'); await p.dispatchEvent('#rpNum', 'input');
  await p.fill('#rpMotivo', 'Pidió más tiempo');
  await p.click('#rpGuardar');
  await p.waitForTimeout(1200);
  revisar('más tiempo: 4 cuotas nuevas', sql("select count(*) from cuotas c join ventas v on v.id = c.venta_id where v.numero = 1 and c.vigente") === '4');

  // 8. Empleado de Pedraza en otro teléfono
  const t2 = await nuevoTelefono(b);
  const e = t2.p;
  await entrar(e, 'pedraza');
  revisar('empleado sin filtros de sede', await e.locator('#cbFiltro').count() === 0);
  await e.click('#navTabs [data-ir="clientes"]');
  const txtE = await e.textContent('#clLista');
  revisar('empleado solo ve Pedraza', txtE.includes('Luis Rojas') && !txtE.includes('Ana Pérez'), txtE);
  await e.click('.item:has-text("Luis Rojas")');
  await e.click('.ficha-cab [data-abonar]');
  await e.click('#abMetodos [data-m="5"]');
  await e.fill('#abMonto', '400');
  revisar('empleado no cambia la tasa', await e.getAttribute('#abTasa', 'readonly') !== null);
  revisar('equivalente en $', (await e.textContent('#abEquiv')).includes('$10,00'));
  await e.click('#abGuardar');
  await e.waitForSelector('.hoja h2:has-text("Abono registrado")');
  await cerrarHojas(e);
  await foto(e, '11-empleado');

  // 9. Sin señal: el abono se guarda en el teléfono y se manda solo al volver
  const antes = sql("select count(*) from abonos");
  await t2.ctx.setOffline(true);
  await e.evaluate(() => window.dispatchEvent(new Event('offline')));
  await e.click('.ficha-cab [data-abonar]');
  await e.click('#abMetodos [data-m="1"]');
  await e.fill('#abMonto', '5');
  await e.click('#abGuardar');
  await e.waitForSelector('.hoja h2:has-text("Guardado en el teléfono")', { timeout: 20000 });
  await foto(e, '12-sin-senal');
  await cerrarHojas(e);
  revisar('aviso de por enviar', (await e.textContent('#chipCola')).includes('1 por enviar'));
  revisar('no llegó a la base sin señal', sql("select count(*) from abonos") === antes);
  await t2.ctx.setOffline(false);
  await e.evaluate(() => window.dispatchEvent(new Event('online')));
  await e.waitForFunction(() => document.getElementById('chipCola').hidden, null, { timeout: 20000 });
  revisar('al volver la señal se envió una sola vez', sql("select count(*) from abonos") === String(Number(antes) + 1));
  // Reintento con la misma clave: no se duplica
  const clave = sql("select grupo from abonos order by id desc limit 1");
  const repetido = await e.evaluate(async (c) => {
    const r = await sb.rpc('registrar_abono', { p: { cliente_id: 2, metodo_id: 1, monto: 5 }, p_clave: c });
    return r.error ? r.error.message : 'ok';
  }, clave);
  revisar('misma clave no duplica', repetido === 'ok' && sql("select count(*) from abonos") === String(Number(antes) + 1));

  // 10. Dueño recibe la entrega de Pedraza
  await p.click('#navTabs [data-mas]');
  await p.click('.hoja [data-ir="efectivo"]');
  await p.waitForSelector('[data-recibir]');
  await foto(p, '13-efectivo-pedraza');
  await p.click('[data-recibir]');
  revisar('esperado del empleado', (await p.textContent('.hoja')).includes('$5,00') && (await p.textContent('.hoja')).includes('Bs 400,00'));
  await p.fill('#enUsd', '5');
  await p.click('#enGuardar');
  await p.waitForTimeout(1200);
  revisar('entrega guardada', sql("select esperado_usd || '/' || esperado_bs || '/' || abonos from entregas") === '5.00/400.00/2');

  // 11. Cobros y Ajustes
  await p.click('#navTabs [data-ir="cobros"]');
  await p.waitForSelector('#coTotales .kpi');
  await foto(p, '14-cobros');
  revisar('cobrado hoy', (await p.textContent('#coTotales')).includes('$205,00'), await p.textContent('#coTotales'));
  await p.click('#navTabs [data-mas]');
  await p.click('.hoja [data-ir="ajustes"]');
  await p.waitForSelector('#ajCond');
  await foto(p, '15-ajustes');
  await p.click('[data-nuevo-usuario]');
  await p.fill('#usNombre', 'Pedro Prueba'); await p.fill('#usUsuario', 'pedro'); await p.fill('#usClave', 'temporal1');
  await p.click('#usGuardar');
  await p.waitForSelector('.hoja h2:has-text("Usuario listo")', { timeout: 15000 });
  revisar('usuario creado', sql("select rol || '/' || sede from usuarios where usuario = 'pedro'") === 'empleado/pedraza');
  revisar('sale con su usuario y su clave temporal', (await p.textContent('.hoja')).includes('pedro') && (await p.textContent('.hoja')).includes('temporal1'));
  await p.click('#deWhatsApp');
  const datosEntrada = await p.evaluate(() => decodeURIComponent(window.__abiertos.pop() || ''));
  revisar('sus datos por WhatsApp: link, usuario, clave y su guía', datosEntrada.includes('localhost:8080/') && datosEntrada.includes('Usuario: *pedro*') &&
    datosEntrada.includes('Clave temporal: *temporal1*') && datosEntrada.includes('guia-empleado.html'), datosEntrada.slice(0, 200));
  await p.click('#deListo');

  // 12. Primera entrada de Daniel: debe poner su clave
  const t3 = await nuevoTelefono(b);
  await entrar(t3.p, 'daniel');
  await t3.p.waitForSelector('.hoja h2:has-text("Pon tu clave")');
  await t3.p.fill('#clave1', 'nueva123'); await t3.p.fill('#clave2', 'nueva123');
  await t3.p.click('#claveGuardar');
  await t3.p.waitForTimeout(800);
  revisar('Daniel cambió su clave', sql("select debe_cambiar_clave from usuarios where usuario = 'daniel'") === 'f');

  // 13. Contrato en blanco
  await p.click('#navTabs [data-mas]');
  await p.click('.hoja [data-contrato-blanco]');
  await p.waitForSelector('.ct');
  await p.setViewportSize({ width: 820, height: 1100 });
  await foto(p, '16-contrato-blanco');
  await p.setViewportSize({ width: 390, height: 844 });
  await cerrarHojas(p);

  // 14. Etapa 2 — mercancía de la tienda de Pedraza
  await p.click('#navTabs [data-mas]');
  await p.click('.hoja [data-ir="mercancia"]');
  await p.waitForSelector('#mcEntrada');
  await p.click('#mcEntrada');
  await p.fill('#emFilas [data-c="nombre"]', 'Licuadora Oster');
  await p.fill('#emFilas [data-c="cantidad"]', '3');
  await p.fill('#emFilas [data-c="costo"]', '25');
  await p.fill('#emFilas [data-c="precio"]', '45');
  await p.fill('#emNota', 'Factura Yumana 1001');
  await foto(p, '17-entrada-mercancia');
  await p.click('#emGuardar');
  await p.waitForTimeout(1500);
  revisar('entrada de mercancía', sql("select e.cantidad from existencias e join productos p on p.id = e.producto_id where p.nombre = 'Licuadora Oster' and e.sede = 'pedraza'") === '3');
  revisar('mercancía en la lista', (await p.textContent('#mcLista')).includes('Licuadora Oster'));
  await foto(p, '18-mercancia');

  // El empleado vende una licuadora de la tienda (la casilla sale marcada sola)
  await e.click('#navTabs [data-mas]');
  await e.click('.hoja [data-actualizar]');
  await e.waitForTimeout(1200);
  await e.click('#navTabs [data-ir="clientes"]');
  await e.click('.item:has-text("Luis Rojas")');
  await e.click('[data-vender]');
  await e.waitForSelector('#vItems');
  await e.fill('#vItems [data-campo="descripcion"]', 'licuadora');
  await e.click('#vItems .sugerencias [data-p]');
  revisar('casilla de la tienda marcada', await e.isChecked('#vItems [data-tienda="pedraza"]'));
  revisar('precio sugerido puesto', (await e.inputValue('#vItems [data-campo="precio"]')) === '45,00');
  await e.click('#vUsarPct');
  await e.click('#vMetodos [data-m="1"]');
  await e.fill('#vNumero', '3');
  await foto(e, '19-venta-desde-tienda');
  await e.click('#vGuardar');
  await e.waitForSelector('.hoja h2:has-text("guardada")');
  await cerrarHojas(e);
  await e.waitForTimeout(800);
  revisar('salió de la tienda', sql("select e.cantidad from existencias e join productos p on p.id = e.producto_id where p.nombre = 'Licuadora Oster' and e.sede = 'pedraza'") === '2' &&
    sql("select sede_salida from venta_items where descripcion = 'Licuadora Oster'") === 'pedraza');

  // Nota de cobro con promesa de pago para hoy
  await e.click('#navTabs [data-ir="clientes"]');
  await e.click('.item:has-text("Luis Rojas")');
  await e.click('[data-nota-nueva]');
  await e.click('#ngTipos [data-t="promesa"]');
  await e.fill('#ngFecha', sql("select (now() at time zone 'America/Caracas')::date"));
  await e.fill('#ngMonto', '50');
  await e.fill('#ngNota', 'Cobra el viernes, pasar en la tarde');
  await e.click('#ngGuardar');
  await e.waitForTimeout(1500);
  revisar('promesa guardada', sql("select tipo || '/' || promesa_monto from gestiones where cliente_id = (select id from clientes where nombre = 'Luis Rojas')") === 'promesa/50.00');
  revisar('promesa en la ficha', (await e.textContent('.ficha-cab')).includes('Prometió $50,00 hoy'));
  await e.click('#navTabs [data-ir="cobrar"]');
  await e.waitForTimeout(500);
  revisar('sección de promesas de hoy', (await e.textContent('#cbListas')).includes('Prometieron pagar hoy'));
  await foto(e, '20-cobrar-promesa');

  // Recordatorio por WhatsApp (queda anotado)
  await e.click('.cobro:has-text("Luis Rojas") [data-recordar]');
  const wa = await e.evaluate(() => decodeURIComponent(window.__abiertos.pop() || ''));
  await e.waitForTimeout(1500);
  revisar('recordatorio abre WhatsApp', wa.includes('wa.me/584261112233') && wa.includes('Electro Montana'), wa.slice(0, 160));
  revisar('recordatorio anotado', sql("select count(*) from gestiones where tipo = 'recordatorio'") === '1');
  await e.click('#navTabs [data-mas]');
  await e.click('.hoja [data-ir="mercancia"]');
  await e.waitForSelector('#mcLista');
  revisar('empleado ve su tienda y anota lo que llega (no la "Entrada" de los dueños)', (await e.textContent('#mcLista')).includes('Licuadora Oster') && (await e.textContent('#mcEntrada')).includes('Anotar mercancía que llegó') && await e.locator('#mcSede').count() === 0);
  await e.click('#navTabs [data-mas]');
  revisar('empleado sin reportes', await e.locator('.hoja [data-ir="reportes"]').count() === 0);
  await cerrarHojas(e);

  // Reportes (dueño)
  await p.click('#navTabs [data-mas]');
  await p.click('.hoja [data-actualizar]');
  await p.waitForTimeout(1200);
  await p.click('#navTabs [data-mas]');
  await p.click('.hoja [data-ir="reportes"]');
  await p.waitForSelector('.barras');
  await p.waitForTimeout(800);
  const rep = await p.textContent('#rpCuerpo');
  revisar('reportes', rep.includes('Cobrado por semana') && rep.includes('Ventas por mes') && rep.includes('Licuadora Oster') && rep.includes('Tienda de Pedraza'), rep.slice(0, 300));
  await foto(p, '21-reportes');
  await p.screenshot({ path: path.join(CAPTURAS, '21b-reportes-completo.png'), fullPage: true });

  // 15. Etapa 3 — contrato firmado en la pantalla (dueño, con fiador)
  await p.click('#navTabs [data-ir="clientes"]');
  await p.click('.item:has-text("Ana Pérez")');
  await p.waitForSelector('.venta-det');
  await p.click('[data-firmar]');
  await p.waitForSelector('.firma-caja canvas');
  revisar('texto de lo que firma', (await p.textContent('.firma-texto')).includes('Ana Pérez') && (await p.textContent('.firma-texto')).includes('Nevera Mabe 14 pies'));
  await p.click('.hoja-pie [data-seguir]');
  revisar('no deja guardar sin firmar', (await p.textContent('#toasts')).includes('Falta la firma del cliente'));
  await firmarConDedo(p);
  await foto(p, '22-firma-cliente');
  await p.click('.hoja-pie [data-seguir]');
  await p.waitForSelector('.hoja h2:has-text("Firma del fiador")');
  revisar('paso del fiador', (await p.textContent('.firma-texto')).includes('Carmen Pérez'));
  await firmarConDedo(p);
  await p.click('.hoja-pie [data-seguir]');
  await p.waitForTimeout(2500);
  revisar('contrato firmado en la base', sql("select (firmado_en is not null)::text || '/' || (firma_fiador like 'cli/%/firma-fiador-%') || '/' || (contrato_firmado->'cliente'->>'nombre') from ventas where numero = 1") === 'true/true/Ana Pérez');
  revisar('firmas subidas al bucket', sql("select count(*) from storage.objects where name like 'cli/%/firma-%'") === '2');
  await p.waitForSelector('.etiqueta:has-text("Firmado en pantalla")');
  await p.click('[data-imprimir]');
  await p.waitForSelector('.ct-firma');
  await p.waitForTimeout(800);
  revisar('contrato con las dos firmas', await p.locator('.hoja .ct-firma').count() === 2 && (await p.textContent('.hoja .ct')).includes('Firmado en la pantalla'));
  await p.waitForFunction(() => Array.from(document.querySelectorAll('.hoja .ct-firma')).every(i => i.complete), null, { timeout: 10000 });
  revisar('las firmas se ven (imagen real)', await p.evaluate(() => Array.from(document.querySelectorAll('.hoja .ct-firma')).every(i => i.naturalWidth > 50 && i.naturalHeight > 10)));
  // Contrato en PDF (en la computadora se descarga; en el teléfono abre Compartir → WhatsApp)
  await p.waitForSelector('#ctPdf:not([disabled]):has-text("PDF")', { timeout: 15000 });
  const [descarga] = await Promise.all([p.waitForEvent('download'), p.click('#ctPdf')]);
  const rutaPdf = path.join(CAPTURAS, descarga.suggestedFilename());
  await descarga.saveAs(rutaPdf);
  const infoPdf = execFileSync('pdfinfo', [rutaPdf]).toString(), imgsPdf = execFileSync('pdfimages', ['-list', rutaPdf]).toString().trim().split('\n').length - 2;
  const textoPdf = execFileSync('pdftotext', [rutaPdf, '-']).toString();
  revisar('PDF del contrato: una hoja carta con las dos firmas', /Pages:\s+1\b/.test(infoPdf) && /612 x 792/.test(infoPdf) && imgsPdf === 2, infoPdf.replace(/\n/g, ' ') + ' imágenes: ' + imgsPdf);
  revisar('PDF con los datos y el nombre del archivo', /^contrato-000001-ana-perez\.pdf$/.test(descarga.suggestedFilename()) && textoPdf.includes('Ana Pérez') && textoPdf.includes('Firmado en la pantalla') && textoPdf.includes('NO SE DEVUELVE DINERO'), descarga.suggestedFilename());
  await p.setViewportSize({ width: 820, height: 1100 });
  await p.locator('.hoja .ct-firmas').scrollIntoViewIfNeeded();
  await foto(p, '23-contrato-firmado');
  await p.setViewportSize({ width: 390, height: 844 });
  await cerrarHojas(p);

  // Sin señal: el empleado firma la venta de la licuadora y la firma sube sola al volver
  await e.click('#navTabs [data-ir="clientes"]');
  await e.click('.item:has-text("Luis Rojas")');
  await e.waitForSelector('.ficha-cab');
  const abrirLic = e.locator('.venta-cab:has-text("Licuadora")');
  if (!(await e.locator('[data-firmar]').count())) await abrirLic.click();
  await e.waitForSelector('[data-firmar]');
  await t2.ctx.setOffline(true);
  await e.evaluate(() => window.dispatchEvent(new Event('offline')));
  await e.click('[data-firmar]');
  await e.waitForSelector('.firma-caja canvas');
  await firmarConDedo(e);
  await e.click('.hoja-pie [data-seguir]');
  await e.waitForTimeout(800);
  await e.waitForSelector('.velo', { state: 'detached', timeout: 30000 });
  revisar('firma guardada sin señal', (await e.textContent('#chipCola')).includes('por enviar') && sql("select count(*) from ventas where firmado_en is not null") === '1');
  await foto(e, '24-firma-sin-senal');
  await t2.ctx.setOffline(false);
  await e.evaluate(() => window.dispatchEvent(new Event('online')));
  await e.waitForFunction(() => document.getElementById('chipCola').hidden, null, { timeout: 30000 });
  revisar('al volver la señal se firmó', sql("select count(*) from ventas where firmado_en is not null and firma_fiador is null") === '1');

  // Recordar a varios: al tocar Enviar queda "Enviado" enseguida (sin esperar a la base)
  sql(`select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);
       select public.registrar_venta(jsonb_build_object('cliente_id', (select id from clientes where nombre = 'Ana Pérez'), 'origen', 'carga_inicial',
         'fecha', ((now() at time zone 'America/Caracas')::date - 60)::text, 'pagado_antes', 10, 'frecuencia', 'mensual',
         'items', '[{"descripcion":"Plancha","precio":60}]'::jsonb,
         'cuotas', jsonb_build_array(jsonb_build_object('fecha', ((now() at time zone 'America/Caracas')::date - 20)::text, 'monto', 50))))`);
  await p.click('#navTabs [data-mas]');
  await p.click('.hoja [data-actualizar]');
  await p.waitForTimeout(1500);
  await p.click('#navTabs [data-mas]');
  await p.click('.hoja [data-recordatorios]');
  await p.waitForSelector('.hoja [data-enviar]');
  const antesEnv = await p.locator('.hoja .etiqueta.e-verde').count();
  await p.click('.hoja [data-enviar] >> nth=0');
  await p.waitForTimeout(150);
  revisar('recordatorio marcado Enviado al instante', await p.locator('.hoja .etiqueta.e-verde').count() === antesEnv + 1);
  await p.waitForTimeout(1500);
  revisar('sigue Enviado después de guardarse', await p.locator('.hoja .etiqueta.e-verde').count() === antesEnv + 1);
  await cerrarHojas(p);

  // Copia de seguridad (dueño): aviso en Cobrar, archivo completo y lista para Excel
  await p.click('#navTabs [data-ir="cobrar"]');
  await p.waitForTimeout(500);
  revisar('aviso de copia pendiente', await p.locator('[data-ir-copia]').count() === 1);
  await p.click('[data-ir-copia]');
  await p.waitForSelector('#ajCopia');
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('#ajCopia')]);
  const copia = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  revisar('copia completa con todo', copia.sistema === 'Electro Montana' && copia.datos.clientes.length === Number(sql("select count(*) from clientes")) &&
    copia.datos.abonos.length === Number(sql("select count(*) from abonos")) && copia.datos.cuotas.length === Number(sql("select count(*) from cuotas")) &&
    /^electromontana-copia-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()), JSON.stringify(copia.conteo));
  await p.waitForTimeout(800);
  revisar('copia anotada en la base', sql("select (ultima_copia_en is not null)::text from config") === 'true');
  const [dl2] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.click('#ajCsv')]);
  const csv = fs.readFileSync(await dl2.path(), 'utf8');
  revisar('lista para Excel', csv.includes('Ana Pérez') && csv.split('\r\n')[0].includes('Debe $;Atrasado $'));
  await p.click('#navTabs [data-ir="cobrar"]');
  await p.waitForTimeout(500);
  revisar('ya no pide copia', await p.locator('[data-ir-copia]').count() === 0);

  // Salir con algo por enviar: no se pierde; se envía al volver a entrar
  const antesSalir = sql("select count(*) from abonos");
  await t2.ctx.setOffline(true);
  await e.evaluate(() => window.dispatchEvent(new Event('offline')));
  await e.click('#navTabs [data-ir="clientes"]');
  await e.click('.item:has-text("Luis Rojas")');
  await e.click('.ficha-cab [data-abonar]');
  await e.click('#abMetodos [data-m="1"]');
  await e.fill('#abMonto', '3');
  await e.click('#abGuardar');
  await e.waitForSelector('.hoja h2:has-text("Guardado en el teléfono")', { timeout: 20000 });
  await cerrarHojas(e);
  await e.click('#navTabs [data-mas]');
  await e.click('.hoja [data-salir]');
  await e.waitForSelector('#cfSi');
  revisar('al salir avisa que no se pierde', (await e.textContent('.hoja')).includes('No se pierden'));
  await e.click('#cfSi');
  await e.waitForSelector('#pantallaLogin:not([hidden])', { timeout: 15000 });
  await t2.ctx.setOffline(false);
  await entrar(e, 'pedraza');
  await e.waitForFunction(() => document.getElementById('chipCola').hidden, null, { timeout: 30000 });
  revisar('lo de antes de salir se envió al volver', sql("select count(*) from abonos") === String(Number(antesSalir) + 1));

  // El encargado de Pedraza anota la mercancía que llegó (sin costos) y vende de contado
  await e.click('#navTabs [data-mas]');
  await e.click('.hoja [data-ir="mercancia"]');
  await e.waitForSelector('#mcEntrada');
  revisar('el empleado tiene "Anotar mercancía que llegó"', (await e.textContent('#mcEntrada')).includes('Anotar mercancía que llegó'));
  await e.click('#mcEntrada');
  await e.waitForSelector('#emFilas');
  revisar('sin costo ni otra tienda en su formulario', await e.locator('#emFilas [data-c="costo"]').count() === 0 && await e.locator('#emSede').count() === 0);
  await e.fill('#emFilas [data-c="nombre"]', 'Plancha Oster');
  await e.fill('#emFilas [data-c="cantidad"]', '2');
  await e.fill('#emFilas [data-c="precio"]', '28');
  await e.click('#emGuardar');
  await e.waitForTimeout(1500);
  revisar('la mercancía quedó en Pedraza, a su nombre y sin costo', sql("select e.cantidad || '/' || p.precio_sugerido || '/' || (select count(*) from producto_costos c where c.producto_id = p.id) || '/' || (select u.usuario from movimientos_inventario m join usuarios u on u.id = m.usuario_id where m.producto_id = p.id limit 1) from productos p join existencias e on e.producto_id = p.id and e.sede = 'pedraza' where p.nombre = 'Plancha Oster'") === '2/28.00/0/pedraza');
  await cerrarHojas(e);
  await e.click('#navTabs [data-ir="vender"]');
  await e.waitForSelector('#vForma');
  await e.click('#vForma [data-c="1"]');
  revisar('el empleado no elige de quién es la venta (es suya)', await e.locator('#vVendChips').count() === 0);
  revisar('de contado: sin cuotas ni contrato', await e.locator('#vCardCuotas').isHidden() && await e.locator('#vCardContrato').isHidden());
  await e.click('#vCliente [data-elegir]');
  await e.fill('#ecBusca', 'Luis');
  await e.waitForTimeout(400);
  await e.click('#ecLista [data-ref]:has-text("Luis Rojas")');
  await e.fill('#vItems [data-campo="descripcion"]', 'plancha');
  await e.click('#vItems .sugerencias [data-p]');
  await e.click('#vMetodos [data-m="1"]');
  await e.click('#vGuardar');
  await e.waitForSelector('.hoja h2:has-text("Venta de contado")', { timeout: 20000 });
  await foto(e, '24b-contado');
  revisar('venta de contado pagada, salió de la tienda y el efectivo es del empleado', sql("select v.frecuencia || '/' || v.estado || '/' || v.saldo || '/' || (select cantidad from existencias where producto_id = (select id from productos where nombre = 'Plancha Oster') and sede = 'pedraza') || '/' || (select u.usuario from abonos a join usuarios u on u.id = a.recibido_por where a.venta_id = v.id) from ventas v order by v.id desc limit 1") === 'contado/pagada/0.00/1/pedraza');
  await e.click('.hoja [data-resumen]');
  const reciboContado = await e.evaluate(() => decodeURIComponent(window.__abiertos.pop() || ''));
  revisar('recibo de contado por WhatsApp', reciboContado.includes('Pagó completo') && reciboContado.includes('$28,00'), reciboContado.slice(0, 160));
  await cerrarHojas(e);

  // Seguridad entre socios: Franklin pide anular un abono; no cambia nada hasta que Daniel lo aprueba desde su teléfono
  await p.click('#navTabs [data-ir="clientes"]');
  await p.click('.item:has-text("Ana Pérez")');
  await p.waitForSelector('.ficha-cab');
  await p.waitForSelector('[data-grupo]', { timeout: 15000 });
  const grupoAna = await p.locator('[data-grupo]').first().getAttribute('data-grupo');
  const saldoAntes = sql("select sum(saldo) from ventas where cliente_id = (select id from clientes where nombre = 'Ana Pérez') and estado <> 'anulada'");
  await p.locator('[data-grupo]').first().click();
  await p.click('#daAnular');
  await p.waitForSelector('#cfValor');
  revisar('anular pide la aprobación del otro socio', (await p.textContent('.hoja:has(#cfValor)')).includes('Daniel'));
  await p.fill('#cfValor', 'Lo anoté dos veces');
  await p.click('#cfSi');
  await p.waitForTimeout(1500);
  revisar('pedido guardado; el abono sigue vivo', sql("select count(*) from solicitudes where estado = 'pendiente' and tipo = 'anular_abono'") === '1' &&
    sql("select count(*) from abonos where grupo = '" + grupoAna + "' and anulado_en is null") !== '0');
  await cerrarHojas(p);
  const tDaniel = await nuevoTelefono(b);
  const d = tDaniel.p;
  await d.goto(URL_APP);   // Daniel ya cambió su clave más arriba
  await d.fill('#loginUsuario', 'daniel');
  await d.fill('#loginClave', 'nueva123');
  await d.click('#btnEntrar');
  await d.waitForSelector('#app:not([hidden])');
  await d.waitForSelector('[data-aprobaciones]', { timeout: 15000 });
  revisar('Daniel ve el aviso en Cobrar', (await d.textContent('[data-aprobaciones]')).includes('espera tu aprobación'));
  await d.click('[data-aprobaciones]');
  await d.waitForSelector('[data-aprobar]');
  await foto(d, '25-aprobaciones');
  revisar('lo que pidió Franklin, con el motivo', (await d.textContent('.hoja')).includes('Lo anoté dos veces') && (await d.textContent('.hoja')).includes('Franklin'));
  await d.click('[data-aprobar]');
  await d.click('#cfSi');
  await d.waitForFunction(() => !document.querySelector('[data-aprobar]'), null, { timeout: 15000 });
  revisar('aprobado: el abono quedó anulado y la deuda subió', sql("select count(*) from abonos where grupo = '" + grupoAna + "' and anulado_en is null") === '0' &&
    Number(sql("select sum(saldo) from ventas where cliente_id = (select id from clientes where nombre = 'Ana Pérez') and estado <> 'anulada'")) > Number(saldoAntes) &&
    sql("select estado || '/' || (select usuario from usuarios where id = resuelta_por) from solicitudes where tipo = 'anular_abono'") === 'aprobada/daniel');
  await d.click('.hoja [data-historial]');
  await d.waitForSelector('.hoja h2:has-text("Historial de cambios")');
  await d.waitForFunction(() => /Anuló un abono/.test(document.body.textContent), null, { timeout: 15000 });
  await foto(d, '26-historial');
  const txtHist = await d.textContent('.hoja:has(h2:has-text("Historial"))');
  revisar('historial: quién pidió, quién aprobó y la anulación', txtHist.includes('Anuló un abono') && txtHist.includes('Pidió: anular un abono') && txtHist.includes('Aprobó: anular un abono'));
  revisar('historial: el cambio hecho por fuera de la app también sale', txtHist.includes('Cambio hecho por fuera de la app'));
  await tDaniel.ctx.close();

  // Botón Volver y "atrás" del teléfono
  await p.click('#navTabs [data-ir="clientes"]');
  await p.click('.item:has-text("Ana Pérez")');
  await p.waitForSelector('.ficha-cab');
  revisar('en la ficha está el botón Volver', await p.locator('#btnVolver').isVisible());
  const anotoAna = sql("select u.nombre from clientes c join usuarios u on u.id = c.creado_por where c.nombre = 'Ana Pérez'");
  revisar('la ficha dice quién anotó al cliente', (await p.textContent('.ficha-cab')).includes('Lo anotó ' + anotoAna + ' el '), anotoAna);
  await p.click('#btnVolver');
  await p.waitForSelector('#clBusca');
  revisar('Volver regresa a la lista de clientes', (await p.evaluate(() => location.hash)) === '#clientes');
  await p.click('.item:has-text("Ana Pérez")');
  await p.waitForSelector('.ficha-cab');
  await p.goBack();
  await p.waitForSelector('#clBusca');
  revisar('el "atrás" del teléfono también', (await p.evaluate(() => location.hash)) === '#clientes');
  await p.click('.item:has-text("Ana Pérez")');
  await p.click('.ficha-cab [data-abonar]');
  await p.waitForSelector('.velo');
  await p.goBack();
  await p.waitForTimeout(500);
  revisar('con una ventana abierta, "atrás" la cierra y se queda en el cliente', await p.locator('.velo').count() === 0 && (await p.evaluate(() => location.hash)).startsWith('#cliente/'));

  // De quién es el crédito: Franklin anota una venta a nombre de Daniel, después pide pasarla a él y Daniel lo aprueba
  await p.click('.seccion [data-vender]');
  await p.waitForSelector('#vVendChips');
  revisar('el dueño elige de quién es el crédito (de entrada, suyo)', (await p.textContent('#vVendedor')).includes('¿De quién es este crédito?') &&
    (await p.textContent('#vVendChips .chip.activo')) === 'Franklin');
  await p.click('#vVendChips .chip:has-text("Daniel")');
  await p.fill('#vItems [data-campo="descripcion"]', 'Microondas');
  await p.fill('#vItems [data-campo="precio"]', '120');
  await foto(p, '27-de-quien');
  await p.click('#vGuardar');
  await p.waitForSelector('.hoja h2:has-text("guardada")', { timeout: 20000 });
  revisar('al guardar dice de quién quedó', (await p.textContent('.hoja')).includes('Crédito de Daniel'));
  const idMicro = sql("select id from ventas where total = 120 order by id desc limit 1");
  const deQuien = () => sql("select u.usuario || '/' || (select usuario from usuarios where id = v.creado_por) from ventas v join usuarios u on u.id = v.vendedor_id where v.id = " + idMicro);
  revisar('en la base: de Daniel, la anotó Franklin', deQuien() === 'daniel/franklin');
  await p.click('.hoja [data-ver]');
  await p.waitForSelector('[data-venta="' + idMicro + '"]');
  revisar('la ficha muestra de quién es y quién la anotó', (await p.textContent('[data-venta="' + idMicro + '"]')).includes('Crédito de Daniel · la anotó Franklin'));
  await p.click('[data-venta="' + idMicro + '"] .venta-cab');
  await p.click('[data-venta="' + idMicro + '"] [data-accion="vendedor"]');
  await p.waitForSelector('#cvGente');
  await p.click('#cvGente .chip:has-text("Franklin")');
  await p.fill('#cvMotivo', 'La vendí yo');
  await p.click('#cvGuardar');
  await p.waitForTimeout(1500);
  revisar('pedido; sigue de Daniel hasta que él lo apruebe', sql("select count(*) from solicitudes where estado = 'pendiente' and tipo = 'cambiar_vendedor'") === '1' && deQuien() === 'daniel/franklin');
  const tDaniel2 = await nuevoTelefono(b);
  const d2 = tDaniel2.p;
  await d2.goto(URL_APP);
  await d2.fill('#loginUsuario', 'daniel');
  await d2.fill('#loginClave', 'nueva123');
  await d2.click('#btnEntrar');
  await d2.waitForSelector('[data-aprobaciones]', { timeout: 15000 });
  await d2.click('[data-aprobaciones]');
  await d2.waitForSelector('[data-aprobar]');
  revisar('Daniel ve qué se pasa y a quién', (await d2.textContent('.hoja')).includes('de Daniel a Franklin'));
  await d2.click('[data-aprobar]');
  await d2.click('#cfSi');
  await d2.waitForFunction(() => !document.querySelector('[data-aprobar]'), null, { timeout: 15000 });
  revisar('aprobado: el crédito es de Franklin y queda en el historial de la venta', deQuien() === 'franklin/franklin' &&
    sql("select count(*) from eventos_venta where tipo = 'vendedor' and venta_id = " + idMicro) === '1');
  await tDaniel2.ctx.close();
  await p.click('#navTabs [data-ir="clientes"]');
  revisar('filtro por persona en Clientes', await p.locator('#clFiltro .chip:has-text("De Franklin")').count() === 1);
  await p.click('#clFiltro .chip:has-text("De Franklin")');
  revisar('con el filtro sale Ana Pérez', await p.locator('#clLista .item:has-text("Ana Pérez")').count() === 1);
  await p.click('#clFiltro .chip:has-text("Todos")');
  await p.click('#navTabs [data-mas]');
  await p.click('.hoja [data-ir="reportes"]');
  await p.waitForSelector('h2:has-text("De quién son los créditos")', { timeout: 15000 });
  revisar('Reportes: cuánto le deben a cada uno', (await p.textContent('.seccion:has(h2:has-text("De quién son"))')).includes('Franklin'));

  // Gastos (solo dueños; cada socio anota los suyos): gasolina en efectivo, alquiler en bolívares, repetir y anular
  const gasto = q => sql("select g.monto_usd || '/' || c.nombre || '/' || coalesce(g.sede, 'los dos') || '/' || u.usuario || '/' || (g.anulado_en is not null) from gastos g join categorias_gasto c on c.id = g.categoria_id join usuarios u on u.id = g.pagado_por where " + q + " order by g.id desc limit 1");
  await p.click('#navTabs [data-mas]');
  await p.click('.hoja [data-ir="gastos"]');
  await p.waitForSelector('[data-nuevo]');
  await p.click('[data-nuevo]');
  await p.waitForSelector('#gaCats [data-cat]');
  await p.click('#gaGuardar');
  await p.waitForTimeout(300);
  revisar('gasto: sin decir en qué no guarda', await p.locator('#gaCats.falta').count() === 1);
  await p.click('#gaCats [data-cat]:has-text("Gasolina")');
  await p.click('#gaSede [data-v="socopo"]');
  revisar('gasto: el monto espera al método', await p.isDisabled('#gaMonto'));
  await p.click('#gaMetodos [data-m="1"]');
  await p.fill('#gaMonto', '20');
  await p.click('#gaGuardar');
  await p.waitForFunction(() => !document.querySelector('#gaGuardar'), null, { timeout: 15000 });
  revisar('gasolina anotada: $20, Socopó, la pagó Franklin', gasto("c.nombre = 'Gasolina'") === '20.00/Gasolina/socopo/franklin/false');
  await p.click('[data-nuevo]');
  await p.click('#gaCats [data-cat]:has-text("Alquiler")');
  await p.fill('#gaDesc', 'Local de Pedraza');
  await p.click('#gaSede [data-v="pedraza"]');
  await p.click('#gaMetodos [data-m="4"]');
  await p.fill('#gaMonto', '4000');
  revisar('alquiler en bolívares: dice cuánto es en dólares', (await p.textContent('#gaEquiv')).includes('$100,00'), await p.textContent('#gaEquiv'));
  revisar('el gasto queda a nombre de quien lo anota (no se elige)', await p.locator('#gaQuien').count() === 0 && (await p.textContent('.hoja')).includes('Queda a nombre de Franklin'));
  await foto(p, '28-gasto');
  await p.click('#gaGuardar');
  await p.waitForFunction(() => !document.querySelector('#gaGuardar'), null, { timeout: 15000 });
  revisar('alquiler anotado: $100, Pedraza, de Franklin', gasto("c.nombre = 'Alquiler'") === '100.00/Alquiler/pedraza/franklin/false');
  await p.waitForTimeout(400);
  revisar('Gastos abre con los de Franklin: $120', (await p.textContent('#gsQuien .activo')).includes('Franklin') && (await p.textContent('#vista')).includes('Gastos de Franklin en el mes') && (await p.textContent('#vista')).includes('$120,00'), (await p.textContent('#vista')).slice(0, 200));
  await foto(p, '29-gastos');
  await p.click('#gsQuien button:has-text("Daniel")');
  revisar('los de Daniel por separado (no tiene)', (await p.textContent('#vista')).includes('Daniel no tiene gastos'));
  await p.click('#gsQuien [data-quien="todos"]');
  revisar('los dos juntos', (await p.textContent('#vista')).includes('Gastos de los dos en el mes') && (await p.textContent('#vista')).includes('De cada socio'));
  await p.click('#gsQuien button:has-text("Franklin")');
  await p.click('[data-gasto]:has-text("Alquiler")');
  await p.click('#dgRepetir');
  await p.waitForSelector('#gaGuardar');
  revisar('repetir trae el mismo gasto', await p.locator('#gaCats .chip.activo:has-text("Alquiler")').count() === 1 && (await p.inputValue('#gaMonto')) === '4000,00', await p.inputValue('#gaMonto'));
  await cerrarHojas(p);
  await p.click('[data-gasto]:has-text("Gasolina")');
  await p.click('#dgAnular');
  await p.fill('#cfValor', 'Era de prueba');
  await p.click('#cfSi');
  await p.waitForTimeout(1500);
  revisar('anular el gasto que anotó él', gasto("c.nombre = 'Gasolina'") === '20.00/Gasolina/socopo/franklin/true');
  await p.click('#navTabs [data-mas]');
  await p.click('.hoja [data-ir="reportes"]');
  await p.waitForSelector('.kpis');
  const kp = await p.textContent('.kpis');
  revisar('Reportes: gastos del mes y ganancia neta', kp.includes('Gastos del mes') && kp.includes('$100,00') && kp.includes('Ganancia neta'), kp.slice(0, 300));
  await e.click('#navTabs [data-mas]');
  revisar('el encargado no ve Gastos', await e.locator('.hoja [data-ir="gastos"]').count() === 0);
  await cerrarHojas(e);

  // Sin señal y con el permiso de la sesión vencido (la app estuvo cerrada más de 1 hora): abre igual con
  // lo del teléfono, guarda en la cola, y al volver la señal renueva la sesión y envía.
  const antesVencida = sql("select count(*) from abonos");
  await e.waitForTimeout(1500);   // la copia del teléfono se guarda un momento después de cargar
  await t2.ctx.setOffline(true);
  await e.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('electromontana-sesion'));
    s.expires_at = Math.floor(Date.now() / 1000) - 600;
    localStorage.setItem('electromontana-sesion', JSON.stringify(s));
  });
  await e.reload();
  await e.waitForSelector('#app:not([hidden])', { timeout: 10000 });
  revisar('sin señal y sesión vencida: abre con lo del teléfono (no pide la clave)', await e.locator('#pantallaLogin:not([hidden])').count() === 0);
  await e.evaluate(() => window.dispatchEvent(new Event('offline')));
  await e.click('#navTabs [data-ir="clientes"]');
  await e.click('.item:has-text("Luis Rojas")');
  await e.click('.ficha-cab [data-abonar]');
  await e.click('#abMetodos [data-m="1"]');
  await e.fill('#abMonto', '2');
  await e.click('#abGuardar');
  await e.waitForSelector('.hoja h2:has-text("Guardado en el teléfono")', { timeout: 20000 });
  await cerrarHojas(e);
  await t2.ctx.setOffline(false);
  await e.evaluate(() => window.dispatchEvent(new Event('online')));
  await e.waitForFunction(() => document.getElementById('chipCola').hidden, null, { timeout: 60000 });
  revisar('al volver la señal renovó la sesión y envió (sin darlo por rechazado)', sql("select count(*) from abonos") === String(Number(antesVencida) + 1));

  // Cuadre final en la base
  revisar('cuadre de todas las ventas', sql(`select count(*) from ventas v where v.estado <> 'anulada' and (
    abs(v.plan_base + coalesce((select sum(monto) from cuotas q where q.venta_id = v.id and q.vigente), 0) - (v.total + v.ajuste)) > 0.004
    or abs(v.pagado - coalesce((select sum(monto_usd) from abonos a where a.venta_id = v.id and a.anulado_en is null), 0)) > 0.004)`) === '0');
  revisar('sin errores en la consola', errores.length === 0, errores.join(' | '));
  await b.close();
  console.log('----\nok: ' + ok + '   fallas: ' + mal + '\nCapturas en ' + CAPTURAS);
  process.exit(mal ? 1 : 0);
})().catch(e => { console.error('!!! se detuvo:', e.message, '\n', errores.join('\n')); process.exit(2); });
