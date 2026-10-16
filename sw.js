// Electro Montana — modo sin conexión: guarda la app en el teléfono para que abra sin señal.
// Los datos NO pasan por aquí (van directo a la base y a la copia del teléfono).
// En cada entrega: subir VERSION (igual que los ?v= de index.html).
var VERSION = 'em-5';
var ARCHIVOS = [
  './', 'index.html', 'manifest.webmanifest?v=1', 'css/app.css?v=5',
  'js/vendor/supabase-2.49.4.js', 'js/config.js?v=5', 'js/cuentas.js?v=5', 'js/base.js?v=5', 'js/datos.js?v=5',
  'js/contrato.js?v=5', 'js/firma.js?v=5', 'js/cobrar.js?v=5', 'js/clientes.js?v=5', 'js/vender.js?v=5', 'js/abonos.js?v=5',
  'js/ventas.js?v=5', 'js/notas.js?v=5', 'js/mercancia.js?v=5', 'js/reportes.js?v=5', 'js/entregas.js?v=5', 'js/ajustes.js?v=5', 'js/app.js?v=5',
  'fonts/barlow-400.woff2', 'fonts/barlow-500.woff2', 'fonts/barlow-600.woff2', 'fonts/barlow-700.woff2',
  'fonts/barlow-sc-600.woff2', 'fonts/barlow-sc-700.woff2',
  'img/icono-180.png?v=1', 'img/favicon-32.png?v=1'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(ARCHIVOS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;           // la base y todo lo de afuera, directo
  if (/\/(rest|auth|storage|functions|realtime)\/v1\//.test(url.pathname)) return;   // datos: nunca se guardan aquí
  if (req.mode === 'navigate') {
    // La página: primero internet (máximo 4 segundos); si no, la guardada
    e.respondWith(new Promise(function (resolver) {
      var listo = false;
      var guardada = function () { return caches.match('index.html').then(function (r) { return r || caches.match('./'); }); };
      var t = setTimeout(function () { guardada().then(function (r) { if (r && !listo) { listo = true; resolver(r); } }); }, 4000);
      fetch(req).then(function (r) {
        clearTimeout(t);
        if (r.ok) { var copia = r.clone(); caches.open(VERSION).then(function (c) { c.put('index.html', copia); }); }
        if (!listo) { listo = true; resolver(r); }
      }).catch(function () {
        clearTimeout(t);
        guardada().then(function (r) { if (!listo) { listo = true; resolver(r || Response.error()); } });
      });
    }));
    return;
  }
  // Solo archivos de la app (con versión): primero lo guardado
  if (!/\.(js|css|woff2|png|svg|webmanifest)$/.test(url.pathname)) return;
  e.respondWith(caches.match(req).then(function (r) {
    return r || fetch(req).then(function (res) {
      if (res.ok) { var copia = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copia); }); }
      return res;
    });
  }));
});
