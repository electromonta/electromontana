#!/usr/bin/env bash
# Monta una copia LOCAL para probar la app sin tocar la base real:
# Postgres (base em_local con las migraciones) + PostgREST + servidor falso de auth y fotos.
# Uso: pruebas/preparar-local.sh   → la app queda en http://localhost:8080 (usuarios: franklin, daniel, pedraza; clave prueba123)
set -euo pipefail
cd "$(dirname "$0")/.."
PGPORT="${PGPORT:-54329}"
export PGHOST=127.0.0.1 PGPORT PGUSER=postgres
DIR="${EM_LOCAL:-/tmp/em-local}"
mkdir -p "$DIR"
BIN="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"
como_pg() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
if ! "$BIN/pg_isready" -q; then
  DATA="$(mktemp -d /tmp/em-pg-XXXX)"; chown postgres "$DATA" 2>/dev/null || true
  como_pg "$BIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
  como_pg "$BIN/pg_ctl" -D "$DATA" -o "-p $PGPORT -k /tmp" -l "$DATA/log" -w start >/dev/null
fi
psql -q -d postgres -c "drop database if exists em_local with (force)" -c "create database em_local" >/dev/null
P="psql -q -v ON_ERROR_STOP=1 -d em_local"
$P -f supabase/pruebas/stubs.sql >/dev/null
for m in supabase/migrations/*.sql; do grep -q "cron.schedule" "$m" || $P -f "$m" >/dev/null; done
$P -f pruebas/semilla-local.sql >/dev/null
if [ ! -x "$DIR/postgrest" ]; then
  curl -sSL -o "$DIR/pgrst.tar.xz" https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz
  tar -xf "$DIR/pgrst.tar.xz" -C "$DIR"
fi
cat > "$DIR/postgrest.conf" <<CONF
db-uri = "postgres://authenticator@127.0.0.1:$PGPORT/em_local"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "solo-para-pruebas-locales-no-es-una-clave-real"
server-port = 3001
db-pool = 5
CONF
for f in "$DIR/postgrest.pid" "$DIR/servidor.pid"; do [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null || true; done
sleep 0.5
nohup "$DIR/postgrest" "$DIR/postgrest.conf" > "$DIR/postgrest.log" 2>&1 & echo $! > "$DIR/postgrest.pid"
nohup node pruebas/servidor-local.js > "$DIR/servidor.log" 2>&1 & echo $! > "$DIR/servidor.pid"
for i in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:3001/ && curl -s -o /dev/null http://localhost:8080/ && break; sleep 0.25; done
echo "Copia local lista: http://localhost:8080  (franklin / daniel / pedraza, clave prueba123)"
