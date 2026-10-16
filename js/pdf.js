// Electro Montana — PDF armado en el propio teléfono, sin librerías y sin internet. Usa las letras
// Helvetica (vienen en todo lector de PDF), líneas, rectángulos e imágenes JPEG (las firmas).
// Coordenadas en puntos (1/72 de pulgada) desde la esquina de ARRIBA a la izquierda; y = línea base del texto.
'use strict';

// Ancho de cada letra, códigos 32 a 255 (WinAnsi), en milésimas del tamaño: medidas oficiales de Helvetica
var PDF_ANCHOS = {
  F1: '278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,350,556,350,222,556,333,1000,556,556,333,1000,667,333,1000,350,611,350,350,222,222,333,333,350,556,1000,333,1000,500,333,944,350,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500'.split(',').map(Number),
  F2: '278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,350,556,350,278,556,500,1000,556,556,333,1000,667,333,1000,350,611,350,350,278,278,500,500,350,556,1000,333,1000,556,333,944,350,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556'.split(',').map(Number)
};
// Letras fuera de Latin-1 que sí tiene la tabla WinAnsi
var PDF_WINANSI = { 0x20AC: 128, 0x201A: 130, 0x0192: 131, 0x201E: 132, 0x2026: 133, 0x2020: 134, 0x2021: 135, 0x02C6: 136,
  0x2030: 137, 0x0160: 138, 0x2039: 139, 0x0152: 140, 0x017D: 142, 0x2018: 145, 0x2019: 146, 0x201C: 147, 0x201D: 148,
  0x2022: 149, 0x2013: 150, 0x2014: 151, 0x02DC: 152, 0x2122: 153, 0x0161: 154, 0x203A: 155, 0x0153: 156, 0x017E: 158,
  0x0178: 159, 0x2212: 45 };

// Texto → códigos WinAnsi (uno por carácter). Lo que no existe en la tabla sale como "?"
function pdfCodigos(s) {
  s = String(s == null ? '' : s);
  if (s.normalize) s = s.normalize('NFC');
  var out = '';
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13 || c === 0xA0) c = 32;
    else if (c < 32) continue;
    else if (c > 126 && c < 160) c = 63;
    else if (c > 255) {
      if (c >= 0xD800 && c <= 0xDBFF) i++;   // emoji y similares: un solo "?"
      c = PDF_WINANSI[c] || 63;
    }
    out += String.fromCharCode(c);
  }
  return out;
}

function pdfBinario(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return s;
}

// Lee alto, ancho y colores de un JPEG (para meterlo tal cual en el PDF)
function pdfJPEG(bytes) {
  if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) throw new Error('La imagen no es JPEG.');
  var i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xFF) { i++; continue; }
    var m = bytes[i + 1];
    if (m === 0xFF) { i++; continue; }
    if (m === 0x01 || (m >= 0xD0 && m <= 0xD8)) { i += 2; continue; }
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      return { alto: (bytes[i + 5] << 8) | bytes[i + 6], ancho: (bytes[i + 7] << 8) | bytes[i + 8], colores: bytes[i + 9], datos: pdfBinario(bytes) };
    }
    i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
  }
  throw new Error('No se pudo leer la imagen.');
}

function nuevoPDF() {
  var W = 612, H = 792;   // tamaño carta
  var paginas = [], imagenes = [], ops = null;
  function n(x) { var r = Math.round(x * 100) / 100; return String(r === 0 ? 0 : r); }
  function rgb(hex, relleno) {
    var v = [1, 3, 5].map(function (k) { return n(parseInt(hex.slice(k, k + 2), 16) / 255); }).join(' ');
    return v + (relleno ? ' rg' : ' RG');
  }
  function cadena(cod) { return '(' + cod.replace(/[\\()]/g, '\\$&') + ')'; }
  function medirCod(cod, t, negrita, esp) {
    var a = negrita ? PDF_ANCHOS.F2 : PDF_ANCHOS.F1, w = 0;
    for (var i = 0; i < cod.length; i++) w += a[cod.charCodeAt(i) - 32] || 556;
    return w * t / 1000 + (esp || 0) * cod.length;
  }
  var P = {
    ancho: W, alto: H, num: n, rgb: rgb,
    get paginas() { return paginas.length; },
    pagina: function () { ops = []; paginas.push(ops); return P; },
    // en una página ya hecha (por ejemplo, para poner "Página 1 de 2" al final)
    irA: function (i) { ops = paginas[i]; return P; },
    crudo: function (s) { ops.push(s); return P; },
    medir: function (s, t, negrita, esp) { return medirCod(pdfCodigos(s), t, negrita, esp); },
    // o: { t: tamaño, b: negrita, color, alinear: 'der' | 'centro', esp: espacio entre letras }
    texto: function (x, y, s, o) {
      o = o || {};
      var t = o.t || 10, cod = pdfCodigos(s), esp = o.esp || 0;
      if (!cod) return P;
      var w = medirCod(cod, t, o.b, esp) - (esp && cod.length ? esp : 0);
      if (o.alinear === 'der') x -= w; else if (o.alinear === 'centro') x -= w / 2;
      ops.push('BT /' + (o.b ? 'F2' : 'F1') + ' ' + n(t) + ' Tf ' + rgb(o.color || '#111111', true) + ' ' + n(esp) + ' Tc ' +
        n(x) + ' ' + n(H - y) + ' Td ' + cadena(cod) + ' Tj ET');
      return P;
    },
    // Parte un texto en renglones que quepan en "ancho". Con "max", el último renglón lleva "…" si sobra texto.
    partir: function (s, t, negrita, ancho, max) {
      var palabras = String(s == null ? '' : s).replace(/\s+/g, ' ').trim().split(' '), lineas = [], act = '';
      if (!palabras[0]) return [];
      palabras.forEach(function (p) {
        var prueba = act ? act + ' ' + p : p;
        if (!act || P.medir(prueba, t, negrita) <= ancho) { act = prueba; return; }
        lineas.push(act); act = p;
      });
      lineas.push(act);
      // palabras más largas que el ancho: se cortan
      lineas = lineas.reduce(function (acc, l) {
        while (P.medir(l, t, negrita) > ancho && l.length > 1) {
          var k = l.length - 1;
          while (k > 1 && P.medir(l.slice(0, k), t, negrita) > ancho) k--;
          acc.push(l.slice(0, k)); l = l.slice(k);
        }
        acc.push(l); return acc;
      }, []);
      if (max && lineas.length > max) {
        var u = lineas[max - 1];
        while (u && P.medir(u + '…', t, negrita) > ancho) u = u.slice(0, -1);
        lineas = lineas.slice(0, max - 1).concat([u.replace(/\s+$/, '') + '…']);
      }
      return lineas;
    },
    // o: { g: grosor, color, puntos: true para línea punteada }
    linea: function (x1, y1, x2, y2, o) {
      o = o || {};
      ops.push('q ' + n(o.g || 0.6) + ' w ' + rgb(o.color || '#999999') + (o.puntos ? ' [1 1.6] 0 d' : '') + ' ' +
        n(x1) + ' ' + n(H - y1) + ' m ' + n(x2) + ' ' + n(H - y2) + ' l S Q');
      return P;
    },
    // o: { relleno: color, borde: color, g: grosor }
    rect: function (x, y, w, h, o) {
      o = o || {};
      var op = o.relleno && o.borde ? 'B' : o.relleno ? 'f' : 'S';
      ops.push('q ' + (o.relleno ? rgb(o.relleno, true) + ' ' : '') + (o.borde || !o.relleno ? rgb(o.borde || '#999999') + ' ' + n(o.g || 0.6) + ' w ' : '') +
        n(x) + ' ' + n(H - y - h) + ' ' + n(w) + ' ' + n(h) + ' re ' + op + ' Q');
      return P;
    },
    // img = resultado de pdfJPEG
    imagen: function (img, x, y, w, h) {
      var k = imagenes.indexOf(img);
      if (k < 0) { imagenes.push(img); k = imagenes.length - 1; }
      ops.push('q ' + n(w) + ' 0 0 ' + n(h) + ' ' + n(x) + ' ' + n(H - y - h) + ' cm /Im' + (k + 1) + ' Do Q');
      return P;
    },
    // El archivo terminado (bytes)
    bytes: function (titulo) {
      var objs = [null, null];
      function agregar(s) { objs.push(s); return objs.length; }
      function flujo(dic, datos) { return '<< ' + dic + (dic ? ' ' : '') + '/Length ' + datos.length + ' >>\nstream\n' + datos + '\nendstream'; }
      var f1 = agregar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
      var f2 = agregar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      var xo = imagenes.map(function (im, i) {
        var cs = im.colores === 1 ? 'DeviceGray' : im.colores === 4 ? 'DeviceCMYK' : 'DeviceRGB';
        var r = agregar(flujo('/Type /XObject /Subtype /Image /Width ' + im.ancho + ' /Height ' + im.alto + ' /ColorSpace /' + cs +
          ' /BitsPerComponent 8 /Filter /DCTDecode' + (im.colores === 4 ? ' /Decode [1 0 1 0 1 0 1 0]' : ''), im.datos));
        return '/Im' + (i + 1) + ' ' + r + ' 0 R';
      }).join(' ');
      var hijos = paginas.map(function (p) {
        var c = agregar(flujo('', p.join('\n')));
        return agregar('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /Font << /F1 ' + f1 + ' 0 R /F2 ' + f2 +
          ' 0 R >>' + (xo ? ' /XObject << ' + xo + ' >>' : '') + ' >> /Contents ' + c + ' 0 R >>');
      });
      objs[0] = '<< /Type /Catalog /Pages 2 0 R >>';
      objs[1] = '<< /Type /Pages /Kids [' + hijos.map(function (k) { return k + ' 0 R'; }).join(' ') + '] /Count ' + hijos.length + ' >>';
      var d = new Date(), dd = function (x) { return String(x).padStart(2, '0'); };
      var info = agregar('<< /Title ' + cadena(pdfCodigos(titulo || '')) + ' /Producer (Electro Montana) /CreationDate (D:' + d.getUTCFullYear() +
        dd(d.getUTCMonth() + 1) + dd(d.getUTCDate()) + dd(d.getUTCHours()) + dd(d.getUTCMinutes()) + dd(d.getUTCSeconds()) + 'Z) >>');
      var s = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', pos = [];
      objs.forEach(function (o, i) { pos.push(s.length); s += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
      var xref = s.length;
      s += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' +
        pos.map(function (p) { return String(p).padStart(10, '0') + ' 00000 n \n'; }).join('') +
        'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
      var b = new Uint8Array(s.length);
      for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
      return b;
    }
  };
  return P;
}

if (typeof module !== 'undefined') module.exports = { nuevoPDF: nuevoPDF, pdfJPEG: pdfJPEG, pdfCodigos: pdfCodigos };
