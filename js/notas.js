// Electro Montana — notas de cobro (visitas, llamadas, "no estaba", promesas de pago) y recordatorios.
'use strict';

var TIPOS_NOTA = {
  visita: { nombre: 'Visita', icono: 'mapa' },
  llamada: { nombre: 'Llamada', icono: 'telefono' },
  no_estaba: { nombre: 'No estaba', icono: 'alerta' },
  promesa: { nombre: 'Promesa de pago', icono: 'calendario' },
  mensaje: { nombre: 'Mensaje', icono: 'chat' },
  recordatorio: { nombre: 'Recordatorio por WhatsApp', icono: 'chat' },
  otro: { nombre: 'Otro', icono: 'editar' }
};

function notasEnCola(cliId) {
  return Cola.mias().filter(function (o) { return o.tipo === 'gestion' && o.datos.cliente_id === cliId; });
}

// Anotar algo de la cobranza de un cliente
function hojaGestion(cliId, o) {
  o = o || {};
  var c = ST.cliPorId.get(cliId);
  if (!c) return;
  var r = resumenCliente(cliId), clave = nuevaClave(), tipo = o.tipo || 'visita';
  var sugerido = r.atraso > 0 ? r.atraso : (r.proxima ? r.proxima.pendiente : null);
  var h = abrirHoja({
    titulo: 'Nota de cobro',
    html: '<p class="fuerte" style="margin-bottom:10px">' + esc(c.nombre) + '</p>' +
      '<div class="metodos" id="ngTipos">' + ['visita', 'llamada', 'no_estaba', 'promesa', 'mensaje', 'otro'].map(function (t) {
        return '<button type="button" class="chip' + (t === tipo ? ' activo' : '') + '" data-t="' + t + '">' + TIPOS_NOTA[t].nombre + '</button>';
      }).join('') + '</div>' +
      '<div id="ngPromesa" class="dos" style="margin-top:12px"' + (tipo === 'promesa' ? '' : ' hidden') + '>' +
        '<label class="campo"><span>¿Para cuándo?</span><input type="date" id="ngFecha" value="' + sumarDias(hoyCaracas(), 1) + '" min="' + hoyCaracas() + '"></label>' +
        '<label class="campo"><span>¿Cuánto? $</span><input id="ngMonto" inputmode="decimal" value="' + esc(sugerido ? numCampo(sugerido) : '') + '"></label></div>' +
      '<label class="campo" style="margin-top:12px"><span>Nota</span><textarea id="ngNota" rows="3" placeholder="Ej.: dice que cobra el viernes; dejar recado con la hermana"></textarea></label>',
    pie: '<button type="button" class="btn btn-ancho" id="ngGuardar">Guardar nota</button>'
  });
  h.$('#ngTipos').addEventListener('click', function (e) {
    var b = e.target.closest('[data-t]'); if (!b) return;
    tipo = b.dataset.t;
    $$('.chip', this).forEach(function (x) { x.classList.toggle('activo', x === b); });
    h.$('#ngPromesa').hidden = tipo !== 'promesa';
  });
  protegerBoton(h.$('#ngGuardar'), async function () {
    var datos = { cliente_id: cliId, tipo: tipo, nota: h.$('#ngNota').value.trim(), hecho_en: new Date().toISOString() };
    if (tipo === 'promesa') {
      datos.promesa_fecha = h.$('#ngFecha').value;
      if (!datos.promesa_fecha) { toast('Escribe para cuándo prometió pagar', 'error'); return; }
      var m = parseNum(h.$('#ngMonto').value);
      if (!isNaN(m) && m > 0) datos.promesa_monto = redondear2(m);
    } else if (!datos.nota && tipo === 'otro') { toast('Escribe la nota', 'error'); return; }
    var r = await enviarYEsperar({ clave: clave, tipo: 'gestion', datos: datos, resumen: { texto: TIPOS_NOTA[tipo].nombre + ' de ' + c.nombre } });
    h.cerrar();
    if (r.estado === 'ok') { try { await recargarCliente(cliId); } catch (e) { /* luego */ } toast('Nota guardada', 'ok'); }
    else toast('Sin señal: nota guardada en el teléfono.', '', 4000);
    repintar();
    if (o.alGuardar) o.alGuardar();
  });
}

// Lista de notas para la ficha del cliente
function htmlNotas(cliId) {
  var pend = notasEnCola(cliId), lista = (ST.gestionesPorCliente.get(cliId) || []).slice(0, 12);
  if (!pend.length && !lista.length) return '<p class="tenue">Todavía no hay notas de cobro.</p>';
  function fila(g, enCola) {
    var t = TIPOS_NOTA[g.tipo] || TIPOS_NOTA.otro, puede = !enCola && (esDueno() || g.usuario_id === ST.yo.id);
    var extra = g.tipo === 'promesa' ? ' · para el ' + fmtFecha(g.promesa_fecha) + (g.promesa_monto ? ' · ' + fmtUSD(g.promesa_monto) : '') : '';
    return '<div class="item" style="cursor:default;align-items:flex-start">' + icono(t.icono, 'ic-chico') +
      '<div class="crece"><div class="fuerte">' + esc(t.nombre) + esc(extra) + '</div>' +
      (g.nota ? '<div>' + esc(g.nota) + '</div>' : '') +
      '<div class="item-sub">' + (enCola ? 'Por enviar' : esc(fmtFechaHora(g.hecho_en || g.creado_en)) + ' · ' + esc(nombreUsuario(g.usuario_id))) + '</div></div>' +
      (puede ? '<button type="button" class="btn btn-plano btn-icono" data-quitar-nota="' + g.id + '" aria-label="Quitar nota">' + icono('cerrar', 'ic-chico') + '</button>' : '') +
      '</div>';
  }
  return '<div class="lista">' + pend.map(function (o) { return fila(o.datos, true); }).join('') + lista.map(function (g) { return fila(g, false); }).join('') + '</div>';
}

async function quitarNota(id, cliId) {
  if (!(await confirmar({ titulo: 'Quitar nota', mensaje: '¿Quitar esta nota de cobro?', boton: 'Quitar', peligro: true }))) return;
  try {
    await rpc('anular_gestion', { p_id: id });
    await recargarCliente(cliId);
    repintar();
  } catch (e) { toast(errMsg(e), 'error'); }
}

// Deja anotado que se le mandó un recordatorio (sin esperar: va por la cola)
function anotarRecordatorio(cliId) {
  var op = { clave: nuevaClave(), tipo: 'gestion', datos: { cliente_id: cliId, tipo: 'recordatorio', nota: 'Recordatorio por WhatsApp', hecho_en: new Date().toISOString() },
             resumen: { texto: 'Recordatorio a ' + ((ST.cliPorId.get(cliId) || {}).nombre || '') } };
  Cola.agregar(op).then(function () { Cola.procesar(); });
}
function recordadoHoy(cliId) {
  var hoy = hoyCaracas();
  return (ST.gestionesPorCliente.get(cliId) || []).some(function (g) { return g.tipo === 'recordatorio' && fechaCaracas(g.hecho_en || g.creado_en) === hoy; }) ||
    notasEnCola(cliId).some(function (o) { return o.datos.tipo === 'recordatorio'; });
}

// Texto del recordatorio según el caso
function textoRecordatorio(c, r, cuando) {
  var nombre = c.nombre.split(' ')[0], hoy = hoyCaracas();
  if (r.atraso > 0 && cuando !== 'manana') {
    return 'Hola ' + nombre + ', le saluda Electro Montana. Le recordamos que tiene ' + fmtUSD(r.atraso) +
      ' en cuotas atrasadas desde el ' + fmtFechaAnio(sumarDias(hoy, -r.dias)) + '. Su saldo total es ' + fmtUSD(r.saldo) + '. ¿Cuándo podemos pasar a cobrar? Gracias.';
  }
  if (r.proxima) {
    var dia = r.proxima.fecha === hoy ? 'Hoy' : r.proxima.fecha === sumarDias(hoy, 1) ? 'Mañana' : 'El ' + fmtFechaAnio(r.proxima.fecha);
    return 'Hola ' + nombre + ', le saluda Electro Montana. ' + dia + ' le toca su cuota de ' + fmtUSD(r.proxima.pendiente) + '. Su saldo es ' + fmtUSD(r.saldo) + '. Gracias.';
  }
  return 'Hola ' + nombre + ', le saluda Electro Montana.';
}

// Recordar a varios, uno por uno (WhatsApp no deja mandar a muchos de una vez desde una app)
function hojaRecordatorios(grupo) {
  grupo = grupo || 'atrasados';
  var enviados = new Set();   // los que se mandaron desde esta ventana (no esperan a que la base responda)
  var h = abrirHoja({ titulo: 'Recordar por WhatsApp', completa: true, html: '' });
  function ya(id) { return enviados.has(id) || recordadoHoy(id); }
  function lista() {
    var hoy = hoyCaracas(), manana = sumarDias(hoy, 1), out = [];
    ST.clientes.forEach(function (c) {
      if (c.deleted_at) return;
      var r = resumenCliente(c.id);
      if (!r.activas || !(c.telefono || c.contacto_telefono)) return;
      if (grupo === 'atrasados' && r.atraso > 0) out.push({ c: c, r: r, monto: r.atraso });
      else if (grupo === 'hoy' && r.atraso === 0 && r.proxima && r.proxima.fecha === hoy) out.push({ c: c, r: r, monto: r.proxima.pendiente });
      else if (grupo === 'manana' && r.atraso === 0 && r.proxima && r.proxima.fecha === manana) out.push({ c: c, r: r, monto: r.proxima.pendiente });
    });
    return out.sort(function (a, b) { return b.r.dias - a.r.dias || b.monto - a.monto; });
  }
  function pintar() {
    var l = lista(), hechos = l.filter(function (x) { return ya(x.c.id); }).length;
    h.cuerpo.innerHTML = '<div class="chips" id="rcGrupo">' + [['atrasados', 'Atrasados'], ['hoy', 'Les toca hoy'], ['manana', 'Les toca mañana']].map(function (g) {
        return '<button type="button" class="chip' + (g[0] === grupo ? ' activo' : '') + '" data-g="' + g[0] + '">' + g[1] + '</button>';
      }).join('') + '</div>' +
      '<p class="tenue chico" style="margin:10px 2px">Toca "Enviar" en cada uno: se abre WhatsApp con el mensaje listo. Al volver, sigue con el próximo. ' +
        (l.length ? hechos + ' de ' + l.length + ' ya recordados hoy.' : '') + '</p>' +
      (l.length ? '<div class="lista">' + l.map(function (x) {
        var listo = ya(x.c.id);
        return '<div class="item" style="cursor:default"><div class="crece"><div class="item-tit cortar">' + esc(x.c.nombre) + '</div>' +
          '<div class="item-sub">' + fmtUSD(x.monto) + (x.r.atraso > 0 ? ' atrasado · ' + textoDias(x.r.dias) : '') + (x.r.promesa ? ' · ' + esc(textoPromesa(x.r.promesa)) : '') + '</div></div>' +
          (listo ? '<span class="etiqueta e-verde">' + icono('check', 'ic-chico') + 'Enviado</span>'
              : '<button type="button" class="btn btn-chico" data-enviar="' + x.c.id + '">' + icono('chat', 'ic-chico') + 'Enviar</button>') + '</div>';
      }).join('') + '</div>' : '<div class="vacio">' + icono('check') + '<p>No hay a quién recordar en este grupo.</p></div>');
  }
  h.cuerpo.addEventListener('click', function (e) {
    var b = e.target.closest('[data-g]');
    if (b) { grupo = b.dataset.g; pintar(); return; }
    b = e.target.closest('[data-enviar]');
    if (b) {
      var id = Number(b.dataset.enviar), c = ST.cliPorId.get(id);
      abrirWhatsApp(textoRecordatorio(c, resumenCliente(id), grupo), c.telefono || c.contacto_telefono);
      anotarRecordatorio(id);
      enviados.add(id);
      pintar();
    }
  });
  pintar();
}
