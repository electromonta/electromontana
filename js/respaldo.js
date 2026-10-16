// Electro Montana — copia de seguridad que descarga un dueño: todos los datos en un archivo que queda
// FUERA de Supabase (en el teléfono, la computadora, Drive o un chat de WhatsApp). En el plan gratis
// Supabase no guarda respaldos; aun en el plan Pro, una copia propia nunca sobra.
'use strict';

// Tablas que entran en la copia completa (todo lo que un dueño puede leer). [tabla, orden]
var TABLAS_COPIA = [
  ['config', 'id'], ['usuarios', 'id'], ['metodos_pago', 'id'], ['tasas', 'id'], ['clientes', 'id'],
  ['productos', 'id'], ['producto_costos', 'producto_id'], ['existencias', 'producto_id,sede'], ['movimientos_inventario', 'id'],
  ['ventas', 'id'], ['venta_items', 'id'], ['venta_item_costos', 'item_id'], ['cuotas', 'id'], ['abonos', 'id'],
  ['entregas', 'id'], ['eventos_venta', 'id'], ['gestiones', 'id'], ['solicitudes', 'id'], ['auditoria', 'id']
];
var DIAS_AVISO_COPIA = 7;

function diasSinCopia() {
  var f = ST.cfg && ST.cfg.ultima_copia_en;
  if (!f) return null;
  return Math.floor((Date.now() - new Date(f).getTime()) / 86400000);
}
// Se avisa a los dueños cuando ya hay clientes y la última copia es vieja (o nunca se hizo)
function tocaCopia() {
  if (!esDueno() || !ST.clientes.length) return false;
  var d = diasSinCopia();
  return d == null || d >= DIAS_AVISO_COPIA;
}
function textoUltimaCopia() {
  var f = ST.cfg && ST.cfg.ultima_copia_en;
  if (!f) return 'Nunca se ha descargado una copia.';
  return 'Última copia: ' + haceCuanto(f) + ' (' + fmtFechaAnio(fechaCaracas(f)) + ')' +
    (ST.cfg.ultima_copia_por ? ', la bajó ' + nombreUsuario(ST.cfg.ultima_copia_por) : '') + '.';
}

async function armarCopia(avance) {
  var datos = {}, conteo = {};
  for (var i = 0; i < TABLAS_COPIA.length; i++) {
    var t = TABLAS_COPIA[i][0];
    if (avance) avance(i + 1, TABLAS_COPIA.length);
    datos[t] = await traerTodo(t, '*', null, TABLAS_COPIA[i][1]);
    conteo[t] = datos[t].length;
  }
  return {
    sistema: 'Electro Montana', tipo: 'copia completa', version_app: VERSION_APP,
    hecha_en: new Date().toISOString(), hecha_por: ST.yo.usuario,
    nota: 'Datos de la base. Las fotos (cédulas, contratos, firmas, comprobantes) quedan en el almacenamiento de Supabase; aquí va su ruta.',
    conteo: conteo, datos: datos
  };
}

// ¿Este aparato abre "Compartir" con archivos? (teléfono o tablet; en la computadora se descarga)
function puedeCompartirArchivos() {
  var tactil = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (!tactil || !navigator.canShare || typeof File !== 'function') return false;
  try { return navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] }); } catch (e) { return false; }
}

// Entrega un archivo: en el teléfono o la tablet abre "Compartir" (Guardar en Archivos, Drive, WhatsApp…);
// en la computadora lo descarga. Devuelve false si la persona canceló.
// Ojo: en el iPhone "Compartir" solo abre si se llama en el mismo toque (sin esperar internet antes).
async function entregarArchivo(nombre, contenido, tipo) {
  var blob = new Blob([contenido], { type: tipo });
  var tactil = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (tactil && navigator.canShare && typeof File === 'function') {
    var f = new File([blob], nombre, { type: tipo });
    if (navigator.canShare({ files: [f] })) {
      try { await navigator.share({ files: [f], title: nombre }); return true; }
      catch (e) { if (e && e.name === 'AbortError') return false; /* si falla, se descarga */ }
    }
  }
  var url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = nombre; a.style.display = 'none';
  document.body.appendChild(a); a.click();
  setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 4000);
  return true;
}

// Para un archivo que tardó en armarse (bajando datos): en el teléfono se ofrece con un botón, así
// "Compartir" abre en ese toque; en la computadora se descarga de una vez.
function ofrecerArchivo(nombre, contenido, tipo, titulo, texto) {
  if (!puedeCompartirArchivos()) return entregarArchivo(nombre, contenido, tipo);
  return new Promise(function (res) {
    var hecho = false;
    var h = abrirHoja({
      titulo: titulo,
      html: '<div class="aviso aviso-ok">' + icono('check') + '<div>' + texto + '</div></div>',
      pie: '<button type="button" class="btn btn-ancho" id="ofEnviar">' + icono('enviar') + 'Guardar o enviar</button>',
      alCerrar: function () { if (!hecho) res(false); }
    });
    h.$('#ofEnviar').onclick = function () {
      if (hecho) return;
      hecho = true;
      entregarArchivo(nombre, contenido, tipo).then(function (ok) { res(ok); h.cerrar(); });
    };
  });
}

async function descargarCopiaCompleta(btn) {
  var copia = await armarCopia(function (i, n) { if (btn && btn.isConnected) btn.textContent = 'Preparando copia… ' + i + ' de ' + n; });
  var hoy = hoyCaracas();
  var ok = await ofrecerArchivo('electromontana-copia-' + hoy + '.json', JSON.stringify(copia), 'application/json', 'Copia lista',
    'La copia está lista: ' + plural(copia.conteo.clientes, 'cliente', 'clientes') + ' y ' + plural(copia.conteo.abonos, 'abono', 'abonos') +
    '. Toca <b>Guardar o enviar</b> y elige dónde: Archivos, Drive o un chat de WhatsApp.');
  if (!ok) { toast('No se guardó la copia', '', 3000); return false; }
  try {
    var r = await rpc('anotar_copia', { p_resumen: copia.conteo });
    ST.cfg.ultima_copia_en = r || new Date().toISOString();
    ST.cfg.ultima_copia_por = ST.yo.id;
    guardarCache();
  } catch (e) { /* la copia ya quedó en el teléfono; se anota la próxima vez */ }
  toast('Copia lista: ' + plural(copia.conteo.clientes, 'cliente', 'clientes') + ', ' + plural(copia.conteo.abonos, 'abono', 'abonos') + '.', 'ok', 5000);
  return true;
}

// Lista de clientes con lo que deben, para abrir en Excel, Numbers o Google Sheets
function csvClientes() {
  function campo(v) { v = v == null ? '' : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function num(n) { return (Number(n) || 0).toFixed(2).replace('.', ','); }
  var filas = [['N°', 'Cliente', 'Cédula', 'Teléfono', 'Sede', 'Sector', 'Dirección', 'Fiador', 'Teléfono del fiador',
                'Debe $', 'Atrasado $', 'Días de atraso', 'Próxima cuota $', 'Fecha próxima cuota', 'Último abono']];
  ST.clientes.filter(function (c) { return !c.deleted_at; }).forEach(function (c) {
    var r = resumenCliente(c.id), p = r.atraso > 0 ? r.siguiente : r.proxima;
    filas.push([c.id, c.nombre, c.cedula ? fmtCedula(c.cedula) : '', c.telefono || c.contacto_telefono || '', nombreSede(c.sede), c.sector || '',
      c.direccion || '', c.fiador_nombre || '', c.fiador_telefono || '', num(r.saldo), num(r.atraso), r.atraso > 0 ? r.dias : 0,
      p ? num(p.pendiente) : '', p ? fmtFechaAnio(p.fecha) : '', r.ultimoAbono ? fmtFechaAnio(r.ultimoAbono) : '']);
  });
  return '﻿' + filas.map(function (f) { return f.map(campo).join(';'); }).join('\r\n');
}

async function descargarListaClientes() {
  var ok = await entregarArchivo('electromontana-clientes-' + hoyCaracas() + '.csv', csvClientes(), 'text/csv;charset=utf-8');
  if (ok) toast('Lista de clientes lista', 'ok');
}

// Sección de Ajustes (solo dueños)
function htmlSeccionCopia() {
  var viejo = tocaCopia();
  return '<div class="seccion" id="seccionCopia"><div class="seccion-tit"><h2>Copia de seguridad</h2></div><div class="tarjeta">' +
    '<p style="margin:0 0 8px">Guarda <b>todos los datos</b> en un archivo fuera del sistema: en el teléfono, la computadora, Drive o un chat de WhatsApp. ' +
      'Hazla <b>una vez por semana</b>.</p>' +
    '<div class="aviso ' + (viejo ? 'aviso-ambar' : 'aviso-ok') + '" style="margin-bottom:12px">' + icono(viejo ? 'alerta' : 'check') + '<div>' + esc(textoUltimaCopia()) + '</div></div>' +
    '<div class="pila"><button type="button" class="btn btn-ancho" id="ajCopia">' + icono('nube') + 'Descargar copia completa</button>' +
    '<button type="button" class="btn btn-sec btn-ancho" id="ajCsv">' + icono('cobros') + 'Lista de clientes y saldos (Excel)</button></div>' +
    '<p class="tenue chico" style="margin-top:10px">La copia completa sirve para recuperar todo si algo le pasa a la base. Las fotos quedan guardadas aparte en Supabase.</p>' +
    '</div></div>';
}
function activarSeccionCopia(raiz) {
  var b = $('#ajCopia', raiz);
  if (b) protegerBoton(b, async function () { if (await descargarCopiaCompleta(b)) repintar(); }, 'Preparando copia…');
  var c = $('#ajCsv', raiz);
  if (c) protegerBoton(c, descargarListaClientes, 'Preparando lista…');
}
