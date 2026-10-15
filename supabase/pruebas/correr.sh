#!/usr/bin/env bash
# Corre las pruebas de la base en un Postgres local (nunca en la base real).
# Uso: supabase/pruebas/correr.sh            → base nueva, stubs, migraciones y escenarios
#      PGPORT=54329 supabase/pruebas/correr.sh
# Si no hay un Postgres corriendo en $PGPORT, crea uno temporal (como el usuario postgres).
set -euo pipefail
cd "$(dirname "$0")/../.."
PGPORT="${PGPORT:-54329}"
export PGHOST=127.0.0.1 PGPORT PGUSER=postgres
BIN="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"
como_pg() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
if ! "$BIN/pg_isready" -q; then
  DATA="$(mktemp -d /tmp/em-pg-XXXX)"; chown postgres "$DATA" 2>/dev/null || true
  como_pg "$BIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
  como_pg "$BIN/pg_ctl" -D "$DATA" -o "-p $PGPORT -k /tmp" -l "$DATA/log" -w start >/dev/null
  echo "Postgres de prueba en $DATA (puerto $PGPORT)"
fi
psql -q -d postgres -c "drop database if exists em_pruebas" -c "create database em_pruebas" >/dev/null
P="psql -q -v ON_ERROR_STOP=1 -d em_pruebas"
$P -f supabase/pruebas/stubs.sql >/dev/null
for m in supabase/migrations/*.sql; do
  if grep -q "cron.schedule" "$m"; then echo "(se salta $m: usa pg_cron)"; continue; fi
  $P -f "$m" >/dev/null
done
SALIDA="$(psql -d em_pruebas -f supabase/pruebas/escenarios.sql 2>&1 || true)"
echo "$SALIDA" | sed -n 's/^psql:[^ ]* NOTICE:  //p; s/^NOTICE:  //p'
OK=$(echo "$SALIDA" | grep -c "NOTICE:  ok" || true)
MAL=$(echo "$SALIDA" | grep -c "!!!" || true)
ERR=$(echo "$SALIDA" | grep -v "NOTICE:" | grep -c "ERROR:" || true)
echo "----"
echo "ok: $OK   fallas: $MAL   errores sueltos: $ERR"
[ "$MAL" = 0 ] && [ "$ERR" = 0 ]
