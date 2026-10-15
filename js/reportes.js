// Electro Montana — reportes para los dueños: por cobrar, cobrado por semana, ventas y ganancia por mes,
// atrasos, morosos, lo más vendido y lo que vale la mercancía de las tiendas.
'use strict';

var VistaReportes = (function () {
  var raiz = null, sede = 'todas', abonos = null, error = null, desde = null;

  function mostrar(c) {
    raiz = document.createElement('div');
    c.appendChild(raiz);
    if (!esDueno()) { raiz.innerHTML = '<div class="vacio">' + icono('candado') + '<p>Los reportes son solo para Franklin y Daniel.</p></div>'; return; }
    raiz.innerHTML = '<div class="chips" id="rpSede">' + [['todas', 'Todo'], ['socopo', 'Socopó'], ['pedraza', 'Pedraza']].map(function (s) {
        return '<button type="button" class="chip' + (s[0] === sede ? ' activo' : '') + '" data-s="' + s[0] + '">' + s[1] + '</button>';
      }).join('') + '</div><div id="rpCuerpo"></div>';
    $('#rpSede', raiz).addEventListener('click', function (e) {
      var b = e.target.closest('[data-s]'); if (!b) return;
      sede = b.dataset.s;
      $$('.chip', this).forEach(function (x) { x.classList.toggle('activo', x === b); });
      pintar();
    });
    raiz.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ir-cliente]');
      if (b) { ir('cliente', b.dataset.irCliente); return; }
      if (e.target.closest('[data-recordar-todos]')) hojaRecordatorios('atrasados');
    });
    pintar();
    cargar();
  }

  function lunes(f) { var d = new Date(f + 'T12:00:00Z').getUTCDay(); return sumarDias(f, -((d + 6) % 7)); }
  function inicioMes(f) { return f.slice(0, 8) + '01'; }
  function mesAntes(f, n) { var a = Number(f.slice(0, 4)), m = Number(f.slice(5, 7)) - 1 - n; while (m < 0) { m += 12; a--; } return a + '-' + String(m + 1).padStart(2, '0') + '-01'; }
  function nombreMes(ym) { return new Intl.DateTimeFormat('es-VE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(ym + '-15T12:00:00Z')); }

  async function cargar() {
    var hoy = hoyCaracas();
    desde = [sumarDias(lunes(hoy), -7 * 7), mesAntes(hoy, 1)].sort()[0];
    try {
      abonos = await traerTodo('abonos', 'id,grupo,cliente_id,fecha,monto_usd,metodo_id,recibido_por', function (q) {
        return q.gte('fecha', desde).is('anulado_en', null).neq('tipo', 'antes_del_sistema');
      });
      error = null;
    } catch (e) { error = errMsg(e); }
    pintar();
  }

  function deLaSede(cliId) {
    if (sede === 'todas') return true;
    var c = ST.cliPorId.get(cliId);
    return !!c && c.sede === sede;
  }

  function barras(filas, fmt) {
    var max = filas.reduce(function (m, f) { return Math.max(m, f.valor); }, 0) || 1;
    return '<div class="barras">' + filas.map(function (f) {
      return '<div class="barra-fila"><span class="barra-etq">' + esc(f.etq) + '</span>' +
        '<span class="barra-pista"><span class="barra' + (f.actual ? ' actual' : '') + '" style="width:' + Math.max(f.valor > 0 ? 2 : 0, Math.round(f.valor / max * 100)) + '%"></span></span>' +
        '<span class="barra-val num">' + (fmt || fmtUSD)(f.valor) + '</span></div>';
    }).join('') + '</div>';
  }

  function pintar() {
    var cont = raiz && $('#rpCuerpo', raiz);
    if (!cont || !cont.isConnected) return;
    var hoy = hoyCaracas(), h = '';

    // ---- Lo que deben ----
    var porCobrar = 0, atrasado = 0, nDeben = 0, tramos = [
      { etq: 'Al día', min: 0, max: 0, n: 0, monto: 0 }, { etq: '1 a 15 días', min: 1, max: 15, n: 0, monto: 0 },
      { etq: '16 a 30 días', min: 16, max: 30, n: 0, monto: 0 }, { etq: '31 a 60 días', min: 31, max: 60, n: 0, monto: 0 },
      { etq: 'Más de 60 días', min: 61, max: 1e9, n: 0, monto: 0 }];
    var morosos = [];
    ST.clientes.forEach(function (c) {
      if (c.deleted_at || !deLaSede(c.id)) return;
      var r = resumenCliente(c.id);
      if (!r.activas || r.saldo <= 0.004) return;
      porCobrar += r.saldo; nDeben++; atrasado += r.atraso;
      var d = r.atraso > 0 ? Math.max(1, r.dias) : 0;
      var t = tramos.find(function (x) { return d >= x.min && d <= x.max; });
      t.n++; t.monto += r.atraso > 0 ? r.atraso : r.saldo;
      if (r.atraso > 0) morosos.push({ c: c, r: r });
    });
    morosos.sort(function (a, b) { return b.r.dias - a.r.dias || b.r.atraso - a.r.atraso; });

    // ---- Ventas por mes (solo ventas nuevas; "Ya debía" no es venta del mes) ----
    var meses = [];
    for (var i = 5; i >= 0; i--) meses.push({ ym: mesAntes(hoy, i).slice(0, 7), n: 0, vendido: 0, costo: 0, sinCosto: 0, inicial: 0 });
    var porProducto = new Map(), hace90 = sumarDias(hoy, -90);
    ST.ventas.forEach(function (v) {
      if (v.origen !== 'nueva' || !deLaSede(v.cliente_id)) return;
      var its = ST.itemsPorVenta.get(v.id) || [];
      var m = meses.find(function (x) { return x.ym === v.fecha.slice(0, 7); });
      if (m) {
        m.n++; m.vendido += Number(v.total); m.inicial += Number(v.inicial) || 0;
        its.forEach(function (it) {
          var c = ST.costoPorItem.get(it.id);
          if (c == null) m.sinCosto++; else m.costo += c * it.cantidad;
        });
      }
      if (v.fecha >= hace90) its.forEach(function (it) {
        var k = it.producto_id ? 'p' + it.producto_id : 'd' + normalizar(it.descripcion);
        var x = porProducto.get(k) || { nombre: it.descripcion, unidades: 0, vendido: 0 };
        x.unidades += it.cantidad; x.vendido += it.cantidad * Number(it.precio);
        porProducto.set(k, x);
      });
    });
    var esteMes = meses[meses.length - 1];

    // ---- Cobrado ----
    var semanas = [], cobradoMes = 0, porMetodo = new Map(), hace30 = sumarDias(hoy, -29);
    for (var s = 7; s >= 0; s--) { var l = sumarDias(lunes(hoy), -7 * s); semanas.push({ desde: l, hasta: sumarDias(l, 6), valor: 0 }); }
    if (abonos) abonos.forEach(function (a) {
      if (!deLaSede(a.cliente_id)) return;
      var m = Number(a.monto_usd);
      var w = semanas.find(function (x) { return a.fecha >= x.desde && a.fecha <= x.hasta; });
      if (w) w.valor += m;
      if (a.fecha >= inicioMes(hoy)) cobradoMes += m;
      if (a.fecha >= hace30) porMetodo.set(a.metodo_id, (porMetodo.get(a.metodo_id) || 0) + m);
    });

    h += '<div class="kpis" style="margin-top:12px">' +
      kpi('Por cobrar', fmtUSD(porCobrar), plural(nDeben, 'cliente', 'clientes')) +
      kpi('Atrasado', fmtUSD(atrasado), porCobrar > 0 ? Math.round(atrasado / porCobrar * 100) + '% de lo que deben' : '—', atrasado > 0 ? 'rojo' : '') +
      kpi('Cobrado este mes', abonos ? fmtUSD(cobradoMes) : '—', abonos ? 'desde el 1 de ' + nombreMes(esteMes.ym).split(' ')[0] : (error ? 'sin señal' : 'cargando…'), 'verde') +
      kpi('Ganancia del mes', fmtUSD(esteMes.vendido - esteMes.costo), esteMes.sinCosto ? esteMes.sinCosto + ' sin costo anotado' : plural(esteMes.n, 'venta', 'ventas')) +
      '</div>';

    // Cobrado por semana
    h += '<div class="seccion"><div class="seccion-tit"><h2>Cobrado por semana</h2></div><div class="tarjeta">';
    if (error) h += '<p class="tenue">' + icono('sinsenal', 'ic-chico') + ' ' + esc(error) + '</p>';
    else if (!abonos) h += '<div class="cargando">Cargando…</div>';
    else {
      h += barras(semanas.map(function (w, i) { return { etq: fmtFecha(w.desde) + ' al ' + fmtFecha(w.hasta), valor: w.valor, actual: i === semanas.length - 1 }; }));
      var tot8 = semanas.reduce(function (t, w) { return t + w.valor; }, 0);
      h += '<p class="tenue chico" style="margin-top:10px">Promedio: <b>' + fmtUSD(tot8 / 8) + '</b> por semana (últimas 8). Sin contar lo pagado antes del sistema.</p>';
      if (porMetodo.size) {
        h += '<h3 style="margin-top:14px">Últimos 30 días por método</h3><div style="margin-top:6px">' + Array.from(porMetodo.entries()).sort(function (a, b) { return b[1] - a[1]; }).map(function (e) {
          return '<div class="dato"><span>' + esc((metodoPorId(e[0]) || {}).nombre || '—') + '</span><span class="crece num">' + fmtUSD(e[1]) + '</span></div>';
        }).join('') + '</div>';
      }
    }
    h += '</div></div>';

    // Ventas por mes
    h += '<div class="seccion"><div class="seccion-tit"><h2>Ventas por mes</h2></div><div class="tarjeta">' +
      barras(meses.map(function (m, i) { return { etq: nombreMes(m.ym).replace(/ de \d+$/, '').replace(/^\w/, function (x) { return x.toUpperCase(); }), valor: m.vendido, actual: i === meses.length - 1 }; })) +
      '<div style="margin-top:12px">' + meses.slice().reverse().map(function (m) {
        if (!m.n) return '';
        return '<div class="dato"><span>' + esc(nombreMes(m.ym)) + '</span><span class="crece">' + plural(m.n, 'venta', 'ventas') + ' · vendido <b class="num">' + fmtUSD(m.vendido) + '</b>' +
          '<br>Ganancia <b class="num">' + fmtUSD(m.vendido - m.costo) + '</b>' + (m.sinCosto ? ' <span class="tenue">(faltan ' + m.sinCosto + ' costos)</span>' : '') +
          ' · iniciales ' + fmtUSD(m.inicial) + '</span></div>';
      }).join('') + '</div>' +
      '<p class="tenue chico" style="margin-top:8px">La ganancia es lo vendido menos lo que costó en Yumana. Lo de "Ya debía" no se cuenta como venta del mes.</p></div></div>';

    // Atrasos
    h += '<div class="seccion"><div class="seccion-tit"><h2>Cómo van los que deben</h2></div><div class="tarjeta">' +
      tramos.map(function (t, i) {
        return '<div class="dato"><span>' + t.etq + '</span><span class="crece">' + plural(t.n, 'cliente', 'clientes') + ' · <b class="num"' + (i > 0 && t.monto > 0 ? ' style="color:var(--rojo)"' : '') + '>' +
          fmtUSD(t.monto) + '</b> ' + (i === 0 ? 'por cobrar' : 'atrasado') + '</span></div>';
      }).join('') + '</div></div>';

    // Morosos
    h += '<div class="seccion"><div class="seccion-tit"><h2>Atrasados <span class="tenue">' + morosos.length + '</span></h2>' +
      (morosos.length ? '<button type="button" class="btn btn-sec btn-chico" data-recordar-todos>' + icono('chat', 'ic-chico') + 'Recordar</button>' : '') + '</div>';
    if (!morosos.length) h += '<p class="tenue">Nadie atrasado.</p>';
    else h += '<div class="lista">' + morosos.slice(0, 40).map(function (x) {
      var ult = x.r.ultimoAbono, nota = x.r.ultimaNota;
      return '<button type="button" class="item" data-ir-cliente="' + x.c.id + '"><div class="crece"><div class="item-tit cortar">' + esc(x.c.nombre) + '</div>' +
        '<div class="item-sub">' + textoDias(x.r.dias) + ' · último abono ' + (ult ? esc(fmtFechaAnio(ult)) : 'nunca') + (x.r.retirada ? ' · retirada' : '') + '</div>' +
        (x.r.promesa ? '<div class="item-sub">' + esc(textoPromesa(x.r.promesa)) + '</div>' : nota && nota.nota ? '<div class="item-sub cortar">' + esc(fmtFecha(fechaCaracas(nota.hecho_en || nota.creado_en))) + ': ' + esc(nota.nota) + '</div>' : '') +
        '</div><div class="item-der"><div class="monto" style="color:var(--rojo)">' + fmtUSD(x.r.atraso) + '</div><div class="tenue chico">debe ' + fmtUSD(x.r.saldo) + '</div></div></button>';
    }).join('') + '</div>' + (morosos.length > 40 ? '<p class="tenue chico centro" style="margin-top:8px">Y ' + (morosos.length - 40) + ' más en Cobrar.</p>' : '');
    h += '</div>';

    // Lo más vendido
    var top = Array.from(porProducto.values()).sort(function (a, b) { return b.unidades - a.unidades || b.vendido - a.vendido; }).slice(0, 10);
    h += '<div class="seccion"><div class="seccion-tit"><h2>Lo más vendido</h2><span class="tenue">90 días</span></div>';
    h += top.length ? '<div class="tarjeta">' + top.map(function (p) {
      return '<div class="dato"><span class="num">' + p.unidades + ' ×</span><span class="crece">' + esc(p.nombre) + ' <span class="tenue">· ' + fmtUSD(p.vendido) + '</span></span></div>';
    }).join('') + '</div>' : '<p class="tenue">Todavía no hay ventas nuevas.</p>';
    h += '</div>';

    // Mercancía guardada
    var tiendas = ['pedraza', 'socopo'].filter(function (sd) { return sede === 'todas' || sede === sd; }).map(function (sd) {
      var u = 0, costo = 0, sinCosto = 0;
      ST.productos.forEach(function (p) {
        var n = existenciaDe(p.id, sd); if (n <= 0) return;
        u += n; var c = ST.costoProducto.get(p.id); if (c == null) sinCosto++; else costo += n * c;
      });
      return { sd: sd, u: u, costo: costo, sinCosto: sinCosto };
    }).filter(function (t) { return t.u > 0; });
    if (tiendas.length) {
      h += '<div class="seccion"><div class="seccion-tit"><h2>Mercancía guardada</h2></div><div class="tarjeta">' + tiendas.map(function (t) {
        return '<div class="dato"><span>' + (t.sd === 'pedraza' ? 'Tienda de Pedraza' : 'Socopó') + '</span><span class="crece">' + plural(t.u, 'unidad', 'unidades') +
          ' · vale <b class="num">' + fmtUSD(t.costo) + '</b> a costo' + (t.sinCosto ? ' <span class="tenue">(' + t.sinCosto + ' sin costo)</span>' : '') + '</span></div>';
      }).join('') + '</div></div>';
    }
    cont.innerHTML = h;
  }

  function kpi(etq, val, sub, clase) {
    return '<div class="kpi ' + (clase || '') + '"><div class="etq">' + etq + '</div><div class="val">' + val + '</div><div class="sub">' + esc(sub) + '</div></div>';
  }

  return { mostrar: mostrar, refrescar: function () { pintar(); cargar(); } };
})();
