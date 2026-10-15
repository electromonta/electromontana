// Servidor LOCAL de pruebas: imita lo que la app usa de Supabase (auth, rest, fotos, función de usuarios)
// sobre un Postgres local + PostgREST. Nunca toca la base real. Lo arranca pruebas/preparar-local.sh.
//   node pruebas/servidor-local.js   → http://localhost:8080
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const PUERTO = Number(process.env.PUERTO || 8080);
const PGRST = process.env.PGRST || 'http://127.0.0.1:3001';
const SECRETO = 'solo-para-pruebas-locales-no-es-una-clave-real';   // igual que en postgrest.conf
const PG = ['-h', '127.0.0.1', '-p', process.env.PGPORT || '54329', '-U', 'postgres', '-d', process.env.PGDB || 'em_local', '-At', '-q', '-v', 'ON_ERROR_STOP=1'];
const archivos = new Map();   // fotos subidas (en memoria)

function b64(x) { return Buffer.from(x).toString('base64url'); }
function firmar(datos) {
  const cab = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), cuerpo = b64(JSON.stringify(datos));
  return cab + '.' + cuerpo + '.' + crypto.createHmac('sha256', SECRETO).update(cab + '.' + cuerpo).digest('base64url');
}
function leerJwt(t) {
  try {
    const [c, b, f] = String(t || '').split('.');
    if (crypto.createHmac('sha256', SECRETO).update(c + '.' + b).digest('base64url') !== f) return null;
    return JSON.parse(Buffer.from(b, 'base64url').toString());
  } catch (e) { return null; }
}
function sql(consulta, vars) {
  const args = PG.slice();
  Object.entries(vars || {}).forEach(([k, v]) => { args.push('-v', k + '=' + v); });
  return execFileSync('psql', args, { input: consulta, encoding: 'utf8' }).trim();
}
function token(u) {
  const ahora = Math.floor(Date.now() / 1000);
  return {
    access_token: firmar({ sub: u.id, role: 'authenticated', aud: 'authenticated', email: u.email, exp: ahora + 3600, iat: ahora }),
    token_type: 'bearer', expires_in: 3600, expires_at: ahora + 3600, refresh_token: 'r.' + u.id,
    user: { id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
  };
}
function json(res, st, obj) { res.writeHead(st, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(obj)); }
function cuerpo(req) { return new Promise(r => { const p = []; req.on('data', d => p.push(d)); req.on('end', () => r(Buffer.concat(p))); }); }
function quien(req) { return leerJwt((req.headers.authorization || '').replace(/^Bearer\s+/i, '')); }

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' });
    return res.end();
  }
  try {
    /* ---------- Auth ---------- */
    if (url.pathname === '/auth/v1/token') {
      const b = JSON.parse((await cuerpo(req)).toString() || '{}');
      let id;
      if (url.searchParams.get('grant_type') === 'password') {
        id = sql("select id from auth.users where email = :'e' and clave = :'c';", { e: b.email, c: b.password });
        if (!id) return json(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
      } else {
        id = String(b.refresh_token || '').slice(2);
      }
      const email = sql("select email from auth.users where id = :'i';", { i: id });
      return json(res, 200, token({ id, email }));
    }
    if (url.pathname === '/auth/v1/user') {
      const q = quien(req);
      if (!q) return json(res, 401, { message: 'invalid JWT' });
      if (req.method === 'PUT') {
        const b = JSON.parse((await cuerpo(req)).toString() || '{}');
        if (b.password) sql("update auth.users set clave = :'c' where id = :'i';", { c: b.password, i: q.sub });
      }
      return json(res, 200, { id: q.sub, email: q.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} });
    }
    if (url.pathname === '/auth/v1/logout') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*' }); return res.end(); }

    /* ---------- Rest → PostgREST ---------- */
    if (url.pathname.startsWith('/rest/v1/')) {
      const destino = PGRST + url.pathname.slice(8) + url.search;
      const cab = {};
      ['content-type', 'accept', 'prefer', 'range', 'range-unit', 'content-profile', 'accept-profile'].forEach(h => { if (req.headers[h]) cab[h] = req.headers[h]; });
      const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      cab.authorization = 'Bearer ' + (leerJwt(t) ? t : firmar({ role: 'anon' }));
      const datos = req.method === 'GET' || req.method === 'HEAD' ? undefined : await cuerpo(req);
      const r = await fetch(destino, { method: req.method, headers: cab, body: datos });
      const salida = {};
      r.headers.forEach((v, k) => { if (!['content-encoding', 'transfer-encoding', 'connection'].includes(k)) salida[k] = v; });
      salida['access-control-allow-origin'] = '*';
      salida['access-control-expose-headers'] = 'content-range';
      res.writeHead(r.status, salida);
      return res.end(Buffer.from(await r.arrayBuffer()));
    }

    /* ---------- Fotos (bucket privado) ---------- */
    // supabase-js manda los Blob como multipart (campo "cacheControl" y el archivo): se saca solo el archivo
    function archivoDeSubida(rq, b) {
      const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(rq.headers['content-type'] || '');
      if (!m) return b;
      const sep = Buffer.from('--' + (m[1] || m[2]));
      let i = b.indexOf(sep);
      while (i >= 0) {
        const j = b.indexOf(sep, i + sep.length);
        if (j < 0) break;
        const parte = b.subarray(i + sep.length, j);
        const fin = parte.indexOf('\r\n\r\n');
        const cab = parte.subarray(0, fin).toString();
        if (/content-type:\s*image\//i.test(cab) || /filename=/i.test(cab)) return parte.subarray(fin + 4, parte.length - 2);
        i = j;
      }
      return b;
    }
    const mFirma = url.pathname.match(/^\/storage\/v1\/object\/sign\/fotos\/(.+)$/);
    if (mFirma) {
      const ruta = decodeURIComponent(mFirma[1]);
      if (req.method === 'POST') {
        const q = quien(req);
        if (!q) return json(res, 400, { statusCode: '403', message: 'sin sesión' });
        const ve = sql("set role authenticated; select set_config('request.jwt.claims', :'c', false); select count(*) from storage.objects where bucket_id = 'fotos' and name = :'n';",
          { c: JSON.stringify({ sub: q.sub, role: 'authenticated' }), n: ruta }).split('\n').pop();
        if (ve !== '1') return json(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
        return json(res, 200, { signedURL: '/object/sign/fotos/' + encodeURI(ruta) + '?token=local' });
      }
      const f = archivos.get(ruta);
      if (!f) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Access-Control-Allow-Origin': '*' });
      return res.end(f);
    }
    const mSubir = url.pathname.match(/^\/storage\/v1\/object\/fotos\/(.+)$/);
    if (mSubir && req.method === 'POST') {
      const ruta = decodeURIComponent(mSubir[1]);
      const q = quien(req);
      if (!q) return json(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'sin sesión' });
      if (archivos.has(ruta)) return json(res, 400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
      try {
        sql("set role authenticated; select set_config('request.jwt.claims', :'c', false); insert into storage.objects (bucket_id, name) values ('fotos', :'n');",
          { c: JSON.stringify({ sub: q.sub, role: 'authenticated' }), n: ruta });
      } catch (e) {
        return json(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
      }
      archivos.set(ruta, archivoDeSubida(req, await cuerpo(req)));
      return json(res, 200, { Key: 'fotos/' + ruta, Id: crypto.randomUUID() });
    }

    /* ---------- Función de usuarios ---------- */
    if (url.pathname === '/functions/v1/usuarios') {
      const q = quien(req);
      const b = JSON.parse((await cuerpo(req)).toString() || '{}');
      const rol = q && sql("select rol || '/' || activo from public.usuarios where id = :'i';", { i: q.sub });
      if (rol !== 'dueno/true') return json(res, 403, { error: 'Solo los dueños pueden manejar usuarios.' });
      if (b.accion === 'crear') {
        const existe = sql("select count(*) from auth.users where email = :'e';", { e: b.usuario + '@electromontana.app' });
        if (existe !== '0') return json(res, 400, { error: 'Ya existe ese usuario.' });
        const id = crypto.randomUUID();
        sql("insert into auth.users (id, email, clave) values (:'i', :'e', :'c'); insert into public.usuarios (id, usuario, nombre, rol, sede, activo, debe_cambiar_clave) values (:'i', :'u', :'n', :'r', nullif(:'s', ''), true, true);",
          { i: id, e: b.usuario + '@electromontana.app', c: b.clave, u: b.usuario, n: b.nombre, r: b.rol, s: b.sede || '' });
        return json(res, 200, { ok: true, id });
      }
      if (b.accion === 'clave') {
        sql("update auth.users set clave = :'c' where id = :'i'; update public.usuarios set debe_cambiar_clave = true where id = :'i';", { c: b.clave, i: b.id });
        return json(res, 200, { ok: true });
      }
      return json(res, 400, { error: 'Acción no válida' });
    }

    /* ---------- La app (archivos del repo) ---------- */
    if (url.pathname === '/js/config.js') {
      res.writeHead(200, { 'Content-Type': TIPOS['.js'] });
      return res.end("window.EM_CONFIG = { url: 'http://localhost:" + PUERTO + "', key: 'local', dominio: 'electromontana.app' };");
    }
    let archivo = path.join(RAIZ, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!archivo.startsWith(RAIZ) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); return res.end('no existe'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream' });
    fs.createReadStream(archivo).pipe(res);
  } catch (e) {
    console.error(e);
    json(res, 500, { message: String(e.message || e) });
  }
}).listen(PUERTO, () => console.log('Servidor local en http://localhost:' + PUERTO));
