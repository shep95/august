// Browser end-to-end test. Loads the unpacked extension in Chromium via Playwright,
// stubs the DexScreener network inside the service worker, serves mock coin pages at the
// real site URLs, and checks rendering, scraping, navigation, controls, storage and
// hostile-input handling. Run: npm run e2e   (needs: npm i -D playwright, and a Chromium)
const { chromium } = require('playwright');
(async () => {
  const path = require('path'), os = require('os'), fs = require('fs');
  const ext = path.join(__dirname, '..');
  const S = fs.mkdtempSync(path.join(os.tmpdir(), 'mct-e2e-'));
  const ctx = await chromium.launchPersistentContext(path.join(S, 'profile'), { headless: true, channel: 'chromium', args: ['--disable-extensions-except=' + ext, '--load-extension=' + ext] });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const id = sw.url().split('/')[2];
  const errors = [];
  const fail = (m) => { errors.push(m); console.log('FAIL', m); };
  const ok = (m) => console.log('ok  ', m);

  // --- service worker: stub network, exercise fetch wiring + validation
  await sw.evaluate(() => {
    self.__orig = self.fetch;
    self.fetch = async (url) => {
      if (/\/tokens\/GooDGooD/.test(url) || /\/pairs\/solana\/GooDGooD/.test(url)) return new Response(JSON.stringify({ pairs: [{ chainId: 'solana', dexId: 'pumpfun', pairAddress: 'P', url: 'https://dexscreener.com/solana/P', baseToken: { address: 'GooDGooD', symbol: 'TEST', name: 'Test Dog' }, priceUsd: '0.5', priceChange: { h1: 10 }, volume: { h1: 50000, h24: 90000 }, liquidity: { usd: 20000 }, marketCap: 40000, pairCreatedAt: Date.now() - 5 * 36e5 }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response('{"pairs":[]}', { status: 200, headers: { 'content-type': 'application/json' } });
    };
  });
  const VALID = 'GooDGooD' + 'A'.repeat(32); // 40 chars base58, valid shape
  await sw.evaluate(() => { self.fetch = (self.__f = self.fetch); });
  // adjust stub to key on the valid address
  await sw.evaluate((VALID) => { const f = self.fetch; self.fetch = (u) => f(String(u).replace(VALID, 'GooDGooD')); }, VALID);
  const good = await sw.evaluate((VALID) => fetchDex('token', 'solana', VALID), VALID);
  good && good.symbol === 'TEST' && good.metrics.volMcap1h === 1.25 && Math.round(good.metrics.ageHours) === 5 ? ok('sw fetch+normalize: ' + good.symbol + ' vol/mcap ' + good.metrics.volMcap1h) : fail('sw fetch normalize ' + JSON.stringify(good));
  for (const [k, c, a] of [['token', 'solana', '../../etc'], ['drop', 'solana', VALID], ['token', 'evil', VALID], ['token', 'solana', 'javascript:alert(1)']]) {
    const r = await sw.evaluate(([k, c, a]) => fetchDex(k, c, a).then(() => 'resolved', e => 'rejected:' + e.message), [k, c, a]);
    r.startsWith('rejected') ? ok('sw rejects ' + k + '/' + c + '/' + a.slice(0, 12) + ' → ' + r) : fail('sw accepted bad input ' + [k, c, a]);
  }
  // pair miss falls back to token endpoint
  const fb = await sw.evaluate((VALID) => fetchDex('pair', 'solana', VALID), VALID);
  fb && fb.symbol === 'TEST' ? ok('pair→token fallback') : fail('pair fallback');

  // --- content panel with live (stubbed) market data + hostile page content
  const page = await ctx.newPage();
  page.on('pageerror', e => fail('pageerror ' + e.message));
  page.on('console', m => { if (m.type() === 'error') fail('console ' + m.text()); });
  page.on('dialog', d => { fail('dialog opened: ' + d.message()); d.dismiss(); });
  const hostile = `<!doctype html><html><head><title>Test Dog (TEST) | pump.fun</title></head><body>
    <h1>Test Dog (TEST)</h1><div>bonding curve progress: 12%</div><div>LP burned</div><div>Holders: 300</div>
    <div>dev 250%</div><div>Top 10 holders -5%</div>
    <div>&lt;img src=x onerror=alert(1)&gt;</div><div>javascript:alert(1)</div>
    <script>history.pushState({}, '', '/coin/${VALID}'); window.__pushed = true;</script></body></html>`;
  await page.route('https://pump.fun/**', r => r.fulfill({ contentType: 'text/html', body: hostile }));
  await page.goto('https://pump.fun/board', { waitUntil: 'load' });
  await page.waitForTimeout(4000);
  const read = () => page.evaluate(() => {
    const host = document.getElementById('mct-host'); if (!host || !host.shadowRoot) return { mounted: false };
    const r = host.shadowRoot; const q = s => { const el = r.querySelector(s); return el ? el.textContent.trim() : null; };
    return { mounted: true, visible: host.style.display !== 'none', title: q('.title'), score: q('.score-pill'), band: q('.band'), narrative: q('.chip-narr'), phase: q('.phase.active'), error: q('.error'), metrics: [...r.querySelectorAll('.metric')].map(m => m.textContent.replace(/\s+/g, ' ')), link: (r.querySelector('.footer a') || {}).href || null, sigSrc: [...r.querySelectorAll('.sig-src')].map(e => e.textContent), collapsed: !!r.querySelector('.panel.collapsed'), side: r.querySelector('.panel') ? r.querySelector('.panel').className : null, imgs: r.querySelectorAll('img, script').length };
  });
  let p = await read();
  p.mounted && p.title === '$TEST' ? ok('SPA pushState navigation detected → $TEST') : fail('spa nav ' + JSON.stringify(p));
  p.imgs === 0 ? ok('no injected img/script nodes from hostile text') : fail('hostile nodes injected');
  !p.metrics.some(m => /Dev250|Top10-5/.test(m)) ? ok('out-of-range page values discarded') : fail('bad page values kept ' + p.metrics);
  p.metrics.some(m => /Holders300/.test(m)) ? ok('valid holders kept') : fail('holders lost');
  p.narrative === 'Animal · canine' ? ok('narrative from page title: canine') : fail('narrative ' + p.narrative);
  p.metrics.some(m => /Mcap\$40.0K/.test(m)) && p.phase === 'Launch' ? ok('market strip populated from stubbed API; phase Launch') : fail('market ' + JSON.stringify(p.metrics) + ' phase ' + p.phase);
  p.link === 'https://dexscreener.com/solana/P' ? ok('external link validated') : fail('link ' + p.link);
  p.sigSrc.some(s => /^page:/.test(s)) ? ok('page-sourced values labelled') : fail('labels ' + p.sigSrc);

  // --- hostile dexscreener url must be dropped
  await sw.evaluate(() => { const f = self.fetch; self.fetch = async (u) => { const r = await f(u); const j = await r.json(); if (j.pairs[0]) j.pairs[0].url = 'javascript:alert(1)'; return new Response(JSON.stringify(j), { status: 200 }); }; });
  await sw.evaluate(() => { CACHE = {}; });
  await page.evaluate(() => document.getElementById('mct-host').shadowRoot.querySelector('.icon-btn[title=Refresh]').click());
  await page.waitForTimeout(1500);
  p = await read();
  p.link === null ? ok('javascript: link from API dropped') : fail('unsafe link rendered ' + p.link);

  // --- controls: collapse, side, hide via popup toggle, re-show
  await page.evaluate(() => document.getElementById('mct-host').shadowRoot.querySelector('.icon-btn[title="Move to other side"]').click());
  p = await read(); /side-left/.test(p.side) ? ok('side switch') : fail('side ' + p.side);
  await page.evaluate(() => document.getElementById('mct-host').shadowRoot.querySelector('.icon-btn[title=Collapse]').click());
  p = await read(); p.collapsed ? ok('collapse') : fail('collapse');
  await page.evaluate(() => document.getElementById('mct-host').shadowRoot.querySelector('.icon-btn[title=Expand]').click());
  const popup = await ctx.newPage();
  popup.on('pageerror', e => fail('popup error ' + e.message));
  await popup.goto('chrome-extension://' + id + '/src/popup/popup.html');
  await popup.waitForSelector('#enabled'); await popup.uncheck('#enabled'); await page.waitForTimeout(500);
  p = await read(); !p.visible ? ok('popup toggle hides panel') : fail('panel still visible');
  await popup.check('#enabled'); await page.waitForTimeout(500);
  p = await read(); p.visible ? ok('popup toggle re-shows panel') : fail('panel not restored');
  for (const t of ['Narratives', 'Chains', 'Manipulation', 'Lifecycle', 'Archetypes', 'KOL', 'Score']) { await popup.click('text=' + t); await popup.waitForTimeout(50); }
  ok('all popup tabs render');
  await popup.fill('input[type=text]', '<img src=x onerror=alert(1)> trump'); await popup.press('input[type=text]', 'Enter');
  (await popup.textContent('.card .t')).includes('Political') && (await popup.$$eval('img', x => x.length)) === 0 ? ok('popup classifier input is text-only') : fail('popup xss');

  // --- no-token page
  await page.route('https://dexscreener.com/**', r => r.fulfill({ contentType: 'text/html', body: '<html><body>board</body></html>' }));
  await page.goto('https://dexscreener.com/', { waitUntil: 'load' }); await page.waitForTimeout(2500);
  p = await read(); p.mounted && p.title === 'MemeMap' && p.score === '—' ? ok('no-token page renders empty state') : fail('empty state ' + JSON.stringify(p));

  // --- storage: no junk keys
  const keys = await sw.evaluate(() => new Promise(res => chrome.storage.local.get(null, a => res(Object.keys(a)))));
  keys.every(k => k === 'settings' || /^mct:tok:[0-9A-Za-z_-]{32,64}$/.test(k)) ? ok('storage keys well-formed: ' + keys.join(',')) : fail('storage keys ' + keys);

  console.log(errors.length ? '\n' + errors.length + ' FAILURE(S)' : '\nALL PASSED');
  await ctx.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('E2E CRASH', e); process.exit(1); });
