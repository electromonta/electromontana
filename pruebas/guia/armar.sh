#!/usr/bin/env bash
# Rehace la guía de uso (guia.html + capturas en guia/) con datos INVENTADOS en la copia local.
# Uso: pruebas/guia/armar.sh   (después de cambiar pantallas o textos de pruebas/guia/cuerpo.html)
set -euo pipefail
cd "$(dirname "$0")/../.."
./pruebas/preparar-local.sh
psql -h 127.0.0.1 -p 54329 -U postgres -d em_local -v ON_ERROR_STOP=1 -q -f pruebas/guia/demo.sql >/dev/null
mkdir -p guia && rm -f guia/*.jpg
NODE_PATH=/opt/node22/lib/node_modules node pruebas/guia/capturas.js "$PWD/guia"
python3 - <<'PY'
cuerpo = open('pruebas/guia/cuerpo.html').read()
f = [('Barlow','400','barlow-400'),('Barlow','500','barlow-500'),('Barlow','600','barlow-600'),('Barlow','700','barlow-700'),
     ('Barlow Semi Condensed','600','barlow-sc-600'),('Barlow Semi Condensed','700','barlow-sc-700')]
fuentes = '<style>' + ''.join("@font-face{font-family:'%s';font-weight:%s;font-display:swap;src:url('fonts/%s.woff2') format('woff2')}" % x for x in f) + '</style>'
open('guia.html', 'w').write('<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n'
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
  '<title>Guía de Electro Montana</title>\n<meta name="theme-color" content="#172b4d">\n'
  '<link rel="icon" type="image/png" href="img/favicon-32.png?v=1">\n<link rel="apple-touch-icon" href="img/icono-180.png?v=1">\n'
  + fuentes + '\n</head>\n<body>\n' + cuerpo + '\n</body>\n</html>\n')
PY
echo "Guía lista: guia.html y $(ls guia | wc -l) capturas en guia/"
