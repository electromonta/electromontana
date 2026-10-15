-- =====================================================================
-- Electro Montana — etapa 2: mercancía de las tiendas, notas de cobro y apoyo para reportes.
-- Solo agrega: tablas, columnas y funciones nuevas. Las funciones que cambian
-- (registrar_venta y anular_venta) conservan su firma y se reemplazan completas.
--
-- Mercancía: casi todo se compra en Yumana después de vender, así que la existencia
-- importa sobre todo en la tienda de Pedraza. Cada cambio queda en movimientos_inventario
-- y la existencia nunca baja de cero.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Mercancía
-- ---------------------------------------------------------------------
create table public.existencias (
  producto_id bigint not null references public.productos(id),
  sede text not null check (sede in ('socopo','pedraza')),
  cantidad int not null default 0 check (cantidad >= 0),
  actualizado_en timestamptz not null default now(),
  primary key (producto_id, sede)
);

create table public.movimientos_inventario (
  id bigint generated always as identity primary key,
  producto_id bigint not null references public.productos(id),
  sede text not null check (sede in ('socopo','pedraza')),
  tipo text not null check (tipo in ('entrada','venta','retiro','ajuste','anulacion')),
  cantidad int not null check (cantidad <> 0),          -- + entra, − sale
  queda int not null,                                   -- existencia después del movimiento
  venta_id bigint references public.ventas(id),
  item_id bigint references public.venta_items(id),
  nota text,
  clave uuid,
  usuario_id uuid references public.usuarios(id),
  creado_en timestamptz not null default now()
);
create index movimientos_inventario_producto on public.movimientos_inventario (producto_id, sede);

-- De qué tienda salió cada cosa vendida (null = se buscó en Yumana después de vender)
alter table public.venta_items add column sede_salida text check (sede_salida in ('socopo','pedraza'));
-- Mercancía retirada de una venta cerrada que se volvió a meter a una tienda para venderla otra vez
alter table public.ventas add column reingresada_en timestamptz;
alter table public.ventas add column reingresada_sede text check (reingresada_sede in ('socopo','pedraza'));

-- Mueve la existencia (bloquea la fila) y deja el movimiento. Devuelve lo que queda.
create function interno.mover_stock(p_producto bigint, p_sede text, p_cantidad int, p_tipo text,
                                    p_venta bigint, p_item bigint, p_nota text, p_clave uuid)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actual int; v_nuevo int; v_nombre text;
begin
  if p_cantidad = 0 then return null; end if;
  insert into public.existencias (producto_id, sede, cantidad) values (p_producto, p_sede, 0)
  on conflict (producto_id, sede) do nothing;
  select cantidad into v_actual from public.existencias where producto_id = p_producto and sede = p_sede for update;
  v_nuevo := v_actual + p_cantidad;
  if v_nuevo < 0 then
    select nombre into v_nombre from public.productos where id = p_producto;
    raise exception 'No hay suficiente "%" en la tienda de % (quedan %).', v_nombre,
      case p_sede when 'pedraza' then 'Pedraza' else 'Socopó' end, v_actual;
  end if;
  update public.existencias set cantidad = v_nuevo, actualizado_en = now() where producto_id = p_producto and sede = p_sede;
  insert into public.movimientos_inventario (producto_id, sede, tipo, cantidad, queda, venta_id, item_id, nota, clave, usuario_id)
  values (p_producto, p_sede, p_tipo, p_cantidad, v_nuevo, p_venta, p_item, p_nota, p_clave, auth.uid());
  return v_nuevo;
end $$;

-- Busca un producto por id o por nombre; si no existe, lo crea
create function interno.producto_por_nombre(p_id bigint, p_nombre text, u public.usuarios) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint;
begin
  if p_id is not null and exists (select 1 from public.productos where id = p_id) then return p_id; end if;
  if nullif(trim(p_nombre), '') is null then raise exception 'A un producto le falta el nombre.'; end if;
  select id into v_id from public.productos where lower(nombre) = lower(trim(p_nombre));
  if v_id is null then
    insert into public.productos (nombre, creado_por) values (trim(p_nombre), u.id) returning id into v_id;
  end if;
  return v_id;
end $$;

-- Entrada de mercancía a una tienda. p = {sede, nota, items: [{producto_id | nombre, cantidad, costo?, precio_sugerido?}]}
create function public.entrada_mercancia(p jsonb, p_clave uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  u public.usuarios; v_prev jsonb; it jsonb; v_prod bigint; v_cant int; v_costo numeric; v_precio numeric;
  v_sede text := nullif(p->>'sede', ''); v_n int := 0; v_unidades int := 0; v_res jsonb;
begin
  u := interno.dueno();
  v_prev := interno.idem_inicio(p_clave, 'entrada');
  if v_prev is not null then return v_prev; end if;
  if v_sede is null or v_sede not in ('socopo','pedraza') then raise exception 'Elige a qué tienda entra la mercancía.'; end if;
  if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') = 0 then
    raise exception 'Agrega la mercancía que entra.';
  end if;
  if jsonb_array_length(p->'items') > 100 then raise exception 'Son demasiados productos en una entrada.'; end if;
  for it in select value from jsonb_array_elements(p->'items') loop
    v_prod := interno.producto_por_nombre(nullif(it->>'producto_id', '')::bigint, interno.texto(it, 'nombre', 200), u);
    v_cant := nullif(it->>'cantidad', '')::int;
    if v_cant is null or v_cant < 1 or v_cant > 9999 then raise exception 'Cantidad no válida.'; end if;
    v_costo := round(nullif(it->>'costo', '')::numeric, 2);
    if v_costo is not null then
      if v_costo < 0 then raise exception 'El costo no puede ser negativo.'; end if;
      insert into public.producto_costos (producto_id, costo) values (v_prod, v_costo)
      on conflict (producto_id) do update set costo = excluded.costo, actualizado_en = now();
    end if;
    v_precio := round(nullif(it->>'precio_sugerido', '')::numeric, 2);
    if v_precio is not null and v_precio >= 0 then
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

-- Ajuste por conteo: se escribe lo que hay de verdad y queda la diferencia
create function public.ajustar_existencia(p_producto bigint, p_sede text, p_contado int, p_nota text) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; v_actual int;
begin
  u := interno.dueno();
  if p_sede not in ('socopo','pedraza') then raise exception 'Tienda no válida.'; end if;
  if p_contado is null or p_contado < 0 then raise exception 'Escribe cuántos hay.'; end if;
  if nullif(trim(p_nota), '') is null then raise exception 'Escribe por qué cambia (ej.: conteo del día).'; end if;
  if not exists (select 1 from public.productos where id = p_producto) then raise exception 'Ese producto no existe.'; end if;
  insert into public.existencias (producto_id, sede, cantidad) values (p_producto, p_sede, 0)
  on conflict (producto_id, sede) do nothing;
  select cantidad into v_actual from public.existencias where producto_id = p_producto and sede = p_sede for update;
  if v_actual = p_contado then return p_contado; end if;
  return interno.mover_stock(p_producto, p_sede, p_contado - v_actual, 'ajuste', null, null, trim(p_nota), null);
end $$;

-- Mercancía retirada de una venta cerrada (el cliente no siguió pagando): vuelve a una tienda para venderla otra vez
create function public.reingresar_mercancia(p_venta bigint, p_sede text, p_nota text) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; v public.ventas; x record; n int := 0;
begin
  u := interno.dueno();
  if p_sede not in ('socopo','pedraza') then raise exception 'Elige a qué tienda vuelve.'; end if;
  v := interno.venta_para(p_venta, u);
  if v.mercancia <> 'retirada' or v.estado <> 'cerrada' then
    raise exception 'Solo vuelve a la tienda la mercancía retirada de una venta cerrada.';
  end if;
  if v.reingresada_en is not null then raise exception 'Esta mercancía ya volvió a la tienda.'; end if;
  for x in select id, producto_id, cantidad from public.venta_items where venta_id = p_venta and producto_id is not null order by id loop
    perform interno.mover_stock(x.producto_id, p_sede, x.cantidad, 'retiro', p_venta, x.id, nullif(trim(p_nota), ''), null);
    n := n + 1;
  end loop;
  update public.ventas set reingresada_en = now(), reingresada_sede = p_sede where id = p_venta;
  perform interno.auditar('ventas', p_venta::text, 'reingresar_mercancia', null,
                          jsonb_build_object('sede', p_sede, 'productos', n, 'nota', nullif(trim(p_nota), '')));
  return n;
end $$;

-- Catálogo: crear o editar un producto (solo dueños)
create function public.guardar_producto(p jsonb) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; v_id bigint := nullif(p->>'id', '')::bigint; v_nombre text := interno.texto(p, 'nombre', 200);
        v_costo numeric; v_otro bigint;
begin
  u := interno.dueno();
  if v_nombre is not null then
    select id into v_otro from public.productos where lower(nombre) = lower(v_nombre) and id <> coalesce(v_id, 0);
    if v_otro is not null then raise exception 'Ya hay un producto con ese nombre.'; end if;
  end if;
  if v_id is null then
    if v_nombre is null then raise exception 'Escribe el nombre del producto.'; end if;
    insert into public.productos (nombre, codigo_yumana, precio_sugerido, creado_por)
    values (v_nombre, interno.texto(p, 'codigo_yumana', 40), round(nullif(p->>'precio_sugerido', '')::numeric, 2), u.id)
    returning id into v_id;
  else
    update public.productos set
      nombre = coalesce(v_nombre, nombre),
      codigo_yumana = case when p ? 'codigo_yumana' then interno.texto(p, 'codigo_yumana', 40) else codigo_yumana end,
      precio_sugerido = case when p ? 'precio_sugerido' then round(nullif(p->>'precio_sugerido', '')::numeric, 2) else precio_sugerido end,
      activo = case when p ? 'activo' then coalesce(nullif(p->>'activo', '')::boolean, activo) else activo end
    where id = v_id;
    if not found then raise exception 'Ese producto no existe.'; end if;
  end if;
  if nullif(p->>'costo', '') is not null then
    v_costo := round((p->>'costo')::numeric, 2);
    if v_costo < 0 then raise exception 'El costo no puede ser negativo.'; end if;
    insert into public.producto_costos (producto_id, costo) values (v_id, v_costo)
    on conflict (producto_id) do update set costo = excluded.costo, actualizado_en = now();
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Notas de cobro: visitas, llamadas, "no estaba", promesas de pago, recordatorios
-- ---------------------------------------------------------------------
create table public.gestiones (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references public.clientes(id),
  venta_id bigint references public.ventas(id),
  tipo text not null check (tipo in ('visita','llamada','mensaje','promesa','no_estaba','recordatorio','otro')),
  nota text,
  promesa_fecha date,
  promesa_monto numeric(12,2) check (promesa_monto >= 0),
  clave uuid unique,
  usuario_id uuid references public.usuarios(id),
  hecho_en timestamptz not null default now(),
  creado_en timestamptz not null default now(),
  anulada_en timestamptz,
  anulada_por uuid references public.usuarios(id),
  constraint promesa_con_fecha check (tipo <> 'promesa' or promesa_fecha is not null)
);
create index gestiones_cliente on public.gestiones (cliente_id);

-- p = {cliente_id | cliente_clave, venta_id?, tipo, nota, promesa_fecha, promesa_monto, hecho_en}
create function public.registrar_gestion(p jsonb, p_clave uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  u public.usuarios; v_prev jsonb; v_cli bigint; v_tipo text := nullif(p->>'tipo', ''); v_venta bigint;
  v_fecha date; v_monto numeric; v_id bigint; v_res jsonb;
begin
  u := interno.yo();
  v_prev := interno.idem_inicio(p_clave, 'gestion');
  if v_prev is not null then return v_prev; end if;
  v_cli := coalesce(nullif(p->>'cliente_id', '')::bigint, interno.id_por_clave(nullif(p->>'cliente_clave', '')::uuid, 'cliente'));
  perform interno.cliente_para(v_cli, u);
  if v_tipo is null or v_tipo not in ('visita','llamada','mensaje','promesa','no_estaba','recordatorio','otro') then
    raise exception 'Elige qué pasó.';
  end if;
  v_venta := nullif(p->>'venta_id', '')::bigint;
  if v_venta is not null and not exists (select 1 from public.ventas where id = v_venta and cliente_id = v_cli) then
    raise exception 'Esa venta no es de este cliente.';
  end if;
  if v_tipo = 'promesa' then
    v_fecha := nullif(p->>'promesa_fecha', '')::date;
    if v_fecha is null then raise exception 'Escribe para cuándo prometió pagar.'; end if;
    if v_fecha < interno.hoy() - 7 then raise exception 'La fecha de la promesa ya pasó.'; end if;
    v_monto := round(nullif(p->>'promesa_monto', '')::numeric, 2);
    if v_monto is not null and v_monto < 0 then raise exception 'Monto no válido.'; end if;
  end if;
  insert into public.gestiones (cliente_id, venta_id, tipo, nota, promesa_fecha, promesa_monto, clave, usuario_id, hecho_en)
  values (v_cli, v_venta, v_tipo, interno.texto(p, 'nota', 500), v_fecha, v_monto, p_clave, u.id, interno.hecho_en(p))
  returning id into v_id;
  v_res := jsonb_build_object('id', v_id, 'cliente_id', v_cli);
  perform interno.idem_fin(p_clave, v_res);
  return v_res;
end $$;

-- Quitar una nota (quien la escribió o un dueño)
create function public.anular_gestion(p_id bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; g public.gestiones;
begin
  u := interno.yo();
  select * into g from public.gestiones where id = p_id for update;
  if not found or g.anulada_en is not null then raise exception 'Esa nota no existe.'; end if;
  perform interno.cliente_para(g.cliente_id, u);
  if u.rol <> 'dueno' and g.usuario_id is distinct from u.id then raise exception 'Solo quien la escribió o un dueño la puede quitar.'; end if;
  update public.gestiones set anulada_en = now(), anulada_por = u.id where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- Para reportes: último abono y total abonado por cliente (respeta lo que cada quien puede ver)
-- ---------------------------------------------------------------------
create function public.resumen_abonos_clientes()
returns table (cliente_id bigint, ultimo_abono date, ultimo_en timestamptz, abonado numeric)
language sql stable security invoker set search_path = public, pg_temp as $$
  select a.cliente_id, max(a.fecha), max(a.hecho_en), sum(a.monto_usd)
    from public.abonos a
   where a.anulado_en is null and a.tipo <> 'antes_del_sistema'
   group by a.cliente_id
$$;

-- =====================================================================
-- Ventas: registrar (ahora descuenta lo que sale de una tienda) y anular (lo devuelve)
-- =====================================================================
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
begin
  u := interno.yo();
  v_prev := interno.idem_inicio(p_clave, 'venta');
  if v_prev is not null then return v_prev; end if;

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
  values (v_num, v_cli, v_fecha, u.id, v_total, v_inicial, v_antes, v_frec, v_origen,
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

create or replace function public.anular_venta(p_venta bigint, p_motivo text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; v public.ventas; x record;
begin
  u := interno.dueno();
  if nullif(trim(p_motivo), '') is null then raise exception 'Escribe por qué se anula.'; end if;
  v := interno.venta_para(p_venta, u);
  if v.estado = 'anulada' then raise exception 'Esta venta ya estaba anulada.'; end if;
  if v.mercancia = 'retirada' then raise exception 'Esta venta tiene la mercancía retirada. Devuélvela o ciérrala.'; end if;
  if exists (select 1 from public.abonos where venta_id = p_venta and anulado_en is null and tipo <> 'antes_del_sistema') then
    raise exception 'Esta venta tiene abonos. Anúlalos primero.';
  end if;
  update public.abonos set anulado_en = now(), anulado_por = u.id, motivo_anulacion = 'Venta anulada: ' || trim(p_motivo)
   where venta_id = p_venta and anulado_en is null;
  perform interno.recalcular_venta(p_venta);
  -- Lo que salió de una tienda vuelve a la existencia
  for x in select id, producto_id, cantidad, sede_salida from public.venta_items
            where venta_id = p_venta and sede_salida is not null and producto_id is not null order by id loop
    perform interno.mover_stock(x.producto_id, x.sede_salida, x.cantidad, 'anulacion', p_venta, x.id, 'Venta anulada', null);
  end loop;
  update public.ventas set estado = 'anulada', cerrada_en = now(), cerrada_por = u.id, motivo_cierre = trim(p_motivo)
   where id = p_venta;
  insert into public.eventos_venta (venta_id, tipo, motivo, usuario_id) values (p_venta, 'anulacion', trim(p_motivo), u.id);
  perform interno.auditar('ventas', p_venta::text, 'anular', to_jsonb(v), jsonb_build_object('motivo', trim(p_motivo)));
end $$;
-- =====================================================================
-- RLS y permisos de lo nuevo (lo reemplazado conserva sus permisos)
-- =====================================================================
alter table public.existencias            enable row level security;
alter table public.movimientos_inventario enable row level security;
alter table public.gestiones              enable row level security;

create policy "leer" on public.existencias            for select to authenticated
  using (public.es_dueno() or (public.es_activo() and sede = (select u.sede from public.usuarios u where u.id = auth.uid())));
create policy "leer" on public.movimientos_inventario for select to authenticated
  using (public.es_dueno() or (public.es_activo() and sede = (select u.sede from public.usuarios u where u.id = auth.uid())));
create policy "leer" on public.gestiones              for select to authenticated using (public.ve_cliente(cliente_id));

revoke all on public.existencias, public.movimientos_inventario, public.gestiones from anon, authenticated;
grant select on public.existencias, public.movimientos_inventario, public.gestiones to authenticated;
revoke execute on function
  interno.mover_stock(bigint, text, int, text, bigint, bigint, text, uuid),
  interno.producto_por_nombre(bigint, text, public.usuarios)
from public, anon, authenticated;
revoke execute on function
  public.entrada_mercancia(jsonb, uuid), public.ajustar_existencia(bigint, text, int, text),
  public.reingresar_mercancia(bigint, text, text), public.guardar_producto(jsonb),
  public.registrar_gestion(jsonb, uuid), public.anular_gestion(bigint), public.resumen_abonos_clientes()
from public, anon;
grant execute on function
  public.entrada_mercancia(jsonb, uuid), public.ajustar_existencia(bigint, text, int, text),
  public.reingresar_mercancia(bigint, text, text), public.guardar_producto(jsonb),
  public.registrar_gestion(jsonb, uuid), public.anular_gestion(bigint), public.resumen_abonos_clientes()
to authenticated;
