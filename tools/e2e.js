// Browser end-to-end test. Loads the unpacked extension in Chromium via Playwright, stubs the
// DexScreener network inside the service worker, serves mock coin pages at the real site URLs
// and checks rendering, scraping, navigation, controls, storage and hostile-input handling.
// The panel lives in a CLOSED shadow root, so the test reads it through the DevTools protocol
// (DOM.getDocument pierce) and drives controls with real Input events — exactly what a page
// cannot do. Run: npm run e2e   (needs `npm i -D playwright` and a Chromium)
'use strict';
const { chromium } = require('playwright');
const path = require('path'), os = require('os'), fs = require('fs');

(async () => {
  const ext = path.join(__dirname, '..');
  const S = fs.mkdtempSync(path.join(os.tmpdir(), 'mct-e2e-'));
  const ctx = await chromium.launchPersistentContext(path.join(S, 'profile'), { headless: true, channel: 'chromium', args: ['--disable-extensions-except=' + ext, '--load-extension=' + ext] });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const id = sw.url().split('/')[2];
  const errors = [];
  const fail = (m) => { errors.push(m); console.log('FAIL', m); };
  const ok = (m) => console.log('ok  ', m);
  const VALID = 'GooDGooD' + 'A'.repeat(32);

  // ---- service worker: stub network
  const BAD = 'BadBadBad' + 'B'.repeat(31);
  await sw.evaluate(([VALID, BAD]) => {
    self.__pair = (addr) => addr === BAD
      ? ({ chainId: 'solana', dexId: 'raydium', pairAddress: 'Q', url: 'https://dexscreener.com/solana/Q', baseToken: { address: BAD, symbol: 'HAWK', name: 'Hawk Tuah' }, priceUsd: '0.1', priceChange: { h1: 300 }, volume: { h1: 900000, h24: 1e6 }, liquidity: { usd: 3000 }, marketCap: 500000, pairCreatedAt: Date.now() - 2 * 36e5 })
      : ({ chainId: 'solana', dexId: 'pumpfun', pairAddress: 'P', url: 'https://dexscreener.com/solana/P', baseToken: { address: VALID, symbol: 'TEST', name: 'Test Dog' }, priceUsd: '0.5', priceChange: { h1: 10 }, volume: { h1: 50000, h24: 90000 }, liquidity: { usd: 20000 }, marketCap: 40000, pairCreatedAt: Date.now() - 5 * 36e5 });
    self.__known = [VALID, BAD];
    self.__mode = 'good';
    self.fetch = async (url, opts) => {
      const u = String(url);
      const body = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
      if (self.__mode === 'hang') return new Promise((_, rej) => { const sig = opts && opts.signal; if (!sig) return; sig.addEventListener('abort', () => rej(sig.reason)); });
      if (self.__mode === 'huge') return new Response(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(1 << 20)); } }), { status: 200 });
      if (self.__mode === 'evil') { const p = self.__pair(); p.url = 'javascript:alert(1)'; p.chainId = '__proto__'; p.labels = 'x'; p.info = { websites: [null] }; return body({ pairs: [p] }); }
      const hits = self.__known.filter(k => u.includes(k));
      return body({ pairs: hits.map(k => self.__pair(k)) });
    };
  }, [VALID, BAD]);
  const good = await sw.evaluate((VALID) => fetchDex('token', 'solana', VALID), VALID);
  good && good.symbol === 'TEST' && good.metrics.volMcap1h === 1.25 && Math.round(good.metrics.ageHours) === 5 ? ok('sw fetch+normalize') : fail('sw normalize ' + JSON.stringify(good));
  for (const [k, c, a] of [['token', 'solana', '../../etc'], ['drop', 'solana', VALID], ['token', 'evil', VALID], ['token', 'solana', 'javascript:alert(1)']]) {
    const r = await sw.evaluate(([k, c, a]) => fetchDex(k, c, a).then(() => 'resolved', e => 'rejected:' + e.message), [k, c, a]);
    r.startsWith('rejected') ? ok('sw rejects ' + k + '/' + c + '/' + a.slice(0, 12)) : fail('sw accepted ' + [k, c, a]);
  }
  (await sw.evaluate((V) => fetchDex('pair', 'solana', V), VALID)).symbol === 'TEST' ? ok('pair→token fallback') : fail('pair fallback');
  await sw.evaluate(() => { CACHE = {}; self.__mode = 'huge'; });
  const huge = await sw.evaluate((V) => fetchDex('token', 'solana', V).then(() => 'resolved', e => e.message), VALID);
  huge === 'response too large' ? ok('oversized body rejected') : fail('huge body: ' + huge);
  await sw.evaluate(() => { CACHE = {}; self.__mode = 'hang'; FETCH_TIMEOUT_MS = 300; });
  const hang = await sw.evaluate((V) => Promise.all([fetchDex('token', 'solana', V), fetchDex('token', 'solana', V)].map(p => p.then(() => 'resolved', e => e.name))), VALID);
  hang[0] === 'TimeoutError' && hang[1] === 'TimeoutError' ? ok('hanging fetch times out; concurrent calls deduped') : fail('hang: ' + hang);
  await sw.evaluate(() => { CACHE = {}; self.__mode = 'good'; FETCH_TIMEOUT_MS = 10000; });

  // ---- content page helpers (CDP, pierces the closed shadow root)
  const page = await ctx.newPage();
  page.on('pageerror', e => fail('pageerror ' + e.message));
  page.on('console', m => { if (m.type() === 'error') fail('console ' + m.text()); });
  page.on('dialog', d => { fail('dialog opened: ' + d.message()); d.dismiss(); });
  const cdp = await page.context().newCDPSession(page);
  const scratch = await ctx.newPage();
  async function shadowRootNode() {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const stack = [root];
    while (stack.length) {
      const n = stack.pop();
      if (n.nodeName === 'DIV' && n.attributes && n.attributes.includes('mct-host')) return n.shadowRoots && n.shadowRoots[0];
      (n.children || []).forEach(c => stack.push(c));
      (n.shadowRoots || []).forEach(c => stack.push(c));
    }
    return null;
  }
  async function read() {
    const sr = await shadowRootNode();
    if (!sr) return { mounted: false };
    const hostVisible = await page.evaluate(() => { const h = document.getElementById('mct-host'); return !!h && h.style.display !== 'none' && h.shadowRoot === null; });
    const { outerHTML } = await cdp.send('DOM.getOuterHTML', { nodeId: sr.nodeId });
    await scratch.setContent('<div id="mct-root">' + outerHTML + '</div>');
    const r = await scratch.evaluate(() => {
      const q = s => { const el = document.querySelector(s); return el ? el.textContent.trim() : null; };
      return { title: q('.title'), score: (q('.score-pill') || '').replace(/^[✖!✔] /, ''), verdictCard: q('.verdict-label'), reasons: [...document.querySelectorAll('.reason b')].map(e => e.textContent), listBadges: null, band: q('.band'), narrative: q('.chip-narr'), phase: q('.phase.active'), error: q('.error'), metrics: [...document.querySelectorAll('.metric')].map(m => m.textContent.replace(/\s+/g, ' ')), link: (document.querySelector('.footer a') || {}).getAttribute ? (document.querySelector('.footer a') || { getAttribute: () => null }).getAttribute('href') : null, sigSrc: [...document.querySelectorAll('.sig-src')].map(e => e.textContent), fired: [...document.querySelectorAll('.sig.fired .sig-label')].map(e => e.textContent), collapsed: !!document.querySelector('.panel.collapsed'), side: (document.querySelector('.panel') || {}).className || null, chips: [...document.querySelectorAll('.header .chip')].map(e => e.textContent), imgs: document.querySelectorAll('img, script').length, verdict: q('.verdict') };
    });
    return Object.assign({ mounted: true, visible: hostVisible }, r);
  }
  async function clickIn(selector) {
    const sr = await shadowRootNode();
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: sr.nodeId, selector });
    if (!nodeId) throw new Error('not found in shadow: ' + selector);
    await cdp.send('DOM.scrollIntoViewIfNeeded', { nodeId });
    const { model } = await cdp.send('DOM.getBoxModel', { nodeId });
    const q = model.content, x = (q[0] + q[2]) / 2, y = (q[1] + q[5]) / 2;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await page.waitForTimeout(150);
  }

  // ---- hostile mock page at the real URL
  const hostile = `<!doctype html><html><head><title>Test Dog (TEST) | pump.fun</title></head><body style="margin:0">
    <h1>Test Dog (TEST)</h1><div>bonding curve progress: 12%</div><div>LP burned</div><div>Holders: 300</div>
    <div>dev 250%</div><div>Top 10 holders -5%</div><div>dev 4%</div>
    <div>&lt;img src=x onerror=alert(1)&gt;</div><div>javascript:alert(1)</div>
    <div>holder${'&nbsp;'.repeat(60000)}x</div>
    <script>history.pushState({}, '', '/coin/${VALID}');</script></body></html>`;
  await page.route('https://pump.fun/**', r => r.fulfill({ contentType: 'text/html', body: hostile }));
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto('https://pump.fun/board', { waitUntil: 'load' });
  await page.waitForTimeout(4500);
  let p = await read();
  p.mounted && p.visible ? ok('panel mounted in a CLOSED shadow root (page sees shadowRoot === null)') : fail('mount ' + JSON.stringify(p));
  p.title === '$TEST' ? ok('SPA pushState navigation detected → $TEST') : fail('spa nav ' + p.title);
  p.imgs === 0 ? ok('no injected img/script nodes from hostile text') : fail('hostile nodes injected');
  !p.metrics.some(m => /250|-5/.test(m)) ? ok('out-of-range page values discarded') : fail('bad page values kept ' + p.metrics);
  p.metrics.some(m => /Holders ·pg300/.test(m)) ? ok('valid holders kept and labelled (page)') : fail('holders ' + p.metrics);
  // API says age 5h and vol/mcap 125%, so exactly those two fire; page text may not clear dev / top10 / LP.
  p.fired.join() === 'Vol/mcap >100% in 1h,Contract age <24h' && p.sigSrc.slice(0, 3).every(x => x === 'unknown' || /\(unverified\)$/.test(x)) && p.sigSrc[2] === 'page: locked (unverified)' && p.score === '2/10' ? ok('page "LP burned" / "dev 4%" shown as unverified hints, cannot clear a signal; score 2/10 from API only') : fail('page cleared signals ' + JSON.stringify(p.sigSrc) + ' ' + p.fired + ' ' + p.score);
  p.narrative === 'Animal · canine' ? ok('narrative from page title: canine') : fail('narrative ' + p.narrative);
  p.metrics.some(m => /Mcap\$40.0K/.test(m)) && p.phase === 'Launch' ? ok('market strip from stubbed API; phase Launch') : fail('market ' + JSON.stringify(p.metrics) + ' ' + p.phase);
  p.link === 'https://dexscreener.com/solana/P' ? ok('external link validated') : fail('link ' + p.link);
  p.verdictCard === 'HALF SIZE · CAUTION' && p.reasons.includes('Launch phase (<24h old)') && p.reasons.includes('Vol/mcap >100% in 1h') ? ok('verdict card auto-applied: ' + p.verdictCard + ' (' + p.reasons.join(', ') + ')') : fail('verdict ' + p.verdictCard + ' ' + p.reasons);
  const scrapeMs = await page.evaluate(() => { const t = performance.now(); document.body.innerText; return performance.now() - t; });
  ok('page with 60k nbsp run did not freeze (innerText ' + scrapeMs.toFixed(0) + 'ms; scrape bounded by unit test)');

  // ---- page cannot tamper: synthetic clicks / shadowRoot access
  const tamper = await page.evaluate(() => { const h = document.getElementById('mct-host'); return { sr: h.shadowRoot, kids: h.children.length }; });
  tamper.sr === null && tamper.kids === 0 ? ok('page cannot reach panel internals') : fail('tamper surface ' + JSON.stringify(tamper));
  await page.evaluate(() => { document.getElementById('mct-host').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  p = await read(); !p.collapsed ? ok('synthetic click ignored') : fail('synthetic click collapsed panel');

  // ---- hostile API response: javascript: url, __proto__ chain, bad types
  await sw.evaluate(() => { CACHE = {}; self.__mode = 'evil'; });
  await clickIn('.icon-btn[title=Refresh]'); await page.waitForTimeout(800);
  p = await read();
  p.link === null && p.mounted && p.score && !p.chips.some(c => /object|function/i.test(c)) ? ok('hostile API response: link dropped, no crash, no proto garbage (chips: ' + p.chips.join('|') + ')') : fail('hostile api ' + JSON.stringify(p));
  await sw.evaluate(() => { CACHE = {}; self.__mode = 'good'; });

  // ---- real controls through trusted input
  await clickIn('.sig:nth-child(3)'); p = await read();
  p.fired.includes('LP unlocked / removable') && p.score === '4/10' && p.verdictCard === 'SKIP' && p.reasons.includes('LP unlocked / removable') ? ok('trusted click sets manual override → 4/10, verdict flips to SKIP') : fail('override ' + JSON.stringify([p.fired, p.score, p.verdictCard]));
  await clickIn('.check:nth-child(1) input'); await clickIn('.check:nth-child(2) input'); p = await read();
  /HIGHEST-CONFIDENCE/.test(p.verdict) ? ok('checklist: dev sell + LP removal verdict') : fail('verdict ' + p.verdict);
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(4000); p = await read();
  p.score === '4/10' && /HIGHEST-CONFIDENCE/.test(p.verdict) ? ok('overrides + checklist persist across reload') : fail('persist ' + JSON.stringify([p.score, p.verdict]));
  await clickIn('.icon-btn[title="Move to other side"]'); p = await read(); /side-left/.test(p.side) ? ok('side switch') : fail('side ' + p.side);
  await clickIn('.icon-btn[title=Collapse]'); p = await read(); p.collapsed ? ok('collapse') : fail('collapse');
  await clickIn('.icon-btn[title=Expand]'); p = await read(); !p.collapsed ? ok('expand') : fail('expand');

  // ---- popup
  const popup = await ctx.newPage();
  popup.on('pageerror', e => fail('popup error ' + e.message));
  await popup.goto('chrome-extension://' + id + '/src/popup/popup.html');
  await popup.waitForSelector('#enabled');
  (await popup.$$eval('.rule', r => r.length)) === 17 && (await popup.textContent('nav button.active')) === 'Filters' ? ok('popup opens on Filters with all 17 research rules listed') : fail('popup filters tab');
  await page.route('https://pump.fun/coin/' + BAD, r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><title>Hawk Tuah (HAWK) | pump.fun</title></head><body style="background:#0b0b0f;color:#eee;font-family:sans-serif;padding:24px"><h1>Hawk Tuah (HAWK)</h1><p>bonding curve progress: 100%</p><p>Holders: 2,310</p></body></html>' }));
  await page.goto('https://pump.fun/coin/' + BAD, { waitUntil: 'load' }); await page.waitForTimeout(3500);
  p = await read();
  p.verdictCard === 'SKIP' && p.reasons.includes('Celebrity derivative') && p.reasons.includes('Liquidity <5% of market cap') ? ok('celebrity coin page → SKIP (' + p.reasons.join(', ') + ')') : fail('celeb verdict ' + JSON.stringify([p.verdictCard, p.reasons]));
  await popup.click('text=Filters');
  await popup.evaluate(() => { const r = [...document.querySelectorAll('.rule')].find(x => /Celebrity/.test(x.textContent)); r.querySelector('input').click(); });
  await page.waitForTimeout(600); p = await read();
  !p.reasons.includes('Celebrity derivative') ? ok('rule switched off in popup → panel re-evaluates live') : fail('rule toggle did not propagate ' + p.reasons);
  await popup.click('text=Reset to research defaults'); await page.waitForTimeout(600); p = await read();
  p.reasons.includes('Celebrity derivative') ? ok('reset to research defaults') : fail('reset');
  await page.screenshot({ path: path.join(__dirname, '..', 'dist', 'shot-panel.png') }).catch(() => {});
  await popup.setViewportSize({ width: 420, height: 640 }); await popup.screenshot({ path: path.join(__dirname, '..', 'dist', 'shot-popup.png') }).catch(() => {});
  await popup.uncheck('#enabled'); await page.waitForTimeout(500);
  p = await read(); !p.visible ? ok('popup toggle hides panel') : fail('panel still visible');
  await popup.check('#enabled'); await page.waitForTimeout(500);
  p = await read(); p.visible ? ok('popup toggle re-shows panel') : fail('panel not restored');
  for (const t of ['Narratives', 'Chains', 'Manipulation', 'Lifecycle', 'Archetypes', 'KOL', 'Score']) { await popup.click('text=' + t); await popup.waitForTimeout(50); }
  ok('all popup tabs render');
  await popup.fill('input[type=text]', '<img src=x onerror=alert(1)> trump'); await popup.press('input[type=text]', 'Enter');
  (await popup.textContent('.card .t')).includes('Political') && (await popup.$$eval('img', x => x.length)) === 0 ? ok('popup classifier input is text-only') : fail('popup xss');

  // ---- trending / board page: rejects hidden, good ones badged
  const board = `<!doctype html><html><head><title>pump.fun board</title></head><body style="background:#111;color:#eee;font-family:sans-serif">
    <h1>Trending</h1><table>
    <tr id="r1"><td><a href="/coin/${VALID}">Test Dog</a></td><td>$40K</td></tr>
    <tr id="r2"><td><a href="/coin/${BAD}">Hawk Tuah</a></td><td>$500K</td></tr>
    <tr id="r3"><td><a href="/coin/${'UnknownUnknown' + 'C'.repeat(26)}">Mystery</a></td><td>$1K</td></tr>
    <tr id="r4"><td><a href="/profile/${VALID}">a wallet link</a></td><td></td></tr>
    </table></body></html>`;
  await page.route('https://pump.fun/**', r => r.fulfill({ contentType: 'text/html', body: board }));
  await page.goto('https://pump.fun/board', { waitUntil: 'load' }); await page.waitForTimeout(3500);
  const rows = await page.evaluate(() => ['r1', 'r2', 'r3', 'r4'].map(id => { const r = document.getElementById(id); const b = r.querySelector('.mct-badge'); return { hidden: r.classList.contains('mct-hide'), badge: b ? b.className.replace('mct-badge ', '') + ':' + b.textContent : null }; }));
  rows[0].badge && /^caution:! 2$/.test(rows[0].badge) && !rows[0].hidden ? ok('board: good coin badged ' + rows[0].badge) : fail('board r1 ' + JSON.stringify(rows[0]));
  rows[1].hidden && /^reject:✖/.test(rows[1].badge || '') ? ok('board: celebrity coin hidden ' + rows[1].badge) : fail('board r2 ' + JSON.stringify(rows[1]));
  rows[2].badge === 'unknown:?' && !rows[2].hidden ? ok('board: unindexed coin marked ? not hidden') : fail('board r3 ' + JSON.stringify(rows[2]));
  rows[3].badge === null ? ok('board: wallet link untouched') : fail('board r4 ' + JSON.stringify(rows[3]));
  p = await read();
  p.title === 'MemeMap' ? ok('board: compact screening summary shown') : fail('board summary ' + p.title);
  await page.evaluate(() => { document.getElementById('mct-host').style.left = '420px'; });
  await page.screenshot({ path: path.join(__dirname, '..', 'dist', 'shot-board.png') }).catch(() => {});
  await sw.evaluate(() => new Promise(res => chrome.storage.local.get({ settings: {} }, r => { r.settings.listMode = 'dim'; chrome.storage.local.set({ settings: r.settings }, res); })));
  await page.waitForTimeout(800);
  const dim = await page.evaluate(() => { const r = document.getElementById('r2'); return { dim: r.classList.contains('mct-dim'), hidden: r.classList.contains('mct-hide') }; });
  dim.dim && !dim.hidden ? ok('list mode switched to dim live') : fail('dim mode ' + JSON.stringify(dim));

  // ---- explorer wallet page: no lookup, nothing sent
  await sw.evaluate(() => { self.__calls = []; const f = self.fetch; self.fetch = (u) => { self.__calls.push(String(u)); return f(u); }; CACHE = {}; });
  await page.route('https://solscan.io/**', r => r.fulfill({ contentType: 'text/html', body: '<html><body>wallet</body></html>' }));
  await page.goto('https://solscan.io/account/' + VALID, { waitUntil: 'load' }); await page.waitForTimeout(2500);
  const calls = await sw.evaluate(() => self.__calls);
  p = await read();
  calls.length === 0 && p.title === 'MemeMap' ? ok('wallet page: no API call, empty state') : fail('wallet leak calls=' + JSON.stringify(calls) + ' title=' + p.title);

  // ---- storage hygiene
  const keys = await sw.evaluate(() => new Promise(res => chrome.storage.local.get(null, a => res(Object.keys(a)))));
  keys.every(k => k === 'settings' || /^mct:tok:[0-9A-Za-z_-]{32,64}$/.test(k)) ? ok('storage keys well-formed: ' + keys.join(',')) : fail('storage keys ' + keys);

  console.log(errors.length ? '\n' + errors.length + ' FAILURE(S)' : '\nALL PASSED');
  await ctx.close();
  fs.rmSync(S, { recursive: true, force: true });
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('E2E CRASH', e); process.exit(1); });
