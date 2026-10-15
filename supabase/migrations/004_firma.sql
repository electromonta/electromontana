-- =====================================================================
-- Electro Montana — etapa 3: contrato firmado en la pantalla del teléfono o la tablet.
-- Solo agrega columnas y una función.
--
-- Las firmas son imágenes (jpg) en el bucket privado "fotos": cli/<cliente>/firma-....jpg.
-- Al firmar se guarda una copia fija del contrato (datos del cliente y del fiador, lo que se
-- llevó, las cuotas y las condiciones tal como se leyeron): si después cambian los datos del
-- cliente o las condiciones, el contrato firmado sigue diciendo lo mismo.
-- =====================================================================
alter table public.ventas add column firma_cliente text;
alter table public.ventas add column firma_fiador text;
alter table public.ventas add column firmado_en timestamptz;
alter table public.ventas add column firmado_por uuid references public.usuarios(id);
alter table public.ventas add column contrato_firmado jsonb;

-- Revisa una ruta de firma: del cliente de la venta y ya subida al bucket
create function interno.ruta_firma(p_ruta text, p_cliente bigint) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_ruta is null then return null; end if;
  if p_ruta !~ '^cli/[0-9]{1,15}/firma-[a-z0-9_-]{1,80}\.jpg$' then raise exception 'Firma no válida.'; end if;
  if split_part(p_ruta, '/', 2) <> p_cliente::text then raise exception 'La firma no es de este cliente.'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'fotos' and name = p_ruta) then
    raise exception 'La firma todavía no se ha subido.';
  end if;
  return p_ruta;
end $$;

-- p = {venta_id | venta_clave, firma_cliente (ruta), firma_fiador (ruta, opcional), condiciones: [texto...], hecho_en, reemplazar}
-- Firma quien registra (dueño o empleado de la sede del cliente). Una venta firmada no se vuelve a
-- firmar, salvo que un dueño la reemplace (queda en auditoría lo de antes).
create function public.firmar_venta(p jsonb, p_clave uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  u public.usuarios; v_prev jsonb; v_id bigint; v public.ventas; c public.clientes;
  v_rc text; v_rf text; v_cond jsonb; v_copia jsonb; v_res jsonb; x jsonb;
begin
  u := interno.yo();
  v_prev := interno.idem_inicio(p_clave, 'firma');
  if v_prev is not null then return v_prev; end if;
  v_id := coalesce(nullif(p->>'venta_id', '')::bigint, interno.id_por_clave(nullif(p->>'venta_clave', '')::uuid, 'venta'));
  if v_id is null then raise exception 'No se encontró la venta de esta firma.'; end if;
  v := interno.venta_para(v_id, u);
  if v.estado = 'anulada' then raise exception 'Esta venta está anulada.'; end if;
  if v.firmado_en is not null then
    if u.rol <> 'dueno' or not coalesce(nullif(p->>'reemplazar', '')::boolean, false) then
      raise exception 'Este contrato ya está firmado.';
    end if;
  end if;
  c := interno.cliente_para(v.cliente_id, u);
  v_rc := interno.ruta_firma(nullif(p->>'firma_cliente', ''), v.cliente_id);
  if v_rc is null then raise exception 'Falta la firma del cliente.'; end if;
  v_rf := interno.ruta_firma(nullif(p->>'firma_fiador', ''), v.cliente_id);
  if v_rf = v_rc then raise exception 'Las dos firmas son la misma imagen.'; end if;

  v_cond := p->'condiciones';
  if jsonb_typeof(v_cond) is distinct from 'array' or jsonb_array_length(v_cond) = 0 or jsonb_array_length(v_cond) > 40 then
    raise exception 'Faltan las condiciones del contrato.';
  end if;
  for x in select value from jsonb_array_elements(v_cond) loop
    if jsonb_typeof(x) <> 'string' or length(x #>> '{}') = 0 or length(x #>> '{}') > 2000 then
      raise exception 'Condición del contrato no válida.';
    end if;
  end loop;

  -- Copia fija de lo que se firmó (los datos salen de la base, no del teléfono)
  v_copia := jsonb_build_object(
    'numero', v.numero, 'fecha', v.fecha, 'origen', v.origen, 'contrato_papel', v.contrato_papel,
    'total', v.total, 'inicial', v.inicial, 'plan_base', v.plan_base, 'frecuencia', v.frecuencia,
    'cliente', jsonb_build_object('nombre', c.nombre, 'cedula', c.cedula, 'telefono', c.telefono, 'trabajo', c.trabajo,
      'direccion', c.direccion, 'referencia', c.referencia, 'sede', c.sede,
      'fiador_nombre', c.fiador_nombre, 'fiador_cedula', c.fiador_cedula, 'fiador_telefono', c.fiador_telefono,
      'fiador_direccion', c.fiador_direccion),
    'items', coalesce((select jsonb_agg(jsonb_build_object('cantidad', i.cantidad, 'descripcion', i.descripcion, 'precio', i.precio) order by i.orden, i.id)
                         from public.venta_items i where i.venta_id = v.id), '[]'::jsonb),
    'cuotas', coalesce((select jsonb_agg(jsonb_build_object('fecha', q.fecha, 'monto', q.monto) order by q.fecha, q.n)
                          from public.cuotas q where q.venta_id = v.id and q.vigente and q.tipo <> 'inicial'), '[]'::jsonb),
    'condiciones', v_cond);

  if v.firmado_en is not null then
    perform interno.auditar('ventas', v.id::text, 'reemplazar_firma',
      jsonb_build_object('firma_cliente', v.firma_cliente, 'firma_fiador', v.firma_fiador, 'firmado_en', v.firmado_en,
                         'firmado_por', v.firmado_por, 'contrato_firmado', v.contrato_firmado), null);
  end if;
  update public.ventas set firma_cliente = v_rc, firma_fiador = v_rf, firmado_en = interno.hecho_en(p),
                           firmado_por = u.id, contrato_firmado = v_copia
   where id = v.id;
  perform interno.auditar('ventas', v.id::text, 'firmar', null,
                          jsonb_build_object('firma_cliente', v_rc, 'firma_fiador', v_rf));
  v_res := jsonb_build_object('venta_id', v.id, 'cliente_id', v.cliente_id, 'numero', v.numero);
  perform interno.idem_fin(p_clave, v_res);
  return v_res;
end $$;

revoke execute on function interno.ruta_firma(text, bigint) from public, anon, authenticated;
revoke execute on function public.firmar_venta(jsonb, uuid) from public, anon;
grant execute on function public.firmar_venta(jsonb, uuid) to authenticated;
