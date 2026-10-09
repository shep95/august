// Package the extension for upload. Run: npm run zip  → dist/meme-coin-domain-map-<version>.zip
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process');
var root = path.join(__dirname, '..');
var m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
var out = path.join(root, 'dist', 'meme-coin-domain-map-' + m.version + '.zip');
if (fs.existsSync(out)) fs.unlinkSync(out);
cp.execFileSync('zip', ['-r', out, 'manifest.json', 'src', 'icons'], { cwd: root, stdio: 'inherit' });
console.log('wrote ' + path.relative(root, out));
