// Electro Montana — firmar el contrato en la pantalla (teléfono o tablet), con el dedo.
// Firma el cliente y, si tiene, el fiador. Las firmas se guardan en el teléfono y suben solas
// (sirve sin señal); al llegar, la base guarda una copia fija del contrato que se firmó.
'use strict';

// Recuadro para firmar. Guarda los trazos para poder redibujar si cambia el tamaño (girar la tablet).
function crearLienzoFirma(cont, alCambiar) {
  cont.innerHTML = '<div class="firma-caja"><canvas aria-label="Recuadro para firmar"></canvas><div class="firma-linea"></div>' +
    '<span class="firma-aqui">Firme aquí con el dedo</span></div>' +
    '<div class="fila-sep" style="margin-top:6px"><span class="tenue chico">Si sale mal, toque Borrar y vuelva a firmar.</span>' +
    '<button type="button" class="btn btn-plano btn-chico" data-borrar>' + icono('basura', 'ic-chico') + 'Borrar</button></div>';
  var cv = cont.querySelector('canvas'), ctx = cv.getContext('2d'), aqui = cont.querySelector('.firma-aqui');
  var trazos = [], actual = null, dpr = 1;
  function estilo() {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#14213d'; ctx.fillStyle = '#14213d'; ctx.lineWidth = 2.6 * dpr;
  }
  function medir() {
    var r = cv.getBoundingClientRect();
    if (!r.width) return;
    dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    estilo();
    trazos.forEach(dibujarTrazo);
  }
  function dibujarTrazo(t) {
    if (!t.length) return;
    ctx.beginPath(); ctx.arc(t[0].x * dpr, t[0].y * dpr, ctx.lineWidth / 2, 0, 2 * Math.PI); ctx.fill();
    ctx.beginPath(); ctx.moveTo(t[0].x * dpr, t[0].y * dpr);
    for (var i = 1; i < t.length; i++) ctx.lineTo(t[i].x * dpr, t[i].y * dpr);
    ctx.stroke();
  }
  function punto(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  cv.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (x) { /* nada */ }
    actual = [punto(e)];
    trazos.push(actual);
    dibujarTrazo(actual);
    aqui.hidden = true;
  });
  cv.addEventListener('pointermove', function (e) {
    if (!actual) return;
    e.preventDefault();
    var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    if (!evs.length) evs = [e];
    evs.forEach(function (ev) {
      var p = punto(ev), u = actual[actual.length - 1];
      ctx.beginPath(); ctx.moveTo(u.x * dpr, u.y * dpr); ctx.lineTo(p.x * dpr, p.y * dpr); ctx.stroke();
      actual.push(p);
    });
  });
  function soltar() { if (actual) { actual = null; if (alCambiar) alCambiar(); } }
  cv.addEventListener('pointerup', soltar);
  cv.addEventListener('pointercancel', soltar);
  cv.addEventListener('pointerleave', soltar);
  cont.querySelector('[data-borrar]').addEventListener('click', function () {
    trazos = []; actual = null; ctx.clearRect(0, 0, cv.width, cv.height); aqui.hidden = false;
    if (alCambiar) alCambiar();
  });
  var alGirar = debounce(medir, 150);
  window.addEventListener('resize', alGirar);
  setTimeout(medir, 30);
  return {
    // Una firma de verdad tiene recorrido (no un toque suelto)
    vacio: function () {
      var largo = 0;
      trazos.forEach(function (t) { for (var i = 1; i < t.length; i++) largo += Math.abs(t[i].x - t[i - 1].x) + Math.abs(t[i].y - t[i - 1].y); });
      return largo < 60;
    },
    // Imagen jpg recortada a la firma, con fondo blanco
    imagen: function () {
      return new Promise(function (res, rej) {
        var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        trazos.forEach(function (t) { t.forEach(function (p) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }); });
        var m = 10, w = (maxX - minX) + 2 * m, h = (maxY - minY) + 2 * m;
        var esc = Math.min(3, 900 / w, 300 / h);
        var o = document.createElement('canvas');
        o.width = Math.max(1, Math.round(w * esc)); o.height = Math.max(1, Math.round(h * esc));
        var c2 = o.getContext('2d');
        c2.fillStyle = '#fff'; c2.fillRect(0, 0, o.width, o.height);
        c2.lineCap = 'round'; c2.lineJoin = 'round'; c2.strokeStyle = '#14213d'; c2.fillStyle = '#14213d'; c2.lineWidth = Math.max(2, 2.6 * esc);
        trazos.forEach(function (t) {
          var X = function (p) { return (p.x - minX + m) * esc; }, Y = function (p) { return (p.y - minY + m) * esc; };
          c2.beginPath(); c2.arc(X(t[0]), Y(t[0]), c2.lineWidth / 2, 0, 2 * Math.PI); c2.fill();
          c2.beginPath(); c2.moveTo(X(t[0]), Y(t[0]));
          for (var i = 1; i < t.length; i++) c2.lineTo(X(t[i]), Y(t[i]));
          c2.stroke();
        });
        o.toBlob(function (b) { b ? res(b) : rej(new Error('No se pudo guardar la firma.')); }, 'image/jpeg', 0.85);
      });
    },
    quitar: function () { window.removeEventListener('resize', alGirar); }
  };
}

// o = { d: datos del contrato, ventaId | ventaClave, cliente: {id | pendiente+clave, nombre}, reemplazar, alFirmar }
function hojaFirmar(o) {
  var d = o.d, cli = o.cliente || d.cliente || {};
  if (cli.pendiente) {
    var opc = Cola.ops.find(function (x) { return x.clave === cli.clave; });
    if (opc) cli = Object.assign({ pendiente: true, clave: cli.clave }, opc.datos);
  }
  var conFiador = !!(cli.fiador_nombre && String(cli.fiador_nombre).trim());
  var paso = 'cliente', lienzo = null, firmas = {}, clave = nuevaClave();
  var condiciones = condicionesContrato();
  var lleva = (d.items || []).map(function (i) { return (i.cantidad > 1 ? i.cantidad + ' ' : '') + i.descripcion; }).join(', ');
  var resta = redondear2(d.total - (d.inicial || 0) - (d.pagado_antes || 0));
  var h = abrirHoja({ titulo: 'Firmar el contrato', completa: true, fija: true, html: '', pie: ' ' });

  function texto() {
    if (paso === 'cliente') {
      return 'Yo, <b>' + esc(cli.nombre || '') + '</b>' + (cli.cedula ? ', C.I. ' + esc(fmtCedula(cli.cedula)) : '') +
        ', compro a crédito a Electro Montana: ' + esc(lleva || 'lo indicado en el contrato') + ', por <b>' + fmtUSD(d.total) + '</b>' +
        (d.origen === 'carga_inicial' ? ' (ya pagué ' + fmtUSD(d.pagado_antes) + ')' : d.inicial > 0 ? ', con una inicial de ' + fmtUSD(d.inicial) : '') +
        '. Me comprometo a pagar los <b>' + fmtUSD(resta) + '</b> que faltan en las cuotas y fechas del contrato' + (d.numero ? ' N° ' + String(d.numero).padStart(6, '0') : '') +
        ', y acepto sus condiciones.';
    }
    return 'Yo, <b>' + esc(cli.fiador_nombre) + '</b>' + (cli.fiador_cedula ? ', C.I. ' + esc(fmtCedula(cli.fiador_cedula)) : '') +
      ', soy fiador de ' + esc(cli.nombre || '') + ' y me comprometo a pagar esta deuda si el comprador no la paga.';
  }
  function pintar() {
    if (lienzo) lienzo.quitar();
    var esCliente = paso === 'cliente';
    h.el.querySelector('.hoja-cab h2').textContent = esCliente ? 'Firma del cliente' : 'Firma del fiador';
    h.cuerpo.innerHTML =
      (conFiador ? '<p class="tenue chico" style="margin:0 2px 8px">Paso ' + (esCliente ? '1' : '2') + ' de 2</p>' : '') +
      '<div class="tarjeta firma-texto">' + texto() + '</div>' +
      '<button type="button" class="btn btn-sec btn-ancho" data-leer style="margin:10px 0">' + icono('contrato') + 'Leer el contrato completo</button>' +
      '<div id="fmLienzo"></div>' +
      '<p class="tenue chico" style="margin-top:10px">Se guarda con la fecha y la hora, junto con una copia del contrato tal como está ahora.</p>';
    h.pie.innerHTML = '<div class="botonera">' +
      '<button type="button" class="btn btn-sec" data-cancelar>' + (esCliente ? 'Cancelar' : 'Sin fiador') + '</button>' +
      '<button type="button" class="btn" data-seguir>' + (esCliente && conFiador ? 'Siguiente' : 'Guardar firma' + (conFiador ? 's' : '')) + '</button></div>';
    lienzo = crearLienzoFirma(h.$('#fmLienzo'));
    h.$('[data-leer]').onclick = function () { imprimirContrato(null, d); };
    h.$('[data-cancelar]').onclick = async function () {
      if (esCliente) {
        if (await confirmar({ titulo: 'Cancelar', mensaje: '¿Salir sin firmar? Se puede firmar después desde la ficha del cliente.', boton: 'Salir' })) { lienzo.quitar(); h.cerrar(); }
        return;
      }
      if (await confirmar({ titulo: 'Sin firma del fiador', mensaje: '¿Guardar solo con la firma del cliente?', boton: 'Guardar' })) guardar();
    };
    protegerBoton(h.$('[data-seguir]'), async function () {
      if (lienzo.vacio()) { toast(esCliente ? 'Falta la firma del cliente' : 'Falta la firma del fiador', 'error'); return; }
      firmas[paso] = await lienzo.imagen();
      if (esCliente && conFiador) { paso = 'fiador'; pintar(); window.scrollTo(0, 0); return; }
      await guardar();
    });
  }
  async function guardar() {
    var nombre = function (k) { return 'firma-' + k + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + '.jpg'; };
    var op = {
      clave: clave, tipo: 'firma', venta_id: o.ventaId || null, venta_clave: o.ventaId ? null : o.ventaClave,
      cliente_id: cli.pendiente ? null : (cli.id || null), cliente_clave: cli.pendiente ? cli.clave : null,
      nombres: { cliente: nombre('cliente'), fiador: firmas.fiador ? nombre('fiador') : null },
      condiciones: condiciones, hecho_en: new Date().toISOString(), reemplazar: !!o.reemplazar,
      resumen: { texto: 'Firma del contrato de ' + (cli.nombre || 'cliente') }
    };
    try { await BD.put('fotos', { cliente: firmas.cliente, fiador: firmas.fiador || null }, clave); }
    catch (e) { toast('No se pudo guardar la firma en el teléfono.', 'error'); return; }
    var r;
    try { r = await enviarYEsperar(op, 25000); }
    catch (e) { toast(errMsg(e), 'error'); return; }
    lienzo.quitar();
    h.cerrar();
    if (r.estado === 'ok') {
      toast('Contrato firmado', 'ok');
      if (r.resultado && r.resultado.cliente_id) { try { await recargarCliente(r.resultado.cliente_id); } catch (e) { /* luego */ } }
    } else toast('Sin señal: la firma quedó guardada en el teléfono y se envía sola.', '', 5000);
    repintar();
    if (o.alFirmar) o.alFirmar(r);
  }
  pintar();
}

// Enlaces para ver las firmas (de la base, o del teléfono si todavía no han subido)
async function imagenesFirma(v) {
  var out = {};
  var op = firmaEnCola(v.id, v.clave);
  if (op) {
    try {
      var imgs = await BD.get('fotos', op.clave);
      if (imgs && imgs.cliente) out.cliente = URL.createObjectURL(imgs.cliente);
      if (imgs && imgs.fiador) out.fiador = URL.createObjectURL(imgs.fiador);
      out.enCola = true; out.en = op.hecho_en;
    } catch (e) { /* nada */ }
    return out;
  }
  if (!v.firma_cliente) return out;
  out.en = v.firmado_en; out.por = v.firmado_por;
  var rutas = { cliente: v.firma_cliente, fiador: v.firma_fiador };
  for (var k in rutas) {
    if (!rutas[k]) continue;
    try {
      var r = await sb.storage.from('fotos').createSignedUrl(rutas[k], 1800);
      if (!r.error) out[k] = r.data.signedUrl;
    } catch (e) { out.sinSenal = true; }
  }
  return out;
}
