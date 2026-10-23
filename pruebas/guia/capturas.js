// Capturas para la guía de uso (copia LOCAL con datos inventados)
const { chromium } = require('playwright');
const path = require('path');
const OUT = process.argv[2];
const URL_APP = 'http://localhost:8080/';
const espera = ms => new Promise(r => setTimeout(r, ms));
async function tel(b) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    timezoneId: 'America/Caracas', locale: 'es-VE', geolocation: { latitude: 8.2312, longitude: -70.8201 }, permissions: ['geolocation'] });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('ERROR pagina:', e.message));
  await p.addInitScript(() => {
    window.open = function () { return null; };
    // Como en el iPhone: "Compartir" con archivos (Chromium de Linux no lo trae)
    navigator.canShare = function () { return true; };
    navigator.share = function () { return Promise.resolve(); };
    // y dedo, no ratón (al firmar con page.mouse, Chromium deja de decir que es táctil)
    var mm = window.matchMedia.bind(window);
    window.matchMedia = function (q) { return /pointer:\s*coarse/.test(q) ? { matches: true, media: q, addEventListener: function () {}, removeEventListener: function () {} } : mm(q); };
  });
  return { ctx, p };
}
async function sinToasts(p) { await p.addStyleTag({ content: '.toasts{display:none!important}' }); }
async function foto(p, n) { await espera(350); await p.screenshot({ path: path.join(OUT, n + '.jpg'), type: 'jpeg', quality: 74 }); console.log('foto', n); }
async function fotoEl(loc, n) { await espera(250); await loc.screenshot({ path: path.join(OUT, n + '.jpg'), type: 'jpeg', quality: 74 }); console.log('foto', n); }
async function entrar(p, u) {
  await p.goto(URL_APP);
  await p.fill('#loginUsuario', u); await p.fill('#loginClave', 'prueba123'); await p.click('#btnEntrar');
  await p.waitForSelector('#app:not([hidden])'); await sinToasts(p); await espera(900);
}
async function cerrar(p) { while (await p.locator('.velo').count()) { await p.locator('.velo [data-cerrar]').last().click(); await espera(200); } }
async function mas(p, sel) { await p.click('#navTabs [data-mas]'); await p.click('.hoja ' + sel); await espera(700); }
async function cliente(p, nombre) { await p.click('#navTabs [data-ir="clientes"]'); await espera(300); await p.click('.item:has-text("' + nombre + '")'); await p.waitForSelector('.ficha-cab'); await espera(700); }
async function firmar(p) {
  const box = await p.locator('.firma-caja canvas').boundingBox();
  const pts = [[30,160],[45,110],[60,150],[75,100],[95,165],[110,120],[130,150],[150,115],[175,150],[200,125],[230,140],[260,120],[300,135]];
  await p.mouse.move(box.x + pts[0][0], box.y + pts[0][1]); await p.mouse.down();
  for (const [x, y] of pts.slice(1)) await p.mouse.move(box.x + x, box.y + y, { steps: 4 });
  await p.mouse.up();
  await p.mouse.move(box.x + 60, box.y + 185); await p.mouse.down(); await p.mouse.move(box.x + 280, box.y + 175, { steps: 10 }); await p.mouse.up();
}

(async () => {
  const b = await chromium.launch();
  const { p } = await tel(b);
  await p.goto(URL_APP); await p.waitForSelector('#pantallaLogin:not([hidden])'); await foto(p, '01-entrada');
  await entrar(p, 'franklin');
  await foto(p, '02-cobrar');
  await p.evaluate(() => { const el = Array.from(document.querySelectorAll('.seccion-tit')).find(x => x.textContent.includes('Atrasados')); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70); }); await foto(p, '03-cobrar-listas');
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.click('#chipTasa'); await p.waitForSelector('#tasaNueva'); await foto(p, '04-tasa'); await cerrar(p);

  // Abono
  await p.click('.cobro:has-text("María González") [data-abonar]'); await p.waitForSelector('#abMetodos');
  await p.click('#abMetodos [data-m="4"]'); await p.fill('#abMonto', '3200'); await p.dispatchEvent('#abMonto', 'input'); await p.fill('#abRef', '0102-4455');
  await foto(p, '05-abono');
  await p.click('#abGuardar'); await p.waitForSelector('.hoja h2:has-text("Abono registrado")'); await foto(p, '06-abono-guardado'); await cerrar(p);

  // Nota y recordatorios
  await p.click('.cobro:has-text("Jesús Contreras") [data-nota]'); await p.click('#ngTipos [data-t="promesa"]');
  await p.fill('#ngNota', 'Dice que cobra el viernes'); await foto(p, '07-nota-promesa'); await cerrar(p);
  await mas(p, '[data-recordatorios]'); await foto(p, '08-recordatorios'); await cerrar(p);
  await p.click('#navTabs [data-mas]'); await espera(400); await foto(p, '09-menu-mas'); await cerrar(p);

  // Clientes
  await p.click('#navTabs [data-ir="clientes"]'); await espera(600); await foto(p, '10-clientes');
  await p.click('[data-nuevo]'); await p.waitForSelector('#fNombre');
  await p.fill('#fNombre', 'Daniela Torres'); await p.fill('#fCedula', '23456789'); await p.fill('#fTelefono', '0414-5550909');
  await p.fill('#fSector', 'El Progreso'); await p.fill('#fDireccion', 'Calle 9, casa 3'); await p.fill('#fReferencia', 'Frente a la cancha');
  await foto(p, '11-cliente-nuevo'); await cerrar(p);
  await cliente(p, 'Jesús Contreras'); await foto(p, '12-ficha');
  await p.locator('.venta').first().scrollIntoViewIfNeeded();
  await fotoEl(p.locator('.venta').first(), '13-ficha-venta');
  const cambios = p.locator('h3:has-text("Cambios")');
  await cambios.scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, 200)); await foto(p, '14-cambios-dueno');
  await cliente(p, 'María González');
  await p.locator('.seccion-tit:has-text("Notas de cobro")').scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, -10));
  await fotoEl(p.locator('.seccion:has(.seccion-tit:has-text("Notas de cobro"))'), '15-notas');

  // Vender desde la tienda (Rosa Pérez, Pedraza)
  await cliente(p, 'Rosa Pérez');
  await p.click('[data-vender]'); await p.waitForSelector('#vItems');
  await p.fill('#vItems [data-campo="descripcion"]', 'cocina'); await p.click('#vItems .sugerencias [data-p]');
  await p.click('#vItems [data-tienda="pedraza"]');
  await foto(p, '16-vender');
  await p.click('#vUsarPct'); await p.click('#vMetodos [data-m="1"]'); await p.fill('#vNumero', '6'); await p.dispatchEvent('#vNumero', 'input');
  await p.locator('#vCuotas').scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, -80)); await foto(p, '17-vender-cuotas');
  await p.click('#vGuardar'); await p.waitForSelector('.hoja h2:has-text("guardada")'); await foto(p, '18-venta-guardada');
  await p.click('.hoja [data-firmar]'); await p.waitForSelector('.firma-caja canvas'); await firmar(p); await foto(p, '19-firma');
  await p.click('.hoja-pie [data-seguir]'); await espera(2500); await cerrar(p);
  await cliente(p, 'Rosa Pérez');
  const vr = p.locator('.venta-cab:has-text("Cocina")'); if (!(await p.locator('.venta-det:has-text("Cocina")').count())) await vr.click();
  await espera(500); await p.click('.venta:has-text("Cocina") [data-imprimir]'); await p.waitForSelector('.ct-firma'); await espera(1200);
  await foto(p, '20-contrato');
  await p.locator('.hoja .ct-firmas').scrollIntoViewIfNeeded(); await foto(p, '21-contrato-firmas'); await cerrar(p);

  // Ya debía
  await p.click('#navTabs [data-ir="vender"]'); await espera(500); await p.click('#vTipo [data-t="carga"]'); await espera(300); await foto(p, '22-ya-debia');

  // Cobros, mercancía, reportes, ajustes
  await p.click('#navTabs [data-ir="cobros"]'); await p.waitForSelector('#coTotales .kpi'); await espera(600); await foto(p, '23-cobros');
  await mas(p, '[data-ir="mercancia"]'); await foto(p, '24-mercancia');
  await p.click('#mcEntrada'); await p.fill('#emFilas [data-c="nombre"]', 'Ventilador'); await p.click('#emFilas .sugerencias [data-p]');
  await p.fill('#emFilas [data-c="cantidad"]', '4'); await p.dispatchEvent('#emFilas [data-c="cantidad"]', 'input'); await p.fill('#emNota', 'Factura Yumana 2088');
  await foto(p, '25-entrada'); await cerrar(p);
  await p.click('.item:has-text("Cocina 4 hornillas")'); await espera(900); await foto(p, '26-producto'); await cerrar(p);
  await mas(p, '[data-ir="reportes"]'); await p.waitForSelector('.barras'); await espera(800); await foto(p, '27-reportes');
  await p.locator('.seccion-tit:has-text("Ventas por mes")').scrollIntoViewIfNeeded(); await foto(p, '28-reportes-ventas');
  await mas(p, '[data-ir="gastos"]'); await p.waitForSelector('[data-nuevo]'); await espera(400); await foto(p, '43-gastos');
  await p.click('[data-nuevo]'); await p.click('#gaCats [data-cat]:has-text("Gasolina")'); await p.fill('#gaDesc', 'Moto, semana de cobro');
  await p.click('#gaSede [data-v="socopo"]'); await p.click('#gaMetodos [data-m="1"]'); await p.fill('#gaMonto', '25'); await p.evaluate(() => document.activeElement.blur());
  await espera(300); await foto(p, '44-anotar-gasto'); await cerrar(p);
  await mas(p, '[data-ir="ajustes"]'); await foto(p, '29-ajustes');
  await p.click('[data-nuevo-usuario]'); await p.waitForSelector('#usNombre');
  await p.fill('#usNombre', 'José Rivas'); await p.fill('#usUsuario', 'jose'); await p.fill('#usClave', 'temporal1');
  await p.click('#usRol [data-v="empleado"]'); await p.click('#usSede [data-v="pedraza"]'); await foto(p, '41-nuevo-empleado');
  await p.click('#usGuardar'); await p.waitForSelector('.hoja h2:has-text("Usuario listo")'); await espera(500); await foto(p, '42-usuario-listo'); await cerrar(p);
  await p.evaluate(() => ir('ajustes', 'copia')); await espera(900); await foto(p, '35-copia');

  // Empleado de Pedraza: su pantalla, cobro en efectivo sin señal
  const t2 = await tel(b); const e = t2.p;
  await entrar(e, 'pedraza'); await foto(e, '30-empleado');
  await cliente(e, 'Luis Mendoza');
  await t2.ctx.setOffline(true); await e.evaluate(() => window.dispatchEvent(new Event('offline')));
  await e.click('.ficha-cab [data-abonar]'); await e.click('#abMetodos [data-m="1"]'); await e.fill('#abMonto', '75');
  await e.click('#abGuardar'); await e.waitForSelector('.hoja h2:has-text("Guardado en el teléfono")', { timeout: 20000 }); await foto(e, '31-sin-senal');
  await cerrar(e); await foto(e, '32-por-enviar');
  await t2.ctx.setOffline(false); await e.evaluate(() => window.dispatchEvent(new Event('online')));
  await e.waitForFunction(() => document.getElementById('chipCola').hidden, null, { timeout: 30000 });

  // Guía del empleado (capturas e-*): entrar, cobrar, vender a crédito y de contado, mercancía, su efectivo
  const t4 = await tel(b); const q4 = t4.p;
  await q4.goto(URL_APP); await q4.waitForSelector('#pantallaLogin:not([hidden])');
  await q4.fill('#loginUsuario', 'pedraza'); await q4.fill('#loginClave', 'prueba123'); await foto(q4, 'e01-entrar');
  await q4.click('#btnEntrar'); await q4.waitForSelector('#app:not([hidden])'); await sinToasts(q4); await espera(900);
  await q4.evaluate(() => hojaCambiarClave(true)); await espera(600); await foto(q4, 'e02-clave');
  await t4.ctx.close();
  await e.click('#navTabs [data-ir="cobrar"]'); await espera(800); await foto(e, 'e03-cobrar');
  await cliente(e, 'Rosa Pérez'); await e.click('.ficha-cab [data-abonar]'); await e.waitForSelector('#abMetodos');
  await e.click('#abMetodos [data-m="1"]'); await e.fill('#abMonto', '50'); await e.dispatchEvent('#abMonto', 'input'); await foto(e, 'e04-abono');
  await e.click('#abGuardar'); await e.waitForSelector('.hoja h2:has-text("Abono registrado")'); await foto(e, 'e05-recibo'); await cerrar(e);
  await cliente(e, 'Luis Mendoza'); await e.click('[data-vender]'); await e.waitForSelector('#vItems');
  await e.fill('#vItems [data-campo="descripcion"]', 'licuadora'); await e.click('#vItems .sugerencias [data-p]'); await espera(400);
  await foto(e, 'e06-vender');
  await e.click('#vUsarPct'); await e.click('#vMetodos [data-m="1"]'); await e.fill('#vNumero', '4'); await e.dispatchEvent('#vNumero', 'input');
  await e.locator('#vCuotas').scrollIntoViewIfNeeded(); await e.evaluate(() => window.scrollBy(0, -80)); await foto(e, 'e07-cuotas');
  await e.click('#vGuardar'); await e.waitForSelector('.hoja h2:has-text("guardada")'); await foto(e, 'e08-guardada'); await cerrar(e);
  await e.click('#navTabs [data-ir="vender"]'); await e.waitForSelector('#vForma'); await e.click('#vForma [data-c="1"]');
  await e.click('#vCliente [data-elegir]'); await e.fill('#ecBusca', 'Rosa'); await espera(400); await e.click('#ecLista [data-ref]:has-text("Rosa Pérez")');
  await e.fill('#vItems [data-campo="descripcion"]', 'ventilador'); await e.click('#vItems .sugerencias [data-p]'); await espera(300);
  await e.click('#vMetodos [data-m="1"]'); await espera(300); await foto(e, 'e09-contado');
  await e.click('#vGuardar'); await e.waitForSelector('.hoja h2:has-text("contado")'); await foto(e, 'e10-contado-guardado'); await cerrar(e);
  await mas(e, '[data-ir="mercancia"]'); await e.waitForSelector('#mcEntrada'); await foto(e, 'e11-mercancia');
  await e.click('#mcEntrada'); await e.waitForSelector('#emFilas');
  await e.fill('#emFilas [data-c="nombre"]', 'Plancha Oster'); await e.fill('#emFilas [data-c="cantidad"]', '3'); await e.fill('#emFilas [data-c="precio"]', '28');
  await e.fill('#emNota', 'Las trajo Franklin el martes'); await foto(e, 'e12-llego');
  await e.click('#emGuardar'); await espera(1500); await cerrar(e);
  await mas(e, '[data-ir="efectivo"]'); await espera(900); await foto(e, 'e13-efectivo');

  await mas(p, '[data-ir="efectivo"]'); await p.waitForSelector('[data-recibir]'); await foto(p, '33-efectivo');
  await p.click('[data-recibir]'); await espera(400); await foto(p, '34-recibir'); await cerrar(p);
  // Seguridad entre socios: Franklin pide un descuento; Daniel lo ve en Cobrar, lo aprueba y queda en el historial
  await cliente(p, 'Jesús Contreras');
  const vj = p.locator('.venta-cab').first(); if (!(await p.locator('.venta-det [data-accion="descuento"]').count())) await vj.click();
  await espera(500); await p.click('[data-accion="descuento"]'); await p.fill('#ajMonto', '20'); await p.fill('#ajMotivo', 'Pagó 3 cuotas juntas');
  await foto(p, '37-pedir'); await p.click('#ajGuardar'); await espera(1500); await cerrar(p);
  const t3 = await tel(b); const d = t3.p;
  await entrar(d, 'daniel'); await d.waitForSelector('[data-aprobaciones]'); await foto(d, '38-aviso-aprobar');
  await d.click('[data-aprobaciones]'); await d.waitForSelector('[data-aprobar]'); await foto(d, '39-aprobaciones');
  await d.click('[data-aprobar]'); await d.click('#cfSi'); await d.waitForFunction(() => !document.querySelector('[data-aprobar]'));
  await d.click('.hoja [data-historial]'); await d.waitForFunction(() => /Descuento de/.test(document.body.textContent)); await foto(d, '40-historial');
  await t3.ctx.close();
  // En la computadora
  const pc = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, locale: 'es-VE', timezoneId: 'America/Caracas' });
  const q = await pc.newPage();
  await entrar(q, 'franklin');
  await q.click('#navTabs [data-ir="clientes"]'); await espera(500);
  await q.click('.item:has-text("María González")'); await q.waitForSelector('.ficha-cab'); await espera(900);
  await foto(q, '36-computadora');
  await pc.close();
  await b.close();
})().catch(e => { console.error('SE DETUVO:', e.message); process.exit(2); });
