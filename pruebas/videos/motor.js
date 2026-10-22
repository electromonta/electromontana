// Motor de los videos de la guía: maneja la app de verdad (copia LOCAL con datos inventados) dentro de un
// teléfono dibujado en un escenario de 1080x1920, graba la pantalla y arma el MP4 con ffmpeg.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const URL_BASE = 'http://localhost:8080/';
const ESCENARIO = fs.readFileSync(path.join(__dirname, 'escenario.html'), 'utf8');
const espera = ms => new Promise(r => setTimeout(r, ms));

class Video {
  constructor(browser) { this.b = browser; }

  // Abre el escenario y entra a la app (esto no se graba)
  async preparar(usuario, titulo) {
    this.ctx = await this.b.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1, locale: 'es-VE', timezoneId: 'America/Caracas',
      geolocation: { latitude: 8.2312, longitude: -70.8201 }, permissions: ['geolocation'] });
    await this.ctx.addInitScript(() => {
      window.__abiertos = [];
      window.open = function (u) { window.__abiertos.push(String(u)); return null; };
    });
    this.p = await this.ctx.newPage();
    this.p.on('pageerror', e => console.log('  error en la página:', e.message));
    await this.p.route('**/__escenario.html', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: ESCENARIO }));
    await this.p.goto(URL_BASE + '__escenario.html');
    const h = await this.p.waitForSelector('#app');
    this.f = await h.contentFrame();
    await this.f.waitForSelector('#loginUsuario');
    await this.f.fill('#loginUsuario', usuario);
    await this.f.fill('#loginClave', 'prueba123');
    await this.f.$eval('#btnEntrar', el => el.click());
    await this.f.waitForSelector('#app:not([hidden])');
    await this.f.addStyleTag({ content: 'html{scroll-behavior:smooth}' });
    await espera(1500);
    await this.p.evaluate(t => esc.capitulo(t), titulo);
  }

  // Empieza a grabar (cuadros de la pantalla con su hora)
  async grabar() {
    this.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em-video-'));
    this.cuadros = [];
    this.cdp = await this.ctx.newCDPSession(this.p);
    this.cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
      const archivo = path.join(this.dir, String(this.cuadros.length).padStart(6, '0') + '.jpg');
      fs.writeFileSync(archivo, Buffer.from(data, 'base64'));
      this.cuadros.push({ archivo, t: metadata.timestamp });
      try { await this.cdp.send('Page.screencastFrameAck', { sessionId }); } catch (e) { /* ya terminó */ }
    });
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });
  }

  // Termina y arma el MP4
  async terminar(salida) {
    await espera(600);
    await this.cdp.send('Page.stopScreencast');
    await espera(300);
    const c = this.cuadros;
    let lista = '';
    for (let i = 0; i < c.length; i++) {
      const dur = i < c.length - 1 ? Math.max(0.001, c[i + 1].t - c[i].t) : 1.2;
      lista += "file '" + c[i].archivo + "'\nduration " + dur.toFixed(4) + '\n';
    }
    lista += "file '" + c[c.length - 1].archivo + "'\n";
    fs.writeFileSync(path.join(this.dir, 'lista.txt'), lista);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(this.dir, 'lista.txt'),
      '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-profile:v', 'high',
      '-movflags', '+faststart', salida]);
    fs.rmSync(this.dir, { recursive: true, force: true });
    await this.ctx.close();
    const dur = c.length ? (c[c.length - 1].t - c[0].t + 1.2) : 0;
    return { cuadros: c.length, segundos: Math.round(dur) };
  }

  /* ---------------- Escenario ---------------- */
  async portada(num, titulo, sub, ms) {
    await this.p.evaluate(a => esc.portada(a[0], a[1], a[2]), [num, titulo, sub]);
    await espera(ms || 3800);
    await this.p.evaluate(() => esc.quitarPortada());
    await espera(800);
  }
  async cierre(titulo, sub, ms) {
    await this.decir('');
    await this.p.evaluate(a => esc.portada('LISTO', a[0], a[1]), [titulo, sub]);
    await espera(ms || 3500);
  }
  // Subtítulo; ms = cuánto se deja para leer
  async decir(html, ms) {
    await this.p.evaluate(t => esc.texto(t), html);
    if (ms) await espera(ms);
  }
  // cambios: [[de, a], …] para mostrar, por ejemplo, la dirección real de la app en vez de la local
  async whatsapp(ms, cambios) {
    let txt = await this.f.evaluate(() => {
      const u = window.__abiertos[window.__abiertos.length - 1] || '';
      const m = /[?&]text=([^&]*)/.exec(u);
      return m ? decodeURIComponent(m[1]) : '';
    });
    (cambios || []).forEach(c => { txt = txt.split(c[0]).join(c[1]); });
    await this.p.evaluate(t => esc.whatsapp(t), txt);
    await espera(ms || 5000);
    await this.p.evaluate(() => esc.whatsapp(null));
    await espera(600);
  }

  /* ---------------- La app ---------------- */
  // Lleva el elemento a la vista (sin mover el escenario) y devuelve su rectángulo en pixeles de la app
  async ver(sel, margen) {
    const h = await this.f.locator(sel).first().elementHandle({ timeout: 15000 });
    const r = await h.evaluate((el, m) => {
      function cont(e) {
        let p = e.parentElement;
        while (p && p !== document.body) {
          const s = getComputedStyle(p);
          if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 2) return p;
          p = p.parentElement;
        }
        return null;
      }
      const c = cont(el), r = el.getBoundingClientRect();
      const arriba = c ? c.getBoundingClientRect().top : 60, abajo = c ? c.getBoundingClientRect().bottom : innerHeight - 84;
      if (r.top < arriba + m || r.bottom > abajo - m) {
        const delta = (r.top + r.height / 2) - (arriba + abajo) / 2;
        if (c) c.scrollBy({ top: delta, behavior: 'smooth' }); else window.scrollBy({ top: delta, behavior: 'smooth' });
        return true;
      }
      return false;
    }, margen == null ? 20 : margen);
    if (r) await espera(700);
    return h.evaluate(el => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
  }
  async rect(sel) {
    return this.f.locator(sel).first().evaluate(el => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
  }
  // Toca un botón: el dedo va hasta él, aprieta, sale la onda y se hace el clic
  async tocar(sel, o) {
    o = o || {};
    const r = await this.ver(sel);
    const x = r.x + r.w / 2, y = r.y + r.h / 2;
    await this.p.evaluate(a => esc.dedo(a[0], a[1]), [x, y]);
    await espera(650);
    await this.p.evaluate(() => esc.apretar(true));
    await this.p.evaluate(a => esc.onda(a[0], a[1]), [x, y]);
    await espera(160);
    await this.f.locator(sel).first().evaluate(el => el.click());
    await this.p.evaluate(() => esc.apretar(false));
    await espera(o.despues == null ? 700 : o.despues);
    if (!o.dejarDedo) await this.p.evaluate(() => esc.sinDedo());
  }
  // Escribe letra por letra
  async escribir(sel, texto, o) {
    o = o || {};
    const r = await this.ver(sel);
    await this.p.evaluate(a => esc.dedo(a[0], a[1]), [r.x + Math.min(60, r.w / 2), r.y + r.h / 2]);
    await espera(550);
    await this.p.evaluate(a => esc.onda(a[0], a[1]), [r.x + Math.min(60, r.w / 2), r.y + r.h / 2]);
    await this.p.evaluate(() => esc.sinDedo());
    const loc = this.f.locator(sel).first();
    await loc.evaluate(el => { el.focus(); el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await this.p.keyboard.type(String(texto), { delay: o.lento ? 110 : 70 });
    await loc.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));
    await espera(o.despues == null ? 500 : o.despues);
  }
  // Campos de fecha: se ponen de una vez
  async fecha(sel, valor) {
    const r = await this.ver(sel);
    await this.p.evaluate(a => esc.dedo(a[0], a[1]), [r.x + r.w / 2, r.y + r.h / 2]);
    await espera(550);
    await this.p.evaluate(a => esc.onda(a[0], a[1]), [r.x + r.w / 2, r.y + r.h / 2]);
    await this.f.locator(sel).first().evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, valor);
    await espera(500);
    await this.p.evaluate(() => esc.sinDedo());
  }
  // Toca un botón que abre la cámara y le pasa una foto
  async foto(sel, archivo) {
    const [fc] = await Promise.all([this.p.waitForEvent('filechooser', { timeout: 15000 }), this.tocar(sel)]);
    await fc.setFiles(archivo);
    await espera(900);
  }
  // Baja dentro de la última ventana abierta
  async bajarHoja(px, ms) {
    await this.f.evaluate(d => { const c = document.querySelectorAll('.hoja-cuerpo'); if (c.length) c[c.length - 1].scrollBy({ top: d, behavior: 'smooth' }); }, px);
    await espera(ms || 1000);
  }
  async soltar() { await this.f.evaluate(() => document.activeElement && document.activeElement.blur()); }
  // Acercamiento suave a un elemento (z = cuánto) y alejar
  async acercar(sel, z, ms) {
    const r = await this.ver(sel);
    await this.p.evaluate(a => esc.acercar(a[0], a[1]), [r, z || 1.7]);
    await espera(ms == null ? 1100 : ms);
  }
  async alejar(ms) { await this.marco(null); await this.p.evaluate(() => esc.base()); await espera(ms == null ? 1100 : ms); }
  // Marco que resalta un elemento (sobre el teléfono, sigue el acercamiento actual)
  async marco(sel) {
    if (!sel) { await this.p.evaluate(() => esc.marco(null)); return; }
    const r = await this.rect(sel);
    await this.p.evaluate(rr => esc.marco(rr), r);
  }
  async bajar(px, ms) { await this.f.evaluate(d => window.scrollBy({ top: d, behavior: 'smooth' }), px); await espera(ms || 900); }
  async arriba() { await this.f.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await espera(700); }
  async cerrarHojas() {
    while (await this.f.locator('.velo [data-cerrar]').count()) {
      await this.tocar('.velo >> nth=-1 >> [data-cerrar]', { despues: 450 });
    }
  }
  // Firma con el dedo sobre el recuadro (eventos de puntero dentro de la app; el dedo del video sigue el trazo)
  async firmar(trazos) {
    const r = await this.ver('.firma-caja canvas', 40);
    for (const t of trazos) {
      const pts = t.map(([px, py]) => [r.x + px * r.w, r.y + py * r.h]);
      await this.p.evaluate(a => esc.dedo(a[0], a[1]), pts[0]);
      await espera(500);
      await this.p.evaluate(() => esc.apretar(true));
      const tipo = (n, x, y) => this.f.locator('.firma-caja canvas').evaluate((cv, a) => {
        cv.dispatchEvent(new PointerEvent(a[0], { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: a[1], clientY: a[2], buttons: a[0] === 'pointerup' ? 0 : 1 }));
      }, [n, x, y]);
      await tipo('pointerdown', pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        for (let k = 1; k <= 4; k++) {
          const x = ax + (bx - ax) * k / 4, y = ay + (by - ay) * k / 4;
          await tipo('pointermove', x, y);
          await this.p.evaluate(a => esc.dedo(a[0], a[1], true), [x, y]);
          await espera(16);
        }
      }
      await tipo('pointerup', pts[pts.length - 1][0], pts[pts.length - 1][1]);
      await this.p.evaluate(() => esc.apretar(false));
    }
    await espera(400);
    await this.p.evaluate(() => esc.sinDedo());
  }
  async sinSenal(si) {
    await this.ctx.setOffline(si);
    await this.f.evaluate(s => window.dispatchEvent(new Event(s ? 'offline' : 'online')), si);
  }
  async esperarQue(sel, ms) { await this.f.waitForSelector(sel, { timeout: ms || 15000 }); }
  async esperar(ms) { await espera(ms); }
}

module.exports = { Video, espera };
