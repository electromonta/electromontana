-- Datos INVENTADOS para las capturas de la guía (solo copia local)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);
set role authenticated;
do $$
declare c1 bigint; c2 bigint; c3 bigint; c4 bigint; c5 bigint; c6 bigint; c7 bigint; v jsonb; hoy date := (now() at time zone 'America/Caracas')::date;
begin
  perform public.actualizar_tasa(40);
  perform public.actualizar_config('{"telefono_negocio":"0414-7000000"}');
  c1 := (public.guardar_cliente('{"nombre":"María González","cedula":"V-14.556.120","telefono":"0414-5550101","sector":"Barrio Bolívar","direccion":"Calle 5, casa 22","referencia":"Al lado de la panadería","trabajo":"Comerciante","sede":"socopo","fiador_nombre":"José González","fiador_cedula":"9.112.334","fiador_telefono":"0424-5550102"}')->>'id')::bigint;
  c2 := (public.guardar_cliente('{"nombre":"Pedro Ramírez","cedula":"V-18.223.901","telefono":"0416-5550202","sector":"La Esperanza","direccion":"Av. principal, casa 8","trabajo":"Mecánico","sede":"socopo"}')->>'id')::bigint;
  c3 := (public.guardar_cliente('{"nombre":"Carmen Rojas","cedula":"V-20.441.876","telefono":"+56 9 5550 3030","sector":"Centro","direccion":"Calle 2 con carrera 4","sede":"socopo","en_exterior":true,"pais":"Chile","contacto_nombre":"Ana Rojas (hermana)","contacto_telefono":"0414-5550303","fiador_nombre":"Ana Rojas","fiador_cedula":"22.101.654"}')->>'id')::bigint;
  c4 := (public.guardar_cliente('{"nombre":"Luis Mendoza","cedula":"V-16.778.432","telefono":"0426-5550404","sector":"Pedraza la Vieja","direccion":"Sector El Carmen, casa 3","trabajo":"Agricultor","sede":"pedraza"}')->>'id')::bigint;
  c5 := (public.guardar_cliente('{"nombre":"Rosa Pérez","cedula":"V-12.903.215","telefono":"0412-5550505","sector":"Ciudad Bolivia","direccion":"Calle 1, casa 40","sede":"pedraza"}')->>'id')::bigint;
  c6 := (public.guardar_cliente('{"nombre":"Jesús Contreras","cedula":"V-19.334.778","telefono":"0414-5550606","sector":"Barrio Nuevo","direccion":"Vereda 7, casa 12","trabajo":"Albañil","sede":"socopo"}')->>'id')::bigint;
  c7 := (public.guardar_cliente('{"nombre":"Yelitza Márquez","cedula":"V-21.556.009","telefono":"0424-5550707","sector":"Las Flores","sede":"socopo"}')->>'id')::bigint;

  perform public.registrar_venta(jsonb_build_object('cliente_id',c1,'origen','carga_inicial','fecha','2026-07-20','pagado_antes',250,'frecuencia','mensual',
    'items','[{"descripcion":"Juego de comedor 6 sillas","precio":600,"costo":380}]'::jsonb,
    'cuotas','[{"fecha":"2026-09-01","monto":117},{"fecha":"2026-10-01","monto":117},{"fecha":"2026-11-01","monto":116}]'::jsonb));
  perform public.registrar_venta(jsonb_build_object('cliente_id',c2,'origen','carga_inicial','fecha','2026-08-15','pagado_antes',300,'frecuencia','quincenal',
    'items','[{"descripcion":"Televisor 43 pulgadas","precio":450,"costo":290}]'::jsonb,
    'cuotas',jsonb_build_array(jsonb_build_object('fecha',hoy,'monto',75),jsonb_build_object('fecha',hoy+16,'monto',75))));
  perform public.registrar_venta(jsonb_build_object('cliente_id',c3,'items','[{"descripcion":"Lavadora 12 kg","precio":520,"costo":340}]'::jsonb,'inicial',156,
    'pago_inicial',jsonb_build_object('metodo_id',2,'monto',156,'referencia','ZL-88213'),'frecuencia','semanal',
    'cuotas',(select jsonb_agg(jsonb_build_object('fecha',hoy+7*g,'monto',45.5)) from generate_series(1,8) g)));
  perform public.registrar_venta(jsonb_build_object('cliente_id',c4,'origen','carga_inicial','fecha','2026-08-01','pagado_antes',400,'frecuencia','semanal',
    'items','[{"descripcion":"Nevera Mabe 14 pies","precio":700,"costo":470}]'::jsonb,
    'cuotas','[{"fecha":"2026-09-24","monto":75},{"fecha":"2026-10-01","monto":75},{"fecha":"2026-10-08","monto":75},{"fecha":"2026-10-22","monto":75}]'::jsonb));
  perform public.registrar_venta(jsonb_build_object('cliente_id',c5,'origen','carga_inicial','fecha','2026-09-20','pagado_antes',100,'frecuencia','mensual',
    'items','[{"descripcion":"Colchón matrimonial","precio":300,"costo":180}]'::jsonb,
    'cuotas',jsonb_build_array(jsonb_build_object('fecha',hoy+3,'monto',100),jsonb_build_object('fecha',hoy+34,'monto',100))));
  perform public.registrar_venta(jsonb_build_object('cliente_id',c6,'origen','carga_inicial','fecha','2026-06-10','pagado_antes',120,'frecuencia','mensual',
    'items','[{"descripcion":"Aire acondicionado 12.000 BTU","precio":480,"costo":320}]'::jsonb,
    'cuotas','[{"fecha":"2026-07-15","monto":90},{"fecha":"2026-08-15","monto":90},{"fecha":"2026-09-15","monto":90},{"fecha":"2026-10-15","monto":90}]'::jsonb));
  perform public.registrar_venta(jsonb_build_object('cliente_id',c7,'origen','carga_inicial','fecha','2026-09-01','pagado_antes',80,'frecuencia','semanal',
    'items','[{"descripcion":"Licuadora Oster","precio":80},{"descripcion":"Plancha","precio":40}]'::jsonb,
    'cuotas',jsonb_build_array(jsonb_build_object('fecha',hoy+5,'monto',20),jsonb_build_object('fecha',hoy+12,'monto',20))));

  perform public.registrar_abono(jsonb_build_object('cliente_id',c1,'metodo_id',1,'monto',40));
  perform public.registrar_abono(jsonb_build_object('cliente_id',c2,'metodo_id',4,'monto',1200,'tasa',40,'referencia','0102-334455'));
  perform public.entrada_mercancia('{"sede":"pedraza","nota":"Factura Yumana 2051","items":[{"nombre":"Licuadora Oster","cantidad":4,"costo":28,"precio_sugerido":50},{"nombre":"Ventilador de pie 18 pulgadas","cantidad":6,"costo":22,"precio_sugerido":40},{"nombre":"Cocina 4 hornillas","cantidad":2,"costo":180,"precio_sugerido":290},{"nombre":"Colchón matrimonial","cantidad":3,"costo":180,"precio_sugerido":300}]}');
  perform public.registrar_gestion(jsonb_build_object('cliente_id',c1,'tipo','no_estaba','nota','Casa cerrada, dejé recado con la vecina','hecho_en',now() - interval '2 days'));
  perform public.registrar_gestion(jsonb_build_object('cliente_id',c4,'tipo','promesa','promesa_fecha',hoy,'promesa_monto',75,'nota','Cobra la cosecha esta semana'));
  perform public.registrar_gestion(jsonb_build_object('cliente_id',c6,'tipo','llamada','nota','Dice que se quedó sin trabajo, pidió más tiempo'));
end $$;
reset role;
-- Daniel ya cambió su clave (para las capturas de las aprobaciones); sigue como si fuera por la app
update public.usuarios set debe_cambiar_clave = false where usuario = 'daniel';
