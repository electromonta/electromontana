-- =====================================================================
-- Electro Montana — gastos por socio (migración 010). Pedido de Kinan, 2026-10-23:
-- cada socio anota SUS gastos con su usuario (ya no se elige "quién lo pagó": es quien lo anota),
-- y en la app se ven por separado (Franklin, Daniel o los dos). Cada uno ve los del otro.
-- Solo cambia registrar_gasto (misma firma, mismos permisos). No toca datos (no había gastos).
-- =====================================================================
create or replace function public.registrar_gasto(p jsonb, p_clave uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; v_prev jsonb; r interno.pago; g public.gastos; v_res jsonb;
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
  -- Cada socio anota sus propios gastos: quedan a nombre de quien los anota
  if nullif(p->>'pagado_por', '') is not null and (p->>'pagado_por')::uuid is distinct from u.id then
    raise exception 'Cada socio anota sus propios gastos (entra con tu usuario).';
  end if;
  g.pagado_por := u.id;
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
revoke execute on function public.registrar_gasto(jsonb, uuid) from public, anon;
grant execute on function public.registrar_gasto(jsonb, uuid) to authenticated;
