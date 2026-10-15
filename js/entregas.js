// Electro Montana — efectivo por entregar: lo que cobra el empleado de Pedraza en efectivo
// queda "en sus manos" hasta que Franklin o Daniel lo reciben (entrega).
'use strict';

var VistaEntregas = (function () {
  var raiz = null, pendientes = null, entregas = null, error = null, abiertos = new Set();

  function mostrar(c) {
    raiz = document.createElement('div');
    c.appendChild(raiz);
    $('#tituloVista').textContent = esDueno() ? 'Efectivo de Pedraza' : 'Mi efectivo';
    raiz.addEventListener('click', alTocar);
    cargar();
  }

  function empleados() {
    if (!esDueno()) return [ST.yo];
    return ST.usuarios.filter(function (u) { return u.rol !== 'dueno'; });
  }

  async function cargar() {
    pendientes = null; entregas = null; error = null; pintar();
    try {
      var ids = empleados().map(function (u) { return u.id; });
      var enMano = ST.metodos.filter(function (m) { return m.en_mano; }).map(function (m) { return m.id; });
      var r = await Promise.all([
        ids.length && enMano.length ? traerTodo('abonos', '*', function (q) {
          return q.is('entrega_id', null).is('anulado_en', null).in('recibido_por', ids).in('metodo_id', enMano);
        }) : Promise.resolve([]),
        sb.from('entregas').select('*').order('id', { ascending: false }).limit(60).then(_uno)
      ]);
      pendientes = r[0]; entregas = r[1] || [];
    } catch (e) { error = errMsg(e); }
    pintar();
  }

  function sumar(lista) {
    var s = { usd: 0, bs: 0, n: new Set() };
    lista.forEach(function (a) { if (a.moneda === 'USD') s.usd += Number(a.monto); else s.bs += Number(a.monto); s.n.add(a.grupo); });
    return s;
  }

  function pintar() {
    if (!raiz || !raiz.isConnected) return;
    if (error) { raiz.innerHTML = '<div class="aviso aviso-error">' + icono('sinsenal') + '<div>' + esc(error) + '</div></div>'; return; }
    if (!pendientes) { raiz.innerHTML = '<div class="cargando">Cargando…</div>'; return; }
    var emps = empleados(), h = '';
    if (!emps.length) {
      h = '<div class="vacio">' + icono('tienda') + '<p>Todavía no hay empleados. Créalo en Ajustes → Usuarios.</p></div>';
    }
    emps.forEach(function (u) {
      var mios = pendientes.filter(function (a) { return a.recibido_por === u.id; });
      var s = sumar(mios), abierto = abiertos.has(u.id);
      h += '<div class="tarjeta"><div class="fila-sep"><div><h3>' + esc(esDueno() ? u.nombre : 'Tienes por entregar') + '</h3>' +
          (esDueno() ? '<div class="tenue chico">' + esc(u.sede ? 'Empleado de ' + nombreSede(u.sede) : '') + (u.activo ? '' : ' · desactivado') + '</div>' : '') + '</div>' +
          '<span class="etiqueta ' + (s.n.size ? 'e-cobre' : 'e-verde') + '">' + (s.n.size ? plural(s.n.size, 'cobro', 'cobros') : 'Nada pendiente') + '</span></div>' +
        '<div class="deuda-caja"><div><div class="tenue chico">Dólares en efectivo</div><div class="monto-grande">' + fmtUSD(s.usd) + '</div></div>' +
          '<div><div class="tenue chico">Bolívares en efectivo</div><div class="monto-grande">' + fmtBs(s.bs) + '</div></div></div>' +
        (s.n.size ? '<div class="botonera" style="margin-top:12px">' +
          '<button type="button" class="btn btn-sec" data-ver="' + u.id + '">' + (abierto ? 'Ocultar cobros' : 'Ver cobros') + '</button>' +
          (esDueno() ? '<button type="button" class="btn" data-recibir="' + u.id + '">Recibir entrega</button>' : '') + '</div>' : '') +
        (abierto ? '<div class="lista" style="margin-top:12px">' + agruparAbonos(mios).map(function (g) { return filaAbono(g, true); }).join('') + '</div>' : '') +
        '</div>';
    });
    h += '<div class="seccion"><div class="seccion-tit"><h2>Entregas hechas</h2></div>';
    if (!entregas.length) h += '<p class="tenue">Todavía no hay entregas.</p>';
    else h += '<div class="lista">' + entregas.map(function (e) {
      var dUsd = redondear2(e.entregado_usd - e.esperado_usd), dBs = redondear2(e.entregado_bs - e.esperado_bs);
      var cuadra = Math.abs(dUsd) < 0.005 && Math.abs(dBs) < 0.005;
      return '<div class="item" style="cursor:default"><div class="crece"><div class="item-tit">#' + e.numero + ' · ' + esc(fmtFechaAnio(e.fecha)) + '</div>' +
        '<div class="item-sub">' + esc(nombreUsuario(e.usuario_id)) + ' entregó a ' + esc(nombreUsuario(e.recibido_por)) + ' · ' + plural(e.abonos, 'cobro', 'cobros') + '</div>' +
        '<div class="item-sub num">' + fmtUSD(e.entregado_usd) + ' y ' + fmtBs(e.entregado_bs) + '</div>' +
        (e.nota ? '<div class="item-sub">' + esc(e.nota) + '</div>' : '') + '</div>' +
        (cuadra ? '<span class="etiqueta e-verde">Cuadró</span>' : '<span class="etiqueta e-rojo">' +
          [Math.abs(dUsd) >= 0.005 ? (dUsd < 0 ? 'Faltó ' : 'Sobró ') + fmtUSD(Math.abs(dUsd)) : '', Math.abs(dBs) >= 0.005 ? (dBs < 0 ? 'Faltó ' : 'Sobró ') + fmtBs(Math.abs(dBs)) : ''].filter(Boolean).join(' · ') + '</span>') +
        '</div>';
    }).join('') + '</div>';
    h += '</div>';
    raiz.innerHTML = h;
  }

  function alTocar(e) {
    var b;
    if ((b = e.target.closest('[data-ver]'))) {
      if (abiertos.has(b.dataset.ver)) abiertos.delete(b.dataset.ver); else abiertos.add(b.dataset.ver);
      pintar(); return;
    }
    if ((b = e.target.closest('[data-recibir]'))) { hojaRecibir(b.dataset.recibir); return; }
    if ((b = e.target.closest('[data-grupo]'))) hojaDetalleAbono(pendientes.filter(function (a) { return a.grupo === b.dataset.grupo; }), cargar);
  }

  function hojaRecibir(uid) {
    var u = ST.usrPorId.get(uid), s = sumar(pendientes.filter(function (a) { return a.recibido_por === uid; }));
    var clave = nuevaClave();
    var h = abrirHoja({
      titulo: 'Recibir de ' + u.nombre,
      html: '<p>Según el sistema, ' + esc(u.nombre) + ' tiene <b>' + fmtUSD(s.usd) + '</b> y <b>' + fmtBs(s.bs) + '</b> en efectivo (' + plural(s.n.size, 'cobro', 'cobros') + ').</p>' +
        '<p class="tenue chico">Cuenta el dinero y escribe lo que te entregó de verdad. Si no cuadra, queda anotado.</p>' +
        '<div class="pila"><div class="dos"><label class="campo"><span>Entregó en $</span><input id="enUsd" inputmode="decimal" value="' + esc(numCampo(s.usd)) + '"></label>' +
        '<label class="campo"><span>Entregó en Bs</span><input id="enBs" inputmode="decimal" value="' + esc(numCampo(s.bs)) + '"></label></div>' +
        '<div id="enDif"></div>' +
        '<label class="campo"><span>Nota (opcional)</span><input id="enNota"></label></div>',
      pie: '<button type="button" class="btn btn-ancho" id="enGuardar">Guardar entrega</button>'
    });
    function dif() {
      var usd = parseNum(h.$('#enUsd').value) || 0, bs = parseNum(h.$('#enBs').value) || 0;
      var dU = redondear2(usd - s.usd), dB = redondear2(bs - s.bs);
      h.$('#enDif').innerHTML = Math.abs(dU) < 0.005 && Math.abs(dB) < 0.005 ? '<span class="suma-ok">' + icono('check', 'ic-chico') + ' Cuadra</span>'
        : '<span class="suma-mal">' + [Math.abs(dU) >= 0.005 ? (dU < 0 ? 'Faltan ' : 'Sobran ') + fmtUSD(Math.abs(dU)) : '', Math.abs(dB) >= 0.005 ? (dB < 0 ? 'Faltan ' : 'Sobran ') + fmtBs(Math.abs(dB)) : ''].filter(Boolean).join(' y ') + '</span>';
    }
    h.$('#enUsd').addEventListener('input', dif);
    h.$('#enBs').addEventListener('input', dif);
    dif();
    protegerBoton(h.$('#enGuardar'), async function () {
      var usd = parseNum(h.$('#enUsd').value), bs = parseNum(h.$('#enBs').value);
      if (isNaN(usd) || usd < 0 || isNaN(bs) || bs < 0) { toast('Revisa los montos', 'error'); return; }
      var r = await rpc('registrar_entrega', { p_usuario: uid, p_entregado_usd: redondear2(usd), p_entregado_bs: redondear2(bs), p_nota: h.$('#enNota').value.trim(), p_clave: clave });
      h.cerrar();
      var cuadra = Math.abs(r.diferencia_usd) < 0.005 && Math.abs(r.diferencia_bs) < 0.005;
      toast(cuadra ? 'Entrega #' + r.numero + ' guardada. Cuadró.' : 'Entrega #' + r.numero + ' guardada con diferencia.', cuadra ? 'ok' : 'error', 5000);
      cargar();
    });
  }

  return { mostrar: mostrar, refrescar: cargar };
})();
