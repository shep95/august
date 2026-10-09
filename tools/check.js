// Syntax-check every JS file and validate the manifest. Run: npm run check
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var root = path.join(__dirname, '..');
var failed = 0;
function walk(d) {
  fs.readdirSync(d).forEach(function (f) {
    var p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { if (f !== 'node_modules' && f !== '.git') walk(p); }
    else if (/\.js$/.test(f)) {
      try { new vm.Script(fs.readFileSync(p, 'utf8'), { filename: p }); }
      catch (e) { failed++; console.error('SYNTAX', path.relative(root, p), e.message); }
    }
  });
}
walk(root);
var m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
if (m.manifest_version !== 3) { failed++; console.error('manifest_version must be 3'); }
var refs = [m.background.service_worker, m.action.default_popup].concat(m.content_scripts[0].js, Object.values(m.icons), Object.values(m.action.default_icon));
(m.web_accessible_resources || []).forEach(function (w) { refs = refs.concat(w.resources); });
refs.forEach(function (r) { if (!fs.existsSync(path.join(root, r))) { failed++; console.error('MISSING', r); } });
if (failed) { console.error(failed + ' problem(s)'); process.exit(1); }
console.log('check ok: ' + refs.length + ' manifest refs resolve, all JS parses');
