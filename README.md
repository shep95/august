# Meme Coin Domain Map — browser extension

A Chrome (Manifest V3) extension that turns the meme coin domain-map research into a live
assessment panel on meme coin trading sites. Open a coin or pair page and the panel
scores the token on the 7-signal / 10-point manipulation model, classifies its narrative,
places it in the lifecycle, checks launchpad red flags and runs the 10-signal pre-collapse
checklist.

Research reference only. Not financial advice.

## What it does

**Automatic verdict.** Every coin page opens with a rounded verdict card: **SKIP**, **HALF SIZE ·
CAUTION** or **BUY · FULL SIZE**, with the research reasons listed under it. Nothing to click:
the 17 filter rules below are on by default and come straight from the research.

**Automatic list screening.** On trending, board and list pages every coin link is looked up
and badged with its verdict and score; coins that fail are hidden (or dimmed / badged only,
your choice in the popup). The panel shows a running count of skip / half / buy / no-data.

| Rule | Severity |
| --- | --- |
| Score band Skip or Do-not-engage (5+) | reject |
| Score band Half-size (3–4) | caution |
| Celebrity derivative narrative | reject |
| Political narrative | reject |
| No narrative anchor (absurdist) | caution |
| pump.fun curve ≥95% | reject |
| pump.fun curve 60–95% | caution |
| LP unlocked / removable | reject |
| Dev wallet >10% | reject |
| Top-10 holders >50% | reject |
| Liquidity <5% of mcap (LPI) | reject |
| Vol/mcap >100% in 1h (wash) | caution |
| Launch phase (<24h) | caution |
| Under 1 hour old | reject, off by default |
| 3+ pre-collapse signals | reject |
| BSC / four.meme chain | caution |
| Any launchpad red flag | reject |

Rules that cannot be checked from public data (dev %, top-10 %, LP lock) are listed as
"not checkable yet" on the card and never silently pass; set them in the On-chain signals
section and the verdict updates.

| Section | Source in the research | What the panel shows |
| --- | --- | --- |
| Score | Domain III applied — 7 signals, 10-point scale | Composite score, band (full / half / skip / do not engage), per-signal state. Signals auto-fill from public data where possible and can be overridden by clicking. |
| Market | DexScreener public API | Age, mcap, liquidity, 1h volume, vol/mcap, 1h price change, liq/mcap thin-LP (LPI) warning. |
| Narrative | Domain I — 9 sub-domains + rotation sequences | Keyword classification (canine / feline / frog / political / AI / cultural / celebrity / absurdist / web3), confidence, and position in the animal or macro rotation with prev → next slot. |
| Lifecycle | Domain IV | Launch / accumulation / distribution / terminal phase from pair age, with the phase's risk notes. |
| Launchpad & LP | Domain II | Chain profile, launchpad mechanics, pump.fun bonding-curve fill with the 60% / 95% rules, survival signals and red flags. |
| Pre-collapse checklist | Domain IV — 10 signals | Tick what you observe. 3+ = distribution phase. Dev sell + LP removal = highest-confidence exit. Saved per token. |
| Warnings | All domains | Celebrity = exit signal, political window, absurdist no-anchor, launch-phase risk, BSC very-high risk, etc. |

The toolbar popup is a browsable reference of the whole domain map plus a quick manual
scorer and narrative classifier, and a switch to hide / show the panel.

The toolbar badge shows the current token's score, coloured by band.

## Sites it activates on

pump.fun · DexScreener · DEXTools · GMGN · Photon · BullX / Neo BullX · Axiom · Birdeye ·
four.meme · Moonshot · Dexlab · Solscan · Basescan · BscScan · GeckoTerminal · RugCheck ·
Jupiter · Raydium · Meteora · Uniswap · Trojan · Ston.fi · DeDust.

Each site has a URL adapter in `src/content/adapters.js` that extracts chain, launchpad and
token / pair address. On pages without a token (boards, home pages) the panel still offers
the manual checklists.

## Install (unpacked)

1. Clone this repo.
2. Open `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select the repo folder (the one containing `manifest.json`).
4. Visit a coin page, e.g. a pump.fun `/coin/<mint>` or DexScreener pair page.

Works in Chrome, Edge, Brave and other Chromium browsers. `npm run zip` builds a store-ready
archive in `dist/`.

## How signals are filled

| Signal | Points | Auto source |
| --- | --- | --- |
| Dev wallet >10% | +2 | Page text scrape (sites that show a dev %) or manual |
| Top-10 holders >50% | +2 | Page text scrape or manual |
| LP unlocked / removable | +2 | Page text ("LP burned / locked / unlocked") or manual |
| Vol/mcap >100% in 1h | +1 | DexScreener 1h volume ÷ market cap |
| Social velocity spike then drop | +1 | Manual |
| Contract age <24h | +1 | DexScreener pair creation time |
| Dev last trade <2h | +1 | Manual |

Unknown signals count 0 and are flagged so you verify them on the site. Click any signal row
to cycle auto → flagged → clear. Overrides and checklist ticks persist per token address in
`chrome.storage.local`.

## Layout

```
manifest.json                 MV3 manifest, site matches, permissions
src/shared/taxonomy.js        the research as structured data (all four domains)
src/shared/engine.js          pure decision functions: scoring, narrative, lifecycle, flags
src/content/adapters.js       per-site URL parsing + page-text scraping
src/content/panel.js          floating panel (shadow DOM), SPA navigation handling
src/content/panel.css         panel styles
src/background/service-worker.js  DexScreener fetch + cache, toolbar badge
src/popup/                    reference browser + quick scorer
tools/                        icon generator, syntax/manifest check, zip packager
test/                         node:test suites for engine and adapters
```

## Development

```
npm test        # engine + adapter + DexScreener normaliser tests (node >= 20, no dependencies)
npm run check   # parse every JS file, verify manifest references
npm run e2e     # browser test: loads the extension in Chromium (needs `npm i -D playwright`)
npm run icons   # regenerate icons/
npm run zip     # package dist/meme-coin-domain-map-<version>.zip
```

The browser test stubs the DexScreener network inside the service worker and serves mock
coin pages at the real site URLs, so it runs offline. It covers: service-worker input
validation, fetch + normalisation, pair→token fallback, SPA navigation detection, hostile
page text (no HTML injection, out-of-range values dropped), hostile API URLs dropped,
page-sourced labelling, collapse / side / hide controls, popup tabs and classifier, the
no-token empty state and storage key hygiene.

The engine and taxonomy are plain UMD modules so the same files run in content scripts, the
popup and node tests. Adding a narrative keyword, a chain or a signal is a data edit in
`src/shared/taxonomy.js`.

## Security notes

- Permissions are `storage` only, plus host access to `api.dexscreener.com`. No tabs, history
  or cookies access, no remote code, no inline scripts.
- Everything rendered comes through `textContent`; the panel never uses `innerHTML` with data.
- Token addresses and chains are shape-validated before they become storage keys or API
  paths, in both the content script and the service worker. The service worker rejects
  malformed messages and bounds its cache.
- The only outbound link is rendered when the API URL is `https://dexscreener.com/...`.
- Values scraped from the host page are labelled `page:` in the panel because a site can
  print anything. They can only fire a signal (raise the score), never clear one; a page
  value that would clear a signal is shown as an unverified hint instead.
- The panel renders in a closed shadow root and ignores synthetic events, so the host page
  cannot read, click or rewrite it.
- Wallet, profile and transaction pages on explorers are never looked up, so your own
  addresses are not sent to the API. Address patterns are anchored so hashes are never
  truncated into lookups.
- API responses are type-checked and length-capped; fetches time out after 10 s, bodies
  are capped at 2 MB, and concurrent requests for the same token are deduplicated.
- The page-text scraper is bounded to 50 KB and its patterns were checked for
  catastrophic backtracking.
- Per-token overrides are capped at 200 entries in `chrome.storage.local`.

## Limitations

- Market data comes from DexScreener's public API. Tokens still on a bonding curve are often
  not indexed yet, so age / mcap / volume show as unknown until graduation; the curve fill is
  read from the page instead.
- Holder concentration, dev wallet share, LP lock state and social velocity are not available
  from a free public endpoint for every chain. The panel scrapes them when the host site
  prints them and otherwise asks you to set them manually.
- Page scraping is heuristic and sites change their markup. If a value looks wrong, override it.
