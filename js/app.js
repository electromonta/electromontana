// Electro Montana — arranque: entrada, menú, navegación, cola de envío y actualización de datos.
'use strict';

var VistaActual = null, _vistaNombre = '', _vistaArg = '';
var VISTAS = {
  cobrar: { v: VistaCobrar, nombre: 'Cobrar' },
  clientes: { v: VistaClientes, nombre: 'Clientes' },
  cliente: { v: VistaFicha, nombre: 'Cliente', padre: 'clientes' },
  vender: { v: VistaVender, nombre: 'Vender' },
  cobros: { v: VistaCobros, nombre: 'Cobros' },
  efectivo: { v: VistaEntregas, nombre: 'Efectivo' },
  ajustes: { v: VistaAjustes, nombre: 'Ajustes' }
};
var TABS = [
  { k: 'cobrar', icono: 'cobrar', nombre: 'Cobrar' },
  { k: 'clientes', icono: 'clientes', nombre: 'Clientes' },
  { k: 'vender', icono: 'vender', nombre: 'Vender' },
  { k: 'cobros', icono: 'cobros', nombre: 'Cobros' }
];

function pintarNav() {
  var actual = (VISTAS[_vistaNombre] && VISTAS[_vistaNombre].padre) || _vistaNombre;
  var enMas = TABS.every(function (t) { return t.k !== actual; });
  $('#navTabs').innerHTML = '<div class="tabs">' + TABS.map(function (t) {
    if (t.k === 'vender') {
      return '<button type="button" class="tab-vender" data-ir="vender"><span class="burbuja">' + icono('vender') + '</span><span>Vender</span></button>';
    }
    return '<button type="button" data-ir="' + t.k + '"' + (t.k === actual ? ' class="activo"' : '') + '>' + icono(t.icono) + '<span>' + t.nombre + '</span></button>';
  }).join('') + '<button type="button" data-mas' + (enMas ? ' class="activo"' : '') + '>' + icono('menu') + '<span>Más</span></button></div>';
}

function pintarTasa() {
  var chip = $('#chipTasa');
  if (!chip || !ST.cfg) return;
  var t = Number(ST.cfg.tasa_bs);
  var vieja = !tasaDeHoy();
  chip.innerHTML = t ? 'Tasa ' + fmtTasa(t) : (esDueno() ? 'Poner tasa' : 'Sin tasa');
  chip.classList.toggle('alerta', vieja);
  chip.title = vieja ? 'La tasa no se ha puesto hoy' : 'Tasa del día';
}

function pintarCola() {
  var chip = $('#chipCola');
  if (!chip) return;
  var mias = ST.yo ? Cola.mias() : [];
  var err = mias.filter(function (o) { return o.estado === 'error'; }).length;
  var pend = mias.length - err;
  if (!mias.length) {
    chip.hidden = _enLinea;
    chip.className = 'chip-sup';
    chip.innerHTML = icono('sinsenal') + 'Sin señal';
    return;
  }
  chip.hidden = false;
  chip.className = 'chip-sup ' + (err ? 'error' : 'alerta');
  chip.innerHTML = icono(err ? 'alerta' : 'nube') + (err ? err + ' con error' : pend + ' por enviar');
}

function parsearHash() {
  var h = decodeURIComponent(location.hash.slice(1) || '');
  var i = h.indexOf('/');
  return i < 0 ? { n: h, arg: '' } : { n: h.slice(0, i), arg: h.slice(i + 1) };
}

function ir(nombre, arg) {
  if (!VISTAS[nombre]) { nombre = 'cobrar'; arg = ''; }
  var hash = '#' + nombre + (arg ? '/' + arg : '');
  if (location.hash !== hash) history.replaceState(null, '', hash);
  _vistaNombre = nombre; _vistaArg = arg || '';
  VistaActual = VISTAS[nombre].v;
  $('#tituloVista').textContent = VISTAS[nombre].nombre;
  document.title = VISTAS[nombre].nombre + ' · Electro Montana';
  pintarNav();
  var cont = $('#vista');
  cont.innerHTML = '';
  window.scrollTo(0, 0);
  Promise.resolve(VistaActual.mostrar(cont, _vistaArg)).catch(function (e) {
    console.error(e);
    cont.innerHTML = '<div class="aviso aviso-error">' + icono('alerta') + '<div>No se pudo abrir: ' + esc(errMsg(e)) + '</div></div>';
  });
}
// Vuelve a dibujar la pantalla actual con los datos nuevos (sin perder lo que se está escribiendo)
function repintar() {
  if (_hojas.length) { window._repintarAlCerrar = true; return; }
  pintarTasa(); pintarCola();
  if (VistaActual && VistaActual.refrescar) {
    var y = window.scrollY;
    Promise.resolve(VistaActual.refrescar()).then(function () { window.scrollTo(0, y); });
  }
}

function menuMas() {
  var h = abrirHoja({
    titulo: 'Más',
    html: '<div class="lista">' +
      '<button type="button" class="item" data-ir="efectivo">' + icono('tienda') + '<div class="crece"><div class="item-tit">' +
        (esDueno() ? 'Efectivo de Pedraza' : 'Mi efectivo por entregar') + '</div><div class="item-sub">' +
        (esDueno() ? 'Lo que ha cobrado el empleado y las entregas' : 'Lo que has cobrado en efectivo') + '</div></div>' + icono('flecha', 'ic-chico') + '</button>' +
      '<button type="button" class="item" data-contrato-blanco>' + icono('contrato') + '<div class="crece"><div class="item-tit">Contrato en blanco</div><div class="item-sub">Para imprimir y llenar a mano</div></div>' + icono('flecha', 'ic-chico') + '</button>' +
      '<button type="button" class="item" data-ir="ajustes">' + icono('ajustes') + '<div class="crece"><div class="item-tit">Ajustes</div><div class="item-sub">' +
        (esDueno() ? 'Tasa, usuarios, métodos de pago, contrato' : 'Tu clave y lo que falta por enviar') + '</div></div>' + icono('flecha', 'ic-chico') + '</button>' +
      '<button type="button" class="item" data-actualizar>' + icono('refrescar') + '<div class="crece"><div class="item-tit">Actualizar datos</div><div class="item-sub">' +
        (ST.cargadoEn ? 'Última vez ' + esc(haceCuanto(ST.cargadoEn)) : '') + '</div></div></button>' +
      '<button type="button" class="item" data-salir>' + icono('salir') + '<div class="crece"><div class="item-tit">Salir</div></div></button>' +
      '</div><p class="tenue centro" style="margin-top:16px">' + esc(ST.yo.nombre) + ' · ' + (esDueno() ? 'Dueño' : 'Empleado de ' + nombreSede(ST.yo.sede)) + '</p>'
  });
  h.cuerpo.addEventListener('click', function (e) {
    var b = e.target.closest('[data-ir]');
    if (b) { h.cerrar(); ir(b.dataset.ir); return; }
    if (e.target.closest('[data-contrato-blanco]')) { h.cerrar(); imprimirContrato(null); return; }
    if (e.target.closest('[data-actualizar]')) { h.cerrar(); actualizarTodo(true); return; }
    if (e.target.closest('[data-salir]')) { h.cerrar(); salir(); }
  });
}

async function actualizarTodo(avisar) {
  try {
    await cargarTodo();
    actualizarConexion(true);
    repintar();
    if (avisar) toast('Datos al día', 'ok');
  } catch (e) {
    if (esErrorDeRed(e)) actualizarConexion(false);
    if (avisar) toast(errMsg(e), 'error');
  }
}

/* ---------------- Cola: ver lo que falta por enviar ---------------- */
function hojaCola() {
  var h = abrirHoja({ titulo: 'Por enviar', html: '', pie: '<button type="button" class="btn btn-azul btn-ancho" id="colaEnviar">' + icono('refrescar') + 'Enviar ahora</button>' });
  function pintar() {
    var mias = Cola.mias();
    if (!mias.length) { h.cuerpo.innerHTML = '<div class="vacio">' + icono('check') + '<p>Todo está enviado.</p></div>'; return; }
    h.cuerpo.innerHTML = '<p class="tenue chico">Lo que registras sin señal se guarda en este teléfono y se envía solo cuando vuelve el internet. No borres los datos de la app mientras haya algo aquí.</p>' +
      mias.map(function (o) {
        var r = o.resumen || {};
        return '<div class="cola-item"><div class="fila-sep"><div class="fuerte">' + esc(r.texto || o.tipo) + '</div>' +
          (o.estado === 'error' ? '<span class="etiqueta e-rojo">Rechazado</span>' : '<span class="etiqueta e-ambar">Esperando señal</span>') + '</div>' +
          '<div class="tenue chico">' + esc(fmtFechaHora(o.creado)) + (o.intentos ? ' · ' + plural(o.intentos, 'intento', 'intentos') : '') + '</div>' +
          (o.estado === 'error' ? '<div class="aviso aviso-error" style="margin-top:8px">' + esc(o.error || '') + '</div>' +
            '<div class="botonera" style="margin-top:8px">' +
            (o.codigo === 'EM001' ? '<button type="button" class="btn btn-sec btn-chico" data-forzar="' + o.clave + '">Guardar igual</button>'
                                  : '<button type="button" class="btn btn-sec btn-chico" data-reintentar="' + o.clave + '">Reintentar</button>') +
            '<button type="button" class="btn btn-sec btn-chico" data-descartar="' + o.clave + '">Descartar</button></div>' : '') +
          '</div>';
      }).join('');
  }
  pintar();
  h.cuerpo.addEventListener('click', async function (e) {
    // Reintentar con la misma clave es seguro: si ya se había guardado, la base no lo repite
    var f = e.target.closest('[data-forzar], [data-reintentar]');
    if (f) {
      var clave = f.dataset.forzar || f.dataset.reintentar;
      var op = Cola.ops.find(function (o) { return o.clave === clave; });
      if (op) {
        if (f.dataset.forzar) { if (op.datos.pago_inicial) op.datos.pago_inicial.forzar_referencia = true; else op.datos.forzar_referencia = true; }
        op.estado = 'pendiente'; op.error = null; op.codigo = null;
        await Cola.guardar(op); Cola.procesar(); setTimeout(pintar, 1500);
      }
      return;
    }
    var d = e.target.closest('[data-descartar]');
    if (d && await confirmar({ titulo: 'Descartar', mensaje: 'Esta operación no se va a registrar. ¿Seguro?', boton: 'Descartar', peligro: true })) {
      await Cola.quitar(d.dataset.descartar); pintar(); repintar();
    }
  });
  protegerBoton(h.$('#colaEnviar'), async function () {
    Cola.ops.forEach(function (o) { if (o.uid === ST.yo.id && o.estado === 'pendiente') o.intentos = 0; });
    await Cola.procesar();
    pintar();
    if (Cola.mias().some(function (o) { return o.estado === 'pendiente'; })) toast('Todavía no hay señal suficiente. Se seguirá intentando solo.', 'error');
  }, 'Enviando…');
}

/* ---------------- Tasa del día ---------------- */
async function hojaTasa() {
  if (!esDueno()) {
    toast(tasaDeHoy() ? 'Tasa del día: ' + fmtTasa(ST.cfg.tasa_bs) : 'Franklin o Daniel todavía no han puesto la tasa de hoy.', tasaDeHoy() ? 'ok' : 'error', 4000);
    return;
  }
  var h = abrirHoja({
    titulo: 'Tasa del día',
    html: '<p class="tenue">La tasa con la que se reciben los pagos en bolívares. Se usa en todos los teléfonos.</p>' +
      '<label class="campo"><span>Bolívares por dólar</span><input id="tasaNueva" inputmode="decimal" value="' + esc(Number(ST.cfg.tasa_bs) ? numCampo(ST.cfg.tasa_bs) : '') + '"></label>' +
      (ST.cfg.tasa_actualizada_en ? '<p class="tenue chico" style="margin-top:8px">Última vez: ' + esc(fmtFechaHora(ST.cfg.tasa_actualizada_en)) + ' por ' + esc(nombreUsuario(ST.cfg.tasa_actualizada_por)) + '</p>' : ''),
    pie: '<button type="button" class="btn btn-ancho" id="tasaGuardar">Guardar tasa</button>'
  });
  setTimeout(function () { h.$('#tasaNueva').focus(); }, 80);
  protegerBoton(h.$('#tasaGuardar'), async function () {
    var t = parseNum(h.$('#tasaNueva').value);
    if (!(t > 0)) { toast('Escribe la tasa', 'error'); return; }
    await rpc('actualizar_tasa', { p_tasa: t });
    await recargarConfig();
    h.cerrar(); pintarTasa(); repintar();
    toast('Tasa guardada: ' + fmtTasa(t), 'ok');
  });
}

/* ---------------- Entrada y salida ---------------- */
function mostrarLogin(msg) {
  $('#app').hidden = true;
  $('#pantallaLogin').hidden = false;
  var e = $('#loginError');
  e.hidden = !msg; e.textContent = msg || '';
}

$('#formLogin').addEventListener('submit', async function (ev) {
  ev.preventDefault();
  var btn = $('#btnEntrar');
  if (btn.disabled) return;
  var u = $('#loginUsuario').value.trim().toLowerCase(), clave = $('#loginClave').value;
  if (!u || !clave) return;
  var email = u.indexOf('@') >= 0 ? u : u + '@' + EM_CONFIG.dominio;
  btn.disabled = true; btn.textContent = 'Entrando…';
  $('#loginError').hidden = true;
  try {
    var r = await sb.auth.signInWithPassword({ email: email, password: clave });
    if (r.error) throw r.error;
    $('#loginClave').value = '';
    await entrar();
  } catch (e) {
    mostrarLogin(errMsg(e));
  } finally {
    btn.disabled = false; btn.textContent = 'Entrar';
  }
});

async function entrar() {
  var s = await sb.auth.getSession();
  var uid = s.data && s.data.session && s.data.session.user && s.data.session.user.id;
  if (!uid) { mostrarLogin(); return; }

  // 1) Abrir enseguida con la copia del teléfono (sirve sin señal)
  var copia = await leerCache(uid);
  if (copia && copia.yo && copia.datos) {
    ST.yo = copia.yo;
    aplicarDatos(copia.datos);
    ST.desdeCache = true;
    mostrarApp();
  } else {
    $('#pantallaLogin').hidden = true;
    $('#app').hidden = false;
    $('#vista').innerHTML = '<div class="cargando">Cargando…</div>';
  }

  // 2) Traer lo último de la base
  try {
    var r = await sb.from('usuarios').select('*').eq('id', uid).maybeSingle();
    if (r.error) throw r.error;
    if (!r.data || !r.data.activo) {
      await sb.auth.signOut();
      ST.yo = null;
      mostrarLogin(r.data ? 'Tu usuario está desactivado. Habla con Franklin o Daniel.' : 'Este usuario no tiene acceso.');
      return;
    }
    ST.yo = r.data;
    await cargarTodo();
    actualizarConexion(true);
    if (!copia) mostrarApp(); else repintar();
    Cola.procesar();
    if (ST.yo.debe_cambiar_clave) hojaCambiarClave(true);
  } catch (e) {
    console.warn('Sin conexión al entrar', e);
    if (/jwt|refresh token|session/i.test(String(e.message || '')) && !esErrorDeRed(e)) {
      await sb.auth.signOut(); mostrarLogin('Tu sesión venció. Vuelve a entrar.'); return;
    }
    actualizarConexion(false);
    if (!copia) {
      $('#vista').innerHTML = '<div class="aviso aviso-error">' + icono('sinsenal') + '<div>No hay conexión y este teléfono todavía no tiene los datos guardados. Busca señal y toca Reintentar.' +
        '<br><button type="button" class="btn btn-sec btn-chico" onclick="location.reload()" style="margin-top:10px">Reintentar</button></div></div>';
    } else {
      toast('Sin señal: estás viendo los datos guardados en el teléfono.', '', 4000);
    }
  }
}

function mostrarApp() {
  $('#pantallaLogin').hidden = true;
  $('#app').hidden = false;
  pintarTasa(); pintarCola();
  var p = parsearHash();
  ir(VISTAS[p.n] ? p.n : 'cobrar', p.arg);
}

async function salir() {
  var pend = Cola.mias();
  if (pend.length && !(await confirmar({
    titulo: 'Salir', peligro: true, boton: 'Salir y perderlas',
    mensaje: 'Hay ' + plural(pend.length, 'operación', 'operaciones') + ' sin enviar en este teléfono. Si sales, se pierden. Mejor busca señal primero.'
  }))) return;
  var uid = ST.yo && ST.yo.id;
  for (var i = 0; i < pend.length; i++) await Cola.quitar(pend[i].clave);
  try { if (uid) await BD.del('cache', 'datos:' + uid); } catch (e) { /* nada */ }
  await sb.auth.signOut();
  ST.yo = null;
  location.hash = '';
  location.reload();
}

function hojaCambiarClave(obligatoria) {
  var h = abrirHoja({
    titulo: obligatoria ? 'Pon tu clave' : 'Cambiar mi clave', fija: !!obligatoria,
    html: (obligatoria ? '<p>Es tu primera vez. Escoge una clave que solo sepas tú (mínimo 6 letras o números).</p>' : '') +
      '<div class="pila"><label class="campo"><span>Clave nueva</span><input id="clave1" type="password" autocomplete="new-password"></label>' +
      '<label class="campo"><span>Repite la clave</span><input id="clave2" type="password" autocomplete="new-password"></label></div>',
    pie: '<button type="button" class="btn btn-ancho" id="claveGuardar">Guardar clave</button>'
  });
  protegerBoton(h.$('#claveGuardar'), async function () {
    var a = h.$('#clave1').value, b = h.$('#clave2').value;
    if (a.length < 6) { toast('La clave debe tener al menos 6 caracteres', 'error'); return; }
    if (a !== b) { toast('Las dos claves no son iguales', 'error'); return; }
    var r = await sb.auth.updateUser({ password: a });
    if (r.error) throw r.error;
    await rpc('marcar_clave_cambiada');
    ST.yo.debe_cambiar_clave = false;
    guardarCache();
    h.fija = false; h.cerrar();
    toast('Clave guardada', 'ok');
  });
}

/* ---------------- Eventos globales ---------------- */
document.addEventListener('click', function (e) {
  var b = e.target.closest('#navTabs [data-ir]');
  if (b) { ir(b.dataset.ir); return; }
  if (e.target.closest('#navTabs [data-mas]')) { menuMas(); return; }
  if (e.target.closest('#chipTasa')) { hojaTasa(); return; }
  if (e.target.closest('#chipCola')) { hojaCola(); return; }
  var c = e.target.closest('[data-ir-cliente]');
  if (c) { ir('cliente', c.dataset.irCliente); }
});
window.addEventListener('hashchange', function () {
  if (!ST.yo) return;
  var p = parsearHash();
  if (VISTAS[p.n] && (p.n !== _vistaNombre || p.arg !== _vistaArg)) ir(p.n, p.arg);
});
// Al volver a la app: mandar lo pendiente y, si pasó un rato, traer lo nuevo
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState !== 'visible' || !ST.yo) return;
  Cola.procesar();
  if (!ST.cargadoEn || Date.now() - new Date(ST.cargadoEn) > 120000) actualizarTodo(false);
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('Sin modo sin conexión', e); });
}

(async function iniciar() {
  $('#loginLogo').innerHTML = logoSVG('#ffffff', '#e0904f');
  $('#barraLogo').innerHTML = logoSVG('#ffffff', '#e0904f', 'logo');
  await Cola.cargar();
  try {
    var s = await sb.auth.getSession();
    if (s.data && s.data.session) await entrar(); else mostrarLogin();
  } catch (e) {
    mostrarLogin(errMsg(e));
  }
  sb.auth.onAuthStateChange(function (evento) {
    if (evento === 'SIGNED_OUT' && ST.yo) { ST.yo = null; mostrarLogin('Tu sesión se cerró. Vuelve a entrar.'); }
  });
})();
