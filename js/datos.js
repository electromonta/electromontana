// Electro Montana — datos: lo que hay en memoria, la copia en el teléfono (para abrir sin señal)
// y la cola de envío (lo que se registra se guarda primero en el teléfono y se manda solo).
'use strict';

var ST = {
  yo: null, cfg: null, metodos: [], usuarios: [], usrPorId: new Map(),
  clientes: [], cliPorId: new Map(),
  ventas: [], ventaPorId: new Map(), ventasPorCliente: new Map(),
  cuotas: [], cuotasPorVenta: new Map(),
  items: [], itemsPorVenta: new Map(),
  itemCostos: [], costoPorItem: new Map(),
  productos: [], prodCostos: [], costoProducto: new Map(),
  existencias: [], existencia: new Map(),             // "producto|sede" → cantidad
  gestiones: [], gestionesPorCliente: new Map(),      // notas de cobro de los últimos meses
  ultimosAbonos: [], ultimoAbono: new Map(), ultimoAbonoEn: new Map(),   // cliente → fecha (y hora) del último abono
  cargadoEn: null, desdeCache: false
};
var _estados = new Map();

function esDueno() { return !!(ST.yo && ST.yo.activo && ST.yo.rol === 'dueno'); }
function metodoPorId(id) { return ST.metodos.find(function (m) { return m.id === id; }); }
function nombreUsuario(id) { var u = ST.usrPorId.get(id); return u ? u.nombre : '—'; }
function tasaDeHoy() {
  return !!(ST.cfg && Number(ST.cfg.tasa_bs) > 0 && ST.cfg.tasa_actualizada_en && fechaCaracas(ST.cfg.tasa_actualizada_en) === hoyCaracas());
}

/* ---------------- Copia en el teléfono (IndexedDB) ---------------- */
var BD = (function () {
  var p = null;
  function abrir() {
    if (p) return p;
    p = new Promise(function (res, rej) {
      var r = indexedDB.open('electromontana', 1);
      r.onupgradeneeded = function () {
        var db = r.result;
        db.createObjectStore('cache');
        db.createObjectStore('cola', { keyPath: 'clave' });
        db.createObjectStore('fotos');
      };
      r.onsuccess = function () {
        var db = r.result;
        // iOS a veces cierra la conexión al volver de segundo plano: la próxima vez se abre otra
        db.onclose = function () { p = null; };
        db.onversionchange = function () { db.close(); p = null; };
        res(db);
      };
      r.onerror = function () { p = null; rej(r.error); };
    });
    return p;
  }
  function tx(store, modo, fn, reintento) {
    return abrir().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(store, modo), req = fn(t.objectStore(store));
        t.oncomplete = function () { res(req ? req.result : undefined); };
        t.onerror = function () { rej(t.error); };
        t.onabort = function () { rej(t.error); };
      });
    }).catch(function (e) {
      if (reintento) throw e;
      p = null;   // conexión cerrada o dañada: se abre de nuevo y se intenta una vez más
      return tx(store, modo, fn, true);
    });
  }
  return {
    get: function (st, k) { return tx(st, 'readonly', function (s) { return s.get(k); }); },
    put: function (st, v, k) { return tx(st, 'readwrite', function (s) { return k === undefined ? s.put(v) : s.put(v, k); }); },
    del: function (st, k) { return tx(st, 'readwrite', function (s) { return s.delete(k); }); },
    todos: function (st) { return tx(st, 'readonly', function (s) { return s.getAll(); }); },
    limpiar: function (st) { return tx(st, 'readwrite', function (s) { return s.clear(); }); }
  };
})();

function indexar() {
  _estados = new Map();
  ST.usrPorId = new Map(ST.usuarios.map(function (u) { return [u.id, u]; }));
  ST.cliPorId = new Map(ST.clientes.map(function (c) { return [c.id, c]; }));
  ST.ventaPorId = new Map();
  ST.ventasPorCliente = new Map();
  ST.ventas.sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.id - b.id; });
  ST.ventas.forEach(function (v) {
    ST.ventaPorId.set(v.id, v);
    if (!ST.ventasPorCliente.has(v.cliente_id)) ST.ventasPorCliente.set(v.cliente_id, []);
    ST.ventasPorCliente.get(v.cliente_id).push(v);
  });
  ST.cuotasPorVenta = agrupar(ST.cuotas, 'venta_id');
  ST.itemsPorVenta = agrupar(ST.items, 'venta_id');
  ST.itemsPorVenta.forEach(function (l) { l.sort(function (a, b) { return a.orden - b.orden; }); });
  ST.costoPorItem = new Map(ST.itemCostos.map(function (c) { return [c.item_id, Number(c.costo)]; }));
  ST.costoProducto = new Map(ST.prodCostos.map(function (c) { return [c.producto_id, Number(c.costo)]; }));
  ST.existencia = new Map(ST.existencias.map(function (e) { return [e.producto_id + '|' + e.sede, Number(e.cantidad)]; }));
  ST.gestiones.sort(function (a, b) { return a.creado_en < b.creado_en ? 1 : -1; });
  ST.gestionesPorCliente = agrupar(ST.gestiones, 'cliente_id');
  ST.ultimoAbono = new Map(ST.ultimosAbonos.map(function (x) { return [x.cliente_id, x.ultimo_abono]; }));
  ST.ultimoAbonoEn = new Map(ST.ultimosAbonos.map(function (x) { return [x.cliente_id, x.ultimo_en]; }));
  ST.clientes.sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
  ST.productos.sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
}
function agrupar(lista, campo) {
  var m = new Map();
  lista.forEach(function (x) { if (!m.has(x[campo])) m.set(x[campo], []); m.get(x[campo]).push(x); });
  return m;
}
function fotoDatos() {
  return { cfg: ST.cfg, metodos: ST.metodos, usuarios: ST.usuarios, clientes: ST.clientes, ventas: ST.ventas, cuotas: ST.cuotas,
           items: ST.items, itemCostos: ST.itemCostos, productos: ST.productos, prodCostos: ST.prodCostos,
           existencias: ST.existencias, gestiones: ST.gestiones, ultimosAbonos: ST.ultimosAbonos, cargadoEn: ST.cargadoEn };
}
function aplicarDatos(d) {
  ST.cfg = d.cfg; ST.metodos = d.metodos || []; ST.usuarios = d.usuarios || []; ST.clientes = d.clientes || [];
  ST.ventas = d.ventas || []; ST.cuotas = d.cuotas || []; ST.items = d.items || []; ST.itemCostos = d.itemCostos || [];
  ST.productos = d.productos || []; ST.prodCostos = d.prodCostos || []; ST.cargadoEn = d.cargadoEn;
  ST.existencias = d.existencias || []; ST.gestiones = d.gestiones || []; ST.ultimosAbonos = d.ultimosAbonos || [];
  indexar();
}
var guardarCache = debounce(function () {
  if (!ST.yo) return;
  BD.put('cache', { yo: ST.yo, datos: fotoDatos() }, 'datos:' + ST.yo.id).catch(function (e) { console.warn('No se guardó la copia', e); });
}, 800);
async function leerCache(uid) {
  try { return await BD.get('cache', 'datos:' + uid); } catch (e) { return null; }
}

/* ---------------- Carga desde la base ---------------- */
function _uno(r) { if (r.error) throw r.error; return r.data; }
async function cargarTodo() {
  var dueno = esDueno();
  var tareas = [
    sb.from('config').select('*').eq('id', 1).single().then(_uno),
    traerTodo('metodos_pago', '*', null, 'orden'),
    traerTodo('usuarios', 'id,usuario,nombre,rol,sede,activo', null, 'nombre'),
    traerTodo('clientes'),
    traerTodo('ventas', '*', function (q) { return q.neq('estado', 'anulada'); }),
    traerTodo('cuotas', 'id,venta_id,plan,n,tipo,fecha,monto', function (q) { return q.eq('vigente', true); }),
    traerTodo('venta_items', 'id,venta_id,producto_id,descripcion,cantidad,precio,orden,sede_salida'),
    traerTodo('productos', 'id,nombre,precio_sugerido,activo,codigo_yumana'),
    traerTodo('existencias', 'producto_id,sede,cantidad', null, 'producto_id,sede'),
    traerGestiones(),
    traerUltimosAbonos()
  ];
  if (dueno) {
    tareas.push(traerTodo('venta_item_costos', 'item_id,costo', null, 'item_id'));
    tareas.push(traerTodo('producto_costos', 'producto_id,costo', null, 'producto_id'));
  }
  var r = await Promise.all(tareas);
  aplicarDatos({ cfg: r[0], metodos: r[1], usuarios: r[2], clientes: r[3], ventas: r[4], cuotas: r[5], items: r[6],
                 productos: r[7], existencias: r[8], gestiones: r[9], ultimosAbonos: r[10],
                 itemCostos: r[11] || [], prodCostos: r[12] || [], cargadoEn: new Date().toISOString() });
  ST.desdeCache = false;
  guardarCache();
}

// Notas de cobro de los últimos 120 días
function traerGestiones(cliId) {
  var desde = new Date(Date.now() - 120 * 86400000).toISOString();
  return traerTodo('gestiones', '*', function (q) {
    q = q.is('anulada_en', null).gte('creado_en', desde);
    return cliId ? q.eq('cliente_id', cliId) : q;
  });
}
async function traerUltimosAbonos() {
  var todos = [], desde = 0;
  while (true) {   // la base entrega máximo 1000 filas por vez
    var r = await sb.rpc('resumen_abonos_clientes').order('cliente_id', { ascending: true }).range(desde, desde + 999);
    if (r.error) throw r.error;
    todos = todos.concat(r.data || []);
    if (!r.data || r.data.length < 1000) return todos;
    desde += 1000;
  }
}
async function recargarExistencias() {
  ST.existencias = await traerTodo('existencias', 'producto_id,sede,cantidad', null, 'producto_id,sede');
  indexar();
  guardarCache();
}
function existenciaDe(productoId, sede) { return ST.existencia.get(productoId + '|' + sede) || 0; }

// Después de registrar algo, solo se recarga ese cliente (rinde con internet lento)
async function recargarCliente(id) {
  var rc = await sb.from('clientes').select('*').eq('id', id).maybeSingle();
  if (rc.error) throw rc.error;
  var vs = await traerTodo('ventas', '*', function (q) { return q.eq('cliente_id', id).neq('estado', 'anulada'); });
  var ids = vs.map(function (v) { return v.id; });
  var cs = [], its = [], costos = [];
  if (ids.length) {
    var r = await Promise.all([
      traerTodo('cuotas', 'id,venta_id,plan,n,tipo,fecha,monto', function (q) { return q.in('venta_id', ids).eq('vigente', true); }),
      traerTodo('venta_items', 'id,venta_id,producto_id,descripcion,cantidad,precio,orden,sede_salida', function (q) { return q.in('venta_id', ids); })
    ]);
    cs = r[0]; its = r[1];
    if (esDueno() && its.length) {
      costos = await traerTodo('venta_item_costos', 'item_id,costo', function (q) { return q.in('item_id', its.map(function (i) { return i.id; })); }, 'item_id');
    }
  }
  var viejas = new Set((ST.ventasPorCliente.get(id) || []).map(function (v) { return v.id; }));
  ids.forEach(function (x) { viejas.add(x); });
  var itemsViejos = new Set(ST.items.filter(function (i) { return viejas.has(i.venta_id); }).map(function (i) { return i.id; }));
  ST.clientes = ST.clientes.filter(function (c) { return c.id !== id; }).concat(rc.data ? [rc.data] : []);
  ST.ventas = ST.ventas.filter(function (v) { return !viejas.has(v.id); }).concat(vs);
  ST.cuotas = ST.cuotas.filter(function (c) { return !viejas.has(c.venta_id); }).concat(cs);
  ST.items = ST.items.filter(function (i) { return !viejas.has(i.venta_id); }).concat(its);
  ST.itemCostos = ST.itemCostos.filter(function (c) { return !itemsViejos.has(c.item_id); }).concat(costos);
  try {
    var extra = await Promise.all([traerGestiones(id), traerUltimosAbonos()]);
    ST.gestiones = ST.gestiones.filter(function (g) { return g.cliente_id !== id; }).concat(extra[0]);
    ST.ultimosAbonos = extra[1];
  } catch (e) { /* se actualiza en la próxima carga */ }
  indexar();
  guardarCache();
}
async function recargarConfig() {
  var r = await Promise.all([
    sb.from('config').select('*').eq('id', 1).single().then(_uno),
    traerTodo('metodos_pago', '*', null, 'orden'),
    traerTodo('usuarios', 'id,usuario,nombre,rol,sede,activo', null, 'nombre')
  ]);
  ST.cfg = r[0]; ST.metodos = r[1]; ST.usuarios = r[2];
  indexar();
  guardarCache();
}
async function recargarProductos() {
  var r = await Promise.all([
    traerTodo('productos', 'id,nombre,precio_sugerido,activo,codigo_yumana'),
    esDueno() ? traerTodo('producto_costos', 'producto_id,costo', null, 'producto_id') : Promise.resolve([]),
    traerTodo('existencias', 'producto_id,sede,cantidad', null, 'producto_id,sede')
  ]);
  ST.productos = r[0]; ST.prodCostos = r[1]; ST.existencias = r[2];
  indexar();
  guardarCache();
}

/* ---------------- Cuentas por venta y por cliente ---------------- */
// Abonos que todavía están en la cola (se muestran aparte, nunca se restan de lo que dice la base)
function abonosEnCola(filtro) {
  return Cola.ops.filter(function (o) { return o.tipo === 'abono' && o.uid === (ST.yo && ST.yo.id) && filtro(o.datos); });
}
function enColaDeVenta(ventaId) {
  return abonosEnCola(function (d) { return d.venta_id === ventaId; })
    .reduce(function (s, o) { return s + (Number(o.datos.monto_usd) || 0); }, 0);
}
function enColaDeCliente(cliId) {
  return abonosEnCola(function (d) { return d.cliente_id === cliId; })
    .reduce(function (s, o) { return s + (Number(o.datos.monto_usd) || 0); }, 0);
}
function estadoDe(v) {
  var e = _estados.get(v.id);
  if (!e) {
    e = Cuentas.estadoVenta(v, ST.cuotasPorVenta.get(v.id) || [], hoyCaracas());
    _estados.set(v.id, e);
  }
  return e;
}
function ventasActivas(cliId) {
  return (ST.ventasPorCliente.get(cliId) || []).filter(function (v) { return v.estado === 'activa'; });
}
// Resumen de lo que debe un cliente (todas sus ventas activas)
function resumenCliente(cliId) {
  var r = { saldo: 0, atraso: 0, dias: 0, proxima: null, siguiente: null, activas: 0, retirada: false, plazoVencido: false, cuotasVencidas: 0 };
  ventasActivas(cliId).forEach(function (v) {
    var e = estadoDe(v);
    r.activas++;
    r.saldo += e.saldo;
    r.atraso += e.atraso;
    r.dias = Math.max(r.dias, e.diasAtraso);
    r.cuotasVencidas += e.cuotas.filter(function (c) { return c.vencida; }).length;
    if (v.mercancia === 'retirada') r.retirada = true;
    if (e.plazoVencido) r.plazoVencido = true;
    if (e.proxima && (!r.proxima || e.proxima.fecha < r.proxima.fecha)) r.proxima = e.proxima;
    if (e.siguiente && (!r.siguiente || e.siguiente.fecha < r.siguiente.fecha)) r.siguiente = e.siguiente;
  });
  r.saldo = redondear2(r.saldo); r.atraso = redondear2(r.atraso);
  r.enCola = redondear2(enColaDeCliente(cliId));
  r.ultimoAbono = ST.ultimoAbono.get(cliId) || null;
  r.promesa = promesaDe(cliId);
  r.ultimaNota = (ST.gestionesPorCliente.get(cliId) || [])[0] || null;
  return r;
}

// La última promesa de pago (de los últimos 30 días) y si ya pagó después de prometer.
// estado: 'pendiente' (todavía no llega la fecha o es hoy), 'incumplida' (pasó la fecha sin abonar)
function promesaDe(cliId) {
  var hoy = hoyCaracas(), hace30 = sumarDias(hoy, -30);
  var p = (ST.gestionesPorCliente.get(cliId) || []).find(function (g) { return g.tipo === 'promesa' && g.promesa_fecha >= hace30; });
  if (!p) return null;
  var ult = ST.ultimoAbonoEn.get(cliId);
  if (ult && new Date(ult) > new Date(p.hecho_en || p.creado_en)) return null;    // ya abonó después de prometer
  if (enColaDeCliente(cliId) > 0) return null;
  return { fecha: p.promesa_fecha, monto: p.promesa_monto != null ? Number(p.promesa_monto) : null, nota: p.nota,
           estado: p.promesa_fecha >= hoy ? 'pendiente' : 'incumplida' };
}
function textoPromesa(pr) {
  if (!pr) return '';
  var m = pr.monto ? fmtUSD(pr.monto) + ' ' : '';
  if (pr.estado === 'incumplida') return 'No cumplió la promesa del ' + fmtFecha(pr.fecha);
  return 'Prometió ' + m + (pr.fecha === hoyCaracas() ? 'hoy' : 'el ' + fmtFecha(pr.fecha));
}
function descripcionVenta(v) {
  var its = ST.itemsPorVenta.get(v.id) || [];
  if (!its.length) return 'Venta #' + v.numero;
  var t = its.map(function (i) { return (i.cantidad > 1 ? i.cantidad + ' ' : '') + i.descripcion; }).join(', ');
  return t.length > 70 ? t.slice(0, 68) + '…' : t;
}
function textoFrecuencia(f, n) {
  var m = { semanal: ['semanal', 'semanales'], quincenal: ['quincenal', 'quincenales'], mensual: ['mensual', 'mensuales'],
            personalizada: ['personalizada', 'personalizadas'], contado: ['de contado', 'de contado'] }[f] || [f, f];
  return n === 1 ? m[0] : m[1];
}

/* ---------------- Cola de envío ---------------- */
// Cada operación: {clave, tipo: cliente|venta|abono|foto, datos, uid, creado, estado: pendiente|error, error, resumen}
var Cola = {
  ops: [],
  procesando: false,
  esperas: new Map(),
  _timer: null,

  async cargar() {
    try { this.ops = (await BD.todos('cola')) || []; } catch (e) { console.warn('Sin cola en el teléfono', e); this.ops = []; }
    this.ops.sort(function (a, b) { return a.creado - b.creado; });
    pintarCola();
  },
  mias() { var uid = ST.yo && ST.yo.id; return this.ops.filter(function (o) { return o.uid === uid; }); },
  async guardar(op) {
    try { await BD.put('cola', op); return true; } catch (e) {
      // No se pierde mientras la app siga abierta (está en la memoria y se envía apenas haya señal), pero hay que avisar
      console.warn('No se guardó en el teléfono', e);
      toast('Atención: el teléfono no pudo guardar lo que está por enviar. No cierres la app hasta que vuelva la señal y se envíe.', 'error', 12000);
      return false;
    }
  },
  async agregar(op) {
    op.uid = ST.yo.id; op.creado = Date.now(); op.estado = 'pendiente'; op.intentos = 0;
    this.ops.push(op);
    await this.guardar(op);
    pintarCola();
  },
  async quitar(clave) {
    this.ops = this.ops.filter(function (o) { return o.clave !== clave; });
    try { await BD.del('cola', clave); await BD.del('fotos', clave); } catch (e) { /* nada */ }
    pintarCola();
  },
  avisar(clave, err, res) {
    var w = this.esperas.get(clave);
    if (!w) return;
    this.esperas.delete(clave);
    if (err) w.error(err); else w.ok(res);
  },
  programar() {
    clearTimeout(this._timer);
    var self = this;
    if (this.mias().some(function (o) { return o.estado === 'pendiente'; })) {
      this._timer = setTimeout(function () { self.procesar(); }, 20000);
    }
  },
  async procesar() {
    if (this.procesando || !ST.yo) return;
    this.procesando = true;
    var huboExito = false;
    try {
      while (true) {
        var uid = ST.yo && ST.yo.id;
        var op = this.ops.find(function (o) { return o.estado === 'pendiente' && o.uid === uid; });
        if (!op) break;
        try {
          var res = await enviarOp(op);
          await this.quitar(op.clave);
          huboExito = true;
          this.avisar(op.clave, null, res);
          alTerminarOp(op, res);
        } catch (e) {
          if (esErrorDeRed(e)) {
            op.intentos++;
            await this.guardar(op);
            this.avisar(op.clave, 'red');
            break;
          }
          console.warn('Operación rechazada', op, e);
          op.estado = 'error'; op.error = errMsg(e); op.codigo = e.code || null;
          await this.guardar(op);
          this.avisar(op.clave, e);
        }
      }
    } finally {
      this.procesando = false;
      pintarCola();
      this.programar();
      if (huboExito) actualizarConexion(true);
    }
  }
};

// Agrega la operación y espera un rato su resultado. Si no hay señal, queda guardada en el teléfono.
// Devuelve {estado: 'ok', resultado} o {estado: 'pendiente'}; si la base la rechaza, lanza el error
// (y la operación se quita de la cola para que se corrija).
function enviarYEsperar(op, ms) {
  return new Promise(function (resolve, reject) {
    var t = setTimeout(function () { Cola.esperas.delete(op.clave); resolve({ estado: 'pendiente' }); }, ms || 15000);
    Cola.esperas.set(op.clave, {
      ok: function (res) { clearTimeout(t); resolve({ estado: 'ok', resultado: res }); },
      error: function (e) {
        clearTimeout(t);
        if (e === 'red') { resolve({ estado: 'pendiente' }); return; }
        Cola.quitar(op.clave).then(function () { reject(e); });
      }
    });
    Cola.agregar(op).then(function () { Cola.procesar(); });
  });
}

// Sin sesión vigente (el permiso de 1 hora venció y no hubo señal para renovarlo) la base respondería
// "sin permiso" y la operación se daría por rechazada: se espera, como si no hubiera señal.
async function sesionLista() {
  var s = await sb.auth.getSession();
  if (!(s.data && s.data.session)) { var e = new Error('Sin señal para renovar la sesión'); e.esTiempo = true; throw e; }
}

async function enviarOp(op) {
  await sesionLista();
  if (op.tipo === 'cliente') return rpc('guardar_cliente', { p: op.datos, p_clave: op.clave }, 25000);
  if (op.tipo === 'venta') return rpc('registrar_venta', { p: op.datos, p_clave: op.clave }, 25000);
  if (op.tipo === 'abono') return rpc('registrar_abono', { p: op.datos, p_clave: op.clave }, 25000);
  if (op.tipo === 'gestion') return rpc('registrar_gestion', { p: op.datos, p_clave: op.clave }, 25000);
  if (op.tipo === 'foto') return subirFotoOp(op);
  if (op.tipo === 'firma') return subirFirmaOp(op);
  throw { code: 'EM000', message: 'Operación desconocida' };
}

// Foto en cola: se sube al bucket privado (cli/<cliente>/...) y luego se anota en el registro
async function subirFotoOp(op) {
  var cli = op.cliente_id;
  if (!cli && op.cliente_clave) {
    var r = await rpc('resolver_clave', { p_clave: op.cliente_clave });
    if (!r || !r.id) throw { code: 'EM404', message: 'No se encontró el cliente de esta foto.' };
    cli = r.id;
  }
  var ruta = 'cli/' + cli + '/' + op.nombre;
  if (!op.subida) {
    var blob = await BD.get('fotos', op.clave);
    if (!blob) throw { code: 'EM404', message: 'La foto ya no está en el teléfono.' };
    await subirAlBucket(ruta, blob);
    op.subida = true;
    await Cola.guardar(op);
  }
  var pid = op.ref_id || ((op.tipo_foto === 'cliente' || op.tipo_foto === 'cedula') ? cli : null);
  await rpc('poner_foto', { p_tipo: op.tipo_foto, p_id: pid, p_clave: pid ? null : (op.ref_clave || null), p_ruta: ruta }, 25000);
  return { ruta: ruta, cliente_id: cli };
}

// Sube una imagen al bucket privado. Si ya estaba (un reintento), sigue sin error.
async function subirAlBucket(ruta, blob) {
  // Con el internet muy lento la subida puede quedarse colgada: a los 90 s se deja para el próximo intento
  // (si en verdad subió, el reintento la encuentra y sigue).
  var t, tiempo = new Promise(function (_, rej) { t = setTimeout(function () { var e = new Error('Se agotó el tiempo de espera'); e.esTiempo = true; rej(e); }, 90000); });
  var up;
  try { up = await Promise.race([sb.storage.from('fotos').upload(ruta, blob, { contentType: 'image/jpeg', upsert: false }), tiempo]); }
  finally { clearTimeout(t); }
  if (up.error) {
    var msg = String(up.error.message || '');
    var st = Number(up.error.statusCode || up.error.status || 0);
    if (/already exists|duplicate/i.test(msg) || st === 409) return;   // ya estaba subida
    if (st === 401 || /jwt|token|unauthorized/i.test(msg)) { var e = new Error(msg); e.esTiempo = true; throw e; }   // sesión por renovar: se reintenta
    if (st >= 400 && st < 500) throw { code: 'EM4XX', message: 'No se pudo subir la imagen: ' + msg };
    throw up.error;
  }
}

// Firma del contrato en cola: sube las firmas (cliente y fiador) y luego la anota en la venta
async function subirFirmaOp(op) {
  var cli = op.cliente_id;
  if (!cli && op.cliente_clave) {
    var rc = await rpc('resolver_clave', { p_clave: op.cliente_clave });
    if (!rc || !rc.id) throw { code: 'EM404', message: 'No se encontró el cliente de esta firma.' };
    cli = rc.id;
  }
  var rutas = {}, imgs = null;
  op.subidas = op.subidas || {};
  for (var k in op.nombres) {
    if (!op.nombres[k]) continue;
    rutas[k] = 'cli/' + cli + '/' + op.nombres[k];
    if (op.subidas[k]) continue;
    imgs = imgs || await BD.get('fotos', op.clave);
    if (!imgs || !imgs[k]) throw { code: 'EM404', message: 'La firma ya no está en el teléfono.' };
    await subirAlBucket(rutas[k], imgs[k]);
    op.subidas[k] = true;
    await Cola.guardar(op);
  }
  var d = { firma_cliente: rutas.cliente, firma_fiador: rutas.fiador || null, condiciones: op.condiciones, hecho_en: op.hecho_en, reemplazar: !!op.reemplazar };
  if (op.venta_id) d.venta_id = op.venta_id; else d.venta_clave = op.venta_clave;
  return rpc('firmar_venta', { p: d, p_clave: op.clave }, 25000);
}
function firmaEnCola(ventaId, ventaClave) {
  return Cola.mias().find(function (o) { return o.tipo === 'firma' && ((ventaId && o.venta_id === ventaId) || (ventaClave && o.venta_clave === ventaClave)); }) || null;
}

// Agrega una foto a la cola (se guarda en el teléfono hasta que sube)
async function encolarFoto(blob, o) {
  var clave = nuevaClave();
  try { await BD.put('fotos', blob, clave); } catch (e) { toast('No se pudo guardar la foto en el teléfono.', 'error'); return; }
  var op = {
    clave: clave, tipo: 'foto', tipo_foto: o.tipo, cliente_id: o.cliente_id || null, cliente_clave: o.cliente_clave || null,
    ref_id: o.ref_id || null, ref_clave: o.ref_clave || null,
    nombre: o.tipo + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + '.jpg',
    resumen: { texto: 'Foto (' + ({ cliente: 'cliente', cedula: 'cédula', contrato: 'contrato', comprobante: 'comprobante' }[o.tipo]) + ') de ' + (o.nombreCliente || 'cliente') }
  };
  await Cola.agregar(op);
  Cola.procesar();
}

var _clientesPorRecargar = new Set();
var _recargarPendientes = debounce(async function () {
  var ids = Array.from(_clientesPorRecargar); _clientesPorRecargar.clear();
  try {
    for (var i = 0; i < ids.length; i++) await recargarCliente(ids[i]);
    if (ids.length) repintar();
  } catch (e) { console.warn('No se pudo actualizar', e); }
}, 600);
function alTerminarOp(op, res) {
  var cli = res && (res.cliente_id || (op.tipo === 'cliente' ? res.id : null));
  if (cli) { _clientesPorRecargar.add(Number(cli)); _recargarPendientes(); }
  if (op.tipo === 'venta') recargarProductos().catch(function () {});
}

/* ---------------- Conexión ---------------- */
var _enLinea = true;
function actualizarConexion(ok) {
  _enLinea = ok;
  pintarCola();
}
window.addEventListener('online', function () { actualizarConexion(true); Cola.procesar(); });
window.addEventListener('offline', function () { actualizarConexion(false); });
