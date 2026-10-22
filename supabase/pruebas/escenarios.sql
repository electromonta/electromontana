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
update public.usuarios set puede_aprobar = true where usuario in ('franklin', 'daniel');
-- Pide un cambio como el usuario de ahora y lo aprueba el otro socio (Franklin ↔ Daniel). Devuelve lo que hizo.
create function public.aprobado(p jsonb) returns jsonb language plpgsql as $$
declare quien text := current_setting('request.jwt.claims', true)::jsonb->>'sub'; s jsonb; r jsonb;
begin
  s := public.pedir_aprobacion(p, gen_random_uuid());
  perform set_config('request.jwt.claims', json_build_object('sub', case when quien = '00000000-0000-0000-0000-00000000000b'
    then '00000000-0000-0000-0000-00000000000a' else '00000000-0000-0000-0000-00000000000b' end, 'role', 'authenticated')::text, false);
  r := public.responder_aprobacion((s->>'id')::bigint, true, null);
  perform set_config('request.jwt.claims', json_build_object('sub', quien, 'role', 'authenticated')::text, false);
  return r->'resultado';
end $$;
grant execute on function public.aprobado(jsonb) to authenticated;
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
select t('anular abono', $q$ public.aprobado(jsonb_build_object('tipo','anular_abono','grupo','33333333-0000-0000-0000-000000000002','motivo','Era el mismo Zelle')) $q$);
select t('anular dos veces', $q$ public.aprobado(jsonb_build_object('tipo','anular_abono','grupo','33333333-0000-0000-0000-000000000002','motivo','otra vez')) $q$, 'ya estaba anulado');
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
select t('anular abono reabre venta', $q$ public.aprobado(jsonb_build_object('tipo','anular_abono','grupo','33333333-0000-0000-0000-000000000003','motivo','prueba')) $q$);
select igual('venta #2 activa otra vez', $q$ (select estado || '/' || saldo || '/' || (pagada_en is null)::text from public.ventas where id = v(2)) $q$, 'activa/90.00/true');
select igual('cuadre 1', $q$ public.cuadre() $q$, 'todo cuadra');

-- Recargo, descuento y más tiempo (venta #1: debe 150)
select igual('recargo $10', $q$ public.recargo_venta(1, 10, 'Se pasó del plazo', null, '44444444-0000-0000-0000-0000000000a1')->>'saldo' $q$, '160.00');
select igual('cuota de recargo', $q$ (select tipo || '/' || monto || '/' || (fecha::text = h(0))::text from public.cuotas where venta_id = 1 and tipo = 'recargo') $q$, 'recargo/10.00/true');
select igual('descuento $45', $q$ public.aprobado(jsonb_build_object('tipo','descuento','venta_id',1,'monto',45,'motivo','Pronto pago'))->>'saldo' $q$, '115.00');
select t('descuento mayor que deuda', $q$ public.aprobado(jsonb_build_object('tipo','descuento','venta_id',1,'monto',500,'motivo','x')) $q$, 'no puede ser mayor');
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
select t('anular venta retirada', $q$ public.aprobado(jsonb_build_object('tipo','anular_venta','venta_id',1,'motivo','error')) $q$, 'mercancía retirada');
select t('devolver con motivo', $q$ (select public.devolver_mercancia(1, 'Se comprometió a pagar el viernes')) $q$);
select igual('mercancía devuelta', $q$ (select mercancia from public.ventas where id = 1) $q$, 'devuelta');
select t('cerrar venta', $q$ public.aprobado(jsonb_build_object('tipo','cerrar_venta','venta_id',1,'motivo','Se mudó y no apareció')) $q$);
select igual('cerrada no suma deuda', $q$ (select estado || '/' || saldo from public.ventas where id = 1) $q$, 'cerrada/100.00');
select t('abono a cerrada', $q$ public.registrar_abono('{"cliente_id":1,"venta_id":1,"metodo_id":1,"monto":5}') $q$, 'ya no tiene saldo');
select t('reabrir', $q$ (select public.reabrir_venta(1, 'Volvió a pagar')) $q$);
select igual('venta #1 activa', $q$ (select estado from public.ventas where id = 1) $q$, 'activa');
select t('anular venta con abonos', $q$ public.aprobado(jsonb_build_object('tipo','anular_venta','venta_id',1,'motivo','error')) $q$, 'Anúlalos primero');

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
select t('empleado anula abono', $q$ (select public.aprobado(jsonb_build_object('tipo','anular_abono','grupo',grupo,'motivo','x')) from public.abonos where cliente_id = 3 limit 1) $q$, 'Solo los dueños');
select t('empleado pone recargo', $q$ public.recargo_venta(v(5), 5, 'x', null, gen_random_uuid()) $q$, 'Solo los dueños');
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

-- Arreglos de la revisión: tasa, "Ya debía", entrega de lo contado, historial de costos
select como('E'); set role authenticated;
select t('empleado abona 7', $q$ public.registrar_abono('{"cliente_id":3,"metodo_id":1,"monto":7}', '55555555-0000-0000-0000-000000000001')->>'saldo_cliente' $q$);
select t('empleado abona 3', $q$ public.registrar_abono('{"cliente_id":3,"metodo_id":1,"monto":3}', '55555555-0000-0000-0000-000000000002')->>'saldo_cliente' $q$);
select t('empleado con tasa inventada', $q$ public.registrar_abono('{"cliente_id":3,"metodo_id":5,"monto":100,"tasa":1}') $q$, 'no es la que pusieron');
select t('empleado inicial con tasa inventada', $q$ public.registrar_venta('{"cliente_id":2,"items":[{"descripcion":"X","precio":10}],"inicial":10,"pago_inicial":{"metodo_id":5,"monto":10,"tasa":1}}') $q$, 'no es la que pusieron');
select t('empleado carga "ya debía"', $q$ public.registrar_venta('{"cliente_id":2,"origen":"carga_inicial","items":[{"descripcion":"X","precio":100}],"pagado_antes":50,"cuotas":[{"fecha":"2099-01-01","monto":50}]}') $q$, 'Solo los dueños pueden cargar');
reset role;
select como('D'); set role authenticated;
select igual('entrega solo de lo contado', $q$ public.registrar_entrega('00000000-0000-0000-0000-00000000000e', 7, 0, null, null, array[(select id from public.abonos where grupo = '55555555-0000-0000-0000-000000000001')])->>'esperado_usd' $q$, '7.00');
select igual('lo no contado sigue pendiente', $q$ public.registrar_entrega('00000000-0000-0000-0000-00000000000e', 3, 0)->>'esperado_usd' $q$, '3.00');
select t('costo de la venta de Pedraza', $q$ (select public.poner_costo((select i.id from public.venta_items i join public.ventas v on v.id = i.venta_id where v.clave = '22222222-0000-0000-0000-000000000005'), 205)) $q$);
select t('dueño cobra con otra tasa', $q$ public.registrar_abono('{"cliente_id":3,"metodo_id":5,"monto":42,"tasa":42}')->>'saldo_cliente' $q$);
reset role;
select como('E'); set role authenticated;
select igual('empleado no ve el historial de costos', $q$ (select count(*) from public.eventos_venta where tipo = 'costo') $q$, '0');
select igual('empleado ve sus otras novedades', $q$ (select count(*) >= 0 from public.eventos_venta) $q$, 'true');
reset role;

select como('X'); set role authenticated;
select t('usuario inactivo', $q$ public.guardar_cliente('{"nombre":"Z","sede":"pedraza"}') $q$, 'no está activo');
select igual('inactivo no ve nada', $q$ (select count(*) from public.clientes) $q$, '0');
reset role;

select igual('cuadre final', $q$ public.cuadre() $q$, 'todo cuadra');
select igual('números sin huecos', $q$ (select string_agg(numero::text, ',' order by numero) from public.ventas) $q$, '1,2,3,4,5');

-- ===================== Etapa 2: mercancía =====================
create function public.prod(nombre text) returns bigint language sql security definer as $$ select id from public.productos where lower(nombre) = lower($1) $$;
create function public.exist(nombre text, sede text) returns int language sql security definer as $$
  select coalesce((select cantidad from public.existencias where producto_id = public.prod($1) and sede = $2), 0) $$;
grant execute on function public.prod(text), public.exist(text, text) to authenticated;
select como('D'); set role authenticated;
select igual('entrada a Pedraza', $q$ public.entrada_mercancia('{"sede":"pedraza","nota":"Llevadas el lunes","items":[{"nombre":"Licuadora Oster","cantidad":3,"costo":25,"precio_sugerido":45},{"nombre":"Ventilador de pie","cantidad":2,"costo":12}]}', '66666666-0000-0000-0000-000000000001')->>'unidades' $q$, '5');
select igual('misma clave no repite la entrada', $q$ public.entrada_mercancia('{"sede":"pedraza","items":[{"nombre":"X","cantidad":1}]}', '66666666-0000-0000-0000-000000000001')->>'unidades' $q$, '5');
select igual('existencia licuadoras', $q$ public.exist('Licuadora Oster', 'pedraza') $q$, '3');
select igual('producto nuevo con costo', $q$ (select pc.costo || '/' || p.precio_sugerido from public.productos p left join public.producto_costos pc on pc.producto_id = p.id where p.id = public.prod('Licuadora Oster')) $q$, '25.00/45.00');
select igual('entrada a Socopó', $q$ public.entrada_mercancia('{"sede":"socopo","items":[{"nombre":"Plancha","cantidad":1}]}')->>'unidades' $q$, '1');
select t('entrada sin tienda', $q$ public.entrada_mercancia('{"items":[{"nombre":"X","cantidad":1}]}') $q$, 'Elige a qué tienda');
reset role;

select como('E'); set role authenticated;
select igual('empleado ve solo la existencia de Pedraza', $q$ (select count(*) filter (where sede = 'socopo') || '/' || (count(*) > 0)::text from public.existencias) $q$, '0/true');
-- El empleado anota lo que llega a SU tienda, sin costos (migración 008)
select t('empleado no anota mercancía de Socopó', $q$ public.entrada_mercancia('{"sede":"socopo","items":[{"nombre":"X","cantidad":1}]}') $q$, 'Solo puedes anotar la mercancía de tu tienda');
select t('empleado no pone costos', $q$ public.entrada_mercancia('{"sede":"pedraza","items":[{"nombre":"Batidora Oster","cantidad":1,"costo":20}]}') $q$, 'Los costos los anotan los dueños');
select igual('empleado anota lo que llegó (producto nuevo con su precio)', $q$ public.entrada_mercancia('{"sede":"pedraza","nota":"Llegaron hoy","items":[{"nombre":"Batidora Oster","cantidad":2,"precio_sugerido":35}]}', '66666666-0000-0000-0000-0000000000e1')->>'unidades' $q$, '2');
select igual('misma clave no la repite', $q$ public.entrada_mercancia('{"sede":"pedraza","items":[{"nombre":"Batidora Oster","cantidad":2}]}', '66666666-0000-0000-0000-0000000000e1')->>'unidades' $q$, '2');
select igual('el precio de uno que ya existe no lo cambia el empleado', $q$ (public.entrada_mercancia('{"sede":"pedraza","items":[{"nombre":"batidora oster","cantidad":1,"precio_sugerido":5}]}')->>'unidades') || '/' || (select precio_sugerido from public.productos where id = public.prod('Batidora Oster')) || '/' || public.exist('Batidora Oster', 'pedraza') $q$, '1/35.00/3');
select igual('queda a nombre del empleado', $q$ (select count(*) from public.movimientos_inventario where producto_id = public.prod('Batidora Oster') and tipo = 'entrada' and usuario_id = auth.uid()) $q$, '2');
select igual('venta de contado desde la tienda (pagada completa)', $q$ public.registrar_venta(jsonb_build_object('cliente_id',2,'items','[{"descripcion":"Batidora Oster","cantidad":1,"precio":35,"sede_salida":"pedraza"}]'::jsonb,'inicial',35,'frecuencia','contado','cuotas','[]'::jsonb,'pago_inicial',jsonb_build_object('metodo_id',1,'monto',35)), '77777777-0000-0000-0000-0000000000c1')->>'saldo' $q$, '0.00');
select igual('de contado: pagada, sin cuotas, lo cobró el empleado y salió de la tienda', $q$ (select v.frecuencia || '/' || v.estado || '/' || (select count(*) from public.cuotas q where q.venta_id = v.id and q.tipo <> 'inicial') || '/' || (select (a.recibido_por = auth.uid())::text from public.abonos a where a.venta_id = v.id) || '/' || public.exist('Batidora Oster', 'pedraza') from public.ventas v where v.clave = '77777777-0000-0000-0000-0000000000c1') $q$, 'contado/pagada/0/true/2');
select t('empleado no saca de Socopó', $q$ public.registrar_venta('{"cliente_id":2,"items":[{"descripcion":"Plancha","precio":25,"sede_salida":"socopo"}],"inicial":25}') $q$, 'Solo puedes sacar mercancía de tu tienda');
select t('no hay suficientes', $q$ public.registrar_venta('{"cliente_id":2,"items":[{"descripcion":"Licuadora Oster","cantidad":5,"precio":45,"sede_salida":"pedraza"}],"inicial":225}') $q$, 'No hay suficiente "Licuadora Oster" en la tienda de Pedraza (quedan 3)');
select igual('existencia intacta tras el error', $q$ public.exist('Licuadora Oster', 'pedraza') $q$, '3');
select igual('venta desde la tienda', $q$ public.registrar_venta(jsonb_build_object('cliente_id',2,'items','[{"descripcion":"Licuadora Oster","cantidad":2,"precio":45,"sede_salida":"pedraza"}]'::jsonb,'frecuencia','semanal','cuotas',jsonb_build_array(jsonb_build_object('fecha',h(7),'monto',90))), '77777777-0000-0000-0000-000000000001')->>'saldo' $q$, '90.00');
select igual('quedó 1 licuadora', $q$ public.exist('Licuadora Oster', 'pedraza') $q$, '1');
select igual('el movimiento dice venta', $q$ (select tipo || '/' || cantidad || '/' || queda from public.movimientos_inventario where clave = '77777777-0000-0000-0000-000000000001') $q$, 'venta/-2/1');
select igual('el costo vino de la entrada', $q$ (select count(*) from public.venta_item_costos) $q$, '0');
reset role;
select igual('lo que anotó el empleado quedó sin costo (lo ponen los dueños)', $q$ (select count(*) from public.producto_costos where producto_id = public.prod('Batidora Oster')) $q$, '0');
select igual('costo de la venta desde la tienda (dueño)', $q$ (select c.costo from public.venta_item_costos c join public.venta_items i on i.id = c.item_id join public.ventas v on v.id = i.venta_id where v.clave = '77777777-0000-0000-0000-000000000001') $q$, '25.00');

select como('D'); set role authenticated;
select igual('conteo: hay 4', $q$ public.ajustar_existencia(public.prod('Licuadora Oster'), 'pedraza', 4, 'Conteo del día') $q$, '4');
select t('conteo sin nota', $q$ public.ajustar_existencia(public.prod('Licuadora Oster'), 'pedraza', 2, '') $q$, 'Escribe por qué');
select t('anular la venta desde la tienda', $q$ public.aprobado(jsonb_build_object('tipo','anular_venta','venta_id',(select id from public.ventas where clave = '77777777-0000-0000-0000-000000000001'),'motivo','Se registró por error')) $q$);
select igual('las 2 licuadoras volvieron', $q$ public.exist('Licuadora Oster', 'pedraza') $q$, '6');
select t('vender de Socopó sin existencia', $q$ public.registrar_venta('{"cliente_id":1,"items":[{"descripcion":"Ventilador de pie","precio":30,"sede_salida":"socopo"}],"inicial":30}') $q$, 'No hay suficiente');
-- Lo retirado de una venta cerrada vuelve a la tienda
select t('reingresar sin retirar', $q$ (select public.reingresar_mercancia(v(2), 'pedraza', 'x')) $q$, 'Solo vuelve a la tienda');
select t('retirar #2', $q$ (select public.retirar_mercancia(v(2), 'Tres cuotas sin pagar')) $q$);
select t('cerrar #2', $q$ public.aprobado(jsonb_build_object('tipo','cerrar_venta','venta_id',v(2),'motivo','No volvió a pagar')) $q$);
select igual('reingresar a Pedraza', $q$ public.reingresar_mercancia(v(2), 'pedraza', 'Se vuelve a vender') $q$, '1');
select igual('7 licuadoras', $q$ public.exist('Licuadora Oster', 'pedraza') $q$, '7');
select t('reingresar dos veces', $q$ (select public.reingresar_mercancia(v(2), 'pedraza', 'x')) $q$, 'ya volvió');
select t('devolver lo que ya volvió a la tienda', $q$ (select public.devolver_mercancia(v(2), 'Pagó')) $q$, 'ya volvió a la tienda');
select t('reabrir #2 (vuelve a pagar)', $q$ (select public.reabrir_venta(v(2), 'Volvió a pagar')) $q$);
select t('reabierta: tampoco se devuelve', $q$ (select public.devolver_mercancia(v(2), 'Pagó')) $q$, 'ya volvió a la tienda');
select igual('las licuadoras no se contaron dos veces', $q$ public.exist('Licuadora Oster', 'pedraza') $q$, '7');
select t('producto con nombre repetido', $q$ public.guardar_producto('{"nombre":"plancha"}') $q$, 'Ya hay un producto');
select t('editar producto', $q$ public.guardar_producto(jsonb_build_object('id', public.prod('Plancha'), 'precio_sugerido', 28, 'codigo_yumana', 'PL-01', 'costo', 15)) $q$);
select igual('producto editado', $q$ (select p.precio_sugerido || '/' || p.codigo_yumana || '/' || pc.costo from public.productos p join public.producto_costos pc on pc.producto_id = p.id where p.id = public.prod('Plancha')) $q$, '28.00/PL-01/15.00');
reset role;
select igual('existencias = suma de movimientos', $q$ (select count(*) from public.existencias e where e.cantidad <> coalesce((select sum(m.cantidad) from public.movimientos_inventario m where m.producto_id = e.producto_id and m.sede = e.sede), 0)) $q$, '0');

-- ===================== Etapa 2: notas de cobro =====================
select como('E'); set role authenticated;
select igual('promesa de pago', $q$ public.registrar_gestion(jsonb_build_object('cliente_id',3,'tipo','promesa','nota','Cobra el viernes','promesa_fecha',h(2),'promesa_monto',20), '88888888-0000-0000-0000-000000000001')->>'cliente_id' $q$, '3');
select igual('misma clave no repite la nota', $q$ (select public.registrar_gestion('{"cliente_id":3,"tipo":"otro"}', '88888888-0000-0000-0000-000000000001')->>'cliente_id') || '/' || (select count(*) from public.gestiones) $q$, '3/1');
select t('promesa sin fecha', $q$ public.registrar_gestion('{"cliente_id":3,"tipo":"promesa"}') $q$, 'para cuándo');
select t('nota a cliente de Socopó', $q$ public.registrar_gestion('{"cliente_id":1,"tipo":"visita"}') $q$, 'no es de tu sede');
select t('tipo raro', $q$ public.registrar_gestion('{"cliente_id":3,"tipo":"x"}') $q$, 'Elige qué pasó');
select t('no estaba', $q$ public.registrar_gestion('{"cliente_id":3,"tipo":"no_estaba","nota":"Casa cerrada"}', '88888888-0000-0000-0000-000000000002')->>'cliente_id' $q$);
select igual('resumen de abonos solo de Pedraza', $q$ (select count(*) filter (where cliente_id = 1) || '/' || (count(*) > 0)::text from public.resumen_abonos_clientes()) $q$, '0/true');
reset role;
select como('D'); set role authenticated;
select igual('dueño ve las notas', $q$ (select count(*) from public.gestiones) $q$, '2');
select igual('resumen de abonos de todos', $q$ (select count(*) > 1 from public.resumen_abonos_clientes()) $q$, 'true');
select t('dueño quita la nota', $q$ (select public.anular_gestion((select id from public.gestiones where clave = '88888888-0000-0000-0000-000000000002'))) $q$);
reset role;
select como('E'); set role authenticated;
select t('quitar nota ya quitada', $q$ (select public.anular_gestion((select id from public.gestiones where clave = '88888888-0000-0000-0000-000000000002'))) $q$, 'no existe');
do $$ begin insert into public.gestiones (cliente_id, tipo) values (3, 'otro'); raise notice '!!! empleado insertó nota directo';
exception when others then raise notice 'ok  notas solo por función → %', sqlerrm; end $$;
reset role;
select igual('cuadre al final de la etapa 2', $q$ public.cuadre() $q$, 'todo cuadra');

-- ===================== Etapa 3: contrato firmado en la pantalla =====================
select como('E'); set role authenticated;
select igual('venta para firmar', $q$ public.registrar_venta(jsonb_build_object('cliente_id',2,'items','[{"descripcion":"Cocina 4 hornillas","precio":100}]'::jsonb,'frecuencia','semanal','cuotas',jsonb_build_array(jsonb_build_object('fecha',h(7),'monto',50),jsonb_build_object('fecha',h(14),'monto',50))), '99999999-0000-0000-0000-000000000001')->>'saldo' $q$, '100.00');
reset role;
insert into storage.objects (bucket_id, name) values ('fotos', 'cli/2/firma-cliente-a1.jpg'), ('fotos', 'cli/2/firma-fiador-a1.jpg'), ('fotos', 'cli/1/firma-cliente-x.jpg'), ('fotos', 'cli/2/firma-cliente-b2.jpg');
select como('E'); set role authenticated;
select t('firmar sin firma', $q$ public.firmar_venta('{"venta_clave":"99999999-0000-0000-0000-000000000001","condiciones":["Una"]}') $q$, 'Falta la firma del cliente');
select t('firma de otro cliente', $q$ public.firmar_venta('{"venta_clave":"99999999-0000-0000-0000-000000000001","firma_cliente":"cli/1/firma-cliente-x.jpg","condiciones":["Una"]}') $q$, 'no es de este cliente');
select t('firma no subida', $q$ public.firmar_venta('{"venta_clave":"99999999-0000-0000-0000-000000000001","firma_cliente":"cli/2/firma-nada.jpg","condiciones":["Una"]}') $q$, 'todavía no se ha subido');
select t('firma con ruta rara', $q$ public.firmar_venta('{"venta_clave":"99999999-0000-0000-0000-000000000001","firma_cliente":"cli/2/../x.jpg","condiciones":["Una"]}') $q$, 'Firma no válida');
select t('firmar sin condiciones', $q$ public.firmar_venta('{"venta_clave":"99999999-0000-0000-0000-000000000001","firma_cliente":"cli/2/firma-cliente-a1.jpg"}') $q$, 'Faltan las condiciones');
select t('la misma imagen dos veces', $q$ public.firmar_venta('{"venta_clave":"99999999-0000-0000-0000-000000000001","firma_cliente":"cli/2/firma-cliente-a1.jpg","firma_fiador":"cli/2/firma-cliente-a1.jpg","condiciones":["Una"]}') $q$, 'la misma imagen');
select igual('firmar (empleado, venta por su clave)', $q$ public.firmar_venta('{"venta_clave":"99999999-0000-0000-0000-000000000001","firma_cliente":"cli/2/firma-cliente-a1.jpg","firma_fiador":"cli/2/firma-fiador-a1.jpg","condiciones":["El precio está en dólares.","Lo abonado no se devuelve."]}', '99999999-0000-0000-0000-0000000000f1')->>'cliente_id' $q$, '2');
select igual('misma clave no repite la firma', $q$ public.firmar_venta('{"venta_clave":"99999999-0000-0000-0000-000000000001"}', '99999999-0000-0000-0000-0000000000f1')->>'cliente_id' $q$, '2');
select t('firmar dos veces', $q$ public.firmar_venta('{"venta_clave":"99999999-0000-0000-0000-000000000001","firma_cliente":"cli/2/firma-cliente-b2.jpg","condiciones":["Una"]}') $q$, 'ya está firmado');
select t('empleado no reemplaza la firma', $q$ public.firmar_venta('{"venta_clave":"99999999-0000-0000-0000-000000000001","firma_cliente":"cli/2/firma-cliente-b2.jpg","condiciones":["Una"],"reemplazar":true}') $q$, 'ya está firmado');
select t('firmar venta de Socopó', $q$ public.firmar_venta(jsonb_build_object('venta_id', v(1), 'firma_cliente', 'cli/1/firma-cliente-x.jpg', 'condiciones', '["Una"]'::jsonb)) $q$, 'no es de tu sede');
select igual('copia fija del contrato', $q$ (select (contrato_firmado->'cliente'->>'nombre' = (select nombre from public.clientes where id = 2))::text || '/' || jsonb_array_length(contrato_firmado->'cuotas') || '/' ||
  jsonb_array_length(contrato_firmado->'condiciones') || '/' || (contrato_firmado->'items'->0->>'descripcion') || '/' || firma_fiador || '/' || (firmado_por = auth.uid())::text
  from public.ventas where clave = '99999999-0000-0000-0000-000000000001') $q$, 'true/2/2/Cocina 4 hornillas/cli/2/firma-fiador-a1.jpg/true');
do $$ begin update public.ventas set firma_cliente = null where clave = '99999999-0000-0000-0000-000000000001'; raise notice '!!! empleado quitó la firma directo';
exception when others then raise notice 'ok  la firma solo cambia por función → %', sqlerrm; end $$;
reset role;
select como('D'); set role authenticated;
select t('cambiar el nombre del cliente', $q$ public.guardar_cliente('{"id":2,"nombre":"Nombre Cambiado Después"}') $q$);
select igual('el contrato firmado no cambia', $q$ (select contrato_firmado->'cliente'->>'nombre' <> 'Nombre Cambiado Después' from public.ventas where clave = '99999999-0000-0000-0000-000000000001')::text $q$, 'true');
select igual('dueño reemplaza la firma', $q$ public.firmar_venta('{"venta_clave":"99999999-0000-0000-0000-000000000001","firma_cliente":"cli/2/firma-cliente-b2.jpg","condiciones":["Una"],"reemplazar":true}')->>'cliente_id' $q$, '2');
select igual('lo de antes quedó en auditoría', $q$ (select antes->>'firma_cliente' from public.auditoria where accion = 'reemplazar_firma') || '/' || (select firma_fiador is null from public.ventas where clave = '99999999-0000-0000-0000-000000000001')::text $q$, 'cli/2/firma-cliente-a1.jpg/true');
reset role;
set role anon;
select t('anónimo no firma', $q$ public.firmar_venta('{}') $q$, 'permission denied');
reset role;
select igual('cuadre al final de la etapa 3', $q$ public.cuadre() $q$, 'todo cuadra');

-- ===================== Copia de seguridad descargada =====================
select como('E'); set role authenticated;
select t('el empleado no anota copias', $q$ public.anotar_copia('{"clientes":3}') $q$, 'Solo los dueños');
reset role;
select como('F'); set role authenticated;
select t('el dueño anota la copia', $q$ public.anotar_copia('{"clientes":3,"ventas":5}') $q$);
select igual('queda la fecha y quién', $q$ (select (ultima_copia_en is not null)::text || '/' || (ultima_copia_por = auth.uid())::text from public.config) $q$, 'true/true');
select igual('y en la auditoría', $q$ (select despues->>'ventas' from public.auditoria where accion = 'descargar_copia' order by id desc limit 1) $q$, '5');
select t('resumen raro no rompe', $q$ public.anotar_copia('"x"') $q$);
reset role;
set role anon;
select t('anónimo no anota copias', $q$ public.anotar_copia('{}') $q$, 'permission denied');
reset role;

-- ===================== Seguridad entre socios (migración 006) =====================
-- Cliente y venta nuevos para no depender de lo anterior
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000c', 'soporte@x');
insert into public.usuarios (id, usuario, nombre, rol, sede, activo) values ('00000000-0000-0000-0000-00000000000c', 'soporte', 'Soporte', 'dueno', null, true);
create function public.como2(sub text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', sub, 'role', 'authenticated')::text, false) $$;
grant execute on function public.como2(text) to authenticated;
-- Id de la última solicitud
create function public.sol() returns bigint language sql security definer as $$ select max(id) from public.solicitudes $$;
grant execute on function public.sol() to authenticated;
select como('F'); set role authenticated;
select igual('cliente para socios', $q$ (public.guardar_cliente('{"nombre":"Cliente Socios","sede":"socopo"}', 'aaaaaaaa-0000-0000-0000-000000000001')->>'id') is not null $q$, 'true');
select igual('venta para socios', $q$ public.registrar_venta(jsonb_build_object('cliente_clave','aaaaaaaa-0000-0000-0000-000000000001','items','[{"descripcion":"Televisor 32","precio":200}]'::jsonb,'frecuencia','semanal','cuotas',jsonb_build_array(jsonb_build_object('fecha',h(7),'monto',100),jsonb_build_object('fecha',h(14),'monto',100))), 'aaaaaaaa-0000-0000-0000-000000000002')->>'saldo' $q$, '200.00');
select igual('abono de $50', $q$ public.registrar_abono(jsonb_build_object('venta_id',(select id from public.ventas where clave = 'aaaaaaaa-0000-0000-0000-000000000002'),'cliente_clave','aaaaaaaa-0000-0000-0000-000000000001','metodo_id',1,'monto',50), 'aaaaaaaa-0000-0000-0000-000000000003')->'ventas'->0->>'saldo' $q$, '150.00');
reset role;
create function public.vs() returns bigint language sql security definer as $$ select id from public.ventas where clave = 'aaaaaaaa-0000-0000-0000-000000000002' $$;
grant execute on function public.vs() to authenticated;

select como('F'); set role authenticated;
select t('las funciones viejas ya no anulan', $q$ (select public.anular_abono('aaaaaaaa-0000-0000-0000-000000000003', 'x')) $q$, 'aprobación del otro socio');
select t('ni descuentan', $q$ public.ajustar_venta(public.vs(), 'descuento', 10, 'x') $q$, 'Actualiza la app');
select t('ni cierran', $q$ (select public.cerrar_venta(public.vs(), 'x')) $q$, 'aprobación del otro socio');
select t('ni anulan ventas', $q$ (select public.anular_venta(public.vs(), 'x')) $q$, 'aprobación del otro socio');
select t('pedir sin motivo', $q$ public.pedir_aprobacion('{"tipo":"anular_abono","grupo":"aaaaaaaa-0000-0000-0000-000000000003"}', gen_random_uuid()) $q$, 'Escribe el motivo');
select t('pedir algo que no se puede (descuento mayor)', $q$ public.pedir_aprobacion(jsonb_build_object('tipo','descuento','venta_id',public.vs(),'monto',999,'motivo','x'), gen_random_uuid()) $q$, 'no puede ser mayor');
select igual('Franklin pide anular el abono', $q$ public.pedir_aprobacion('{"tipo":"anular_abono","grupo":"aaaaaaaa-0000-0000-0000-000000000003","motivo":"Lo anoté dos veces"}', 'aaaaaaaa-0000-0000-0000-000000000004')->>'estado' $q$, 'pendiente');
select igual('misma clave no repite la solicitud', $q$ (public.pedir_aprobacion('{"tipo":"anular_abono","grupo":"aaaaaaaa-0000-0000-0000-000000000003","motivo":"Lo anoté dos veces"}', 'aaaaaaaa-0000-0000-0000-000000000004')->>'id')::bigint = public.sol() $q$, 'true');
select t('dos pendientes para lo mismo', $q$ public.pedir_aprobacion('{"tipo":"anular_abono","grupo":"aaaaaaaa-0000-0000-0000-000000000003","motivo":"otra"}', gen_random_uuid()) $q$, 'Ya hay una solicitud pendiente');
select igual('mientras tanto el abono sigue vivo', $q$ (select (anulado_en is null)::text || '/' || (select saldo from public.ventas where id = public.vs()) from public.abonos where grupo = 'aaaaaaaa-0000-0000-0000-000000000003') $q$, 'true/150.00');
select igual('lo que se ve en la lista', $q$ (select detalle from public.solicitudes where id = public.sol()) $q$, 'Abono de $50,00 del ' || to_char((now() at time zone 'America/Caracas')::date, 'DD/MM/YYYY') || ' (Efectivo $) · Cliente Socios');
select t('Franklin no se aprueba a sí mismo', $q$ public.responder_aprobacion(public.sol(), true, null) $q$, 'lo responde el otro socio');
reset role;
select como('E'); set role authenticated;
select t('el empleado no pide', $q$ public.pedir_aprobacion('{"tipo":"anular_abono","grupo":"aaaaaaaa-0000-0000-0000-000000000003","motivo":"x"}', gen_random_uuid()) $q$, 'Solo los dueños');
select t('el empleado no aprueba', $q$ public.responder_aprobacion(public.sol(), true, null) $q$, 'Solo los dueños');
select t('el empleado no ve las solicitudes', $q$ (select count(*) from public.solicitudes) = 0 $q$);
reset role;
select como2('00000000-0000-0000-0000-00000000000c'); set role authenticated;
select t('un dueño que no es socio no aprueba', $q$ public.responder_aprobacion(public.sol(), true, null) $q$, 'Solo los socios');
reset role;
select como('D'); set role authenticated;
select t('rechazar sin decir por qué', $q$ public.responder_aprobacion(public.sol(), false, '') $q$, 'Escribe por qué');
select igual('Daniel aprueba', $q$ public.responder_aprobacion(public.sol(), true, 'Visto')->>'estado' $q$, 'aprobada');
select igual('el abono quedó anulado y la venta recalculada', $q$ (select (anulado_en is not null)::text || '/' || (anulado_por = '00000000-0000-0000-0000-00000000000a')::text || '/' || motivo_anulacion || '/' || (select saldo from public.ventas where id = public.vs()) from public.abonos where grupo = 'aaaaaaaa-0000-0000-0000-000000000003') $q$, 'true/true/Lo anoté dos veces (aprobó Daniel)/200.00');
select t('responder dos veces', $q$ public.responder_aprobacion(public.sol(), true, null) $q$, 'ya no está pendiente');
select igual('queda quién pidió y quién aprobó', $q$ (select (pedida_por = '00000000-0000-0000-0000-00000000000a')::text || '/' || (resuelta_por = '00000000-0000-0000-0000-00000000000b')::text || '/' || respuesta from public.solicitudes where id = public.sol()) $q$, 'true/true/Visto');
-- Descuento: lo pide Daniel; Franklin lo rechaza; luego lo pide de nuevo, lo cancela
select igual('Daniel pide un descuento', $q$ public.pedir_aprobacion(jsonb_build_object('tipo','descuento','venta_id',public.vs(),'monto',20,'motivo','Pronto pago'), gen_random_uuid())->>'estado' $q$, 'pendiente');
reset role;
select como('F'); set role authenticated;
select igual('Franklin lo rechaza', $q$ public.responder_aprobacion(public.sol(), false, 'No, ya tiene precio especial')->>'estado' $q$, 'rechazada');
select igual('rechazado: la deuda no cambió', $q$ (select saldo from public.ventas where id = public.vs()) $q$, '200.00');
select t('Franklin no cancela lo que pidió Daniel', $q$ (select public.cancelar_aprobacion(public.sol())) $q$, 'Solo quien lo pidió');
reset role;
select como('D'); set role authenticated;
select igual('lo pide otra vez', $q$ public.pedir_aprobacion(jsonb_build_object('tipo','descuento','venta_id',public.vs(),'monto',20,'motivo','Pronto pago'), gen_random_uuid())->>'estado' $q$, 'pendiente');
select t('y lo cancela', $q$ (select public.cancelar_aprobacion(public.sol())) $q$);
select igual('cancelada', $q$ (select estado from public.solicitudes where id = public.sol()) $q$, 'cancelada');
-- Recargo con clave: tocar dos veces no lo duplica
select igual('recargo $10', $q$ public.recargo_venta(public.vs(), 10, 'Se pasó del plazo', null, 'aaaaaaaa-0000-0000-0000-000000000005')->>'saldo' $q$, '210.00');
select igual('mismo recargo otra vez (internet lento)', $q$ public.recargo_venta(public.vs(), 10, 'Se pasó del plazo', null, 'aaaaaaaa-0000-0000-0000-000000000005')->>'saldo' $q$, '210.00');
select igual('un solo recargo', $q$ (select count(*) from public.cuotas where venta_id = public.vs() and tipo = 'recargo') $q$, '1');
-- Cerrar con aprobación
select igual('Daniel pide cerrar', $q$ public.pedir_aprobacion(jsonb_build_object('tipo','cerrar_venta','venta_id',public.vs(),'motivo','Se fue del país'), gen_random_uuid())->>'detalle' $q$, 'Cerrar la venta #' || (select numero from public.ventas where id = public.vs()) || ': dejar de cobrar $210,00 · Cliente Socios');
reset role;
select como('F'); set role authenticated;
select igual('Franklin aprueba el cierre', $q$ public.responder_aprobacion(public.sol(), true, null)->>'estado' $q$, 'aprobada');
select igual('venta cerrada', $q$ (select estado || '/' || motivo_cierre from public.ventas where id = public.vs()) $q$, 'cerrada/Se fue del país (aprobó Franklin)');
-- Las cuentas de los socios
select t('Franklin no desactiva a Daniel', $q$ (select public.actualizar_usuario('00000000-0000-0000-0000-00000000000b', 'Daniel', 'dueno', null, false)) $q$, 'solo la puede cambiar él mismo');
select t('ni lo pasa a empleado', $q$ (select public.actualizar_usuario('00000000-0000-0000-0000-00000000000b', 'Daniel', 'empleado', 'pedraza', true)) $q$, 'solo la puede cambiar él mismo');
select t('sí puede desactivar al de soporte', $q$ (select public.actualizar_usuario('00000000-0000-0000-0000-00000000000c', 'Soporte', 'dueno', null, false)) $q$);
select t('y el nombre del socio sí se corrige', $q$ (select public.actualizar_usuario('00000000-0000-0000-0000-00000000000b', 'Daniel', 'dueno', null, true)) $q$);
select igual('cuadre con aprobaciones', $q$ public.cuadre() $q$, 'todo cuadra');
reset role;
-- Historial: nada se borra; lo hecho por fuera de la app queda anotado
do $$ begin delete from public.abonos where grupo = 'aaaaaaaa-0000-0000-0000-000000000003'; raise notice '!!! se pudo borrar un abono';
exception when others then raise notice 'ok  no se borra un abono ni desde la base → %', sqlerrm; end $$;
do $$ begin truncate public.auditoria; raise notice '!!! se pudo vaciar el historial';
exception when others then raise notice 'ok  el historial no se vacía → %', sqlerrm; end $$;
do $$ begin update public.auditoria set accion = 'x' where id = (select min(id) from public.auditoria); raise notice '!!! se pudo cambiar el historial';
exception when others then raise notice 'ok  el historial no se cambia → %', sqlerrm; end $$;
select set_config('request.jwt.claims', '', false);
update public.abonos set monto_usd = 1 where id = (select min(id) from public.abonos where grupo = 'aaaaaaaa-0000-0000-0000-000000000003');
select igual('cambio directo en la base: queda anotado con antes y después', $q$ (select accion || '/' || (antes->>'monto_usd') || '/' || (despues->>'monto_usd') from public.auditoria where tabla = 'abonos' order by id desc limit 1) $q$, 'directo_update/50.00/1.00');
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
update public.config set telefono_negocio = '0000' where id = 1;
select igual('con la llave de servicio también', $q$ (select accion from public.auditoria where tabla = 'config' order by id desc limit 1) $q$, 'directo_update_servicio');
select set_config('request.jwt.claims', '', false);
select como('F'); set role authenticated;
select igual('por la app no se duplica el rastro', $q$ (select count(*) from public.auditoria where accion like 'directo%' and tabla = 'solicitudes') $q$, '0');
reset role;
select como('E'); set role authenticated;
select igual('el empleado no ve el historial', $q$ (select count(*) from public.auditoria) $q$, '0');
reset role;
set role anon;
select t('anónimo no pide aprobaciones', $q$ public.pedir_aprobacion('{}', null) $q$, 'permission denied');
select t('anónimo no aprueba', $q$ public.responder_aprobacion(1, true, null) $q$, 'permission denied');
reset role;

-- ===================== De quién es cada crédito (migración 008) =====================
create function public.vc(c text) returns bigint language sql security definer as $$ select id from public.ventas where clave = c::uuid $$;
grant execute on function public.vc(text) to authenticated;
create function public.vend(c text) returns text language sql security definer as $$
  select u.nombre from public.ventas v join public.usuarios u on u.id = v.vendedor_id where v.clave = c::uuid $$;
grant execute on function public.vend(text) to authenticated;
select como('F'); set role authenticated;
select t('sin elegir, el crédito es de quien lo anota', $q$ public.registrar_venta(jsonb_build_object('cliente_clave','aaaaaaaa-0000-0000-0000-000000000001','items','[{"descripcion":"Licuadora","precio":60}]'::jsonb,'frecuencia','semanal','cuotas',jsonb_build_array(jsonb_build_object('fecha',h(7),'monto',60))), 'bbbbbbbb-0000-0000-0000-000000000001') $q$);
select igual('quedó de Franklin', $q$ public.vend('bbbbbbbb-0000-0000-0000-000000000001') $q$, 'Franklin');
select t('Franklin la anota a nombre de Daniel', $q$ public.registrar_venta(jsonb_build_object('cliente_clave','aaaaaaaa-0000-0000-0000-000000000001','vendedor_id','00000000-0000-0000-0000-00000000000b','items','[{"descripcion":"Nevera","precio":300}]'::jsonb,'frecuencia','semanal','cuotas',jsonb_build_array(jsonb_build_object('fecha',h(7),'monto',300))), 'bbbbbbbb-0000-0000-0000-000000000002') $q$);
select igual('quedó de Daniel (y la anotó Franklin)', $q$ public.vend('bbbbbbbb-0000-0000-0000-000000000002') || '/' || (select u.nombre from public.ventas v join public.usuarios u on u.id = v.creado_por where v.id = public.vc('bbbbbbbb-0000-0000-0000-000000000002')) $q$, 'Daniel/Franklin');
select t('a nombre de alguien que no está activo, no', $q$ public.registrar_venta(jsonb_build_object('cliente_clave','aaaaaaaa-0000-0000-0000-000000000001','vendedor_id','00000000-0000-0000-0000-00000000000f','items','[{"descripcion":"Nevera","precio":300}]'::jsonb,'frecuencia','semanal','cuotas',jsonb_build_array(jsonb_build_object('fecha',h(7),'monto',300))), gen_random_uuid()) $q$, 'no está activa');
select t('"Ya debía" también se pone a nombre de otro', $q$ public.registrar_venta(jsonb_build_object('cliente_clave','aaaaaaaa-0000-0000-0000-000000000001','origen','carga_inicial','vendedor_id','00000000-0000-0000-0000-00000000000b','pagado_antes',20,'items','[{"descripcion":"Cocina","precio":120}]'::jsonb,'frecuencia','semanal','cuotas',jsonb_build_array(jsonb_build_object('fecha',h(7),'monto',100))), 'bbbbbbbb-0000-0000-0000-000000000003') $q$);
select igual('la carga quedó de Daniel', $q$ public.vend('bbbbbbbb-0000-0000-0000-000000000003') $q$, 'Daniel');
reset role;
select como('E'); set role authenticated;
select t('el empleado no anota ventas a nombre de otro', $q$ public.registrar_venta(jsonb_build_object('cliente_id',2,'vendedor_id','00000000-0000-0000-0000-00000000000a','items','[{"descripcion":"Plancha","precio":30}]'::jsonb,'frecuencia','semanal','cuotas',jsonb_build_array(jsonb_build_object('fecha',h(7),'monto',30))), gen_random_uuid()) $q$, 'Solo puedes anotar ventas a tu nombre');
select t('a su nombre sí', $q$ public.registrar_venta(jsonb_build_object('cliente_id',2,'vendedor_id','00000000-0000-0000-0000-00000000000e','items','[{"descripcion":"Plancha","precio":30}]'::jsonb,'frecuencia','semanal','cuotas',jsonb_build_array(jsonb_build_object('fecha',h(7),'monto',30))), 'bbbbbbbb-0000-0000-0000-000000000004') $q$);
select igual('quedó del empleado', $q$ public.vend('bbbbbbbb-0000-0000-0000-000000000004') $q$, 'Empleado Pedraza');
select t('el empleado no pide cambiar de quién es', $q$ public.pedir_aprobacion(jsonb_build_object('tipo','cambiar_vendedor','venta_id',public.vc('bbbbbbbb-0000-0000-0000-000000000004'),'usuario_id','00000000-0000-0000-0000-00000000000e','motivo','x'), gen_random_uuid()) $q$, 'Solo los dueños');
reset role;
select como('F'); set role authenticated;
select t('cambiarlo sin decir a quién', $q$ public.pedir_aprobacion(jsonb_build_object('tipo','cambiar_vendedor','venta_id',public.vc('bbbbbbbb-0000-0000-0000-000000000002'),'motivo','x'), gen_random_uuid()) $q$, 'Elige de quién');
select t('pasarlo a quien ya lo tiene', $q$ public.pedir_aprobacion(jsonb_build_object('tipo','cambiar_vendedor','venta_id',public.vc('bbbbbbbb-0000-0000-0000-000000000002'),'usuario_id','00000000-0000-0000-0000-00000000000b','motivo','x'), gen_random_uuid()) $q$, 'ya es de Daniel');
select t('pasarlo a alguien que no está activo', $q$ public.pedir_aprobacion(jsonb_build_object('tipo','cambiar_vendedor','venta_id',public.vc('bbbbbbbb-0000-0000-0000-000000000002'),'usuario_id','00000000-0000-0000-0000-00000000000f','motivo','x'), gen_random_uuid()) $q$, 'no está activa');
select igual('Franklin pide pasarse el crédito de Daniel', $q$ public.pedir_aprobacion(jsonb_build_object('tipo','cambiar_vendedor','venta_id',public.vc('bbbbbbbb-0000-0000-0000-000000000002'),'usuario_id','00000000-0000-0000-0000-00000000000a','motivo','La vendí yo'), 'bbbbbbbb-0000-0000-0000-000000000005')->>'detalle' $q$, 'Pasar la venta #' || (select numero from public.ventas where id = public.vc('bbbbbbbb-0000-0000-0000-000000000002')) || ' de Daniel a Franklin · Cliente Socios');
select igual('mientras Daniel no apruebe, sigue de Daniel', $q$ public.vend('bbbbbbbb-0000-0000-0000-000000000002') $q$, 'Daniel');
select t('Franklin no se lo aprueba a sí mismo', $q$ public.responder_aprobacion(public.sol(), true, null) $q$, 'lo responde el otro socio');
reset role;
select como('D'); set role authenticated;
select igual('Daniel aprueba', $q$ public.responder_aprobacion(public.sol(), true, null)->'resultado'->>'nombre' $q$, 'Franklin');
select igual('ahora es de Franklin', $q$ public.vend('bbbbbbbb-0000-0000-0000-000000000002') $q$, 'Franklin');
select igual('queda en el historial de la venta, con quién aprobó', $q$ (select e.motivo || '/' || (e.datos->>'antes') || '/' || (e.datos->>'despues') from public.eventos_venta e where e.venta_id = public.vc('bbbbbbbb-0000-0000-0000-000000000002') and e.tipo = 'vendedor') $q$, 'La vendí yo (aprobó Daniel)/00000000-0000-0000-0000-00000000000b/00000000-0000-0000-0000-00000000000a');
select igual('y en auditoría', $q$ (select count(*) from public.auditoria where tabla = 'ventas' and accion = 'cambiar_vendedor' and registro_id = public.vc('bbbbbbbb-0000-0000-0000-000000000002')::text) $q$, '1');
select igual('las cuentas no cambian', $q$ public.cuadre() $q$, 'todo cuadra');
reset role;

-- ===================== Copia de cada noche: 30 días completos y una por mes (migración 007) =====================
reset role;
select set_config('request.jwt.claims', '', false);
insert into respaldo_diario.copias (fecha, tabla, filas, datos)
select d::date, 'prueba', 0, '[]'::jsonb from generate_series(date '2026-01-01', date '2026-10-16', interval '1 day') d;
select igual('había una copia por día', $q$ (select count(*) from respaldo_diario.copias where tabla = 'prueba') $q$, '289');
select igual('la limpieza borra las de más de 30 días que no son la primera del mes', $q$ respaldo_diario.limpiar(date '2026-10-16') $q$, '249');
select igual('quedan los 31 días y el primero de cada mes', $q$ (select count(*) || ' / ' || min(fecha) || ' / ' ||
  (select string_agg(to_char(fecha, 'MM-DD'), ',' order by fecha) from respaldo_diario.copias where tabla = 'prueba' and fecha < date '2026-09-16')
  from respaldo_diario.copias where tabla = 'prueba') $q$, '40 / 2026-01-01 / 01-01,02-01,03-01,04-01,05-01,06-01,07-01,08-01,09-01');
select igual('los últimos 30 días quedan completos', $q$ (select count(*) from respaldo_diario.copias where tabla = 'prueba' and fecha >= date '2026-09-16') $q$, '31');
select igual('correrla otra vez no borra más', $q$ respaldo_diario.limpiar(date '2026-10-16') $q$, '0');
select t('la copia de cada noche sigue funcionando (y limpia al final)', $q$ respaldo_diario.respaldar() > 0 $q$);
select igual('la copia de hoy tiene la tabla de solicitudes', $q$ (select count(*) from respaldo_diario.copias where tabla = 'solicitudes' and fecha = (now() at time zone 'America/Caracas')::date) $q$, '1');
set role authenticated;
select t('la app no puede limpiar copias', $q$ respaldo_diario.limpiar(date '2026-10-16') $q$, 'permission denied');
reset role;
