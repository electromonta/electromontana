-- =====================================================================
-- Electro Montana — el empleado anota la mercancía que llega a SU tienda, y de quién es cada crédito (migración 008).
-- Pedido de Franklin y Daniel (2026-10-22): que el encargado de Pedraza pueda agregar productos.
--   - Solo en su tienda (su sede).
--   - Sin costos: el costo lo anotan los dueños (el empleado no lo ve ni lo puede poner).
--   - El precio solo lo pone en un producto NUEVO; el de los que ya existen lo deciden los dueños.
--   - Queda a su nombre en los movimientos de la mercancía (los dueños lo ven en cada producto).
-- Los dueños siguen igual que antes. El conteo (ajustar existencia) sigue siendo solo de los dueños.
-- =====================================================================
create or replace function public.entrada_mercancia(p jsonb, p_clave uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  u public.usuarios; v_prev jsonb; it jsonb; v_prod bigint; v_cant int; v_costo numeric; v_precio numeric; v_nuevo boolean;
  v_sede text := nullif(p->>'sede', ''); v_n int := 0; v_unidades int := 0; v_res jsonb; v_dueno boolean;
begin
  u := interno.yo();
  v_dueno := u.rol = 'dueno';
  v_prev := interno.idem_inicio(p_clave, 'entrada');
  if v_prev is not null then return v_prev; end if;
  if v_sede is null or v_sede not in ('socopo','pedraza') then raise exception 'Elige a qué tienda entra la mercancía.'; end if;
  if not v_dueno and v_sede is distinct from u.sede then raise exception 'Solo puedes anotar la mercancía de tu tienda.'; end if;
  if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') = 0 then
    raise exception 'Agrega la mercancía que entra.';
  end if;
  if jsonb_array_length(p->'items') > 100 then raise exception 'Son demasiados productos en una entrada.'; end if;
  for it in select value from jsonb_array_elements(p->'items') loop
    v_costo := round(nullif(it->>'costo', '')::numeric, 2);
    if v_costo is not null and not v_dueno then raise exception 'Los costos los anotan los dueños.'; end if;
    -- ¿El producto ya existía? (por id o por nombre)
    v_nuevo := not exists (select 1 from public.productos x
                            where x.id = nullif(it->>'producto_id', '')::bigint
                               or lower(x.nombre) = lower(trim(coalesce(it->>'nombre', ''))));
    v_prod := interno.producto_por_nombre(nullif(it->>'producto_id', '')::bigint, interno.texto(it, 'nombre', 200), u);
    v_cant := nullif(it->>'cantidad', '')::int;
    if v_cant is null or v_cant < 1 or v_cant > 9999 then raise exception 'Cantidad no válida.'; end if;
    if v_costo is not null then
      if v_costo < 0 then raise exception 'El costo no puede ser negativo.'; end if;
      insert into public.producto_costos (producto_id, costo) values (v_prod, v_costo)
      on conflict (producto_id) do update set costo = excluded.costo, actualizado_en = now();
    end if;
    v_precio := round(nullif(it->>'precio_sugerido', '')::numeric, 2);
    if v_precio is not null and v_precio >= 0 and (v_dueno or v_nuevo) then
      update public.productos set precio_sugerido = v_precio where id = v_prod;
    end if;
    perform interno.mover_stock(v_prod, v_sede, v_cant, 'entrada', null, null, interno.texto(p, 'nota', 300), p_clave);
    v_n := v_n + 1;
    v_unidades := v_unidades + v_cant;
  end loop;
  v_res := jsonb_build_object('productos', v_n, 'unidades', v_unidades, 'sede', v_sede);
  perform interno.idem_fin(p_clave, v_res);
  return v_res;
end $$;
-- La firma no cambia, así que conserva sus permisos (solo authenticated); se repite por si acaso.
revoke execute on function public.entrada_mercancia(jsonb, uuid) from public, anon;
grant execute on function public.entrada_mercancia(jsonb, uuid) to authenticated;

-- =====================================================================
-- De quién es cada crédito (pedido de Franklin y Daniel, 2026-10-22)
--   ventas.vendedor_id ya existía, pero siempre quedaba quien la anotaba. Ahora:
--   - Un dueño elige de quién es al vender o al cargar "Ya debía" (él, el otro socio o el empleado).
--   - El empleado siempre vende a su nombre.
--   - Cambiarlo después lo aprueba el otro socio (solicitud 'cambiar_vendedor') y queda en el
--     historial de la venta y en auditoría.
-- La estructura solo se AMPLÍA: una columna nueva y un tipo más en dos listas de tipos permitidos
-- (cada restricción se cambia por otra más amplia en la misma instrucción; no se toca ningún dato).
-- =====================================================================
alter table public.solicitudes add column usuario_id uuid references public.usuarios(id);   -- cambiar_vendedor: de quién pasa a ser
alter table public.solicitudes drop constraint solicitudes_tipo_check,
  add constraint solicitudes_tipo_check check (tipo in ('anular_abono','descuento','anular_venta','cerrar_venta','cambiar_vendedor'));
alter table public.eventos_venta drop constraint eventos_venta_tipo_check,
  add constraint eventos_venta_tipo_check check (tipo in ('recargo','descuento','reprogramacion','retiro','devolucion','cierre',
                                                          'reactivacion','anulacion','costo','vendedor'));

-- De quién queda una venta nueva: sin elegir, de quien la anota. Solo un dueño la pone a nombre de otro.
create function interno.vendedor_valido(p_id uuid, u public.usuarios) returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare x public.usuarios;
begin
  if p_id is null or p_id = u.id then return u.id; end if;
  if u.rol <> 'dueno' then raise exception 'Solo puedes anotar ventas a tu nombre.'; end if;
  select * into x from public.usuarios where id = p_id;
  if not found or not x.activo then raise exception 'Esa persona no está activa en el sistema.'; end if;
  return x.id;
end $$;

-- Pasa un crédito a otra persona (lo hace responder_aprobacion cuando el otro socio aprueba)
create function interno.cambiar_vendedor_int(p_venta bigint, p_usuario uuid, p_motivo text, u public.usuarios) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.ventas; x public.usuarios;
begin
  if nullif(trim(p_motivo), '') is null then raise exception 'Escribe el motivo.'; end if;
  v := interno.venta_para(p_venta, u);
  if v.estado = 'anulada' then raise exception 'Esta venta está anulada.'; end if;
  select * into x from public.usuarios where id = p_usuario;
  if not found or not x.activo then raise exception 'Esa persona no está activa en el sistema.'; end if;
  if v.vendedor_id is not distinct from x.id then raise exception 'Este crédito ya es de %.', x.nombre; end if;
  update public.ventas set vendedor_id = x.id where id = p_venta;
  insert into public.eventos_venta (venta_id, tipo, motivo, datos, usuario_id)
  values (p_venta, 'vendedor', trim(p_motivo), jsonb_build_object('antes', v.vendedor_id, 'despues', x.id), u.id);
  perform interno.auditar('ventas', p_venta::text, 'cambiar_vendedor', jsonb_build_object('vendedor_id', v.vendedor_id),
                          jsonb_build_object('vendedor_id', x.id, 'motivo', trim(p_motivo)));
  return jsonb_build_object('vendedor_id', x.id, 'nombre', x.nombre);
end $$;

-- Venta nueva: igual que en la migración 003, más "de quién es el crédito" (vendedor_id)
create or replace function public.registrar_venta(p jsonb, p_clave uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  u public.usuarios;
  v_prev jsonb;
  c public.clientes;
  v_cli bigint;
  v_origen text := coalesce(nullif(p->>'origen', ''), 'nueva');
  v_fecha date;
  v_total numeric := 0;
  v_inicial numeric;
  v_antes numeric;
  v_frec text;
  v_esperado numeric;
  v_id bigint;
  v_num bigint;
  it jsonb;
  v_desc text;
  v_cant int;
  v_precio numeric;
  v_costo numeric;
  v_prod bigint;
  v_item bigint;
  v_orden int := 0;
  v_sede_salida text;
  r interno.pago;
  v public.ventas;
  v_res jsonb;
  v_vendedor uuid;
begin
  u := interno.yo();
  v_prev := interno.idem_inicio(p_clave, 'venta');
  if v_prev is not null then return v_prev; end if;
  -- De quién es el crédito: un dueño lo elige; el empleado siempre vende a su nombre
  v_vendedor := interno.vendedor_valido(nullif(p->>'vendedor_id', '')::uuid, u);

  v_cli := coalesce(nullif(p->>'cliente_id', '')::bigint, interno.id_por_clave(nullif(p->>'cliente_clave', '')::uuid, 'cliente'));
  c := interno.cliente_para(v_cli, u);
  if c.no_venderle and u.rol <> 'dueno' then
    raise exception 'A este cliente no se le vende. Habla con Franklin o Daniel.';
  end if;

  if v_origen not in ('nueva','carga_inicial') then raise exception 'Tipo de venta no válido.'; end if;
  if v_origen = 'carga_inicial' and u.rol <> 'dueno' then
    raise exception 'Solo los dueños pueden cargar clientes que ya debían.';
  end if;
  v_fecha := coalesce(nullif(p->>'fecha', '')::date, interno.hoy());
  if v_fecha > interno.hoy() then raise exception 'La fecha de la venta no puede ser futura.'; end if;
  if v_origen = 'nueva' then
    v_fecha := interno.fecha_permitida(v_fecha, u);
  end if;

  if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') = 0 then
    raise exception 'Agrega lo que se llevó el cliente.';
  end if;
  if jsonb_array_length(p->'items') > 50 then raise exception 'Son demasiados productos en una venta.'; end if;
  for it in select value from jsonb_array_elements(p->'items') loop
    v_desc := interno.texto(it, 'descripcion', 200);
    v_cant := coalesce(nullif(it->>'cantidad', '')::int, 1);
    v_precio := round(nullif(it->>'precio', '')::numeric, 2);
    if v_desc is null then raise exception 'A un producto le falta el nombre.'; end if;
    if v_cant < 1 or v_cant > 999 then raise exception 'Cantidad no válida en "%".', v_desc; end if;
    if v_precio is null or v_precio < 0 then raise exception 'Falta el precio de "%".', v_desc; end if;
    v_sede_salida := nullif(it->>'sede_salida', '');
    if v_sede_salida is not null then
      if v_sede_salida not in ('socopo','pedraza') then raise exception 'Tienda no válida en "%".', v_desc; end if;
      if u.rol <> 'dueno' and v_sede_salida is distinct from u.sede then
        raise exception 'Solo puedes sacar mercancía de tu tienda.';
      end if;
    end if;
    v_total := v_total + v_cant * v_precio;
  end loop;
  v_total := round(v_total, 2);
  if v_total <= 0 then raise exception 'El total de la venta debe ser mayor que cero.'; end if;

  v_inicial := round(coalesce(nullif(p->>'inicial', '')::numeric, 0), 2);
  v_antes := round(coalesce(nullif(p->>'pagado_antes', '')::numeric, 0), 2);
  if v_origen = 'nueva' then
    v_antes := 0;
    if v_inicial < 0 or v_inicial > v_total then raise exception 'La inicial no puede ser mayor que el total.'; end if;
  else
    v_inicial := 0;
    if v_antes < 0 or v_antes >= v_total then
      raise exception 'Lo que ya pagó tiene que ser menor que el total.';
    end if;
  end if;
  v_esperado := v_total - v_inicial - v_antes;
  v_frec := case when v_esperado <= 0 then 'contado' else coalesce(nullif(p->>'frecuencia', ''), 'personalizada') end;
  if v_frec not in ('semanal','quincenal','mensual','personalizada','contado') then
    raise exception 'Frecuencia de pago no válida.';
  end if;

  v_num := interno.siguiente('venta');
  insert into public.ventas (numero, cliente_id, fecha, vendedor_id, total, inicial, plan_base, frecuencia, origen,
                             contrato_papel, notas, clave, hecho_en, creado_por)
  values (v_num, v_cli, v_fecha, v_vendedor, v_total, v_inicial, v_antes, v_frec, v_origen,
          interno.texto(p, 'contrato_papel', 40), interno.texto(p, 'notas', 1000), p_clave, interno.hecho_en(p), u.id)
  returning id into v_id;

  for it in select value from jsonb_array_elements(p->'items') loop
    v_desc := interno.texto(it, 'descripcion', 200);
    v_cant := coalesce(nullif(it->>'cantidad', '')::int, 1);
    v_precio := round((it->>'precio')::numeric, 2);
    v_prod := nullif(it->>'producto_id', '')::bigint;
    if v_prod is not null and not exists (select 1 from public.productos where id = v_prod) then v_prod := null; end if;
    if v_prod is null then
      select id into v_prod from public.productos where lower(nombre) = lower(v_desc);
      if v_prod is null then
        insert into public.productos (nombre, precio_sugerido, creado_por) values (v_desc, v_precio, u.id)
        returning id into v_prod;
      end if;
    end if;
    update public.productos set precio_sugerido = v_precio where id = v_prod;
    -- Sale de la tienda (solo en ventas nuevas): se descuenta de la existencia
    v_sede_salida := case when v_origen = 'nueva' then nullif(it->>'sede_salida', '') end;
    insert into public.venta_items (venta_id, producto_id, descripcion, cantidad, precio, orden, sede_salida)
    values (v_id, v_prod, v_desc, v_cant, v_precio, v_orden, v_sede_salida)
    returning id into v_item;
    if v_sede_salida is not null then
      perform interno.mover_stock(v_prod, v_sede_salida, -v_cant, 'venta', v_id, v_item, null, p_clave);
    end if;
    v_orden := v_orden + 1;
    -- Costo: lo escribe un dueño; si no, se toma el último costo conocido del producto
    v_costo := null;
    if u.rol = 'dueno' and nullif(it->>'costo', '') is not null then
      v_costo := round((it->>'costo')::numeric, 2);
      if v_costo < 0 then raise exception 'El costo no puede ser negativo.'; end if;
      insert into public.producto_costos (producto_id, costo) values (v_prod, v_costo)
      on conflict (producto_id) do update set costo = excluded.costo, actualizado_en = now();
    else
      select costo into v_costo from public.producto_costos where producto_id = v_prod;
    end if;
    if v_costo is not null then
      insert into public.venta_item_costos (item_id, costo, actualizado_por) values (v_item, v_costo, u.id);
    end if;
  end loop;

  -- Calendario: la inicial es la "cuota 0" del día de la venta
  if v_inicial > 0 then
    insert into public.cuotas (venta_id, plan, n, tipo, fecha, monto) values (v_id, 1, 0, 'inicial', v_fecha, v_inicial);
  end if;
  if v_esperado > 0 then
    perform interno.insertar_cuotas(v_id, 1, p->'cuotas', v_esperado,
                                    case when v_origen = 'nueva' then v_fecha end, 1);
  elsif jsonb_typeof(p->'cuotas') = 'array' and jsonb_array_length(p->'cuotas') > 0 then
    raise exception 'Con esa inicial no quedan cuotas por pagar.';
  end if;

  -- Lo que pagó antes de usar el sistema (clientes que ya debían)
  if v_antes > 0 then
    insert into public.abonos (grupo, venta_id, cliente_id, fecha, tipo, moneda, monto, monto_usd, nota, hecho_en, creado_por)
    values (gen_random_uuid(), v_id, v_cli, interno.hoy(), 'antes_del_sistema', 'USD', v_antes, v_antes,
            'Pagado antes de usar el sistema', interno.hecho_en(p), u.id);
  end if;

  -- La inicial que pagó en el momento
  if jsonb_typeof(p->'pago_inicial') = 'object' then
    if v_origen <> 'nueva' or v_inicial <= 0 then raise exception 'Esta venta no lleva inicial.'; end if;
    r := interno.leer_pago(p->'pago_inicial');
    perform interno.revisar_tasa(r, u);
    perform interno.revisar_referencia(r, coalesce(nullif(p->'pago_inicial'->>'forzar_referencia', '')::boolean, false));
    if r.monto_usd > v_inicial + 0.004 then
      raise exception 'Lo que pagó de inicial (%) es más que la inicial (%).', interno.dinero(r.monto_usd), interno.dinero(v_inicial);
    end if;
    insert into public.abonos (grupo, venta_id, cliente_id, fecha, tipo, metodo_id, moneda, monto, tasa, monto_usd,
                               referencia, recibido_por, hecho_en, creado_por)
    values (coalesce(p_clave, gen_random_uuid()), v_id, v_cli, v_fecha, 'inicial', r.metodo_id, r.moneda, r.monto, r.tasa,
            r.monto_usd, r.referencia, u.id, interno.hecho_en(p), u.id);
  end if;

  v := interno.recalcular_venta(v_id);
  v_res := jsonb_build_object('id', v_id, 'numero', v_num, 'cliente_id', v_cli, 'total', v.total, 'saldo', v.saldo);
  perform interno.idem_fin(p_clave, v_res);
  return v_res;
end $$;

-- Hacer lo aprobado: igual que en la migración 006, más cambiar_vendedor
create or replace function interno.ejecutar_solicitud(s public.solicitudes, u_pide public.usuarios, u_aprueba public.usuarios) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_motivo text := trim(s.motivo) || ' (aprobó ' || u_aprueba.nombre || ')';
begin
  if s.tipo = 'anular_abono' then return interno.anular_abono_int(s.grupo, v_motivo, u_pide); end if;
  if s.tipo = 'descuento' then return interno.descuento_int(s.venta_id, s.monto, v_motivo, u_pide); end if;
  if s.tipo = 'cerrar_venta' then return interno.cerrar_venta_int(s.venta_id, v_motivo, u_pide); end if;
  if s.tipo = 'anular_venta' then return interno.anular_venta_int(s.venta_id, v_motivo, u_pide); end if;
  if s.tipo = 'cambiar_vendedor' then return interno.cambiar_vendedor_int(s.venta_id, s.usuario_id, v_motivo, u_pide); end if;
  raise exception 'Tipo de cambio no válido.';
end $$;

-- Pedir un cambio: igual que en la migración 006, más cambiar_vendedor
-- p = { tipo, motivo, grupo (anular_abono) | venta_id (descuento, cerrar_venta, anular_venta, cambiar_vendedor),
--       monto (descuento), usuario_id (cambiar_vendedor) }
create or replace function public.pedir_aprobacion(p jsonb, p_clave uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; s public.solicitudes; v public.ventas; c public.clientes; v_prev jsonb; v_res jsonb;
        a_cli bigint; a_total numeric; a_fecha date; a_partes int; a_metodo text; v_a public.usuarios;
begin
  u := interno.dueno();
  v_prev := interno.idem_inicio(p_clave, 'solicitud');
  if v_prev is not null then return v_prev; end if;
  s.tipo := p->>'tipo';
  if s.tipo is null or s.tipo not in ('anular_abono','descuento','anular_venta','cerrar_venta','cambiar_vendedor') then
    raise exception 'Tipo de cambio no válido.';
  end if;
  s.motivo := nullif(trim(p->>'motivo'), '');
  if s.motivo is null then raise exception 'Escribe el motivo.'; end if;
  s.motivo := left(s.motivo, 500);

  if s.tipo = 'anular_abono' then
    s.grupo := nullif(p->>'grupo', '')::uuid;
    select min(a.cliente_id), sum(a.monto_usd), min(a.fecha), count(*), min(m.nombre)
      into a_cli, a_total, a_fecha, a_partes, a_metodo
      from public.abonos a left join public.metodos_pago m on m.id = a.metodo_id
     where a.grupo = s.grupo and a.anulado_en is null;
    if a_cli is null then raise exception 'Ese abono no existe o ya estaba anulado.'; end if;
    s.cliente_id := a_cli;
    s.monto := a_total;
    s.detalle := 'Abono de ' || interno.dinero(a_total) || ' del ' || to_char(a_fecha, 'DD/MM/YYYY') ||
                 coalesce(' (' || a_metodo || ')', '') || case when a_partes > 1 then ', repartido en ' || a_partes || ' ventas' else '' end;
  else
    s.venta_id := nullif(p->>'venta_id', '')::bigint;
    select * into v from public.ventas where id = s.venta_id;
    if not found then raise exception 'Esa venta no existe.'; end if;
    s.cliente_id := v.cliente_id;
    if s.tipo = 'descuento' then
      s.monto := round(nullif(p->>'monto', '')::numeric, 2);
      if s.monto is null or s.monto <= 0 then raise exception 'Escribe el monto.'; end if;
      s.detalle := 'Descuento de ' || interno.dinero(s.monto) || ' en la venta #' || v.numero;
    elsif s.tipo = 'cambiar_vendedor' then
      s.usuario_id := nullif(p->>'usuario_id', '')::uuid;
      select * into v_a from public.usuarios where id = s.usuario_id;
      if not found then raise exception 'Elige de quién va a ser el crédito.'; end if;
      s.monto := v.saldo;
      s.detalle := 'Pasar la venta #' || v.numero || ' de ' || coalesce((select nombre from public.usuarios where id = v.vendedor_id), 'nadie') ||
                   ' a ' || v_a.nombre;
    elsif s.tipo = 'cerrar_venta' then
      s.monto := v.saldo;
      s.detalle := 'Cerrar la venta #' || v.numero || ': dejar de cobrar ' || interno.dinero(v.saldo);
    else
      s.monto := v.total;
      s.detalle := 'Anular la venta #' || v.numero || ' de ' || interno.dinero(v.total);
    end if;
  end if;
  select * into c from public.clientes where id = s.cliente_id;
  s.detalle := s.detalle || ' · ' || c.nombre;

  if exists (select 1 from public.solicitudes x where x.estado = 'pendiente' and x.tipo = s.tipo
              and x.venta_id is not distinct from s.venta_id and x.grupo is not distinct from s.grupo) then
    raise exception 'Ya hay una solicitud pendiente para esto. Espera la respuesta del otro socio.';
  end if;

  -- Ensayo: se hace el cambio y se deshace enseguida, para avisar de una vez si no se puede
  begin
    perform interno.ejecutar_solicitud(s, u, u);
    raise exception using errcode = 'EM900', message = 'ensayo';
  exception when sqlstate 'EM900' then null;
  end;

  insert into public.solicitudes (tipo, venta_id, grupo, cliente_id, monto, motivo, detalle, pedida_por, clave, usuario_id)
  values (s.tipo, s.venta_id, s.grupo, s.cliente_id, s.monto, s.motivo, s.detalle, u.id, p_clave, s.usuario_id)
  returning * into s;
  perform interno.auditar('solicitudes', s.id::text, 'pedir', null, to_jsonb(s));
  v_res := jsonb_build_object('id', s.id, 'estado', s.estado, 'detalle', s.detalle);
  perform interno.idem_fin(p_clave, v_res);
  return v_res;
end $$;

revoke execute on function interno.vendedor_valido(uuid, public.usuarios),
  interno.cambiar_vendedor_int(bigint, uuid, text, public.usuarios),
  interno.ejecutar_solicitud(public.solicitudes, public.usuarios, public.usuarios)
  from public, anon, authenticated;
revoke execute on function public.registrar_venta(jsonb, uuid), public.pedir_aprobacion(jsonb, uuid) from public, anon;
grant execute on function public.registrar_venta(jsonb, uuid), public.pedir_aprobacion(jsonb, uuid) to authenticated;
