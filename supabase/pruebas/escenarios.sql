-- Escenarios de negocio de la etapa 1. Se corren con supabase/pruebas/correr.sh (Postgres local).
-- Cada línea debe salir con "ok"; las fallas salen con "!!!".
\set QUIET 1
\pset format unaligned
\pset tuples_only on
set client_min_messages = notice;

create function public.t(etiqueta text, q text, error_esperado text default null) returns void language plpgsql as $$
declare r text;
begin
  execute 'select (' || q || ')::text' into r;
  if error_esperado is not null then raise notice '!!! % → esperaba error (%) pero dio: %', etiqueta, error_esperado, r;
  else raise notice 'ok  % → %', etiqueta, r; end if;
exception when others then
  if error_esperado is null then raise notice '!!! % → ERROR: %', etiqueta, sqlerrm;
  elsif position(lower(error_esperado) in lower(sqlerrm)) = 0 then raise notice '!!! % → error distinto: %', etiqueta, sqlerrm;
  else raise notice 'ok  % → (error esperado) %', etiqueta, sqlerrm; end if;
end $$;
-- Igual que t(), pero el resultado tiene que ser exactamente "esperado"
create function public.igual(etiqueta text, q text, esperado text) returns void language plpgsql as $$
declare r text;
begin
  execute 'select (' || q || ')::text' into r;
  if r is distinct from esperado then raise notice '!!! % → dio % y se esperaba %', etiqueta, r, esperado;
  else raise notice 'ok  % → %', etiqueta, r; end if;
exception when others then raise notice '!!! % → ERROR: %', etiqueta, sqlerrm;
end $$;
grant execute on function public.t(text, text, text), public.igual(text, text, text) to authenticated, anon;

-- La regla de oro del calendario: plan_base + cuotas vigentes = total + ajuste; pagado = abonos vivos
create function public.cuadre() returns text language sql security definer as $$
  select coalesce(string_agg('#' || v.numero, ',' order by v.numero), 'todo cuadra') from public.ventas v
   where v.estado <> 'anulada' and (
     abs(v.plan_base + coalesce((select sum(monto) from public.cuotas q where q.venta_id = v.id and q.vigente), 0) - (v.total + v.ajuste)) > 0.004
     or abs(v.pagado - coalesce((select sum(monto_usd) from public.abonos a where a.venta_id = v.id and a.anulado_en is null), 0)) > 0.004)
$$;
grant execute on function public.cuadre() to authenticated;

insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000a', 'franklin@x'), ('00000000-0000-0000-0000-00000000000b', 'daniel@x'),
 ('00000000-0000-0000-0000-00000000000e', 'empleado@x'), ('00000000-0000-0000-0000-00000000000f', 'inactivo@x');
insert into public.usuarios (id, usuario, nombre, rol, sede, activo) values
 ('00000000-0000-0000-0000-00000000000a', 'franklin', 'Franklin', 'dueno', null, true),
 ('00000000-0000-0000-0000-00000000000b', 'daniel', 'Daniel', 'dueno', null, true),
 ('00000000-0000-0000-0000-00000000000e', 'pedraza', 'Empleado Pedraza', 'empleado', 'pedraza', true),
 ('00000000-0000-0000-0000-00000000000f', 'inactivo', 'Inactivo', 'empleado', 'pedraza', false);
create function public.como(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub',
    case u when 'F' then '00000000-0000-0000-0000-00000000000a' when 'D' then '00000000-0000-0000-0000-00000000000b'
           when 'E' then '00000000-0000-0000-0000-00000000000e' else '00000000-0000-0000-0000-00000000000f' end,
    'role', 'authenticated')::text, false)
$$;
grant execute on function public.como(text) to authenticated, anon;
-- Fecha de hoy en Venezuela, para armar calendarios
create function public.h(dias int default 0) returns text language sql as $$
  select ((now() at time zone 'America/Caracas')::date + dias)::text $$;
grant execute on function public.h(int) to authenticated;
-- Id de una venta por su número de contrato (los intentos fallidos gastan ids, no números)
create function public.v(n int) returns bigint language sql security definer as $$ select id from public.ventas where numero = n $$;
grant execute on function public.v(int) to authenticated;

-- ===================== Anónimo =====================
set role anon;
do $$ begin perform count(*) from public.clientes; raise notice '!!! anon leyó clientes';
exception when others then raise notice 'ok  anon no lee clientes → %', sqlerrm; end $$;
do $$ begin perform public.registrar_venta('{}'::jsonb, null); raise notice '!!! anon llamó registrar_venta';
exception when others then raise notice 'ok  anon no llama RPC → %', sqlerrm; end $$;
reset role;

-- ===================== Franklin (dueño) =====================
select como('F'); set role authenticated;
select t('tasa 40', $q$ (select public.actualizar_tasa(40)) $q$);
select igual('cliente Socopó', $q$ public.guardar_cliente('{"nombre":"Ana Pérez","cedula":"V-12.345.678","sede":"socopo","telefono":"0414-1234567","sector":"Barrio Nuevo"}', '11111111-0000-0000-0000-000000000001')->>'id' $q$, '1');
select igual('misma clave no repite', $q$ public.guardar_cliente('{"nombre":"Ana Pérez","cedula":"V-12.345.678","sede":"socopo"}', '11111111-0000-0000-0000-000000000001')->>'id' $q$, '1');
select igual('cédula normalizada', $q$ (select cedula from public.clientes where id = 1) $q$, 'V12345678');
select t('cédula repetida', $q$ public.guardar_cliente('{"nombre":"Otra","cedula":"12345678","sede":"socopo"}') $q$, 'Ya hay un cliente con esa cédula: Ana Pérez');
select t('cédula mala', $q$ public.guardar_cliente('{"nombre":"Otra","cedula":"abc","sede":"socopo"}') $q$, 'no se entiende');
select t('sin sede', $q$ public.guardar_cliente('{"nombre":"Otra"}') $q$, 'Socopó o de Pedraza');
select igual('cliente Pedraza', $q$ public.guardar_cliente('{"nombre":"Luis Rojas","sede":"pedraza"}')->>'id' $q$, '2');
select igual('editar solo teléfono', $q$ public.guardar_cliente('{"id":2,"telefono":"0424-9999999"}')->>'id' $q$, '2');
select igual('lo demás no cambia', $q$ (select nombre || '/' || telefono || '/' || sede from public.clientes where id = 2) $q$, 'Luis Rojas/0424-9999999/pedraza');
select t('ubicación mala', $q$ public.guardar_cliente('{"id":2,"lat":95,"lng":10}') $q$, 'ubicación no es válida');
select igual('ubicación', $q$ public.guardar_cliente('{"id":2,"lat":8.25,"lng":-70.81}')->>'id' $q$, '2');
select igual('ubicación con fecha', $q$ (select (ubicacion_en is not null)::text from public.clientes where id = 2) $q$, 'true');

-- Venta nueva: nevera $300, inicial $90 pagada en efectivo, 7 cuotas semanales de $30
select igual('venta #1', $q$ public.registrar_venta(jsonb_build_object(
  'cliente_id', 1, 'items', jsonb_build_array(jsonb_build_object('descripcion','Nevera Mabe 14 pies','cantidad',1,'precio',300,'costo',200)),
  'inicial', 90, 'pago_inicial', jsonb_build_object('metodo_id',1,'monto',90),
  'frecuencia','semanal',
  'cuotas', (select jsonb_agg(jsonb_build_object('fecha', (h(0)::date + 7*g)::text, 'monto', 30)) from generate_series(1,7) g)),
  '22222222-0000-0000-0000-000000000001')->>'numero' $q$, '1');
select igual('misma clave no repite venta', $q$ public.registrar_venta('{"cliente_id":1}', '22222222-0000-0000-0000-000000000001')->>'numero' $q$, '1');
select igual('venta #1 cuentas', $q$ (select total || '/' || inicial || '/' || pagado || '/' || saldo || '/' || estado from public.ventas where numero = 1) $q$, '300.00/90.00/90.00/210.00/activa');
select igual('venta #1 cuotas', $q$ (select count(*) || '/' || sum(monto) from public.cuotas where venta_id = 1 and vigente) $q$, '8/300.00');
select igual('costo guardado', $q$ (select costo from public.venta_item_costos) $q$, '200.00');
select igual('producto creado', $q$ (select nombre || '/' || precio_sugerido from public.productos where id = 1) $q$, 'Nevera Mabe 14 pies/300.00');
select t('cuotas que no suman', $q$ public.registrar_venta('{"cliente_id":1,"items":[{"descripcion":"Cocina","precio":200}],"inicial":50,"cuotas":[{"fecha":"2099-01-01","monto":100}]}') $q$, 'deben sumar');
select t('cuota antes de la venta', $q$ public.registrar_venta(jsonb_build_object('cliente_id',1,'items','[{"descripcion":"Cocina","precio":100}]'::jsonb,'cuotas',jsonb_build_array(jsonb_build_object('fecha',h(-1),'monto',100)))) $q$, 'antes de la fecha');
select t('cuotas desordenadas', $q$ public.registrar_venta(jsonb_build_object('cliente_id',1,'items','[{"descripcion":"Cocina","precio":100}]'::jsonb,'cuotas',jsonb_build_array(jsonb_build_object('fecha',h(10),'monto',50),jsonb_build_object('fecha',h(5),'monto',50)))) $q$, 'orden de fecha');
select t('sin productos', $q$ public.registrar_venta('{"cliente_id":1,"items":[]}') $q$, 'Agrega lo que se llevó');
select t('fecha futura', $q$ public.registrar_venta(jsonb_build_object('cliente_id',1,'fecha',h(3),'items','[{"descripcion":"Cocina","precio":100}]'::jsonb)) $q$, 'no puede ser futura');
select t('inicial mayor que total', $q$ public.registrar_venta('{"cliente_id":1,"items":[{"descripcion":"Cocina","precio":100}],"inicial":150}') $q$, 'no puede ser mayor');
select t('pagó más de la inicial', $q$ public.registrar_venta(jsonb_build_object('cliente_id',1,'items','[{"descripcion":"Cocina","precio":100}]'::jsonb,'inicial',30,'pago_inicial','{"metodo_id":1,"monto":40}'::jsonb,'cuotas',jsonb_build_array(jsonb_build_object('fecha',h(7),'monto',70)))) $q$, 'es más que la inicial');
-- Redondeo: $100 en 3 cuotas de 33,33 → la base ajusta la última
select igual('venta #2 redondeo', $q$ public.registrar_venta(jsonb_build_object('cliente_id',1,'fecha',h(-20),'items','[{"descripcion":"Licuadora Oster","precio":100,"costo":60}]'::jsonb,'frecuencia','quincenal','cuotas',jsonb_build_array(jsonb_build_object('fecha',h(-5),'monto',33.33),jsonb_build_object('fecha',h(10),'monto',33.33),jsonb_build_object('fecha',h(25),'monto',33.33))))->>'saldo' $q$, '100.00');
select igual('última cuota ajustada', $q$ (select string_agg(monto::text, ',' order by n) from public.cuotas where venta_id = v(2)) $q$, '33.33,33.33,33.34');

-- Abonos
select igual('abono Zelle $30', $q$ public.registrar_abono('{"cliente_id":1,"venta_id":1,"metodo_id":2,"monto":30,"referencia":"ABC 123"}', '33333333-0000-0000-0000-000000000001')->>'saldo_cliente' $q$, '280.00');
select igual('misma clave no repite abono', $q$ public.registrar_abono('{"cliente_id":1,"venta_id":1,"metodo_id":2,"monto":30}', '33333333-0000-0000-0000-000000000001')->>'saldo_cliente' $q$, '280.00');
select igual('un solo abono Zelle', $q$ (select count(*) from public.abonos where metodo_id = 2) $q$, '1');
select t('referencia repetida', $q$ public.registrar_abono('{"cliente_id":1,"venta_id":1,"metodo_id":2,"monto":10,"referencia":"abc-123"}') $q$, 'ya se registró');
select t('referencia repetida forzada', $q$ public.registrar_abono('{"cliente_id":1,"venta_id":1,"metodo_id":2,"monto":10,"referencia":"abc-123","forzar_referencia":true}', '33333333-0000-0000-0000-000000000002')->>'saldo_cliente' $q$);
select t('anular abono', $q$ (select public.anular_abono('33333333-0000-0000-0000-000000000002', 'Era el mismo Zelle')) $q$);
select t('anular dos veces', $q$ (select public.anular_abono('33333333-0000-0000-0000-000000000002', 'otra vez')) $q$, 'ya estaba anulado');
select igual('saldo tras anular', $q$ (select saldo from public.ventas where id = 1) $q$, '180.00');
select t('abono mayor que deuda', $q$ public.registrar_abono('{"cliente_id":1,"venta_id":1,"metodo_id":1,"monto":500}') $q$, 'mayor que lo que debe');
select t('Bs no cuadra', $q$ public.registrar_abono('{"cliente_id":1,"venta_id":1,"metodo_id":4,"monto":1200,"tasa":40,"monto_usd":31}') $q$, 'no cuadra');
select t('Bs sin tasa', $q$ public.registrar_abono('{"cliente_id":1,"venta_id":1,"metodo_id":4,"monto":1200}') $q$, 'Falta la tasa');
select igual('abono Bs 1200 a 40', $q$ public.registrar_abono('{"cliente_id":1,"venta_id":1,"metodo_id":4,"monto":1200,"tasa":40,"monto_usd":30,"referencia":"0102-555"}')->'ventas'->0->>'saldo' $q$, '150.00');
select t('abono con fecha futura', $q$ public.registrar_abono(jsonb_build_object('cliente_id',1,'metodo_id',1,'monto',5,'fecha',h(1))) $q$, 'no puede ser futura');
select t('dueño anota abono de hace 20 días', $q$ public.registrar_abono(jsonb_build_object('cliente_id',1,'venta_id',v(2),'metodo_id',1,'monto',10,'fecha',h(-20),'recibido_por','00000000-0000-0000-0000-00000000000b'))->>'saldo_cliente' $q$);
select igual('recibido por Daniel', $q$ (select u.nombre from public.abonos a join public.usuarios u on u.id = a.recibido_por where a.venta_id = v(2)) $q$, 'Daniel');
-- Pago a la cuenta: $200 se reparte, primero a la venta más vieja (#2 del día -20, saldo 90) y luego a #1 (saldo 150)
select igual('abono a la cuenta se reparte', $q$ (select string_agg((x->>'numero') || ':' || (x->>'monto_usd') || ':' || (x->>'saldo'), ' ') from jsonb_array_elements(public.registrar_abono('{"cliente_id":1,"metodo_id":4,"monto":8000,"tasa":40}', '33333333-0000-0000-0000-000000000003')->'ventas') x) $q$, '2:90.00:0.00 1:110.00:40.00');
select igual('Bs repartidos', $q$ (select string_agg(monto::text, ',' order by id) from public.abonos where grupo = '33333333-0000-0000-0000-000000000003') $q$, '3600.00,4400.00');
select igual('venta #2 pagada', $q$ (select estado || '/' || (pagada_en is not null)::text from public.ventas where id = v(2)) $q$, 'pagada/true');
select t('abono a venta pagada', $q$ public.registrar_abono(jsonb_build_object('cliente_id',1,'venta_id',v(2),'metodo_id',1,'monto',1)) $q$, 'ya no tiene saldo');
select t('anular abono reabre venta', $q$ (select public.anular_abono('33333333-0000-0000-0000-000000000003', 'prueba')) $q$);
select igual('venta #2 activa otra vez', $q$ (select estado || '/' || saldo || '/' || (pagada_en is null)::text from public.ventas where id = v(2)) $q$, 'activa/90.00/true');
select igual('cuadre 1', $q$ public.cuadre() $q$, 'todo cuadra');

-- Recargo, descuento y más tiempo (venta #1: debe 150)
select igual('recargo $10', $q$ public.ajustar_venta(1, 'recargo', 10, 'Se pasó del plazo')->>'saldo' $q$, '160.00');
select igual('cuota de recargo', $q$ (select tipo || '/' || monto || '/' || (fecha::text = h(0))::text from public.cuotas where venta_id = 1 and tipo = 'recargo') $q$, 'recargo/10.00/true');
select igual('descuento $45', $q$ public.ajustar_venta(1, 'descuento', 45, 'Pronto pago')->>'saldo' $q$, '115.00');
select t('descuento mayor que deuda', $q$ public.ajustar_venta(1, 'descuento', 500, 'x') $q$, 'no puede ser mayor');
select igual('cuadre 2', $q$ public.cuadre() $q$, 'todo cuadra');
select t('reprogramar mal sumado', $q$ public.reprogramar_venta(1, 'mensual', '[{"fecha":"2099-01-01","monto":50}]', 'Más tiempo') $q$, 'deben sumar');
select igual('reprogramar', $q$ public.reprogramar_venta(1, 'mensual', jsonb_build_array(jsonb_build_object('fecha',h(30),'monto',60),jsonb_build_object('fecha',h(60),'monto',55)), 'Perdió el trabajo')->>'plan' $q$, '2');
select igual('plan nuevo', $q$ (select plan_base || '/' || frecuencia || '/' || (select count(*) from public.cuotas where venta_id = 1 and vigente) from public.ventas where id = 1) $q$, '150.00/mensual/2');
select igual('cuotas viejas guardadas', $q$ (select count(*) from public.cuotas where venta_id = 1 and not vigente) > 0 $q$, 'true');
select igual('cuadre 3', $q$ public.cuadre() $q$, 'todo cuadra');

-- Retiro como dice su contrato: se retira el artículo, sigue debiendo y se le devuelve al pagar
select t('retirar mercancía #1', $q$ (select public.retirar_mercancia(1, 'Tres cuotas sin pagar')) $q$);
select t('retirar dos veces', $q$ (select public.retirar_mercancia(1, 'otra vez')) $q$, 'ya está retirada');
select igual('sigue activa y retirada', $q$ (select estado || '/' || mercancia from public.ventas where id = 1) $q$, 'activa/retirada');
select igual('se sigue cobrando', $q$ public.registrar_abono('{"cliente_id":1,"venta_id":1,"metodo_id":1,"monto":15}', '33333333-0000-0000-0000-000000000009')->'ventas'->0->>'saldo' $q$, '100.00');
select t('devolver debiendo sin motivo', $q$ (select public.devolver_mercancia(1, '')) $q$, 'Todavía debe');
select t('anular venta retirada', $q$ (select public.anular_venta(1, 'error')) $q$, 'mercancía retirada');
select t('devolver con motivo', $q$ (select public.devolver_mercancia(1, 'Se comprometió a pagar el viernes')) $q$);
select igual('mercancía devuelta', $q$ (select mercancia from public.ventas where id = 1) $q$, 'devuelta');
select t('cerrar venta', $q$ (select public.cerrar_venta(1, 'Se mudó y no apareció')) $q$);
select igual('cerrada no suma deuda', $q$ (select estado || '/' || saldo from public.ventas where id = 1) $q$, 'cerrada/100.00');
select t('abono a cerrada', $q$ public.registrar_abono('{"cliente_id":1,"venta_id":1,"metodo_id":1,"monto":5}') $q$, 'ya no tiene saldo');
select t('reabrir', $q$ (select public.reabrir_venta(1, 'Volvió a pagar')) $q$);
select igual('venta #1 activa', $q$ (select estado from public.ventas where id = 1) $q$, 'activa');
select t('anular venta con abonos', $q$ (select public.anular_venta(1, 'error')) $q$, 'Anúlalos primero');

-- Cliente que ya debía (carga inicial): $500, ya pagó $200, faltan 3 cuotas de $100 (una ya vencida)
select igual('carga inicial', $q$ public.registrar_venta(jsonb_build_object('cliente_id',2,'origen','carga_inicial','fecha','2026-07-01','items','[{"descripcion":"Juego de cuarto","precio":500}]'::jsonb,'pagado_antes',200,'frecuencia','mensual','cuotas',jsonb_build_array(jsonb_build_object('fecha',h(-3),'monto',100),jsonb_build_object('fecha',h(27),'monto',100),jsonb_build_object('fecha',h(57),'monto',100))))->>'saldo' $q$, '300.00');
select igual('pagado antes del sistema', $q$ (select tipo || '/' || monto_usd || '/' || coalesce(recibido_por::text, 'nadie') from public.abonos where venta_id = v(3)) $q$, 'antes_del_sistema/200.00/nadie');
select t('carga inicial ya pagada', $q$ public.registrar_venta('{"cliente_id":2,"origen":"carga_inicial","items":[{"descripcion":"X","precio":100}],"pagado_antes":100}') $q$, 'menor que el total');
select igual('cuadre 4', $q$ public.cuadre() $q$, 'todo cuadra');
-- Venta de contado (inicial = total): queda pagada y sin cuotas
select igual('venta de contado', $q$ public.registrar_venta('{"cliente_id":2,"items":[{"descripcion":"Plancha","precio":25}],"inicial":25,"pago_inicial":{"metodo_id":1,"monto":25}}')->>'saldo' $q$, '0.00');
select igual('contado queda pagada', $q$ (select frecuencia || '/' || estado || '/' || (select count(*) from public.cuotas c where c.venta_id = v.id) from public.ventas v order by id desc limit 1) $q$, 'contado/pagada/1');
reset role;

-- ===================== Empleado de Pedraza =====================
select como('E'); set role authenticated;
select igual('empleado ve solo Pedraza', $q$ (select count(*) || '/' || min(sede) || '/' || max(sede) from public.clientes) $q$, '1/pedraza/pedraza');
select igual('empleado no ve ventas de Socopó', $q$ (select count(*) from public.ventas where cliente_id = 1) $q$, '0');
select igual('empleado no ve abonos de Socopó', $q$ (select count(*) from public.abonos where cliente_id = 1) $q$, '0');
select igual('empleado no ve costos', $q$ (select count(*) from public.venta_item_costos) + (select count(*) from public.producto_costos) $q$, '0');
select t('empleado edita cliente de Socopó', $q$ public.guardar_cliente('{"id":1,"telefono":"1"}') $q$, 'no es de tu sede');
select igual('empleado crea cliente', $q$ public.guardar_cliente('{"nombre":"María Gil","cedula":"E-8.123.456","sede":"socopo","no_venderle":true}', '11111111-0000-0000-0000-000000000004')->>'id' $q$, '3');
select igual('queda en Pedraza y sin marca', $q$ (select sede || '/' || no_venderle || '/' || cedula from public.clientes where id = 3) $q$, 'pedraza/false/E8123456');
select t('empleado cédula de Socopó', $q$ public.guardar_cliente('{"nombre":"Copia","cedula":"12345678"}') $q$, 'en Socopó');
select t('empleado vende a cliente de Socopó', $q$ public.registrar_venta('{"cliente_id":1,"items":[{"descripcion":"X","precio":10}],"inicial":10}') $q$, 'no es de tu sede');
-- Venta hecha sin señal: el cliente se creó con una clave y la venta lo nombra por esa clave
select igual('empleado vende por clave del cliente', $q$ public.registrar_venta(jsonb_build_object('cliente_clave','11111111-0000-0000-0000-000000000004','items','[{"descripcion":"Nevera Mabe 14 pies","precio":320,"costo":1}]'::jsonb,'inicial',100,'pago_inicial','{"metodo_id":5,"monto":4000,"tasa":40}'::jsonb,'frecuencia','quincenal','cuotas',jsonb_build_array(jsonb_build_object('fecha',h(15),'monto',110),jsonb_build_object('fecha',h(30),'monto',110))), '22222222-0000-0000-0000-000000000005')->>'cliente_id' $q$, '3');
reset role;
select igual('costo del empleado ignorado (usa el último del dueño)', $q$ (select c.costo from public.venta_item_costos c join public.venta_items i on i.id = c.item_id join public.ventas v on v.id = i.venta_id where v.clave = '22222222-0000-0000-0000-000000000005') $q$, '200.00');
select como('E'); set role authenticated;
select igual('empleado ve su venta', $q$ (select count(*) from public.ventas) $q$, '3');
select t('empleado abona efectivo $', $q$ public.registrar_abono('{"cliente_id":3,"metodo_id":1,"monto":20}')->>'saldo_cliente' $q$);
select t('empleado abona pago móvil', $q$ public.registrar_abono('{"cliente_id":3,"metodo_id":4,"monto":400,"tasa":40,"referencia":"778899"}')->>'saldo_cliente' $q$);
select t('empleado abono de hace 10 días', $q$ public.registrar_abono(jsonb_build_object('cliente_id',3,'metodo_id',1,'monto',5,'fecha',h(-10))) $q$, 'más de 7 días');
select t('empleado dice que recibió otro', $q$ (select public.registrar_abono('{"cliente_id":3,"metodo_id":1,"monto":5,"recibido_por":"00000000-0000-0000-0000-00000000000a"}')->>'grupo') $q$);
select igual('recibido por él mismo', $q$ (select count(*) from public.abonos where recibido_por = '00000000-0000-0000-0000-00000000000e') $q$, '4');
select t('empleado anula abono', $q$ (select public.anular_abono(grupo, 'x') from public.abonos where cliente_id = 3 limit 1) $q$, 'Solo los dueños');
select t('empleado pone recargo', $q$ public.ajustar_venta(v(5), 'recargo', 5, 'x') $q$, 'Solo los dueños');
select t('empleado cambia la tasa', $q$ (select public.actualizar_tasa(50)) $q$, 'Solo los dueños');
select t('empleado registra entrega', $q$ public.registrar_entrega('00000000-0000-0000-0000-00000000000e', 1, 1) $q$, 'Solo los dueños');
select igual('resolver mi clave', $q$ public.resolver_clave('11111111-0000-0000-0000-000000000004')->>'id' $q$, '3');
select igual('no resuelve clave ajena', $q$ coalesce(public.resolver_clave('11111111-0000-0000-0000-000000000001')::text, 'nada') $q$, 'nada');
do $$ begin insert into public.ventas (numero, cliente_id, fecha, total, frecuencia) values (99, 3, current_date, 1, 'semanal');
  raise notice '!!! empleado insertó venta directo';
exception when others then raise notice 'ok  empleado no inserta directo → %', sqlerrm; end $$;
do $$ declare n int; begin update public.ventas set pagado = 0; get diagnostics n = row_count; raise notice '!!! empleado editó % ventas', n;
exception when others then raise notice 'ok  empleado no edita directo → %', sqlerrm; end $$;
do $$ begin perform interno.hoy(); raise notice '!!! empleado llamó una función interna';
exception when others then raise notice 'ok  funciones internas cerradas → %', sqlerrm; end $$;
do $$ begin perform count(*) from public.operaciones; raise notice '!!! empleado leyó operaciones';
exception when others then raise notice 'ok  operaciones cerradas → %', sqlerrm; end $$;
-- Fotos: solo en carpetas de clientes que ve
do $$ begin insert into storage.objects (bucket_id, name) values ('fotos', 'cli/1/robo.jpg'); raise notice '!!! empleado subió foto de cliente de Socopó';
exception when others then raise notice 'ok  empleado no sube a Socopó → %', sqlerrm; end $$;
insert into storage.objects (bucket_id, name) values ('fotos', 'cli/3/contrato-abc.jpg');
select t('foto del contrato', $q$ (select public.poner_foto('contrato', null, '22222222-0000-0000-0000-000000000005', 'cli/3/contrato-abc.jpg')) $q$);
select igual('contrato guardado', $q$ (select foto_contrato from public.ventas where clave = '22222222-0000-0000-0000-000000000005') $q$, 'cli/3/contrato-abc.jpg');
select t('foto no subida', $q$ (select public.poner_foto('cliente', 3, null, 'cli/3/no-existe.jpg')) $q$, 'todavía no se ha subido');
select t('foto de otro cliente', $q$ (select public.poner_foto('cliente', 3, null, 'cli/2/x.jpg')) $q$, 'no es de este cliente');
select t('ruta rara', $q$ (select public.poner_foto('cliente', 3, null, '../x.jpg')) $q$, 'no válida');
reset role;

-- ===================== Daniel (dueño) recibe la entrega de Pedraza =====================
select como('D'); set role authenticated;
select igual('por entregar', $q$ (select sum(a.monto) filter (where a.moneda = 'USD') || '/' || coalesce(sum(a.monto) filter (where a.moneda = 'VES'), 0) from public.abonos a join public.metodos_pago m on m.id = a.metodo_id where a.recibido_por = '00000000-0000-0000-0000-00000000000e' and m.en_mano and a.entrega_id is null and a.anulado_en is null) $q$, '25.00/4000.00');
select igual('entrega con faltante', $q$ (select (r->>'esperado_usd') || '/' || (r->>'esperado_bs') || '/' || (r->>'diferencia_usd') || '/' || (r->>'abonos') from public.registrar_entrega('00000000-0000-0000-0000-00000000000e', 20, 4000, 'Faltaron $5', '44444444-0000-0000-0000-000000000001') r) $q$, '25.00/4000.00/-5.00/3');
select igual('misma clave no repite entrega', $q$ public.registrar_entrega('00000000-0000-0000-0000-00000000000e', 20, 4000, null, '44444444-0000-0000-0000-000000000001')->>'numero' $q$, '1');
select t('nada pendiente', $q$ public.registrar_entrega('00000000-0000-0000-0000-00000000000e', 0, 0) $q$, 'No tiene efectivo pendiente');
select t('marcar no venderle', $q$ public.guardar_cliente('{"id":3,"no_venderle":true,"no_venderle_motivo":"Se atrasó mucho"}') $q$);
select t('quitar cliente con deuda', $q$ (select public.borrar_cliente(3, 'x')) $q$, 'ventas pendientes');
select t('dueño no se quita el permiso', $q$ (select public.actualizar_usuario('00000000-0000-0000-0000-00000000000b', 'Daniel', 'empleado', 'pedraza', true)) $q$, 'No te puedes quitar');
select t('método nuevo', $q$ public.guardar_metodo('{"nombre":"Binance Pay","moneda":"USD","pide_referencia":true}') $q$);
select t('costo corregido', $q$ (select public.poner_costo(1, 210)) $q$);
select igual('costo nuevo', $q$ (select costo from public.producto_costos where producto_id = 1) $q$, '210.00');
reset role;

select como('E'); set role authenticated;
select igual('empleado ve su entrega', $q$ (select count(*) from public.entregas) $q$, '1');
select t('no venderle bloquea al empleado', $q$ public.registrar_venta('{"cliente_id":3,"items":[{"descripcion":"X","precio":10}],"inicial":10}') $q$, 'no se le vende');
reset role;

select como('X'); set role authenticated;
select t('usuario inactivo', $q$ public.guardar_cliente('{"nombre":"Z","sede":"pedraza"}') $q$, 'no está activo');
select igual('inactivo no ve nada', $q$ (select count(*) from public.clientes) $q$, '0');
reset role;

select igual('cuadre final', $q$ public.cuadre() $q$, 'todo cuadra');
select igual('números sin huecos', $q$ (select string_agg(numero::text, ',' order by numero) from public.ventas) $q$, '1,2,3,4,5');
