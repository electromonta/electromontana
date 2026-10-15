// Electro Montana — cambios a una venta (solo dueños): recargo, descuento, más tiempo, retiro,
// devolución, cerrar, reabrir, anular y costo de lo vendido.
'use strict';

async function accionVenta(accion, v) {
  if (!v || !esDueno()) return;
  var e = estadoDe(v), cli = ST.cliPorId.get(v.cliente_id) || {};
  var hecho = false;
  try {
    if (accion === 'recargo') hecho = await hojaAjuste(v, 'recargo');
    else if (accion === 'descuento') hecho = await hojaAjuste(v, 'descuento');
    else if (accion === 'tiempo') hecho = await hojaReprogramar(v);
    else if (accion === 'retirar') {
      var m1 = await confirmar({ titulo: 'Retirar mercancía', pedir: 'Qué pasó', boton: 'Retirar',
        mensajeHtml: '<p>Se anota que se le retiró el artículo a ' + esc(cli.nombre) + '.</p><p>La venta <b>sigue activa</b>: sigue debiendo ' + fmtUSD(e.saldo) +
          ' y se le devuelve cuando termine de pagar, como dice el contrato.</p>' });
      if (m1) { await rpc('retirar_mercancia', { p_venta: v.id, p_motivo: m1 }); hecho = true; }
    } else if (accion === 'devolver') {
      var debe = e.saldo > 0.004;
      var m2 = await confirmar({ titulo: 'Devolver mercancía', boton: 'Devolver', pedir: debe ? 'Por qué se le devuelve antes de pagar' : 'Nota (opcional)', obligatorio: debe,
        mensajeHtml: debe ? '<p>Todavía debe <b>' + fmtUSD(e.saldo) + '</b>.</p>' : '<p>Ya pagó todo. Se anota que se le devolvió el artículo.</p>' });
      if (m2 !== null && m2 !== false) { await rpc('devolver_mercancia', { p_venta: v.id, p_nota: m2 || '' }); hecho = true; }
    } else if (accion === 'cerrar') {
      var m3 = await confirmar({ titulo: 'Cerrar venta', pedir: 'Por qué se cierra', boton: 'Cerrar venta', peligro: true,
        mensajeHtml: '<p>Se deja de cobrar lo que falta (<b>' + fmtUSD(e.saldo) + '</b>). Lo abonado no se devuelve.</p><p>Úsalo cuando el cliente no va a pagar más (por ejemplo, la mercancía se retiró y se volvió a vender). Se puede reabrir después.</p>' });
      if (m3) { await rpc('cerrar_venta', { p_venta: v.id, p_motivo: m3 }); hecho = true; }
    } else if (accion === 'reabrir') {
      var m4 = await confirmar({ titulo: 'Reabrir venta', pedir: 'Motivo', boton: 'Reabrir', mensaje: 'La venta vuelve a cobrarse con lo que faltaba.' });
      if (m4) { await rpc('reabrir_venta', { p_venta: v.id, p_motivo: m4 }); hecho = true; }
    } else if (accion === 'reingresar') {
      hecho = await hojaReingresar(v);
    } else if (accion === 'anular') {
      var m5 = await confirmar({ titulo: 'Anular venta #' + v.numero, pedir: 'Por qué se anula', boton: 'Anular', peligro: true,
        mensaje: 'Solo para ventas registradas por error. Si tiene abonos, primero hay que anularlos. No se puede deshacer.' });
      if (m5) { await rpc('anular_venta', { p_venta: v.id, p_motivo: m5 }); hecho = true; }
    }
  } catch (err) { toast(errMsg(err), 'error'); return; }
  if (hecho) {
    try { await recargarCliente(v.cliente_id); } catch (err) { /* luego */ }
    toast('Listo', 'ok');
    repintar();
  }
}

function hojaAjuste(v, tipo) {
  return new Promise(function (resolver) {
    var e = estadoDe(v), listo = false;
    var h = abrirHoja({
      titulo: tipo === 'recargo' ? 'Recargo por demora' : 'Descuento',
      html: '<p class="tenue">' + (tipo === 'recargo' ? 'Se suma a lo que debe y queda como una cuota en la fecha que pongas.' : 'Se resta de lo que debe, empezando por las últimas cuotas.') +
        ' Debe ahora ' + fmtUSD(e.saldo) + '.</p><div class="pila">' +
        '<label class="campo"><span>Monto $</span><input id="ajMonto" inputmode="decimal"></label>' +
        (tipo === 'recargo' ? '<label class="campo"><span>Para cobrar el</span><input type="date" id="ajFecha" value="' + hoyCaracas() + '"></label>' : '') +
        '<label class="campo"><span>Motivo</span><input id="ajMotivo" placeholder="' + (tipo === 'recargo' ? 'Ej.: 2 semanas de atraso' : 'Ej.: pagó todo antes') + '"></label></div>',
      pie: '<button type="button" class="btn btn-ancho" id="ajGuardar">Guardar</button>',
      alCerrar: function () { if (!listo) resolver(false); }
    });
    protegerBoton(h.$('#ajGuardar'), async function () {
      var monto = parseNum(h.$('#ajMonto').value), motivo = h.$('#ajMotivo').value.trim();
      if (!(monto > 0)) { toast('Escribe el monto', 'error'); return; }
      if (!motivo) { toast('Escribe el motivo', 'error'); return; }
      await rpc('ajustar_venta', { p_venta: v.id, p_tipo: tipo, p_monto: redondear2(monto), p_motivo: motivo,
                                   p_fecha: tipo === 'recargo' ? (h.$('#ajFecha').value || null) : null });
      listo = true; h.cerrar(); resolver(true);
    });
  });
}

// La mercancía retirada de una venta cerrada vuelve a la tienda (para venderla otra vez)
function hojaReingresar(v) {
  return new Promise(function (resolver) {
    var listo = false, sede = 'pedraza';
    var its = (ST.itemsPorVenta.get(v.id) || []).filter(function (i) { return i.producto_id; });
    var h = abrirHoja({
      titulo: 'Volver a la tienda',
      html: '<p>Lo que se le retiró al cliente vuelve a la mercancía de la tienda para venderlo otra vez:</p>' +
        '<div class="lista" style="margin:8px 0 12px">' + its.map(function (i) { return '<div class="dato"><span>' + i.cantidad + ' ×</span><span class="crece">' + esc(i.descripcion) + '</span></div>'; }).join('') + '</div>' +
        '<div class="seg" id="riSede"><button type="button" data-s="pedraza" class="activo">Pedraza</button><button type="button" data-s="socopo">Socopó</button></div>' +
        '<label class="campo" style="margin-top:12px"><span>Nota (opcional)</span><input id="riNota" placeholder="Ej.: en buen estado"></label>',
      pie: '<button type="button" class="btn btn-ancho" id="riGuardar">Volver a la tienda</button>',
      alCerrar: function () { if (!listo) resolver(false); }
    });
    h.$('#riSede').addEventListener('click', function (e) {
      var b = e.target.closest('[data-s]'); if (!b) return;
      sede = b.dataset.s;
      $$('button', this).forEach(function (x) { x.classList.toggle('activo', x === b); });
    });
    protegerBoton(h.$('#riGuardar'), async function () {
      await rpc('reingresar_mercancia', { p_venta: v.id, p_sede: sede, p_nota: h.$('#riNota').value.trim() });
      recargarExistencias().catch(function () {});
      listo = true; h.cerrar(); resolver(true);
    });
  });
}

// Más tiempo: un calendario nuevo para lo que falta
function hojaReprogramar(v) {
  return new Promise(function (resolver) {
    var e = estadoDe(v), listo = false, saldo = e.saldo;
    var R = { frecuencia: v.frecuencia === 'personalizada' || v.frecuencia === 'contado' ? 'semanal' : v.frecuencia, numero: 4, primera: Cuentas.primeraSugerida(hoyCaracas(), 'semanal') };
    R.primera = Cuentas.primeraSugerida(hoyCaracas(), R.frecuencia);
    var h = abrirHoja({
      titulo: 'Más tiempo', completa: true,
      html: '<p>Se arma un calendario nuevo para lo que falta: <b>' + fmtUSD(saldo) + '</b>. Las cuotas de antes quedan en el historial.</p>' +
        '<div class="chips" id="rpFrec">' + [['semanal', 'Semanal'], ['quincenal', 'Quincenal'], ['mensual', 'Mensual']].map(function (f) {
          return '<button type="button" class="chip' + (R.frecuencia === f[0] ? ' activo' : '') + '" data-f="' + f[0] + '">' + f[1] + '</button>';
        }).join('') + '</div>' +
        '<div class="dos" style="margin-top:10px"><label class="campo"><span>Número de cuotas</span><input id="rpNum" inputmode="numeric" value="4"></label>' +
        '<label class="campo"><span>Primera cuota</span><input type="date" id="rpPrimera" value="' + R.primera + '"></label></div>' +
        '<div id="rpVista" style="margin-top:12px"></div>' +
        '<label class="campo" style="margin-top:12px"><span>Motivo</span><input id="rpMotivo" placeholder="Ej.: se quedó sin trabajo, pidió más tiempo"></label>',
      pie: '<button type="button" class="btn btn-ancho" id="rpGuardar">Guardar calendario nuevo</button>',
      alCerrar: function () { if (!listo) resolver(false); }
    });
    function lista() { return Cuentas.generarCuotas({ monto: saldo, frecuencia: R.frecuencia, primera: R.primera, numero: R.numero }); }
    function pintar() {
      h.$('#rpVista').innerHTML = '<div class="cuotas">' + lista().map(function (c, i) {
        return '<div class="cuota"><span class="marca"></span><div class="crece">Cuota ' + (i + 1) + ' · ' + esc(fmtFechaAnio(c.fecha)) + '</div><div class="num fuerte">' + fmtUSD(c.monto) + '</div></div>';
      }).join('') + '</div>';
    }
    h.$('#rpFrec').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-f]'); if (!b) return;
      R.frecuencia = b.dataset.f;
      $$('.chip', this).forEach(function (x) { x.classList.toggle('activo', x === b); });
      R.primera = Cuentas.primeraSugerida(hoyCaracas(), R.frecuencia);
      h.$('#rpPrimera').value = R.primera;
      pintar();
    });
    h.$('#rpNum').addEventListener('input', function () { var n = parseInt(this.value, 10); R.numero = n > 0 ? Math.min(n, 200) : 1; pintar(); });
    h.$('#rpPrimera').addEventListener('change', function () { if (this.value) { R.primera = this.value; pintar(); } });
    protegerBoton(h.$('#rpGuardar'), async function () {
      var motivo = h.$('#rpMotivo').value.trim();
      if (!motivo) { toast('Escribe el motivo', 'error'); return; }
      var cs = lista().map(function (c) { return { fecha: c.fecha, monto: c.monto }; });
      if (!cs.length) { toast('Revisa el número de cuotas', 'error'); return; }
      await rpc('reprogramar_venta', { p_venta: v.id, p_frecuencia: R.frecuencia, p_cuotas: cs, p_motivo: motivo });
      listo = true; h.cerrar(); resolver(true);
    });
    pintar();
  });
}

async function hojaCosto(itemId) {
  var it = ST.items.find(function (i) { return i.id === itemId; });
  if (!it) return;
  var actual = ST.costoPorItem.get(itemId);
  var val = await confirmar({ titulo: 'Costo de ' + it.descripcion, mensaje: 'Lo que costó cada uno (para calcular la ganancia).', pedir: 'Costo $ por unidad', tipo: 'numero', valor: actual != null ? numCampo(actual) : '', boton: 'Guardar' });
  if (val === null || val === false) return;
  var c = parseNum(val);
  if (!(c >= 0)) { toast('Costo no válido', 'error'); return; }
  try {
    await rpc('poner_costo', { p_item: itemId, p_costo: redondear2(c) });
    var v = ST.ventaPorId.get(it.venta_id);
    await recargarCliente(v.cliente_id);
    recargarProductos().catch(function () {});
    toast('Costo guardado', 'ok'); repintar();
  } catch (e) { toast(errMsg(e), 'error'); }
}
