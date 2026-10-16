// Electro Montana — clientes: lista, ficha (lo que debe, ventas, abonos, datos) y formulario.
'use strict';

/* ======================= Lista ======================= */
var VistaClientes = (function () {
  var filtro = 'todos', busca = '', raiz = null;

  function mostrar(c) {
    raiz = document.createElement('div');
    c.appendChild(raiz);
    var chips = [['todos', 'Todos'], ['deben', 'Con deuda'], ['atrasados', 'Atrasados'], ['exterior', 'Exterior']];
    if (esDueno()) chips.push(['socopo', 'Socopó'], ['pedraza', 'Pedraza'], ['novender', 'No venderle']);
    raiz.innerHTML =
      '<button type="button" class="btn btn-ancho" data-nuevo>' + icono('mas') + 'Nuevo cliente</button>' +
      '<div class="buscador" style="margin-top:12px">' + icono('buscar') + '<input id="clBusca" type="search" placeholder="Nombre, cédula, teléfono o sector" value="' + esc(busca) + '"></div>' +
      '<div class="chips" style="margin-top:10px" id="clFiltro">' + chips.map(function (f) {
        return '<button type="button" class="chip' + (filtro === f[0] ? ' activo' : '') + '" data-f="' + f[0] + '">' + f[1] + '</button>';
      }).join('') + '</div>' +
      '<div id="clPendientes"></div>' +
      '<p class="tenue chico" id="clCuenta" style="margin:12px 2px 8px"></p>' +
      '<div class="lista" id="clLista"></div>';
    $('#clBusca', raiz).addEventListener('input', debounce(function (e) { busca = e.target.value; pintar(); }, 200));
    $('#clFiltro', raiz).addEventListener('click', function (e) {
      var b = e.target.closest('[data-f]'); if (!b) return;
      filtro = b.dataset.f;
      $$('.chip', this).forEach(function (x) { x.classList.toggle('activo', x === b); });
      pintar();
    });
    raiz.addEventListener('click', function (e) {
      if (e.target.closest('[data-nuevo]')) hojaCliente(null, { alGuardar: function (ref) { ir('cliente', ref); } });
    });
    pintar();
  }

  function pintar() {
    if (!raiz || !raiz.isConnected) return;
    var q = normalizar(busca.trim()), qd = busca.replace(/\D/g, '');
    var lista = ST.clientes.filter(function (c) {
      if (c.deleted_at) return false;
      if (filtro === 'exterior' && !c.en_exterior) return false;
      if ((filtro === 'socopo' || filtro === 'pedraza') && c.sede !== filtro) return false;
      if (filtro === 'novender' && !c.no_venderle) return false;
      if (filtro === 'deben' || filtro === 'atrasados') {
        var r = resumenCliente(c.id);
        if (filtro === 'deben' && !(r.saldo > 0.004)) return false;
        if (filtro === 'atrasados' && !(r.atraso > 0)) return false;
      }
      if (!q) return true;
      var txt = normalizar([c.nombre, c.sector, c.cedula, c.direccion].join(' '));
      if (txt.indexOf(q) >= 0) return true;
      if (qd.length >= 4 && (String(c.telefono || '').replace(/\D/g, '').indexOf(qd) >= 0 || String(c.cedula || '').indexOf(qd) >= 0)) return true;
      return false;
    });
    // Clientes creados sin señal (todavía en la cola)
    var pend = Cola.mias().filter(function (o) { return o.tipo === 'cliente' && !o.datos.id; });
    $('#clPendientes', raiz).innerHTML = pend.length ? '<div class="seccion-tit" style="margin-top:16px"><h3>Por enviar</h3></div><div class="lista">' +
      pend.map(function (o) {
        return '<button type="button" class="item" data-ir-cliente="c-' + o.clave + '"><div class="avatar">' + esc(iniciales(o.datos.nombre)) + '</div>' +
          '<div class="crece"><div class="item-tit">' + esc(o.datos.nombre) + '</div><div class="item-sub">' + (o.estado === 'error' ? 'Rechazado: ' + esc(o.error) : 'Se enviará cuando haya señal') + '</div></div>' +
          '<span class="etiqueta ' + (o.estado === 'error' ? 'e-rojo' : 'e-ambar') + '">' + (o.estado === 'error' ? 'Error' : 'Por enviar') + '</span></button>';
      }).join('') + '</div>' : '';
    $('#clCuenta', raiz).textContent = plural(lista.length, 'cliente', 'clientes');
    var cont = $('#clLista', raiz);
    cont.innerHTML = '';
    if (!lista.length) {
      cont.innerHTML = '<div class="vacio">' + icono('clientes') + '<p>' + (q || filtro !== 'todos' ? 'Nadie coincide con la búsqueda.' : 'Todavía no hay clientes. Toca "Nuevo cliente".') + '</p></div>';
      return;
    }
    dibujarPorPartes(cont, lista, filaCliente);
  }

  return { mostrar: mostrar, refrescar: pintar };
})();

function filaCliente(c) {
  var r = resumenCliente(c.id);
  var sub = [c.sector, esDueno() ? nombreSede(c.sede) : '', c.en_exterior ? (c.pais || 'Exterior') : ''].filter(Boolean).join(' · ');
  var der;
  if (r.saldo > 0.004) {
    der = '<div class="monto">' + fmtUSD(r.saldo) + '</div>' + (r.atraso > 0 ? '<span class="etiqueta e-rojo">Atrasado ' + textoDias(r.dias) + '</span>' : '<span class="etiqueta e-verde">Al día</span>');
  } else {
    der = '<span class="etiqueta e-gris">' + (r.activas ? 'Al día' : 'Sin deuda') + '</span>';
  }
  return '<button type="button" class="item" data-ir-cliente="' + c.id + '"><div class="avatar">' + esc(iniciales(c.nombre)) + '</div>' +
    '<div class="crece"><div class="item-tit cortar">' + esc(c.nombre) + (c.no_venderle ? ' <span class="etiqueta e-rojo">No venderle</span>' : '') + '</div>' +
    '<div class="item-sub cortar">' + esc(sub || (c.cedula ? fmtCedula(c.cedula) : '—')) + '</div></div>' +
    '<div class="item-der">' + der + '</div></button>';
}

function fmtCedula(ced) {
  if (!ced) return '';
  var m = /^([VEJPG])(\d+)$/.exec(ced);
  if (!m) return ced;
  return m[1] + '-' + Number(m[2]).toLocaleString('es-VE');
}

/* ======================= Ficha ======================= */
var VistaFicha = (function () {
  var raiz = null, cliId = null, abiertas = new Set(), abonos = null, abonosError = null;

  function mostrar(c, arg) {
    raiz = document.createElement('div');
    raiz.className = 'ficha';
    c.appendChild(raiz);
    abonos = null; abonosError = null;
    if (String(arg).indexOf('c-') === 0) { mostrarPendiente(arg.slice(2)); return; }
    cliId = Number(arg);
    raiz.addEventListener('click', alTocar);
    pintar();
    cargarAbonos();
  }

  function mostrarPendiente(clave) {
    var op = Cola.ops.find(function (o) { return o.clave === clave; });
    if (!op) {
      // Ya se envió: buscar el id real
      raiz.innerHTML = '<div class="cargando">Buscando…</div>';
      rpc('resolver_clave', { p_clave: clave }).then(function (r) {
        if (r && r.id) ir('cliente', String(r.id)); else raiz.innerHTML = '<div class="vacio">No se encontró este cliente.</div>';
      }).catch(function () { raiz.innerHTML = '<div class="vacio">Sin señal. Vuelve a intentar.</div>'; });
      return;
    }
    var d = op.datos;
    $('#tituloVista').textContent = d.nombre;
    raiz.innerHTML = '<div class="ficha-cab"><h2>' + esc(d.nombre) + '</h2>' +
      '<div class="aviso ' + (op.estado === 'error' ? 'aviso-error' : 'aviso-ambar') + '" style="margin-top:10px">' + icono(op.estado === 'error' ? 'alerta' : 'nube') +
      '<div>' + (op.estado === 'error' ? 'La base rechazó este cliente: ' + esc(op.error) : 'Este cliente se guardó en el teléfono y se enviará cuando haya señal. Ya le puedes registrar una venta.') + '</div></div>' +
      '<button type="button" class="btn btn-ancho" style="margin-top:14px" data-vender>' + icono('vender') + 'Nueva venta</button></div>';
    raiz.querySelector('[data-vender]').onclick = function () { ir('vender', 'c-' + clave); };
  }

  async function cargarAbonos() {
    try {
      abonos = await traerTodo('abonos', '*', function (q) { return q.eq('cliente_id', cliId); });
      abonosError = null;
    } catch (e) {
      abonosError = errMsg(e);
    }
    pintarAbonos();
  }

  function pintar() {
    if (!raiz || !raiz.isConnected) return;
    var c = ST.cliPorId.get(cliId);
    if (!c) { raiz.innerHTML = '<div class="vacio">' + icono('alerta') + '<p>Ese cliente no existe o no es de tu sede.</p></div>'; return; }
    $('#tituloVista').textContent = c.nombre;
    var r = resumenCliente(c.id), giros = Number(ST.cfg.giros_para_retiro) || 3;
    var ventas = (ST.ventasPorCliente.get(c.id) || []).slice().sort(function (a, b) {
      var oa = a.estado === 'activa' ? 0 : 1, ob = b.estado === 'activa' ? 0 : 1;
      return oa - ob || (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.id - a.id);
    });
    if (!abiertas.size && ventas.length === 1) abiertas.add(ventas[0].id);
    var etq = '';
    if (c.en_exterior) etq += '<span class="etiqueta e-info">Exterior' + (c.pais ? ': ' + esc(c.pais) : '') + '</span>';
    if (c.no_venderle) etq += '<span class="etiqueta e-rojo">No venderle' + (c.no_venderle_motivo ? ': ' + esc(c.no_venderle_motivo) : '') + '</span>';
    if (r.retirada) etq += '<span class="etiqueta e-gris">Mercancía retirada</span>';
    var tel = c.telefono || c.contacto_telefono;
    raiz.innerHTML =
      '<div class="ficha-cab">' +
        '<div class="fila" style="align-items:flex-start"><div class="avatar" style="width:54px;height:54px;font-size:20px">' + esc(iniciales(c.nombre)) + '</div>' +
          '<div class="crece"><h2>' + esc(c.nombre) + '</h2><div class="tenue">' +
            esc([c.cedula ? fmtCedula(c.cedula) : '', c.sector, esDueno() ? nombreSede(c.sede) : ''].filter(Boolean).join(' · ') || 'Sin cédula') + '</div>' +
            (etq ? '<div class="fila envolver" style="gap:6px;margin-top:6px">' + etq + '</div>' : '') + '</div></div>' +
        '<div class="deuda-caja"><div><div class="tenue chico">Debe</div><div class="monto-grande">' + fmtUSD(r.saldo) + '</div></div>' +
          '<div><div class="tenue chico">Atrasado</div><div class="monto-grande" style="color:' + (r.atraso > 0 ? 'var(--rojo)' : 'var(--verde)') + '">' + fmtUSD(r.atraso) + '</div>' +
          '<div class="tenue chico">' + (r.atraso > 0 ? 'desde hace ' + textoDias(r.dias) : 'al día') + '</div></div></div>' +
        (r.atraso > 0 ? (r.siguiente ? '<p class="tenue" style="margin:10px 0 0">Además, la próxima cuota: <b class="num">' + fmtUSD(r.siguiente.pendiente) + '</b> el ' + esc(fmtFechaAnio(r.siguiente.fecha)) + '</p>'
          : r.plazoVencido ? '<p class="tenue" style="margin:10px 0 0">Ya pasó la fecha de la última cuota.</p>' : '')
          : r.proxima ? '<p class="tenue" style="margin:10px 0 0">Próxima cuota: <b class="num">' + fmtUSD(r.proxima.pendiente) + '</b> el ' + esc(fmtFechaAnio(r.proxima.fecha)) + '</p>' : '') +
        (r.cuotasVencidas >= giros && !r.retirada ? '<div class="aviso aviso-ambar" style="margin-top:10px">' + icono('alerta') + '<div>Lleva ' + r.cuotasVencidas + ' cuotas sin pagar. Según el contrato, se le puede retirar la mercancía.</div></div>' : '') +
        (r.enCola > 0 ? '<div class="aviso aviso-ambar" style="margin-top:10px">' + icono('nube') + '<div>' + fmtUSD(r.enCola) + ' en abonos por enviar (todavía no se restan).</div></div>' : '') +
        (r.promesa ? '<div class="aviso ' + (r.promesa.estado === 'incumplida' ? 'aviso-error' : 'aviso-info') + '" style="margin-top:10px">' + icono('calendario') + '<div>' + esc(textoPromesa(r.promesa)) +
          (r.promesa.nota ? ': ' + esc(r.promesa.nota) : '') + '</div></div>' : '') +
        (r.activas ? '<button type="button" class="btn btn-ancho" style="margin-top:14px" data-abonar>' + icono('moneda') + 'Registrar abono</button>' : '') +
        '<div class="acciones-rapidas" style="margin-top:10px">' +
          (tel ? '<a class="accion" href="' + esc(enlaceTel(tel)) + '">' + icono('telefono') + 'Llamar</a>' : '<button type="button" class="accion" disabled>' + icono('telefono') + 'Llamar</button>') +
          '<button type="button" class="accion" data-wa' + (tel ? '' : ' disabled') + '>' + icono('chat') + 'WhatsApp</button>' +
          '<button type="button" class="accion" data-recordar' + (tel && r.activas ? '' : ' disabled') + '>' + icono('reloj') + 'Recordar</button>' +
          (c.lat != null ? '<a class="accion" href="' + esc(enlaceMapa(c.lat, c.lng)) + '" target="_blank" rel="noopener">' + icono('mapa') + 'Mapa</a>'
                         : '<button type="button" class="accion" data-ubicar>' + icono('mapa') + 'Ubicar</button>') +
        '</div>' +
      '</div>' +
      '<div class="seccion"><div class="seccion-tit"><h2>Ventas</h2><button type="button" class="btn btn-sec btn-chico" data-vender>' + icono('mas', 'ic-chico') + 'Nueva venta</button></div>' +
        (ventas.length ? ventas.map(function (v) { return tarjetaVenta(v); }).join('') : '<p class="tenue">Todavía no tiene ventas.</p>') + '</div>' +
      '<div class="seccion"><div class="seccion-tit"><h2>Abonos</h2></div><div id="fiAbonos"><div class="cargando">Cargando abonos…</div></div></div>' +
      '<div class="seccion"><div class="seccion-tit"><h2>Notas de cobro</h2><button type="button" class="btn btn-sec btn-chico" data-nota-nueva>' + icono('editar', 'ic-chico') + 'Anotar</button></div>' +
        htmlNotas(c.id) + '</div>' +
      '<div class="seccion"><div class="seccion-tit"><h2>Datos</h2><button type="button" class="btn btn-sec btn-chico" data-editar>' + icono('editar', 'ic-chico') + 'Editar</button></div>' +
        '<div class="tarjeta">' + datosCliente(c) + '</div></div>';
    pintarAbonos();
  }

  function datosCliente(c) {
    function d(etq, val) { return val ? '<div class="dato"><span>' + etq + '</span><span class="crece">' + esc(val) + '</span></div>' : ''; }
    var html = d('Cédula', fmtCedula(c.cedula)) + d('Teléfono', c.telefono) + d('Otro teléfono', c.telefono2) +
      d('Dirección', c.direccion) + d('Referencia', c.referencia) + d('Sector', c.sector) + d('Trabajo', c.trabajo) +
      (esDueno() ? d('Sede', nombreSede(c.sede)) : '') +
      (c.en_exterior ? d('Vive en', c.pais || 'el exterior') + d('Contacto aquí', [c.contacto_nombre, c.contacto_telefono].filter(Boolean).join(' · ')) : '') +
      d('Fiador', [c.fiador_nombre, fmtCedula(c.fiador_cedula), c.fiador_telefono].filter(Boolean).join(' · ')) +
      d('Casa del fiador', c.fiador_direccion) + d('Notas', c.notas) +
      (c.lat != null ? d('Ubicación', 'Guardada el ' + fmtFechaAnio(c.ubicacion_en)) : '');
    html += '<div class="fotos" style="margin-top:12px">' +
      botonFoto(c.foto, 'cliente', 'Foto del cliente') + botonFoto(c.foto_cedula, 'cedula', 'Foto de la cédula') + '</div>';
    return html || '<p class="tenue">Sin datos.</p>';
  }
  function botonFoto(ruta, tipo, etq) {
    return '<button type="button" class="foto-btn" data-foto="' + tipo + '"' + (ruta ? ' data-ruta="' + esc(ruta) + '"' : '') + '>' +
      '<span class="foto-mini">' + icono(ruta ? 'foto' : 'camara') + '</span>' + esc(ruta ? etq : 'Tomar ' + etq.toLowerCase()) + '</button>';
  }

  function tarjetaVenta(v) {
    var e = estadoDe(v), abierta = abiertas.has(v.id);
    var deuda = Number(v.total) + Number(v.ajuste);
    var pct = deuda > 0 ? Math.min(100, Math.round(Number(v.pagado) / deuda * 100)) : 100;
    var est = { activa: e.atraso > 0 ? '<span class="etiqueta e-rojo">Atrasada</span>' : '<span class="etiqueta e-verde">Al día</span>',
                pagada: '<span class="etiqueta e-verde">Pagada</span>', cerrada: '<span class="etiqueta e-gris">Cerrada</span>' }[v.estado] || '';
    if (v.mercancia === 'retirada') est += ' <span class="etiqueta e-gris">Retirada</span>';
    if (v.mercancia === 'devuelta') est += ' <span class="etiqueta e-info">Devuelta</span>';
    var enCola = enColaDeVenta(v.id);
    return '<div class="venta" data-venta="' + v.id + '">' +
      '<div class="venta-cab" data-abrir="' + v.id + '">' +
        '<div class="fila-sep"><div class="fuerte">#' + v.numero + ' · ' + esc(fmtFechaAnio(v.fecha)) + (v.origen === 'carga_inicial' ? ' <span class="etiqueta e-gris">Ya debía</span>' : '') + '</div><div>' + est + '</div></div>' +
        '<div class="tenue" style="margin-top:2px">' + esc(descripcionVenta(v)) + '</div>' +
        '<div class="fila-sep" style="margin-top:8px"><div class="tenue chico num">Total ' + fmtUSD(deuda) + ' · Pagado ' + fmtUSD(v.pagado) + '</div>' +
          '<div class="monto">' + (v.estado === 'activa' ? 'Debe ' + fmtUSD(e.saldo) : '') + '</div></div>' +
        '<div class="progreso" style="margin-top:8px"><div style="width:' + pct + '%"></div></div>' +
        (e.atraso > 0 ? '<div style="margin-top:8px"><span class="etiqueta e-rojo">Atrasado ' + fmtUSD(e.atraso) + ' · ' + textoDias(e.diasAtraso) + '</span></div>' : '') +
        (enCola > 0 ? '<div style="margin-top:8px"><span class="etiqueta e-ambar">' + fmtUSD(enCola) + ' por enviar</span></div>' : '') +
      '</div>' +
      (abierta ? '<div class="venta-det">' + detalleVenta(v, e) + '</div>' : '') +
    '</div>';
  }

  function detalleVenta(v, e) {
    var its = ST.itemsPorVenta.get(v.id) || [], dueno = esDueno();
    var costoTotal = 0, conCosto = true;
    var h = '<h3>Lo que se llevó</h3><div class="lista" style="margin:8px 0 14px">' + its.map(function (i) {
      var costo = ST.costoPorItem.get(i.id);
      if (costo == null) conCosto = false; else costoTotal += costo * i.cantidad;
      return '<div class="fila-sep" style="padding:4px 0"><div class="crece">' + i.cantidad + ' × ' + esc(i.descripcion) +
        (i.sede_salida ? '<div class="tenue chico">Salió de la tienda de ' + esc(nombreSede(i.sede_salida)) + '</div>' : '') +
        (dueno ? '<div class="tenue chico">Costo ' + (costo == null ? 'sin anotar' : fmtUSD(costo)) +
          ' <button type="button" class="btn btn-plano btn-chico" style="min-height:28px;padding:0 4px" data-costo="' + i.id + '">' + (costo == null ? 'Poner' : 'Cambiar') + '</button></div>' : '') +
        '</div><div class="num fuerte">' + fmtUSD(i.precio * i.cantidad) + '</div></div>';
    }).join('') + '</div>';
    if (dueno) {
      h += '<div class="aviso ' + (conCosto ? 'aviso-ok' : 'aviso-info') + '" style="margin-bottom:14px">' + icono('moneda') + '<div>' +
        (conCosto ? 'Ganancia: <b>' + fmtUSD(Number(v.total) - costoTotal) + '</b> (vendido ' + fmtUSD(v.total) + ', costó ' + fmtUSD(costoTotal) + ')' : 'Falta anotar el costo para ver la ganancia.') + '</div></div>';
    }
    // Calendario
    var nCuotas = e.cuotas.filter(function (c) { return c.tipo === 'cuota'; }).length;
    h += '<h3>Plan de pago</h3><p class="tenue" style="margin:4px 0 8px">' +
      (v.frecuencia === 'contado' ? 'De contado' : plural(nCuotas, 'cuota', 'cuotas') + ' ' + textoFrecuencia(v.frecuencia, nCuotas)) +
      (Number(v.inicial) > 0 ? ' · Inicial ' + fmtUSD(v.inicial) : '') +
      (Number(v.plan_base) > 0 ? ' · Ya había pagado ' + fmtUSD(v.plan_base) : '') +
      (Number(v.ajuste) ? ' · Ajustes ' + fmtUSD(v.ajuste) : '') + '</p>';
    h += '<div class="cuotas">' + e.cuotas.map(function (c) {
      var nombre = c.tipo === 'inicial' ? 'Inicial' : c.tipo === 'recargo' ? 'Recargo' : 'Cuota ' + c.n;
      var cls = c.estado === 'pagada' ? 'pagada' : c.vencida ? 'vencida' : c.estado === 'parcial' ? 'parcial' : '';
      var txt = c.estado === 'pagada' ? 'Pagada' : c.estado === 'parcial' ? 'Faltan ' + fmtUSD(c.pendiente) : c.vencida ? 'Vencida' : '';
      return '<div class="cuota ' + cls + '"><span class="marca">' + (c.estado === 'pagada' ? icono('check', 'ic-chico') : '') + '</span>' +
        '<div class="crece">' + nombre + ' · ' + esc(fmtFechaAnio(c.fecha)) + '</div><div class="num fuerte">' + fmtUSD(c.monto) + '</div>' +
        (txt ? '<div class="tenue chico" style="width:76px;text-align:right">' + txt + '</div>' : '<div style="width:76px"></div>') + '</div>';
    }).join('') + '</div>';
    // Contrato
    var fCola = firmaEnCola(v.id, v.clave);
    h += '<h3 style="margin-top:16px">Contrato</h3><div class="fila envolver" style="margin-top:8px;gap:8px">' +
      (v.firmado_en ? '<span class="etiqueta e-verde">' + icono('check', 'ic-chico') + 'Firmado en pantalla el ' + esc(fmtFechaAnio(fechaCaracas(v.firmado_en))) + '</span>'
        : fCola ? '<span class="etiqueta e-ambar">Firma por enviar</span>' : '') +
      (v.contrato_papel ? '<span class="etiqueta e-gris">En papel N° ' + esc(v.contrato_papel) + '</span>' : '') +
      (!v.firmado_en && !fCola && v.estado !== 'anulada' ? '<button type="button" class="btn btn-chico" data-firmar="' + v.id + '">' + icono('editar', 'ic-chico') + 'Firmar en la pantalla</button>' : '') +
      (v.foto_contrato ? '<button type="button" class="btn btn-sec btn-chico" data-ver-contrato="' + v.id + '">' + icono('foto', 'ic-chico') + 'Ver foto</button>' : '') +
      '<button type="button" class="btn btn-sec btn-chico" data-foto-contrato="' + v.id + '">' + icono('camara', 'ic-chico') + (v.foto_contrato ? 'Cambiar foto' : 'Tomar foto') + '</button>' +
      '<button type="button" class="btn btn-sec btn-chico" data-imprimir="' + v.id + '">' + icono('contrato', 'ic-chico') + 'Contrato PDF</button>' +
      '<button type="button" class="btn btn-sec btn-chico" data-resumen="' + v.id + '">' + icono('chat', 'ic-chico') + 'Resumen por WhatsApp</button></div>';
    if (v.notas) h += '<p class="tenue" style="margin-top:10px">Nota: ' + esc(v.notas) + '</p>';
    if (v.motivo_cierre) h += '<p class="tenue" style="margin-top:6px">' + (v.estado === 'cerrada' ? 'Cerrada: ' : '') + esc(v.motivo_cierre) + '</p>';
    if (v.reingresada_en) h += '<p class="tenue" style="margin-top:6px">La mercancía volvió a la tienda de ' + esc(nombreSede(v.reingresada_sede)) + ' el ' + esc(fmtFechaAnio(fechaCaracas(v.reingresada_en))) + '.</p>';
    h += '<div id="ev-' + v.id + '" style="margin-top:12px"></div>';
    if (dueno && v.estado !== 'anulada') {
      var pend = solicitudesPendientes().filter(function (s) { return s.venta_id === v.id; });
      h += '<h3 style="margin-top:16px">Cambios (solo dueños)</h3>' + pend.map(function (s) {
          return '<button type="button" class="aviso aviso-info" style="width:100%;border:0;text-align:left;margin-top:8px;cursor:pointer" data-aprobaciones>' + icono('reloj') +
            '<div><b>' + esc(TIPOS_SOLICITUD[s.tipo]) + ':</b> lo pidió ' + esc(nombreUsuario(s.pedida_por)) + ', espera la aprobación de ' + esc(nombreOtroSocio(s.pedida_por)) + '.</div></button>';
        }).join('') + '<div class="fila envolver" style="margin-top:8px;gap:8px">' +
        (v.estado === 'activa' ? '<button type="button" class="btn btn-sec btn-chico" data-accion="recargo">Recargo</button>' +
          '<button type="button" class="btn btn-sec btn-chico" data-accion="descuento">Descuento</button>' +
          '<button type="button" class="btn btn-sec btn-chico" data-accion="tiempo">Más tiempo</button>' : '') +
        (v.estado === 'activa' && v.mercancia !== 'retirada' ? '<button type="button" class="btn btn-sec btn-chico" data-accion="retirar">Retirar mercancía</button>' : '') +
        (v.mercancia === 'retirada' ? '<button type="button" class="btn btn-sec btn-chico" data-accion="devolver">Devolver mercancía</button>' : '') +
        (v.estado === 'activa' ? '<button type="button" class="btn btn-sec btn-chico" data-accion="cerrar">Cerrar venta</button>' : '') +
        (v.estado === 'cerrada' ? '<button type="button" class="btn btn-sec btn-chico" data-accion="reabrir">Reabrir</button>' : '') +
        (v.firmado_en ? '<button type="button" class="btn btn-sec btn-chico" data-refirmar="' + v.id + '">Volver a firmar</button>' : '') +
        (v.estado === 'cerrada' && v.mercancia === 'retirada' && !v.reingresada_en && its.some(function (i) { return i.producto_id; }) ?
          '<button type="button" class="btn btn-sec btn-chico" data-accion="reingresar">Volver a la tienda</button>' : '') +
        '<button type="button" class="btn btn-sec btn-chico" data-accion="anular" style="color:var(--rojo)">Anular</button></div>';
    }
    return h;
  }

  async function cargarEventos(ventaId) {
    var cont = $('#ev-' + ventaId, raiz);
    if (!cont) return;
    try {
      var evs = await traerTodo('eventos_venta', '*', function (q) { return q.eq('venta_id', ventaId); });
      evs = evs.filter(function (x) { return x.tipo !== 'costo'; });
      if (!evs.length) return;
      var nombres = { recargo: 'Recargo', descuento: 'Descuento', reprogramacion: 'Más tiempo (calendario nuevo)', retiro: 'Mercancía retirada',
                      devolucion: 'Mercancía devuelta', cierre: 'Venta cerrada', reactivacion: 'Reabierta', anulacion: 'Anulada' };
      cont.innerHTML = '<h3>Historial</h3><div style="margin-top:6px">' + evs.map(function (x) {
        return '<div class="dato"><span>' + esc(fmtFechaAnio(fechaCaracas(x.creado_en))) + '</span><span class="crece">' + esc(nombres[x.tipo] || x.tipo) +
          (x.monto != null && (x.tipo === 'recargo' || x.tipo === 'descuento') ? ' ' + fmtUSD(x.monto) : '') +
          (x.motivo ? ' · ' + esc(x.motivo) : '') + ' <span class="tenue">(' + esc(nombreUsuario(x.usuario_id)) + ')</span></span></div>';
      }).join('') + '</div>';
    } catch (e) { /* sin señal */ }
  }

  function pintarAbonos() {
    var cont = raiz && $('#fiAbonos', raiz);
    if (!cont) return;
    var enCola = abonosEnCola(function (d) { return d.cliente_id === cliId; });
    var h = '';
    if (enCola.length) {
      h += '<div class="lista" style="margin-bottom:10px">' + enCola.map(function (o) {
        return '<div class="item" style="cursor:default"><div class="crece"><div class="item-tit">' + fmtUSD(o.datos.monto_usd) + '</div>' +
          '<div class="item-sub">' + esc(fmtFechaAnio(o.datos.fecha)) + ' · ' + esc((metodoPorId(o.datos.metodo_id) || {}).nombre || '') + '</div></div>' +
          '<span class="etiqueta ' + (o.estado === 'error' ? 'e-rojo' : 'e-ambar') + '">' + (o.estado === 'error' ? 'Rechazado' : 'Por enviar') + '</span></div>';
      }).join('') + '</div>';
    }
    if (abonosError) { cont.innerHTML = h + '<p class="tenue">' + icono('sinsenal', 'ic-chico') + ' No se pueden ver los abonos ahora (sin señal).</p>'; return; }
    if (!abonos) { cont.innerHTML = h + '<div class="cargando">Cargando abonos…</div>'; return; }
    var grupos = agruparAbonos(abonos);
    if (!grupos.length && !enCola.length) { cont.innerHTML = '<p class="tenue">Todavía no ha abonado.</p>'; return; }
    cont.innerHTML = h + '<div class="lista">' + grupos.map(filaAbono).join('') + '</div>';
  }

  async function alTocar(e) {
    var b, c = ST.cliPorId.get(cliId);
    if (!c) return;
    if (e.target.closest('[data-abonar]')) { hojaAbono(cliId); return; }
    if (e.target.closest('[data-vender]')) { ir('vender', String(cliId)); return; }
    if (e.target.closest('[data-editar]')) { hojaCliente(c); return; }
    if (e.target.closest('[data-wa]')) { abrirWhatsApp('', c.telefono || c.contacto_telefono); return; }
    if (e.target.closest('[data-recordar]')) { recordarPorWhatsApp(cliId); setTimeout(pintar, 300); return; }
    if (e.target.closest('[data-nota-nueva]')) { hojaGestion(cliId); return; }
    if ((b = e.target.closest('[data-quitar-nota]'))) { quitarNota(Number(b.dataset.quitarNota), cliId); return; }
    if ((b = e.target.closest('[data-ubicar]'))) { guardarUbicacion(c); return; }
    if ((b = e.target.closest('[data-abrir]'))) {
      var id = Number(b.dataset.abrir);
      if (abiertas.has(id)) abiertas.delete(id); else abiertas.add(id);
      pintar();
      if (abiertas.has(id)) cargarEventos(id);
      return;
    }
    if ((b = e.target.closest('[data-foto]'))) {
      if (b.dataset.ruta) { verFoto(b.dataset.ruta, b.dataset.foto === 'cedula' ? 'Cédula' : c.nombre); return; }
      var blob = await elegirFoto();
      if (!blob) return;
      await encolarFoto(blob, { tipo: b.dataset.foto, cliente_id: c.id, nombreCliente: c.nombre });
      toast('Foto guardada. Se sube sola.', 'ok');
      return;
    }
    if ((b = e.target.closest('[data-ver-contrato]'))) { verFoto(ST.ventaPorId.get(Number(b.dataset.verContrato)).foto_contrato, 'Contrato'); return; }
    if ((b = e.target.closest('[data-foto-contrato]'))) {
      var v = ST.ventaPorId.get(Number(b.dataset.fotoContrato));
      var f = await elegirFoto();
      if (!f) return;
      await encolarFoto(f, { tipo: 'contrato', cliente_id: c.id, ref_id: v.id, nombreCliente: c.nombre });
      toast('Foto del contrato guardada. Se sube sola.', 'ok');
      return;
    }
    if ((b = e.target.closest('[data-imprimir]'))) { imprimirContrato(ST.ventaPorId.get(Number(b.dataset.imprimir))); return; }
    if ((b = e.target.closest('[data-firmar]')) || (b = e.target.closest('[data-refirmar]'))) {
      var vf = ST.ventaPorId.get(Number(b.dataset.firmar || b.dataset.refirmar)), re = !!b.dataset.refirmar;
      if (re && !(await confirmar({ titulo: 'Volver a firmar', mensaje: 'La firma de antes queda guardada en el historial. ¿Firmar de nuevo?', boton: 'Firmar de nuevo' }))) return;
      // Se firma el contrato con los datos de hoy (no la copia vieja)
      hojaFirmar({ d: datosContrato(Object.assign({}, vf, { contrato_firmado: null })), ventaId: vf.id, cliente: c, reemplazar: re, alFirmar: function () { pintar(); } });
      return;
    }
    if ((b = e.target.closest('[data-resumen]'))) { enviarResumenVenta(ST.ventaPorId.get(Number(b.dataset.resumen))); return; }
    if ((b = e.target.closest('[data-costo]'))) { hojaCosto(Number(b.dataset.costo)); return; }
    if (e.target.closest('[data-aprobaciones]')) { hojaAprobaciones(); return; }
    if ((b = e.target.closest('[data-accion]'))) {
      var venta = ST.ventaPorId.get(Number(b.closest('[data-venta]').dataset.venta));
      accionVenta(b.dataset.accion, venta);
      return;
    }
    if ((b = e.target.closest('[data-grupo]')) && abonos) {
      hojaDetalleAbono(abonos.filter(function (a) { return a.grupo === b.dataset.grupo; }), function () { cargarAbonos(); });
    }
  }

  async function guardarUbicacion(c) {
    if (!(await confirmar({ titulo: 'Guardar ubicación', mensaje: '¿Estás en la casa de ' + c.nombre + '? Se guarda el punto donde estás ahora para encontrarla después en el mapa.', boton: 'Sí, guardar aquí' }))) return;
    try {
      toast('Tomando la ubicación…');
      var p = await pedirUbicacion();
      var r = await enviarYEsperar({ clave: nuevaClave(), tipo: 'cliente', datos: { id: c.id, lat: p.lat, lng: p.lng }, resumen: { texto: 'Ubicación de ' + c.nombre } });
      if (r.estado === 'ok') { c.lat = p.lat; c.lng = p.lng; c.ubicacion_en = new Date().toISOString(); pintar(); toast('Ubicación guardada', 'ok'); }
      else toast('Ubicación guardada en el teléfono. Se envía sola.', 'ok');
    } catch (e) { toast(errMsg(e), 'error'); }
  }

  return { mostrar: mostrar, refrescar: function () { pintar(); cargarAbonos(); } };
})();

// Un pago repartido entre dos ventas se muestra como uno solo
function agruparAbonos(filas) {
  var m = new Map();
  filas.forEach(function (a) {
    if (!m.has(a.grupo)) m.set(a.grupo, []);
    m.get(a.grupo).push(a);
  });
  return Array.from(m.values()).sort(function (a, b) {
    return a[0].fecha < b[0].fecha ? 1 : a[0].fecha > b[0].fecha ? -1 : b[0].id - a[0].id;
  });
}
function filaAbono(g, conCliente) {
  var a = g[0], usd = g.reduce(function (s, x) { return s + Number(x.monto_usd); }, 0), mon = g.reduce(function (s, x) { return s + Number(x.monto); }, 0);
  var met = a.tipo === 'antes_del_sistema' ? 'Antes del sistema' : ((metodoPorId(a.metodo_id) || {}).nombre || '');
  var ventas = g.map(function (x) { var v = ST.ventaPorId.get(x.venta_id); return v ? '#' + v.numero : ''; }).filter(Boolean).join(', ');
  var cli = conCliente ? (ST.cliPorId.get(a.cliente_id) || {}).nombre : '';
  return '<button type="button" class="item" data-grupo="' + a.grupo + '"' + (a.anulado_en ? ' style="opacity:.55"' : '') + '>' +
    '<div class="crece">' + (cli ? '<div class="item-tit cortar">' + esc(cli) + '</div>' : '') +
    '<div class="' + (cli ? 'item-sub' : 'item-tit') + '">' + (a.anulado_en ? '<s>' : '') + fmtUSD(usd) + (a.anulado_en ? '</s> <span class="etiqueta e-rojo">Anulado</span>' : '') +
    (a.moneda === 'VES' ? ' <span class="tenue chico">(' + fmtBs(mon) + ')</span>' : '') + '</div>' +
    '<div class="item-sub">' + esc(fmtFechaAnio(a.fecha)) + ' · ' + esc(met) + (ventas ? ' · ' + ventas : '') +
    (a.recibido_por ? ' · ' + esc(nombreUsuario(a.recibido_por)) : '') + '</div></div>' +
    (a.comprobante ? icono('foto', 'ic-chico') : '') + icono('flecha', 'ic-chico') + '</button>';
}

/* ======================= Formulario del cliente ======================= */
// c = cliente a editar (o null para uno nuevo). o.alGuardar(ref) recibe el id o "c-<clave>".
function hojaCliente(c, o) {
  o = o || {};
  var nuevo = !c, dueno = esDueno();
  c = c || { sede: ST.yo.sede || 'socopo' };
  var fotos = { cliente: null, cedula: null }, ubic = null, claveForm = nuevaClave();
  function campo(id, etq, val, extra) {
    return '<label class="campo"><span>' + etq + '</span><input id="' + id + '" value="' + esc(val || '') + '" ' + (extra || '') + '></label>';
  }
  var h = abrirHoja({
    titulo: nuevo ? 'Nuevo cliente' : 'Editar cliente', completa: true,
    html: '<div class="pila">' +
      campo('fNombre', 'Nombre y apellido *', c.nombre, 'autocapitalize="words"') +
      '<div class="dos">' + campo('fCedula', 'Cédula', c.cedula ? fmtCedula(c.cedula) : '', 'inputmode="text" placeholder="V-12345678"') +
        campo('fTelefono', 'Teléfono', c.telefono, 'type="tel" placeholder="0414-1234567"') + '</div>' +
      campo('fTelefono2', 'Otro teléfono', c.telefono2, 'type="tel"') +
      (dueno ? '<div class="campo"><span>Sede</span><div class="seg" id="fSede">' +
        ['socopo', 'pedraza'].map(function (s) { return '<button type="button" data-v="' + s + '"' + (c.sede === s ? ' class="activo"' : '') + '>' + nombreSede(s) + '</button>'; }).join('') + '</div></div>' : '') +
      campo('fSector', 'Sector, barrio o pueblo', c.sector) +
      '<label class="campo"><span>Dirección</span><textarea id="fDireccion" rows="2">' + esc(c.direccion || '') + '</textarea></label>' +
      campo('fReferencia', 'Punto de referencia', c.referencia, 'placeholder="Ej.: al lado de la bodega azul"') +
      campo('fTrabajo', 'Trabajo', c.trabajo, 'placeholder="Dónde trabaja y qué hace"') +
      '<label class="casilla"><input type="checkbox" id="fExterior"' + (c.en_exterior ? ' checked' : '') + '> Vive fuera del país</label>' +
      '<div id="fExtCampos" class="pila"' + (c.en_exterior ? '' : ' hidden') + '>' +
        campo('fPais', 'País', c.pais) +
        '<p class="tenue chico" style="margin:0">Escribe su teléfono con el código del país (ej.: +1 305 1234567) para que el WhatsApp llegue bien.</p>' +
        '<div class="dos">' + campo('fContactoNombre', 'Quién recibe aquí', c.contacto_nombre) + campo('fContactoTel', 'Teléfono de esa persona', c.contacto_telefono, 'type="tel"') + '</div>' +
      '</div>' +
      '<h3 style="margin-top:20px">Fiador</h3>' +
      '<div class="dos">' + campo('fFiNombre', 'Nombre', c.fiador_nombre) + campo('fFiCedula', 'Cédula', c.fiador_cedula ? fmtCedula(c.fiador_cedula) : '') + '</div>' +
      '<div class="dos">' + campo('fFiTel', 'Teléfono', c.fiador_telefono, 'type="tel"') + campo('fFiDir', 'Dirección', c.fiador_direccion) + '</div>' +
      '<h3 style="margin-top:20px">Fotos y ubicación</h3>' +
      '<div class="fotos" id="fFotos">' +
        '<button type="button" class="foto-btn" data-tomar="cliente"><span class="foto-mini">' + icono('camara') + '</span><span>Foto del cliente</span></button>' +
        '<button type="button" class="foto-btn" data-tomar="cedula"><span class="foto-mini">' + icono('camara') + '</span><span>Foto de la cédula</span></button>' +
      '</div>' +
      '<button type="button" class="btn btn-sec btn-ancho" id="fUbicar">' + icono('mapa') + (c.lat != null ? 'Cambiar ubicación (estoy en su casa)' : 'Guardar ubicación (estoy en su casa)') + '</button>' +
      '<label class="campo"><span>Notas</span><textarea id="fNotas" rows="2">' + esc(c.notas || '') + '</textarea></label>' +
      (dueno ? '<label class="casilla"><input type="checkbox" id="fNoVender"' + (c.no_venderle ? ' checked' : '') + '> No venderle más</label>' +
        '<div id="fNoVenderCampos"' + (c.no_venderle ? '' : ' hidden') + '>' + campo('fNoVenderMotivo', 'Por qué', c.no_venderle_motivo) + '</div>' : '') +
      (dueno && !nuevo ? '<button type="button" class="btn btn-plano btn-ancho" id="fQuitar" style="color:var(--rojo);margin-top:16px">' + icono('basura') + 'Quitar este cliente</button>' : '') +
      '</div>',
    pie: '<button type="button" class="btn btn-ancho" id="fGuardar">' + (nuevo ? 'Guardar cliente' : 'Guardar cambios') + '</button>'
  });
  var sede = c.sede;
  var seg = h.$('#fSede');
  if (seg) seg.addEventListener('click', function (e) {
    var b = e.target.closest('[data-v]'); if (!b) return;
    sede = b.dataset.v;
    $$('button', seg).forEach(function (x) { x.classList.toggle('activo', x === b); });
  });
  h.$('#fExterior').addEventListener('change', function () { h.$('#fExtCampos').hidden = !this.checked; });
  var nv = h.$('#fNoVender');
  if (nv) nv.addEventListener('change', function () { h.$('#fNoVenderCampos').hidden = !this.checked; });
  h.$('#fFotos').addEventListener('click', async function (e) {
    var b = e.target.closest('[data-tomar]'); if (!b) return;
    var blob = await elegirFoto();
    if (!blob) return;
    fotos[b.dataset.tomar] = blob;
    var url = URL.createObjectURL(blob);
    b.querySelector('.foto-mini').outerHTML = '<img class="foto-mini" src="' + url + '" alt="">';
  });
  h.$('#fUbicar').addEventListener('click', async function () {
    var btn = this;
    btn.disabled = true; btn.textContent = 'Tomando la ubicación…';
    try {
      ubic = await pedirUbicacion();
      btn.innerHTML = icono('check') + 'Ubicación tomada' + (ubic.precision > 60 ? ' (aproximada)' : '');
    } catch (err) { toast(errMsg(err), 'error'); btn.innerHTML = icono('mapa') + 'Guardar ubicación (estoy en su casa)'; }
    btn.disabled = false;
  });
  var q = h.$('#fQuitar');
  if (q) q.addEventListener('click', async function () {
    var motivo = await confirmar({ titulo: 'Quitar cliente', mensaje: 'El cliente deja de aparecer en las listas. Solo se puede si no debe nada.', pedir: 'Por qué se quita', boton: 'Quitar', peligro: true });
    if (!motivo) return;
    try {
      await rpc('borrar_cliente', { p_id: c.id, p_motivo: motivo });
      c.deleted_at = new Date().toISOString();
      h.cerrar(); toast('Cliente quitado', 'ok'); ir('clientes');
    } catch (err) { toast(errMsg(err), 'error'); }
  });

  protegerBoton(h.$('#fGuardar'), async function () {
    var v = function (id) { var el = h.$('#' + id); return el ? el.value.trim() : ''; };
    var datos = {
      nombre: v('fNombre'), cedula: v('fCedula'), telefono: v('fTelefono'), telefono2: v('fTelefono2'),
      sector: v('fSector'), direccion: v('fDireccion'), referencia: v('fReferencia'), trabajo: v('fTrabajo'),
      en_exterior: h.$('#fExterior').checked, pais: v('fPais'), contacto_nombre: v('fContactoNombre'), contacto_telefono: v('fContactoTel'),
      fiador_nombre: v('fFiNombre'), fiador_cedula: v('fFiCedula'), fiador_telefono: v('fFiTel'), fiador_direccion: v('fFiDir'),
      notas: v('fNotas')
    };
    if (!datos.nombre) { toast('Escribe el nombre del cliente', 'error'); h.$('#fNombre').focus(); return; }
    if (datos.cedula && !/^[VEJPGvejpg]?[\s.-]*\d[\d.\s]{4,12}$/.test(datos.cedula)) { toast('La cédula no se entiende. Escríbela así: V-12345678', 'error'); return; }
    if (dueno) {
      datos.sede = sede;
      datos.no_venderle = h.$('#fNoVender').checked;
      datos.no_venderle_motivo = v('fNoVenderMotivo');
    }
    if (ubic) { datos.lat = ubic.lat; datos.lng = ubic.lng; }
    if (!nuevo) datos.id = c.id;
    var op = { clave: claveForm, tipo: 'cliente', datos: datos, resumen: { texto: (nuevo ? 'Cliente nuevo: ' : 'Cambios de ') + datos.nombre } };
    var r;
    try {
      r = await enviarYEsperar(op);
    } catch (e) {
      if (e && e.code === 'EM002' && e.details && await confirmar({ titulo: 'Ya existe', mensaje: errMsg(e) + ' ¿Quieres abrir ese cliente?', boton: 'Abrir' })) {
        h.cerrar(); ir('cliente', String(e.details)); return;
      }
      throw e;
    }
    var ref = r.estado === 'ok' ? String(r.resultado.id) : 'c-' + op.clave;
    var fotoRef = r.estado === 'ok' ? { cliente_id: r.resultado.id } : { cliente_clave: op.clave };
    for (var t in fotos) {
      if (fotos[t]) await encolarFoto(fotos[t], Object.assign({ tipo: t, nombreCliente: datos.nombre }, fotoRef));
    }
    h.cerrar();
    if (r.estado === 'ok') {
      try { await recargarCliente(r.resultado.id); } catch (e) { /* se recarga después */ }
      toast(nuevo ? 'Cliente guardado' : 'Cambios guardados', 'ok');
    } else {
      toast('Sin señal: guardado en el teléfono. Se enviará solo.', '', 4500);
    }
    if (o.alGuardar) o.alGuardar(ref); else repintar();
  });
}
