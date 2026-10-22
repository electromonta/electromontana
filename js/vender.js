// Electro Montana — vender a crédito o de contado (y cargar clientes que ya debían antes del sistema).
'use strict';

var VistaVender = (function () {
  var raiz = null, F = null, seguirDeContado = false;   // en la tienda pueden venir varias de contado seguidas

  function nuevoFormulario(tipo) {
    var hoy = hoyCaracas();
    return {
      tipo: tipo || 'nueva', cliente: null, contado: false,   // contado: se paga todo hoy, sin cuotas ni contrato
      items: [{ descripcion: '', cantidad: 1, precio: null, costo: null, producto_id: null, sede: null }],
      inicial: null, pagaInicial: true, metodo: null, refInicial: '',   // el método no viene marcado: se elige siempre
      fecha: hoy, pagadoAntes: null,
      frecuencia: 'semanal', modo: 'numero', numero: 8, cuota: null, primera: Cuentas.primeraSugerida(hoy, 'semanal'), primeraTocada: false,
      personal: null, contratoPapel: '', foto: null, notas: '',
      vendedor: ST.yo.id,   // de quién es el crédito (un dueño lo puede poner a nombre de otro; el empleado vende a su nombre)
      clave: nuevaClave()   // una sola clave por venta: tocar Guardar dos veces no la repite
    };
  }

  function mostrar(c, arg) {
    raiz = document.createElement('div');
    raiz.className = 'formulario';
    c.appendChild(raiz);
    F = nuevoFormulario();
    F.contado = seguirDeContado; seguirDeContado = false;
    if (arg) ponerCliente(arg);
    // "Ya debía" solo lo usan los dueños (lo pagado antes no pasa por el efectivo de nadie)
    raiz.innerHTML =
      '<div class="seg" id="vTipo"' + (esDueno() ? '' : ' hidden') + '><button type="button" data-t="nueva" class="activo">Venta nueva</button><button type="button" data-t="carga">Ya debía</button></div>' +
      '<div class="seg" id="vForma" style="margin-top:10px"><button type="button" data-c="0" class="activo">A crédito</button><button type="button" data-c="1">De contado</button></div>' +
      '<p class="tenue chico" id="vTipoAyuda" style="margin:8px 2px 0"></p>' +
      '<div class="tarjeta" style="margin-top:12px"><div class="paso"><b>1</b><h3>Cliente</h3></div><div id="vCliente"></div><div id="vVendedor"></div></div>' +
      '<div class="tarjeta"><div class="paso"><b>2</b><h3>Lo que se lleva</h3></div><div id="vItems"></div>' +
        '<button type="button" class="btn btn-sec btn-ancho" id="vMasItem" style="margin-top:10px">' + icono('mas') + 'Agregar otro producto</button>' +
        '<div class="total-linea" style="margin-top:12px"><span class="fuerte">Total</span><span class="monto" id="vTotal">$0,00</span></div></div>' +
      '<div class="tarjeta"><div class="paso"><b>3</b><h3 id="vTitInicial">Inicial</h3></div><div id="vInicial"></div></div>' +
      '<div class="tarjeta" id="vCardCuotas"><div class="paso"><b>4</b><h3>Cuotas</h3></div><div id="vCuotas"></div></div>' +
      '<div class="tarjeta" id="vCardContrato"><div class="paso"><b>5</b><h3>Contrato</h3></div><div class="pila">' +
        '<label class="campo"><span>N° del contrato en papel (si tiene)</span><input id="vPapel" inputmode="numeric" placeholder="Ej.: 000412"></label>' +
        '<div class="fotos"><button type="button" class="foto-btn" id="vFoto"><span class="foto-mini">' + icono('camara') + '</span><span>Foto del contrato firmado</span></button></div>' +
        '<label class="campo"><span>Notas</span><textarea id="vNotas" rows="2" placeholder="Algo que haya que recordar de esta venta"></textarea></label>' +
      '</div></div>' +
      '<div class="resumen-fijo"><div id="vResumen" class="tenue chico" style="margin-bottom:8px"></div>' +
        '<button type="button" class="btn btn-ancho" id="vGuardar">Guardar venta</button></div>';

    $('#vTipo', raiz).addEventListener('click', function (e) {
      var b = e.target.closest('[data-t]'); if (!b || b.dataset.t === F.tipo) return;
      F.tipo = b.dataset.t;
      $$('button', this).forEach(function (x) { x.classList.toggle('activo', x === b); });
      if (F.tipo === 'nueva') F.fecha = hoyCaracas();
      if (!F.primeraTocada) F.primera = Cuentas.primeraSugerida(F.tipo === 'carga' ? hoyCaracas() : F.fecha, F.frecuencia);
      pintarTodo();
    });
    $('#vForma', raiz).addEventListener('click', function (e) {
      var b = e.target.closest('[data-c]'); if (!b) return;
      F.contado = b.dataset.c === '1';
      if (!F.contado) { F.inicial = null; F.pagaInicial = true; }
      F.personal = null;
      pintarTodo();
    });
    $('#vMasItem', raiz).addEventListener('click', function () {
      F.items.push({ descripcion: '', cantidad: 1, precio: null, costo: null, producto_id: null, sede: null });
      pintarItems();
      var ins = $$('#vItems [data-campo="descripcion"]', raiz);
      if (ins.length) ins[ins.length - 1].focus();
    });
    $('#vPapel', raiz).addEventListener('input', function () { F.contratoPapel = this.value.trim(); });
    $('#vNotas', raiz).addEventListener('input', function () { F.notas = this.value.trim(); });
    $('#vFoto', raiz).addEventListener('click', async function () {
      var blob = await elegirFoto();
      if (!blob) return;
      F.foto = blob;
      this.querySelector('.foto-mini').outerHTML = '<img class="foto-mini" src="' + URL.createObjectURL(blob) + '" alt="">';
    });
    protegerBoton($('#vGuardar', raiz), guardar);
    pintarTodo();
  }

  function ponerCliente(arg) {
    if (String(arg).indexOf('c-') === 0) {
      var op = Cola.ops.find(function (o) { return o.clave === arg.slice(2); });
      F.cliente = op ? { pendiente: true, clave: op.clave, nombre: op.datos.nombre } : null;
    } else {
      F.cliente = ST.cliPorId.get(Number(arg)) || null;
    }
  }

  function total() {
    return redondear2(F.items.reduce(function (s, i) { return s + (Number(i.cantidad) || 0) * (Number(i.precio) || 0); }, 0));
  }
  function falta() {
    var t = total();
    return redondear2(F.tipo === 'carga' ? t - (Number(F.pagadoAntes) || 0) : t - (Number(F.inicial) || 0));
  }
  function cuotas() {
    if (F.personal) return F.personal;
    var f = falta();
    if (!(f > 0)) return [];
    return Cuentas.generarCuotas({ monto: f, frecuencia: F.frecuencia, primera: F.primera, numero: F.modo === 'numero' ? F.numero : null, cuota: F.modo === 'cuota' ? F.cuota : null });
  }

  function pintarTodo() {
    if (F.tipo === 'carga') F.contado = false;
    var contado = F.contado;
    $('#vForma', raiz).hidden = F.tipo === 'carga';
    $$('#vForma button', raiz).forEach(function (x) { x.classList.toggle('activo', (x.dataset.c === '1') === contado); });
    $('#vTipoAyuda', raiz).textContent = F.tipo === 'carga'
      ? 'Para pasar al sistema a un cliente que ya debía: lo que se llevó, lo que ya pagó y las cuotas que le faltan.'
      : contado ? 'Paga todo hoy: sin cuotas ni contrato. Se le manda el recibo por WhatsApp.' : 'Una venta a crédito de hoy.';
    $('#vTitInicial', raiz).textContent = F.tipo === 'carga' ? 'Lo que ya pagó' : contado ? 'Pago' : 'Inicial';
    $('#vCardCuotas', raiz).hidden = contado;
    $('#vCardContrato', raiz).hidden = contado;
    $('#vGuardar', raiz).textContent = F.tipo === 'carga' ? 'Guardar cliente que ya debía' : contado ? 'Guardar venta de contado' : 'Guardar venta';
    pintarCliente(); pintarVendedor(); pintarItems(); pintarInicial(); pintarCuotas();
  }

  /* ---------- De quién es el crédito (lo eligen los dueños) ---------- */
  function pintarVendedor() {
    var cont = $('#vVendedor', raiz), gente = esDueno() ? personasQueVenden() : [];
    if (gente.length < 2) { cont.innerHTML = ''; return; }
    cont.innerHTML = '<div class="campo" style="margin-top:14px"><span>' + (F.contado ? '¿Quién vendió?' : '¿De quién es este crédito?') + '</span>' +
      '<div class="chips envolver" id="vVendChips">' + gente.map(function (u) {
        return '<button type="button" class="chip' + (u.id === F.vendedor ? ' activo' : '') + '" data-u="' + u.id + '">' + esc(nombreConSede(u)) + '</button>';
      }).join('') + '</div></div>';
    $('#vVendChips', cont).onclick = function (e) {
      var b = e.target.closest('[data-u]'); if (!b) return;
      F.vendedor = b.dataset.u;
      $$('.chip', this).forEach(function (x) { x.classList.toggle('activo', x === b); });
    };
  }

  /* ---------- Cliente ---------- */
  function pintarCliente() {
    var cont = $('#vCliente', raiz), c = F.cliente;
    if (!c) {
      cont.innerHTML = '<button type="button" class="btn btn-azul btn-ancho" data-elegir>' + icono('buscar') + 'Elegir cliente</button>';
    } else {
      var r = c.pendiente ? null : resumenCliente(c.id);
      cont.innerHTML = '<div class="fila"><div class="avatar">' + esc(iniciales(c.nombre)) + '</div><div class="crece"><div class="item-tit">' + esc(c.nombre) + '</div>' +
        '<div class="item-sub">' + (c.pendiente ? 'Cliente nuevo por enviar' : (r.saldo > 0.004 ? 'Ya debe ' + fmtUSD(r.saldo) + (r.atraso > 0 ? ' · atrasado ' + fmtUSD(r.atraso) : '') : 'No debe nada')) + '</div></div>' +
        '<button type="button" class="btn btn-sec btn-chico" data-elegir>Cambiar</button></div>' +
        (c.no_venderle ? '<div class="aviso aviso-error" style="margin-top:10px">' + icono('alerta') + '<div>Marcado para no venderle' + (c.no_venderle_motivo ? ': ' + esc(c.no_venderle_motivo) : '') + '.' + (esDueno() ? '' : ' Habla con Franklin o Daniel.') + '</div></div>' : '') +
        (r && r.atraso > 0 ? '<div class="aviso aviso-ambar" style="margin-top:10px">' + icono('alerta') + '<div>Este cliente está atrasado ' + textoDias(r.dias) + ' en otra venta.</div></div>' : '');
    }
    cont.querySelector('[data-elegir]').onclick = function () {
      hojaElegirCliente(function (ref) { ponerCliente(ref); pintarCliente(); });
    };
  }

  /* ---------- Productos ---------- */
  function pintarItems() {
    var cont = $('#vItems', raiz), dueno = esDueno();
    cont.innerHTML = F.items.map(function (it, i) {
      return '<div class="prod" data-i="' + i + '">' +
        '<div class="fila"><label class="campo crece"><span>Producto</span><input data-campo="descripcion" value="' + esc(it.descripcion) + '" placeholder="Ej.: Nevera Mabe 14 pies" autocomplete="off"></label>' +
          (F.items.length > 1 ? '<button type="button" class="btn btn-plano btn-icono" data-quitar aria-label="Quitar" style="margin-top:22px">' + icono('basura') + '</button>' : '') + '</div>' +
        '<div data-sug></div>' +
        '<div class="' + (dueno ? 'tres' : 'dos') + '" style="margin-top:10px">' +
          '<label class="campo"><span>Cantidad</span><div class="stepper"><button type="button" data-paso="-1">' + icono('menos', 'ic-chico') + '</button>' +
            '<input data-campo="cantidad" inputmode="numeric" value="' + esc(it.cantidad) + '"><button type="button" data-paso="1">' + icono('mas', 'ic-chico') + '</button></div></label>' +
          '<label class="campo"><span>Precio al cliente $</span><input data-campo="precio" inputmode="decimal" value="' + esc(numCampo(it.precio)) + '"></label>' +
          (dueno ? '<label class="campo"><span>Costo $</span><input data-campo="costo" inputmode="decimal" value="' + esc(numCampo(it.costo)) + '"></label>' : '') +
        '</div>' + casillasTienda(it) + '</div>';
    }).join('');
    $$('.prod', cont).forEach(function (el) {
      var i = Number(el.dataset.i), it = F.items[i];
      $$('input[data-campo]', el).forEach(function (inp) {
        inp.addEventListener('input', function () {
          var k = inp.dataset.campo;
          if (k === 'descripcion') { it.descripcion = inp.value; it.producto_id = null; mostrarSugerencias(el, it); }
          else if (k === 'cantidad') { var n = parseInt(inp.value, 10); it.cantidad = n > 0 ? n : 1; }
          else { var v = parseNum(inp.value); it[k] = isNaN(v) ? null : v; }
          actualizarCalculos();
        });
      });
      $$('[data-paso]', el).forEach(function (b) {
        b.addEventListener('click', function () {
          it.cantidad = Math.max(1, (Number(it.cantidad) || 1) + Number(b.dataset.paso));
          $('input[data-campo="cantidad"]', el).value = it.cantidad;
          actualizarCalculos();
        });
      });
      var q = $('[data-quitar]', el);
      if (q) q.onclick = function () { F.items.splice(i, 1); pintarItems(); };
      $$('[data-tienda]', el).forEach(function (chk) {
        chk.addEventListener('change', function () {
          it.sede = chk.checked ? chk.dataset.tienda : null;
          $$('[data-tienda]', el).forEach(function (x) { if (x !== chk) x.checked = false; });
          actualizarCalculos();
        });
      });
    });
    actualizarCalculos();
  }

  // De qué tienda sale (solo si el producto está en el catálogo y hay existencia). Si no se marca, se busca en Yumana.
  function sedesConMercancia(it) {
    if (F.tipo !== 'nueva' || !it.producto_id) return [];
    var sedes = esDueno() ? ['pedraza', 'socopo'] : [ST.yo.sede];
    return sedes.filter(function (sd) { return existenciaDe(it.producto_id, sd) > 0 || it.sede === sd; });
  }
  function casillasTienda(it) {
    var sedes = sedesConMercancia(it);
    if (it.sede && sedes.indexOf(it.sede) < 0) it.sede = null;
    return sedes.map(function (sd) {
      var hay = existenciaDe(it.producto_id, sd), poco = it.sede === sd && hay < (Number(it.cantidad) || 1);
      return '<label class="casilla" style="margin-top:8px"><input type="checkbox" data-tienda="' + sd + '"' + (it.sede === sd ? ' checked' : '') + '> Sale de la tienda de ' +
        nombreSede(sd) + ' <span class="' + (poco ? 'suma-mal' : 'tenue') + '">(hay ' + hay + ')</span></label>';
    }).join('');
  }

  function mostrarSugerencias(el, it) {
    var cont = $('[data-sug]', el), q = normalizar(it.descripcion.trim());
    if (q.length < 2) { cont.innerHTML = ''; return; }
    var palabras = q.split(/\s+/);
    var lista = ST.productos.filter(function (p) {
      var n = normalizar(p.nombre);
      return p.activo && palabras.every(function (w) { return n.indexOf(w) >= 0; }) && normalizar(p.nombre) !== q;
    }).slice(0, 5);
    if (!lista.length) { cont.innerHTML = ''; return; }
    cont.innerHTML = '<div class="sugerencias">' + lista.map(function (p) {
      var costo = ST.costoProducto.get(p.id);
      return '<button type="button" data-p="' + p.id + '">' + esc(p.nombre) +
        (p.precio_sugerido != null ? ' <span class="tenue">· ' + fmtUSD(p.precio_sugerido) + '</span>' : '') +
        (esDueno() && costo != null ? ' <span class="tenue">· costo ' + fmtUSD(costo) + '</span>' : '') + '</button>';
    }).join('') + '</div>';
    cont.onclick = function (e) {
      var b = e.target.closest('[data-p]'); if (!b) return;
      var p = ST.productos.find(function (x) { return x.id === Number(b.dataset.p); });
      it.descripcion = p.nombre; it.producto_id = p.id;
      if (!esDueno() && F.tipo === 'nueva' && existenciaDe(p.id, ST.yo.sede) > 0) it.sede = ST.yo.sede;   // el empleado vende de su tienda
      if (p.precio_sugerido != null && it.precio == null) it.precio = Number(p.precio_sugerido);
      if (esDueno() && it.costo == null && ST.costoProducto.has(p.id)) it.costo = ST.costoProducto.get(p.id);
      pintarItems();
    };
  }

  /* ---------- Inicial / lo que ya pagó ---------- */
  function pintarInicial() {
    var cont = $('#vInicial', raiz);
    if (F.tipo === 'carga') {
      cont.innerHTML = '<div class="pila"><div class="dos">' +
        '<label class="campo"><span>Fecha en que se vendió</span><input type="date" id="vFecha" value="' + esc(F.fecha) + '" max="' + hoyCaracas() + '"></label>' +
        '<label class="campo"><span>Ya ha pagado $</span><input id="vAntes" inputmode="decimal" value="' + esc(numCampo(F.pagadoAntes)) + '" placeholder="0"></label></div>' +
        '<p class="tenue chico" style="margin:0">Todo lo que ha abonado hasta hoy (inicial incluida). Queda anotado como "pagado antes del sistema".</p></div>';
      $('#vFecha', cont).addEventListener('change', function () { F.fecha = this.value || hoyCaracas(); });
      $('#vAntes', cont).addEventListener('input', function () { var v = parseNum(this.value); F.pagadoAntes = isNaN(v) ? null : v; F.personal = null; actualizarCalculos(); });
      return;
    }
    var pct = Number(ST.cfg.inicial_pct) || 0, contado = F.contado;
    var metodos = ST.metodos.filter(function (m) { return m.activo; });
    if (contado) { F.pagaInicial = true; F.inicial = total(); }
    cont.innerHTML = '<div class="pila">' +
      (esDueno() ? '<label class="campo"><span>Fecha de la venta</span><input type="date" id="vFechaN" value="' + esc(F.fecha) + '" max="' + hoyCaracas() + '"></label>' : '') +
      (contado ? '<div class="total-linea"><span class="fuerte">Paga completo</span><span class="monto" id="vPagaTotal">' + fmtUSD(F.inicial) + '</span></div>' +
          '<p class="tenue chico" style="margin:0">¿Cómo pagó?</p>'
        : '<label class="campo"><span>Inicial $ <span class="ayuda" id="vSugerida"></span></span><input id="vInicialMonto" inputmode="decimal" value="' + esc(numCampo(F.inicial)) + '" placeholder="0"></label>' +
          (pct ? '<button type="button" class="btn btn-sec btn-chico" id="vUsarPct">Usar el ' + fmtNum(pct).replace(',00', '') + ' %</button>' : '') +
          '<label class="casilla"><input type="checkbox" id="vPaga"' + (F.pagaInicial ? ' checked' : '') + '> La pagó ahora</label>') +
      '<div id="vPagoCampos" class="pila"' + (F.pagaInicial ? '' : ' hidden') + '>' +
        '<div class="metodos" id="vMetodos">' + metodos.map(function (m) {
          return '<button type="button" class="chip' + (m.id === F.metodo ? ' activo' : '') + '" data-m="' + m.id + '">' + esc(m.nombre) + '</button>';
        }).join('') + '</div>' +
        '<div id="vPagoBs" class="tenue chico"></div>' +
        '<label class="campo" id="vRefCampo"><span>Referencia</span><input id="vRef" value="' + esc(F.refInicial) + '" placeholder="Número de confirmación"></label>' +
      '</div></div>';
    var fn = $('#vFechaN', cont);
    if (fn) fn.addEventListener('change', function () {
      F.fecha = this.value || hoyCaracas();
      if (!F.primeraTocada) { F.primera = Cuentas.primeraSugerida(F.fecha, F.frecuencia); pintarCuotas(); }
    });
    var im = $('#vInicialMonto', cont);
    if (im) im.addEventListener('input', function () { var v = parseNum(this.value); F.inicial = isNaN(v) ? null : v; F.personal = null; actualizarCalculos(); });
    var up = $('#vUsarPct', cont);
    if (up) up.onclick = function () {
      F.inicial = redondear2(total() * pct / 100);
      $('#vInicialMonto', cont).value = numCampo(F.inicial);
      F.personal = null; actualizarCalculos();
    };
    var vp = $('#vPaga', cont);
    if (vp) vp.addEventListener('change', function () { F.pagaInicial = this.checked; $('#vPagoCampos', cont).hidden = !this.checked; actualizarCalculos(); });
    $('#vMetodos', cont).addEventListener('click', function (e) {
      var b = e.target.closest('[data-m]'); if (!b) return;
      F.metodo = Number(b.dataset.m);
      this.classList.remove('falta');
      $$('.chip', this).forEach(function (x) { x.classList.toggle('activo', x === b); });
      actualizarCalculos();
    });
    $('#vRef', cont).addEventListener('input', function () { F.refInicial = this.value.trim(); });
  }

  // Pago de la inicial en la moneda del método (en Bs, con la tasa del día)
  function pagoInicial() {
    var m = metodoPorId(F.metodo), ini = Number(F.inicial) || 0;
    if (!m || !(ini > 0)) return null;
    if (m.moneda === 'USD') return { metodo: m, monto: ini, tasa: null, usd: ini };
    var tasa = Number(ST.cfg.tasa_bs) || 0;
    if (!(tasa > 0)) return { metodo: m, sinTasa: true };
    var bs = redondear2(ini * tasa);
    if (redondear2(bs / tasa) > ini) bs = redondear2(bs - 0.01);
    return { metodo: m, monto: bs, tasa: tasa, usd: redondear2(bs / tasa) };
  }

  /* ---------- Cuotas ---------- */
  function pintarCuotas() {
    var cont = $('#vCuotas', raiz);
    var frecs = [['semanal', 'Semanal'], ['quincenal', 'Quincenal'], ['mensual', 'Mensual'], ['personalizada', 'A mano']];
    cont.innerHTML =
      '<div class="fila-sep"><span class="tenue">Falta por pagar</span><span class="monto" id="vFalta"></span></div>' +
      '<div class="chips" id="vFrec" style="margin-top:10px">' + frecs.map(function (f) {
        var act = F.personal ? f[0] === 'personalizada' : F.frecuencia === f[0];
        return '<button type="button" class="chip' + (act ? ' activo' : '') + '" data-f="' + f[0] + '">' + f[1] + '</button>';
      }).join('') + '</div>' +
      (F.personal ? '<div id="vPers" style="margin-top:12px"></div>' +
          '<button type="button" class="btn btn-sec btn-chico" id="vAgregarCuota" style="margin-top:10px">' + icono('mas', 'ic-chico') + 'Agregar cuota</button>'
        : '<div class="seg" id="vModo" style="margin-top:12px"><button type="button" data-m="numero"' + (F.modo === 'numero' ? ' class="activo"' : '') + '>Cuántas cuotas</button>' +
            '<button type="button" data-m="cuota"' + (F.modo === 'cuota' ? ' class="activo"' : '') + '>Monto de la cuota</button></div>' +
          '<div class="dos" style="margin-top:10px">' +
            (F.modo === 'numero'
              ? '<label class="campo"><span>Número de cuotas</span><input id="vNumero" inputmode="numeric" value="' + esc(F.numero || '') + '"></label>'
              : '<label class="campo"><span>Cada cuota $</span><input id="vCuotaMonto" inputmode="decimal" value="' + esc(numCampo(F.cuota)) + '"></label>') +
            '<label class="campo"><span>' + (F.tipo === 'carga' ? 'Próxima cuota' : 'Primera cuota') + '</span><input type="date" id="vPrimera" value="' + esc(F.primera) + '"></label></div>' +
          '<div id="vVista" style="margin-top:12px"></div>' +
          '<button type="button" class="btn btn-plano btn-chico" id="vEditarCuotas" style="margin-top:6px">' + icono('editar', 'ic-chico') + 'Cambiar fechas o montos a mano</button>') +
      '<div id="vSuma" style="margin-top:8px"></div>';
    $('#vFrec', cont).addEventListener('click', function (e) {
      var b = e.target.closest('[data-f]'); if (!b) return;
      if (b.dataset.f === 'personalizada') {
        if (!F.personal) F.personal = cuotas().map(function (c) { return { fecha: c.fecha, monto: c.monto }; });
        if (!F.personal.length) F.personal = [{ fecha: F.primera, monto: falta() > 0 ? falta() : null }];
      } else {
        F.personal = null;
        F.frecuencia = b.dataset.f;
        if (!F.primeraTocada) F.primera = Cuentas.primeraSugerida(F.tipo === 'carga' ? hoyCaracas() : F.fecha, F.frecuencia);
      }
      pintarCuotas();
    });
    if (F.personal) {
      pintarPersonal();
      $('#vAgregarCuota', cont).onclick = function () {
        var ult = F.personal[F.personal.length - 1];
        F.personal.push({ fecha: ult ? Cuentas.fechaN(ult.fecha, F.frecuencia === 'personalizada' ? 'semanal' : F.frecuencia, 1) : F.primera, monto: null });
        pintarPersonal();
      };
    } else {
      $('#vModo', cont).addEventListener('click', function (e) {
        var b = e.target.closest('[data-m]'); if (!b) return;
        F.modo = b.dataset.m; pintarCuotas();
      });
      var n = $('#vNumero', cont);
      if (n) n.addEventListener('input', function () { var v = parseInt(this.value, 10); F.numero = v > 0 ? Math.min(v, 200) : null; actualizarCalculos(); });
      var cm = $('#vCuotaMonto', cont);
      if (cm) cm.addEventListener('input', function () { var v = parseNum(this.value); F.cuota = v > 0 ? v : null; actualizarCalculos(); });
      $('#vPrimera', cont).addEventListener('change', function () { if (this.value) { F.primera = this.value; F.primeraTocada = true; actualizarCalculos(); } });
      $('#vEditarCuotas', cont).onclick = function () {
        F.personal = cuotas().map(function (c) { return { fecha: c.fecha, monto: c.monto }; });
        if (!F.personal.length) F.personal = [{ fecha: F.primera, monto: null }];
        pintarCuotas();
      };
    }
    actualizarCalculos();
  }

  function pintarPersonal() {
    var cont = $('#vPers', raiz);
    cont.innerHTML = F.personal.map(function (c, i) {
      return '<div class="cuota-edit" data-i="' + i + '"><input type="date" data-k="fecha" value="' + esc(c.fecha || '') + '">' +
        '<input data-k="monto" inputmode="decimal" placeholder="Monto $" value="' + esc(numCampo(c.monto)) + '">' +
        '<button type="button" class="btn btn-plano btn-icono" data-quitar aria-label="Quitar">' + icono('cerrar', 'ic-chico') + '</button></div>';
    }).join('') + (F.personal.length > 1 ? '<button type="button" class="btn btn-plano btn-chico" id="vRepartir" style="margin-top:6px">Repartir lo que falta en partes iguales</button>' : '');
    $$('.cuota-edit', cont).forEach(function (el) {
      var i = Number(el.dataset.i);
      $$('input', el).forEach(function (inp) {
        inp.addEventListener(inp.type === 'date' ? 'change' : 'input', function () {
          if (inp.dataset.k === 'fecha') F.personal[i].fecha = inp.value;
          else { var v = parseNum(inp.value); F.personal[i].monto = isNaN(v) ? null : v; }
          actualizarCalculos();
        });
      });
      $('[data-quitar]', el).onclick = function () { F.personal.splice(i, 1); pintarPersonal(); actualizarCalculos(); };
    });
    var rep = $('#vRepartir', cont);
    if (rep) rep.onclick = function () {
      var n = F.personal.length, f = falta();
      var base = Math.floor(f * 100 / n) / 100;
      F.personal.forEach(function (c, i) { c.monto = i < n - 1 ? base : redondear2(f - base * (n - 1)); });
      pintarPersonal(); actualizarCalculos();
    };
  }

  /* ---------- Números que cambian al escribir ---------- */
  function actualizarCalculos() {
    if (!raiz || !raiz.isConnected) return;
    if (F.contado) F.inicial = total();   // de contado se paga todo
    var t = total(), f = falta();
    var pt = $('#vPagaTotal', raiz);
    if (pt) pt.textContent = fmtUSD(t);
    $('#vTotal', raiz).textContent = fmtUSD(t);
    var sug = $('#vSugerida', raiz);
    if (sug) { var pct = Number(ST.cfg.inicial_pct) || 0; sug.textContent = pct && t > 0 ? '(el ' + fmtNum(pct).replace(',00', '') + ' % es ' + fmtUSD(t * pct / 100) + ')' : ''; }
    var pb = $('#vPagoBs', raiz);
    if (pb) {
      var p = F.pagaInicial ? pagoInicial() : null, m = metodoPorId(F.metodo);
      pb.innerHTML = !p ? '' : p.sinTasa ? '<span class="suma-mal">Falta la tasa del día para cobrar en bolívares.</span>'
        : p.tasa ? 'Cobrar <b class="num">' + fmtBs(p.monto) + '</b> a ' + fmtTasa(p.tasa) + (tasaDeHoy() ? '' : ' <span class="suma-mal">(tasa de otro día)</span>') : '';
      var rc = $('#vRefCampo', raiz);
      if (rc) rc.hidden = !(m && m.pide_referencia);
    }
    var fe = $('#vFalta', raiz);
    if (fe) fe.textContent = fmtUSD(Math.max(f, 0));
    var lista = cuotas();
    var vista = $('#vVista', raiz);
    if (vista) {
      vista.innerHTML = !(f > 0) ? '<p class="tenue">' + (t > 0 ? 'No quedan cuotas: la venta queda pagada.' : 'Primero anota lo que se lleva.') + '</p>' :
        !lista.length ? '<p class="tenue">Escribe el número de cuotas o el monto de cada una.</p>' :
        '<div class="cuotas">' + lista.slice(0, 60).map(function (c, i) {
          return '<div class="cuota"><span class="marca"></span><div class="crece">Cuota ' + (i + 1) + ' · ' + esc(fmtFechaAnio(c.fecha)) + '</div><div class="num fuerte">' + fmtUSD(c.monto) + '</div></div>';
        }).join('') + '</div>';
    }
    var suma = $('#vSuma', raiz);
    if (suma) {
      var s = redondear2(lista.reduce(function (a, c) { return a + (Number(c.monto) || 0); }, 0));
      suma.innerHTML = !(f > 0) ? '' : Math.abs(s - f) <= 0.01
        ? '<span class="suma-ok">' + icono('check', 'ic-chico') + ' ' + plural(lista.length, 'cuota', 'cuotas') + ' suman ' + fmtUSD(s) + '</span>'
        : '<span class="suma-mal">Las cuotas suman ' + fmtUSD(s) + ' y deben sumar ' + fmtUSD(f) + '</span>';
    }
    var res = $('#vResumen', raiz);
    if (res) {
      var txt = (F.contado ? 'De contado · ' : '') + 'Total ' + fmtUSD(t);
      if (F.contado) { /* nada más: se paga todo */ }
      else if (F.tipo === 'carga') txt += ' · Ya pagó ' + fmtUSD(F.pagadoAntes || 0);
      else if (F.inicial) txt += ' · Inicial ' + fmtUSD(F.inicial);
      if (lista.length && f > 0) txt += ' · ' + plural(lista.length, 'cuota', 'cuotas') + (F.personal ? '' : ' ' + textoFrecuencia(F.frecuencia, lista.length)) + ' de ' + fmtUSD(lista[0].monto);
      res.textContent = txt;
    }
  }

  /* ---------- Guardar ---------- */
  async function guardar() {
    var c = F.cliente, t = total(), f = falta(), lista = cuotas(), dueno = esDueno();
    if (!c) { toast('Elige el cliente', 'error'); return; }
    if (c.no_venderle && !dueno) { toast('A este cliente no se le vende. Habla con Franklin o Daniel.', 'error'); return; }
    for (var i = 0; i < F.items.length; i++) {
      var it = F.items[i];
      if (!it.descripcion.trim()) { toast('Escribe el nombre del producto ' + (i + 1), 'error'); return; }
      if (it.precio == null || it.precio < 0) { toast('Falta el precio de ' + it.descripcion, 'error'); return; }
      if (F.tipo === 'nueva' && it.sede && it.producto_id && existenciaDe(it.producto_id, it.sede) < it.cantidad && !ST.desdeCache) {
        toast('En la tienda de ' + nombreSede(it.sede) + ' solo hay ' + existenciaDe(it.producto_id, it.sede) + ' de ' + it.descripcion, 'error'); return;
      }
    }
    if (!(t > 0)) { toast('El total debe ser mayor que cero', 'error'); return; }
    var datos = {
      origen: F.tipo === 'carga' ? 'carga_inicial' : 'nueva', fecha: F.fecha,
      items: F.items.map(function (it) {
        var x = { producto_id: it.producto_id, descripcion: it.descripcion.trim(), cantidad: it.cantidad, precio: redondear2(it.precio) };
        if (F.tipo === 'nueva' && it.sede && it.producto_id) x.sede_salida = it.sede;
        if (dueno && it.costo != null) x.costo = redondear2(it.costo);
        return x;
      }),
      frecuencia: F.contado ? 'contado' : F.personal ? 'personalizada' : F.frecuencia,
      cuotas: f > 0 ? lista.map(function (q) { return { fecha: q.fecha, monto: redondear2(q.monto) }; }) : [],
      contrato_papel: F.contratoPapel, notas: F.notas, hecho_en: new Date().toISOString()
    };
    if (dueno && F.vendedor && F.vendedor !== ST.yo.id) datos.vendedor_id = F.vendedor;
    if (c.pendiente) datos.cliente_clave = c.clave; else datos.cliente_id = c.id;
    if (F.tipo === 'carga') {
      var antes = Number(F.pagadoAntes) || 0;
      if (antes < 0 || antes >= t) { toast('Lo que ya pagó tiene que ser menor que el total', 'error'); return; }
      datos.pagado_antes = redondear2(antes);
    } else {
      var ini = F.contado ? t : (Number(F.inicial) || 0);
      if (ini < 0 || ini > t) { toast('La inicial no puede ser mayor que el total', 'error'); return; }
      datos.inicial = redondear2(ini);
      if (F.contado) { datos.contrato_papel = ''; F.foto = null; }
      if (ini > 0 && (F.pagaInicial || F.contado)) {
        var p = pagoInicial();
        if (!p) {
          toast(F.contado ? 'Toca cómo pagó: efectivo, Zelle, USDT o bolívares' : 'Toca cómo pagó la inicial: efectivo, Zelle, USDT o bolívares', 'error');
          var vm = $('#vMetodos', raiz);
          if (vm) { vm.classList.add('falta'); vm.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
          return;
        }
        if (p.sinTasa) { toast('Falta la tasa del día para cobrar en bolívares', 'error'); return; }
        datos.pago_inicial = { metodo_id: p.metodo.id, monto: p.monto, tasa: p.tasa, monto_usd: p.usd, referencia: F.refInicial };
      }
    }
    if (f > 0) {
      if (!lista.length) { toast('Faltan las cuotas', 'error'); return; }
      var s = redondear2(lista.reduce(function (a, q) { return a + (Number(q.monto) || 0); }, 0));
      if (Math.abs(s - f) > 0.01) { toast('Las cuotas suman ' + fmtUSD(s) + ' y deben sumar ' + fmtUSD(f), 'error'); return; }
      for (var k = 0; k < lista.length; k++) {
        if (!lista[k].fecha || !(lista[k].monto > 0)) { toast('Revisa la cuota ' + (k + 1) + ': le falta la fecha o el monto', 'error'); return; }
        if (k && lista[k].fecha < lista[k - 1].fecha) { toast('Las cuotas deben ir en orden de fecha', 'error'); return; }
        if (F.tipo === 'nueva' && lista[k].fecha < F.fecha) { toast('Una cuota no puede ser antes de la fecha de la venta', 'error'); return; }
      }
    }
    var op = { clave: F.clave, tipo: 'venta', datos: datos, resumen: { texto: (F.tipo === 'carga' ? 'Carga de ' : F.contado ? 'Venta de contado a ' : 'Venta a ') + c.nombre + ' por ' + fmtUSD(t) } };
    var r;
    try {
      r = await enviarYEsperar(op);
    } catch (e) {
      if (e && e.code === 'EM001' && await confirmar({ titulo: 'Referencia repetida', mensaje: errMsg(e) + ' ¿Guardar igual?', boton: 'Guardar igual' })) {
        datos.pago_inicial.forzar_referencia = true;
        r = await enviarYEsperar(op);
      } else throw e;
    }
    if (F.foto) {
      var ref = r.estado === 'ok' ? { ref_id: r.resultado.id } : { ref_clave: op.clave };
      await encolarFoto(F.foto, Object.assign({ tipo: 'contrato', nombreCliente: c.nombre }, c.pendiente ? { cliente_clave: c.clave } : { cliente_id: c.id }, ref));
    }
    var borrador = { numero: r.estado === 'ok' ? r.resultado.numero : null, fecha: F.fecha, cliente: c, origen: datos.origen,
                     items: datos.items, total: t, inicial: datos.inicial || 0, pagado_antes: datos.pagado_antes || 0,
                     inicial_pagada: !!datos.pago_inicial, frecuencia: datos.frecuencia, cuotas: datos.cuotas, contrato_papel: F.contratoPapel,
                     vendedor_id: datos.vendedor_id || ST.yo.id };
    if (r.estado === 'ok' && !c.pendiente) { try { await recargarCliente(c.id); } catch (e) { /* luego */ } }
    hojaVentaGuardada(r, borrador, op.clave);
    seguirDeContado = F.contado;
    ir('vender', '', 'reemplazar');
  }

  function hojaVentaGuardada(r, b, claveVenta) {
    var ok = r.estado === 'ok', contado = b.frecuencia === 'contado';
    var h = abrirHoja({
      titulo: ok ? (b.origen === 'carga_inicial' ? 'Cliente cargado' : contado ? 'Venta de contado #' + b.numero : 'Venta #' + b.numero + ' guardada') : 'Guardada en el teléfono',
      html: '<div class="aviso ' + (ok ? 'aviso-ok' : 'aviso-ambar') + '">' + icono(ok ? 'check' : 'nube') + '<div>' +
        (ok ? (contado ? esc(b.cliente.nombre) + ' pagó ' + fmtUSD(b.total) + ' completo.' : esc(b.cliente.nombre) + ' debe ' + fmtUSD(r.resultado.saldo) + '.')
          : 'No hay señal. La venta quedó guardada en este teléfono y se enviará sola cuando vuelva el internet.') + '</div></div>' +
        (b.vendedor_id !== ST.yo.id ? '<p class="tenue" style="margin:10px 2px 0">' + (contado ? 'Vendió ' : 'Crédito de ') + '<b>' + esc(nombreUsuario(b.vendedor_id)) + '</b>.</p>' : '') +
        '<div class="pila" style="margin-top:14px">' +
        (contado ? '<button type="button" class="btn btn-ancho" data-resumen>' + icono('chat') + 'Enviar recibo por WhatsApp</button>'
          : '<button type="button" class="btn btn-ancho" data-firmar>' + icono('editar') + 'Firmar el contrato en la pantalla</button>' +
            '<button type="button" class="btn btn-sec btn-ancho" data-resumen>' + icono('chat') + 'Enviar resumen por WhatsApp</button>' +
            '<button type="button" class="btn btn-sec btn-ancho" data-imprimir>' + icono('contrato') + 'Contrato en PDF (enviar o imprimir)</button>') +
        (b.cliente.pendiente ? '' : '<button type="button" class="btn btn-sec btn-ancho" data-ver>' + icono('usuario') + 'Ver cliente</button>') + '</div>'
    });
    h.$('[data-resumen]').onclick = function () { enviarResumenVenta(null, b); };
    if (h.$('[data-firmar]')) h.$('[data-firmar]').onclick = function () {
      hojaFirmar({ d: b, ventaId: ok ? r.resultado.id : null, ventaClave: claveVenta, cliente: b.cliente, alFirmar: function () {
        var bt = h.$('[data-firmar]');
        if (bt) { bt.disabled = true; bt.innerHTML = icono('check') + 'Contrato firmado'; }
      } });
    };
    if (h.$('[data-imprimir]')) h.$('[data-imprimir]').onclick = function () { imprimirContrato(null, b); };
    var ver = h.$('[data-ver]');
    if (ver) ver.onclick = function () { h.cerrar(); ir('cliente', String(b.cliente.id)); };
  }

  return { mostrar: mostrar };
})();

/* ---------- Elegir cliente (buscador a pantalla completa) ---------- */
function hojaElegirCliente(alElegir) {
  var h = abrirHoja({
    titulo: 'Elegir cliente', completa: true,
    html: '<button type="button" class="btn btn-ancho" data-nuevo>' + icono('mas') + 'Cliente nuevo</button>' +
      '<div class="buscador" style="margin-top:12px">' + icono('buscar') + '<input id="ecBusca" type="search" placeholder="Nombre, cédula o teléfono"></div>' +
      '<div class="lista" id="ecLista" style="margin-top:12px"></div>'
  });
  var inp = h.$('#ecBusca');
  function pintar() {
    var q = normalizar(inp.value.trim()), qd = inp.value.replace(/\D/g, '');
    var pend = Cola.mias().filter(function (o) { return o.tipo === 'cliente' && !o.datos.id && o.estado !== 'error'; })
      .filter(function (o) { return !q || normalizar(o.datos.nombre).indexOf(q) >= 0; });
    var lista = ST.clientes.filter(function (c) {
      if (c.deleted_at) return false;
      if (!q) return true;
      return normalizar(c.nombre + ' ' + (c.sector || '')).indexOf(q) >= 0 ||
        (qd.length >= 4 && (String(c.cedula || '').indexOf(qd) >= 0 || String(c.telefono || '').replace(/\D/g, '').indexOf(qd) >= 0));
    }).slice(0, 80);
    h.$('#ecLista').innerHTML = pend.map(function (o) {
      return '<button type="button" class="item" data-ref="c-' + o.clave + '"><div class="avatar">' + esc(iniciales(o.datos.nombre)) + '</div><div class="crece"><div class="item-tit">' + esc(o.datos.nombre) + '</div><div class="item-sub">Por enviar</div></div></button>';
    }).join('') + lista.map(function (c) {
      var r = resumenCliente(c.id);
      return '<button type="button" class="item" data-ref="' + c.id + '"><div class="avatar">' + esc(iniciales(c.nombre)) + '</div><div class="crece"><div class="item-tit cortar">' + esc(c.nombre) + '</div>' +
        '<div class="item-sub cortar">' + esc([c.cedula ? fmtCedula(c.cedula) : '', c.sector].filter(Boolean).join(' · ') || '—') + '</div></div>' +
        (r.saldo > 0.004 ? '<div class="item-der num">' + fmtUSD(r.saldo) + '</div>' : '') + '</button>';
    }).join('') || '<div class="vacio">Nadie coincide. Toca "Cliente nuevo".</div>';
  }
  inp.addEventListener('input', debounce(pintar, 150));
  h.cuerpo.addEventListener('click', function (e) {
    var b = e.target.closest('[data-ref]');
    if (b) { h.cerrar(); alElegir(b.dataset.ref); return; }
    if (e.target.closest('[data-nuevo]')) {
      h.cerrar();
      hojaCliente(null, { alGuardar: function (ref) { alElegir(ref); } });
    }
  });
  pintar();
  setTimeout(function () { inp.focus(); }, 100);
}
