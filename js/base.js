// Electro Montana — utilidades comunes: conexión, formato, fechas, íconos, avisos, ventanas, fotos y WhatsApp.
'use strict';

var sb = window.supabase.createClient(EM_CONFIG.url, EM_CONFIG.key, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'electromontana-sesion' }
});

/* ---------------- DOM y texto ---------------- */
function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function iniciales(nombre) {
  var p = String(nombre || '').trim().split(/\s+/);
  return ((p[0] || '')[0] || '') + ((p[1] || '')[0] || '');
}
function debounce(fn, ms) {
  var t; return function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms || 250); };
}
function normalizar(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function nombreSede(s) { return s === 'pedraza' ? 'Pedraza' : s === 'socopo' ? 'Socopó' : '—'; }
function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }

/* ---------------- Números y dinero ---------------- */
var redondear2 = Cuentas.r2;
var _fmt2 = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
var _fmtTasa = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
function fmtUSD(n) { n = Number(n) || 0; return (n < -0.004 ? '−' : '') + '$' + _fmt2.format(Math.abs(n)); }
function fmtBs(n) { n = Number(n) || 0; return (n < -0.004 ? '−' : '') + 'Bs ' + _fmt2.format(Math.abs(n)); }
function fmtMonto(n, moneda) { return moneda === 'VES' ? fmtBs(n) : fmtUSD(n); }
function fmtTasa(n) { return _fmtTasa.format(Number(n) || 0); }
function fmtNum(n) { return _fmt2.format(Number(n) || 0); }
// Acepta "1.234,56", "1234.56", "12,5", "1.500" (= mil quinientos). Devuelve NaN si no es número.
function parseNum(txt) {
  if (typeof txt === 'number') return txt;
  var s = String(txt == null ? '' : txt).trim().replace(/\s|\$|bs\.?/gi, '');
  if (!s) return NaN;
  var nc = (s.match(/,/g) || []).length, np = (s.match(/\./g) || []).length;
  if (nc && np) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (nc) {
    s = nc > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (np > 1 || /^\d{1,3}\.\d{3}$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  return parseFloat(s);
}
// Para escribir un número en un campo: 12.5 → "12,50"
function numCampo(n) { return n == null || isNaN(n) ? '' : fmtNum(n).replace(/\./g, ''); }

/* ---------------- Fechas (hora de Venezuela) ---------------- */
var TZ = 'America/Caracas';
function hoyCaracas() { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date()); }
function fechaCaracas(ts) { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ts)); }
var sumarDias = Cuentas.sumarDias, diasEntre = Cuentas.diasEntre;
function _fecha(f) { return /^\d{4}-\d{2}-\d{2}$/.test(f) ? new Date(f + 'T12:00:00-04:00') : new Date(f); }
function fmtFecha(f) { return f ? new Intl.DateTimeFormat('es-VE', { timeZone: TZ, day: 'numeric', month: 'short' }).format(_fecha(f)).replace('.', '') : '—'; }
function fmtFechaAnio(f) { return f ? new Intl.DateTimeFormat('es-VE', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(_fecha(f)) : '—'; }
function fmtFechaLarga(f) { return new Intl.DateTimeFormat('es-VE', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(_fecha(f)); }
function fmtHora(ts) { return new Intl.DateTimeFormat('es-VE', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(ts)); }
function fmtFechaHora(ts) { return fmtFecha(ts) + ', ' + fmtHora(ts); }
function haceCuanto(ts) {
  var min = Math.round((Date.now() - new Date(ts)) / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return 'hace ' + plural(min, 'minuto', 'minutos');
  var h = Math.round(min / 60);
  if (h < 24) return 'hace ' + plural(h, 'hora', 'horas');
  return 'el ' + fmtFechaHora(ts);
}
function textoDias(n) { return n === 0 ? 'hoy' : n === 1 ? '1 día' : n + ' días'; }

/* ---------------- Marca y SVG de un solo color ---------------- */
// Emblema: montaña con un rayo que cae entre los picos
function logoSVG(linea, rayo, clase) {
  return '<svg class="' + (clase || '') + '" viewBox="0 0 64 64" aria-hidden="true">' +
    '<circle cx="32" cy="32" r="29" fill="none" stroke="' + linea + '" stroke-width="2.6"/>' +
    '<path d="M9 46 L23 23 L31 34 L40 26 L55 46" fill="none" stroke="' + linea + '" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/>' +
    '<path d="M35 8.5 L27.5 22 L32.5 22 L30 31 L38.5 17 L33.5 17 L37 8.5 Z" fill="' + rayo + '"/></svg>';
}
var ICONOS = {
  cobrar: '<rect x="3" y="6.5" width="18" height="12" rx="2.2"/><circle cx="12" cy="12.5" r="2.6"/><path d="M6.5 9.5v.01M17.5 15.5v.01"/>',
  clientes: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.6-3 2.8-4.7 5.5-4.7s4.9 1.7 5.5 4.7"/><circle cx="17" cy="9.5" r="2.4"/><path d="M16.2 14.8c2.3 0 3.8 1.4 4.3 3.9"/>',
  vender: '<path d="M12 5v14M5 12h14"/>',
  cobros: '<path d="M7 3.5h10v17l-2.5-1.6-2.5 1.6-2.5-1.6L7 20.5v-17z"/><path d="M10 8.5h4M10 12h4"/>',
  tienda: '<path d="M4 9.5 5.5 4.5h13L20 9.5"/><path d="M4 9.5c0 1.4 1.1 2.5 2.7 2.5s2.6-1.1 2.6-2.5c0 1.4 1.1 2.5 2.7 2.5s2.7-1.1 2.7-2.5c0 1.4 1 2.5 2.6 2.5S20 10.9 20 9.5"/><path d="M5.5 12v8h13v-8M10 20v-4.5h4V20"/>',
  ajustes: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  buscar: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  menos: '<path d="M5 12h14"/>',
  cerrar: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  camara: '<path d="M4 8.5h3.2l1.8-2.5h6l1.8 2.5H20V19H4z"/><circle cx="12" cy="13.5" r="3.3"/>',
  editar: '<path d="M4.5 19.5h4l10-10-4-4-10 10v4z"/><path d="m13 7 4 4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alerta: '<path d="M12 4.5 3 19.5h18L12 4.5z"/><path d="M12 10v4.2M12 16.8v.4"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.01"/>',
  salir: '<path d="M14 4.5h5v15h-5"/><path d="m10 8-4 4 4 4M6 12h10"/>',
  calendario: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M9 3.5v4M15 3.5v4"/>',
  flecha: '<path d="m9.5 6 6 6-6 6"/>',
  atras: '<path d="m14.5 6-6 6 6 6"/>',
  abajo: '<path d="m6 9.5 6 6 6-6"/>',
  menu: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
  usuario: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>',
  candado: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  reloj: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  foto: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m4 17 5-4.5 3.5 3 3-2.5 4.5 4"/>',
  chat: '<path d="M5 5.5h14v10H10l-4 3.5v-3.5H5z"/>',
  telefono: '<path d="M6.5 4h3l1.5 4-2 1.3a10 10 0 0 0 5.7 5.7l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4z"/>',
  mapa: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  nube: '<path d="M7 18.5h10a4 4 0 0 0 .6-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 18.5z"/>',
  sinsenal: '<path d="M7 18.5h10a4 4 0 0 0 .6-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 18.5z"/><path d="M4 4l16 16"/>',
  refrescar: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
  contrato: '<path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4M9.5 12h6M9.5 15.5h6M9.5 8.5h2"/>',
  imprimir: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7.5" rx="1.5"/><path d="M7 14h10v6H7z"/>',
  caja: '<path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7z"/><path d="m4 8.5 8 4.5 8-4.5M12 13v7"/>',
  moneda: '<circle cx="12" cy="12" r="8.5"/><path d="M14.8 9.2c-.5-.9-1.6-1.4-2.8-1.4-1.6 0-2.8.8-2.8 2.1 0 2.9 5.8 1.5 5.8 4.3 0 1.3-1.3 2.1-3 2.1-1.3 0-2.5-.6-3-1.6M12 6v1.8M12 16.3V18"/>',
  basura: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>',
  enviar: '<path d="M20.5 3.5 3.5 10.5l7 2.5 2.5 7 7.5-16.5z"/><path d="m10.5 13 4-4"/>'
};
function icono(n, clase) {
  return '<svg class="ic ' + (clase || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONOS[n] || '') + '</svg>';
}

/* ---------------- Avisos ---------------- */
function toast(msg, tipo, ms) {
  var cont = $('#toasts');
  var el = document.createElement('div');
  el.className = 'toast ' + (tipo || '');
  el.textContent = msg;
  cont.appendChild(el);
  setTimeout(function () { el.remove(); }, ms || (tipo === 'error' ? 6000 : 3000));
}
// ¿El error es de conexión (se puede reintentar) o es una respuesta de la base (no se reintenta)?
// Las fallas del servidor (5xx, base ocupada, sesión por renovar) también se reintentan: con la clave no se repite nada.
function esErrorDeRed(e) {
  if (!e) return false;
  if (e.name === 'AbortError' || e.esTiempo) return true;
  var st = Number(e.status != null ? e.status : e.statusCode);
  if (st === 0 || st >= 500) return true;
  if (e.code && /^(40001|40P01|57014|57P0\d|53\d{3}|08\d{3}|PGRST00\d|PGRST30\d)$/.test(e.code)) return true;
  if (e.code && /^[0-9A-Z]{5}$/.test(e.code)) return false;   // error de Postgres (regla del negocio)
  var m = String(e.message || e.error_description || e.error || e);
  if (/failed to fetch|networkerror|load failed|network request failed|fetch|timeout|tiempo|aborted|offline|ERR_/i.test(m)) return true;
  return false;
}
// Convierte errores técnicos en mensajes que se entienden
function errMsg(e) {
  var m = (e && (e.message || e.error_description || e.error)) || String(e || 'Error');
  if (esErrorDeRed(e)) return 'Sin conexión o el internet está muy lento. Vuelve a intentar.';
  if (/jwt expired|invalid jwt|refresh token/i.test(m)) return 'Tu sesión venció. Vuelve a entrar.';
  if (/invalid login credentials/i.test(m)) return 'Usuario o clave incorrectos.';
  if (/row-level security|permission denied/i.test(m)) return 'No tienes permiso para hacer esto.';
  if (/duplicate key/i.test(m)) return 'Ese dato ya existe.';
  return m;
}

/* ---------------- Botones a prueba de doble toque ---------------- */
function protegerBoton(btn, fn, textoOcupado) {
  if (!btn) return;
  btn.addEventListener('click', async function (ev) {
    ev.preventDefault();
    if (btn.dataset.ocupado === '1') return;
    btn.dataset.ocupado = '1';
    btn.disabled = true;
    var original = btn.innerHTML;
    btn.textContent = textoOcupado || 'Guardando…';
    try {
      await fn(ev);
    } catch (e) {
      console.error(e);
      toast(errMsg(e), 'error');
    } finally {
      btn.dataset.ocupado = '0';
      if (btn.isConnected) { btn.disabled = false; btn.innerHTML = original; }
    }
  });
}

/* ---------------- Base de datos ---------------- */
// Llama una función de la base. Si el internet no responde en "ms", se corta (la operación se puede
// repetir sin riesgo porque lleva su clave).
async function rpc(nombre, args, ms) {
  var ctrl = new AbortController();
  var t = setTimeout(function () { ctrl.abort(); }, ms || 30000);
  try {
    var r = await sb.rpc(nombre, args || {}).abortSignal(ctrl.signal);
    if (r.error) {
      if (ctrl.signal.aborted) { var e = new Error('Se agotó el tiempo de espera'); e.esTiempo = true; throw e; }
      var err = r.error;
      try { err.status = r.status; } catch (x) { /* objeto congelado */ }
      throw err;
    }
    return r.data;
  } finally { clearTimeout(t); }
}

// Supabase corta en 1000 filas sin avisar: siempre paginar
async function traerTodo(tabla, select, preparar, orden) {
  var todos = [], desde = 0, tam = 1000;
  while (true) {
    var q = sb.from(tabla).select(select || '*');
    if (preparar) q = preparar(q);
    q = q.order(orden || 'id', { ascending: true });
    var r = await q.range(desde, desde + tam - 1);
    if (r.error) throw r.error;
    var lote = r.data || [];
    todos = todos.concat(lote);
    if (lote.length < tam) break;
    desde += tam;
  }
  return todos;
}

// Código único por operación: si se cae el internet y se reintenta, la base no la repite
function nuevaClave() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  var b = new Uint8Array(16); window.crypto.getRandomValues(b);
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}

/* ---------------- Fotos ---------------- */
function comprimirImagen(file, maxLado, calidad) {
  return new Promise(function (res, rej) {
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      var s = Math.min(1, maxLado / Math.max(img.naturalWidth, img.naturalHeight));
      var w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      c.toBlob(function (b) { b ? res(b) : rej(new Error('No se pudo procesar la foto.')); }, 'image/jpeg', calidad);
    };
    img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('No se pudo leer la foto.')); };
    img.src = url;
  });
}
// Abre la cámara o la galería y devuelve la foto ya achicada (para que suba rápido con internet lento)
function elegirFoto() {
  return new Promise(function (resolver) {
    $$('input[data-elegir-foto]').forEach(function (x) { x.remove(); });
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
    inp.setAttribute('data-elegir-foto', '');
    inp.onchange = async function () {
      var f = inp.files && inp.files[0]; inp.remove();
      if (!f) { resolver(null); return; }
      try { resolver(await comprimirImagen(f, 1400, 0.72)); }
      catch (e) { toast(errMsg(e), 'error'); resolver(null); }
    };
    inp.oncancel = function () { inp.remove(); resolver(null); };
    document.body.appendChild(inp);
    inp.click();
  });
}
// Muestra una foto del bucket privado con un enlace que vence en 10 minutos
async function verFoto(ruta, titulo) {
  var h = abrirHoja({ titulo: titulo || 'Foto', html: '<div class="cargando">Cargando foto…</div>' });
  try {
    var r = await sb.storage.from('fotos').createSignedUrl(ruta, 600);
    if (r.error) throw r.error;
    h.cuerpo.innerHTML = '<img class="foto-grande" src="' + esc(r.data.signedUrl) + '" alt="' + esc(titulo || 'Foto') + '">';
  } catch (e) {
    h.cuerpo.innerHTML = '<div class="aviso aviso-error">' + esc(errMsg(e)) + '</div>';
  }
}

/* ---------------- Ventanas (hojas) ---------------- */
var _hojas = [];
// o = {titulo, html, pie, completa, cerrarFuera (true por defecto), alCerrar, fija}
function abrirHoja(o) {
  var velo = document.createElement('div');
  velo.className = 'velo';
  velo.innerHTML =
    '<div class="hoja ' + (o.completa ? 'completa ' : '') + (o.clase || '') + '" role="dialog" aria-modal="true" aria-label="' + esc(o.titulo) + '">' +
      '<div class="hoja-cab"><h2>' + esc(o.titulo) + '</h2>' +
        '<button type="button" class="btn btn-plano btn-icono" data-cerrar aria-label="Cerrar">' + icono('cerrar') + '</button></div>' +
      '<div class="hoja-cuerpo">' + (o.html || '') + '</div>' +
      (o.pie ? '<div class="hoja-pie">' + o.pie + '</div>' : '') +
    '</div>';
  document.body.appendChild(velo);
  document.body.style.overflow = 'hidden';
  var h = {
    velo: velo, el: velo.querySelector('.hoja'), cuerpo: velo.querySelector('.hoja-cuerpo'), pie: velo.querySelector('.hoja-pie'),
    $: function (sel) { return velo.querySelector(sel); },
    $$: function (sel) { return Array.prototype.slice.call(velo.querySelectorAll(sel)); },
    cerrado: false,
    fija: !!o.fija,
    cerrar: function () {
      if (h.cerrado) return;
      h.cerrado = true;
      velo.remove();
      _hojas = _hojas.filter(function (x) { return x !== h; });
      if (o.alCerrar) o.alCerrar();
      if (!_hojas.length) {
        document.body.style.overflow = '';
        if (window._repintarAlCerrar) { window._repintarAlCerrar = false; repintar(); }
      }
    }
  };
  velo.addEventListener('click', function (e) { if (e.target === velo && o.cerrarFuera !== false && !h.fija) h.cerrar(); });
  if (o.fija) velo.querySelector('[data-cerrar]').hidden = true;
  velo.querySelector('[data-cerrar]').addEventListener('click', function () { h.cerrar(); });
  _hojas.push(h);
  return h;
}
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && _hojas.length && !_hojas[_hojas.length - 1].fija) _hojas[_hojas.length - 1].cerrar();
});

// Pregunta de sí/no, opcionalmente pidiendo un texto (motivo) o número
function confirmar(o) {
  return new Promise(function (resolver) {
    var campo = '';
    if (o.pedir) {
      campo = '<label class="campo" style="margin-top:14px"><span>' + esc(o.pedir) + '</span>' +
        (o.tipo === 'texto-largo' ? '<textarea id="cfValor"></textarea>' :
          '<input id="cfValor" ' + (o.tipo === 'numero' ? 'inputmode="decimal"' : '') + ' value="' + esc(o.valor || '') + '">') + '</label>';
    }
    var listo = false;
    var h = abrirHoja({
      titulo: o.titulo || 'Confirmar',
      html: '<div>' + (o.mensajeHtml || '<p>' + esc(o.mensaje || '') + '</p>') + '</div>' + campo,
      pie: '<div class="botonera"><button type="button" class="btn btn-sec" id="cfNo">Cancelar</button>' +
           '<button type="button" class="btn ' + (o.peligro ? 'btn-peligro' : '') + '" id="cfSi">' + esc(o.boton || 'Confirmar') + '</button></div>',
      cerrarFuera: !o.pedir,
      alCerrar: function () { if (!listo) resolver(o.pedir ? null : false); }
    });
    var inp = h.$('#cfValor');
    if (inp) setTimeout(function () { inp.focus(); }, 60);
    h.$('#cfNo').onclick = function () { h.cerrar(); };
    h.$('#cfSi').onclick = function () {
      var val = true;
      if (o.pedir) {
        val = inp.value.trim();
        if (o.obligatorio !== false && !val) { inp.focus(); toast('Este dato es obligatorio', 'error'); return; }
      }
      listo = true; h.cerrar(); resolver(val);
    };
  });
}

/* ---------------- Listas largas: se dibujan por partes ---------------- */
function dibujarPorPartes(cont, items, render, tam) {
  tam = tam || 80;
  var mostrados = 0;
  function mas() {
    var trozo = items.slice(mostrados, mostrados + tam);
    mostrados += trozo.length;
    var btnViejo = cont.querySelector(':scope > .mas');
    if (btnViejo) btnViejo.remove();
    cont.insertAdjacentHTML('beforeend', trozo.map(render).join(''));
    if (mostrados < items.length) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'btn btn-sec mas';
      b.textContent = 'Mostrar más (' + (items.length - mostrados) + ')';
      b.onclick = mas;
      cont.appendChild(b);
    }
  }
  mas();
}

/* ---------------- WhatsApp, llamadas y mapa ---------------- */
// Número para WhatsApp: 0414-1234567 → 584141234567; si empieza con + se respeta el país
function telefonoWa(tel) {
  var crudo = String(tel || '').trim();
  var d = crudo.replace(/\D/g, '');
  if (!d) return '';
  if (crudo[0] === '+' || crudo.indexOf('00') === 0) return d.replace(/^00/, '');
  if (d.indexOf('58') === 0 && d.length >= 12) return d;
  if (d[0] === '0') return '58' + d.slice(1);
  if (d.length === 10) return '58' + d;
  return d;
}
function abrirWhatsApp(texto, telefono) {
  var num = telefonoWa(telefono);
  var url = 'https://wa.me/' + num + '?text=' + encodeURIComponent(texto);
  if (!num && navigator.share) { navigator.share({ text: texto }).catch(function () {}); return; }
  window.open(url, '_blank');
}
function enlaceTel(tel) { return 'tel:' + String(tel || '').replace(/[^\d+]/g, ''); }
function enlaceMapa(lat, lng) { return 'https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lng; }
function copiarTexto(texto) {
  if (navigator.clipboard) navigator.clipboard.writeText(texto).then(function () { toast('Texto copiado', 'ok'); });
}
// Ubicación del teléfono (para guardar dónde vive el cliente)
function pedirUbicacion() {
  return new Promise(function (res, rej) {
    if (!navigator.geolocation) { rej(new Error('Este teléfono no da la ubicación.')); return; }
    navigator.geolocation.getCurrentPosition(function (p) {
      res({ lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6, precision: p.coords.accuracy });
    }, function (e) {
      rej(new Error(e.code === 1 ? 'Hay que darle permiso de ubicación a la app.' : 'No se pudo tomar la ubicación. Intenta al aire libre.'));
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}
