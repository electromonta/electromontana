// Electro Montana — contrato de venta a crédito (lleno con los datos de la venta, o en blanco)
// para imprimir o guardar en PDF, y el resumen de la venta por WhatsApp.
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
  var nCuotas = cuotas.length;
  var forma = vacio ? '' : (d.frecuencia === 'contado' || !nCuotas ? 'De contado'
    : nCuotas + ' cuota' + (nCuotas === 1 ? '' : 's') + (d.frecuencia === 'personalizada' ? '' : ' ' + textoFrecuencia(d.frecuencia, nCuotas)) +
      (cuotas.every(function (q) { return q.monto === cuotas[0].monto; }) ? ' de ' + fmtUSD(cuotas[0].monto) : '') +
      ', del ' + fmtFechaAnio(cuotas[0].fecha) + ' al ' + fmtFechaAnio(cuotas[nCuotas - 1].fecha));
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

// Muestra el contrato y deja imprimirlo o guardarlo en PDF (en el iPhone: Compartir → Imprimir → pellizcar para PDF)
function imprimirContrato(v, borrador) {
  ponerEstiloContrato();
  var d = datosContrato(v, borrador);
  var html = htmlContrato(d);
  var ayuda = '<p class="tenue chico">Revísalo y toca Imprimir. En el iPhone también sirve para guardarlo como PDF y mandarlo por WhatsApp.</p>';
  var h = abrirHoja({
    titulo: d ? 'Contrato' + (d.numero ? ' #' + d.numero : '') : 'Contrato en blanco', completa: true,
    html: ayuda + html,
    pie: '<button type="button" class="btn btn-ancho" id="ctImprimir">' + icono('imprimir') + 'Imprimir o guardar PDF</button>'
  });
  // Firmado en la pantalla: se ponen las firmas (de la base o del teléfono)
  if (v && (v.firma_cliente || firmaEnCola(v.id, v.clave))) {
    imagenesFirma(v).then(function (f) {
      if (h.cerrado) return;
      html = htmlContrato(d, f);
      h.cuerpo.innerHTML = ayuda + (f.sinSenal ? '<div class="aviso aviso-info" style="margin-bottom:10px">' + icono('sinsenal') + '<div>Sin señal: las firmas se ven cuando vuelva el internet.</div></div>' : '') + html;
    });
  }
  h.$('#ctImprimir').onclick = function () {
    var cont = document.getElementById('impresion');
    if (!cont) { cont = document.createElement('div'); cont.id = 'impresion'; document.body.appendChild(cont); }
    cont.innerHTML = html;
    document.body.classList.add('imprimiendo');
    var limpiar = function () { document.body.classList.remove('imprimiendo'); cont.innerHTML = ''; window.removeEventListener('afterprint', limpiar); };
    window.addEventListener('afterprint', limpiar);
    setTimeout(function () { window.print(); setTimeout(limpiar, 1500); }, 50);
  };
}

// Resumen de la venta para mandarle al cliente por WhatsApp
function enviarResumenVenta(v, borrador) {
  var d = datosContrato(v, borrador);
  if (!d) return;
  var c = d.cliente || {};
  var lineas = ['*ELECTRO MONTANA*', d.numero ? 'Contrato #' + d.numero + ' · ' + fmtFechaAnio(d.fecha) : 'Venta del ' + fmtFechaAnio(d.fecha), '',
    'Cliente: ' + (c.nombre || ''), 'Se llevó: ' + d.items.map(function (i) { return (i.cantidad > 1 ? i.cantidad + ' ' : '') + i.descripcion; }).join(', '),
    'Total: *' + fmtUSD(d.total) + '*'];
  if (d.origen === 'carga_inicial') lineas.push('Ya pagado: ' + fmtUSD(d.pagado_antes));
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
