-- =====================================================================
-- Electro Montana — la copia de cada noche ya no crece sin fin ("dale" de Kinan, 2026-10-16).
-- Se guardan: todas las copias de los últimos 30 días y, de ahí para atrás, la primera de cada mes.
-- La limpieza corre sola cada noche, DESPUÉS de guardar la copia del día y en la misma transacción
-- (si la copia falla, no se borra nada). Solo toca respaldo_diario.copias, nunca los datos del negocio.
-- =====================================================================

-- Borra las copias de más de 30 días que no son la primera de su mes. Devuelve cuántas filas borró.
create function respaldo_diario.limpiar(p_hoy date) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  if p_hoy is null then raise exception 'Falta la fecha de hoy.'; end if;
  delete from respaldo_diario.copias c
   where c.fecha < p_hoy - 30
     and c.fecha > (select min(x.fecha) from respaldo_diario.copias x
                     where date_trunc('month', x.fecha) = date_trunc('month', c.fecha));
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function respaldo_diario.limpiar(date) from public, anon, authenticated;

-- La misma copia de cada noche de la migración 002, y al final la limpieza
create or replace function respaldo_diario.respaldar() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r record;
  v_hoy date := (now() at time zone 'America/Caracas')::date;
  v_filas int;
  v_datos jsonb;
  n int := 0;
begin
  for r in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
            where s.nspname = 'public' and c.relkind = 'r' order by c.relname loop
    execute format('select count(*)::int, coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t', r.relname)
      into v_filas, v_datos;
    insert into respaldo_diario.copias (fecha, tabla, filas, datos) values (v_hoy, r.relname, v_filas, v_datos)
    on conflict (fecha, tabla) do update set filas = excluded.filas, datos = excluded.datos, creado_en = now();
    n := n + 1;
  end loop;
  -- Qué fotos existen (los archivos viven en el bucket, que no permite borrar)
  insert into respaldo_diario.copias (fecha, tabla, filas, datos)
  select v_hoy, 'storage:fotos', count(*),
         coalesce(jsonb_agg(jsonb_build_object('name', name, 'size', metadata->>'size', 'creado', created_at) order by name), '[]'::jsonb)
    from storage.objects where bucket_id = 'fotos'
  on conflict (fecha, tabla) do update set filas = excluded.filas, datos = excluded.datos, creado_en = now();
  -- Correos de entrada de las cuentas (para poder rehacer los usuarios)
  insert into respaldo_diario.copias (fecha, tabla, filas, datos)
  select v_hoy, 'auth:usuarios', count(*),
         coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'email', a.email, 'creado', a.created_at)), '[]'::jsonb)
    from auth.users a where a.id in (select id from public.usuarios)
  on conflict (fecha, tabla) do update set filas = excluded.filas, datos = excluded.datos, creado_en = now();
  -- 30 días completos y una por mes de ahí para atrás
  perform respaldo_diario.limpiar(v_hoy);
  return n;
end $$;
revoke execute on function respaldo_diario.respaldar() from public, anon, authenticated;
