-- Solo para la copia LOCAL de pruebas: el rol que usa PostgREST y usuarios de prueba (clave "prueba123").
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
alter table auth.users add column if not exists clave text;
insert into auth.users (id, email, clave) values
 ('00000000-0000-0000-0000-00000000000a', 'franklin@electromontana.app', 'prueba123'),
 ('00000000-0000-0000-0000-00000000000b', 'daniel@electromontana.app', 'prueba123'),
 ('00000000-0000-0000-0000-00000000000e', 'pedraza@electromontana.app', 'prueba123');
insert into public.usuarios (id, usuario, nombre, rol, sede, activo, debe_cambiar_clave) values
 ('00000000-0000-0000-0000-00000000000a', 'franklin', 'Franklin', 'dueno', null, true, false),
 ('00000000-0000-0000-0000-00000000000b', 'daniel', 'Daniel', 'dueno', null, true, true),
 ('00000000-0000-0000-0000-00000000000e', 'pedraza', 'José (Pedraza)', 'empleado', 'pedraza', true, false);
notify pgrst, 'reload schema';
