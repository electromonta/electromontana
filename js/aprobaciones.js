// Electro Montana — seguridad entre los dos socios.
// Lo que baja una deuda o borra un pago (anular un abono, descuento, anular o cerrar una venta) se PIDE
// y lo aprueba el otro socio: nadie se lo aprueba a sí mismo. Y el historial de cambios, que no se borra.
'use strict';

var TIPOS_SOLICITUD = {
  anular_abono: 'Anular un abono', descuento: 'Descuento', anular_venta: 'Anular una venta', cerrar_venta: 'Cerrar una venta',
  cambiar_vendedor: 'Cambiar de quién es un crédito'
};

function puedoAprobar() { return !!(esDueno() && ST.yo.puede_aprobar); }
function solicitudesPendientes() { return (ST.solicitudes || []).filter(function (s) { return s.estado === 'pendiente'; }); }
function porAprobar() {
  return puedoAprobar() ? solicitudesPendientes().filter(function (s) { return s.pedida_por !== ST.yo.id; }) : [];
}
function misPedidos() { return solicitudesPendientes().filter(function (s) { return s.pedida_por === ST.yo.id; }); }
// Pedido pendiente sobre un abono (grupo) o una venta
function pendienteDe(tipo, ref) {
  return solicitudesPendientes().find(function (s) {
    return (!tipo || s.tipo === tipo) && (ref.grupo ? s.grupo === ref.grupo : s.venta_id === ref.venta_id);
  }) || null;
}
// Quién puede aprobar lo que yo pida
function nombreOtroSocio(pidio) {
  pidio = pidio || ST.yo.id;
  var otros = ST.usuarios.filter(function (u) { return u.puede_aprobar && u.activo && u.id !== pidio; }).map(function (u) { return u.nombre; });
  return otros.length ? otros.join(' o ') : 'el otro socio';
}

async function recargarSolicitudes() {
  if (!esDueno()) return;
  ST.solicitudes = await traerTodo('solicitudes');
  guardarCache();
}

// Pide el cambio. clave: una por formulario, así tocar dos veces no lo pide dos veces.
async function pedirAprobacion(p, clave) {
  var r = await rpc('pedir_aprobacion', { p: p, p_clave: clave });
  try { await recargarSolicitudes(); } catch (e) { /* se ve en la próxima carga */ }
  toast('Pedido. Falta que lo apruebe ' + nombreOtroSocio() + '; mientras tanto no cambia nada.', 'ok', 6000);
  return r;
}

// Aviso en Cobrar (dueños)
function htmlAvisoAprobaciones() {
  var n = porAprobar().length, m = misPedidos().length;
  var est = 'width:100%;border:0;text-align:left;margin-bottom:12px;cursor:pointer';
  if (n) return '<button type="button" class="aviso aviso-ambar" style="' + est + '" data-aprobaciones>' + icono('candado') +
    '<div><b>' + (n === 1 ? 'Un cambio espera' : n + ' cambios esperan') + ' tu aprobación.</b> Toca aquí para verlos.</div></button>';
  if (m) return '<button type="button" class="aviso aviso-info" style="' + est + '" data-aprobaciones>' + icono('reloj') +
    '<div>' + (m === 1 ? 'Un pedido tuyo espera' : m + ' pedidos tuyos esperan') + ' la aprobación de ' + esc(nombreOtroSocio()) + '.</div></button>';
  return '';
}

// Lista de pedidos: aprobar, rechazar o cancelar
function hojaAprobaciones() {
  var h = abrirHoja({ titulo: 'Aprobaciones', completa: true, html: '' });
  var ocupado = false;
  function tarjeta(s, botones) {
    var c = ST.cliPorId.get(s.cliente_id);
    return '<div class="tarjeta" style="margin-bottom:10px">' +
      '<div class="fuerte">' + esc(TIPOS_SOLICITUD[s.tipo] || s.tipo) + '</div>' +
      '<div style="margin-top:4px">' + esc(s.detalle || '') + '</div>' +
      '<div style="margin-top:6px"><span class="tenue">Motivo:</span> ' + esc(s.motivo) + '</div>' +
      '<div class="item-sub" style="margin-top:6px">Lo pidió ' + esc(nombreUsuario(s.pedida_por)) + ' · ' + esc(fmtFechaHora(s.pedida_en)) + '</div>' +
      (s.estado !== 'pendiente' ? '<div class="item-sub">' + esc(textoEstadoSolicitud(s)) + '</div>' : '') +
      '<div class="fila envolver" style="gap:8px;margin-top:10px">' + botones +
        (c ? '<button type="button" class="btn btn-sec btn-chico" data-ver-cliente="' + c.id + '">' + icono('usuario', 'ic-chico') + 'Ver cliente</button>' : '') +
      '</div></div>';
  }
  function pintar() {
    var para = porAprobar(), mios = misPedidos();
    var otros = solicitudesPendientes().filter(function (s) { return para.indexOf(s) < 0 && mios.indexOf(s) < 0; });
    var hace30 = Date.now() - 30 * 86400000;
    var resp = (ST.solicitudes || []).filter(function (s) { return s.estado !== 'pendiente' && new Date(s.resuelta_en || s.pedida_en).getTime() >= hace30; })
      .sort(function (a, b) { return a.resuelta_en < b.resuelta_en ? 1 : -1; });
    var html = '<p class="tenue chico" style="margin:0 2px 12px">Anular un abono, hacer un descuento, anular o cerrar una venta lo pide un dueño y lo aprueba <b>el otro socio</b>. ' +
      'Nadie se aprueba a sí mismo, y todo queda en el historial de cambios.</p>';
    if (para.length) html += '<h3>Para que apruebes</h3>' + para.map(function (s) {
      return tarjeta(s, '<button type="button" class="btn btn-chico" data-aprobar="' + s.id + '">' + icono('check', 'ic-chico') + 'Aprobar</button>' +
        '<button type="button" class="btn btn-sec btn-chico" data-rechazar="' + s.id + '" style="color:var(--rojo)">Rechazar</button>');
    }).join('');
    if (mios.length) html += '<h3 style="margin-top:14px">Lo que pediste</h3>' + mios.map(function (s) {
      return tarjeta(s, '<span class="etiqueta e-info">' + icono('reloj', 'ic-chico') + 'Esperando a ' + esc(nombreOtroSocio(s.pedida_por)) + '</span>' +
        '<button type="button" class="btn btn-sec btn-chico" data-cancelar="' + s.id + '">Cancelar el pedido</button>');
    }).join('');
    if (otros.length) html += '<h3 style="margin-top:14px">Otros pendientes</h3>' + otros.map(function (s) {
      return tarjeta(s, '<span class="etiqueta e-info">Esperando a ' + esc(nombreOtroSocio(s.pedida_por)) + '</span>');
    }).join('');
    if (!para.length && !mios.length && !otros.length) html += '<div class="vacio">' + icono('check') + '<p>No hay nada esperando aprobación.</p></div>';
    if (resp.length) html += '<h3 style="margin-top:14px">Respondidos (últimos 30 días)</h3><div class="lista">' + resp.map(function (s) {
      return '<div class="item" style="cursor:default;align-items:flex-start"><div class="crece"><div class="item-tit">' + esc(TIPOS_SOLICITUD[s.tipo] || s.tipo) + ' · ' + esc(textoEstadoSolicitud(s)) + '</div>' +
        '<div class="item-sub">' + esc(s.detalle || '') + '</div><div class="item-sub">Motivo: ' + esc(s.motivo) + (s.respuesta ? ' · Respuesta: ' + esc(s.respuesta) : '') + '</div></div></div>';
    }).join('') + '</div>';
    html += '<button type="button" class="btn btn-sec btn-ancho" style="margin-top:16px" data-historial>' + icono('reloj') + 'Ver el historial de cambios</button>';
    h.cuerpo.innerHTML = html;
  }
  async function hacer(fn, s) {
    if (ocupado) return;
    ocupado = true;
    try {
      await fn();
      try { await Promise.all([recargarSolicitudes(), recargarCliente(s.cliente_id)]); } catch (e) { /* luego */ }
      repintar();
    } catch (e) { toast(errMsg(e), 'error'); }
    finally { ocupado = false; if (!h.cerrado) pintar(); }
  }
  function buscar(id) { return (ST.solicitudes || []).find(function (x) { return x.id === Number(id); }); }
  h.cuerpo.addEventListener('click', async function (e) {
    var b, s;
    if ((b = e.target.closest('[data-ver-cliente]'))) { h.cerrar(); ir('cliente', b.dataset.verCliente); return; }
    if (e.target.closest('[data-historial]')) { hojaHistorial(); return; }
    if ((b = e.target.closest('[data-aprobar]')) && (s = buscar(b.dataset.aprobar))) {
      var ok = await confirmar({ titulo: 'Aprobar', boton: 'Aprobar', peligro: s.tipo !== 'descuento',
        mensajeHtml: '<p><b>' + esc(s.detalle || '') + '</b></p><p>Motivo de ' + esc(nombreUsuario(s.pedida_por)) + ': ' + esc(s.motivo) + '</p><p>Al aprobar, el cambio se hace ahora y queda a tu nombre en el historial.</p>' });
      if (ok) hacer(async function () { await rpc('responder_aprobacion', { p_id: s.id, p_aprobar: true, p_respuesta: null }); toast('Aprobado: el cambio ya se hizo.', 'ok'); }, s);
      return;
    }
    if ((b = e.target.closest('[data-rechazar]')) && (s = buscar(b.dataset.rechazar))) {
      var por = await confirmar({ titulo: 'Rechazar', boton: 'Rechazar', pedir: 'Por qué no lo apruebas', mensaje: s.detalle || '' });
      if (por) hacer(async function () { await rpc('responder_aprobacion', { p_id: s.id, p_aprobar: false, p_respuesta: por }); toast('Rechazado: no cambió nada.', 'ok'); }, s);
      return;
    }
    if ((b = e.target.closest('[data-cancelar]')) && (s = buscar(b.dataset.cancelar))) {
      var si = await confirmar({ titulo: 'Cancelar el pedido', boton: 'Cancelar el pedido', mensaje: '¿Ya no quieres pedir esto? ' + (s.detalle || '') });
      if (si) hacer(async function () { await rpc('cancelar_aprobacion', { p_id: s.id }); toast('Pedido cancelado', 'ok'); }, s);
    }
  });
  pintar();
  // Lo último de la base (por si el otro socio respondió hace un momento)
  recargarSolicitudes().then(function () { if (!h.cerrado && !ocupado) pintar(); }).catch(function () { /* sin señal */ });
}

function textoEstadoSolicitud(s) {
  if (s.estado === 'aprobada') return 'Aprobado por ' + nombreUsuario(s.resuelta_por) + ' el ' + fmtFechaHora(s.resuelta_en);
  if (s.estado === 'rechazada') return 'Rechazado por ' + nombreUsuario(s.resuelta_por) + ' el ' + fmtFechaHora(s.resuelta_en);
  if (s.estado === 'cancelada') return 'Cancelado por quien lo pidió';
  return 'Esperando aprobación';
}

/* ---------------- Historial de cambios (solo dueños) ---------------- */
var CAMPOS_CLIENTE = {
  nombre: 'nombre', cedula: 'cédula', telefono: 'teléfono', direccion: 'dirección', referencia: 'punto de referencia', trabajo: 'trabajo',
  sector: 'sector', sede: 'sede', fiador_nombre: 'fiador', fiador_cedula: 'cédula del fiador', fiador_telefono: 'teléfono del fiador',
  fiador_direccion: 'dirección del fiador', no_venderle: 'no venderle', no_venderle_motivo: 'por qué no venderle', notas: 'notas',
  en_exterior: 'en el exterior', pais: 'país', contacto_nombre: 'quien recibe', contacto_telefono: 'teléfono de quien recibe',
  lat: 'ubicación', lng: 'ubicación', foto: 'foto', foto_cedula: 'foto de la cédula', deleted_at: 'quitado'
};
function textoValor(v) {
  if (v == null || v === '') return '(vacío)';
  if (v === true) return 'sí';
  if (v === false) return 'no';
  if (typeof v === 'object') return '(cambió)';
  return String(v).length > 60 ? String(v).slice(0, 57) + '…' : String(v);
}
// Qué campos cambiaron entre antes y después
function diferencias(antes, despues, nombres) {
  if (!antes || !despues) return [];
  var out = [];
  Object.keys(despues).forEach(function (k) {
    if (/(_en|_por|^id|clave)$/.test(k) && !nombres[k]) return;
    if (JSON.stringify(antes[k]) === JSON.stringify(despues[k])) return;
    out.push((nombres[k] || k) + ': ' + textoValor(antes[k]) + ' → ' + textoValor(despues[k]));
  });
  return out;
}
function nombreVentaAud(id) { var v = ST.ventaPorId.get(Number(id)); return v ? 'venta #' + v.numero + (ST.cliPorId.get(v.cliente_id) ? ' de ' + ST.cliPorId.get(v.cliente_id).nombre : '') : 'venta (id ' + id + ')'; }
function nombreClienteAud(id) { var c = ST.cliPorId.get(Number(id)); return c ? c.nombre : 'cliente N° ' + id; }

// {titulo, detalle[]} de una fila de auditoria
function textoAuditoria(a) {
  var an = a.antes || {}, de = a.despues || {}, t = '', det = [];
  var motivo = de.motivo ? 'Motivo: ' + de.motivo : '';
  if (/^directo_/.test(a.accion)) {
    var op = { insert: 'agregó', update: 'cambió', delete: 'borró' }[a.accion.split('_')[1]] || 'cambió';
    t = 'Cambio hecho por fuera de la app: ' + op + ' en la tabla "' + a.tabla + '"' + (a.registro_id ? ' (N° ' + a.registro_id + ')' : '');
    if (/servicio$/.test(a.accion)) t += ' con la llave de servicio';
    det = diferencias(a.antes, a.despues, a.tabla === 'clientes' ? CAMPOS_CLIENTE : {}).slice(0, 8);
    return { titulo: t, detalle: det, alerta: true };
  }
  if (a.tabla === 'abonos' && a.accion === 'anular') {
    t = 'Anuló un abono de ' + fmtUSD(an.monto_usd) + ' de ' + nombreClienteAud(an.cliente_id) + ' (' + fmtFechaAnio(an.fecha) + ')';
    return { titulo: t, detalle: [motivo].filter(Boolean) };
  }
  if (a.tabla === 'ventas') {
    var vn = nombreVentaAud(a.registro_id);
    var m = { recargo: 'Recargo de ' + fmtUSD(an.monto) + ' en la ' + vn, descuento: 'Descuento de ' + fmtUSD(an.monto) + ' en la ' + vn,
      reprogramar: 'Más tiempo (calendario nuevo) en la ' + vn, retirar_mercancia: 'Retiró la mercancía de la ' + vn,
      devolver_mercancia: 'Devolvió la mercancía de la ' + vn, cerrar: 'Cerró la ' + vn + ' (dejó de cobrar ' + fmtUSD(an.saldo) + ')',
      reabrir: 'Reabrió la ' + vn, anular: 'Anuló la ' + vn, reingresar_mercancia: 'La mercancía de la ' + vn + ' volvió a la tienda',
      firmar: 'Se firmó el contrato de la ' + vn, reemplazar_firma: 'Volvió a firmar el contrato de la ' + vn,
      cambiar_vendedor: 'La ' + vn + ' pasó de ' + nombreUsuario(an.vendedor_id) + ' a ' + nombreUsuario(de.vendedor_id) };
    t = m[a.accion] || ('Cambio en la ' + vn + ': ' + a.accion);
    if (a.accion === 'recargo' || a.accion === 'descuento') det.push('Quedó debiendo ' + fmtUSD(de.saldo));
    if (motivo) det.push(motivo);
    return { titulo: t, detalle: det };
  }
  if (a.tabla === 'clientes') {
    if (a.accion === 'borrar') return { titulo: 'Quitó al cliente ' + (an.nombre || nombreClienteAud(a.registro_id)), detalle: [motivo].filter(Boolean) };
    if (!a.antes) return { titulo: 'Agregó al cliente ' + (de.nombre || nombreClienteAud(a.registro_id)), detalle: [] };
    return { titulo: 'Cambió los datos de ' + (de.nombre || an.nombre || nombreClienteAud(a.registro_id)), detalle: diferencias(a.antes, a.despues, CAMPOS_CLIENTE).slice(0, 8) };
  }
  if (a.tabla === 'solicitudes') {
    var verbo = { pedir: 'Pidió', aprobar: 'Aprobó', rechazar: 'Rechazó', cancelar: 'Canceló su pedido' }[a.accion] || a.accion;
    t = verbo + ': ' + (TIPOS_SOLICITUD[de.tipo] || de.tipo || '').toLowerCase();
    det = [de.detalle, de.motivo ? 'Motivo: ' + de.motivo : '', a.accion === 'rechazar' && de.respuesta ? 'Por qué no: ' + de.respuesta : ''].filter(Boolean);
    return { titulo: t, detalle: det };
  }
  if (a.tabla === 'fotos') return { titulo: 'Cambió una foto (' + a.accion.replace(/^cambiar_/, '') + ')', detalle: [] };
  if (a.tabla === 'usuarios') {
    var nom = de.nombre || an.nombre || nombreUsuario(a.registro_id);
    if (a.accion === 'crear') return { titulo: 'Creó el usuario ' + (de.usuario || '') + ' (' + (de.rol === 'dueno' ? 'dueño' : 'empleado') + ')', detalle: [] };
    if (a.accion === 'clave') return { titulo: 'Le puso una clave nueva a ' + nombreUsuario(a.registro_id), detalle: [] };
    return { titulo: 'Cambió el usuario ' + nom, detalle: diferencias(a.antes, a.despues, { nombre: 'nombre', rol: 'rol', sede: 'sede', activo: 'activo' }).slice(0, 6) };
  }
  if (a.tabla === 'config') {
    if (a.accion === 'descargar_copia') return { titulo: 'Descargó la copia de seguridad', detalle: [] };
    return { titulo: 'Cambió los ajustes', detalle: diferencias(a.antes, a.despues, { contrato_condiciones: 'condiciones del contrato', inicial_pct: '% de inicial',
      giros_para_retiro: 'cuotas para retirar', telefono_negocio: 'teléfono del negocio', tasa_bs: 'tasa' }).slice(0, 6) };
  }
  return { titulo: a.tabla + ': ' + a.accion, detalle: [] };
}

var FILTROS_HISTORIAL = [['todo', 'Todo'], ['dinero', 'Dinero'], ['clientes', 'Clientes'], ['usuarios', 'Usuarios y ajustes'], ['directo', 'Por fuera de la app']];
function filtroHistorial(q, f) {
  if (f === 'dinero') return q.in('tabla', ['abonos', 'ventas', 'solicitudes', 'entregas', 'cuotas']);
  if (f === 'clientes') return q.in('tabla', ['clientes', 'fotos']);
  if (f === 'usuarios') return q.in('tabla', ['usuarios', 'config', 'metodos_pago', 'tasas']);
  if (f === 'directo') return q.like('accion', 'directo%');
  return q;
}

function hojaHistorial() {
  var h = abrirHoja({ titulo: 'Historial de cambios', completa: true, html: '' });
  var filtro = 'todo', filas = [], fin = false, cargando = false, error = null, POR_VEZ = 100;
  function pintar() {
    h.cuerpo.innerHTML = '<p class="tenue chico" style="margin:0 2px 10px">Todo lo que cambia en el sistema queda aquí con quién y cuándo. Esta lista no se puede borrar ni cambiar, ' +
      'y también anota lo que alguien cambie directo en la base, por fuera de la app.</p>' +
      '<div class="chips" id="hiFiltros">' + FILTROS_HISTORIAL.map(function (x) {
        return '<button type="button" class="chip' + (x[0] === filtro ? ' activo' : '') + '" data-f="' + x[0] + '">' + x[1] + '</button>';
      }).join('') + '</div>' +
      (error ? '<div class="aviso aviso-error" style="margin-top:12px">' + icono('alerta') + '<div>' + esc(error) + '</div></div>' : '') +
      (filas.length ? '<div class="lista" style="margin-top:12px">' + filas.map(function (a) {
        var x = textoAuditoria(a);
        var quien = a.usuario_id ? nombreUsuario(a.usuario_id) : (/^directo_/.test(a.accion) ? 'Por fuera de la app' : 'Sistema');
        return '<div class="item" style="cursor:default;align-items:flex-start">' + icono(x.alerta ? 'alerta' : 'reloj', 'ic-chico') +
          '<div class="crece"><div class="item-tit" style="white-space:normal' + (x.alerta ? ';color:var(--rojo)' : '') + '">' + esc(x.titulo) + '</div>' +
          x.detalle.map(function (d) { return '<div class="item-sub" style="white-space:normal">' + esc(d) + '</div>'; }).join('') +
          '<div class="item-sub">' + esc(quien) + ' · ' + esc(fmtFechaHora(a.creado_en)) + '</div></div></div>';
      }).join('') + '</div>' : (cargando ? '' : '<div class="vacio">' + icono('check') + '<p>No hay cambios en este grupo.</p></div>')) +
      (cargando ? '<div class="cargando">Cargando…</div>' : '') +
      (!fin && filas.length && !cargando ? '<button type="button" class="btn btn-sec btn-ancho" style="margin-top:12px" data-mas-historial>Mostrar más</button>' : '');
  }
  async function cargar(desdeCero) {
    if (cargando) return;
    if (desdeCero) { filas = []; fin = false; }
    cargando = true; error = null; pintar();
    try {
      var q = filtroHistorial(sb.from('auditoria').select('*'), filtro).order('id', { ascending: false }).range(filas.length, filas.length + POR_VEZ - 1);
      var r = await q;
      if (r.error) throw r.error;
      filas = filas.concat(r.data || []);
      fin = (r.data || []).length < POR_VEZ;
    } catch (e) { error = errMsg(e); }
    cargando = false;
    if (!h.cerrado) pintar();
  }
  h.cuerpo.addEventListener('click', function (e) {
    var b = e.target.closest('[data-f]');
    if (b) { filtro = b.dataset.f; cargar(true); return; }
    if (e.target.closest('[data-mas-historial]')) cargar(false);
  });
  cargar(true);
}
