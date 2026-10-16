# Cómo se protegen los datos de Electro Montana

Resumen para Kinan y para cualquier sesión futura que tenga que recuperar algo.

## Lo que protege los datos hoy

| Protección | Qué cubre | Dónde queda | Quién la hace |
|---|---|---|---|
| **Nada se borra** | Ventas, abonos, clientes y notas se **anulan** (con quién y por qué), nunca se borran. Todo cambio de dinero queda en `auditoria`. | En la base | La app, siempre |
| **Cola del teléfono** | Lo que se registra sin señal se guarda en el teléfono y se envía solo, sin repetirse. Salir del usuario **no** lo borra. | En el teléfono | La app, siempre |
| **Copia de cada noche** | Una copia de todas las tablas (y la lista de fotos y usuarios) cada día a las 2:30 a. m. de Venezuela. Sirve para deshacer un error de un día. | Dentro de la misma base: `respaldo_diario.copias` | Automática (`pg_cron`, migración `002`) |
| **Copia descargada** | Archivo `.json` con **todas las tablas** que ve un dueño. Queda **fuera de Supabase** (teléfono, computadora, Drive, WhatsApp). La app avisa si pasa una semana sin bajarla. | Donde la guarde el dueño | Un dueño, desde Ajustes → Copia de seguridad (migración `005`) |
| **Plan Pro de Supabase** (pendiente) | Copia diaria de toda la base hecha por Supabase, guardada 7 días; la base nunca se pausa. | En Supabase | Los dueños, al pagar el plan |

**Lo que ninguna copia de la base incluye:** los archivos de fotos (cédulas, contratos, firmas, comprobantes). La base guarda su ruta; los archivos viven en el bucket `fotos`. Supabase no los borra, y la app no tiene forma de borrarlos.

## Límites del plan gratis (documentación de Supabase, 2026-10)

- Base de datos: 500 MB (al pasarlos, la base queda **solo de lectura**). Fotos: 1 GB.
- **Sin respaldos automáticos.** Supabase recomienda exportar los datos con frecuencia y guardarlos fuera.
- Se **pausa** si pasa una semana casi sin uso (se reactiva desde el panel hasta 90 días después).
- Plan Pro: 8 GB de base, 100 GB de fotos, copia diaria (7 días) y nunca se pausa.

**Pendiente de decisión de Kinan:** la copia de cada noche guarda todo cada día y nunca borra nada. Con datos reales llenaría los 500 MB del plan gratis en uno o dos meses. Propuesta: guardar cada día del último mes y, de ahí para atrás, solo una por mes. Para eso hay que borrar copias viejas, así que **no se hace sin el "dale" de Kinan**.

## Cómo recuperar

### Un error de un día (copia de cada noche)

```sql
-- Qué copias hay
select fecha, tabla, filas from respaldo_diario.copias order by fecha desc, tabla;
-- Ver una tabla tal como estaba ese día (sin tocar nada)
select * from jsonb_populate_recordset(null::public.abonos,
  (select datos from respaldo_diario.copias where fecha = '2026-10-20' and tabla = 'abonos'));
```

Para corregir: comparar con la tabla actual y arreglar **por las funciones de la app** (anular, reprogramar…) o con una migración que deje rastro en `auditoria`. Antes, respaldo en `respaldo_AAAAMMDD` y "dale" de Kinan (regla 12 de `CLAUDE.md`).

### Se perdió la base entera (copia descargada)

El archivo `electromontana-copia-AAAA-MM-DD.json` tiene esta forma:

```json
{ "sistema": "Electro Montana", "tipo": "copia completa", "version_app": "6", "hecha_en": "…", "hecha_por": "franklin",
  "conteo": { "clientes": 120, "ventas": 300 },
  "datos": { "config": [], "usuarios": [], "clientes": [], "ventas": [], "abonos": [] } }
```

Pasos para recuperar en un proyecto nuevo:

1. Aplicar las migraciones `001` a `005` en el proyecto nuevo.
2. Crear de nuevo las cuentas de entrada con los mismos `id` de `datos.usuarios` (Edge Function `usuarios`, o SQL en `auth.users` + `auth.identities`).
3. Cargar las tablas en orden de dependencias con `jsonb_populate_recordset`: `usuarios`, `config`, `metodos_pago`, `tasas`, `clientes`, `productos`, `producto_costos`, `ventas`, `venta_items`, `venta_item_costos`, `cuotas`, `entregas`, `abonos`, `eventos_venta`, `existencias`, `movimientos_inventario`, `gestiones` y `auditoria`.
   - Las columnas `generated always as identity` necesitan `overriding system value`.
   - `ventas.saldo` es una columna calculada y no se carga.
4. Ajustar `contadores` al número más alto de venta y de entrega, y los valores de las secuencias.
5. Revisar con `cuadre()` (de `supabase/pruebas/escenarios.sql`) que todo cuadre.
