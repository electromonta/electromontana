// Electro Montana — abonos: registrar un pago, recibo por WhatsApp, detalle y la pantalla Cobros.
'use strict';

/* ======================= Registrar abono ======================= */
function hojaAbono(cliId, ventaId) {
  var c = ST.cliPorId.get(cliId);
  if (!c) return;
  var activas = ventasActivas(cliId);
  if (!activas.length) { toast('Este cliente no tiene ventas pendientes.', 'error'); return; }
  var dueno = esDueno();
  var metodos = ST.metodos.filter(function (m) { return m.activo; });
  // Una sola clave por ventana: si se toca Guardar otra vez (o se reintenta), la base no lo repite
  var A = { venta: ventaId || (activas.length === 1 ? activas[0].id : null), metodo: metodos.length ? metodos[0].id : null,
            tasa: Number(ST.cfg.tasa_bs) || 0, foto: null, clave: nuevaClave() };

  var h = abrirHoja({
    titulo: 'Abono de ' + c.nombre.split(' ')[0], completa: true,
    html: '<div class="tarjeta"><div class="fila-sep"><span class="tenue">Debe en total</span><span class="monto" id="abDebe"></span></div>' +
        '<div id="abVentas"></div></div>' +
      '<div class="pila" style="margin-top:14px">' +
        '<div class="campo"><span>Cómo pagó</span><div class="metodos" id="abMetodos">' + metodos.map(function (m) {
          return '<button type="button" class="chip" data-m="' + m.id + '">' + esc(m.nombre) + '</button>';
        }).join('') + '</div></div>' +
        '<label class="campo"><span id="abEtqMonto">Monto</span><input id="abMonto" inputmode="decimal" placeholder="0,00" autocomplete="off"></label>' +
        '<div class="fila envolver" id="abRapidos" style="gap:8px"></div>' +
        '<div id="abTasaCampo" hidden><label class="campo"><span>Tasa (Bs por $)</span><input id="abTasa" inputmode="decimal"' + (dueno ? '' : ' readonly') + '></label>' +
          '<p class="chico" id="abEquiv" style="margin:6px 0 0"></p></div>' +
        '<label class="campo" id="abRefCampo" hidden><span>Referencia</span><input id="abRef" placeholder="Número de confirmación"></label>' +
        '<div class="fotos"><button type="button" class="foto-btn" id="abFoto"><span class="foto-mini">' + icono('camara') + '</span><span>Foto del comprobante (opcional)</span></button></div>' +
        (dueno ? '<div class="dos"><label class="campo"><span>Fecha</span><input type="date" id="abFecha" value="' + hoyCaracas() + '" max="' + hoyCaracas() + '"></label>' +
          '<label class="campo"><span>Lo recibió</span><select id="abRecibe">' + ST.usuarios.filter(function (u) { return u.activo; }).map(function (u) {
            return '<option value="' + u.id + '"' + (u.id === ST.yo.id ? ' selected' : '') + '>' + esc(u.nombre) + '</option>';
          }).join('') + '</select></label></div>' : '') +
        '<label class="campo"><span>Nota (opcional)</span><input id="abNota"></label>' +
      '</div>',
    pie: '<button type="button" class="btn btn-ancho" id="abGuardar">Guardar abono</button>'
  });

  function deudaObjetivo() {
    var lista = A.venta ? activas.filter(function (v) { return v.id === A.venta; }) : activas;
    return redondear2(lista.reduce(function (s, v) { return s + estadoDe(v).saldo; }, 0));
  }
  function proximaObjetivo() {
    var lista = A.venta ? activas.filter(function (v) { return v.id === A.venta; }) : activas, p = null, atraso = 0;
    lista.forEach(function (v) { var e = estadoDe(v); atraso += e.atraso; if (e.proxima && (!p || e.proxima.fecha < p.fecha)) p = e.proxima; });
    return { proxima: p, atraso: redondear2(atraso) };
  }
  function metodo() { return metodoPorId(A.metodo); }
  function montoUsd() {
    var m = metodo(), v = parseNum(h.$('#abMonto').value);
    if (!m || !(v > 0)) return 0;
    v = redondear2(v);
    if (m.moneda === 'USD') return v;
    return A.tasa > 0 ? redondear2(v / A.tasa) : 0;
  }
  function enMoneda(usd) { var m = metodo(); return m && m.moneda === 'VES' ? redondear2(usd * A.tasa) : usd; }

  function pintarVentas() {
    h.$('#abDebe').textContent = fmtUSD(resumenCliente(cliId).saldo);
    if (activas.length < 2) { h.$('#abVentas').innerHTML = ''; return; }
    h.$('#abVentas').innerHTML = '<div class="campo" style="margin-top:10px"><span>¿A qué venta?</span><div class="lista" id="abElegirVenta">' +
      '<button type="button" class="item' + (A.venta ? '' : ' activo') + '" data-v="" style="min-height:48px">' + marcaRadio(!A.venta) + '<div class="crece">A la cuenta <span class="tenue chico">(primero la más vieja)</span></div></button>' +
      activas.map(function (v) {
        return '<button type="button" class="item" data-v="' + v.id + '" style="min-height:48px">' + marcaRadio(A.venta === v.id) +
          '<div class="crece"><div class="cortar">#' + v.numero + ' ' + esc(descripcionVenta(v)) + '</div></div><div class="num">' + fmtUSD(estadoDe(v).saldo) + '</div></button>';
      }).join('') + '</div></div>';
  }
  function marcaRadio(on) {
    return '<span style="width:22px;height:22px;border-radius:50%;border:2px solid ' + (on ? 'var(--cobre)' : 'var(--borde-fuerte)') + ';display:grid;place-items:center;flex:none">' +
      (on ? '<span style="width:10px;height:10px;border-radius:50%;background:var(--cobre)"></span>' : '') + '</span>';
  }
  function pintarMetodo() {
    var m = metodo();
    $$('#abMetodos .chip', h.el).forEach(function (b) { b.classList.toggle('activo', Number(b.dataset.m) === A.metodo); });
    var ves = m && m.moneda === 'VES';
    h.$('#abEtqMonto').textContent = ves ? 'Monto en bolívares' : 'Monto en dólares';
    h.$('#abTasaCampo').hidden = !ves;
    h.$('#abRefCampo').hidden = !(m && m.pide_referencia);
    if (ves) h.$('#abTasa').value = A.tasa > 0 ? numCampo(A.tasa) : '';
    pintarRapidos();
    pintarEquiv();
  }
  function pintarRapidos() {
    var po = proximaObjetivo(), deuda = deudaObjetivo(), m = metodo(), btns = [];
    if (po.atraso > 0) btns.push(['Lo atrasado', po.atraso]);
    else if (po.proxima) btns.push(['La cuota', po.proxima.pendiente]);
    if (deuda > 0) btns.push(['Todo', deuda]);
    h.$('#abRapidos').innerHTML = btns.map(function (b) {
      var val = enMoneda(b[1]);
      return '<button type="button" class="btn btn-sec btn-chico" data-rapido="' + val + '">' + b[0] + ' ' + (m && m.moneda === 'VES' ? fmtBs(val) : fmtUSD(val)) + '</button>';
    }).join('');
  }
  function pintarEquiv() {
    var m = metodo(), el = h.$('#abEquiv');
    if (!m || m.moneda !== 'VES') return;
    if (!(A.tasa > 0)) { el.innerHTML = '<span class="suma-mal">Falta la tasa del día.</span>'; return; }
    var usd = montoUsd();
    el.innerHTML = (usd > 0 ? 'Equivale a <b class="num">' + fmtUSD(usd) + '</b>' : '') + (tasaDeHoy() ? '' : ' <span class="suma-mal">La tasa no es de hoy.</span>');
  }

  h.cuerpo.addEventListener('click', async function (e) {
    var b;
    if ((b = e.target.closest('[data-v]'))) { A.venta = b.dataset.v ? Number(b.dataset.v) : null; pintarVentas(); pintarRapidos(); return; }
    if ((b = e.target.closest('[data-m]'))) { A.metodo = Number(b.dataset.m); h.$('#abMonto').value = ''; pintarMetodo(); return; }
    if ((b = e.target.closest('[data-rapido]'))) { h.$('#abMonto').value = numCampo(Number(b.dataset.rapido)); pintarEquiv(); return; }
    if (e.target.closest('#abFoto')) {
      var blob = await elegirFoto();
      if (!blob) return;
      A.foto = blob;
      h.$('#abFoto .foto-mini').outerHTML = '<img class="foto-mini" src="' + URL.createObjectURL(blob) + '" alt="">';
    }
  });
  h.$('#abMonto').addEventListener('input', pintarEquiv);
  h.$('#abTasa').addEventListener('input', function () { var t = parseNum(this.value); A.tasa = t > 0 ? t : 0; pintarEquiv(); pintarRapidos(); });

  protegerBoton(h.$('#abGuardar'), async function () {
    var m = metodo();
    if (!m) { toast('Elige cómo pagó', 'error'); return; }
    var monto = redondear2(parseNum(h.$('#abMonto').value));
    if (!(monto > 0)) { toast('Escribe el monto', 'error'); h.$('#abMonto').focus(); return; }
    if (m.moneda === 'VES' && !(A.tasa > 0)) { toast('Falta la tasa del día', 'error'); return; }
    var usd = montoUsd(), deuda = deudaObjetivo();
    if (usd > deuda + 0.004) { toast('El abono (' + fmtUSD(usd) + ') es mayor que lo que debe (' + fmtUSD(deuda) + ')', 'error'); return; }
    var datos = {
      cliente_id: cliId, venta_id: A.venta || null, metodo_id: m.id, monto: monto, tasa: m.moneda === 'VES' ? A.tasa : null,
      monto_usd: usd, referencia: m.pide_referencia ? h.$('#abRef').value.trim() : '', nota: h.$('#abNota').value.trim(),
      fecha: dueno ? (h.$('#abFecha').value || hoyCaracas()) : hoyCaracas(), hecho_en: new Date().toISOString()
    };
    if (dueno) datos.recibido_por = h.$('#abRecibe').value;
    var op = { clave: A.clave, tipo: 'abono', datos: datos, resumen: { texto: 'Abono de ' + c.nombre + ' por ' + fmtUSD(usd) } };
    var r;
    try {
      r = await enviarYEsperar(op);
    } catch (e) {
      if (e && e.code === 'EM001' && await confirmar({ titulo: 'Referencia repetida', mensaje: errMsg(e) + ' ¿Guardar igual?', boton: 'Guardar igual' })) {
        datos.forzar_referencia = true;
        r = await enviarYEsperar(op);
      } else throw e;
    }
    if (A.foto) await encolarFoto(A.foto, { tipo: 'comprobante', cliente_id: cliId, ref_clave: op.clave, nombreCliente: c.nombre });
    var saldoAntes = resumenCliente(cliId).saldo;
    if (r.estado === 'ok') { try { await recargarCliente(cliId); } catch (e) { /* luego */ } }
    h.cerrar();
    var rec = {
      cliente: c, fecha: datos.fecha, monto_usd: usd, moneda: m.moneda, monto: monto, tasa: datos.tasa, metodo: m.nombre,
      referencia: datos.referencia, recibido_por: datos.recibido_por || ST.yo.id,
      ventas: r.estado === 'ok' ? r.resultado.ventas.map(function (x) { return x.venta_id; }) : (A.venta ? [A.venta] : []),
      saldo: r.estado === 'ok' ? Number(r.resultado.saldo_cliente) : Math.max(0, redondear2(saldoAntes - usd)),
      aproximado: r.estado !== 'ok'
    };
    hojaAbonoGuardado(r.estado === 'ok', rec);
    repintar();
  });

  pintarVentas();
  pintarMetodo();
  setTimeout(function () { h.$('#abMonto').focus(); }, 120);
}

function hojaAbonoGuardado(ok, rec) {
  var h = abrirHoja({
    titulo: ok ? 'Abono registrado' : 'Guardado en el teléfono',
    html: '<div class="aviso ' + (ok ? 'aviso-ok' : 'aviso-ambar') + '">' + icono(ok ? 'check' : 'nube') + '<div>' +
      (ok ? fmtUSD(rec.monto_usd) + ' de ' + esc(rec.cliente.nombre) + '. Ahora debe <b>' + fmtUSD(rec.saldo) + '</b>.'
          : 'No hay señal. El abono quedó guardado en este teléfono y se enviará solo. Debe aproximadamente ' + fmtUSD(rec.saldo) + '.') + '</div></div>',
    pie: '<div class="pila"><button type="button" class="btn btn-ancho" id="agRecibo">' + icono('chat') + 'Enviar recibo por WhatsApp</button>' +
      '<button type="button" class="btn btn-sec btn-ancho" id="agListo">Listo</button></div>'
  });
  h.$('#agRecibo').onclick = function () { abrirWhatsApp(textoRecibo(rec), rec.cliente.telefono || rec.cliente.contacto_telefono); };
  h.$('#agListo').onclick = function () { h.cerrar(); };
}

// Recibo en texto (WhatsApp pone en negrita lo que va entre asteriscos)
function textoRecibo(rec) {
  var c = rec.cliente, r = resumenCliente(c.id);
  var lineas = ['*ELECTRO MONTANA*', 'Recibo de abono', '',
    'Cliente: ' + c.nombre,
    'Fecha: ' + fmtFechaAnio(rec.fecha),
    'Abono: *' + fmtUSD(rec.monto_usd) + '*' + (rec.moneda === 'VES' ? ' (' + fmtBs(rec.monto) + ' a ' + fmtTasa(rec.tasa) + ')' : '') + ' · ' + rec.metodo];
  if (rec.referencia) lineas.push('Referencia: ' + rec.referencia);
  (rec.ventas || []).forEach(function (id) { var v = ST.ventaPorId.get(id); if (v) lineas.push('Contrato #' + v.numero + ': ' + descripcionVenta(v)); });
  lineas.push('Saldo pendiente: *' + fmtUSD(rec.saldo) + '*' + (rec.aproximado ? ' (aproximado)' : ''));
  if (r.proxima && rec.saldo > 0.004 && !rec.aproximado) lineas.push('Próxima cuota: ' + fmtUSD(r.proxima.pendiente) + ' el ' + fmtFechaAnio(r.proxima.fecha));
  if (rec.saldo <= 0.004) lineas.push('Su cuenta quedó pagada. ¡Gracias por su confianza!');
  lineas.push('Recibido por: ' + nombreUsuario(rec.recibido_por), '', 'Gracias por su pago.');
  return lineas.join('\n');
}

/* ======================= Detalle de un abono ======================= */
function hojaDetalleAbono(filas, alCambiar) {
  if (!filas || !filas.length) return;
  var a = filas[0], c = ST.cliPorId.get(a.cliente_id) || { nombre: 'Cliente', id: a.cliente_id };
  var usd = redondear2(filas.reduce(function (s, x) { return s + Number(x.monto_usd); }, 0));
  var mon = redondear2(filas.reduce(function (s, x) { return s + Number(x.monto); }, 0));
  var met = a.tipo === 'antes_del_sistema' ? 'Pagado antes del sistema' : ((metodoPorId(a.metodo_id) || {}).nombre || '');
  function d(etq, val) { return val ? '<div class="dato"><span>' + etq + '</span><span class="crece">' + val + '</span></div>' : ''; }
  var h = abrirHoja({
    titulo: 'Abono',
    html: (a.anulado_en ? '<div class="aviso aviso-error" style="margin-bottom:12px">' + icono('alerta') + '<div>Anulado el ' + esc(fmtFechaHora(a.anulado_en)) + ' por ' + esc(nombreUsuario(a.anulado_por)) + ': ' + esc(a.motivo_anulacion || '') + '</div></div>' : '') +
      '<div class="tarjeta">' +
      d('Cliente', esc(c.nombre)) +
      d('Monto', '<b class="num">' + fmtUSD(usd) + '</b>' + (a.moneda === 'VES' ? ' (' + fmtBs(mon) + ' a ' + fmtTasa(a.tasa) + ')' : '')) +
      d('Fecha', esc(fmtFechaAnio(a.fecha))) + d('Cómo pagó', esc(met)) + d('Referencia', esc(a.referencia || '')) +
      d('Lo recibió', a.recibido_por ? esc(nombreUsuario(a.recibido_por)) : '') +
      d('Venta', filas.map(function (x) { var v = ST.ventaPorId.get(x.venta_id); return v ? '#' + v.numero + ' (' + fmtUSD(x.monto_usd) + ')' : ''; }).filter(Boolean).join(', ')) +
      d('Anotado', esc(fmtFechaHora(a.hecho_en || a.creado_en)) + ' por ' + esc(nombreUsuario(a.creado_por))) +
      d('Nota', esc(a.nota || '')) +
      (a.entrega_id ? d('Entregado', 'Sí, en una entrega de efectivo') : '') +
      '</div>',
    pie: '<div class="pila">' + (!a.anulado_en && a.tipo !== 'antes_del_sistema' ? '<button type="button" class="btn btn-ancho" id="daRecibo">' + icono('chat') + 'Enviar recibo por WhatsApp</button>' : '') +
      '<div class="botonera">' +
        (a.comprobante ? '<button type="button" class="btn btn-sec" id="daVerFoto">' + icono('foto') + 'Comprobante</button>' : '<button type="button" class="btn btn-sec" id="daFoto">' + icono('camara') + 'Comprobante</button>') +
        (esDueno() && !a.anulado_en ? '<button type="button" class="btn btn-sec" id="daAnular" style="color:var(--rojo)">Anular</button>' : '') +
      '</div></div>'
  });
  var b = h.$('#daRecibo');
  if (b) b.onclick = function () {
    abrirWhatsApp(textoRecibo({ cliente: c, fecha: a.fecha, monto_usd: usd, moneda: a.moneda, monto: mon, tasa: a.tasa, metodo: met,
      referencia: a.referencia, recibido_por: a.recibido_por, ventas: filas.map(function (x) { return x.venta_id; }), saldo: resumenCliente(c.id).saldo }),
      c.telefono || c.contacto_telefono);
  };
  if ((b = h.$('#daVerFoto'))) b.onclick = function () { verFoto(a.comprobante, 'Comprobante'); };
  if ((b = h.$('#daFoto'))) b.onclick = async function () {
    var blob = await elegirFoto();
    if (!blob) return;
    await encolarFoto(blob, { tipo: 'comprobante', cliente_id: c.id, ref_clave: a.grupo, nombreCliente: c.nombre });
    toast('Foto guardada. Se sube sola.', 'ok'); h.cerrar();
  };
  if ((b = h.$('#daAnular'))) b.onclick = async function () {
    var motivo = await confirmar({ titulo: 'Anular abono', mensaje: 'El abono de ' + fmtUSD(usd) + ' deja de contar y la deuda vuelve a subir.', pedir: 'Por qué se anula', boton: 'Anular', peligro: true });
    if (!motivo) return;
    try {
      await rpc('anular_abono', { p_grupo: a.grupo, p_motivo: motivo });
      await recargarCliente(c.id);
      h.cerrar(); toast('Abono anulado', 'ok');
      if (alCambiar) alCambiar();
      repintar();
    } catch (e) { toast(errMsg(e), 'error'); }
  };
}

/* ======================= Pantalla Cobros ======================= */
var VistaCobros = (function () {
  var raiz = null, rango = 'hoy', desde = null, hasta = null, verAnulados = false, filas = null, error = null;

  function calcularRango() {
    var hoy = hoyCaracas();
    if (rango === 'hoy') { desde = hasta = hoy; }
    else if (rango === 'ayer') { desde = hasta = sumarDias(hoy, -1); }
    else if (rango === 'semana') { desde = sumarDias(hoy, -6); hasta = hoy; }
    else if (rango === 'mes') { desde = hoy.slice(0, 8) + '01'; hasta = hoy; }
  }

  function mostrar(c) {
    raiz = document.createElement('div');
    c.appendChild(raiz);
    if (rango !== 'elegir') calcularRango();
    raiz.innerHTML = '<div class="chips" id="coRango">' + [['hoy', 'Hoy'], ['ayer', 'Ayer'], ['semana', '7 días'], ['mes', 'Este mes'], ['elegir', 'Elegir fechas']].map(function (r) {
      return '<button type="button" class="chip' + (rango === r[0] ? ' activo' : '') + '" data-r="' + r[0] + '">' + r[1] + '</button>';
    }).join('') + '</div>' +
      '<div class="dos" id="coFechas" style="margin-top:10px"' + (rango === 'elegir' ? '' : ' hidden') + '>' +
        '<label class="campo"><span>Desde</span><input type="date" id="coDesde" value="' + esc(desde) + '"></label>' +
        '<label class="campo"><span>Hasta</span><input type="date" id="coHasta" value="' + esc(hasta) + '"></label></div>' +
      '<div id="coTotales" style="margin-top:14px"></div>' +
      '<label class="casilla" style="margin-top:6px"><input type="checkbox" id="coAnulados"' + (verAnulados ? ' checked' : '') + '> Ver también los anulados</label>' +
      '<div id="coLista"></div>';
    $('#coRango', raiz).addEventListener('click', function (e) {
      var b = e.target.closest('[data-r]'); if (!b) return;
      rango = b.dataset.r;
      $$('.chip', this).forEach(function (x) { x.classList.toggle('activo', x === b); });
      $('#coFechas', raiz).hidden = rango !== 'elegir';
      if (rango !== 'elegir') { calcularRango(); cargar(); }
    });
    $('#coDesde', raiz).addEventListener('change', function () { desde = this.value; if (desde && hasta) cargar(); });
    $('#coHasta', raiz).addEventListener('change', function () { hasta = this.value; if (desde && hasta) cargar(); });
    $('#coAnulados', raiz).addEventListener('change', function () { verAnulados = this.checked; pintar(); });
    raiz.addEventListener('click', function (e) {
      var b = e.target.closest('[data-grupo]');
      if (b) hojaDetalleAbono(filas.filter(function (a) { return a.grupo === b.dataset.grupo; }), cargar);
    });
    cargar();
  }

  async function cargar() {
    filas = null; error = null; pintar();
    try {
      filas = await traerTodo('abonos', '*', function (q) { return q.gte('fecha', desde).lte('fecha', hasta).neq('tipo', 'antes_del_sistema'); });
    } catch (e) { error = errMsg(e); }
    pintar();
  }

  function pintar() {
    if (!raiz || !raiz.isConnected) return;
    var tot = $('#coTotales', raiz), lista = $('#coLista', raiz);
    if (error) { tot.innerHTML = ''; lista.innerHTML = '<div class="aviso aviso-error" style="margin-top:12px">' + icono('sinsenal') + '<div>' + esc(error) + '</div></div>'; return; }
    if (!filas) { tot.innerHTML = ''; lista.innerHTML = '<div class="cargando">Cargando cobros…</div>'; return; }
    var vivos = filas.filter(function (a) { return !a.anulado_en; });
    var total = 0, porMetodo = new Map(), porPersona = new Map();
    vivos.forEach(function (a) {
      total += Number(a.monto_usd);
      var m = porMetodo.get(a.metodo_id) || { usd: 0, mon: 0, n: new Set() };
      m.usd += Number(a.monto_usd); m.mon += Number(a.monto); m.n.add(a.grupo); porMetodo.set(a.metodo_id, m);
      var p = porPersona.get(a.recibido_por) || { usd: 0, n: new Set() };
      p.usd += Number(a.monto_usd); p.n.add(a.grupo); porPersona.set(a.recibido_por, p);
    });
    var n = new Set(vivos.map(function (a) { return a.grupo; })).size;
    tot.innerHTML = '<div class="kpi"><div class="etq">Cobrado ' + (desde === hasta ? fmtFechaAnio(desde) : fmtFecha(desde) + ' al ' + fmtFecha(hasta)) + '</div>' +
      '<div class="val" style="color:var(--verde)">' + fmtUSD(total) + '</div><div class="sub">' + plural(n, 'abono', 'abonos') + '</div></div>' +
      (porMetodo.size ? '<div class="tarjeta" style="margin-top:10px"><h3 style="margin-bottom:6px">Por método</h3>' + Array.from(porMetodo.entries()).map(function (e) {
        var m = metodoPorId(e[0]) || { nombre: '—', moneda: 'USD' };
        return '<div class="dato"><span>' + esc(m.nombre) + '</span><span class="crece num" style="text-align:right">' +
          (m.moneda === 'VES' ? fmtBs(e[1].mon) + ' <span class="tenue">(' + fmtUSD(e[1].usd) + ')</span>' : fmtUSD(e[1].usd)) +
          ' <span class="tenue chico">· ' + e[1].n.size + '</span></span></div>';
      }).join('') + '</div>' : '') +
      (esDueno() && porPersona.size ? '<div class="tarjeta" style="margin-top:10px"><h3 style="margin-bottom:6px">Quién lo recibió</h3>' + Array.from(porPersona.entries()).map(function (e) {
        return '<div class="dato"><span>' + esc(nombreUsuario(e[0])) + '</span><span class="crece num" style="text-align:right">' + fmtUSD(e[1].usd) + ' <span class="tenue chico">· ' + e[1].n.size + '</span></span></div>';
      }).join('') + '</div>' : '');
    var mostrar = verAnulados ? filas : vivos;
    var grupos = agruparAbonos(mostrar);
    if (!grupos.length) { lista.innerHTML = '<div class="vacio">' + icono('cobros') + '<p>No hay abonos en estas fechas.</p></div>'; return; }
    var porDia = new Map();
    grupos.forEach(function (g) { var f = g[0].fecha; if (!porDia.has(f)) porDia.set(f, []); porDia.get(f).push(g); });
    lista.innerHTML = Array.from(porDia.entries()).map(function (e) {
      var sum = e[1].reduce(function (s, g) { return s + (g[0].anulado_en ? 0 : g.reduce(function (t, x) { return t + Number(x.monto_usd); }, 0)); }, 0);
      return '<div class="seccion"><div class="seccion-tit"><h3>' + esc(fmtFechaLarga(e[0])) + '</h3><span class="tenue num">' + fmtUSD(sum) + '</span></div>' +
        '<div class="lista">' + e[1].map(function (g) { return filaAbono(g, true); }).join('') + '</div></div>';
    }).join('');
  }

  return { mostrar: mostrar, refrescar: cargar };
})();
