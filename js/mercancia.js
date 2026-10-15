// Electro Montana — mercancía de las tiendas: existencia, entradas, conteos y movimientos de cada producto.
// Lo que se vende y se busca en Yumana después no pasa por aquí; esto es lo que está guardado en una tienda.
'use strict';

var NOMBRE_MOV = { entrada: 'Entrada', venta: 'Venta', retiro: 'Volvió de un cliente', ajuste: 'Conteo', anulacion: 'Venta anulada' };

var VistaMercancia = (function () {
  var raiz = null, sede = 'pedraza', busca = '', verTodo = false;

  function mostrar(c) {
    raiz = document.createElement('div');
    c.appendChild(raiz);
    if (!esDueno()) sede = ST.yo.sede || 'pedraza';
    raiz.innerHTML =
      (esDueno() ? '<div class="seg" id="mcSede"><button type="button" data-s="pedraza">Tienda de Pedraza</button><button type="button" data-s="socopo">Socopó</button></div>' : '') +
      '<div class="kpis" id="mcKpis" style="margin-top:12px"></div>' +
      (esDueno() ? '<button type="button" class="btn btn-ancho" id="mcEntrada" style="margin-top:12px">' + icono('caja') + 'Entrada de mercancía</button>' : '') +
      '<div class="buscador" style="margin-top:12px">' + icono('buscar') + '<input id="mcBusca" type="search" placeholder="Buscar producto" value="' + esc(busca) + '"></div>' +
      '<label class="casilla" style="margin-top:6px"><input type="checkbox" id="mcTodo"' + (verTodo ? ' checked' : '') + '> Ver también lo que no hay</label>' +
      '<div id="mcLista" class="lista" style="margin-top:10px"></div>';
    var seg = $('#mcSede', raiz);
    if (seg) seg.addEventListener('click', function (e) {
      var b = e.target.closest('[data-s]'); if (!b) return;
      sede = b.dataset.s; pintar();
    });
    $('#mcBusca', raiz).addEventListener('input', debounce(function (e) { busca = e.target.value; pintar(); }, 200));
    $('#mcTodo', raiz).addEventListener('change', function () { verTodo = this.checked; pintar(); });
    if (esDueno()) $('#mcEntrada', raiz).addEventListener('click', function () { hojaEntrada(sede); });
    raiz.addEventListener('click', function (e) {
      var b = e.target.closest('[data-prod]');
      if (b) hojaProducto(Number(b.dataset.prod), sede);
    });
    pintar();
    recargarExistencias().then(pintar).catch(function () {});
  }

  function pintar() {
    if (!raiz || !raiz.isConnected) return;
    var seg = $('#mcSede', raiz);
    if (seg) $$('button', seg).forEach(function (x) { x.classList.toggle('activo', x.dataset.s === sede); });
    var dueno = esDueno(), unidades = 0, nProd = 0, valorCosto = 0, valorPrecio = 0, sinCosto = 0;
    ST.productos.forEach(function (p) {
      var n = existenciaDe(p.id, sede);
      if (n <= 0) return;
      unidades += n; nProd++;
      if (p.precio_sugerido != null) valorPrecio += n * Number(p.precio_sugerido);
      var c = ST.costoProducto.get(p.id);
      if (c != null) valorCosto += n * c; else sinCosto++;
    });
    $('#mcKpis', raiz).innerHTML =
      '<div class="kpi"><div class="etq">En la tienda</div><div class="val">' + unidades + '</div><div class="sub">' + plural(nProd, 'producto', 'productos') + '</div></div>' +
      (dueno ? '<div class="kpi"><div class="etq">Vale (costo)</div><div class="val">' + fmtUSD(valorCosto) + '</div><div class="sub">' + (sinCosto ? sinCosto + ' sin costo' : 'a precio de Yumana') + '</div></div>'
             : '<div class="kpi"><div class="etq">Vale (venta)</div><div class="val">' + fmtUSD(valorPrecio) + '</div><div class="sub">a precio sugerido</div></div>');
    var q = normalizar(busca.trim()), palabras = q ? q.split(/\s+/) : [];
    var lista = ST.productos.filter(function (p) {
      var n = existenciaDe(p.id, sede);
      if (!verTodo && n <= 0) return false;
      if (!p.activo && n <= 0) return false;
      var nom = normalizar(p.nombre + ' ' + (p.codigo_yumana || ''));
      return palabras.every(function (w) { return nom.indexOf(w) >= 0; });
    }).sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
    var cont = $('#mcLista', raiz);
    cont.innerHTML = '';
    if (!lista.length) {
      cont.innerHTML = '<div class="vacio">' + icono('caja') + '<p>' + (q ? 'No hay productos con ese nombre.' :
        'No hay mercancía guardada en ' + (sede === 'pedraza' ? 'la tienda de Pedraza' : 'Socopó') + '.') + '</p>' +
        (dueno && !q ? '<p class="tenue chico">Cuando lleven mercancía a la tienda, anótala con "Entrada de mercancía".</p>' : '') + '</div>';
      return;
    }
    dibujarPorPartes(cont, lista, function (p) {
      var n = existenciaDe(p.id, sede), c = ST.costoProducto.get(p.id);
      var sub = [p.precio_sugerido != null ? 'Precio ' + fmtUSD(p.precio_sugerido) : 'Sin precio sugerido', dueno && c != null ? 'costo ' + fmtUSD(c) : '',
                 p.activo ? '' : 'ya no se vende'].filter(Boolean).join(' · ');
      return '<button type="button" class="item" data-prod="' + p.id + '"><div class="crece"><div class="item-tit">' + esc(p.nombre) + '</div>' +
        '<div class="item-sub">' + esc(sub) + '</div></div>' +
        '<div class="item-der"><div class="monto' + (n <= 0 ? ' tenue' : '') + '">' + n + '</div><div class="tenue chico">' + (n === 1 ? 'unidad' : 'unidades') + '</div></div></button>';
    });
  }

  return { mostrar: mostrar, refrescar: pintar };
})();

// Ficha de un producto: cuánto hay en cada tienda y todo lo que ha entrado y salido
function hojaProducto(id, sedeActual) {
  var p = ST.productos.find(function (x) { return x.id === id; });
  if (!p) return;
  var dueno = esDueno();
  var h = abrirHoja({ titulo: p.nombre, completa: true, html: '' });
  var movs = null, error = null;
  function pintar() {
    var c = ST.costoProducto.get(p.id), sedes = dueno ? ['pedraza', 'socopo'] : [ST.yo.sede];
    var html = '<div class="deuda-caja">' + sedes.map(function (sd) {
        return '<div><div class="tenue chico">' + (sd === 'pedraza' ? 'Tienda de Pedraza' : 'Socopó') + '</div><div class="monto-grande">' + existenciaDe(p.id, sd) + '</div></div>';
      }).join('') + '</div>' +
      '<div class="tarjeta" style="margin-top:12px">' +
        '<div class="dato"><span>Precio sugerido</span><span class="crece">' + (p.precio_sugerido != null ? fmtUSD(p.precio_sugerido) : '—') + '</span></div>' +
        (dueno ? '<div class="dato"><span>Costo</span><span class="crece">' + (c != null ? fmtUSD(c) : 'Sin anotar') + '</span></div>' : '') +
        (dueno && c != null && p.precio_sugerido != null ? '<div class="dato"><span>Ganancia</span><span class="crece">' + fmtUSD(p.precio_sugerido - c) + ' por unidad</span></div>' : '') +
        (p.codigo_yumana ? '<div class="dato"><span>Código Yumana</span><span class="crece">' + esc(p.codigo_yumana) + '</span></div>' : '') +
        (p.activo ? '' : '<div class="dato"><span>Estado</span><span class="crece">Ya no se vende</span></div>') +
      '</div>' +
      (dueno ? '<div class="botonera" style="margin-top:12px">' +
        '<button type="button" class="btn btn-sec" data-contar>' + icono('check', 'ic-chico') + 'Contar</button>' +
        '<button type="button" class="btn btn-sec" data-editar-prod>' + icono('editar', 'ic-chico') + 'Editar</button></div>' : '') +
      '<div class="seccion"><div class="seccion-tit"><h2>Movimientos</h2></div>';
    if (error) html += '<p class="tenue">' + icono('sinsenal', 'ic-chico') + ' ' + esc(error) + '</p>';
    else if (!movs) html += '<div class="cargando">Cargando…</div>';
    else if (!movs.length) html += '<p class="tenue">Todavía no ha entrado ni salido nada.</p>';
    else html += '<div class="lista">' + movs.slice(0, 60).map(function (m) {
      var v = m.venta_id ? ST.ventaPorId.get(m.venta_id) : null, cli = v ? ST.cliPorId.get(v.cliente_id) : null;
      return '<div class="item"' + (cli ? ' data-cli="' + cli.id + '"' : ' style="cursor:default"') + '><div class="crece">' +
        '<div class="item-tit">' + esc(NOMBRE_MOV[m.tipo] || m.tipo) + (cli ? ' · ' + esc(cli.nombre) : v ? ' · venta #' + v.numero : '') + '</div>' +
        '<div class="item-sub">' + esc(fmtFechaHora(m.creado_en)) + ' · ' + esc(nombreSede(m.sede)) + ' · ' + esc(nombreUsuario(m.usuario_id)) + '</div>' +
        (m.nota ? '<div class="item-sub">' + esc(m.nota) + '</div>' : '') + '</div>' +
        '<div class="item-der"><div class="monto" style="color:' + (m.cantidad > 0 ? 'var(--verde)' : 'var(--rojo)') + '">' + (m.cantidad > 0 ? '+' : '−') + Math.abs(m.cantidad) + '</div>' +
        '<div class="tenue chico">quedan ' + m.queda + '</div></div></div>';
    }).join('') + '</div>';
    h.cuerpo.innerHTML = html + '</div>';
  }
  async function cargar() {
    try {
      movs = await traerTodo('movimientos_inventario', '*', function (q) { return q.eq('producto_id', id); });
      movs.sort(function (a, b) { return b.id - a.id; });
      error = null;
    } catch (e) { error = errMsg(e); }
    if (!h.cerrado) pintar();
  }
  h.cuerpo.addEventListener('click', async function (e) {
    var b = e.target.closest('[data-cli]');
    if (b) { h.cerrar(); ir('cliente', b.dataset.cli); return; }
    if (e.target.closest('[data-contar]')) {
      var cuenta = await hojaContar(p, sedeActual);
      if (cuenta) { pintar(); cargar(); }
      return;
    }
    if (e.target.closest('[data-editar-prod]')) {
      var cambio = await hojaEditarProducto(p);
      if (cambio) { p = ST.productos.find(function (x) { return x.id === id; }) || p; h.el.querySelector('.hoja-cab h2').textContent = p.nombre; pintar(); }
    }
  });
  pintar();
  cargar();
}

// Conteo: se escribe lo que hay de verdad en la tienda y la diferencia queda anotada
function hojaContar(p, sedeInicial) {
  return new Promise(function (resolver) {
    var listo = false, sede = sedeInicial || 'pedraza';
    var h = abrirHoja({
      titulo: 'Contar ' + p.nombre,
      html: '<div class="seg" id="ctSede"><button type="button" data-s="pedraza">Pedraza</button><button type="button" data-s="socopo">Socopó</button></div>' +
        '<p class="tenue" id="ctAhora" style="margin:12px 2px"></p>' +
        '<div class="pila"><label class="campo"><span>¿Cuántos hay de verdad?</span><input id="ctN" inputmode="numeric"></label>' +
        '<label class="campo"><span>Por qué cambia</span><input id="ctNota" value="Conteo del ' + esc(fmtFechaAnio(hoyCaracas())) + '"></label></div>',
      pie: '<button type="button" class="btn btn-ancho" id="ctGuardar">Guardar conteo</button>',
      alCerrar: function () { if (!listo) resolver(false); }
    });
    function marcar() {
      $$('#ctSede button', h.el).forEach(function (x) { x.classList.toggle('activo', x.dataset.s === sede); });
      h.$('#ctAhora').textContent = 'Según el sistema hay ' + existenciaDe(p.id, sede) + ' en ' + (sede === 'pedraza' ? 'la tienda de Pedraza' : 'Socopó') + '.';
      h.$('#ctN').value = existenciaDe(p.id, sede);
    }
    h.$('#ctSede').addEventListener('click', function (e) { var b = e.target.closest('[data-s]'); if (b) { sede = b.dataset.s; marcar(); } });
    protegerBoton(h.$('#ctGuardar'), async function () {
      var n = parseInt(h.$('#ctN').value, 10), nota = h.$('#ctNota').value.trim();
      if (isNaN(n) || n < 0) { toast('Escribe cuántos hay', 'error'); return; }
      if (!nota) { toast('Escribe por qué cambia', 'error'); return; }
      await rpc('ajustar_existencia', { p_producto: p.id, p_sede: sede, p_contado: n, p_nota: nota });
      await recargarExistencias();
      listo = true; h.cerrar(); toast('Conteo guardado', 'ok'); repintar(); resolver(true);
    });
    marcar();
  });
}

// Editar el producto del catálogo (nombre, precio sugerido, costo, código de Yumana, si se sigue vendiendo)
function hojaEditarProducto(p) {
  return new Promise(function (resolver) {
    var listo = false, c = ST.costoProducto.get(p.id);
    var h = abrirHoja({
      titulo: p ? 'Editar producto' : 'Producto nuevo',
      html: '<div class="pila"><label class="campo"><span>Nombre</span><input id="epNombre" value="' + esc(p.nombre) + '"></label>' +
        '<div class="dos"><label class="campo"><span>Precio sugerido $</span><input id="epPrecio" inputmode="decimal" value="' + esc(numCampo(p.precio_sugerido)) + '"></label>' +
        '<label class="campo"><span>Costo $</span><input id="epCosto" inputmode="decimal" value="' + esc(numCampo(c)) + '"></label></div>' +
        '<label class="campo"><span>Código en Yumana (opcional)</span><input id="epCodigo" value="' + esc(p.codigo_yumana || '') + '"></label>' +
        '<label class="casilla"><input type="checkbox" id="epActivo"' + (p.activo ? ' checked' : '') + '> Se sigue vendiendo (sale en las sugerencias)</label></div>',
      pie: '<button type="button" class="btn btn-ancho" id="epGuardar">Guardar</button>',
      alCerrar: function () { if (!listo) resolver(false); }
    });
    protegerBoton(h.$('#epGuardar'), async function () {
      var nombre = h.$('#epNombre').value.trim(), precio = h.$('#epPrecio').value.trim(), costo = h.$('#epCosto').value.trim();
      if (!nombre) { toast('Escribe el nombre', 'error'); return; }
      var d = { id: p.id, nombre: nombre, codigo_yumana: h.$('#epCodigo').value.trim(), activo: h.$('#epActivo').checked,
                precio_sugerido: precio ? redondear2(parseNum(precio)) : null };
      if (precio && isNaN(parseNum(precio))) { toast('Revisa el precio', 'error'); return; }
      if (costo) { var cc = parseNum(costo); if (isNaN(cc) || cc < 0) { toast('Revisa el costo', 'error'); return; } d.costo = redondear2(cc); }
      await rpc('guardar_producto', { p: d });
      await recargarProductos();
      listo = true; h.cerrar(); toast('Producto guardado', 'ok'); repintar(); resolver(true);
    });
  });
}

// Entrada de mercancía a una tienda (lo que traen de Yumana para tener guardado)
function hojaEntrada(sedeInicial) {
  var sede = sedeInicial || 'pedraza', clave = nuevaClave();
  var filas = [{ nombre: '', producto_id: null, cantidad: 1, costo: null, precio: null }];
  var h = abrirHoja({
    titulo: 'Entrada de mercancía', completa: true,
    html: '<div class="seg" id="emSede"><button type="button" data-s="pedraza">Tienda de Pedraza</button><button type="button" data-s="socopo">Socopó</button></div>' +
      '<div id="emFilas" style="margin-top:12px"></div>' +
      '<button type="button" class="btn btn-sec btn-ancho" id="emMas" style="margin-top:10px">' + icono('mas') + 'Agregar otro producto</button>' +
      '<label class="campo" style="margin-top:12px"><span>Nota (opcional)</span><input id="emNota" placeholder="Ej.: factura de Yumana N° 1234"></label>' +
      '<div class="total-linea" style="margin-top:12px"><span class="fuerte">Total a costo</span><span class="monto" id="emTotal">$0,00</span></div>',
    pie: '<button type="button" class="btn btn-ancho" id="emGuardar">Guardar entrada</button>'
  });
  function marcarSede() { $$('#emSede button', h.el).forEach(function (x) { x.classList.toggle('activo', x.dataset.s === sede); }); }
  function total() {
    var t = filas.reduce(function (s, f) { return s + (f.costo != null ? f.costo * f.cantidad : 0); }, 0);
    h.$('#emTotal').textContent = fmtUSD(t);
  }
  function pintarFilas() {
    var cont = h.$('#emFilas');
    cont.innerHTML = filas.map(function (f, i) {
      return '<div class="prod" data-i="' + i + '">' +
        '<div class="fila"><label class="campo crece"><span>Producto</span><input data-c="nombre" value="' + esc(f.nombre) + '" placeholder="Ej.: Licuadora Oster" autocomplete="off"></label>' +
          (filas.length > 1 ? '<button type="button" class="btn btn-plano btn-icono" data-quitar aria-label="Quitar" style="margin-top:22px">' + icono('basura') + '</button>' : '') + '</div>' +
        '<div data-sug></div>' +
        '<div class="tres" style="margin-top:10px">' +
          '<label class="campo"><span>Cantidad</span><input data-c="cantidad" inputmode="numeric" value="' + f.cantidad + '"></label>' +
          '<label class="campo"><span>Costo $</span><input data-c="costo" inputmode="decimal" value="' + esc(numCampo(f.costo)) + '"></label>' +
          '<label class="campo"><span>Precio $</span><input data-c="precio" inputmode="decimal" value="' + esc(numCampo(f.precio)) + '"></label></div>' +
        (f.producto_id ? '<p class="tenue chico" style="margin:6px 2px 0">Ya hay ' + existenciaDe(f.producto_id, sede) + ' en la tienda.</p>' : (f.nombre.trim() ? '<p class="tenue chico" style="margin:6px 2px 0">Producto nuevo: se agrega al catálogo.</p>' : '')) +
        '</div>';
    }).join('');
    $$('.prod', cont).forEach(function (el) {
      var i = Number(el.dataset.i), f = filas[i];
      $$('input[data-c]', el).forEach(function (inp) {
        inp.addEventListener('input', function () {
          var k = inp.dataset.c;
          if (k === 'nombre') { f.nombre = inp.value; f.producto_id = null; sugerir(el, f); }
          else if (k === 'cantidad') { var n = parseInt(inp.value, 10); f.cantidad = n > 0 ? n : 1; }
          else { var v = parseNum(inp.value); f[k] = isNaN(v) ? null : v; }
          total();
        });
      });
      var q = $('[data-quitar]', el);
      if (q) q.onclick = function () { filas.splice(i, 1); pintarFilas(); };
    });
    total();
  }
  function sugerir(el, f) {
    var cont = $('[data-sug]', el), q = normalizar(f.nombre.trim());
    if (q.length < 2) { cont.innerHTML = ''; return; }
    var palabras = q.split(/\s+/);
    var lista = ST.productos.filter(function (p) {
      var n = normalizar(p.nombre);
      return palabras.every(function (w) { return n.indexOf(w) >= 0; });
    }).slice(0, 5);
    cont.innerHTML = lista.length ? '<div class="sugerencias">' + lista.map(function (p) {
      return '<button type="button" data-p="' + p.id + '">' + esc(p.nombre) + ' <span class="tenue">· hay ' + existenciaDe(p.id, sede) + '</span></button>';
    }).join('') + '</div>' : '';
    cont.onclick = function (e) {
      var b = e.target.closest('[data-p]'); if (!b) return;
      var p = ST.productos.find(function (x) { return x.id === Number(b.dataset.p); });
      f.nombre = p.nombre; f.producto_id = p.id;
      if (f.costo == null && ST.costoProducto.has(p.id)) f.costo = ST.costoProducto.get(p.id);
      if (f.precio == null && p.precio_sugerido != null) f.precio = Number(p.precio_sugerido);
      pintarFilas();
    };
  }
  h.$('#emSede').addEventListener('click', function (e) { var b = e.target.closest('[data-s]'); if (b) { sede = b.dataset.s; marcarSede(); pintarFilas(); } });
  h.$('#emMas').addEventListener('click', function () {
    filas.push({ nombre: '', producto_id: null, cantidad: 1, costo: null, precio: null });
    pintarFilas();
    var ins = h.$$('#emFilas [data-c="nombre"]');
    if (ins.length) ins[ins.length - 1].focus();
  });
  protegerBoton(h.$('#emGuardar'), async function () {
    var items = [];
    for (var i = 0; i < filas.length; i++) {
      var f = filas[i];
      if (!f.nombre.trim()) { toast('Escribe el nombre del producto ' + (i + 1), 'error'); return; }
      var x = { producto_id: f.producto_id, nombre: f.nombre.trim(), cantidad: f.cantidad };
      if (f.costo != null) x.costo = redondear2(f.costo);
      if (f.precio != null) x.precio_sugerido = redondear2(f.precio);
      items.push(x);
    }
    var r = await rpc('entrada_mercancia', { p: { sede: sede, nota: h.$('#emNota').value.trim(), items: items }, p_clave: clave }, 25000);
    h.cerrar();
    toast('Entraron ' + plural(r.unidades, 'unidad', 'unidades') + ' a ' + (sede === 'pedraza' ? 'la tienda de Pedraza' : 'Socopó'), 'ok', 4000);
    try { await recargarProductos(); } catch (e) { /* luego */ }
    repintar();
  });
  marcarSede();
  pintarFilas();
}
