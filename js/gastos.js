// Electro Montana — gastos del negocio (solo dueños): alquiler, empleado, gasolina, reparaciones…
// Cada socio anota los suyos (quedan a su nombre) y se ven por separado: Franklin, Daniel o los dos.
// Se anotan por la cola (también sin señal). Un gasto mal anotado lo anula quien lo anotó.
'use strict';

var VistaGastos = (function () {
  var raiz = null, mes = '', sede = 'todas', quien = '';   // quien: id del socio o 'todos'

  function mostrar(c) {
    raiz = document.createElement('div');
    c.appendChild(raiz);
    if (!esDueno()) { raiz.innerHTML = '<div class="vacio">' + icono('candado') + '<p>Los gastos los ven solo Franklin y Daniel.</p></div>'; return; }
    if (!mes) mes = hoyCaracas().slice(0, 7);
    if (!quien) quien = ST.yo.id;
    raiz.addEventListener('click', alTocar);
    pintar();
  }

  function nombreMesLargo(ym) {
    var t = new Intl.DateTimeFormat('es-VE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(ym + '-15T12:00:00Z'));
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function otroMes(ym, n) {
    var a = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1 + n;
    while (m < 0) { m += 12; a--; }
    while (m > 11) { m -= 12; a++; }
    return a + '-' + String(m + 1).padStart(2, '0');
  }
  function pasaSede(g) { return sede === 'todas' || (sede === 'general' ? !g.sede : g.sede === sede); }
  function pasaQuien(g) { return quien === 'todos' || g.pagado_por === quien; }
  // Los socios (y quien esté en la app, y cualquiera que tenga gastos anotados)
  function socios() {
    var ids = ST.usuarios.filter(function (u) { return u.activo && u.rol === 'dueno' && (u.puede_aprobar || u.id === ST.yo.id); }).map(function (u) { return u.id; });
    (ST.gastos || []).forEach(function (g) { if (ids.indexOf(g.pagado_por) < 0) ids.push(g.pagado_por); });
    return ids.sort(function (a, b) { return a === ST.yo.id ? -1 : b === ST.yo.id ? 1 : nombreUsuario(a).localeCompare(nombreUsuario(b)); });
  }

  function pintar() {
    if (!raiz || !raiz.isConnected) return;
    var delMes = (ST.gastos || []).filter(function (g) { return g.fecha.slice(0, 7) === mes && pasaSede(g); });
    var lista = delMes.filter(pasaQuien)
      .sort(function (a, b) { return a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.id - a.id; });
    var vivos = lista.filter(function (g) { return !g.anulado_en; });
    var total = redondear2(vivos.reduce(function (s, g) { return s + Number(g.monto_usd); }, 0));
    var pend = Cola.mias().filter(function (o) { return o.tipo === 'gasto'; });
    var actual = mes >= hoyCaracas().slice(0, 7);

    // Arriba: de quién (cada uno con lo que lleva gastado en el mes)
    var h = '<div class="seg" id="gsQuien">' + socios().concat(['todos']).map(function (id) {
        var suma = delMes.filter(function (g) { return !g.anulado_en && (id === 'todos' || g.pagado_por === id); })
          .reduce(function (s, g) { return s + Number(g.monto_usd); }, 0);
        return '<button type="button" data-quien="' + id + '"' + (quien === id ? ' class="activo"' : '') + ' style="line-height:1.2;min-height:54px">' +
          esc(id === 'todos' ? 'Los dos' : nombreUsuario(id)) + '<span class="tenue chico num" style="display:block">' + fmtUSD(suma) + '</span></button>';
      }).join('') + '</div>' +
      '<button type="button" class="btn btn-ancho" style="margin-top:12px" data-nuevo>' + icono('mas') + 'Anotar mi gasto</button>' +
      '<div class="fila-sep" style="margin-top:14px">' +
        '<button type="button" class="btn btn-sec btn-icono" data-mes="-1" aria-label="Mes anterior">' + icono('atras') + '</button>' +
        '<h2 style="text-align:center">' + esc(nombreMesLargo(mes)) + '</h2>' +
        '<button type="button" class="btn btn-sec btn-icono" data-mes="1" aria-label="Mes siguiente"' + (actual ? ' disabled' : '') + '>' + icono('flecha') + '</button></div>' +
      '<div class="chips" style="margin-top:10px">' + [['todas', 'Todo'], ['socopo', 'Socopó'], ['pedraza', 'Pedraza'], ['general', 'De los dos']].map(function (s) {
        return '<button type="button" class="chip' + (sede === s[0] ? ' activo' : '') + '" data-sede="' + s[0] + '">' + s[1] + '</button>';
      }).join('') + '</div>';

    if (pend.length) {
      h += '<div class="seccion-tit" style="margin-top:16px"><h3>Por enviar</h3></div><div class="lista">' + pend.map(function (o) {
        return '<div class="item" style="cursor:default"><div class="crece"><div class="item-tit">' + esc(o.resumen.texto) + '</div>' +
          '<div class="item-sub">' + (o.estado === 'error' ? 'Rechazado: ' + esc(o.error) : 'Se enviará cuando haya señal') + '</div></div>' +
          '<span class="etiqueta ' + (o.estado === 'error' ? 'e-rojo' : 'e-ambar') + '">' + (o.estado === 'error' ? 'Error' : 'Por enviar') + '</span></div>';
      }).join('') + '</div>';
    }

    h += '<div class="tarjeta" style="margin-top:14px"><div class="fila-sep"><div><div class="tenue chico">' +
      (quien === 'todos' ? 'Gastos de los dos en el mes' : 'Gastos de ' + esc(nombreUsuario(quien)) + ' en el mes') + '</div>' +
      '<div class="monto-grande" style="color:' + (total > 0 ? 'var(--rojo)' : 'inherit') + '">' + fmtUSD(total) + '</div></div>' +
      '<div class="tenue chico" style="text-align:right">' + plural(vivos.length, 'gasto', 'gastos') + '</div></div>';
    if (vivos.length) {
      h += '<h3 style="margin-top:14px">En qué</h3>' + barras(agrupar(vivos, function (g) { return nombreCategoria(g.categoria_id); }));
      if (quien === 'todos') h += '<h3 style="margin-top:14px">De cada socio</h3>' + barras(agrupar(vivos, function (g) { return nombreUsuario(g.pagado_por); }));
      if (sede === 'todas') h += '<h3 style="margin-top:14px">De qué tienda</h3>' + barras(agrupar(vivos, function (g) { return g.sede ? nombreSede(g.sede) : 'De los dos'; }));
    }
    h += '</div>';

    h += '<div class="seccion"><div class="seccion-tit"><h2>Gastos</h2></div>' +
      (lista.length ? '<div class="lista">' + lista.map(filaGasto).join('') + '</div>'
        : '<div class="vacio">' + icono('recibo') + '<p>' + (quien === 'todos' ? 'No hay gastos' : esc(nombreUsuario(quien)) + ' no tiene gastos') +
          ' anotados en ' + esc(nombreMesLargo(mes).toLowerCase()) + '.</p></div>') + '</div>';
    raiz.innerHTML = h;
  }

  function agrupar(lista, clave) {
    var m = new Map();
    lista.forEach(function (g) { var k = clave(g); m.set(k, (m.get(k) || 0) + Number(g.monto_usd)); });
    return Array.from(m.entries()).sort(function (a, b) { return b[1] - a[1]; }).map(function (x) { return { etq: x[0], valor: redondear2(x[1]) }; });
  }
  function barras(filas) {
    var max = filas.reduce(function (m, f) { return Math.max(m, f.valor); }, 0) || 1;
    return '<div class="barras" style="margin-top:6px">' + filas.map(function (f) {
      return '<div class="barra-fila"><span class="barra-etq">' + esc(f.etq) + '</span>' +
        '<span class="barra-pista"><span class="barra" style="width:' + Math.max(2, Math.round(f.valor / max * 100)) + '%"></span></span>' +
        '<span class="barra-val num">' + fmtUSD(f.valor) + '</span></div>';
    }).join('') + '</div>';
  }

  function filaGasto(g) {
    var m = metodoPorId(g.metodo_id) || {};
    var sub = [fmtFechaAnio(g.fecha), g.sede ? nombreSede(g.sede) : 'De los dos', m.nombre, quien === 'todos' ? 'de ' + nombreUsuario(g.pagado_por) : ''].filter(Boolean).join(' · ');
    return '<button type="button" class="item" data-gasto="' + g.id + '"' + (g.anulado_en ? ' style="opacity:.55"' : '') + '>' +
      '<div class="crece"><div class="item-tit cortar">' + esc(nombreCategoria(g.categoria_id)) + (g.descripcion ? ' <span class="tenue">· ' + esc(g.descripcion) + '</span>' : '') + '</div>' +
      '<div class="item-sub cortar">' + esc(sub) + '</div></div>' +
      '<div class="item-der"><div class="monto">' + (g.anulado_en ? '<s>' + fmtUSD(g.monto_usd) + '</s>' : fmtUSD(g.monto_usd)) + '</div>' +
      (g.anulado_en ? '<span class="etiqueta e-rojo">Anulado</span>' : g.moneda === 'VES' ? '<span class="tenue chico">' + fmtBs(g.monto) + '</span>' : '') + '</div></button>';
  }

  function alTocar(e) {
    var b;
    if (e.target.closest('[data-nuevo]')) { hojaGasto(null, function () { if (quien !== 'todos') quien = ST.yo.id; }); return; }
    if ((b = e.target.closest('[data-quien]'))) { quien = b.dataset.quien; pintar(); return; }
    if ((b = e.target.closest('[data-mes]'))) { if (!b.disabled) { mes = otroMes(mes, Number(b.dataset.mes)); pintar(); } return; }
    if ((b = e.target.closest('[data-sede]'))) { sede = b.dataset.sede; pintar(); return; }
    if ((b = e.target.closest('[data-gasto]'))) {
      var g = (ST.gastos || []).find(function (x) { return x.id === Number(b.dataset.gasto); });
      if (g) hojaDetalleGasto(g);
    }
  }

  return { mostrar: mostrar, refrescar: pintar };
})();

function nombreCategoria(id) {
  var c = (ST.catGastos || []).find(function (x) { return x.id === id; });
  return c ? c.nombre : 'Gasto';
}

// Anotar un gasto (queda a nombre de quien está en la app). base: un gasto suyo para "Repetir" (alquiler o sueldo
// de cada mes). alGuardar: lo que hace la pantalla de Gastos después de guardar.
function hojaGasto(base, alGuardar) {
  base = base || {};
  var hoy = hoyCaracas();
  var G = { cat: base.categoria_id || null, sede: base.sede || null, metodo: base.metodo_id || null,
            tasa: Number(base.tasa) || Number(ST.cfg.tasa_bs) || 0, clave: nuevaClave() };
  var h = abrirHoja({
    titulo: base.id ? 'Repetir gasto' : 'Anotar mi gasto', completa: true,
    html: '<p class="tenue" style="margin:0 2px 12px">Queda a nombre de <b>' + esc(ST.yo.nombre) + '</b>. Cada socio anota sus gastos con su usuario.</p>' +
      '<div class="pila">' +
      '<div class="campo"><span>¿En qué fue?</span><div class="metodos" id="gaCats"></div></div>' +
      '<label class="campo"><span>Detalle <span class="ayuda" id="gaDescAyuda">(opcional)</span></span><input id="gaDesc" value="' + esc(base.descripcion || '') + '" placeholder="Ej.: alquiler de octubre del local de Pedraza"></label>' +
      '<div class="campo"><span>¿De qué tienda?</span><div class="seg" id="gaSede">' +
        [['socopo', 'Socopó'], ['pedraza', 'Pedraza'], ['', 'De los dos']].map(function (s) {
          return '<button type="button" data-v="' + s[0] + '"' + ((G.sede || '') === s[0] ? ' class="activo"' : '') + '>' + s[1] + '</button>';
        }).join('') + '</div></div>' +
      '<div class="campo"><span>¿Cómo se pagó?</span><div class="metodos" id="gaMetodos">' + ST.metodos.filter(function (m) { return m.activo; }).map(function (m) {
        return '<button type="button" class="chip' + (m.id === G.metodo ? ' activo' : '') + '" data-m="' + m.id + '">' + esc(m.nombre) + '</button>';
      }).join('') + '</div></div>' +
      '<label class="campo"><span id="gaEtqMonto">Monto</span><input id="gaMonto" inputmode="decimal" autocomplete="off" value="' + (base.monto ? numCampo(Number(base.monto)) : '') + '"></label>' +
      '<div id="gaTasaCampo" hidden><label class="campo"><span>Tasa (Bs por $)</span><input id="gaTasa" inputmode="decimal"></label>' +
        '<p class="chico" id="gaEquiv" style="margin:6px 0 0"></p></div>' +
      '<label class="campo" id="gaRefCampo" hidden><span>Referencia <span class="ayuda">(opcional)</span></span><input id="gaRef" placeholder="Número de confirmación"></label>' +
      '<label class="campo"><span>Fecha</span><input type="date" id="gaFecha" value="' + hoy + '" max="' + hoy + '"></label>' +
      '<label class="campo"><span>Nota (opcional)</span><input id="gaNota" value="' + esc(base.nota || '') + '"></label>' +
      '</div>',
    pie: '<button type="button" class="btn btn-ancho" id="gaGuardar">Guardar gasto</button>'
  });

  function metodo() { return metodoPorId(G.metodo); }
  function cats() { return (ST.catGastos || []).filter(function (c) { return c.activo; }); }
  function esOtro() { return /^otro$/i.test(nombreCategoria(G.cat)); }
  function pintarCats() {
    h.$('#gaCats').innerHTML = cats().map(function (c) {
      return '<button type="button" class="chip' + (c.id === G.cat ? ' activo' : '') + '" data-cat="' + c.id + '">' + esc(c.nombre) + '</button>';
    }).join('') + '<button type="button" class="chip" data-nueva-cat>' + icono('mas', 'ic-chico') + 'Otra categoría</button>';
    h.$('#gaDescAyuda').textContent = esOtro() ? '(escribe en qué fue)' : '(opcional)';
  }
  function montoUsd() {
    var m = metodo(), v = redondear2(parseNum(h.$('#gaMonto').value));
    if (!m || !(v > 0)) return 0;
    return m.moneda === 'USD' ? v : (G.tasa > 0 ? redondear2(v / G.tasa) : 0);
  }
  function pintarMetodo() {
    var m = metodo(), ves = m && m.moneda === 'VES';
    h.$('#gaMonto').disabled = !m;
    h.$('#gaMonto').placeholder = m ? '0,00' : 'Primero toca cómo se pagó';
    h.$('#gaEtqMonto').textContent = !m ? 'Monto' : ves ? 'Monto en bolívares' : 'Monto en dólares';
    h.$('#gaTasaCampo').hidden = !ves;
    h.$('#gaRefCampo').hidden = !(m && m.pide_referencia);
    if (ves) h.$('#gaTasa').value = G.tasa > 0 ? numCampo(G.tasa) : '';
    pintarEquiv();
  }
  function pintarEquiv() {
    var m = metodo(), el = h.$('#gaEquiv');
    if (!m || m.moneda !== 'VES') return;
    if (!(G.tasa > 0)) { el.innerHTML = '<span class="suma-mal">Falta la tasa.</span>'; return; }
    var usd = montoUsd();
    el.innerHTML = usd > 0 ? 'Equivale a <b class="num">' + fmtUSD(usd) + '</b>' : '';
  }

  h.cuerpo.addEventListener('click', async function (e) {
    var b;
    if ((b = e.target.closest('[data-cat]'))) { G.cat = Number(b.dataset.cat); h.$('#gaCats').classList.remove('falta'); pintarCats(); return; }
    if (e.target.closest('[data-nueva-cat]')) {
      var nombre = await confirmar({ titulo: 'Categoría nueva', pedir: 'Nombre (ej.: Publicidad)', boton: 'Agregar' });
      if (!nombre) return;
      try {
        G.cat = await rpc('guardar_categoria_gasto', { p_nombre: nombre });
        await recargarGastos();
        pintarCats();
      } catch (err) { toast(errMsg(err), 'error'); }
      return;
    }
    if ((b = e.target.closest('#gaSede [data-v]'))) {
      G.sede = b.dataset.v || null;
      h.$$('#gaSede button').forEach(function (x) { x.classList.toggle('activo', x === b); });
      return;
    }
    if ((b = e.target.closest('#gaMetodos [data-m]'))) {
      var antes = metodo();
      G.metodo = Number(b.dataset.m);
      h.$('#gaMetodos').classList.remove('falta');
      h.$$('#gaMetodos .chip').forEach(function (x) { x.classList.toggle('activo', x === b); });
      if (antes && antes.moneda !== metodo().moneda) h.$('#gaMonto').value = '';   // cambió de moneda
      pintarMetodo();
      if (!h.$('#gaMonto').value) h.$('#gaMonto').focus();
      return;
    }
  });
  h.$('#gaMonto').addEventListener('input', pintarEquiv);
  h.$('#gaTasa').addEventListener('input', function () { var t = parseNum(this.value); G.tasa = t > 0 ? t : 0; pintarEquiv(); });

  protegerBoton(h.$('#gaGuardar'), async function () {
    if (!G.cat) { toast('Toca en qué fue el gasto', 'error'); h.$('#gaCats').classList.add('falta'); h.$('#gaCats').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    var desc = h.$('#gaDesc').value.trim();
    if (esOtro() && !desc) { toast('Escribe en qué fue el gasto', 'error'); h.$('#gaDesc').focus(); return; }
    var m = metodo();
    if (!m) { toast('Toca cómo se pagó: efectivo, Zelle, USDT o bolívares', 'error'); h.$('#gaMetodos').classList.add('falta'); h.$('#gaMetodos').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    var monto = redondear2(parseNum(h.$('#gaMonto').value));
    if (!(monto > 0)) { toast('Escribe el monto', 'error'); h.$('#gaMonto').focus(); return; }
    if (m.moneda === 'VES' && !(G.tasa > 0)) { toast('Falta la tasa', 'error'); return; }
    var fecha = h.$('#gaFecha').value || hoyCaracas();
    if (fecha > hoyCaracas()) { toast('La fecha no puede ser futura', 'error'); return; }
    var usd = montoUsd();
    var datos = { fecha: fecha, categoria_id: G.cat, descripcion: desc, sede: G.sede, metodo_id: m.id, monto: monto,
                  tasa: m.moneda === 'VES' ? G.tasa : null, monto_usd: usd, referencia: m.pide_referencia ? h.$('#gaRef').value.trim() : '',
                  nota: h.$('#gaNota').value.trim(), hecho_en: new Date().toISOString() };
    var op = { clave: G.clave, tipo: 'gasto', datos: datos, resumen: { texto: 'Gasto: ' + nombreCategoria(G.cat) + ' ' + fmtUSD(usd) } };
    var r = await enviarYEsperar(op);
    if (r.estado === 'ok') { try { await recargarGastos(); } catch (e) { /* luego */ } }
    h.cerrar();
    if (alGuardar) alGuardar();
    toast(r.estado === 'ok' ? 'Gasto anotado: ' + fmtUSD(usd) : 'Sin señal: el gasto quedó en el teléfono y se envía solo', r.estado === 'ok' ? 'ok' : '', 5000);
    repintar();
  });

  pintarCats();
  pintarMetodo();
}

function hojaDetalleGasto(g) {
  var m = metodoPorId(g.metodo_id) || {};
  function d(etq, val) { return val ? '<div class="dato"><span>' + etq + '</span><span class="crece">' + val + '</span></div>' : ''; }
  var mio = g.creado_por === ST.yo.id;
  var h = abrirHoja({
    titulo: nombreCategoria(g.categoria_id),
    html: (g.anulado_en ? '<div class="aviso aviso-error" style="margin-bottom:12px">' + icono('alerta') + '<div>Anulado el ' + esc(fmtFechaHora(g.anulado_en)) +
        ' por ' + esc(nombreUsuario(g.anulado_por)) + ': ' + esc(g.motivo_anulacion || '') + '</div></div>' : '') +
      '<div class="tarjeta">' +
      d('Monto', '<b class="num">' + fmtUSD(g.monto_usd) + '</b>' + (g.moneda === 'VES' ? ' (' + fmtBs(g.monto) + ' a ' + fmtTasa(g.tasa) + ')' : '')) +
      d('Detalle', esc(g.descripcion || '')) +
      d('Fecha', esc(fmtFechaAnio(g.fecha))) +
      d('Tienda', g.sede ? esc(nombreSede(g.sede)) : 'De los dos') +
      d('Cómo se pagó', esc(m.nombre || '')) + d('Referencia', esc(g.referencia || '')) +
      d('De', esc(nombreUsuario(g.pagado_por))) +
      d('Anotado', esc(fmtFechaHora(g.hecho_en || g.creado_en)) + ' por ' + esc(nombreUsuario(g.creado_por))) +
      d('Nota', esc(g.nota || '')) +
      '</div>' +
      (!g.anulado_en && !mio ? '<p class="tenue chico" style="margin-top:10px">Es un gasto de ' + esc(nombreUsuario(g.creado_por)) + ': si está mal, lo anula él.</p>' : ''),
    pie: mio ? '<div class="botonera"><button type="button" class="btn btn-sec" id="dgRepetir">' + icono('refrescar') + 'Repetir</button>' +
      (!g.anulado_en ? '<button type="button" class="btn btn-sec" id="dgAnular" style="color:var(--rojo)">Anular</button>' : '') + '</div>' : ''
  });
  var rp = h.$('#dgRepetir');
  if (rp) rp.onclick = function () { h.cerrar(); hojaGasto(g); };
  var an = h.$('#dgAnular');
  if (an) protegerBoton(an, async function () {
    var motivo = await confirmar({ titulo: 'Anular gasto', pedir: 'Por qué se anula', boton: 'Anular', peligro: true,
      mensajeHtml: '<p>El gasto de <b>' + fmtUSD(g.monto_usd) + '</b> deja de contar. No se borra: queda anulado, con el motivo, en el historial.</p>' });
    if (!motivo) return;
    await rpc('anular_gasto', { p_id: g.id, p_motivo: motivo });
    try { await recargarGastos(); } catch (e) { /* luego */ }
    h.cerrar();
    toast('Gasto anulado', 'ok');
    repintar();
  });
}
