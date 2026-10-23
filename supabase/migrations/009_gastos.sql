-- =====================================================================
-- Electro Montana — gastos del negocio (migración 009). Pedido de Kinan, 2026-10-23.
-- Alquiler, empleado, gasolina, reparaciones, servicios… para sacar la ganancia neta.
--   - Solo los dueños los anotan y los ven (el encargado de Pedraza no).
--   - Cada gasto: fecha, categoría, detalle, tienda (Socopó, Pedraza o de los dos), cómo se pagó
--     (métodos de pago; en bolívares con su tasa), monto y quién lo pagó.
--   - Llevan clave (se pueden anotar sin señal y no se duplican).
--   - Nada se borra: un gasto mal anotado lo anula quien lo anotó, con el motivo (queda en auditoría).
-- Solo agrega tablas y funciones; no toca nada de lo que ya existe.
-- =====================================================================

create table public.categorias_gasto (
  id bigint generated always as identity primary key,
  nombre text not null check (length(trim(nombre)) > 0),
  activo boolean not null default true,
  orden int not null default 100,
  creado_en timestamptz not null default now(),
  creado_por uuid references public.usuarios(id)
);
create unique index categorias_gasto_nombre on public.categorias_gasto (lower(nombre));

insert into public.categorias_gasto (nombre, orden) values
  ('Alquiler', 1), ('Empleado', 2), ('Gasolina', 3), ('Reparaciones', 4),
  ('Servicios', 5), ('Transporte', 6), ('Comida', 7), ('Otro', 99);

create table public.gastos (
  id bigint generated always as identity primary key,
  fecha date not null,
  categoria_id bigint not null references public.categorias_gasto(id),
  descripcion text,
  sede text check (sede in ('socopo','pedraza')),          -- null = de los dos (general)
  metodo_id bigint not null references public.metodos_pago(id),
  moneda text not null check (moneda in ('USD','VES')),
  monto numeric(14,2) not null check (monto > 0),
  tasa numeric(14,4),
  monto_usd numeric(12,2) not null check (monto_usd > 0),
  referencia text,
  pagado_por uuid not null references public.usuarios(id),  -- quién puso la plata
  nota text,
  clave uuid unique,
  hecho_en timestamptz not null default now(),
  creado_en timestamptz not null default now(),
  creado_por uuid references public.usuarios(id),
  anulado_en timestamptz,
  anulado_por uuid references public.usuarios(id),
  motivo_anulacion text
);
create index gastos_fecha on public.gastos (fecha);

-- ---------------------------------------------------------------------
-- Anotar un gasto. p = { fecha, categoria_id, descripcion, sede, metodo_id, monto, tasa, monto_usd,
--                        referencia, pagado_por, nota, hecho_en }
-- ---------------------------------------------------------------------
create function public.registrar_gasto(p jsonb, p_clave uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; v_prev jsonb; r interno.pago; g public.gastos; x public.usuarios; v_res jsonb;
begin
  u := interno.dueno();
  v_prev := interno.idem_inicio(p_clave, 'gasto');
  if v_prev is not null then return v_prev; end if;
  g.fecha := coalesce(nullif(p->>'fecha', '')::date, interno.hoy());
  if g.fecha > interno.hoy() then raise exception 'La fecha del gasto no puede ser futura.'; end if;
  if g.fecha < interno.hoy() - 400 then raise exception 'Esa fecha es de hace más de un año. Revísala.'; end if;
  g.categoria_id := nullif(p->>'categoria_id', '')::bigint;
  if not exists (select 1 from public.categorias_gasto where id = g.categoria_id and activo) then
    raise exception 'Elige en qué fue el gasto.';
  end if;
  g.descripcion := interno.texto(p, 'descripcion', 200);
  if g.descripcion is null and exists (select 1 from public.categorias_gasto where id = g.categoria_id and lower(nombre) = 'otro') then
    raise exception 'Escribe en qué fue el gasto.';
  end if;
  g.sede := nullif(p->>'sede', '');
  if g.sede is not null and g.sede not in ('socopo','pedraza') then raise exception 'Tienda no válida.'; end if;
  r := interno.leer_pago(p);
  g.pagado_por := coalesce(nullif(p->>'pagado_por', '')::uuid, u.id);
  select * into x from public.usuarios where id = g.pagado_por;
  if not found or not x.activo or x.rol <> 'dueno' then raise exception 'Elige quién lo pagó.'; end if;
  insert into public.gastos (fecha, categoria_id, descripcion, sede, metodo_id, moneda, monto, tasa, monto_usd, referencia,
                             pagado_por, nota, clave, hecho_en, creado_por)
  values (g.fecha, g.categoria_id, g.descripcion, g.sede, r.metodo_id, r.moneda, r.monto, r.tasa, r.monto_usd, r.referencia,
          g.pagado_por, interno.texto(p, 'nota', 500), p_clave, interno.hecho_en(p), u.id)
  returning * into g;
  perform interno.auditar('gastos', g.id::text, 'crear', null, to_jsonb(g));
  v_res := jsonb_build_object('id', g.id, 'monto_usd', g.monto_usd);
  perform interno.idem_fin(p_clave, v_res);
  return v_res;
end $$;

-- Un gasto mal anotado lo anula quien lo anotó (decisión de Kinan, 2026-10-23). Nada se borra.
create function public.anular_gasto(p_id bigint, p_motivo text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; g public.gastos;
begin
  u := interno.dueno();
  select * into g from public.gastos where id = p_id for update;
  if not found then raise exception 'Ese gasto no existe.'; end if;
  if g.anulado_en is not null then raise exception 'Ese gasto ya estaba anulado.'; end if;
  if g.creado_por is distinct from u.id then
    raise exception 'Solo lo puede anular quien lo anotó (%).', coalesce((select nombre from public.usuarios where id = g.creado_por), '—');
  end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'Escribe por qué se anula.'; end if;
  update public.gastos set anulado_en = now(), anulado_por = u.id, motivo_anulacion = left(trim(p_motivo), 300) where id = p_id;
  perform interno.auditar('gastos', p_id::text, 'anular', to_jsonb(g), jsonb_build_object('motivo', left(trim(p_motivo), 300)));
end $$;

-- Categoría nueva (o la misma si ya existía con ese nombre). Devuelve su id.
create function public.guardar_categoria_gasto(p_nombre text) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; v_nombre text := left(trim(coalesce(p_nombre, '')), 40); v_id bigint;
begin
  u := interno.dueno();
  if v_nombre = '' then raise exception 'Escribe el nombre de la categoría.'; end if;
  select id into v_id from public.categorias_gasto where lower(nombre) = lower(v_nombre);
  if v_id is not null then
    update public.categorias_gasto set activo = true where id = v_id and not activo;
    return v_id;
  end if;
  insert into public.categorias_gasto (nombre, creado_por) values (v_nombre, u.id) returning id into v_id;
  perform interno.auditar('categorias_gasto', v_id::text, 'crear', null, jsonb_build_object('nombre', v_nombre));
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Seguridad: solo los dueños leen; la app no escribe directo; nada se borra
-- ---------------------------------------------------------------------
alter table public.categorias_gasto enable row level security;
alter table public.gastos enable row level security;
create policy "leer" on public.categorias_gasto for select to authenticated using (public.es_dueno());
create policy "leer" on public.gastos for select to authenticated using (public.es_dueno());
revoke all on public.categorias_gasto, public.gastos from anon, authenticated;
grant select on public.categorias_gasto, public.gastos to authenticated;

do $$
declare t text;
begin
  foreach t in array array['categorias_gasto','gastos'] loop
    execute format('create trigger no_borrar before delete on public.%I for each row execute function interno.no_borrar()', t);
    execute format('create trigger no_vaciar before truncate on public.%I for each statement execute function interno.no_borrar()', t);
    execute format('create trigger vigilar after insert or update or delete on public.%I for each row execute function interno.vigilar()', t);
  end loop;
end $$;

revoke execute on function public.registrar_gasto(jsonb, uuid), public.anular_gasto(bigint, text),
  public.guardar_categoria_gasto(text) from public, anon;
grant execute on function public.registrar_gasto(jsonb, uuid), public.anular_gasto(bigint, text),
  public.guardar_categoria_gasto(text) to authenticated;
