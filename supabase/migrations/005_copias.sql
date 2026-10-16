-- =====================================================================
-- Electro Montana — copia de seguridad que descarga un dueño (fuera de Supabase).
-- Solo agrega dos columnas y una función. La app arma el archivo con todo lo que el
-- dueño puede leer y luego anota aquí cuándo y quién la bajó (para recordar hacerla).
-- En el plan gratis Supabase no guarda respaldos: su propia guía recomienda exportar
-- los datos con frecuencia y guardarlos fuera.
-- =====================================================================
alter table public.config add column ultima_copia_en timestamptz;
alter table public.config add column ultima_copia_por uuid references public.usuarios(id);

-- p_resumen = cuántas filas de cada tabla tenía la copia (sin datos personales)
create function public.anotar_copia(p_resumen jsonb) returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.usuarios; v_ahora timestamptz := now();
begin
  u := interno.dueno();
  update public.config set ultima_copia_en = v_ahora, ultima_copia_por = u.id where id = 1;
  perform interno.auditar('config', '1', 'descargar_copia', null,
    case when jsonb_typeof(p_resumen) = 'object' then p_resumen else '{}'::jsonb end);
  return v_ahora;
end $$;

revoke execute on function public.anotar_copia(jsonb) from public, anon;
grant execute on function public.anotar_copia(jsonb) to authenticated;
