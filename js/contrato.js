// Electro Montana — contrato de venta a crédito (lleno con los datos de la venta, o en blanco):
// en pantalla, en PDF para mandarlo por WhatsApp o guardarlo, para imprimir, y el resumen de la venta por WhatsApp.
'use strict';

// Condiciones por defecto. Los dueños las pueden cambiar en Ajustes → Contrato.
// {giros} se cambia por el número de cuotas sin pagar para retirar la mercancía.
var CONDICIONES_BASE = [
  'El precio de esta venta está en dólares. Los pagos en bolívares se reciben a la tasa del día que indique Electro Montana.',
  'El artículo sigue siendo propiedad de Electro Montana hasta que se pague completo. Mientras tanto, el comprador no puede venderlo, empeñarlo, regalarlo ni llevarlo a otra dirección sin avisar.',
  'El comprador pagará cada cuota en la fecha indicada. Cada pago se anota y se le envía su recibo por WhatsApp.',
  'Si no paga en el tiempo acordado, se le cobrará un recargo por demora.',
  'Si deja de pagar {giros} cuotas, Electro Montana retirará el artículo y se lo devolverá cuando haya pagado la totalidad de la deuda.',
  'Lo abonado no se devuelve.',
  'El fiador se compromete a pagar la deuda si el comprador no lo hace.',
  'El comprador debe avisar si cambia de dirección o de número de teléfono.',
  'La garantía del artículo es la del fabricante. No cubre daños por mal uso, golpes, agua o fallas de la electricidad.'
].join('\n');

function condicionesContrato() {
  var txt = (ST.cfg && ST.cfg.contrato_condiciones) || CONDICIONES_BASE;
  var giros = (ST.cfg && ST.cfg.giros_para_retiro) || 3;
  return txt.replace(/\{giros\}/g, giros + ' (' + numeroEnLetras(giros) + ')')
    .split('\n').map(function (l) { return l.replace(/^\s*\d+[.)-]\s*/, '').trim(); }).filter(Boolean);
}
function numeroEnLetras(n) {
  return ['cero', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce'][n] || String(n);
}

// Datos del contrato a partir de una venta guardada (v) o de un borrador recién hecho (b)
function datosContrato(v, b) {
  if (b) return b;
  if (!v) return null;
  // Contrato firmado en la pantalla: se muestra tal como se firmó
  var f = v.contrato_firmado;
  if (f) {
    return {
      numero: f.numero, fecha: f.fecha, cliente: f.cliente || {}, origen: f.origen,
      items: (f.items || []).map(function (i) { return { cantidad: Number(i.cantidad), descripcion: i.descripcion, precio: Number(i.precio) }; }),
      total: Number(f.total), inicial: Number(f.inicial), pagado_antes: f.origen === 'carga_inicial' ? Number(f.plan_base) : 0,
      inicial_pagada: Number(v.pagado) >= Number(v.inicial) - 0.004, frecuencia: f.frecuencia,
      cuotas: (f.cuotas || []).map(function (c) { return { fecha: c.fecha, monto: Number(c.monto) }; }), contrato_papel: f.contrato_papel,
      condiciones: f.condiciones, firmado: true
    };
  }
  var cuotas = (ST.cuotasPorVenta.get(v.id) || []).filter(function (c) { return c.tipo !== 'inicial'; })
    .sort(function (a, c) { return a.fecha < c.fecha ? -1 : a.fecha > c.fecha ? 1 : a.n - c.n; });
  return {
    numero: v.numero, fecha: v.fecha, cliente: ST.cliPorId.get(v.cliente_id) || {}, origen: v.origen,
    items: (ST.itemsPorVenta.get(v.id) || []), total: Number(v.total), inicial: Number(v.inicial),
    pagado_antes: v.origen === 'carga_inicial' ? Number(v.plan_base) : 0, inicial_pagada: Number(v.pagado) >= Number(v.inicial) - 0.004,
    frecuencia: v.frecuencia, cuotas: cuotas.map(function (c) { return { fecha: c.fecha, monto: Number(c.monto) }; }), contrato_papel: v.contrato_papel
  };
}

function textoFormaPago(d) {
  var cuotas = d.cuotas, n = cuotas.length;
  if (d.frecuencia === 'contado' || !n) return 'De contado';
  return n + ' cuota' + (n === 1 ? '' : 's') + (d.frecuencia === 'personalizada' ? '' : ' ' + textoFrecuencia(d.frecuencia, n)) +
    (cuotas.every(function (q) { return q.monto === cuotas[0].monto; }) ? ' de ' + fmtUSD(cuotas[0].monto) : '') +
    ', del ' + fmtFechaAnio(cuotas[0].fecha) + ' al ' + fmtFechaAnio(cuotas[n - 1].fecha);
}

function htmlContrato(d, firmas) {
  var vacio = !d;
  firmas = firmas || {};
  d = d || { cliente: {}, items: [], cuotas: [] };
  var c = d.cliente || {};
  function linea(etq, val, ancho) {
    return '<div class="ct-campo" style="flex:' + (ancho || 1) + '"><span>' + etq + '</span><b>' + (val ? esc(val) : '&nbsp;') + '</b></div>';
  }
  var resta = vacio ? null : redondear2(d.total - (d.inicial || 0) - (d.pagado_antes || 0));
  var items = vacio || !d.items.length ? [{}, {}, {}] : d.items;
  var cuotas = vacio ? new Array(12).fill({}) : d.cuotas;
  var forma = vacio ? '' : textoFormaPago(d);
  var tel = ST.cfg && ST.cfg.telefono_negocio;
  return '<div class="ct">' +
    '<div class="ct-cab"><div class="ct-marca">' + logoSVG('#172b4d', '#a9541f', 'ct-logo') +
      '<div><div class="ct-nombre"><small>ELECTRO</small>MONTANA</div><div class="ct-lema">Todo a tu alcance' + (tel ? ' · ' + esc(tel) : '') + '</div></div></div>' +
      '<div class="ct-titulo"><div>CONTRATO DE VENTA A CRÉDITO</div><div class="ct-num">N° ' + (d.numero ? String(d.numero).padStart(6, '0') : '_______') + '</div>' +
      '<div class="ct-fecha">Fecha: ' + (d.fecha ? fmtFechaAnio(d.fecha) : '____/____/________') + (c.sede ? ' · ' + nombreSede(c.sede) : '') + '</div>' +
      (d.contrato_papel ? '<div class="ct-fecha">Contrato en papel N° ' + esc(d.contrato_papel) + '</div>' : '') + '</div></div>' +

    '<div class="ct-sec">Comprador</div>' +
    '<div class="ct-fila">' + linea('Nombre y apellido', c.nombre, 2) + linea('Cédula', c.cedula ? fmtCedula(c.cedula) : '') + '</div>' +
    '<div class="ct-fila">' + linea('Teléfono', c.telefono) + linea('Trabajo', c.trabajo, 2) + '</div>' +
    '<div class="ct-fila">' + linea('Dirección', c.direccion, 2) + linea('Punto de referencia', c.referencia, 1) + '</div>' +

    '<div class="ct-sec">Fiador</div>' +
    '<div class="ct-fila">' + linea('Nombre y apellido', c.fiador_nombre, 2) + linea('Cédula', c.fiador_cedula ? fmtCedula(c.fiador_cedula) : '') + '</div>' +
    '<div class="ct-fila">' + linea('Teléfono', c.fiador_telefono) + linea('Dirección', c.fiador_direccion, 2) + '</div>' +

    '<div class="ct-sec">Artículos</div>' +
    '<table class="ct-tabla"><thead><tr><th style="width:12%">Cant.</th><th>Descripción</th><th style="width:22%">Precio</th></tr></thead><tbody>' +
      items.map(function (i) {
        return '<tr><td>' + (i.cantidad || '&nbsp;') + '</td><td>' + (i.descripcion ? esc(i.descripcion) : '&nbsp;') + '</td><td class="der">' +
          (i.precio != null ? fmtUSD(i.precio * (i.cantidad || 1)) : '&nbsp;') + '</td></tr>';
      }).join('') + '</tbody></table>' +
    '<div class="ct-totales">' +
      '<div><span>Monto total</span><b>' + (vacio ? '' : fmtUSD(d.total)) + '</b></div>' +
      (d.origen === 'carga_inicial' ? '<div><span>Ya pagado</span><b>' + fmtUSD(d.pagado_antes) + '</b></div>'
        : '<div><span>Inicial</span><b>' + (vacio ? '' : fmtUSD(d.inicial)) + '</b></div>') +
      '<div><span>Resta</span><b>' + (vacio ? '' : fmtUSD(resta)) + '</b></div></div>' +
    '<div class="ct-fila">' + linea('Forma de pago', forma) + '</div>' +

    '<div class="ct-sec">Cuotas</div>' +
    '<div class="ct-cuotas">' + cuotas.map(function (q, i) {
      return '<div class="ct-cuota"><span>' + (i + 1) + '</span><div>' + (q.fecha ? fmtFechaAnio(q.fecha) : '___/___/_____') + '</div>' +
        '<div>' + (q.monto ? fmtUSD(q.monto) : '$______') + '</div><div class="ct-caja"></div></div>';
    }).join('') + '</div>' +

    '<div class="ct-sec">Condiciones</div>' +
    '<ol class="ct-cond">' + ((d.condiciones && d.condiciones.length) ? d.condiciones : condicionesContrato()).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ol>' +

    '<div class="ct-firmas">' +
      '<div>' + imgFirma(firmas.cliente) + '<div class="ct-raya"></div>Firma del comprador<br><span>C.I.: ' + (firmas.cliente && c.cedula ? esc(fmtCedula(c.cedula)) : '') + '</span></div>' +
      '<div class="ct-huella">Huella</div>' +
      '<div>' + imgFirma(firmas.fiador) + '<div class="ct-raya"></div>Firma del fiador<br><span>C.I.: ' + (firmas.fiador && c.fiador_cedula ? esc(fmtCedula(c.fiador_cedula)) : '') + '</span></div>' +
      '<div><div class="ct-raya"></div>Por Electro Montana</div>' +
    '</div>' +
    (firmas.en ? '<div class="ct-firmado">Firmado en la pantalla el ' + esc(fmtFechaAnio(fechaCaracas(firmas.en))) + ' a las ' + esc(fmtHora(firmas.en)) +
      (firmas.por ? ', registrado por ' + esc(nombreUsuario(firmas.por)) : '') + (firmas.enCola ? ' (por enviar)' : '') + '.</div>' : '') +
    '<div class="ct-nota">NOTA: FIRMANDO EL CONTRATO NO SE DEVUELVE DINERO</div>' +
  '</div>';
}

function imgFirma(url) {
  return url ? '<img class="ct-firma" src="' + esc(url) + '" alt="Firma">' : '';
}

var _estiloContrato = false;
function ponerEstiloContrato() {
  if (_estiloContrato) return;
  _estiloContrato = true;
  var s = document.createElement('style');
  s.textContent =
    '.ct{background:#fff;color:#111;font:13px/1.35 Barlow,Arial,sans-serif;max-width:780px;margin:0 auto;padding:18px;border:1px solid #ddd;border-radius:8px}' +
    '.ct-cab{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:2px solid #172b4d;padding-bottom:10px}' +
    '.ct-marca{display:flex;gap:10px;align-items:center}.ct-logo{width:58px;height:58px}' +
    '.ct-nombre{font:700 24px "Barlow Semi Condensed",Arial,sans-serif;letter-spacing:.12em;color:#172b4d;line-height:1}' +
    '.ct-nombre small{display:block;font-size:11px;letter-spacing:.42em;color:#a9541f}' +
    '.ct-lema{font-size:12px;color:#555;margin-top:3px}' +
    '.ct-titulo{text-align:right;font:700 15px "Barlow Semi Condensed",Arial,sans-serif;color:#172b4d}' +
    '.ct-num{font-size:20px;color:#a9541f}.ct-fecha{font:400 12px Barlow,Arial,sans-serif;color:#333}' +
    '.ct-sec{font:700 12px "Barlow Semi Condensed",Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#fff;background:#172b4d;padding:3px 8px;margin:12px 0 6px;border-radius:3px}' +
    '.ct-fila{display:flex;gap:12px;margin-bottom:4px}' +
    '.ct-campo{display:flex;flex-direction:column;border-bottom:1px solid #999;min-height:32px}.ct-campo span{font-size:10px;color:#666;text-transform:uppercase}.ct-campo b{font-weight:600}' +
    '.ct-tabla{width:100%;border-collapse:collapse}.ct-tabla th,.ct-tabla td{border:1px solid #bbb;padding:4px 6px;text-align:left;height:22px}.ct-tabla th{background:#eef1f6;font-size:11px}.ct-tabla .der{text-align:right}' +
    '.ct-totales{display:flex;justify-content:flex-end;gap:16px;margin:6px 0}.ct-totales div{display:flex;flex-direction:column;align-items:flex-end;min-width:110px;border-bottom:1px solid #999}.ct-totales span{font-size:10px;color:#666;text-transform:uppercase}.ct-totales b{font-size:15px}' +
    '.ct-cuotas{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px 10px}' +
    '.ct-cuota{display:grid;grid-template-columns:18px 1fr 1fr 22px;gap:4px;align-items:center;border-bottom:1px dotted #aaa;padding:2px 0;font-size:12px}.ct-cuota span{color:#a9541f;font-weight:700}' +
    '.ct-caja{width:16px;height:16px;border:1.5px solid #172b4d;border-radius:2px}' +
    '.ct-cond{margin:0;padding-left:18px;font-size:11.5px}.ct-cond li{margin-bottom:2px}' +
    '.ct-firmas{display:grid;grid-template-columns:1fr 70px 1fr 1fr;gap:14px;margin-top:34px;text-align:center;font-size:11px;align-items:end}' +
    '.ct-firma{display:block;max-width:100%;max-height:64px;margin:0 auto 2px;mix-blend-mode:multiply}' +
    '.ct-firmado{margin-top:8px;font-size:11px;color:#333;text-align:center}' +
    '.ct-raya{border-top:1px solid #111;margin-bottom:3px}.ct-firmas span{display:inline-block;margin-top:6px}' +
    '.ct-huella{border:1px solid #999;height:72px;display:flex;align-items:flex-end;justify-content:center;font-size:10px;color:#666;border-radius:4px}' +
    '.ct-nota{margin-top:14px;background:#172b4d;color:#fff;text-align:center;font:700 13px "Barlow Semi Condensed",Arial,sans-serif;letter-spacing:.06em;padding:6px;border-radius:3px}' +
    '@media (max-width:560px){.ct{padding:12px;font-size:12px}.ct-cab{flex-direction:column}.ct-titulo{text-align:left}.ct-cuotas{grid-template-columns:1fr 1fr}.ct-fila{flex-wrap:wrap}.ct-campo{flex-basis:100% !important}.ct-firmas{grid-template-columns:1fr 1fr}}' +
    '#impresion{display:none}' +
    '@media print{@page{size:letter;margin:9mm 11mm}body.imprimiendo>*:not(#impresion){display:none !important}body.imprimiendo #impresion{display:block}' +
      '#impresion .ct{border:0;padding:0;max-width:none;font-size:11.5px}#impresion .ct-campo{min-height:27px}#impresion .ct-sec{margin:8px 0 4px}' +
      '#impresion .ct-tabla th,#impresion .ct-tabla td{height:19px;padding:2px 6px}#impresion .ct-cuota{padding:1px 0}#impresion .ct-cond{font-size:10.5px}' +
      '#impresion .ct-firmas{margin-top:26px}#impresion .ct-firma{max-height:46px}#impresion .ct-firmado{margin-top:4px;font-size:10px}#impresion .ct-huella{height:60px}#impresion .ct-nota{margin-top:10px;padding:4px}#impresion .ct-sec,#impresion .ct-nota,#impresion .ct-tabla th{-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '#impresion .ct-cuotas{grid-template-columns:1fr 1fr 1fr}#impresion .ct-fila{flex-wrap:nowrap}#impresion .ct-campo{flex-basis:auto !important}#impresion .ct-firmas{grid-template-columns:1fr 70px 1fr 1fr}#impresion .ct-cab{flex-direction:row}#impresion .ct-titulo{text-align:right}}';
  document.head.appendChild(s);
}

// El contrato como PDF (carta). firmas = { cliente, fiador: imágenes de pdfJPEG; en, por, enCola }
function pdfContrato(d, firmas) {
  var vacio = !d;
  firmas = firmas || {};
  d = d || { cliente: {}, items: [], cuotas: [] };
  var c = d.cliente || {};
  var P = nuevoPDF(), AZUL = '#172b4d', COBRE = '#a9541f', GRIS = '#666666', RAYA = '#999999';
  var M = 34, ANCHO = P.ancho - 2 * M, FIN = P.alto - 28, y = 0;
  var numero = d.numero ? String(d.numero).padStart(6, '0') : '';
  var tel = ST.cfg && ST.cfg.telefono_negocio;

  function logo(x, y0, tam) {
    var s = tam / 64, n = P.num;
    function pt(px, py) { return n(x + px * s) + ' ' + n(P.alto - (y0 + py * s)); }
    var r = 29, k = 0.5523 * r;
    P.crudo('q ' + P.rgb(AZUL) + ' ' + n(2.6 * s) + ' w ' +
      pt(61, 32) + ' m ' + pt(61, 32 + k) + ' ' + pt(32 + k, 61) + ' ' + pt(32, 61) + ' c ' + pt(32 - k, 61) + ' ' + pt(3, 32 + k) + ' ' + pt(3, 32) + ' c ' +
      pt(3, 32 - k) + ' ' + pt(32 - k, 3) + ' ' + pt(32, 3) + ' c ' + pt(32 + k, 3) + ' ' + pt(61, 32 - k) + ' ' + pt(61, 32) + ' c S ' +
      n(3.4 * s) + ' w 1 J 1 j ' + pt(9, 46) + ' m ' + pt(23, 23) + ' l ' + pt(31, 34) + ' l ' + pt(40, 26) + ' l ' + pt(55, 46) + ' l S ' +
      P.rgb(COBRE, true) + ' ' + pt(35, 8.5) + ' m ' + pt(27.5, 22) + ' l ' + pt(32.5, 22) + ' l ' + pt(30, 31) + ' l ' + pt(38.5, 17) + ' l ' +
      pt(33.5, 17) + ' l ' + pt(37, 8.5) + ' l h f Q');
  }
  function pagina() {
    P.pagina();
    if (P.paginas === 1) {
      logo(M, 26, 52);
      P.texto(M + 62, 43, 'ELECTRO', { t: 8, b: true, color: COBRE, esp: 3.3 });
      P.texto(M + 62, 65, 'MONTANA', { t: 23, b: true, color: AZUL, esp: 2.4 });
      P.texto(M + 62, 78, 'Todo a tu alcance' + (tel ? ' · ' + tel : ''), { t: 9, color: '#555555' });
      var der = M + ANCHO;
      P.texto(der, 40, 'CONTRATO DE VENTA A CRÉDITO', { t: 12, b: true, color: AZUL, alinear: 'der' });
      P.texto(der, 60, 'N° ' + (numero || '_______'), { t: 17, b: true, color: COBRE, alinear: 'der' });
      P.texto(der, 73, 'Fecha: ' + (d.fecha ? fmtFechaAnio(d.fecha) : '____/____/________') + (c.sede ? ' · ' + nombreSede(c.sede) : ''), { t: 9, color: '#333333', alinear: 'der' });
      if (d.contrato_papel) P.texto(der, 84, 'Contrato en papel N° ' + d.contrato_papel, { t: 9, color: '#333333', alinear: 'der' });
      P.linea(M, 89, M + ANCHO, 89, { g: 1.6, color: AZUL });
      y = 93;
    } else {
      logo(M, 22, 24);
      P.texto(M + 32, 38, 'ELECTRO MONTANA · Contrato N° ' + (numero || '_______') + ' (continuación)', { t: 9, b: true, color: AZUL });
      P.linea(M, 48, M + ANCHO, 48, { g: 1, color: AZUL });
      y = 56;
    }
  }
  function espacio(h) { if (y + h > FIN) pagina(); }
  function seccion(t, siguiente) {
    espacio(18 + (siguiente || 24));
    P.rect(M, y, ANCHO, 14, { relleno: AZUL });
    P.texto(M + 6, y + 10.2, t.toUpperCase(), { t: 8.5, b: true, color: '#ffffff', esp: 0.8 });
    y += 18;
  }
  // campos = [[etiqueta, valor, proporción], ...]: una fila de renglones con raya abajo, como el papel
  function fila(campos) {
    var total = campos.reduce(function (a, x) { return a + (x[2] || 1); }, 0), libre = ANCHO - 12 * (campos.length - 1);
    var partes = campos.map(function (x) { var w = libre * (x[2] || 1) / total; return { e: x[0], w: w, l: P.partir(x[1], 9.5, true, w, 2) }; });
    var h = 9 + 11 * Math.max(1, Math.max.apply(null, partes.map(function (p) { return p.l.length; }))) + 2;
    espacio(h + 3);
    var x = M;
    partes.forEach(function (p) {
      P.texto(x, y + 7, p.e.toUpperCase(), { t: 6.8, color: GRIS });
      p.l.forEach(function (l, i) { P.texto(x, y + 17.5 + i * 11, l, { t: 9.5, b: true }); });
      P.linea(x, y + h, x + p.w, y + h);
      x += p.w + 12;
    });
    y += h + 3;
  }

  pagina();
  seccion('Comprador', 80);
  fila([['Nombre y apellido', c.nombre, 2], ['Cédula', c.cedula ? fmtCedula(c.cedula) : '']]);
  fila([['Teléfono', c.telefono], ['Trabajo', c.trabajo, 2]]);
  fila([['Dirección', c.direccion, 2], ['Punto de referencia', c.referencia]]);

  seccion('Fiador', 54);
  fila([['Nombre y apellido', c.fiador_nombre, 2], ['Cédula', c.fiador_cedula ? fmtCedula(c.fiador_cedula) : '']]);
  fila([['Teléfono', c.fiador_telefono], ['Dirección', c.fiador_direccion, 2]]);

  // Artículos
  var items = vacio || !d.items.length ? [{}, {}, {}] : d.items;
  var wCant = ANCHO * 0.12, wPrecio = ANCHO * 0.22, wDesc = ANCHO - wCant - wPrecio;
  function cabTabla() {
    P.rect(M, y, ANCHO, 15, { relleno: '#eef1f6', borde: '#bbbbbb' });
    P.texto(M + 5, y + 10.5, 'Cant.', { t: 8, b: true });
    P.texto(M + wCant + 5, y + 10.5, 'Descripción', { t: 8, b: true });
    P.texto(M + wCant + wDesc + 5, y + 10.5, 'Precio', { t: 8, b: true });
    y += 15;
  }
  seccion('Artículos', 36);
  cabTabla();
  items.forEach(function (i) {
    var l = i.descripcion ? P.partir(i.descripcion, 9.5, false, wDesc - 10) : [''];
    var h = Math.max(17, 6 + 11 * l.length);
    if (y + h > FIN) { pagina(); cabTabla(); }
    [[M, wCant], [M + wCant, wDesc], [M + wCant + wDesc, wPrecio]].forEach(function (k) { P.rect(k[0], y, k[1], h, { borde: '#bbbbbb' }); });
    if (i.cantidad) P.texto(M + 5, y + 12, String(i.cantidad), { t: 9.5 });
    l.forEach(function (x, k) { P.texto(M + wCant + 5, y + 12 + k * 11, x, { t: 9.5 }); });
    if (i.precio != null) P.texto(M + ANCHO - 5, y + 12, fmtUSD(i.precio * (i.cantidad || 1)), { t: 9.5, alinear: 'der' });
    y += h;
  });
  var resta = vacio ? null : redondear2(d.total - (d.inicial || 0) - (d.pagado_antes || 0));
  var totales = [['Monto total', vacio ? '' : fmtUSD(d.total)],
    d.origen === 'carga_inicial' ? ['Ya pagado', fmtUSD(d.pagado_antes)] : ['Inicial', vacio ? '' : fmtUSD(d.inicial)],
    ['Resta', vacio ? '' : fmtUSD(resta)]];
  espacio(34);
  totales.forEach(function (x, k) {
    var der = M + ANCHO - (totales.length - 1 - k) * 124, w = 110;
    P.texto(der, y + 13, x[0].toUpperCase(), { t: 6.8, color: GRIS, alinear: 'der' });
    P.texto(der, y + 27, x[1], { t: 12.5, b: true, alinear: 'der' });
    P.linea(der - w, y + 30, der, y + 30);
  });
  y += 36;
  fila([['Forma de pago', vacio ? '' : textoFormaPago(d)]]);

  // Cuotas: tres columnas, con su cajita para marcar lo pagado
  var cuotas = vacio ? new Array(12).fill({}) : d.cuotas;
  if (cuotas.length) {
    seccion('Cuotas', 16);
    var nc = cuotas.length > 15 ? 4 : 3, wc = (ANCHO - 12 * (nc - 1)) / nc;
    for (var f = 0; f < cuotas.length; f += nc) {
      espacio(14);
      for (var k = 0; k < nc && f + k < cuotas.length; k++) {
        var q = cuotas[f + k], x = M + k * (wc + 12);
        P.texto(x, y + 10, String(f + k + 1), { t: 9, b: true, color: COBRE });
        P.texto(x + 18, y + 10, q.fecha ? fmtFechaAnio(q.fecha) : '___/___/_____', { t: 9 });
        P.texto(x + wc - 16, y + 10, q.monto ? fmtUSD(q.monto) : '$______', { t: 9, alinear: 'der' });
        P.rect(x + wc - 10, y + 2.5, 9.5, 9.5, { borde: AZUL, g: 1.1 });
        P.linea(x, y + 13.5, x + wc, y + 13.5, { color: '#aaaaaa', g: 0.5, puntos: true });
      }
      y += 14;
    }
  }

  // Condiciones (las que se leyeron al firmar, o las de Ajustes)
  var conds = (d.condiciones && d.condiciones.length) ? d.condiciones : condicionesContrato();
  seccion('Condiciones', 24);
  conds.forEach(function (t, i) {
    var l = P.partir(t, 9, false, ANCHO - 18);
    espacio(l.length * 10.5 + 1.5);
    P.texto(M + 2, y + 9, (i + 1) + '.', { t: 9 });
    l.forEach(function (x, k) { P.texto(M + 18, y + 9 + k * 10.5, x, { t: 9 }); });
    y += l.length * 10.5 + 1.5;
  });

  // Firmas
  espacio(firmas.en ? 128 : 116);
  y += 12;
  var wf = (ANCHO - 58 - 36) / 3, raya = y + 50;
  var cols = [
    { x: M, w: wf, img: firmas.cliente, t: 'Firma del comprador', ci: firmas.cliente && c.cedula ? fmtCedula(c.cedula) : '' },
    { x: M + wf + 12, w: 58, huella: true },
    { x: M + wf + 82, w: wf, img: firmas.fiador, t: 'Firma del fiador', ci: firmas.fiador && c.fiador_cedula ? fmtCedula(c.fiador_cedula) : '' },
    { x: M + 2 * wf + 94, w: wf, t: 'Por Electro Montana' }
  ];
  cols.forEach(function (o) {
    if (o.huella) {
      P.rect(o.x, raya - 46, o.w, 58, { borde: RAYA });
      P.texto(o.x + o.w / 2, raya + 8, 'Huella', { t: 7, color: GRIS, alinear: 'centro' });
      return;
    }
    if (o.img) {
      var e = Math.min((o.w - 6) / o.img.ancho, 44 / o.img.alto), iw = o.img.ancho * e, ih = o.img.alto * e;
      P.imagen(o.img, o.x + (o.w - iw) / 2, raya - 2 - ih, iw, ih);
    }
    P.linea(o.x, raya, o.x + o.w, raya, { color: '#111111', g: 0.8 });
    P.texto(o.x + o.w / 2, raya + 11, o.t, { t: 8.5, alinear: 'centro' });
    if (o.ci !== undefined) P.texto(o.x + o.w / 2, raya + 24, 'C.I.: ' + o.ci, { t: 8, color: '#333333', alinear: 'centro' });
  });
  y = raya + 28;
  if (firmas.en) {
    P.texto(M + ANCHO / 2, y + 8, 'Firmado en la pantalla el ' + fmtFechaAnio(fechaCaracas(firmas.en)) + ' a las ' + fmtHora(firmas.en) +
      (firmas.por ? ', registrado por ' + nombreUsuario(firmas.por) : '') + (firmas.enCola ? ' (por enviar)' : '') + '.', { t: 8.5, color: '#333333', alinear: 'centro' });
    y += 12;
  }
  espacio(26);
  y += 6;
  P.rect(M, y, ANCHO, 19, { relleno: AZUL });
  P.texto(M + ANCHO / 2, y + 13.2, 'NOTA: FIRMANDO EL CONTRATO NO SE DEVUELVE DINERO', { t: 10, b: true, color: '#ffffff', alinear: 'centro', esp: 0.5 });

  var total = P.paginas;
  if (total > 1) for (var i = 0; i < total; i++) P.irA(i).texto(M + ANCHO / 2, P.alto - 14, 'Página ' + (i + 1) + ' de ' + total, { t: 7.5, color: GRIS, alinear: 'centro' });
  return P.bytes(numero ? 'Contrato N° ' + numero + (c.nombre ? ' - ' + c.nombre : '') : 'Contrato de venta a crédito');
}

function nombreArchivoContrato(d) {
  if (!d) return 'contrato-en-blanco.pdf';
  var nom = String((d.cliente && d.cliente.nombre) || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return 'contrato-' + (d.numero ? String(d.numero).padStart(6, '0') : 'nuevo') + (nom ? '-' + nom : '') + '.pdf';
}

// Firma (de la base o del teléfono) lista para el PDF: se pasa por un lienzo con fondo blanco y sale en JPEG
async function firmaParaPdf(url) {
  if (!url) return null;
  var r = await fetch(url);
  if (!r.ok) throw new Error('No se pudo bajar la firma.');
  var u = URL.createObjectURL(await r.blob());
  try {
    var img = await new Promise(function (res, rej) {
      var i = new Image();
      i.onload = function () { res(i); };
      i.onerror = function () { rej(new Error('No se pudo leer la firma.')); };
      i.src = u;
    });
    var k = Math.min(1, 700 / img.naturalWidth), cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(img.naturalWidth * k));
    cv.height = Math.max(1, Math.round(img.naturalHeight * k));
    var cx = cv.getContext('2d');
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
    cx.drawImage(img, 0, 0, cv.width, cv.height);
    var b = await new Promise(function (res, rej) {
      cv.toBlob(function (x) { x ? res(x) : rej(new Error('No se pudo preparar la firma.')); }, 'image/jpeg', 0.9);
    });
    return pdfJPEG(new Uint8Array(await b.arrayBuffer()));
  } finally { URL.revokeObjectURL(u); }
}

// Muestra el contrato y prepara el PDF para mandarlo por WhatsApp, guardarlo o imprimirlo.
// En el teléfono, "Compartir" solo abre si se llama en el mismo toque: por eso el PDF se arma antes,
// al abrir la hoja, y el botón se activa cuando está listo.
function imprimirContrato(v, borrador) {
  ponerEstiloContrato();
  var d = datosContrato(v, borrador);
  var html = htmlContrato(d), firmada = !!(v && (v.firma_cliente || firmaEnCola(v.id, v.clave)));
  var tactil = puedeCompartirArchivos();
  var ayuda = '<p class="tenue chico">' + (tactil
    ? 'Toca <b>Enviar PDF</b> y elige WhatsApp: el chat del cliente, o el tuyo para imprimirlo después. También puedes guardarlo en Archivos.'
    : 'Toca <b>Descargar PDF</b>: queda en Descargas para mandarlo por WhatsApp Web, guardarlo o imprimirlo.') + '</p>';
  var aviso = '';
  var h = abrirHoja({
    titulo: d ? 'Contrato' + (d.numero ? ' #' + d.numero : '') : 'Contrato en blanco', completa: true,
    html: ayuda + html,
    pie: '<button type="button" class="btn btn-ancho" id="ctPdf" disabled>' + icono('reloj') + 'Preparando PDF…</button>' +
      '<button type="button" class="btn btn-plano btn-ancho" id="ctImprimir">' + icono('imprimir') + 'Imprimir</button>'
  });
  var bPdf = h.$('#ctPdf'), pdf = null, preparando = false, enviando = false;
  function boton(ic, texto, activo) { if (h.cerrado) return; bPdf.innerHTML = icono(ic) + texto; bPdf.disabled = !activo; }
  async function preparar() {
    if (preparando) return;
    preparando = true;
    boton('reloj', 'Preparando PDF…', false);
    try {
      var f = {};
      if (firmada) {
        f = await imagenesFirma(v);
        if (h.cerrado) return;
        aviso = f.sinSenal ? '<div class="aviso aviso-info" style="margin-bottom:10px">' + icono('sinsenal') + '<div>Sin señal: las firmas se ven cuando vuelva el internet.</div></div>' : '';
        html = htmlContrato(d, f);
        h.cuerpo.innerHTML = ayuda + aviso + html;
        if (!f.cliente) throw new Error('Sin señal: el PDF con las firmas se arma cuando vuelva el internet.');
      }
      var imgs = { cliente: await firmaParaPdf(f.cliente), fiador: await firmaParaPdf(f.fiador), en: f.en, por: f.por, enCola: f.enCola };
      pdf = pdfContrato(d, imgs);
      boton('enviar', tactil ? 'Enviar PDF' : 'Descargar PDF', true);
    } catch (e) {
      console.error(e);
      if (!h.cerrado) toast(errMsg(e), 'error', 4000);
      boton('refrescar', 'Preparar el PDF otra vez', true);
    } finally { preparando = false; }
  }
  bPdf.onclick = function () {
    if (!pdf) { preparar(); return; }
    if (enviando) return;
    enviando = true;
    entregarArchivo(nombreArchivoContrato(d), pdf, 'application/pdf').then(function (ok) {
      if (ok && !tactil) toast('PDF descargado', 'ok');
    }).finally(function () { enviando = false; });
  };
  h.$('#ctImprimir').onclick = function () {
    var cont = document.getElementById('impresion');
    if (!cont) { cont = document.createElement('div'); cont.id = 'impresion'; document.body.appendChild(cont); }
    cont.innerHTML = html;
    document.body.classList.add('imprimiendo');
    var limpiar = function () { document.body.classList.remove('imprimiendo'); cont.innerHTML = ''; window.removeEventListener('afterprint', limpiar); };
    window.addEventListener('afterprint', limpiar);
    setTimeout(function () { window.print(); setTimeout(limpiar, 1500); }, 50);
  };
  preparar();
}

// Resumen de la venta para mandarle al cliente por WhatsApp
function enviarResumenVenta(v, borrador) {
  var d = datosContrato(v, borrador);
  if (!d) return;
  var c = d.cliente || {};
  var lineas = ['*ELECTRO MONTANA*', d.numero ? (d.frecuencia === 'contado' ? 'Venta #' : 'Contrato #') + d.numero + ' · ' + fmtFechaAnio(d.fecha) : 'Venta del ' + fmtFechaAnio(d.fecha), '',
    'Cliente: ' + (c.nombre || ''), 'Se llevó: ' + d.items.map(function (i) { return (i.cantidad > 1 ? i.cantidad + ' ' : '') + i.descripcion; }).join(', '),
    'Total: *' + fmtUSD(d.total) + '*'];
  if (d.frecuencia === 'contado') lineas.push('Pagó completo: *' + fmtUSD(d.total) + '* (de contado)');
  else if (d.origen === 'carga_inicial') lineas.push('Ya pagado: ' + fmtUSD(d.pagado_antes));
  else if (d.inicial > 0) lineas.push('Inicial: ' + fmtUSD(d.inicial) + (d.inicial_pagada ? ' (pagada)' : ''));
  var n = d.cuotas.length;
  if (n) {
    var iguales = d.cuotas.every(function (q) { return q.monto === d.cuotas[0].monto; });
    lineas.push('Cuotas: ' + n + (d.frecuencia === 'personalizada' ? '' : ' ' + textoFrecuencia(d.frecuencia, n)) + (iguales ? ' de ' + fmtUSD(d.cuotas[0].monto) : ''));
    lineas.push('Primera: ' + fmtFechaAnio(d.cuotas[0].fecha) + ' · Última: ' + fmtFechaAnio(d.cuotas[n - 1].fecha));
    if (!iguales || n <= 6) d.cuotas.forEach(function (q, i) { lineas.push('  ' + (i + 1) + '. ' + fmtFechaAnio(q.fecha) + ': ' + fmtUSD(q.monto)); });
  }
  lineas.push('', 'Gracias por su compra.');
  abrirWhatsApp(lineas.join('\n'), c.telefono || c.contacto_telefono);
}
