-- =====================================================================
-- Electro Montana — seguridad entre los dos socios (migración 006).
--
-- 1) Lo que baja una deuda o borra un pago necesita la APROBACIÓN DEL OTRO SOCIO:
--    anular un abono, hacer un descuento, anular una venta y cerrar una venta (dejar de cobrar).
--    Un dueño lo pide con el motivo; el otro socio lo aprueba o lo rechaza. Nadie se aprueba a sí mismo.
--    Solo aprueban las cuentas marcadas como socio (usuarios.puede_aprobar): Franklin y Daniel.
--    Otra cuenta de dueño (una nueva, o la de soporte) puede pedir, pero no aprobar.
-- 2) Historial que no se borra: la tabla auditoria no se puede cambiar ni borrar; ninguna tabla acepta
--    DELETE ni TRUNCATE (nada se borra: se anula); y todo cambio hecho por fuera de la app (directo en
--    la base, por ejemplo desde el panel de Supabase) queda anotado en auditoria como "directo".
-- 3) La cuenta de un socio solo la cambia él mismo: el otro no le quita el rol ni la desactiva
--    (la clave tampoco: lo revisa la función "usuarios").
-- 4) Arreglos de la revisión independiente de la base:
--    - El recargo lleva clave: con internet lento, tocar Guardar dos veces no lo duplica.
--    - No se devuelve al cliente ni se anula una venta cuya mercancía ya volvió a la tienda
--      (se contaba dos veces).
-- Nada de lo que existe se borra: las funciones viejas quedan, pero ahora piden usar la aprobación.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Socios: las únicas cuentas que aprueban
-- ---------------------------------------------------------------------
alter table public.usuarios add column puede_aprobar boolean not null default false;
update public.usuarios set puede_aprobar = true where usuario in ('franklin', 'daniel');

-- ---------------------------------------------------------------------
-- Solicitudes de cambio (lo que espera la aprobación del otro socio)
-- ---------------------------------------------------------------------
create table public.solicitudes (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('anular_abono','descuento','anular_venta','cerrar_venta')),
  venta_id bigint references public.ventas(id),
  grupo uuid,                                    -- anular_abono: el pago (todas sus partes)
  cliente_id bigint not null references public.clientes(id),
  monto numeric(12,2),                           -- el abono, el descuento o lo que se deja de cobrar
  motivo text not null check (length(trim(motivo)) > 0),
  detalle text,                                  -- cómo se ve en la lista
  pedida_por uuid not null references public.usuarios(id),
  pedida_en timestamptz not null default now(),
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada','cancelada')),
  resuelta_por uuid references public.usuarios(id),
  resuelta_en timestamptz,
  respuesta text,
  resultado jsonb,
  clave uuid unique,
  constraint solicitud_objetivo check ((tipo = 'anular_abono' and grupo is not null) or (tipo <> 'anular_abono' and venta_id is not null))
);
create index solicitudes_estado on public.solicitudes (estado, pedida_en desc);
create index solicitudes_cliente on public.solicitudes (cliente_id);

-- ---------------------------------------------------------------------
-- Lo que hace cada cambio (lo llama la aprobación; la app no lo ve)
-- u = quien lo pidió (queda como responsable); el motivo ya trae quién lo aprobó.
-- ---------------------------------------------------------------------
create function interno.anular_abono_int(p_grupo uuid, p_motivo text, u public.usuarios) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare x record; n int := 0; v_total numeric := 0;
begin
  if nullif(trim(p_motivo), '') is null then raise exception 'Escribe por qué se anula.'; end if;
  perform 1 from public.ventas where id in (select venta_id from public.abonos where grupo = p_grupo) order by id for update;
  for x in select * from public.abonos where grupo = p_grupo and anulado_en is null order by id for update loop
    update public.abonos set anulado_en = now(), anulado_por = u.id, motivo_anulacion = trim(p_motivo) where id = x.id;
    perform interno.recalcular_venta(x.venta_id);
    perform interno.auditar('abonos', x.id::text, 'anular', to_jsonb(x), jsonb_build_object('motivo', trim(p_motivo)));
    n := n + 1;
    v_total := v_total + x.monto_usd;
  end loop;
  if n = 0 then raise exception 'Ese abono no existe o ya estaba anulado.'; end if;
  return jsonb_build_object('partes', n, 'monto_usd', v_total);
end $$;

-- Descuento: rebaja las últimas cuotas (igual que antes en ajustar_venta)
create function interno.descuento_int(p_venta bigint, p_monto numeric, p_motivo text, u public.usuarios) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.ventas; v_monto numeric := round(p_monto, 2); v_rest numeric; x record;
begin
  if v_monto is null or v_monto <= 0 then raise exception 'Escribe el monto.'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'Escribe el motivo.'; end if;
  v := interno.venta_para(p_venta, u);
  v := interno.recalcular_venta(p_venta);
  if v.estado <> 'activa' then raise exception 'Solo se ajustan ventas que tienen saldo pendiente.'; end if;
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
  insert into public.eventos_venta (venta_id, tipo, monto, motivo, usuario_id)
  values (p_venta, 'descuento', v_monto, trim(p_motivo), u.id);
  v := interno.recalcular_venta(p_venta);
  perform interno.auditar('ventas', p_venta::text, 'descuento', jsonb_build_object('monto', v_monto),
                          jsonb_build_object('saldo', v.saldo, 'motivo', trim(p_motivo)));
  return jsonb_build_object('saldo', v.saldo, 'estado', v.estado);
end $$;

-- Cerrar: se deja de cobrar lo que falta (lo abonado no se devuelve)
create function interno.cerrar_venta_int(p_venta bigint, p_motivo text, u public.usuarios) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.ventas;
begin
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
  return jsonb_build_object('saldo', v.saldo, 'estado', 'cerrada');
end $$;

-- Anular una venta hecha por error (sin abonos). Lo que salió de una tienda vuelve a la existencia.
create function interno.anular_venta_int(p_venta bigint, p_motivo text, u public.usuarios) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.ventas; x record;
begin
  if nullif(trim(p_motivo), '') is null then raise exception 'Escribe por qué se anula.'; end if;
  v := interno.venta_para(p_venta, u);
  if v.estado = 'anulada' then raise exception 'Esta venta ya estaba anulada.'; end if;
  if v.mercancia = 'retirada' then raise exception 'Esta venta tiene la mercancía retirada. Devuélvela o ciérrala.'; end if;
  if v.reingresada_en is not null then raise exception 'La mercancía de esta venta ya volvió a la tienda: la venta no se puede anular.'; end if;
  if exists (select 1 from public.abonos where venta_id = p_venta and anulado_en is null and tipo <> 'antes_del_sistema') then
    raise exception 'Esta venta tiene abonos. Anúlalos primero.';
  end if;
  update public.abonos set anulado_en = now(), anulado_por = u.id, motivo_anulacion = 'Venta anulada: ' || trim(p_motivo)
   where venta_id = p_venta and anulado_en is null;
  perform interno.recalcular_venta(p_venta);
  for x in select id, producto_id, cantidad, sede_salida from public.venta_items
            where venta_id = p_venta and sede_salida is not null and producto_id is not null order by id loop
    perform interno.mover_stock(x.producto_id, x.sede_salida, x.cantidad, 'anulacion', p_venta, x.id, 'Venta anulada', null);
  end loop;
  update public.ventas set estado = 'anulada', cerrada_en = now(), cerrada_por = u.id, motivo_cierre = trim(p_motivo)
   where id = p_venta;
  insert into public.eventos_venta (venta_id, tipo, motivo, usuario_id) values (p_venta, 'anulacion', trim(p_motivo), u.id);
  perform interno.auditar('ventas', p_venta::text, 'anular', to_jsonb(v), jsonb_build_object('motivo', trim(p_motivo)));
  return jsonb_build_object('estado', 'anulada');
end $$;

-- Hace el cambio de una solicitud. u_pide = quien lo pidió; u_aprueba = el socio que lo aprobó.
create function interno.ejecutar_solicitud(s public.solicitudes, u_pide public.usuarios, u_aprueba public.usuarios) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_motivo text := trim(s.motivo) || ' (aprobó ' || u_aprueba.nombre || ')';
begin
  if s.tipo = 'anular_abono' then return interno.anular_abono_int(s.grupo, v_motivo, u_pide); end if;
  if s.tipo = 'descuento' then return interno.descuento_int(s.venta_id, s.monto, v_motivo, u_pide); end if;
  if s.tipo = 'cerrar_venta' then return interno.cerrar_venta_int(s.venta_id, v_motivo, u_pide); end if;
  if s.tipo = 'anular_venta' then return interno.anular_venta_int(s.venta_id, v_motivo, u_pide); end if;
  raise exception 'Tipo de cambio no válido.';
end $$;

-- ---------------------------------------------------------------------
-- Pedir, responder y cancelar
-- ---------------------------------------------------------------------
-- p = { tipo, motivo, grupo (anular_abono) | venta_id (descuento, cerrar_venta, anular_venta), monto (descuento) }
create function public.pedir_aprobacion(p jsonb, p_clave uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; s public.solicitudes; v public.ventas; c public.clientes; v_prev jsonb; v_res jsonb;
        a_cli bigint; a_total numeric; a_fecha date; a_partes int; a_metodo text;
begin
  u := interno.dueno();
  v_prev := interno.idem_inicio(p_clave, 'solicitud');
  if v_prev is not null then return v_prev; end if;
  s.tipo := p->>'tipo';
  if s.tipo is null or s.tipo not in ('anular_abono','descuento','anular_venta','cerrar_venta') then
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

  insert into public.solicitudes (tipo, venta_id, grupo, cliente_id, monto, motivo, detalle, pedida_por, clave)
  values (s.tipo, s.venta_id, s.grupo, s.cliente_id, s.monto, s.motivo, s.detalle, u.id, p_clave)
  returning * into s;
  perform interno.auditar('solicitudes', s.id::text, 'pedir', null, to_jsonb(s));
  v_res := jsonb_build_object('id', s.id, 'estado', s.estado, 'detalle', s.detalle);
  perform interno.idem_fin(p_clave, v_res);
  return v_res;
end $$;

-- El otro socio aprueba (se hace el cambio) o rechaza (con el porqué)
create function public.responder_aprobacion(p_id bigint, p_aprobar boolean, p_respuesta text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; s public.solicitudes; pide public.usuarios; v_res jsonb;
begin
  u := interno.dueno();
  if not u.puede_aprobar then raise exception 'Solo los socios pueden aprobar o rechazar cambios.'; end if;
  if p_aprobar is null then raise exception 'Elige aprobar o rechazar.'; end if;
  select * into s from public.solicitudes where id = p_id for update;
  if not found then raise exception 'Esa solicitud no existe.'; end if;
  if s.estado <> 'pendiente' then raise exception 'Esta solicitud ya no está pendiente (quedó %).', s.estado; end if;
  if s.pedida_por = u.id then raise exception 'No puedes responder lo que tú mismo pediste: lo responde el otro socio.'; end if;
  select * into pide from public.usuarios where id = s.pedida_por;
  if p_aprobar then
    v_res := interno.ejecutar_solicitud(s, pide, u);
    update public.solicitudes set estado = 'aprobada', resuelta_por = u.id, resuelta_en = now(),
           respuesta = nullif(trim(p_respuesta), ''), resultado = v_res
     where id = p_id returning * into s;
  else
    if nullif(trim(p_respuesta), '') is null then raise exception 'Escribe por qué no lo apruebas.'; end if;
    update public.solicitudes set estado = 'rechazada', resuelta_por = u.id, resuelta_en = now(), respuesta = trim(p_respuesta)
     where id = p_id returning * into s;
  end if;
  perform interno.auditar('solicitudes', s.id::text, case when p_aprobar then 'aprobar' else 'rechazar' end, null, to_jsonb(s));
  return jsonb_build_object('id', s.id, 'estado', s.estado, 'resultado', v_res);
end $$;

-- Quien pidió puede retirarlo mientras nadie lo haya respondido
create function public.cancelar_aprobacion(p_id bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; s public.solicitudes;
begin
  u := interno.dueno();
  select * into s from public.solicitudes where id = p_id for update;
  if not found then raise exception 'Esa solicitud no existe.'; end if;
  if s.pedida_por <> u.id then raise exception 'Solo quien lo pidió lo puede cancelar.'; end if;
  if s.estado <> 'pendiente' then raise exception 'Esta solicitud ya no está pendiente (quedó %).', s.estado; end if;
  update public.solicitudes set estado = 'cancelada', resuelta_por = u.id, resuelta_en = now() where id = p_id returning * into s;
  perform interno.auditar('solicitudes', s.id::text, 'cancelar', null, to_jsonb(s));
end $$;

-- ---------------------------------------------------------------------
-- Recargo con clave (sube la deuda: no necesita aprobación, pero no se duplica)
-- ---------------------------------------------------------------------
create function public.recargo_venta(p_venta bigint, p_monto numeric, p_motivo text, p_fecha date, p_clave uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; v public.ventas; v_monto numeric := round(p_monto, 2); v_n int; v_prev jsonb; v_res jsonb;
begin
  u := interno.dueno();
  if p_clave is null then raise exception 'Falta la clave de la operación. Actualiza la app.'; end if;
  v_prev := interno.idem_inicio(p_clave, 'recargo');
  if v_prev is not null then return v_prev; end if;
  if v_monto is null or v_monto <= 0 then raise exception 'Escribe el monto.'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'Escribe el motivo.'; end if;
  v := interno.venta_para(p_venta, u);
  v := interno.recalcular_venta(p_venta);
  if v.estado <> 'activa' then raise exception 'Solo se ajustan ventas que tienen saldo pendiente.'; end if;
  select coalesce(max(n), 0) + 1 into v_n from public.cuotas where venta_id = p_venta;
  insert into public.cuotas (venta_id, plan, n, tipo, fecha, monto)
  values (p_venta, v.plan, v_n, 'recargo', coalesce(p_fecha, interno.hoy()), v_monto);
  insert into public.eventos_venta (venta_id, tipo, monto, motivo, usuario_id)
  values (p_venta, 'recargo', v_monto, trim(p_motivo), u.id);
  v := interno.recalcular_venta(p_venta);
  perform interno.auditar('ventas', p_venta::text, 'recargo', jsonb_build_object('monto', v_monto),
                          jsonb_build_object('saldo', v.saldo, 'motivo', trim(p_motivo)));
  v_res := jsonb_build_object('saldo', v.saldo, 'estado', v.estado);
  perform interno.idem_fin(p_clave, v_res);
  return v_res;
end $$;

-- ---------------------------------------------------------------------
-- Las funciones de antes ya no lo hacen directo
-- ---------------------------------------------------------------------
create or replace function public.anular_abono(p_grupo uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'Anular un abono necesita la aprobación del otro socio. Actualiza la app y usa "Pedir anulación".';
end $$;

create or replace function public.ajustar_venta(p_venta bigint, p_tipo text, p_monto numeric, p_motivo text, p_fecha date default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'Actualiza la app: el recargo ahora va con su clave y el descuento necesita la aprobación del otro socio.';
end $$;

create or replace function public.cerrar_venta(p_venta bigint, p_motivo text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'Cerrar una venta necesita la aprobación del otro socio. Actualiza la app.';
end $$;

create or replace function public.anular_venta(p_venta bigint, p_motivo text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'Anular una venta necesita la aprobación del otro socio. Actualiza la app.';
end $$;

-- Devolver la mercancía retirada: no si ya volvió a la tienda (se contaría dos veces)
create or replace function public.devolver_mercancia(p_venta bigint, p_nota text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; v public.ventas;
begin
  u := interno.dueno();
  v := interno.venta_para(p_venta, u);
  v := interno.recalcular_venta(p_venta);
  if v.mercancia <> 'retirada' then raise exception 'La mercancía de esta venta no está retirada.'; end if;
  if v.reingresada_en is not null then
    raise exception 'Esta mercancía ya volvió a la tienda de % (se puede vender otra vez). Si se la entregas al cliente, sácala de la tienda en Mercancía → Ajustar.',
      case v.reingresada_sede when 'pedraza' then 'Pedraza' else 'Socopó' end;
  end if;
  if v.saldo > 0.004 and nullif(trim(p_nota), '') is null then
    raise exception 'Todavía debe %. Escribe por qué se le devuelve antes de pagar.', interno.dinero(v.saldo);
  end if;
  update public.ventas set mercancia = 'devuelta', mercancia_en = now() where id = p_venta;
  insert into public.eventos_venta (venta_id, tipo, monto, motivo, usuario_id)
  values (p_venta, 'devolucion', v.saldo, nullif(trim(p_nota), ''), u.id);
  perform interno.auditar('ventas', p_venta::text, 'devolver_mercancia', jsonb_build_object('mercancia', 'retirada'),
                          jsonb_build_object('mercancia', 'devuelta', 'saldo', v.saldo));
end $$;

-- La cuenta de un socio: el otro no le cambia el rol ni la desactiva
create or replace function public.actualizar_usuario(p_id uuid, p_nombre text, p_rol text, p_sede text, p_activo boolean)
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
  if v_antes.puede_aprobar and p_id <> u.id and (p_rol <> v_antes.rol or coalesce(p_activo, true) <> v_antes.activo) then
    raise exception 'La cuenta de un socio solo la puede cambiar él mismo.';
  end if;
  update public.usuarios set nombre = trim(p_nombre), rol = p_rol,
         sede = case when p_rol = 'empleado' then p_sede else null end, activo = coalesce(p_activo, true)
   where id = p_id;
  perform interno.auditar('usuarios', p_id::text, 'editar', to_jsonb(v_antes),
                          (select to_jsonb(x) from public.usuarios x where id = p_id));
end $$;

-- ---------------------------------------------------------------------
-- Historial que no se borra y cambios por fuera de la app
-- ---------------------------------------------------------------------
-- Nada se borra (se anula). Tampoco se cambia el historial.
create function interno.no_borrar() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'auditoria' then
    raise exception 'El historial de cambios no se puede cambiar ni borrar.';
  end if;
  raise exception 'En Electro Montana nada se borra: se anula (tabla %).', tg_table_name;
end $$;

-- Lo que llega por la app pasa por las funciones (la app no puede escribir en las tablas) y ya deja su
-- rastro. Lo demás (directo en la base, el panel de Supabase, una llave de servicio) se anota aquí.
create function interno.vigilar() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rol text; j jsonb;
begin
  begin
    v_rol := nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role';
  exception when others then v_rol := null;
  end;
  if v_rol = 'authenticated' then return null; end if;
  -- La función "usuarios" (crear cuenta, clave nueva) anota lo suyo en auditoria
  if v_rol = 'service_role' and tg_table_name = 'usuarios' then return null; end if;
  j := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.auditoria (tabla, registro_id, accion, antes, despues, usuario_id)
  values (tg_table_name, coalesce(j->>'id', j->>'item_id', j->>'producto_id', j->>'clave', ''),
          'directo_' || lower(tg_op) || case when v_rol = 'service_role' then '_servicio' else '' end,
          case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end, null);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['usuarios','config','tasas','metodos_pago','clientes','productos','producto_costos','ventas',
                           'venta_items','venta_item_costos','cuotas','abonos','entregas','eventos_venta','existencias',
                           'movimientos_inventario','gestiones','solicitudes','auditoria','contadores'] loop
    execute format('create trigger no_borrar before delete on public.%I for each row execute function interno.no_borrar()', t);
    execute format('create trigger no_vaciar before truncate on public.%I for each statement execute function interno.no_borrar()', t);
    if t = 'auditoria' then
      execute 'create trigger no_cambiar before update on public.auditoria for each row execute function interno.no_borrar()';
    else
      execute format('create trigger vigilar after insert or update or delete on public.%I for each row execute function interno.vigilar()', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- RLS y permisos
-- ---------------------------------------------------------------------
alter table public.solicitudes enable row level security;
create policy "leer" on public.solicitudes for select to authenticated using (public.es_dueno());
revoke all on public.solicitudes from anon, authenticated;
grant select on public.solicitudes to authenticated;

revoke execute on function
  interno.anular_abono_int(uuid, text, public.usuarios), interno.descuento_int(bigint, numeric, text, public.usuarios),
  interno.cerrar_venta_int(bigint, text, public.usuarios), interno.anular_venta_int(bigint, text, public.usuarios),
  interno.ejecutar_solicitud(public.solicitudes, public.usuarios, public.usuarios), interno.no_borrar(), interno.vigilar()
  from public, anon, authenticated;
revoke execute on function
  public.pedir_aprobacion(jsonb, uuid), public.responder_aprobacion(bigint, boolean, text), public.cancelar_aprobacion(bigint),
  public.recargo_venta(bigint, numeric, text, date, uuid)
  from public, anon;
grant execute on function
  public.pedir_aprobacion(jsonb, uuid), public.responder_aprobacion(bigint, boolean, text), public.cancelar_aprobacion(bigint),
  public.recargo_venta(bigint, numeric, text, date, uuid)
  to authenticated;
