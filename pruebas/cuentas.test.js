// Pruebas de js/cuentas.js (calendario de cuotas y atraso). Correr: node pruebas/cuentas.test.js
'use strict';
const C = require('../js/cuentas.js');
let ok = 0, mal = 0;
function igual(nombre, dio, esperado) {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log('ok  ' + nombre); } else { mal++; console.log('!!! ' + nombre + '\n    dio:      ' + a + '\n    esperaba: ' + b); }
}
const fechas = l => l.map(c => c.fecha), montos = l => l.map(c => c.monto);

// Calendarios
let l = C.generarCuotas({ monto: 210, frecuencia: 'semanal', primera: '2026-10-22', numero: 7 });
igual('7 semanales de 30', montos(l), [30, 30, 30, 30, 30, 30, 30]);
igual('semanal cada 7 días', fechas(l).slice(0, 3), ['2026-10-22', '2026-10-29', '2026-11-05']);
igual('100 en 3: la última lleva los centavos', montos(C.generarCuotas({ monto: 100, frecuencia: 'semanal', primera: '2026-10-22', numero: 3 })), [33.33, 33.33, 33.34]);
igual('por monto de cuota: 210 de a 40', montos(C.generarCuotas({ monto: 210, frecuencia: 'semanal', primera: '2026-10-22', cuota: 40 })), [40, 40, 40, 40, 40, 10]);
igual('por monto exacto: 120 de a 30', montos(C.generarCuotas({ monto: 120, frecuencia: 'semanal', primera: '2026-10-22', cuota: 30 })), [30, 30, 30, 30]);
igual('quincena desde el 15', fechas(C.generarCuotas({ monto: 40, frecuencia: 'quincenal', primera: '2026-10-15', numero: 4 })), ['2026-10-15', '2026-10-31', '2026-11-15', '2026-11-30']);
igual('quincena desde el 31 de enero pasa por febrero', fechas(C.generarCuotas({ monto: 30, frecuencia: 'quincenal', primera: '2027-01-31', numero: 3 })), ['2027-01-31', '2027-02-15', '2027-02-28']);
igual('quincena desde otro día: cada 15 días', fechas(C.generarCuotas({ monto: 30, frecuencia: 'quincenal', primera: '2026-10-10', numero: 3 })), ['2026-10-10', '2026-10-25', '2026-11-09']);
igual('mensual desde el 31', fechas(C.generarCuotas({ monto: 40, frecuencia: 'mensual', primera: '2027-01-31', numero: 4 })), ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
igual('mensual cruza el año', fechas(C.generarCuotas({ monto: 20, frecuencia: 'mensual', primera: '2026-12-05', numero: 2 })), ['2026-12-05', '2027-01-05']);
igual('sin monto no hay cuotas', C.generarCuotas({ monto: 0, frecuencia: 'semanal', primera: '2026-10-22', numero: 3 }), []);
igual('primera sugerida semanal', C.primeraSugerida('2026-10-15', 'semanal'), '2026-10-22');
igual('primera sugerida mensual', C.primeraSugerida('2026-01-31', 'mensual'), '2026-02-28');

// Atraso. Venta de $300: inicial 90 (vendida el 1/10) y 7 cuotas semanales de 30 desde el 8/10.
const venta = { total: 300, ajuste: 0, pagado: 90, plan_base: 0, fecha: '2026-10-01', estado: 'activa' };
const cuotas = [{ n: 0, tipo: 'inicial', fecha: '2026-10-01', monto: 90 }].concat(
  [1, 2, 3, 4, 5, 6, 7].map(i => ({ n: i, tipo: 'cuota', fecha: C.sumarDias('2026-10-01', 7 * i), monto: 30 })));
let e = C.estadoVenta(venta, cuotas, '2026-10-15');
igual('debe 210', e.saldo, 210);
igual('atrasado 30 (la del 8/10); la del 15/10 vence hoy', [e.atraso, e.diasAtraso], [30, 7]);
igual('próxima: la del 8/10 (la más vieja sin pagar)', [e.proxima.fecha, e.proxima.pendiente], ['2026-10-08', 30]);
igual('cuotas vencidas: 1', e.cuotas.filter(c => c.vencida).length, 1);
igual('siguiente: la de hoy (la que todavía no vence)', [e.siguiente.fecha, e.siguiente.pendiente], ['2026-10-15', 30]);
e = C.estadoVenta(Object.assign({}, venta, { pagado: 120 }), cuotas, '2026-10-15');
igual('pagó la del 8: al día y le toca hoy', [e.atraso, e.diasAtraso, e.proxima.fecha], [0, 0, '2026-10-15']);
e = C.estadoVenta(Object.assign({}, venta, { pagado: 105 }), cuotas, '2026-10-15');
igual('abono parcial: faltan 15 de la del 8', [e.atraso, e.cuotas[1].estado, e.cuotas[1].pendiente], [15, 'parcial', 15]);
e = C.estadoVenta(Object.assign({}, venta, { pagado: 90 }), cuotas, '2026-11-01');
igual('al 1/11: 4 cuotas vencidas, 24 días', [e.atraso, e.diasAtraso, e.cuotas.filter(c => c.vencida).length], [120, 24, 4]);
e = C.estadoVenta(Object.assign({}, venta, { pagado: 300 }), cuotas, '2026-12-30');
igual('pagada: sin saldo ni atraso', [e.saldo, e.atraso, e.proxima], [0, 0, null]);
e = C.estadoVenta(Object.assign({}, venta, { pagado: 150 }), cuotas, '2026-12-30');
igual('plazo vencido', [e.plazoVencido, e.atraso], [true, 150]);
igual('plazo vencido: no hay siguiente', e.siguiente, null);
e = C.estadoVenta(Object.assign({}, venta, { estado: 'cerrada' }), cuotas, '2026-12-30');
igual('venta cerrada no cuenta', [e.saldo, e.atraso], [0, 0]);
// Más tiempo: ya pagó 150 (base), calendario nuevo de 2 cuotas de 75
const v2 = { total: 300, ajuste: 0, pagado: 150, plan_base: 150, fecha: '2026-10-01', estado: 'activa' };
const c2 = [{ n: 1, tipo: 'cuota', fecha: '2026-11-15', monto: 75 }, { n: 2, tipo: 'cuota', fecha: '2026-12-15', monto: 75 }];
igual('reprogramada al día', C.estadoVenta(v2, c2, '2026-11-01').atraso, 0);
igual('reprogramada: abono anulado deja atraso', C.estadoVenta(Object.assign({}, v2, { pagado: 120 }), c2, '2026-11-01').atraso, 30);
// Recargo de 10: queda como cuota y suma al total
const v3 = Object.assign({}, venta, { ajuste: 10, pagado: 90 });
const c3 = cuotas.concat([{ n: 8, tipo: 'recargo', fecha: '2026-10-10', monto: 10 }]);
igual('recargo vencido suma al atraso', C.estadoVenta(v3, c3, '2026-10-15').atraso, 40);
igual('saldo con recargo', C.estadoVenta(v3, c3, '2026-10-15').saldo, 220);

console.log('----\nok: ' + ok + '   fallas: ' + mal);
process.exit(mal ? 1 : 0);
