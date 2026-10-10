// Inlines src/content/panel.css into src/content/panel-css.js so the panel can live in a
// closed shadow root without exposing a web-accessible resource. Run: npm run build:css
'use strict';
var fs = require('fs'), path = require('path');
var src = path.join(__dirname, '..', 'src', 'content', 'panel.css');
var out = path.join(__dirname, '..', 'src', 'content', 'panel-css.js');
var css = fs.readFileSync(src, 'utf8');
var js = '// GENERATED from panel.css by tools/build-css.js — do not edit.\n' +
  '(function () { window.MCT = window.MCT || {}; window.MCT.panelCss = ' + JSON.stringify(css) + '; })();\n';
if (process.argv.includes('--check')) {
  if (!fs.existsSync(out) || fs.readFileSync(out, 'utf8') !== js) { console.error('panel-css.js is stale: run npm run build:css'); process.exit(1); }
  console.log('panel-css.js in sync');
} else { fs.writeFileSync(out, js); console.log('wrote ' + path.relative(process.cwd(), out)); }
