// Electro Montana — pantalla Cobrar: quién está atrasado, a quién le toca hoy y esta semana.
'use strict';

var VistaCobrar = (function () {
  var filtro = 'todos', busca = '', cont = null, cobradoHoy = null;

  function mostrar(c) {
    cont = document.createElement('div');
    c.appendChild(cont);
    var hoy = hoyCaracas();
    cont.innerHTML =
      '<div class="fila-sep" style="margin-bottom:12px"><div><h2>Hola, ' + esc(ST.yo.nombre.split(' ')[0]) + '</h2>' +
        '<div class="tenue">' + esc(fmtFechaLarga(hoy)) + '</div></div></div>' +
      '<div id="cbAvisos"></div>' +
      '<div class="kpis" id="cbKpis"></div>' +
      (esDueno() ? '<div class="chips" id="cbFiltro" style="margin-top:14px">' +
        [['todos', 'Todos'], ['socopo', 'Socopó'], ['pedraza', 'Pedraza'], ['exterior', 'Exterior']].map(function (f) {
          return '<button type="button" class="chip' + (filtro === f[0] ? ' activo' : '') + '" data-f="' + f[0] + '">' + f[1] + '</button>';
        }).join('') + '</div>' : '') +
      '<div class="buscador" style="margin-top:10px">' + icono('buscar') + '<input id="cbBusca" type="search" placeholder="Buscar cliente" value="' + esc(busca) + '"></div>' +
      '<div id="cbListas"></div>' +
      '<p class="tenue chico centro" id="cbPie" style="margin-top:20px"></p>';
    var f = $('#cbFiltro', cont);
    if (f) f.addEventListener('click', function (e) {
      var b = e.target.closest('[data-f]'); if (!b) return;
      filtro = b.dataset.f;
      $$('.chip', f).forEach(function (x) { x.classList.toggle('activo', x === b); });
      pintar();
    });
    $('#cbBusca', cont).addEventListener('input', debounce(function (e) { busca = e.target.value; pintar(); }, 200));
    cont.addEventListener('click', alTocar);
    pintar();
    cargarCobradoHoy();
  }

  function pasaFiltro(c) {
    if (filtro === 'exterior') return c.en_exterior;
    if (filtro === 'socopo' || filtro === 'pedraza') return c.sede === filtro;
    return true;
  }

  function pintar() {
    if (!cont || !cont.isConnected) return;
    var hoy = hoyCaracas(), en7 = sumarDias(hoy, 7);
    var q = normalizar(busca.trim());
    var atrasados = [], hoyL = [], proximos = [], promesasHoy = [];
    var total = 0, totalAtraso = 0, nDeben = 0, nAtraso = 0, montoHoy = 0;
    ST.clientes.forEach(function (c) {
      if (c.deleted_at || !pasaFiltro(c)) return;
      var r = resumenCliente(c.id);
      if (!r.activas) return;
      total += r.saldo; if (r.saldo > 0.004) nDeben++;
      if (r.atraso > 0) { totalAtraso += r.atraso; nAtraso++; }
      if (q && normalizar(c.nombre + ' ' + (c.sector || '') + ' ' + (c.cedula || '')).indexOf(q) < 0) return;
      var x = { c: c, r: r };
      if (r.promesa && r.promesa.estado === 'pendiente' && r.promesa.fecha === hoy) promesasHoy.push(x);
      else if (r.atraso > 0) atrasados.push(x);
      else if (r.proxima && r.proxima.fecha === hoy) { hoyL.push(x); montoHoy += r.proxima.pendiente; }
      else if (r.proxima && r.proxima.fecha > hoy && r.proxima.fecha <= en7) proximos.push(x);
    });
    atrasados.sort(function (a, b) { return b.r.dias - a.r.dias || b.r.atraso - a.r.atraso; });
    proximos.sort(function (a, b) { return a.r.proxima.fecha < b.r.proxima.fecha ? -1 : 1; });

    // Avisos
    var av = esDueno() ? htmlAvisoAprobaciones() : '';
    if (esDueno() && !tasaDeHoy()) av += '<button type="button" class="aviso aviso-ambar" style="width:100%;border:0;text-align:left;margin-bottom:12px;cursor:pointer" data-tasa>' + icono('alerta') + '<div>Todavía no se ha puesto la tasa de hoy. Toca aquí para ponerla.</div></button>';
    if (tocaCopia()) av += '<button type="button" class="aviso aviso-ambar" style="width:100%;border:0;text-align:left;margin-bottom:12px;cursor:pointer" data-ir-copia>' + icono('nube') +
      '<div>' + (diasSinCopia() == null ? 'Todavía no se ha descargado una copia de seguridad.' : 'Hace ' + plural(diasSinCopia(), 'día', 'días') + ' que no se descarga una copia de seguridad.') +
      ' Toca aquí para hacerla (un minuto).</div></button>';
    if (ST.desdeCache) av += '<div class="aviso aviso-info" style="margin-bottom:12px">' + icono('sinsenal') + '<div>Sin señal: estos son los datos guardados ' + esc(haceCuanto(ST.cargadoEn)) + '.</div></div>';
    $('#cbAvisos', cont).innerHTML = av;

    $('#cbKpis', cont).innerHTML =
      kpi('Por cobrar', fmtUSD(total), plural(nDeben, 'cliente', 'clientes')) +
      kpi('Atrasado', fmtUSD(totalAtraso), plural(nAtraso, 'cliente', 'clientes'), totalAtraso > 0 ? 'rojo' : '') +
      kpi('Cobrado hoy', cobradoHoy ? fmtUSD(cobradoHoy.total) : '—', cobradoHoy ? plural(cobradoHoy.n, 'abono', 'abonos') : 'sin datos', 'verde') +
      kpi('Les toca hoy', fmtUSD(montoHoy), plural(hoyL.length, 'cliente', 'clientes'));

    var html = '';
    if (!ST.ventas.some(function (v) { return v.estado === 'activa'; })) {
      html = '<div class="vacio">' + icono('cobrar') + '<p><b>Todavía no hay ventas por cobrar.</b></p>' +
        '<p>Registra una venta nueva o carga los clientes que ya deben desde el botón Vender.</p>' +
        '<button type="button" class="btn" data-ir-vender style="margin-top:8px">' + icono('vender') + 'Vender</button></div>';
    } else {
      if (promesasHoy.length) html += seccion('Prometieron pagar hoy', promesasHoy, 'hoy', '');
      html += seccion('Atrasados', atrasados, 'atrasado', 'Nadie atrasado. Todo al día.',
        atrasados.length ? '<button type="button" class="btn btn-sec btn-chico" data-recordar-todos="atrasados">' + icono('chat', 'ic-chico') + 'Recordar a todos</button>' : '');
      html += seccion('Les toca hoy', hoyL, 'hoy', 'A nadie le toca hoy.');
      html += seccion('Próximos 7 días', proximos, 'proximo', 'Nada en los próximos 7 días.');
    }
    $('#cbListas', cont).innerHTML = html;
    $('#cbPie', cont).innerHTML = ST.cargadoEn ? 'Datos de ' + esc(haceCuanto(ST.cargadoEn)) + ' · <button type="button" class="btn btn-plano btn-chico" data-actualizar style="display:inline-flex;min-height:32px;padding:0 4px">Actualizar</button>' : '';
  }

  function kpi(etq, val, sub, clase) {
    return '<div class="kpi ' + (clase || '') + '"><div class="etq">' + etq + '</div><div class="val">' + val + '</div><div class="sub">' + esc(sub) + '</div></div>';
  }

  function seccion(titulo, lista, clase, vacio, boton) {
    var h = '<div class="seccion"><div class="seccion-tit"><h2>' + titulo + ' <span class="tenue">' + lista.length + '</span></h2>' + (boton || '') + '</div>';
    if (!lista.length) return h + '<p class="tenue" style="margin:0 2px">' + vacio + '</p></div>';
    var mostrados = lista.slice(0, 60);
    h += '<div class="lista">' + mostrados.map(function (x) { return tarjeta(x, clase); }).join('') + '</div>';
    if (lista.length > 60) h += '<p class="tenue chico centro" style="margin-top:8px">Y ' + (lista.length - 60) + ' más. Usa el buscador.</p>';
    return h + '</div>';
  }

  function tarjeta(x, clase) {
    var c = x.c, r = x.r, giros = Number(ST.cfg && ST.cfg.giros_para_retiro) || 3;
    var etq = '';
    if (r.atraso > 0) etq += '<span class="etiqueta e-rojo">Atrasado ' + fmtUSD(r.atraso) + ' · ' + textoDias(r.dias) + '</span>';
    else if (r.proxima) etq += '<span class="etiqueta ' + (clase === 'hoy' ? 'e-info' : 'e-gris') + '">Cuota ' + fmtUSD(r.proxima.pendiente) + (clase === 'hoy' ? ' hoy' : ' el ' + fmtFecha(r.proxima.fecha)) + '</span>';
    if (r.retirada) etq += '<span class="etiqueta e-gris">Mercancía retirada</span>';
    else if (r.cuotasVencidas >= giros) etq += '<span class="etiqueta e-cobre">' + r.cuotasVencidas + ' cuotas sin pagar</span>';
    if (r.enCola > 0) etq += '<span class="etiqueta e-ambar">' + fmtUSD(r.enCola) + ' por enviar</span>';
    if (r.promesa) etq += '<span class="etiqueta ' + (r.promesa.estado === 'incumplida' ? 'e-rojo' : 'e-info') + '">' + esc(textoPromesa(r.promesa)) + '</span>';
    if (recordadoHoy(c.id)) etq += '<span class="etiqueta e-gris">Recordado hoy</span>';
    var nota = r.ultimaNota && r.ultimaNota.nota && r.ultimaNota.tipo !== 'recordatorio' ? r.ultimaNota : null;
    var sub = [c.sector, esDueno() ? nombreSede(c.sede) : '', c.en_exterior ? (c.pais || 'Exterior') : ''].filter(Boolean).join(' · ');
    return '<div class="cobro ' + clase + '">' +
      '<div class="cobro-cuerpo" data-ir-cliente="' + c.id + '"><div class="avatar">' + esc(iniciales(c.nombre)) + '</div>' +
        '<div class="crece"><div class="item-tit">' + esc(c.nombre) + '</div><div class="item-sub">' + esc(sub || '—') + '</div>' +
        '<div class="fila envolver" style="margin-top:6px;gap:6px">' + etq + '</div>' +
        (nota ? '<div class="item-sub cortar" style="margin-top:4px">' + esc(fmtFecha(fechaCaracas(nota.hecho_en || nota.creado_en))) + ': ' + esc(nota.nota) + '</div>' : '') + '</div>' +
        '<div class="item-der"><div class="tenue chico">Debe</div><div class="monto">' + fmtUSD(r.saldo) + '</div></div></div>' +
      '<div class="cobro-acciones">' +
        '<button type="button" class="principal" data-abonar="' + c.id + '">' + icono('moneda', 'ic-chico') + 'Abonar</button>' +
        '<button type="button" data-recordar="' + c.id + '">' + icono('chat', 'ic-chico') + 'Recordar</button>' +
        '<button type="button" data-nota="' + c.id + '">' + icono('editar', 'ic-chico') + 'Nota</button>' +
        (c.telefono ? '<a href="' + esc(enlaceTel(c.telefono)) + '">' + icono('telefono', 'ic-chico') + 'Llamar</a>' : '') +
      '</div></div>';
  }

  function alTocar(e) {
    var b;
    if ((b = e.target.closest('[data-abonar]'))) { hojaAbono(Number(b.dataset.abonar)); return; }
    if ((b = e.target.closest('[data-recordar]'))) { recordarPorWhatsApp(Number(b.dataset.recordar)); setTimeout(pintar, 300); return; }
    if ((b = e.target.closest('[data-recordar-todos]'))) { hojaRecordatorios(b.dataset.recordarTodos); return; }
    if ((b = e.target.closest('[data-nota]'))) { hojaGestion(Number(b.dataset.nota)); return; }
    if (e.target.closest('[data-tasa]')) { hojaTasa(); return; }
    if (e.target.closest('[data-ir-copia]')) { ir('ajustes', 'copia'); return; }
    if (e.target.closest('[data-aprobaciones]')) { hojaAprobaciones(); return; }
    if (e.target.closest('[data-actualizar]')) { actualizarTodo(true).then(cargarCobradoHoy); return; }
    if (e.target.closest('[data-ir-vender]')) ir('vender');
  }

  async function cargarCobradoHoy() {
    try {
      var hoy = hoyCaracas();
      var filas = await traerTodo('abonos', 'id,grupo,monto_usd', function (q) {
        return q.eq('fecha', hoy).is('anulado_en', null).neq('tipo', 'antes_del_sistema');
      });
      var grupos = new Set(filas.map(function (f) { return f.grupo; }));
      cobradoHoy = { total: filas.reduce(function (s, f) { return s + Number(f.monto_usd); }, 0), n: grupos.size };
      pintar();
    } catch (e) { /* sin señal: queda en blanco */ }
  }

  return { mostrar: mostrar, refrescar: function () { pintar(); cargarCobradoHoy(); } };
})();

// Mensaje de recordatorio listo para WhatsApp (queda anotado en las notas del cliente)
function recordarPorWhatsApp(cliId) {
  var c = ST.cliPorId.get(cliId);
  if (!c) return;
  abrirWhatsApp(textoRecordatorio(c, resumenCliente(cliId)), c.telefono || c.contacto_telefono);
  if (resumenCliente(cliId).activas) anotarRecordatorio(cliId);
}
