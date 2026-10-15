-- =====================================================================
-- Electro Montana — base de la etapa 1
-- Clientes, ventas a crédito con su calendario de cuotas, abonos en $ o Bs,
-- recargos, descuentos, más tiempo, retiro de mercancía y entregas de
-- lo que cobra el empleado de Pedraza.
--
-- Reglas:
--  * Toda escritura pasa por una función (RPC) que valida quién la hace,
--    bloquea las filas que toca y recalcula desde la fuente (abonos vivos).
--    La app solo LEE las tablas; no puede escribir en ellas directo.
--  * Cada cliente nuevo, venta o abono trae una "clave" generada en el
--    teléfono: si el internet se cae y se reintenta, no se repite.
--  * El empleado solo ve y toca los clientes de su sede (Pedraza) y no ve costos.
--  * Nada se borra: se anula, con quién y por qué.
--
-- Cuentas de una venta:
--   lo que debe  = total + ajuste (recargos − descuentos) − pagado (abonos vivos)
--   calendario   = plan_base + suma de cuotas vigentes = total + ajuste (siempre)
--   atrasado hoy = plan_base + cuotas vigentes con fecha < hoy − pagado (lo calcula la app al mostrar)
--
-- Retiro (como dice su contrato): si se atrasa varias cuotas ("giros") se le retira el artículo
-- y se le devuelve cuando termine de pagar. La venta sigue activa y se sigue cobrando.
-- Cerrar una venta = se deja de cobrar (por ejemplo, el cliente no volvió y la mercancía se quedó).
-- =====================================================================

create schema if not exists interno;
revoke all on schema interno from public;

-- ---------------------------------------------------------------------
-- Usuarios: dueños (ven todo) y empleados (solo su sede)
-- ---------------------------------------------------------------------
create table public.usuarios (
  id uuid primary key references auth.users(id),
  usuario text not null unique check (usuario ~ '^[a-z0-9._-]{3,30}$'),
  nombre text not null check (length(trim(nombre)) > 0),
  rol text not null check (rol in ('dueno','empleado')),
  sede text check (sede in ('socopo','pedraza')),
  activo boolean not null default true,
  debe_cambiar_clave boolean not null default true,
  creado_en timestamptz not null default now(),
  constraint empleado_con_sede check (rol = 'dueno' or sede is not null)
);

-- ---------------------------------------------------------------------
-- Configuración y tasa del día
-- ---------------------------------------------------------------------
create table public.config (
  id smallint primary key default 1 check (id = 1),
  tasa_bs numeric(14,4) not null default 0 check (tasa_bs >= 0),
  tasa_actualizada_en timestamptz,
  tasa_actualizada_por uuid references public.usuarios(id),
  inicial_pct numeric(5,2) not null default 30 check (inicial_pct between 0 and 100),
  telefono_negocio text,
  giros_para_retiro int not null default 3 check (giros_para_retiro between 1 and 52),
  contrato_condiciones text           -- condiciones que salen en el contrato impreso (las editan los dueños)
);
insert into public.config default values;

create table public.tasas (
  id bigint generated always as identity primary key,
  tasa numeric(14,4) not null check (tasa > 0),
  usuario_id uuid references public.usuarios(id),
  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Métodos de pago. "en_mano" = efectivo: queda con quien cobró hasta que lo entrega.
-- ---------------------------------------------------------------------
create table public.metodos_pago (
  id bigint generated always as identity primary key,
  nombre text not null unique check (length(trim(nombre)) > 0),
  moneda text not null check (moneda in ('USD','VES')),
  en_mano boolean not null default false,
  pide_referencia boolean not null default false,
  activo boolean not null default true,
  orden int not null default 0
);

-- ---------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------
create table public.clientes (
  id bigint generated always as identity primary key,
  nombre text not null check (length(trim(nombre)) > 0),
  cedula text,                          -- normalizada: V12345678
  telefono text,
  telefono2 text,
  sede text not null check (sede in ('socopo','pedraza')),
  sector text,                          -- barrio, pueblo o zona
  direccion text,
  referencia text,                      -- punto de referencia
  trabajo text,
  en_exterior boolean not null default false,
  pais text,
  contacto_nombre text,                 -- quien recibe o responde aquí (clientes en el exterior)
  contacto_telefono text,
  fiador_nombre text,
  fiador_cedula text,
  fiador_telefono text,
  fiador_direccion text,
  foto text,                            -- rutas en el bucket privado "fotos"
  foto_cedula text,
  lat numeric(9,6),
  lng numeric(9,6),
  ubicacion_en timestamptz,
  notas text,
  no_venderle boolean not null default false,
  no_venderle_motivo text,
  clave uuid unique,
  creado_en timestamptz not null default now(),
  creado_por uuid references public.usuarios(id),
  actualizado_en timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_por uuid references public.usuarios(id),
  motivo_borrado text
);
create unique index clientes_cedula_unica on public.clientes (cedula) where deleted_at is null and cedula is not null;
create index clientes_sede on public.clientes (sede);

-- ---------------------------------------------------------------------
-- Productos (catálogo simple) y su último costo (solo dueños)
-- ---------------------------------------------------------------------
create table public.productos (
  id bigint generated always as identity primary key,
  nombre text not null check (length(trim(nombre)) > 0),
  codigo_yumana text,                   -- opcional: puerta abierta por si algún día se enlaza con el mayor
  precio_sugerido numeric(12,2) check (precio_sugerido >= 0),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid references public.usuarios(id)
);
create unique index productos_nombre_unico on public.productos (lower(nombre));

create table public.producto_costos (
  producto_id bigint primary key references public.productos(id),
  costo numeric(12,2) not null check (costo >= 0),
  actualizado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Ventas a crédito (cada una es un contrato)
-- ---------------------------------------------------------------------
create table public.ventas (
  id bigint generated always as identity primary key,
  numero int not null unique,
  cliente_id bigint not null references public.clientes(id),
  fecha date not null,
  vendedor_id uuid references public.usuarios(id),
  total numeric(12,2) not null check (total > 0),
  inicial numeric(12,2) not null default 0 check (inicial >= 0),
  ajuste numeric(12,2) not null default 0,        -- recargos − descuentos
  pagado numeric(12,2) not null default 0,        -- suma de abonos vivos (lo recalcula la base)
  saldo numeric(12,2) generated always as (total + ajuste - pagado) stored,
  plan_base numeric(12,2) not null default 0 check (plan_base >= 0),
  plan int not null default 1,
  frecuencia text not null check (frecuencia in ('semanal','quincenal','mensual','personalizada','contado')),
  estado text not null default 'activa' check (estado in ('activa','pagada','cerrada','anulada')),
  mercancia text not null default 'con_cliente' check (mercancia in ('con_cliente','retirada','devuelta')),
  mercancia_en timestamptz,
  origen text not null default 'nueva' check (origen in ('nueva','carga_inicial')),
  contrato_papel text,                  -- número del contrato en papel, si lo tiene
  foto_contrato text,
  notas text,
  clave uuid unique,
  hecho_en timestamptz not null default now(),   -- cuándo se anotó en el teléfono
  creado_en timestamptz not null default now(),
  creado_por uuid references public.usuarios(id),
  pagada_en timestamptz,
  cerrada_en timestamptz,
  cerrada_por uuid references public.usuarios(id),
  motivo_cierre text,
  constraint inicial_menor_total check (inicial <= total)
);
create index ventas_cliente on public.ventas (cliente_id);
create index ventas_estado on public.ventas (estado);

create table public.venta_items (
  id bigint generated always as identity primary key,
  venta_id bigint not null references public.ventas(id),
  producto_id bigint references public.productos(id),
  descripcion text not null check (length(trim(descripcion)) > 0),
  cantidad int not null check (cantidad > 0),
  precio numeric(12,2) not null check (precio >= 0),   -- precio al cliente, por unidad
  orden int not null default 0
);
create index venta_items_venta on public.venta_items (venta_id);

-- Costo de lo vendido (para la ganancia): solo lo ven los dueños
create table public.venta_item_costos (
  item_id bigint primary key references public.venta_items(id),
  costo numeric(12,2) not null check (costo >= 0),     -- por unidad
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references public.usuarios(id)
);

-- Calendario de pagos. Al dar más tiempo, las cuotas viejas quedan "no vigentes".
create table public.cuotas (
  id bigint generated always as identity primary key,
  venta_id bigint not null references public.ventas(id),
  plan int not null,
  n int not null,
  tipo text not null check (tipo in ('inicial','cuota','recargo')),
  fecha date not null,
  monto numeric(12,2) not null check (monto > 0),
  vigente boolean not null default true,
  creado_en timestamptz not null default now()
);
create index cuotas_venta on public.cuotas (venta_id) where vigente;

-- ---------------------------------------------------------------------
-- Entregas: cuando el empleado le entrega a un dueño el efectivo que cobró
-- ---------------------------------------------------------------------
create table public.entregas (
  id bigint generated always as identity primary key,
  numero int not null unique,
  usuario_id uuid not null references public.usuarios(id),     -- quien entrega
  recibido_por uuid not null references public.usuarios(id),   -- dueño que recibe
  fecha date not null,
  esperado_usd numeric(12,2) not null default 0,
  esperado_bs numeric(14,2) not null default 0,
  entregado_usd numeric(12,2) not null default 0 check (entregado_usd >= 0),
  entregado_bs numeric(14,2) not null default 0 check (entregado_bs >= 0),
  abonos int not null default 0,
  nota text,
  clave uuid unique,
  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Abonos. Un pago que se reparte entre dos ventas queda en dos filas con el mismo "grupo".
-- ---------------------------------------------------------------------
create table public.abonos (
  id bigint generated always as identity primary key,
  grupo uuid not null,
  venta_id bigint not null references public.ventas(id),
  cliente_id bigint not null references public.clientes(id),
  fecha date not null,
  tipo text not null check (tipo in ('inicial','abono','antes_del_sistema')),
  metodo_id bigint references public.metodos_pago(id),
  moneda text not null check (moneda in ('USD','VES')),
  monto numeric(14,2) not null check (monto > 0),      -- en la moneda del método
  tasa numeric(14,4) check (tasa > 0),
  monto_usd numeric(12,2) not null check (monto_usd > 0),
  referencia text,
  comprobante text,
  nota text,
  recibido_por uuid references public.usuarios(id),
  entrega_id bigint references public.entregas(id),
  hecho_en timestamptz not null default now(),
  creado_en timestamptz not null default now(),
  creado_por uuid references public.usuarios(id),
  anulado_en timestamptz,
  anulado_por uuid references public.usuarios(id),
  motivo_anulacion text,
  constraint abono_con_metodo check (tipo = 'antes_del_sistema' or metodo_id is not null),
  constraint bs_con_tasa check (moneda = 'USD' or tasa is not null)
);
create index abonos_venta on public.abonos (venta_id);
create index abonos_cliente on public.abonos (cliente_id);
create index abonos_grupo on public.abonos (grupo);
create index abonos_fecha on public.abonos (fecha);
create index abonos_por_entregar on public.abonos (recibido_por) where entrega_id is null and anulado_en is null;

-- Historial de cada venta: recargos, descuentos, más tiempo, retiro, anulación, costos
create table public.eventos_venta (
  id bigint generated always as identity primary key,
  venta_id bigint not null references public.ventas(id),
  tipo text not null check (tipo in ('recargo','descuento','reprogramacion','retiro','devolucion','cierre','reactivacion','anulacion','costo')),
  monto numeric(12,2),
  motivo text,
  datos jsonb,
  usuario_id uuid references public.usuarios(id),
  creado_en timestamptz not null default now()
);
create index eventos_venta_venta on public.eventos_venta (venta_id);

-- ---------------------------------------------------------------------
-- Rastro, números corridos y claves de operaciones
-- ---------------------------------------------------------------------
create table public.auditoria (
  id bigint generated always as identity primary key,
  tabla text not null,
  registro_id text not null,
  accion text not null,
  antes jsonb,
  despues jsonb,
  usuario_id uuid,
  creado_en timestamptz not null default now()
);

create table public.contadores (
  nombre text primary key,
  valor bigint not null default 0
);
insert into public.contadores (nombre) values ('venta'), ('entrega');

create table public.operaciones (
  clave uuid primary key,
  tipo text not null,
  resultado jsonb,
  usuario_id uuid,
  creado_en timestamptz not null default now()
);

-- =====================================================================
-- Quién ve qué (las usan las reglas RLS)
-- =====================================================================
create function public.es_activo() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.usuarios where id = auth.uid() and activo)
$$;

create function public.es_dueno() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.usuarios where id = auth.uid() and activo and rol = 'dueno')
$$;

create function public.ve_cliente(p_cliente bigint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.clientes c join public.usuarios u on u.id = auth.uid() and u.activo
     where c.id = p_cliente and (u.rol = 'dueno' or u.sede = c.sede))
$$;

create function public.ve_venta(p_venta bigint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.ventas v
      join public.clientes c on c.id = v.cliente_id
      join public.usuarios u on u.id = auth.uid() and u.activo
     where v.id = p_venta and (u.rol = 'dueno' or u.sede = c.sede))
$$;

-- Fotos: cli/<id del cliente>/<nombre>.jpg — se ven y se suben solo si se ve el cliente
create function public.ve_ruta_foto(p_nombre text) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_partes text[] := string_to_array(p_nombre, '/');
begin
  if array_length(v_partes, 1) <> 3 or v_partes[1] <> 'cli' or v_partes[2] !~ '^[0-9]{1,15}$' then
    return false;
  end if;
  return public.ve_cliente(v_partes[2]::bigint);
end $$;

-- =====================================================================
-- Funciones internas (esquema "interno": la app no las puede llamar)
-- =====================================================================
create function interno.hoy() returns date language sql stable set search_path = public, pg_temp as $$
  select (now() at time zone 'America/Caracas')::date
$$;

create function interno.yo() returns public.usuarios
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare u public.usuarios;
begin
  select * into u from public.usuarios where id = auth.uid();
  if not found or not u.activo then
    raise exception 'Tu usuario no está activo. Habla con Franklin o Daniel.';
  end if;
  return u;
end $$;

create function interno.dueno() returns public.usuarios
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare u public.usuarios;
begin
  u := interno.yo();
  if u.rol <> 'dueno' then
    raise exception 'Solo los dueños pueden hacer esto.';
  end if;
  return u;
end $$;

-- $1.234,56
create function interno.dinero(p numeric) returns text language sql immutable set search_path = public, pg_temp as $$
  select '$' || translate(to_char(round(coalesce(p, 0), 2), 'FM999,999,990.00'), ',.', '.,')
$$;

-- Texto limpio de un campo del JSON (null si viene vacío); avisa si es muy largo
create function interno.texto(p jsonb, p_campo text, p_max int default 200) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare v text := nullif(trim(p->>p_campo), '');
begin
  if v is not null and length(v) > p_max then
    raise exception 'El dato "%" es muy largo (máximo % letras).', p_campo, p_max;
  end if;
  return v;
end $$;

-- V-12.345.678 → V12345678; 12345678 → V12345678
create function interno.norm_cedula(p text) returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when v = '' then null
    when v ~ '^[0-9]+$' then 'V' || v
    else v end
  from (select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')) as v) s
$$;

create function interno.norm_ref(p text) returns text language sql immutable set search_path = public, pg_temp as $$
  select nullif(lower(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')), '')
$$;

create function interno.auditar(p_tabla text, p_id text, p_accion text, p_antes jsonb, p_despues jsonb)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.auditoria (tabla, registro_id, accion, antes, despues, usuario_id)
  values (p_tabla, p_id, p_accion, p_antes, p_despues, auth.uid());
$$;

-- Siguiente número corrido. Si la operación falla, el número se devuelve (no deja huecos).
create function interno.siguiente(p_nombre text) returns bigint
language sql security definer set search_path = public, pg_temp as $$
  update public.contadores set valor = valor + 1 where nombre = p_nombre returning valor
$$;

-- Reserva la clave de una operación. Si ya se hizo, devuelve su resultado (no se repite).
create function interno.idem_inicio(p_clave uuid, p_tipo text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_res jsonb; v_n int;
begin
  if p_clave is null then return null; end if;
  insert into public.operaciones (clave, tipo, usuario_id) values (p_clave, p_tipo, auth.uid())
  on conflict (clave) do nothing;
  get diagnostics v_n = row_count;
  if v_n = 1 then return null; end if;
  select resultado into v_res from public.operaciones where clave = p_clave;
  if v_res is null then
    raise exception 'Esta operación ya se registró. Revisa antes de repetirla.';
  end if;
  return v_res;
end $$;

create function interno.idem_fin(p_clave uuid, p_resultado jsonb) returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.operaciones set resultado = p_resultado where clave = p_clave;
$$;

-- Id de un cliente o venta creado con esa clave (para operaciones hechas sin señal)
create function interno.id_por_clave(p_clave uuid, p_tipo text) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select (resultado->>'id')::bigint from public.operaciones
   where clave = p_clave and tipo = p_tipo and resultado is not null
$$;

create function interno.cliente_para(p_id bigint, u public.usuarios) returns public.clientes
language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.clientes;
begin
  if p_id is null then raise exception 'Elige el cliente.'; end if;
  select * into c from public.clientes where id = p_id;
  if not found or c.deleted_at is not null then
    raise exception 'Ese cliente no existe.';
  end if;
  if u.rol <> 'dueno' and c.sede is distinct from u.sede then
    raise exception 'Ese cliente no es de tu sede.';
  end if;
  return c;
end $$;

-- Busca la venta, revisa que se pueda ver y la bloquea
create function interno.venta_para(p_id bigint, u public.usuarios) returns public.ventas
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.ventas;
begin
  select * into v from public.ventas where id = p_id for update;
  if not found then raise exception 'Esa venta no existe.'; end if;
  perform interno.cliente_para(v.cliente_id, u);
  return v;
end $$;

-- Recalcula lo pagado, el ajuste y el estado desde la fuente (se puede repetir sin descuadrar)
create function interno.recalcular_venta(p_venta bigint) returns public.ventas
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.ventas; v_pagado numeric; v_ajuste numeric;
begin
  select coalesce(sum(monto_usd), 0) into v_pagado
    from public.abonos where venta_id = p_venta and anulado_en is null;
  select coalesce(sum(case tipo when 'recargo' then monto when 'descuento' then -monto else 0 end), 0) into v_ajuste
    from public.eventos_venta where venta_id = p_venta;
  update public.ventas set
    pagado = v_pagado,
    ajuste = v_ajuste,
    estado = case when estado in ('activa','pagada')
                  then case when total + v_ajuste - v_pagado <= 0.004 then 'pagada' else 'activa' end
                  else estado end,
    pagada_en = case when estado in ('activa','pagada')
                     then case when total + v_ajuste - v_pagado <= 0.004 then coalesce(pagada_en, now()) else null end
                     else pagada_en end
  where id = p_venta
  returning * into v;
  return v;
end $$;

-- Inserta un calendario de cuotas y revisa que sume lo que tiene que sumar
create function interno.insertar_cuotas(p_venta bigint, p_plan int, p_cuotas jsonb, p_esperado numeric,
                                        p_desde date, p_n int)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  x jsonb; v_fecha date; v_prev date; v_monto numeric; v_suma numeric := 0;
  v_i int := 0; v_ultima bigint; v_dif numeric;
begin
  if p_cuotas is null or jsonb_typeof(p_cuotas) <> 'array' or jsonb_array_length(p_cuotas) = 0 then
    raise exception 'Faltan las cuotas.';
  end if;
  if jsonb_array_length(p_cuotas) > 200 then
    raise exception 'Son demasiadas cuotas (máximo 200).';
  end if;
  for x in select value from jsonb_array_elements(p_cuotas) loop
    v_fecha := nullif(x->>'fecha', '')::date;
    v_monto := round(nullif(x->>'monto', '')::numeric, 2);
    if v_fecha is null then raise exception 'A una cuota le falta la fecha.'; end if;
    if v_monto is null or v_monto <= 0 then raise exception 'Cada cuota debe ser mayor que cero.'; end if;
    if p_desde is not null and v_fecha < p_desde then
      raise exception 'Una cuota no puede ser antes de la fecha de la venta.';
    end if;
    if v_prev is not null and v_fecha < v_prev then
      raise exception 'Las cuotas deben ir en orden de fecha.';
    end if;
    v_prev := v_fecha;
    insert into public.cuotas (venta_id, plan, n, tipo, fecha, monto)
    values (p_venta, p_plan, p_n + v_i, 'cuota', v_fecha, v_monto)
    returning id into v_ultima;
    v_i := v_i + 1;
    v_suma := v_suma + v_monto;
  end loop;
  v_dif := round(p_esperado - v_suma, 2);
  if abs(v_dif) > 0.01 then
    raise exception 'Las cuotas suman % y deben sumar %.', interno.dinero(v_suma), interno.dinero(p_esperado);
  end if;
  if v_dif <> 0 then
    update public.cuotas set monto = monto + v_dif where id = v_ultima;
  end if;
end $$;

-- Lee un pago {metodo_id, monto (en la moneda del método), tasa, monto_usd, referencia}
create type interno.pago as (
  metodo_id bigint, moneda text, monto numeric, tasa numeric, monto_usd numeric, referencia text, en_mano boolean
);

create function interno.leer_pago(p jsonb) returns interno.pago
language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.metodos_pago; r interno.pago;
begin
  select * into m from public.metodos_pago where id = nullif(p->>'metodo_id', '')::bigint;
  if not found or not m.activo then raise exception 'Elige cómo pagó.'; end if;
  r.metodo_id := m.id;
  r.moneda := m.moneda;
  r.en_mano := m.en_mano;
  r.monto := round(nullif(p->>'monto', '')::numeric, 2);
  if r.monto is null or r.monto <= 0 then raise exception 'Escribe el monto.'; end if;
  if m.moneda = 'USD' then
    r.monto_usd := r.monto;
    r.tasa := null;
  else
    r.tasa := round(nullif(p->>'tasa', '')::numeric, 4);
    if r.tasa is null or r.tasa <= 0 then raise exception 'Falta la tasa para cobrar en bolívares.'; end if;
    r.monto_usd := round(r.monto / r.tasa, 2);
    if r.monto_usd <= 0 then raise exception 'El monto es muy pequeño.'; end if;
    if nullif(p->>'monto_usd', '') is not null and abs((p->>'monto_usd')::numeric - r.monto_usd) > 0.011 then
      raise exception 'El monto en dólares no cuadra con la tasa. Revísalo.';
    end if;
  end if;
  r.referencia := interno.texto(p, 'referencia', 60);
  return r;
end $$;

-- Avisa si una referencia (Zelle, pago móvil…) ya se usó en otro abono vivo
create function interno.revisar_referencia(r interno.pago, p_forzar boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_fecha date; v_monto numeric;
begin
  if r.referencia is null or coalesce(p_forzar, false) then return; end if;
  select a.fecha, sum(a.monto) into v_fecha, v_monto from public.abonos a
   where a.metodo_id = r.metodo_id and a.anulado_en is null
     and interno.norm_ref(a.referencia) = interno.norm_ref(r.referencia)
   group by a.grupo, a.fecha limit 1;
  if found then
    raise exception using errcode = 'EM001',
      message = format('Esa referencia ya se registró el %s. Revisa que no sea el mismo pago.', to_char(v_fecha, 'DD/MM/YYYY'));
  end if;
end $$;

-- El empleado solo cobra en Bs con la tasa que pusieron los dueños (la de hoy o una de los últimos días,
-- por lo que quedó en la cola sin señal). Los dueños pueden usar otra.
create function interno.revisar_tasa(r interno.pago, u public.usuarios) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if r.moneda <> 'VES' or u.rol = 'dueno' then return; end if;
  if exists (select 1 from public.config where id = 1 and tasa_bs = r.tasa)
     or exists (select 1 from public.tasas where tasa = r.tasa and creado_en >= now() - interval '8 days') then
    return;
  end if;
  raise exception 'La tasa % no es la que pusieron los dueños. Actualiza la app y vuelve a intentar.', r.tasa;
end $$;

create function interno.fecha_permitida(p_fecha date, u public.usuarios) returns date
language plpgsql stable set search_path = public, pg_temp as $$
begin
  if p_fecha is null then return interno.hoy(); end if;
  if p_fecha > interno.hoy() then raise exception 'La fecha no puede ser futura.'; end if;
  if u.rol <> 'dueno' and p_fecha < interno.hoy() - 7 then
    raise exception 'Solo los dueños pueden anotar algo con más de 7 días de atraso.';
  end if;
  return p_fecha;
end $$;

create function interno.hecho_en(p jsonb) returns timestamptz language sql stable set search_path = public, pg_temp as $$
  select least(coalesce(nullif(p->>'hecho_en', '')::timestamptz, now()), now())
$$;

-- =====================================================================
-- Clientes
-- =====================================================================
-- Crea (sin "id") o edita (con "id") un cliente. Solo cambia los campos que vienen.
create function public.guardar_cliente(p jsonb, p_clave uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  u public.usuarios;
  v_prev jsonb;
  v_id bigint := nullif(p->>'id', '')::bigint;
  c public.clientes;
  v_antes jsonb;
  v_sede text;
  v_ced text;
  v_otro record;
  v_nombre text;
  v_lat numeric;
  v_lng numeric;
  v_res jsonb;
begin
  u := interno.yo();
  v_prev := interno.idem_inicio(p_clave, 'cliente');
  if v_prev is not null then return v_prev; end if;

  if v_id is not null then
    select * into c from public.clientes where id = v_id for update;
    if not found or c.deleted_at is not null then raise exception 'Ese cliente no existe.'; end if;
    if u.rol <> 'dueno' and c.sede is distinct from u.sede then raise exception 'Ese cliente no es de tu sede.'; end if;
    v_antes := to_jsonb(c);
  end if;

  v_nombre := case when p ? 'nombre' or v_id is null then interno.texto(p, 'nombre', 120) else c.nombre end;
  if v_nombre is null then raise exception 'Escribe el nombre del cliente.'; end if;

  if u.rol = 'dueno' then
    v_sede := coalesce(nullif(p->>'sede', ''), c.sede);
  else
    v_sede := u.sede;
  end if;
  if v_sede is null or v_sede not in ('socopo','pedraza') then
    raise exception 'Elige si el cliente es de Socopó o de Pedraza.';
  end if;

  v_ced := case when p ? 'cedula' or v_id is null then interno.norm_cedula(p->>'cedula') else c.cedula end;
  if v_ced is not null and v_ced !~ '^[VEJPG][0-9]{5,10}$' then
    raise exception 'La cédula no se entiende. Escríbela así: V-12345678.';
  end if;
  if v_ced is not null then
    select id, nombre, sede into v_otro from public.clientes
     where cedula = v_ced and deleted_at is null and id <> coalesce(v_id, 0) limit 1;
    if found then
      if u.rol = 'dueno' or v_otro.sede = u.sede then
        raise exception using errcode = 'EM002', detail = v_otro.id::text,
          message = format('Ya hay un cliente con esa cédula: %s.', v_otro.nombre);
      else
        raise exception using errcode = 'EM002',
          message = 'Ya hay un cliente con esa cédula en Socopó. Habla con Franklin o Daniel.';
      end if;
    end if;
  end if;

  if p ? 'lat' or p ? 'lng' then
    v_lat := nullif(p->>'lat', '')::numeric;
    v_lng := nullif(p->>'lng', '')::numeric;
    if (v_lat is null) <> (v_lng is null)
       or (v_lat is not null and (v_lat not between -90 and 90 or v_lng not between -180 and 180)) then
      raise exception 'La ubicación no es válida.';
    end if;
  else
    v_lat := c.lat;
    v_lng := c.lng;
  end if;

  if v_id is null then
    insert into public.clientes (
      nombre, cedula, telefono, telefono2, sede, sector, direccion, referencia, trabajo,
      en_exterior, pais, contacto_nombre, contacto_telefono,
      fiador_nombre, fiador_cedula, fiador_telefono, fiador_direccion,
      lat, lng, ubicacion_en, notas, no_venderle, no_venderle_motivo, clave, creado_por)
    values (
      v_nombre, v_ced, interno.texto(p, 'telefono', 30), interno.texto(p, 'telefono2', 30), v_sede,
      interno.texto(p, 'sector', 80), interno.texto(p, 'direccion', 300), interno.texto(p, 'referencia', 300),
      interno.texto(p, 'trabajo', 150),
      coalesce(nullif(p->>'en_exterior', '')::boolean, false), interno.texto(p, 'pais', 60),
      interno.texto(p, 'contacto_nombre', 120), interno.texto(p, 'contacto_telefono', 30),
      interno.texto(p, 'fiador_nombre', 120), interno.norm_cedula(p->>'fiador_cedula'),
      interno.texto(p, 'fiador_telefono', 30), interno.texto(p, 'fiador_direccion', 300),
      v_lat, v_lng, case when v_lat is not null then now() end,
      interno.texto(p, 'notas', 1000),
      case when u.rol = 'dueno' then coalesce(nullif(p->>'no_venderle', '')::boolean, false) else false end,
      case when u.rol = 'dueno' then interno.texto(p, 'no_venderle_motivo', 300) end,
      p_clave, u.id)
    returning * into c;
  else
    update public.clientes set
      nombre = v_nombre,
      cedula = v_ced,
      sede = v_sede,
      telefono = case when p ? 'telefono' then interno.texto(p, 'telefono', 30) else telefono end,
      telefono2 = case when p ? 'telefono2' then interno.texto(p, 'telefono2', 30) else telefono2 end,
      sector = case when p ? 'sector' then interno.texto(p, 'sector', 80) else sector end,
      direccion = case when p ? 'direccion' then interno.texto(p, 'direccion', 300) else direccion end,
      referencia = case when p ? 'referencia' then interno.texto(p, 'referencia', 300) else referencia end,
      trabajo = case when p ? 'trabajo' then interno.texto(p, 'trabajo', 150) else trabajo end,
      en_exterior = case when p ? 'en_exterior' then coalesce(nullif(p->>'en_exterior', '')::boolean, false) else en_exterior end,
      pais = case when p ? 'pais' then interno.texto(p, 'pais', 60) else pais end,
      contacto_nombre = case when p ? 'contacto_nombre' then interno.texto(p, 'contacto_nombre', 120) else contacto_nombre end,
      contacto_telefono = case when p ? 'contacto_telefono' then interno.texto(p, 'contacto_telefono', 30) else contacto_telefono end,
      fiador_nombre = case when p ? 'fiador_nombre' then interno.texto(p, 'fiador_nombre', 120) else fiador_nombre end,
      fiador_cedula = case when p ? 'fiador_cedula' then interno.norm_cedula(p->>'fiador_cedula') else fiador_cedula end,
      fiador_telefono = case when p ? 'fiador_telefono' then interno.texto(p, 'fiador_telefono', 30) else fiador_telefono end,
      fiador_direccion = case when p ? 'fiador_direccion' then interno.texto(p, 'fiador_direccion', 300) else fiador_direccion end,
      notas = case when p ? 'notas' then interno.texto(p, 'notas', 1000) else notas end,
      ubicacion_en = case when lat is distinct from v_lat or lng is distinct from v_lng
                          then case when v_lat is null then null else now() end else ubicacion_en end,
      lat = v_lat,
      lng = v_lng,
      no_venderle = case when u.rol = 'dueno' and p ? 'no_venderle'
                         then coalesce(nullif(p->>'no_venderle', '')::boolean, false) else no_venderle end,
      no_venderle_motivo = case when u.rol = 'dueno' and p ? 'no_venderle_motivo'
                                then interno.texto(p, 'no_venderle_motivo', 300) else no_venderle_motivo end,
      actualizado_en = now()
    where id = v_id
    returning * into c;
    perform interno.auditar('clientes', v_id::text, 'editar', v_antes, to_jsonb(c));
  end if;

  v_res := jsonb_build_object('id', c.id);
  perform interno.idem_fin(p_clave, v_res);
  return v_res;
end $$;

-- Quitar un cliente (borrado suave). Solo dueños y solo si no debe nada.
create function public.borrar_cliente(p_id bigint, p_motivo text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; c public.clientes;
begin
  u := interno.dueno();
  if nullif(trim(p_motivo), '') is null then raise exception 'Escribe por qué se quita.'; end if;
  select * into c from public.clientes where id = p_id for update;
  if not found or c.deleted_at is not null then raise exception 'Ese cliente no existe.'; end if;
  if exists (select 1 from public.ventas where cliente_id = p_id and estado = 'activa') then
    raise exception 'Este cliente tiene ventas pendientes. No se puede quitar.';
  end if;
  update public.clientes set deleted_at = now(), deleted_por = u.id, motivo_borrado = trim(p_motivo) where id = p_id;
  perform interno.auditar('clientes', p_id::text, 'borrar', to_jsonb(c), jsonb_build_object('motivo', trim(p_motivo)));
end $$;

-- =====================================================================
-- Ventas
-- =====================================================================
-- p = {
--   cliente_id | cliente_clave, fecha, origen ('nueva' | 'carga_inicial'),
--   items: [{producto_id?, descripcion, cantidad, precio, costo? (solo dueños)}],
--   inicial, pago_inicial?: {metodo_id, monto, tasa, monto_usd, referencia},
--   pagado_antes (solo carga_inicial: lo que ya pagó antes de usar el sistema),
--   frecuencia, cuotas: [{fecha, monto}], contrato_papel, notas, hecho_en
-- }
create function public.registrar_venta(p jsonb, p_clave uuid default null) returns jsonb
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
    insert into public.venta_items (venta_id, producto_id, descripcion, cantidad, precio, orden)
    values (v_id, v_prod, v_desc, v_cant, v_precio, v_orden)
    returning id into v_item;
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

-- =====================================================================
-- Abonos
-- =====================================================================
-- p = {cliente_id | cliente_clave, venta_id | venta_clave (si no, va a la venta más vieja primero),
--      metodo_id, monto, tasa, monto_usd, referencia, forzar_referencia, fecha, nota,
--      recibido_por (solo dueños), hecho_en}
create function public.registrar_abono(p jsonb, p_clave uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  u public.usuarios;
  v_prev jsonb;
  c public.clientes;
  v_cli bigint;
  r interno.pago;
  v_fecha date;
  v_recibe uuid;
  v_venta bigint;
  v_ids bigint[] := '{}';
  x record;
  v_saldo_total numeric;
  v_rest numeric;
  v_rest_bs numeric;
  v_parte numeric;
  v_parte_bs numeric;
  v_grupo uuid := coalesce(p_clave, gen_random_uuid());
  v_det jsonb := '[]'::jsonb;
  v public.ventas;
  v_res jsonb;
  i int;
begin
  u := interno.yo();
  v_prev := interno.idem_inicio(p_clave, 'abono');
  if v_prev is not null then return v_prev; end if;

  v_cli := coalesce(nullif(p->>'cliente_id', '')::bigint, interno.id_por_clave(nullif(p->>'cliente_clave', '')::uuid, 'cliente'));
  c := interno.cliente_para(v_cli, u);
  r := interno.leer_pago(p);
  perform interno.revisar_tasa(r, u);
  perform interno.revisar_referencia(r, coalesce(nullif(p->>'forzar_referencia', '')::boolean, false));
  v_fecha := interno.fecha_permitida(nullif(p->>'fecha', '')::date, u);

  v_recibe := u.id;
  if u.rol = 'dueno' and nullif(p->>'recibido_por', '') is not null then
    v_recibe := (p->>'recibido_por')::uuid;
    if not exists (select 1 from public.usuarios where id = v_recibe) then
      raise exception 'No se sabe quién recibió el pago.';
    end if;
  end if;

  v_venta := coalesce(nullif(p->>'venta_id', '')::bigint, interno.id_por_clave(nullif(p->>'venta_clave', '')::uuid, 'venta'));
  if nullif(p->>'venta_id', '') is not null or nullif(p->>'venta_clave', '') is not null then
    if v_venta is null then raise exception 'No se encontró la venta de este abono.'; end if;
    for x in select id from public.ventas where id = v_venta and cliente_id = v_cli and estado = 'activa' for update loop
      v_ids := v_ids || x.id;
    end loop;
    if cardinality(v_ids) = 0 then raise exception 'Esa venta ya no tiene saldo pendiente o no es de este cliente.'; end if;
  else
    for x in select id from public.ventas where cliente_id = v_cli and estado = 'activa' order by fecha, id for update loop
      v_ids := v_ids || x.id;
    end loop;
    if cardinality(v_ids) = 0 then raise exception 'Este cliente no tiene ventas pendientes.'; end if;
  end if;

  v_saldo_total := 0;
  foreach v_venta in array v_ids loop
    v := interno.recalcular_venta(v_venta);
    v_saldo_total := v_saldo_total + greatest(v.saldo, 0);
  end loop;
  if r.monto_usd > v_saldo_total + 0.004 then
    raise exception 'El abono (%) es mayor que lo que debe (%).', interno.dinero(r.monto_usd), interno.dinero(v_saldo_total);
  end if;

  v_rest := r.monto_usd;
  v_rest_bs := r.monto;
  for i in 1 .. cardinality(v_ids) loop
    exit when v_rest <= 0.004;
    select * into v from public.ventas where id = v_ids[i];
    continue when v.saldo <= 0.004;
    if v_rest <= v.saldo + 0.004 then
      v_parte := v_rest;
      v_parte_bs := v_rest_bs;
    else
      v_parte := v.saldo;
      v_parte_bs := round(r.monto * v_parte / r.monto_usd, 2);
    end if;
    insert into public.abonos (grupo, venta_id, cliente_id, fecha, tipo, metodo_id, moneda, monto, tasa, monto_usd,
                               referencia, nota, recibido_por, hecho_en, creado_por)
    values (v_grupo, v.id, v_cli, v_fecha, 'abono', r.metodo_id, r.moneda,
            case when r.moneda = 'USD' then v_parte else v_parte_bs end, r.tasa, v_parte,
            r.referencia, interno.texto(p, 'nota', 300), v_recibe, interno.hecho_en(p), u.id);
    v_rest := v_rest - v_parte;
    v_rest_bs := v_rest_bs - v_parte_bs;
    v := interno.recalcular_venta(v.id);
    v_det := v_det || jsonb_build_object('venta_id', v.id, 'numero', v.numero, 'monto_usd', v_parte, 'saldo', v.saldo);
  end loop;

  v_res := jsonb_build_object(
    'grupo', v_grupo, 'cliente_id', v_cli, 'monto_usd', r.monto_usd, 'fecha', v_fecha, 'ventas', v_det,
    'saldo_cliente', (select coalesce(sum(saldo), 0) from public.ventas where cliente_id = v_cli and estado = 'activa'));
  perform interno.idem_fin(p_clave, v_res);
  return v_res;
end $$;

-- Anula un pago completo (todas sus partes). Solo dueños.
create function public.anular_abono(p_grupo uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; x record; n int := 0;
begin
  u := interno.dueno();
  if nullif(trim(p_motivo), '') is null then raise exception 'Escribe por qué se anula.'; end if;
  perform 1 from public.ventas where id in (select venta_id from public.abonos where grupo = p_grupo) order by id for update;
  for x in select * from public.abonos where grupo = p_grupo and anulado_en is null order by id for update loop
    update public.abonos set anulado_en = now(), anulado_por = u.id, motivo_anulacion = trim(p_motivo) where id = x.id;
    perform interno.recalcular_venta(x.venta_id);
    perform interno.auditar('abonos', x.id::text, 'anular', to_jsonb(x), jsonb_build_object('motivo', trim(p_motivo)));
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Ese abono no existe o ya estaba anulado.'; end if;
end $$;

-- =====================================================================
-- Cambios a una venta (solo dueños)
-- =====================================================================
-- Recargo (suma a la deuda y queda como una cuota en esa fecha) o descuento (rebaja las últimas cuotas)
create function public.ajustar_venta(p_venta bigint, p_tipo text, p_monto numeric, p_motivo text, p_fecha date default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  u public.usuarios; v public.ventas; v_monto numeric := round(p_monto, 2); v_rest numeric; x record; v_n int;
begin
  u := interno.dueno();
  if p_tipo not in ('recargo','descuento') then raise exception 'Tipo de ajuste no válido.'; end if;
  if v_monto is null or v_monto <= 0 then raise exception 'Escribe el monto.'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'Escribe el motivo.'; end if;
  v := interno.venta_para(p_venta, u);
  v := interno.recalcular_venta(p_venta);
  if v.estado <> 'activa' then raise exception 'Solo se ajustan ventas que tienen saldo pendiente.'; end if;

  if p_tipo = 'recargo' then
    select coalesce(max(n), 0) + 1 into v_n from public.cuotas where venta_id = p_venta;
    insert into public.cuotas (venta_id, plan, n, tipo, fecha, monto)
    values (p_venta, v.plan, v_n, 'recargo', coalesce(p_fecha, interno.hoy()), v_monto);
  else
    if v_monto > v.saldo + 0.004 then
      raise exception 'El descuento no puede ser mayor que lo que debe (%).', interno.dinero(v.saldo);
    end if;
    v_rest := v_monto;
    for x in select * from public.cuotas where venta_id = p_venta and vigente order by fecha desc, n desc for update loop
      exit when v_rest <= 0.004;
      if x.monto <= v_rest + 0.004 then
        update public.cuotas set vigente = false where id = x.id;
        v_rest := v_rest - x.monto;
      else
        update public.cuotas set monto = monto - v_rest where id = x.id;
        v_rest := 0;
      end if;
    end loop;
    if v_rest > 0.004 then
      update public.ventas set plan_base = greatest(plan_base - v_rest, 0) where id = p_venta;
    end if;
  end if;

  insert into public.eventos_venta (venta_id, tipo, monto, motivo, usuario_id)
  values (p_venta, p_tipo, v_monto, trim(p_motivo), u.id);
  v := interno.recalcular_venta(p_venta);
  perform interno.auditar('ventas', p_venta::text, p_tipo, jsonb_build_object('monto', v_monto),
                          jsonb_build_object('saldo', v.saldo, 'motivo', trim(p_motivo)));
  return jsonb_build_object('saldo', v.saldo, 'estado', v.estado);
end $$;

-- Más tiempo: un calendario nuevo para lo que falta. Las cuotas viejas quedan en el historial.
create function public.reprogramar_venta(p_venta bigint, p_frecuencia text, p_cuotas jsonb, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; v public.ventas; v_antes jsonb;
begin
  u := interno.dueno();
  if nullif(trim(p_motivo), '') is null then raise exception 'Escribe el motivo.'; end if;
  if p_frecuencia not in ('semanal','quincenal','mensual','personalizada') then
    raise exception 'Frecuencia de pago no válida.';
  end if;
  v := interno.venta_para(p_venta, u);
  v := interno.recalcular_venta(p_venta);
  if v.estado <> 'activa' or v.saldo <= 0.004 then raise exception 'Esta venta no tiene saldo pendiente.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('fecha', fecha, 'monto', monto, 'tipo', tipo) order by fecha, n), '[]'::jsonb)
    into v_antes from public.cuotas where venta_id = p_venta and vigente;
  update public.cuotas set vigente = false where venta_id = p_venta and vigente;
  update public.ventas set plan = plan + 1, plan_base = pagado, frecuencia = p_frecuencia where id = p_venta
  returning * into v;
  perform interno.insertar_cuotas(p_venta, v.plan, p_cuotas, v.saldo, null, 1);
  insert into public.eventos_venta (venta_id, tipo, motivo, datos, usuario_id)
  values (p_venta, 'reprogramacion', trim(p_motivo), jsonb_build_object('cuotas_antes', v_antes, 'plan', v.plan), u.id);
  perform interno.auditar('ventas', p_venta::text, 'reprogramar', jsonb_build_object('cuotas', v_antes),
                          jsonb_build_object('plan', v.plan, 'cuotas', p_cuotas));
  return jsonb_build_object('plan', v.plan, 'saldo', v.saldo);
end $$;

-- Retirar la mercancía por atraso: el cliente sigue debiendo y se le devuelve cuando pague todo
create function public.retirar_mercancia(p_venta bigint, p_motivo text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; v public.ventas;
begin
  u := interno.dueno();
  if nullif(trim(p_motivo), '') is null then raise exception 'Escribe qué pasó.'; end if;
  v := interno.venta_para(p_venta, u);
  if v.estado <> 'activa' then raise exception 'Solo se retira mercancía de ventas con saldo pendiente.'; end if;
  if v.mercancia = 'retirada' then raise exception 'La mercancía de esta venta ya está retirada.'; end if;
  update public.ventas set mercancia = 'retirada', mercancia_en = now() where id = p_venta;
  insert into public.eventos_venta (venta_id, tipo, monto, motivo, usuario_id)
  values (p_venta, 'retiro', v.saldo, trim(p_motivo), u.id);
  perform interno.auditar('ventas', p_venta::text, 'retirar_mercancia', jsonb_build_object('mercancia', v.mercancia),
                          jsonb_build_object('mercancia', 'retirada', 'saldo', v.saldo, 'motivo', trim(p_motivo)));
end $$;

-- Devolverle la mercancía retirada (normalmente cuando ya pagó todo)
create function public.devolver_mercancia(p_venta bigint, p_nota text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; v public.ventas;
begin
  u := interno.dueno();
  v := interno.venta_para(p_venta, u);
  v := interno.recalcular_venta(p_venta);
  if v.mercancia <> 'retirada' then raise exception 'La mercancía de esta venta no está retirada.'; end if;
  if v.saldo > 0.004 and nullif(trim(p_nota), '') is null then
    raise exception 'Todavía debe %. Escribe por qué se le devuelve antes de pagar.', interno.dinero(v.saldo);
  end if;
  update public.ventas set mercancia = 'devuelta', mercancia_en = now() where id = p_venta;
  insert into public.eventos_venta (venta_id, tipo, monto, motivo, usuario_id)
  values (p_venta, 'devolucion', v.saldo, nullif(trim(p_nota), ''), u.id);
  perform interno.auditar('ventas', p_venta::text, 'devolver_mercancia', jsonb_build_object('mercancia', 'retirada'),
                          jsonb_build_object('mercancia', 'devuelta', 'saldo', v.saldo));
end $$;

-- Cerrar la venta: se deja de cobrar lo que falta (lo abonado no se devuelve)
create function public.cerrar_venta(p_venta bigint, p_motivo text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; v public.ventas;
begin
  u := interno.dueno();
  if nullif(trim(p_motivo), '') is null then raise exception 'Escribe por qué se cierra.'; end if;
  v := interno.venta_para(p_venta, u);
  v := interno.recalcular_venta(p_venta);
  if v.estado <> 'activa' then raise exception 'Solo se cierran ventas con saldo pendiente.'; end if;
  update public.ventas set estado = 'cerrada', cerrada_en = now(), cerrada_por = u.id, motivo_cierre = trim(p_motivo)
   where id = p_venta;
  insert into public.eventos_venta (venta_id, tipo, monto, motivo, usuario_id)
  values (p_venta, 'cierre', v.saldo, trim(p_motivo), u.id);
  perform interno.auditar('ventas', p_venta::text, 'cerrar', jsonb_build_object('estado', v.estado, 'saldo', v.saldo),
                          jsonb_build_object('estado', 'cerrada', 'motivo', trim(p_motivo)));
end $$;

-- Reabrir una venta cerrada (se cerró por error o el cliente volvió a pagar)
create function public.reabrir_venta(p_venta bigint, p_motivo text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; v public.ventas;
begin
  u := interno.dueno();
  if nullif(trim(p_motivo), '') is null then raise exception 'Escribe el motivo.'; end if;
  v := interno.venta_para(p_venta, u);
  if v.estado <> 'cerrada' then raise exception 'Solo se reabren ventas cerradas.'; end if;
  update public.ventas set estado = 'activa', cerrada_en = null, cerrada_por = null, motivo_cierre = null where id = p_venta;
  perform interno.recalcular_venta(p_venta);
  insert into public.eventos_venta (venta_id, tipo, motivo, usuario_id) values (p_venta, 'reactivacion', trim(p_motivo), u.id);
  perform interno.auditar('ventas', p_venta::text, 'reabrir', jsonb_build_object('estado', 'cerrada'),
                          jsonb_build_object('motivo', trim(p_motivo)));
end $$;

-- Anular una venta hecha por error. Antes hay que anular sus abonos.
create function public.anular_venta(p_venta bigint, p_motivo text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; v public.ventas;
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
  update public.ventas set estado = 'anulada', cerrada_en = now(), cerrada_por = u.id, motivo_cierre = trim(p_motivo)
   where id = p_venta;
  insert into public.eventos_venta (venta_id, tipo, motivo, usuario_id) values (p_venta, 'anulacion', trim(p_motivo), u.id);
  perform interno.auditar('ventas', p_venta::text, 'anular', to_jsonb(v), jsonb_build_object('motivo', trim(p_motivo)));
end $$;

-- Poner o corregir el costo de lo vendido (para la ganancia)
create function public.poner_costo(p_item bigint, p_costo numeric) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; it public.venta_items; v_antes numeric; v_costo numeric := round(p_costo, 2);
begin
  u := interno.dueno();
  if v_costo is null or v_costo < 0 then raise exception 'Costo no válido.'; end if;
  select * into it from public.venta_items where id = p_item;
  if not found then raise exception 'Ese producto no existe en la venta.'; end if;
  select costo into v_antes from public.venta_item_costos where item_id = p_item;
  insert into public.venta_item_costos (item_id, costo, actualizado_en, actualizado_por) values (p_item, v_costo, now(), u.id)
  on conflict (item_id) do update set costo = excluded.costo, actualizado_en = now(), actualizado_por = u.id;
  if it.producto_id is not null then
    insert into public.producto_costos (producto_id, costo) values (it.producto_id, v_costo)
    on conflict (producto_id) do update set costo = excluded.costo, actualizado_en = now();
  end if;
  insert into public.eventos_venta (venta_id, tipo, monto, motivo, datos, usuario_id)
  values (it.venta_id, 'costo', v_costo, it.descripcion, jsonb_build_object('item_id', p_item, 'antes', v_antes), u.id);
end $$;

-- =====================================================================
-- Fotos (cliente, cédula, contrato, comprobante). La foto ya debe estar subida al bucket.
-- =====================================================================
create function public.poner_foto(p_tipo text, p_id bigint, p_clave uuid, p_ruta text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; v_cli bigint; v_ref bigint; v_antes text; v_grupo uuid;
begin
  u := interno.yo();
  if p_ruta is null or p_ruta !~ '^cli/[0-9]{1,15}/[a-z0-9_-]{1,80}\.jpg$' then
    raise exception 'Ruta de foto no válida.';
  end if;
  if p_tipo in ('cliente','cedula') then
    v_cli := coalesce(p_id, interno.id_por_clave(p_clave, 'cliente'));
  elsif p_tipo = 'contrato' then
    v_ref := coalesce(p_id, interno.id_por_clave(p_clave, 'venta'));
    select cliente_id into v_cli from public.ventas where id = v_ref;
  elsif p_tipo = 'comprobante' then
    if p_clave is not null then
      v_grupo := p_clave;
    else
      select grupo into v_grupo from public.abonos where id = p_id;
    end if;
    select cliente_id into v_cli from public.abonos where grupo = v_grupo limit 1;
  else
    raise exception 'Tipo de foto no válido.';
  end if;
  if v_cli is null then raise exception 'No se encontró a qué pertenece la foto.'; end if;
  perform interno.cliente_para(v_cli, u);
  if split_part(p_ruta, '/', 2) <> v_cli::text then raise exception 'La foto no es de este cliente.'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'fotos' and name = p_ruta) then
    raise exception 'La foto todavía no se ha subido.';
  end if;

  if p_tipo = 'cliente' then
    select foto into v_antes from public.clientes where id = v_cli;
    update public.clientes set foto = p_ruta, actualizado_en = now() where id = v_cli;
  elsif p_tipo = 'cedula' then
    select foto_cedula into v_antes from public.clientes where id = v_cli;
    update public.clientes set foto_cedula = p_ruta, actualizado_en = now() where id = v_cli;
  elsif p_tipo = 'contrato' then
    select foto_contrato into v_antes from public.ventas where id = v_ref;
    update public.ventas set foto_contrato = p_ruta where id = v_ref;
  else
    select comprobante into v_antes from public.abonos where grupo = v_grupo and comprobante is not null limit 1;
    update public.abonos set comprobante = p_ruta where grupo = v_grupo;
  end if;
  if v_antes is not null and v_antes <> p_ruta then
    perform interno.auditar('fotos', coalesce(v_ref, v_cli)::text, 'cambiar_' || p_tipo,
                            jsonb_build_object('ruta', v_antes), jsonb_build_object('ruta', p_ruta));
  end if;
end $$;

-- Resultado de una operación propia (para que el teléfono sepa el número de lo que mandó sin señal)
create function public.resolver_clave(p_clave uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select resultado from public.operaciones where clave = p_clave and usuario_id = auth.uid()
$$;

-- =====================================================================
-- Entregas del efectivo cobrado (empleado de Pedraza → dueño)
-- =====================================================================
-- p_abonos: los cobros que el dueño tenía en pantalla al contar (si llega uno nuevo, queda para la próxima)
create function public.registrar_entrega(p_usuario uuid, p_entregado_usd numeric, p_entregado_bs numeric,
                                         p_nota text default null, p_clave uuid default null, p_abonos bigint[] default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  u public.usuarios; v_prev jsonb; v_usd numeric := 0; v_bs numeric := 0; v_n int := 0; v_id bigint; v_num bigint;
  v_res jsonb; x record; v_ids bigint[] := '{}';
begin
  u := interno.dueno();
  v_prev := interno.idem_inicio(p_clave, 'entrega');
  if v_prev is not null then return v_prev; end if;
  if p_usuario is null or p_usuario = u.id then raise exception 'Elige quién entrega.'; end if;
  if not exists (select 1 from public.usuarios where id = p_usuario) then raise exception 'Ese usuario no existe.'; end if;
  if coalesce(p_entregado_usd, 0) < 0 or coalesce(p_entregado_bs, 0) < 0 then raise exception 'Montos no válidos.'; end if;
  for x in select a.id, a.moneda, a.monto from public.abonos a join public.metodos_pago m on m.id = a.metodo_id
            where a.recibido_por = p_usuario and m.en_mano and a.entrega_id is null and a.anulado_en is null
              and (p_abonos is null or a.id = any(p_abonos))
            order by a.id for update of a loop
    if x.moneda = 'USD' then v_usd := v_usd + x.monto; else v_bs := v_bs + x.monto; end if;
    v_n := v_n + 1;
    v_ids := v_ids || x.id;
  end loop;
  if v_n = 0 then raise exception 'No tiene efectivo pendiente por entregar.'; end if;
  v_num := interno.siguiente('entrega');
  insert into public.entregas (numero, usuario_id, recibido_por, fecha, esperado_usd, esperado_bs,
                               entregado_usd, entregado_bs, abonos, nota, clave)
  values (v_num, p_usuario, u.id, interno.hoy(), v_usd, v_bs, round(coalesce(p_entregado_usd, 0), 2),
          round(coalesce(p_entregado_bs, 0), 2), v_n, interno.texto(jsonb_build_object('n', p_nota), 'n', 500), p_clave)
  returning id into v_id;
  update public.abonos set entrega_id = v_id where id = any(v_ids);
  v_res := jsonb_build_object('id', v_id, 'numero', v_num, 'esperado_usd', v_usd, 'esperado_bs', v_bs,
                              'diferencia_usd', round(coalesce(p_entregado_usd, 0), 2) - v_usd,
                              'diferencia_bs', round(coalesce(p_entregado_bs, 0), 2) - v_bs, 'abonos', v_n);
  perform interno.idem_fin(p_clave, v_res);
  return v_res;
end $$;

-- =====================================================================
-- Ajustes: tasa, configuración, métodos y usuarios (solo dueños)
-- =====================================================================
create function public.actualizar_tasa(p_tasa numeric) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; v_tasa numeric := round(p_tasa, 4);
begin
  u := interno.dueno();
  if v_tasa is null or v_tasa <= 0 or v_tasa > 100000000 then raise exception 'Tasa no válida.'; end if;
  update public.config set tasa_bs = v_tasa, tasa_actualizada_en = now(), tasa_actualizada_por = u.id where id = 1;
  insert into public.tasas (tasa, usuario_id) values (v_tasa, u.id);
end $$;

create function public.actualizar_config(p jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; v_antes jsonb;
begin
  u := interno.dueno();
  select to_jsonb(c) into v_antes from public.config c where id = 1;
  update public.config set
    inicial_pct = case when p ? 'inicial_pct' then coalesce(nullif(p->>'inicial_pct', '')::numeric, 0) else inicial_pct end,
    telefono_negocio = case when p ? 'telefono_negocio' then interno.texto(p, 'telefono_negocio', 30) else telefono_negocio end,
    giros_para_retiro = case when p ? 'giros_para_retiro' then coalesce(nullif(p->>'giros_para_retiro', '')::int, 3) else giros_para_retiro end,
    contrato_condiciones = case when p ? 'contrato_condiciones' then interno.texto(p, 'contrato_condiciones', 6000) else contrato_condiciones end
  where id = 1;
  perform interno.auditar('config', '1', 'editar', v_antes, (select to_jsonb(c) from public.config c where id = 1));
end $$;

create function public.guardar_metodo(p jsonb) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; v_id bigint := nullif(p->>'id', '')::bigint; v_nombre text := interno.texto(p, 'nombre', 40);
begin
  u := interno.dueno();
  if v_id is null then
    if v_nombre is null then raise exception 'Escribe el nombre del método.'; end if;
    if coalesce(p->>'moneda', '') not in ('USD','VES') then raise exception 'Elige la moneda.'; end if;
    insert into public.metodos_pago (nombre, moneda, en_mano, pide_referencia, orden)
    values (v_nombre, p->>'moneda', coalesce(nullif(p->>'en_mano', '')::boolean, false),
            coalesce(nullif(p->>'pide_referencia', '')::boolean, false),
            (select coalesce(max(orden), 0) + 1 from public.metodos_pago))
    returning id into v_id;
  else
    update public.metodos_pago set
      nombre = coalesce(v_nombre, nombre),
      activo = case when p ? 'activo' then coalesce(nullif(p->>'activo', '')::boolean, activo) else activo end,
      pide_referencia = case when p ? 'pide_referencia' then coalesce(nullif(p->>'pide_referencia', '')::boolean, pide_referencia) else pide_referencia end
    where id = v_id;
    if not found then raise exception 'Ese método no existe.'; end if;
  end if;
  return v_id;
end $$;

create function public.actualizar_usuario(p_id uuid, p_nombre text, p_rol text, p_sede text, p_activo boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; v_antes public.usuarios;
begin
  u := interno.dueno();
  select * into v_antes from public.usuarios where id = p_id for update;
  if not found then raise exception 'Ese usuario no existe.'; end if;
  if nullif(trim(p_nombre), '') is null then raise exception 'Escribe el nombre.'; end if;
  if p_rol not in ('dueno','empleado') then raise exception 'Rol no válido.'; end if;
  if p_rol = 'empleado' and coalesce(p_sede, '') not in ('socopo','pedraza') then raise exception 'Elige la sede del empleado.'; end if;
  if p_id = u.id and (p_rol <> 'dueno' or not p_activo) then
    raise exception 'No te puedes quitar a ti mismo el permiso de dueño.';
  end if;
  update public.usuarios set nombre = trim(p_nombre), rol = p_rol,
         sede = case when p_rol = 'empleado' then p_sede else null end, activo = coalesce(p_activo, true)
   where id = p_id;
  perform interno.auditar('usuarios', p_id::text, 'editar', to_jsonb(v_antes),
                          (select to_jsonb(x) from public.usuarios x where id = p_id));
end $$;

create function public.marcar_clave_cambiada() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform interno.yo();
  update public.usuarios set debe_cambiar_clave = false where id = auth.uid();
end $$;

-- =====================================================================
-- RLS: la app solo lee, y solo lo que le toca
-- =====================================================================
alter table public.usuarios          enable row level security;
alter table public.config            enable row level security;
alter table public.tasas             enable row level security;
alter table public.metodos_pago      enable row level security;
alter table public.clientes          enable row level security;
alter table public.productos         enable row level security;
alter table public.producto_costos   enable row level security;
alter table public.ventas            enable row level security;
alter table public.venta_items       enable row level security;
alter table public.venta_item_costos enable row level security;
alter table public.cuotas            enable row level security;
alter table public.entregas          enable row level security;
alter table public.abonos            enable row level security;
alter table public.eventos_venta     enable row level security;
alter table public.auditoria         enable row level security;
alter table public.contadores        enable row level security;
alter table public.operaciones       enable row level security;

create policy "leer" on public.usuarios          for select to authenticated using (public.es_activo() or id = auth.uid());
create policy "leer" on public.config            for select to authenticated using (public.es_activo());
create policy "leer" on public.tasas             for select to authenticated using (public.es_activo());
create policy "leer" on public.metodos_pago      for select to authenticated using (public.es_activo());
create policy "leer" on public.clientes          for select to authenticated using (public.ve_cliente(id));
create policy "leer" on public.productos         for select to authenticated using (public.es_activo());
create policy "leer" on public.producto_costos   for select to authenticated using (public.es_dueno());
create policy "leer" on public.ventas            for select to authenticated using (public.ve_cliente(cliente_id));
create policy "leer" on public.venta_items       for select to authenticated using (public.ve_venta(venta_id));
create policy "leer" on public.venta_item_costos for select to authenticated using (public.es_dueno());
create policy "leer" on public.cuotas            for select to authenticated using (public.ve_venta(venta_id));
create policy "leer" on public.entregas          for select to authenticated using (public.es_dueno() or usuario_id = auth.uid());
create policy "leer" on public.abonos            for select to authenticated using (public.ve_cliente(cliente_id));
create policy "leer" on public.eventos_venta     for select to authenticated using (public.ve_venta(venta_id) and (tipo <> 'costo' or public.es_dueno()));
create policy "leer" on public.auditoria         for select to authenticated using (public.es_dueno());
-- contadores y operaciones: sin políticas (nadie las lee desde la app)

-- Permisos: nadie anónimo toca nada; los usuarios solo leen tablas y llaman las RPC de la lista.
-- Supabase da permisos a todos por defecto en lo nuevo: cada migración debe repetir este bloque.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema interno from public, anon, authenticated;
grant select on
  public.usuarios, public.config, public.tasas, public.metodos_pago, public.clientes, public.productos,
  public.producto_costos, public.ventas, public.venta_items, public.venta_item_costos, public.cuotas,
  public.entregas, public.abonos, public.eventos_venta, public.auditoria
to authenticated;
grant execute on function
  public.es_activo(), public.es_dueno(), public.ve_cliente(bigint), public.ve_venta(bigint), public.ve_ruta_foto(text),
  public.guardar_cliente(jsonb, uuid), public.borrar_cliente(bigint, text),
  public.registrar_venta(jsonb, uuid), public.registrar_abono(jsonb, uuid), public.anular_abono(uuid, text),
  public.ajustar_venta(bigint, text, numeric, text, date), public.reprogramar_venta(bigint, text, jsonb, text),
  public.retirar_mercancia(bigint, text), public.devolver_mercancia(bigint, text),
  public.cerrar_venta(bigint, text), public.reabrir_venta(bigint, text), public.anular_venta(bigint, text),
  public.poner_costo(bigint, numeric), public.poner_foto(text, bigint, uuid, text), public.resolver_clave(uuid),
  public.registrar_entrega(uuid, numeric, numeric, text, uuid, bigint[]),
  public.actualizar_tasa(numeric), public.actualizar_config(jsonb), public.guardar_metodo(jsonb),
  public.actualizar_usuario(uuid, text, text, text, boolean), public.marcar_clave_cambiada()
to authenticated;

-- =====================================================================
-- Fotos: bucket PRIVADO (cédulas, contratos, comprobantes). Se ven con enlace temporal.
-- Se suben a cli/<id del cliente>/... y solo quien ve al cliente las puede subir o ver. No se borran.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 3145728, array['image/jpeg'])
on conflict (id) do nothing;

create policy "fotos_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.ve_ruta_foto(name));
create policy "fotos_ver" on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and public.ve_ruta_foto(name));

-- =====================================================================
-- Datos iniciales: métodos de pago (los dueños los pueden activar o desactivar)
-- =====================================================================
insert into public.metodos_pago (nombre, moneda, en_mano, pide_referencia, orden) values
  ('Efectivo $',       'USD', true,  false, 1),
  ('Zelle',            'USD', false, true,  2),
  ('USDT',             'USD', false, true,  3),
  ('Pago móvil',       'VES', false, true,  4),
  ('Efectivo Bs',      'VES', true,  false, 5),
  ('Transferencia Bs', 'VES', false, true,  6);
