// Generates the extension icons (no dependencies). Run: node tools/make-icons.js
'use strict';
var fs = require('fs'), zlib = require('zlib'), path = require('path');

function crc32(buf) {
  var table = crc32.table || (crc32.table = (function () { var t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })());
  var c = 0xffffffff;
  for (var i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  var len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  var td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  var crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  var raw = Buffer.alloc((size * 4 + 1) * size);
  for (var y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (var x = 0; x < size; x++) {
      var p = pixel(x, y, size), o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = p[0]; raw[o + 1] = p[1]; raw[o + 2] = p[2]; raw[o + 3] = p[3];
    }
  }
  var ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// Rounded dark tile, green→yellow→red score bar, white "M".
function pixel(x, y, s) {
  var r = s * 0.2, cx = Math.min(Math.max(x, r), s - 1 - r), cy = Math.min(Math.max(y, r), s - 1 - r);
  var inside = Math.hypot(x - cx, y - cy) <= r;
  if (!inside) return [0, 0, 0, 0];
  var u = x / s, v = y / s;
  if (v > 0.78 && v < 0.9 && u > 0.14 && u < 0.86) {
    var t = (u - 0.14) / 0.72;
    var c = t < 0.5 ? [Math.round(34 + (234 - 34) * t * 2), Math.round(197 + (179 - 197) * t * 2), 8] : [Math.round(234 + (239 - 234) * (t - 0.5) * 2), Math.round(179 + (68 - 179) * (t - 0.5) * 2), Math.round(8 + (68 - 8) * (t - 0.5) * 2)];
    return [c[0], c[1], c[2], 255];
  }
  // "M" glyph: two verticals and two diagonals.
  var w = 0.11;
  var inM = (u > 0.18 && u < 0.18 + w && v > 0.18 && v < 0.68) || (u > 0.82 - w && u < 0.82 && v > 0.18 && v < 0.68) ||
    (Math.abs((u - 0.18) - (v - 0.18) * 0.64) < w * 0.75 && v > 0.18 && v < 0.68 && u < 0.5) ||
    (Math.abs((0.82 - u) - (v - 0.18) * 0.64) < w * 0.75 && v > 0.18 && v < 0.68 && u >= 0.5);
  if (inM) return [249, 250, 251, 255];
  return [17, 24, 39, 255];
}
var out = path.join(__dirname, '..', 'icons');
fs.mkdirSync(out, { recursive: true });
[16, 48, 128].forEach(function (s) { fs.writeFileSync(path.join(out, 'icon' + s + '.png'), png(s, pixel)); });
console.log('icons written');
