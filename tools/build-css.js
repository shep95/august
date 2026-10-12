// Inlines src/content/panel.css into src/content/panel-css.js so the panel can live in a
// closed shadow root without exposing a web-accessible resource. Run: npm run build:css
'use strict';
var fs = require('fs'), path = require('path');
var dir = path.join(__dirname, '..', 'src', 'content');
var out = path.join(dir, 'panel-css.js');
var css = fs.readFileSync(path.join(dir, 'panel.css'), 'utf8');
var listCss = fs.readFileSync(path.join(dir, 'list.css'), 'utf8');
// The font is embedded as a data URL so the closed shadow root needs no web-accessible resource.
var font = fs.readFileSync(path.join(__dirname, '..', 'src', 'assets', 'manrope.woff2')).toString('base64');
var fontFace = '@font-face{font-family:"Manrope";src:url(data:font/woff2;base64,' + font + ') format("woff2");font-weight:400 800;font-display:swap;}\n';
var js = '// GENERATED from panel.css + list.css + assets/manrope.woff2 by tools/build-css.js — do not edit.\n' +
  '(function () { window.MCT = window.MCT || {}; window.MCT.panelCss = ' + JSON.stringify(fontFace + css) + '; window.MCT.listCss = ' + JSON.stringify(fontFace + listCss) + '; })();\n';
if (process.argv.includes('--check')) {
  if (!fs.existsSync(out) || fs.readFileSync(out, 'utf8') !== js) { console.error('panel-css.js is stale: run npm run build:css'); process.exit(1); }
  console.log('panel-css.js in sync');
} else { fs.writeFileSync(out, js); console.log('wrote ' + path.relative(process.cwd(), out)); }
