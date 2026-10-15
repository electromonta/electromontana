-- =====================================================================
-- Electro Montana — copia automática diaria de todas las tablas.
-- Una fila por tabla y por día con todas sus filas en jsonb. Sirve para recuperar
-- algo que se dañó por error. NO reemplaza el respaldo de Supabase (plan Pro):
-- si se pierde el proyecto, se pierde también esta copia.
-- Si corre dos veces el mismo día, se actualiza la copia de ese día. Nada se borra.
-- Esquema cerrado: la app no lo ve; se consulta desde el conector.
-- Para recuperar una tabla: jsonb_populate_recordset(null::public.<tabla>, datos).
-- =====================================================================
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create schema respaldo_diario;
revoke all on schema respaldo_diario from public, anon, authenticated;

create table respaldo_diario.copias (
  fecha date not null,
  tabla text not null,
  filas int not null,
  datos jsonb not null,
  creado_en timestamptz not null default now(),
  primary key (fecha, tabla)
);
revoke all on table respaldo_diario.copias from public, anon, authenticated;

create function respaldo_diario.respaldar() returns int
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
  return n;
end $$;
revoke execute on function respaldo_diario.respaldar() from public, anon, authenticated;

-- Todos los días a las 2:30 a. m. de Venezuela (06:30 UTC)
select cron.schedule('electromontana-respaldo-diario', '30 6 * * *', $$select respaldo_diario.respaldar()$$);

-- Primera copia ahora mismo
select respaldo_diario.respaldar();
