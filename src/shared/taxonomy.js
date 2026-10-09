/*
 * Meme coin domain map — structured knowledge base.
 * Pure data, no side effects. Loaded in content scripts, the popup, the
 * service worker (importScripts) and node tests (module.exports).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MCT = Object.assign(root.MCT || {}, { taxonomy: api });
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------
  // DOMAIN I — narrative taxonomy
  // ---------------------------------------------------------------------
  var NARRATIVES = {
    'animal.canine': {
      id: 'animal.canine',
      label: 'Animal · canine',
      group: 'animal',
      examples: ['DOGE', 'SHIB', 'BONK', 'WIF'],
      keywords: ['dog', 'doge', 'shib', 'shiba', 'inu', 'bonk', 'wif', 'pup', 'puppy', 'floki', 'corgi', 'husky', 'hound', 'woof', 'bark', 'samoyed', 'pomeranian', 'dachshund', 'poodle', 'beagle', 'akita', 'dawg'],
      notes: 'Largest sub-category at 39.5% of non-DOGE meme mcap. DOGE and SHIB hold the narrative anchor. Derivatives outperform in bull rotation phases when the cycle restarts on low-cap entrants.',
      cycle: '1–3 weeks dominant narrative lifespan',
      rotationSlot: 1
    },
    'animal.feline': {
      id: 'animal.feline',
      label: 'Animal · feline',
      group: 'animal',
      examples: ['MEW', 'POPCAT', 'NYAN'],
      keywords: ['cat', 'kitty', 'kitten', 'meow', 'mew', 'popcat', 'nyan', 'feline', 'purr', 'tabby', 'michi', 'neko', 'kat'],
      notes: 'Emerges after dog saturation. Second slot in the animal rotation sequence.',
      cycle: '1–3 weeks dominant narrative lifespan',
      rotationSlot: 2
    },
    'animal.frog': {
      id: 'animal.frog',
      label: 'Animal · frog',
      group: 'animal',
      examples: ['PEPE', 'FROG'],
      keywords: ['frog', 'pepe', 'toad', 'ribbit', 'kek', 'apu', 'peepo', 'wojak'],
      notes: 'Culturally denser than canine. Requires external meme context. Third and final slot in the documented animal rotation.',
      cycle: '1–3 weeks dominant narrative lifespan',
      rotationSlot: 3
    },
    'animal.other': {
      id: 'animal.other',
      label: 'Animal · other',
      group: 'animal',
      examples: ['PNUT', 'MOODENG', 'GOAT'],
      keywords: ['squirrel', 'hippo', 'moodeng', 'pnut', 'penguin', 'pengu', 'bear', 'bull', 'ape', 'monkey', 'duck', 'bird', 'fish', 'shark', 'whale', 'wolf', 'fox', 'rat', 'mouse', 'hamster', 'capybara', 'turtle', 'snake', 'lion', 'tiger', 'panda', 'koala', 'sloth', 'otter', 'owl', 'goose', 'chicken', 'cow', 'pig', 'horse', 'donkey', 'bee', 'ant'],
      notes: 'Outside the documented dog → cat → frog rotation. Treat as event-driven: usually a single viral animal story with a short window.',
      cycle: 'days to 2 weeks',
      rotationSlot: null
    },
    political: {
      id: 'political',
      label: 'Political',
      group: 'political',
      examples: ['TRUMP', 'MAGA', 'BODEN', 'LIBRA'],
      keywords: ['trump', 'maga', 'biden', 'boden', 'kamala', 'harris', 'obama', 'musk', 'elon', 'doge gov', 'milei', 'libra', 'putin', 'vance', 'rfk', 'kennedy', 'election', 'vote', 'potus', 'president', 'senator', 'congress', 'republican', 'democrat', 'patriot', 'america', 'usa', 'freedom', 'tariff', 'melania', 'barron'],
      notes: 'Event-timed to election cycles, speeches, indictments. Very short window. Heavy insider pre-positioning documented. LIBRA collapse: -95% in 12 hours, $9M+ losses.',
      cycle: 'hours to days',
      rotationSlot: null
    },
    ai: {
      id: 'ai',
      label: 'AI / technology',
      group: 'ai',
      examples: ['GOAT', 'FARTCOIN', 'AI16Z'],
      keywords: ['ai', 'agent', 'gpt', 'llm', 'neural', 'bot', 'terminal', 'ai16z', 'eliza', 'zerebro', 'virtual', 'swarm', 'autonomous', 'sentient', 'agi', 'robot', 'cyber', 'quantum', 'compute', 'gpu', 'truth terminal', 'fartcoin', 'goatseus'],
      notes: 'Fastest growing sub-vertical. Longer cycle than political — weeks to months. 5 sub-types: experimental origin agents → semi-autonomous social agents → token-linked agents → AI DAOs → tokenized AI personas.',
      cycle: 'weeks to months',
      rotationSlot: null
    },
    'cultural.meme': {
      id: 'cultural.meme',
      label: 'Cultural · meme format',
      group: 'cultural',
      examples: ['MOG', 'GIGA', 'HPOS10I'],
      keywords: ['mog', 'giga', 'gigachad', 'chad', 'hpos', 'harrypotter', 'bitcoin', 'sigma', 'based', 'wojak', 'npc', 'doomer', 'brainrot', 'skibidi', 'rizz', 'gyatt', 'ohio', 'sus', 'amogus', 'among', 'troll', 'rage', 'cope', 'seethe', 'ngmi', 'wagmi', 'gm', 'retardio', 'autism'],
      notes: 'Internet-native context required. Resonance narrow but loyalty deep. Less manipulation than political / celebrity. Cultural death = narrative death, no recovery path.',
      cycle: 'tied to meme format lifespan',
      rotationSlot: null
    },
    celebrity: {
      id: 'celebrity',
      label: 'Celebrity derivative',
      group: 'celebrity',
      examples: ['HAWK', 'JENNER'],
      keywords: ['hawk', 'tuah', 'jenner', 'kardashian', 'kanye', 'ye', 'drake', 'bieber', 'swift', 'taylor', 'andrew tate', 'tate', 'logan', 'paul', 'mrbeast', 'beast', 'ronaldo', 'messi', 'lebron', 'snoop', 'cardi', 'nicki', 'iggy', 'azalea', 'caitlyn', 'dave portnoy', 'portnoy', 'official'],
      notes: 'Unauthorized or post-hype creation. Behavioral rule: celebrity announcement = exit signal, not entry signal. Median loss from peak: -95%.',
      cycle: 'hours to days',
      rotationSlot: null
    },
    'absurdist': {
      id: 'absurdist',
      label: 'Absurdist / no-theme',
      group: 'absurdist',
      examples: [],
      keywords: [],
      notes: 'Lowest research surface, highest manipulation rate. No narrative anchor means no organic recovery pathway.',
      cycle: 'hours',
      rotationSlot: null
    },
    'web3.gaming': {
      id: 'web3.gaming',
      label: 'Web3 / gaming narrative',
      group: 'web3',
      examples: [],
      keywords: ['game', 'gaming', 'play', 'p2e', 'metaverse', 'nft', 'guild', 'quest', 'rpg', 'arena', 'arcade', 'pixel', 'land', 'world', 'realm', 'dao', 'defi', 'protocol', 'chain', 'swap', 'stake', 'yield'],
      notes: 'Cross-ecosystem utility claim. Harder retail adoption due to complexity barrier.',
      cycle: 'weeks',
      rotationSlot: null
    }
  };

  var ROTATIONS = {
    animal: {
      id: 'animal',
      label: 'Sequence A — animal rotation',
      sequence: ['animal.canine', 'animal.feline', 'animal.frog'],
      lag: '24–48h between slots',
      notes: 'dog → [24–48h lag] → cat → [24–48h lag] → frog → [reset] → dog. When dog volume drops while cat volume rises, the 24–48h window to position in frog opens. Dominant narrative lifespan: 1–3 weeks.'
    },
    macro: {
      id: 'macro',
      label: 'Sequence B — macro narrative rotation',
      sequence: ['political', 'celebrity', 'ai'],
      lag: 'event-driven',
      notes: 'political → celebrity → AI / tech → political. Political spikes are event-timed. Celebrity is media-triggered. AI runs longer cycles tied to technology news.'
    },
    chain: {
      id: 'chain',
      label: 'Sequence C — chain liquidity migration',
      sequence: ['solana', 'base', 'bsc'],
      lag: '2–5 day migration window',
      notes: 'Solana ⇄ Base · BSC ⇄ Solana. When Solana fees spike or narrative crowds, liquidity migrates to Base and BSC. Solana recaptures capital after congestion clears.'
    }
  };

  // ---------------------------------------------------------------------
  // DOMAIN II — chain & launchpad taxonomy
  // ---------------------------------------------------------------------
  var CHAINS = {
    solana: { id: 'solana', label: 'Solana', launchpad: 'pump.fun', dex: 'Raydium / Meteora', finality: '400ms', fee: '~$0.001', culture: 'International, absurdist. Pump-heavy fast cycles.', risk: 'high' },
    bsc: { id: 'bsc', label: 'BSC', launchpad: 'four.meme', dex: 'PancakeSwap', finality: '~3s', fee: '~$0.05', culture: 'Chinese-speaking community, tight coordinated groups. Sharp spikes, fast collapse.', risk: 'very high' },
    ethereum: { id: 'ethereum', label: 'Ethereum', launchpad: 'Uniswap direct', dex: 'Uniswap', finality: '~12s', fee: '$5–50+ gas', culture: 'OG holders, slower retail entry. Gas-filtered.', risk: 'medium' },
    base: { id: 'base', label: 'Base', launchpad: 'Uniswap / BaseSwap', dex: 'Uniswap / Aerodrome', finality: '~2s', fee: '~$0.01', culture: 'Coinbase ecosystem, growing retail layer. ETH-correlated, moderate speed.', risk: 'high' },
    ton: { id: 'ton', label: 'TON', launchpad: 'Ston.fi / DeDust', dex: 'Ston.fi / DeDust', finality: '~5s', fee: 'low', culture: 'Telegram-native, CIS-community dominant. Community-coordinated cadence.', risk: 'high' }
  };

  var LAUNCHPADS = {
    pumpfun: {
      id: 'pumpfun', label: 'pump.fun', chain: 'solana',
      mechanics: 'Bonding curve. Total supply 1,000,000,000. Tokens on curve 800,000,000. Graduation threshold ~85 SOL raised. Graduation rate <2%. On graduation: Raydium LP seeded automatically. Fee 1% per trade.',
      rule: 'Positions after 60% curve fill carry dramatically worse risk/reward. 95%+ curve fill is a red flag entry.',
      survival: ['graduation'],
      totalSupply: 1e9, curveSupply: 8e8, graduationSol: 85, graduationRate: 0.02, feePct: 1
    },
    fourmeme: { id: 'fourmeme', label: 'four.meme', chain: 'bsc', mechanics: 'BSC equivalent of pump.fun. High-churn, low survival.', rule: 'four.meme + unknown dev + no community = red flag.', survival: [] },
    meteora: { id: 'meteora', label: 'Meteora', chain: 'solana', mechanics: 'Instant LP burn on launch. No rug possible on the pool.', rule: 'Higher survival signal.', survival: ['lp-burn'] },
    moonshot: { id: 'moonshot', label: 'Moonshot / MoonMaker', chain: 'solana', mechanics: 'Curated listing layer. Selective, smoother curve graduation.', rule: 'Curation is a survival signal.', survival: ['curation'] },
    uniswap: { id: 'uniswap', label: 'Uniswap direct', chain: 'ethereum', mechanics: 'Direct pool creation. No curve.', rule: 'Check LP lock and renounce manually.', survival: [] }
  };

  var LAUNCHPAD_SURVIVAL_SIGNALS = [
    'Meteora LP burn at launch',
    'Moonshot curation',
    'pump.fun graduation',
    'Liquidity lock >30 days',
    'Renounced contract post-graduation'
  ];

  var LAUNCHPAD_RED_FLAGS = [
    'No LP lock at launch',
    'four.meme + unknown dev + no community',
    'pump.fun token at 95%+ curve fill',
    'Duplicate ticker copy',
    'Contract not renounced 48h post-launch'
  ];

  // ---------------------------------------------------------------------
  // DOMAIN III — manipulation taxonomy (arxiv 2507.01963v2)
  // ---------------------------------------------------------------------
  var MANIPULATION = {
    source: 'arxiv 2507.01963v2',
    stats: '82.8% of high-return tokens show at least one suspicious indicator. $9.3M+ documented losses in the study sample. 500,000+ trades analyzed. 5 confirmed types.',
    types: [
      { id: 'ownership-concealment', label: 'Ownership concealment', detail: 'Insider wallets distribute tokens across many controlled addresses. Each looks like retail. A 5-wallet cluster each holding 2% functions as a single 10% insider position.' },
      { id: 'wash-trading', label: 'Wash trading', detail: 'Volume inflated by circular transactions between controlled wallets. Triggers algorithmic trending placement on tracking sites. Draws real retail into a manufactured market.' },
      { id: 'lpi', label: 'LP price inflation (LPI)', detail: 'Liquidity pool kept deliberately thin so small buys move price dramatically. Price screenshot goes to social. Outsiders buy, insiders sell into the added depth and exit.' },
      { id: 'pump-dump', label: 'Pump and dump', detail: 'Coordinated accumulation (<5 wallets holding 40%+) → timed hype campaign → price spike attracts retail → cascading insider distribution → collapse. Execution window: 6–72 hours.' },
      { id: 'rug', label: 'Rug pull', detail: 'Developer removes liquidity pool entirely. Hard rug: immediate LP removal, price to zero instantly. Soft rug: gradual token dumps without LP removal, slow bleed to zero. Most common in first 24h of launch.' }
    ]
  };

  // On-chain signal scoring model — 7 signals, 10-point composite scale.
  var SIGNALS = [
    { id: 'devHold', label: 'Dev wallet holds >10%', points: 2, auto: 'devPct' },
    { id: 'top10', label: 'Top-10 holder concentration >50%', points: 2, auto: 'top10Pct' },
    { id: 'lpUnlocked', label: 'LP unlocked / removable', points: 2, auto: 'lpLocked' },
    { id: 'volMcap', label: 'Vol/mcap >100% in 1h', points: 1, auto: 'volMcap1h' },
    { id: 'socialSpike', label: 'Social velocity spike then drop', points: 1, auto: null },
    { id: 'age', label: 'Contract age <24h', points: 1, auto: 'ageHours' },
    { id: 'devTrade', label: 'Dev last trade <2h ago', points: 1, auto: 'devLastTradeHours' }
  ];

  var SCORE_BANDS = [
    { min: 0, max: 2, id: 'full', label: 'Full size entry', note: 'Low red-flag density', color: '#22c55e' },
    { min: 3, max: 4, id: 'half', label: 'Half size entry', note: 'Elevated caution', color: '#eab308' },
    { min: 5, max: 7, id: 'skip', label: 'Skip', note: 'Manipulation profile too high', color: '#f97316' },
    { min: 8, max: 10, id: 'avoid', label: 'Do not engage', note: 'Confirmed anomaly cluster', color: '#ef4444' }
  ];

  var KOL_TIERS = [
    { id: 'A', label: 'Tier A — high signal', criteria: ['On-chain verifiable pre-position', 'Track record >6 months', 'Small audience <50K', 'Technical analysis included'], action: 'Rare valid signal.' },
    { id: 'B', label: 'Tier B — mixed', criteria: ['Mid-size audience 50K–500K', 'No verifiable on-chain position', 'Inconsistent hit rate', 'Possible paid promotion'], action: 'Discount heavily.' },
    { id: 'C', label: 'Tier C — sell signal', criteria: ['Large celebrity or macro account >1M followers', 'Coordinated multi-KOL call on same coin same day', 'Price already up >300% before call appears'], action: 'Celebrity tweets a coin = top signal, not buy signal.' }
  ];

  // ---------------------------------------------------------------------
  // DOMAIN IV — token lifecycle
  // ---------------------------------------------------------------------
  var LIFECYCLE = [
    { id: 'launch', label: 'Launch', window: 'hours 0–24', maxHours: 24, detail: 'Early snipers and bots enter first. Bonding curve fills rapidly. Social seeding begins. Highest risk window for dev wallet activity. Volume may be wash-traded.' },
    { id: 'accumulation', label: 'Accumulation', window: 'days 1–7', maxHours: 24 * 7, detail: 'If survived launch, organic community begins forming. Holder count grows. Narrative spreads to new channels. CTO patterns emerge here if dev exits early.' },
    { id: 'distribution', label: 'Distribution', window: 'days 7–30', maxHours: 24 * 30, detail: 'Insiders and early holders begin exiting. Price may hold or briefly pump to absorb selling. Top-holder concentration drops. The 10 pre-collapse signals cluster in this phase.' },
    { id: 'terminal', label: 'Collapse / stabilize', window: 'day 30+', maxHours: Infinity, detail: 'Terminal decline to near-zero OR stabilization if genuine community formed. <1% of tokens reach a stable community state. Zombie state most common: technically alive, no active market.' }
  ];

  var TERMINAL_STATES = [
    { id: 'dead', label: 'Dead', detail: 'Volume near zero, price near zero, contract exists but no activity.' },
    { id: 'sleeping', label: 'Sleeping', detail: 'No volume but holder base intact. Revival possible with catalyst.' },
    { id: 'evolving', label: 'Evolving', detail: 'Active community reforming, often via CTO. Uncertain outcome.' },
    { id: 'recovery', label: 'Recovery', detail: 'Organic community stabilized, genuine holder ecosystem. <1% reach this.' }
  ];

  var PRE_COLLAPSE_SIGNALS = [
    { id: 'devSell5', label: 'Dev wallet sells >5% of supply in a single transaction', key: true },
    { id: 'lpRemoval', label: 'LP removal begins (soft rug indicator)', key: true },
    { id: 'volDrop70', label: 'Volume drops >70% from 24h peak while price holds flat' },
    { id: 'socialDrop', label: 'Social channel activity drops below 10 msgs/hr from 100+' },
    { id: 'top5Exit', label: 'Top-5 holders show cascading exit pattern over 24–48h' },
    { id: 'rejection3', label: 'Price rejects same level 3+ times with declining volume' },
    { id: 'migration', label: '"Migration" or "v2" announcement from team' },
    { id: 'kolSilence', label: 'Influencer silence after active promotion (they are distributing)' },
    { id: 'spuriousPr', label: 'Spurious positive PR around the time of insider selling' },
    { id: 'flatSocial', label: 'Token age >7 days with no community catalyst and flat social' }
  ];

  var PRE_COLLAPSE_RULES = {
    distributionThreshold: 3,
    window: '48 hours',
    rule: '3+ signals concurrent in a 48-hour window = treat as distribution phase.',
    highestConfidence: 'Dev wallet sell + LP reduction simultaneously = highest-confidence exit signal.'
  };

  var ARCHETYPES = [
    { id: 'organic', label: 'Community-built (organic)', detail: 'Holder base builds gradually over days, not hours. Diverse wallet ownership from launch, no insider cluster. Genuine social engagement. Lower peak than manipulated coins but longer duration.', examples: ['early BONK', 'WIF'], rule: 'Longest-duration archetype.' },
    { id: 'celebrity', label: 'Celebrity launch', detail: 'TRUMP: -95% from peak, insider pre-positioning documented. MELANIA: launched 3 days after TRUMP, coordinated sequence. LIBRA: -95% in 12h, $9M+ losses. HAWK: classic distribution pattern.', examples: ['TRUMP', 'MELANIA', 'LIBRA', 'HAWK'], rule: 'Celebrity announcement = exit signal, not entry.' },
    { id: 'cto', label: 'CTO (community takeover)', detail: 'Triggered when dev abandons token (wallet sells, comms go silent). Success requires: locked LP + diverse supply + real leadership. Failure rate very high — most CTOs collapse within 7 days.', examples: [], rule: 'Survival signals: new dev doxxed, new roadmap, social rebuild from scratch. Critical check: is LP still accessible to original dev after CTO?' },
    { id: 'ai-agent', label: 'AI agent coins', detail: '5-stage evolution: 1. experimental origin agents (no token) → 2. semi-autonomous social agents (Truth Terminal → GOAT) → 3. token-linked agents → 4. AI DAOs (ai16z) → 5. tokenized AI personas.', examples: ['GOAT', 'AI16Z'], rule: 'Longest cycle sub-type. Weeks to months vs hours to days for other archetypes.' },
    { id: 'kol-seeded', label: 'KOL-seeded launch', detail: 'Influencer holds pre-position before public announcement. Call creates buy volume, influencer sells into it. Pattern: volume spike immediately on call, then distribution.', examples: [], rule: 'Large KOL (>500K) = shorter window, higher extraction rate. Small niche KOL with on-chain verifiable entry = rare valid signal.' }
  ];

  return {
    NARRATIVES: NARRATIVES,
    ROTATIONS: ROTATIONS,
    CHAINS: CHAINS,
    LAUNCHPADS: LAUNCHPADS,
    LAUNCHPAD_SURVIVAL_SIGNALS: LAUNCHPAD_SURVIVAL_SIGNALS,
    LAUNCHPAD_RED_FLAGS: LAUNCHPAD_RED_FLAGS,
    MANIPULATION: MANIPULATION,
    SIGNALS: SIGNALS,
    SCORE_BANDS: SCORE_BANDS,
    KOL_TIERS: KOL_TIERS,
    LIFECYCLE: LIFECYCLE,
    TERMINAL_STATES: TERMINAL_STATES,
    PRE_COLLAPSE_SIGNALS: PRE_COLLAPSE_SIGNALS,
    PRE_COLLAPSE_RULES: PRE_COLLAPSE_RULES,
    ARCHETYPES: ARCHETYPES
  };
});
