// Electro Montana — cuentas de una venta: calendario de cuotas y atraso.
// Solo para MOSTRAR. Lo que vale es lo que guarda la base (la base revisa y recalcula todo).
// Se usa en el navegador (window.Cuentas) y en las pruebas con node (module.exports).
(function (raiz) {
  'use strict';

  function r2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

  // Fechas como texto 'AAAA-MM-DD', sin horas (mediodía UTC para no saltar de día)
  function aFecha(s) { return new Date(s + 'T12:00:00Z'); }
  function aTexto(d) { return d.toISOString().slice(0, 10); }
  function sumarDias(s, n) { var d = aFecha(s); d.setUTCDate(d.getUTCDate() + n); return aTexto(d); }
  function diasEntre(desde, hasta) { return Math.round((aFecha(hasta) - aFecha(desde)) / 86400000); }
  function ultimoDiaMes(anio, mes) { return new Date(Date.UTC(anio, mes + 1, 0, 12)).getUTCDate(); }
  // Mismo día del mes siguiente (el 31 pasa al último día de los meses cortos)
  function sumarMeses(s, n, diaBase) {
    var d = aFecha(s), anio = d.getUTCFullYear(), mes = d.getUTCMonth() + n;
    anio += Math.floor(mes / 12); mes = ((mes % 12) + 12) % 12;
    var dia = Math.min(diaBase || d.getUTCDate(), ultimoDiaMes(anio, mes));
    return aTexto(new Date(Date.UTC(anio, mes, dia, 12)));
  }
  // Quincenal: si cae el 15 o el último del mes, sigue la quincena (15 → último → 15…); si no, cada 15 días
  function siguienteQuincena(s) {
    var d = aFecha(s), dia = d.getUTCDate(), ult = ultimoDiaMes(d.getUTCFullYear(), d.getUTCMonth());
    if (dia === 15) return aTexto(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), ult, 12)));
    if (dia === ult) return aTexto(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 15, 12)));
    return sumarDias(s, 15);
  }
  function fechaN(primera, frecuencia, i) {
    if (frecuencia === 'semanal') return sumarDias(primera, 7 * i);
    if (frecuencia === 'mensual') return sumarMeses(primera, i, aFecha(primera).getUTCDate());
    var f = primera;
    for (var k = 0; k < i; k++) f = siguienteQuincena(f);
    return f;
  }
  // Primera cuota sugerida a partir de la fecha de la venta
  function primeraSugerida(desde, frecuencia) {
    if (frecuencia === 'semanal') return sumarDias(desde, 7);
    if (frecuencia === 'mensual') return sumarMeses(desde, 1);
    return sumarDias(desde, 15);
  }

  // Arma el calendario para "monto". o = {monto, frecuencia, primera, numero} o {…, cuota}
  // Devuelve [{fecha, monto}]; la última cuota absorbe los centavos.
  function generarCuotas(o) {
    var monto = r2(o.monto);
    if (!(monto > 0) || !o.primera) return [];
    var n, base;
    if (o.cuota) {
      base = r2(o.cuota);
      if (!(base > 0)) return [];
      n = Math.ceil(r2(monto / base) - 1e-9);
    } else {
      n = Math.max(1, Math.floor(o.numero || 1));
      base = Math.floor(monto * 100 / n + 1e-6) / 100;
    }
    if (n > 200) return [];
    var lista = [];
    for (var i = 0; i < n; i++) {
      var m = i < n - 1 ? base : r2(monto - base * (n - 1));
      lista.push({ fecha: fechaN(o.primera, o.frecuencia, i), monto: m });
    }
    return lista.filter(function (c) { return c.monto > 0; });
  }

  // Estado de una venta a una fecha. venta: {total, ajuste, pagado, plan_base, fecha, estado}
  // Atrasado = lo que debió pagar ANTES de hoy y no ha pagado (la cuota de hoy todavía no es atraso).
  // cuotas: las vigentes de esa venta. Devuelve saldo, atraso, días de atraso, próxima cuota y el
  // detalle de cada cuota (cuánto se le ha pagado).
  function estadoVenta(venta, cuotas, hoy, pendienteLocal) {
    var pagado = r2(Number(venta.pagado) + (Number(pendienteLocal) || 0));
    var saldo = r2(Number(venta.total) + Number(venta.ajuste || 0) - pagado);
    var lista = (cuotas || []).slice().sort(function (a, b) {
      return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.n - b.n);
    });
    var acum = Number(venta.plan_base) || 0, esperado = acum, detalle = [], primeraDeuda = null, proxima = null, siguiente = null;
    // Si se anuló un abono después de dar más tiempo, lo pagado puede quedar por debajo de la base
    if (pagado < acum - 0.004) primeraDeuda = venta.fecha;
    lista.forEach(function (c) {
      var monto = Number(c.monto), inicio = acum;
      acum = r2(acum + monto);
      var cubierto = Math.min(Math.max(pagado - inicio, 0), monto);
      var pendiente = r2(monto - cubierto);
      var vencida = c.fecha < hoy;
      if (c.fecha < hoy) esperado = r2(esperado + monto);
      var d = { id: c.id, n: c.n, tipo: c.tipo, fecha: c.fecha, monto: monto, pagado: r2(cubierto), pendiente: pendiente,
                estado: pendiente <= 0.004 ? 'pagada' : (cubierto > 0.004 ? 'parcial' : 'pendiente'), vencida: vencida && pendiente > 0.004 };
      detalle.push(d);
      if (pendiente > 0.004) {
        if (!proxima) proxima = d;
        if (!siguiente && c.fecha >= hoy) siguiente = d;   // la próxima que todavía no vence
        if (c.fecha < hoy && !primeraDeuda) primeraDeuda = c.fecha;
      }
    });
    var activa = venta.estado === 'activa' || venta.estado === 'pagada';
    var atraso = activa ? Math.max(0, r2(esperado - pagado)) : 0;
    if (atraso <= 0.004) { atraso = 0; primeraDeuda = null; }
    var ultima = lista.length ? lista[lista.length - 1].fecha : venta.fecha;
    return {
      saldo: activa ? Math.max(saldo, 0) : 0,
      pagado: pagado,
      esperado: esperado,
      atraso: atraso,
      diasAtraso: primeraDeuda ? Math.max(0, diasEntre(primeraDeuda, hoy)) : 0,
      proxima: activa && saldo > 0.004 ? proxima : null,
      siguiente: activa && saldo > 0.004 ? siguiente : null,
      vencePlazo: ultima,
      plazoVencido: activa && saldo > 0.004 && ultima < hoy,
      cuotas: detalle
    };
  }

  var api = {
    r2: r2, sumarDias: sumarDias, diasEntre: diasEntre, sumarMeses: sumarMeses, siguienteQuincena: siguienteQuincena,
    fechaN: fechaN, primeraSugerida: primeraSugerida, generarCuotas: generarCuotas, estadoVenta: estadoVenta
  };
  raiz.Cuentas = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
