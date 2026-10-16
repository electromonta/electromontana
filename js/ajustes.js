// Electro Montana — ajustes: tasa, reglas, contrato, usuarios, métodos de pago y este teléfono.
'use strict';

var VERSION_APP = '5';

var VistaAjustes = (function () {
  var raiz = null;

  function mostrar(c) {
    raiz = document.createElement('div');
    c.appendChild(raiz);
    raiz.addEventListener('click', alTocar);
    pintar();
  }

  function pintar() {
    if (!raiz || !raiz.isConnected) return;
    var dueno = esDueno(), cfg = ST.cfg, h = '';
    if (dueno) {
      h += '<div class="tarjeta"><div class="fila-sep"><div><h3>Tasa del día</h3><div class="tenue chico">' +
        (Number(cfg.tasa_bs) ? fmtTasa(cfg.tasa_bs) + ' Bs por $' + (tasaDeHoy() ? ' · puesta hoy' : ' · no es de hoy') : 'Sin tasa') + '</div></div>' +
        '<button type="button" class="btn btn-sec btn-chico" data-tasa>Cambiar</button></div></div>';
      h += '<div class="tarjeta"><h3>Reglas</h3><div class="pila" style="margin-top:10px">' +
        '<div class="dos"><label class="campo"><span>Inicial sugerida (%)</span><input id="ajPct" inputmode="decimal" value="' + esc(numCampo(cfg.inicial_pct).replace(',00', '')) + '"></label>' +
        '<label class="campo"><span>Cuotas sin pagar para retirar</span><input id="ajGiros" inputmode="numeric" value="' + esc(cfg.giros_para_retiro) + '"></label></div>' +
        '<label class="campo"><span>Teléfono del negocio <span class="ayuda">(sale en el contrato)</span></span><input id="ajTel" type="tel" value="' + esc(cfg.telefono_negocio || '') + '"></label>' +
        '<button type="button" class="btn btn-sec" id="ajGuardarReglas">Guardar reglas</button></div></div>';
      h += '<div class="tarjeta"><h3>Condiciones del contrato</h3><p class="tenue chico" style="margin-top:4px">Una condición por línea. Donde dice {giros} se pone solo el número de cuotas sin pagar para retirar la mercancía.</p>' +
        '<textarea id="ajCond" rows="12" style="margin-top:8px">' + esc(cfg.contrato_condiciones || CONDICIONES_BASE) + '</textarea>' +
        '<div class="botonera" style="margin-top:10px"><button type="button" class="btn btn-sec" data-blanco>Ver contrato</button>' +
        '<button type="button" class="btn btn-sec" id="ajGuardarCond">Guardar</button></div>' +
        (cfg.contrato_condiciones ? '<button type="button" class="btn btn-plano btn-chico" data-fabrica style="margin-top:6px">Volver a las condiciones de fábrica</button>' : '') + '</div>';
      h += '<div class="seccion"><div class="seccion-tit"><h2>Usuarios</h2><button type="button" class="btn btn-sec btn-chico" data-nuevo-usuario>' + icono('mas', 'ic-chico') + 'Nuevo</button></div>' +
        '<div class="lista">' + ST.usuarios.map(function (u) {
          return '<button type="button" class="item" data-usuario="' + u.id + '"' + (u.activo ? '' : ' style="opacity:.6"') + '><div class="avatar">' + esc(iniciales(u.nombre)) + '</div>' +
            '<div class="crece"><div class="item-tit">' + esc(u.nombre) + (u.id === ST.yo.id ? ' <span class="tenue chico">(tú)</span>' : '') + '</div>' +
            '<div class="item-sub">' + esc(u.usuario) + ' · ' + (u.rol === 'dueno' ? 'Dueño' : 'Empleado de ' + nombreSede(u.sede)) + (u.activo ? '' : ' · desactivado') + '</div></div>' + icono('flecha', 'ic-chico') + '</button>';
        }).join('') + '</div></div>';
      h += '<div class="seccion"><div class="seccion-tit"><h2>Métodos de pago</h2><button type="button" class="btn btn-sec btn-chico" data-nuevo-metodo>' + icono('mas', 'ic-chico') + 'Nuevo</button></div>' +
        '<div class="tarjeta">' + ST.metodos.map(function (m) {
          return '<label class="casilla dato" style="justify-content:space-between"><span class="crece">' + esc(m.nombre) + ' <span class="tenue chico">' + (m.moneda === 'VES' ? 'Bs' : '$') +
            (m.en_mano ? ' · efectivo' : '') + (m.pide_referencia ? ' · pide referencia' : '') + '</span></span><input type="checkbox" data-metodo="' + m.id + '"' + (m.activo ? ' checked' : '') + '></label>';
        }).join('') + '<p class="tenue chico" style="margin-top:8px">Desmarca un método para que no salga al cobrar.</p></div></div>';
    }
    var mias = Cola.mias();
    h += '<div class="seccion"><div class="seccion-tit"><h2>Mi cuenta</h2></div><div class="tarjeta">' +
      '<div class="dato"><span>Usuario</span><span class="crece">' + esc(ST.yo.usuario) + '</span></div>' +
      '<div class="dato"><span>Nombre</span><span class="crece">' + esc(ST.yo.nombre) + '</span></div>' +
      '<button type="button" class="btn btn-sec btn-ancho" data-clave style="margin-top:10px">' + icono('candado') + 'Cambiar mi clave</button></div></div>';
    h += '<div class="seccion"><div class="seccion-tit"><h2>Este teléfono</h2></div><div class="tarjeta">' +
      '<div class="dato"><span>Por enviar</span><span class="crece">' + (mias.length ? plural(mias.length, 'operación', 'operaciones') + ' <button type="button" class="btn btn-plano btn-chico" data-cola style="min-height:28px;padding:0 4px">Ver</button>' : 'Nada, todo enviado') + '</span></div>' +
      '<div class="dato"><span>Datos guardados</span><span class="crece">' + (ST.cargadoEn ? esc(haceCuanto(ST.cargadoEn)) : '—') + '</span></div>' +
      '<div class="dato"><span>Versión</span><span class="crece">' + VERSION_APP + '</span></div>' +
      '<p class="tenue chico" style="margin-top:8px">Para instalarla en el iPhone: en Safari toca Compartir y luego "Agregar a inicio". En Android: menú del navegador, "Instalar app".</p></div></div>';
    raiz.innerHTML = h;
    var b;
    if ((b = $('#ajGuardarReglas', raiz))) protegerBoton(b, guardarReglas);
    if ((b = $('#ajGuardarCond', raiz))) protegerBoton(b, async function () {
      var txt = $('#ajCond', raiz).value.trim();
      await rpc('actualizar_config', { p: { contrato_condiciones: txt === CONDICIONES_BASE ? '' : txt } });
      await recargarConfig(); toast('Condiciones guardadas', 'ok'); pintar();
    });
  }

  async function guardarReglas() {
    var pct = parseNum($('#ajPct', raiz).value), giros = parseInt($('#ajGiros', raiz).value, 10);
    if (isNaN(pct) || pct < 0 || pct > 100) { toast('El porcentaje debe estar entre 0 y 100', 'error'); return; }
    if (!(giros >= 1 && giros <= 52)) { toast('Las cuotas para retirar deben estar entre 1 y 52', 'error'); return; }
    await rpc('actualizar_config', { p: { inicial_pct: pct, giros_para_retiro: giros, telefono_negocio: $('#ajTel', raiz).value.trim() } });
    await recargarConfig();
    toast('Reglas guardadas', 'ok'); pintar();
  }

  async function alTocar(e) {
    var b;
    if (e.target.closest('[data-tasa]')) { hojaTasa(); return; }
    if (e.target.closest('[data-blanco]')) {
      var txt = $('#ajCond', raiz).value.trim(), antes = ST.cfg.contrato_condiciones;
      ST.cfg.contrato_condiciones = txt; imprimirContrato(null); ST.cfg.contrato_condiciones = antes;
      return;
    }
    if (e.target.closest('[data-fabrica]')) {
      if (!(await confirmar({ titulo: 'Condiciones de fábrica', mensaje: 'Se borran tus cambios y vuelven las condiciones de fábrica.', boton: 'Volver' }))) return;
      try { await rpc('actualizar_config', { p: { contrato_condiciones: '' } }); await recargarConfig(); pintar(); } catch (err) { toast(errMsg(err), 'error'); }
      return;
    }
    if (e.target.closest('[data-clave]')) { hojaCambiarClave(false); return; }
    if (e.target.closest('[data-cola]')) { hojaCola(); return; }
    if (e.target.closest('[data-nuevo-usuario]')) { hojaUsuario(null); return; }
    if ((b = e.target.closest('[data-usuario]'))) { hojaUsuario(ST.usrPorId.get(b.dataset.usuario)); return; }
    if (e.target.closest('[data-nuevo-metodo]')) { hojaMetodo(); return; }
    if ((b = e.target.closest('[data-metodo]'))) {
      try { await rpc('guardar_metodo', { p: { id: Number(b.dataset.metodo), activo: b.checked } }); await recargarConfig(); toast('Guardado', 'ok'); }
      catch (err) { b.checked = !b.checked; toast(errMsg(err), 'error'); }
    }
  }

  return { mostrar: mostrar, refrescar: pintar };
})();

// Llama la función del servidor que maneja usuarios (usa la llave de servicio, que nunca está en la app)
async function funcionUsuarios(cuerpo) {
  var r = await sb.functions.invoke('usuarios', { body: cuerpo });
  if (r.error) {
    var msg = r.error.message;
    try { var j = await r.error.context.json(); if (j && j.error) msg = j.error; } catch (e) { /* sin detalle */ }
    throw new Error(msg);
  }
  if (r.data && r.data.error) throw new Error(r.data.error);
  return r.data;
}

function hojaUsuario(u) {
  var nuevo = !u;
  u = u || { rol: 'empleado', sede: 'pedraza', activo: true };
  var h = abrirHoja({
    titulo: nuevo ? 'Nuevo usuario' : u.nombre,
    html: '<div class="pila">' +
      '<label class="campo"><span>Nombre</span><input id="usNombre" value="' + esc(u.nombre || '') + '" autocapitalize="words"></label>' +
      (nuevo ? '<label class="campo"><span>Usuario para entrar <span class="ayuda">(sin espacios, ej.: pedro)</span></span><input id="usUsuario" autocapitalize="none" autocorrect="off" spellcheck="false"></label>' +
        '<label class="campo"><span>Clave temporal <span class="ayuda">(al entrar se le pide cambiarla)</span></span><input id="usClave" autocomplete="off"></label>' : '') +
      '<div class="campo"><span>Rol</span><div class="seg" id="usRol"><button type="button" data-v="empleado"' + (u.rol === 'empleado' ? ' class="activo"' : '') + '>Empleado</button>' +
        '<button type="button" data-v="dueno"' + (u.rol === 'dueno' ? ' class="activo"' : '') + '>Dueño</button></div></div>' +
      '<div class="campo" id="usSedeCampo"' + (u.rol === 'dueno' ? ' hidden' : '') + '><span>Sede (solo ve los clientes de aquí)</span><div class="seg" id="usSede">' +
        ['pedraza', 'socopo'].map(function (s) { return '<button type="button" data-v="' + s + '"' + (u.sede === s ? ' class="activo"' : '') + '>' + nombreSede(s) + '</button>'; }).join('') + '</div></div>' +
      (nuevo ? '' : '<label class="casilla"><input type="checkbox" id="usActivo"' + (u.activo ? ' checked' : '') + '> Puede entrar</label>' +
        '<button type="button" class="btn btn-sec" id="usClaveNueva">' + icono('candado') + 'Ponerle una clave nueva</button>') +
      '</div>',
    pie: '<button type="button" class="btn btn-ancho" id="usGuardar">' + (nuevo ? 'Crear usuario' : 'Guardar') + '</button>'
  });
  var rol = u.rol, sede = u.sede || 'pedraza';
  h.$('#usRol').addEventListener('click', function (e) {
    var b = e.target.closest('[data-v]'); if (!b) return;
    rol = b.dataset.v; $$('button', this).forEach(function (x) { x.classList.toggle('activo', x === b); });
    h.$('#usSedeCampo').hidden = rol === 'dueno';
  });
  h.$('#usSede').addEventListener('click', function (e) {
    var b = e.target.closest('[data-v]'); if (!b) return;
    sede = b.dataset.v; $$('button', this).forEach(function (x) { x.classList.toggle('activo', x === b); });
  });
  var cn = h.$('#usClaveNueva');
  if (cn) cn.onclick = async function () {
    var clave = await confirmar({ titulo: 'Clave nueva para ' + u.nombre, mensaje: 'Al entrar se le va a pedir que la cambie.', pedir: 'Clave temporal (mínimo 6)', boton: 'Guardar' });
    if (!clave) return;
    if (clave.length < 6) { toast('Mínimo 6 caracteres', 'error'); return; }
    try { await funcionUsuarios({ accion: 'clave', id: u.id, clave: clave }); toast('Clave cambiada', 'ok'); }
    catch (err) { toast(errMsg(err), 'error'); }
  };
  protegerBoton(h.$('#usGuardar'), async function () {
    var nombre = h.$('#usNombre').value.trim();
    if (!nombre) { toast('Escribe el nombre', 'error'); return; }
    if (nuevo) {
      var usuario = h.$('#usUsuario').value.trim().toLowerCase(), clave = h.$('#usClave').value;
      if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) { toast('El usuario debe tener de 3 a 30 letras o números, sin espacios', 'error'); return; }
      if (clave.length < 6) { toast('La clave debe tener al menos 6 caracteres', 'error'); return; }
      await funcionUsuarios({ accion: 'crear', usuario: usuario, nombre: nombre, clave: clave, rol: rol, sede: rol === 'empleado' ? sede : null });
      toast('Usuario creado. Entra con "' + usuario + '" y la clave que pusiste.', 'ok', 6000);
    } else {
      await rpc('actualizar_usuario', { p_id: u.id, p_nombre: nombre, p_rol: rol, p_sede: rol === 'empleado' ? sede : null, p_activo: h.$('#usActivo').checked });
      toast('Guardado', 'ok');
    }
    await recargarConfig();
    h.cerrar(); repintar();
  });
}

function hojaMetodo() {
  var h = abrirHoja({
    titulo: 'Nuevo método de pago',
    html: '<div class="pila"><label class="campo"><span>Nombre</span><input id="mtNombre" placeholder="Ej.: Binance Pay"></label>' +
      '<div class="campo"><span>Moneda</span><div class="seg" id="mtMoneda"><button type="button" data-v="USD" class="activo">Dólares</button><button type="button" data-v="VES">Bolívares</button></div></div>' +
      '<label class="casilla"><input type="checkbox" id="mtEnMano"> Es efectivo (queda en manos de quien cobra)</label>' +
      '<label class="casilla"><input type="checkbox" id="mtRef" checked> Pedir número de referencia</label></div>',
    pie: '<button type="button" class="btn btn-ancho" id="mtGuardar">Guardar</button>'
  });
  var moneda = 'USD';
  h.$('#mtMoneda').addEventListener('click', function (e) {
    var b = e.target.closest('[data-v]'); if (!b) return;
    moneda = b.dataset.v; $$('button', this).forEach(function (x) { x.classList.toggle('activo', x === b); });
  });
  protegerBoton(h.$('#mtGuardar'), async function () {
    var nombre = h.$('#mtNombre').value.trim();
    if (!nombre) { toast('Escribe el nombre', 'error'); return; }
    await rpc('guardar_metodo', { p: { nombre: nombre, moneda: moneda, en_mano: h.$('#mtEnMano').checked, pide_referencia: h.$('#mtRef').checked } });
    await recargarConfig();
    h.cerrar(); toast('Método agregado', 'ok'); repintar();
  });
}
