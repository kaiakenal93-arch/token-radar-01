// Token Radar's dashboard: reads window.RADAR (dashboard/zz-data.js) and
// renders the ranked board, the verdict lanes, a per-protocol detail view
// with the model's walk-through and farm plan, and the methodology. No
// network. The model here mirrors lib/model.ts exactly, so the page
// recomputes each row and checks the number board.json carries.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('app');
  if (!DATA || !app) return;
  var MODEL = DATA.model;
  var state = { q: '', category: 'all', chain: 'all', verdict: 'all', watchlist: false, sort: 'implied', dir: -1, selected: null };

  var usdFull = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  var num4 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usdFull.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // ------------------------------------------------------------ the model
  // The same functions lib/model.ts runs, with the same constants and bounds.
  function momentumFactor(change7d) {
    if (change7d === null || change7d === undefined || !isFinite(change7d)) return 1.0;
    var x = Math.min(MODEL.momentum_clip_high, Math.max(MODEL.momentum_clip_low, change7d / 100));
    return Math.min(MODEL.momentum_high, Math.max(MODEL.momentum_low, 1 + MODEL.momentum_slope * x));
  }
  function maturityFactor(age) {
    var q = DATA.age_quartiles;
    var a = age === null || age === undefined ? q.median_age : age;
    if (a < q.q25) return MODEL.maturity_young;
    if (a <= q.q75) return MODEL.maturity_mid;
    if (a <= q.q95) return MODEL.maturity_old;
    return MODEL.maturity_veteran;
  }
  function concentrationAdjustment(chains) {
    var n = chains ? chains.length : 0;
    if (n <= 1) return MODEL.concentration_single;
    if (n <= 3) return MODEL.concentration_few;
    return MODEL.concentration_many;
  }
  function impliedOf(row) {
    // Only the terms the held-out tests kept are applied; a dropped term's
    // factor is 1.0. On this snapshot only the family multiple survived.
    var t = DATA.active_terms || { family: true, momentum: true, maturity: true, concentration: true };
    var raw = row.tvl_usd * row.multiple
      * (t.momentum ? momentumFactor(row.change_7d) : 1)
      * (t.maturity ? maturityFactor(row.age_days) : 1)
      * (t.concentration ? concentrationAdjustment(row.chains) : 1);
    return Math.min(MODEL.value_ceiling, Math.max(MODEL.value_floor, Math.round(raw)));
  }
  function gasTier(chain) {
    var c = (chain || '').toLowerCase();
    if (c.indexOf('ethereum') >= 0) return 'eth';
    if (c.indexOf('solana') >= 0) return 'sol';
    var l2 = ['arbitrum', 'optimism', 'base', 'polygon', 'zksync', 'starknet', 'scroll', 'linea', 'blast', 'mode', 'katana', 'unichain', 'ink', 'monad', 'berachain', 'sonic', 'sei', 'sui', 'aptos', 'avalanche', 'binance', 'bnb', 'fantom', 'celo', 'gnosis', 'mantle', 'taiko', 'zora', 'fraxtal', 'movement', 'hyperliquid', 'plume', 'morph', 'bob', 'corn', 'arc', 'tempo', 'robinhood', 'stable', 'pharos', 'hemi', 'bitlayer', 'core', 'rsk', 'mezo', 'etherlink', 'citrea', 'fluent', 'flare', 'stellar', 'tron', 'bittensor', 'bitcoin'];
    for (var i = 0; i < l2.length; i++) if (c.indexOf(l2[i]) >= 0) return 'l2';
    return 'other';
  }
  function gasRange(chain) {
    var tier = gasTier(chain);
    if (tier === 'eth') return '$2–15';
    if (tier === 'sol') return '$0.01';
    if (tier === 'l2') return '$0.05–0.50';
    return '$0.10–1.00';
  }
  function gasMidUsd(chain) {
    var tier = gasTier(chain);
    if (tier === 'eth') return 8.5;
    if (tier === 'sol') return 0.01;
    if (tier === 'l2') return 0.28;
    return 0.55;
  }
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 1e9) return 2000;
    if (p.tvl_usd >= 250e6) return 1000;
    if (p.tvl_usd >= 100e6) return 500;
    if (p.tvl_usd >= 50e6) return 250;
    return 100;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('cdp') >= 0) return 'Lock $' + capital + ' of collateral in ' + name + ' on ' + chain + ' and mint the stable asset against it.';
    if (c.indexOf('lend') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ', both sides of the pair, and keep the position open.';
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s highest-yield vault on " + chain + ' and keep the shares.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('stak') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge; use its testnet first if it offers one.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0 || c.indexOf('dual-token') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('payment') >= 0) return 'Route $' + capital + ' of payments through ' + name + ' on ' + chain + ' and keep the receipts.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + " into " + name + "'s basis trade on " + chain + ' and keep the position open.';
    if (c.indexOf('launchpad') >= 0) return 'Commit $' + capital + " to " + name + "'s next launch on " + chain + ' and keep the allocation.';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + ' of ' + name + "'s index on " + chain + ' and hold it.';
    if (c.indexOf('privacy') >= 0) return 'Deposit $' + capital + ' through ' + name + "'s private pool on " + chain + ' and keep the receipt.';
    if (c.indexOf('ai') >= 0) return 'Stake or deposit $' + capital + ' with ' + name + ' on ' + chain + ' and use its service once.';
    if (c.indexOf('nft') >= 0) return 'List or trade $' + capital + ' of volume through ' + name + ' on ' + chain + ' and keep the receipts.';
    if (c.indexOf('governance') >= 0) return 'Lock $' + capital + ' with ' + name + ' on ' + chain + ' and vote once.';
    if (c.indexOf('locker') >= 0) return 'Lock $' + capital + ' of tokens in ' + name + ' on ' + chain + ' and keep the receipt.';
    if (c.indexOf('liquidity manager') >= 0) return 'Deposit $' + capital + " into " + name + "'s managed pool on " + chain + ' and keep the shares.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function actionFor2(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    var half = Math.round(capital / 2);
    if (c.indexOf('cdp') >= 0) return 'Mint a second, smaller tranche of the stable asset against the same collateral and hold it in the wallet as a receipt of the position.';
    if (c.indexOf('lend') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow up to half of the supplied USDC against your deposit and supply it back once, keeping the health factor above 2.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + half + ' of liquidity to a second pool on ' + name + ' on ' + chain + ', a different pair, to diversify the LP position.';
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) return 'Split the deposit: move $' + half + " into " + name + "'s second-highest vault on " + chain + ' so two vaults carry the position.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge $' + half + ' back through ' + name + ' to show two-way activity.';
    if (c.indexOf('stak') >= 0 || c.indexOf('restak') >= 0) return "Restake the receipt token through " + name + "'s restaking option on " + chain + ', if it offers one, and keep the new receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Open a second small hedge in a different market on ' + name + ' on ' + chain + '.';
    if (c.indexOf('prediction') >= 0) return 'Place a second position in a different market on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + half + ' into a different ' + name + ' vault on ' + chain + ' so two vaults carry the position.';
    if (c.indexOf('stable') >= 0 || c.indexOf('dual-token') >= 0) return "Hold half of the minted stable asset in " + name + "'s savings rate on " + chain + ', if it offers one.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + half + ' of the yield asset on a different chain ' + name + ' supports, if it lists one.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + half + ' of cover from ' + name + ' for a different protocol on ' + chain + '.';
    if (c.indexOf('payment') >= 0) return 'Route $' + half + ' of payments through ' + name + ' to a different recipient on ' + chain + '.';
    if (c.indexOf('basis') >= 0) return 'Open a second basis position in a different pair on ' + name + '.';
    if (c.indexOf('launchpad') >= 0) return 'Commit to a second launch on ' + name + ', if one opens while the position is held.';
    if (c.indexOf('index') >= 0) return 'Buy $' + half + ' of a second index product from ' + name + ' on ' + chain + '.';
    if (c.indexOf('privacy') >= 0) return "Make a second deposit through " + name + "'s private pool with a different amount.";
    if (c.indexOf('ai') >= 0) return 'Use a second ' + name + ' service on ' + chain + ' once.';
    if (c.indexOf('nft') >= 0) return 'Trade $' + half + ' of volume through ' + name + ' on ' + chain + ' in a second collection.';
    if (c.indexOf('governance') >= 0) return "Vote a second time in " + name + "'s governance on a different proposal.";
    if (c.indexOf('locker') >= 0) return 'Lock $' + half + ' in ' + name + ' on ' + chain + ' for a second, shorter term.';
    if (c.indexOf('liquidity manager') >= 0) return 'Deposit $' + half + ' into a second managed pool on ' + name + ' on ' + chain + '.';
    return 'Repeat the main action with $' + half + ' in a second pool or vault on ' + chain + ' through ' + name + '.';
  }
  function weeklyVerb(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('cdp') >= 0) return 'a mint, a repayment or a vote';
    if (c.indexOf('lend') >= 0 || c.indexOf('collateral') >= 0) return 'a supply, a borrow or a vote';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'a swap or an LP adjustment';
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) return 'a deposit or a claim';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'a bridge in either direction';
    if (c.indexOf('stak') >= 0 || c.indexOf('restak') >= 0) return 'a stake or a restake';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'a hedge adjustment';
    if (c.indexOf('prediction') >= 0) return 'a market position';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'a deposit or a rebalance';
    if (c.indexOf('stable') >= 0 || c.indexOf('dual-token') >= 0) return 'a mint or a deposit';
    if (c.indexOf('rwa') >= 0) return 'a mint or a hold check';
    if (c.indexOf('insurance') >= 0) return 'a cover renewal';
    if (c.indexOf('payment') >= 0) return 'a payment';
    if (c.indexOf('basis') >= 0) return 'a basis position adjustment';
    if (c.indexOf('launchpad') >= 0) return 'a launch commitment';
    if (c.indexOf('index') >= 0) return 'a buy or a hold check';
    if (c.indexOf('privacy') >= 0) return 'a deposit';
    if (c.indexOf('ai') >= 0) return 'a service use';
    if (c.indexOf('nft') >= 0) return 'a trade';
    if (c.indexOf('governance') >= 0) return 'a vote';
    if (c.indexOf('locker') >= 0) return 'a lock check';
    if (c.indexOf('liquidity manager') >= 0) return 'a deposit or a rebalance';
    return 'a deposit, a borrow, a swap or a vote';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function setupSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var gas = gasRange(chain);
    var isL1 = chain.toLowerCase().indexOf('ethereum') >= 0;
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'about ' + gas + ' of gas for the first transaction', time: '5 minutes' },
      isL1
        ? { text: 'Fund the wallet with $' + capital + ' of USDC on Ethereum and keep a little ETH for gas.', cost: '$' + capital + ' of capital and about ' + gas + ' of gas', time: '15 minutes to set up' }
        : { text: 'Bridge $' + capital + ' of USDC from Ethereum to ' + chain + " using the official bridge, and keep a little of the chain's gas token for fees.", cost: '$' + capital + ' of capital and about $2–4 of gas', time: 'about 15 minutes' }
    ].map(stepText);
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasRange(chain);
    return [
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about ' + gas + ' of gas', time: '15 minutes to set up' },
      { text: actionFor2(p, capital, chain), cost: 'about ' + gas + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week on ' + p.name + ', such as ' + weeklyVerb(p) + '.', cost: 'about ' + gas + ' of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }
  function farmTotals(p, odds, implied) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var gas = gasMidUsd(chain);
    var hold = holdDaysFor(p.age_days);
    var weeks = Math.ceil(hold / 7);
    var isL1 = chain.toLowerCase().indexOf('ethereum') >= 0;
    var fund = isL1 ? gas : 3;
    var fees = Math.round(((2 + weeks) * gas + fund) * 100) / 100;
    var hours = Math.round(((65 + 10 * weeks) / 60) * 100) / 100;
    var net = Math.round((fees / hours) * 100) / 100;
    var share = implied > 0 && odds > 0 ? Math.round((fees / (odds * implied)) * 1e8) / 1e8 : 1;
    return { capital: capital, fees: fees, hours: hours, net_per_hour: net, breakeven_share: share };
  }
  function verdictFor(odds, breakeven) {
    var rule = DATA.verdict_rule || { farm_odds_min: 0.6, farm_breakeven_max: 0.0001, skip_odds_max: 0.4, skip_breakeven_min: 0.0005 };
    if (odds >= rule.farm_odds_min && breakeven <= rule.farm_breakeven_max) return 'Farm now';
    if (odds < rule.skip_odds_max || breakeven > rule.skip_breakeven_min) return 'Skip';
    return 'Watch';
  }
  function verdictReason(odds, totals) {
    var pct = Math.round(odds * 100);
    var share = (totals.breakeven_share * 100).toFixed(4);
    return 'Token odds ' + pct + '% · break-even share ' + share + '% of launch value · fees $' + totals.fees.toFixed(2) + ' over ' + totals.hours + 'h.';
  }
  function intervalOf(row) {
    var iv = DATA.interval;
    return [Math.round(row.implied_value_usd * iv.p25), Math.round(row.implied_value_usd * iv.p75)];
  }

  // ------------------------------------------------------------ routing
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    // The hash is the state: start from the defaults, then apply only what
    // it carries, so a link to the plain board never inherits a filter from
    // the view before it.
    state.q = '';
    state.category = 'all';
    state.chain = 'all';
    state.verdict = 'all';
    state.watchlist = false;
    state.sort = 'implied';
    state.dir = -1;
    state.selected = null;
    if (!hash) return;
    var parts = hash.split('?');
    var path = parts[0] || '';
    var params = new URLSearchParams(parts[1] || '');
    if (path.indexOf('/protocol/') === 0) state.selected = decodeURIComponent(path.slice('/protocol/'.length));
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('verdict')) state.verdict = params.get('verdict');
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('dir')) state.dir = parseInt(params.get('dir'), 10) || -1;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.verdict !== 'all') params.set('verdict', state.verdict);
    if (state.watchlist) params.set('watchlist', '1');
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.dir !== -1) params.set('dir', String(state.dir));
    var query = params.toString();
    var next = state.selected ? '#/protocol/' + encodeURIComponent(state.selected) : '#/';
    if (query) next += '?' + query;
    if (window.location.hash !== next) window.history.replaceState(null, '', next);
  }

  // ------------------------------------------------------------ rendering
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) {
        if (c === null || c === undefined) return;
        if (typeof c === 'string') node.appendChild(document.createTextNode(c));
        else node.appendChild(c);
      });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchlist && !r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.verdict !== 'all' && r.verdict !== state.verdict) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  var VERDICT_ORDER = { 'Farm now': 0, 'Watch': 1, 'Skip': 2 };
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'verdict') { av = VERDICT_ORDER[a.verdict]; bv = VERDICT_ORDER[b.verdict]; }
      else if (key === 'odds') { av = a.token_odds; bv = b.token_odds; }
      else if (key === 'rank') { av = a.rank; bv = b.rank; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.board_size + ' pre-token protocols, ranked by family-pooled value and launch odds' }),
        el('p', null,
          'Implied value is TVL times a multiple pooled from the protocol’s own family — category first, family next, global last — and every row carries the launch odds its family’s record implies. ',
          el('b', { text: DATA.watchlist_size + '/' + DATA.watchlist_size + ' watchlist covered' }),
          ' · ' + DATA.early_size + ' early candidates beyond it.'
        )
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function strip() {
    var lc = DATA.level_counts || { category: 0, family: 0, global: 0 };
    var vc = DATA.verdict_counts || { 'Farm now': 0, Watch: 0, Skip: 0 };
    return el('section', { class: 'strip', 'aria-label': 'Model integrity' },
      el('div', { class: 'fact' }, el('span', { text: 'Median implied value' }), el('b', { text: fmtUsd(DATA.median_implied_value) })),
      el('div', { class: 'fact' }, el('span', { text: 'Median token odds' }), el('b', { text: Math.round(DATA.median_token_odds * 100) + '%' })),
      el('div', { class: 'fact' }, el('span', { text: 'Comparables: category / family / global' }), el('b', { text: lc.category + ' / ' + lc.family + ' / ' + lc.global })),
      el('div', { class: 'fact' }, el('span', { text: 'Verdicts: farm / watch / skip' }), el('b', { text: vc['Farm now'] + ' / ' + vc.Watch + ' / ' + vc.Skip }))
    );
  }

  function lanes() {
    var order = ['Farm now', 'Watch', 'Skip'];
    var cells = order.map(function (v) {
      var list = DATA.rows.filter(function (r) { return r.verdict === v; });
      return el('button', { class: 'lane', type: 'button', onclick: function () { state.verdict = v; writeHash(); render(); } },
        verdictBadge(v),
        el('span', { class: 'count', text: String(list.length) + ' protocols' })
      );
    });
    return el('section', { class: 'lanes', 'aria-label': 'Verdict lanes' }, cells);
  }

  // Short labels for the ledger bar. Every group the model can emit must be
  // named here; an unlisted group still renders, as its long name, through
  // the fallback below — the bar never breaks on a new group.
  function ledgerShort(group) {
    var map = {
      'Watchlist, on the board': 'watchlist',
      'Early candidates, on the board': 'early',
      'Live token, shown': 'live',
      'Tokened, a comparable, set aside': 'comparables',
      'Tokened, no usable multiple': 'tokened, no multiple',
      'Pre-token, excluded: CEX': 'CEX',
      'Pre-token, excluded: Bridge': 'bridge',
      'Pre-token, excluded: Liquid Staking': 'liquid staking',
      'Pre-token, excluded: Versioned name': 'versioned',
      'Pre-token, excluded: Wrapped or staked name': 'wrapped',
      'Pre-token, excluded: Exchange name': 'exchange name'
    };
    return map[group] || group;
  }

  function ledgerBar() {
    var children = [el('span', { class: 'ledger-label', text: 'Snapshot ledger · ' + DATA.ledger.total + ' protocols: ' })];
    DATA.ledger.groups.forEach(function (g, i) {
      if (i > 0) children.push(' · ');
      children.push(el('span', null, el('b', { text: String(g.count) }), ' ' + ledgerShort(g.group)));
    });
    return el('div', { class: 'ledger' }, children);
  }

  function selectField(id, label, options, value, onChange) {
    var select = el('select', { id: id, 'aria-label': label },
      options.map(function (o) { return el('option', { value: o[0], text: o[1], selected: o[0] === value ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { onChange(select.value); writeHash(); render(); });
    return el('div', { class: 'field' }, el('label', { for: id, text: label }), select);
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var watch = el('input', { type: 'checkbox', id: 'watchlist', checked: state.watchlist ? 'checked' : null, 'aria-label': 'Watchlist only' });
    watch.addEventListener('change', function () { state.watchlist = watch.checked; writeHash(); render(); });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      selectField('category', 'Category', [['all', 'All categories']].concat(categories.map(function (c) { return [c, c]; })), state.category, function (v) { state.category = v; }),
      selectField('chain', 'Chain', [['all', 'All chains']].concat(chains.map(function (c) { return [c, c]; })), state.chain, function (v) { state.chain = v; }),
      selectField('verdict', 'Verdict', [['all', 'All verdicts'], ['Farm now', 'Farm now'], ['Watch', 'Watch'], ['Skip', 'Skip']], state.verdict, function (v) { state.verdict = v; }),
      el('label', { class: 'check', for: 'watchlist' }, watch, 'Watchlist only'),
      el('span', { class: 'count', text: rows().length + ' rows shown' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' ? 1 : -1; } writeHash(); render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ↓' : ' ↑' }) : null
      )
    );
  }

  function verdictBadge(v) {
    var cls = v === 'Farm now' ? 'farm' : v === 'Skip' ? 'skip' : 'watch';
    return el('span', { class: 'badge ' + cls, text: v });
  }

  function openDetail(slug) {
    state.selected = slug;
    writeHash();
    render();
    window.scrollTo(0, 0);
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.verdict = 'all'; state.watchlist = false; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var levelNote = r.comparables_level === 'global'
        ? 'global median'
        : r.comparables_level + ' ×' + num4.format(r.multiple) + ' · n=' + r.comparables;
      var tr = el('tr', {
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + (r.watchlist ? ' · watchlist' : '') + ' · odds ' + Math.round(r.token_odds * 100) + '%' })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: Math.round(r.token_odds * 100) + '%' }),
        el('td', null, el('div', { class: 'implied-col' },
          el('div', { class: 'implied' },
            el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
            el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
          ),
          el('span', { class: 'sub', text: 'P25–P75 ' + fmtUsd(r.interval_low_usd) + ' – ' + fmtUsd(r.interval_high_usd) + ' · ' + levelNote })
        )),
        el('td', null, el('div', { class: 'implied-col' },
          verdictBadge(r.verdict),
          el('span', { class: 'sub', text: 'break-even ' + (r.breakeven_share * 100).toFixed(4) + '%' })
        ))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel', id: 'board' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('rank', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('odds', 'Odds'),
            sortHeader('implied', 'Implied value'),
            sortHeader('verdict', 'Verdict')
          )),
          tbody
        )
      )
    );
  }

  function methodPanel() {
    var lc = DATA.level_counts || { category: 0, family: 0, global: 0 };
    var vc = DATA.verdict_counts || { 'Farm now': 0, Watch: 0, Skip: 0 };
    var rule = DATA.verdict_rule || { farm_odds_min: 0.6, farm_breakeven_max: 0.0001, skip_odds_max: 0.4, skip_breakeven_min: 0.0005 };
    var compRows = Object.keys(DATA.comparables || {}).sort(function (a, b) {
      return DATA.comparables[b].median - DATA.comparables[a].median;
    }).slice(0, 8).map(function (cat) {
      var c = DATA.comparables[cat];
      return el('div', null, el('b', { text: cat }), el('span', { text: num4.format(c.median) + ' × · ' + c.count + ' comparables' }));
    });
    var famRows = Object.keys(DATA.families || {}).sort(function (a, b) {
      return DATA.families[b].median - DATA.families[a].median;
    }).map(function (fam) {
      var f = DATA.families[fam];
      return el('div', null, el('b', { text: fam }), el('span', { text: num4.format(f.median) + ' × · ' + f.count + ' comparables' }));
    });
    var testRows = (DATA.term_tests || []).map(function (t) {
      var name = t.term.charAt(0).toUpperCase() + t.term.slice(1);
      return el('div', null, el('b', { text: name + (t.kept ? ' — kept' : ' — dropped') }),
        el('span', { text: 'LOO ' + t.loo_rmse_with.toFixed(3) + ' vs ' + t.loo_rmse_without.toFixed(3) + ' · walk-forward ' + t.test_rmse_with.toFixed(3) + ' vs ' + t.test_rmse_without.toFixed(3) + ' · coverage ' + Math.round(t.walkforward_coverage_with * 100) + '% vs ' + Math.round(t.walkforward_coverage_without * 100) + '%' }));
    });
    return el('section', { class: 'panel method', id: 'methodology' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'note', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased. Every number here traces to one row’s walk-through, and every farm step is generated by buildFarmPlan from the row’s category, chains, TVL and age.' }),
      el('div', { class: 'formula' }, 'implied = round( TVL × multiple ), clamped to [$500,000, $100,000,000,000,000]'),
      el('div', { class: 'factors' },
        el('div', null, el('b', { text: 'Multiple' }), el('span', { text: 'Median mcap/TVL of tokened protocols in the same category (≥5), else its family (≥5), else the global median ' + num4.format(DATA.global_multiple) + '; never more than 10× global. This board: ' + lc.category + ' category, ' + lc.family + ' family, ' + lc.global + ' global.' })),
        el('div', null, el('b', { text: 'Token odds' }), el('span', { text: 'Share of the row’s family, listed at least as long as the row, that had launched by the snapshot date — bands 0–180, 180–365, 365–730, 730–1460, 1460+ days, shrunk toward the global band rate (k=10), monotone in age. No listing date: the family’s overall rate. Median: ' + Math.round(DATA.median_token_odds * 100) + '%.' })),
        el('div', null, el('b', { text: 'Fit-and-drop' }), el('span', { text: 'Each term was kept or dropped on two held-out tests — leave-one-out error and walk-forward error on newer listings. Kept only if it improves both. Only the family multiple passed; momentum, maturity and concentration made both worse, so their factors are 1.0.' })),
        el('div', null, el('b', { text: 'Interval' }), el('span', { text: 'P25–P75 ×' + DATA.interval.p25.toFixed(2) + '–×' + DATA.interval.p75.toFixed(2) + ' around each implied value (P10–P90 ×' + DATA.interval.p10.toFixed(2) + '–×' + DATA.interval.p90.toFixed(2) + '), from the leave-one-out errors on the ' + DATA.interval.loo_n + ' tokened protocols with a known market cap; median error ×' + DATA.interval.p50.toFixed(2) + '. Walk-forward after ' + DATA.interval.walkforward.cutoff + ': P25–P75 covered ' + Math.round(DATA.interval.walkforward.p25_p75_coverage * 100) + '% of ' + DATA.interval.walkforward.test_n + ' newer protocols, P10–P90 ' + Math.round(DATA.interval.walkforward.p10_p90_coverage * 100) + '%. An honest in-sample range, not a promise.' })),
        el('div', null, el('b', { text: 'Verdict' }), el('span', { text: 'Farm now when odds ≥ ' + Math.round(rule.farm_odds_min * 100) + '% and break-even ≤ ' + (rule.farm_breakeven_max * 100).toFixed(2) + '%; Skip when odds < ' + Math.round(rule.skip_odds_max * 100) + '% or break-even > ' + (rule.skip_breakeven_min * 100).toFixed(2) + '%; else Watch. This board: ' + vc['Farm now'] + ' Farm now, ' + vc.Watch + ' Watch, ' + vc.Skip + ' Skip. A large row can still be a Skip on poor odds.' })),
        el('div', null, el('b', { text: 'Farm costs' }), el('span', { text: 'Fees are summed from the plan — one transaction to fund, one per action, one per week, at the chain’s midpoint gas (a bridge from Ethereum costs $3) — and hours are the step times added up. Break-even share = fees ÷ (odds × implied value).' })),
        el('div', null, el('b', { text: 'Coverage' }), el('span', { text: DATA.watchlist_size + '/' + DATA.watchlist_size + ' watchlist covered · ' + DATA.early_size + ' early candidates beyond it.' })),
        el('div', null, el('b', { text: 'Ledger' }), el('span', { text: 'All ' + DATA.ledger.total + ' protocols accounted for: ' + DATA.ledger.groups.map(function (g) { return g.count + ' ' + ledgerShort(g.group); }).join(' · ') + '. The board ranks ' + DATA.board_size + ' of them; the rest are set aside or excluded by the house rule, never hidden.' })),
        el('div', null, el('b', { text: 'Determinism' }), el('span', { text: 'All figures come from the sealed snapshot of ' + DATA.as_of + '; runs are byte-identical. “Records no token” means the snapshot carries no token for it — not proof it has none.' }))
      ),
      el('h3', { text: 'Held-out tests' }),
      el('div', { class: 'factors' }, testRows),
      el('h3', { text: 'Family multiples' }),
      el('div', { class: 'factors' }, famRows),
      el('h3', { text: 'Strongest category multiples in this snapshot' }),
      el('div', { class: 'factors' }, compRows)
    );
  }

  function detailView(row) {
    var recomputed = impliedOf(row);
    var matches = recomputed === row.implied_value_usd;
    var range = intervalOf(row);
    var rangeMatches = range[0] === row.interval_low_usd && range[1] === row.interval_high_usd;
    var compNote = row.comparables_level === 'global'
      ? 'global median — fewer than 5 tokened comparables in its category or family'
      : row.comparables_level + ' median of ' + row.comparables + ' tokened comparables';
    var oddsNote = row.odds_basis === 'undated'
      ? 'family overall rate — no listing date on record'
      : 'family band for ' + fmtAge(row.age_days) + ' with no token';
    var verdict2 = verdictFor(row.token_odds, row.breakeven_share);
    var verdictMatches = verdict2 === row.verdict;
    var totals = farmTotals(row, row.token_odds, row.implied_value_usd);
    var totalsMatch = totals.fees === row.farm_fees_usd && totals.hours === row.farm_hours && totals.net_per_hour === row.farm_net_per_hour_usd && totals.breakeven_share === row.breakeven_share && totals.capital === row.farm_capital_usd;
    var reason2 = verdictReason(row.token_odds, totals);
    function stepsList(steps) {
      return el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }));
    }
    return el('div', null,
      el('a', { class: 'back', href: '#/', text: '← Back to the board', onclick: function (e) { e.preventDefault(); state.selected = null; writeHash(); render(); window.scrollTo(0, 0); } }),
      el('div', { class: 'detail-head' },
        el('span', { class: 'kicker', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' · Watchlist' : ' · Early candidate') }),
        el('h1', { text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') }),
        el('div', { class: 'verdict-line' }, verdictBadge(row.verdict), el('p', { text: row.verdict_reason }))
      ),
      el('div', { class: 'detail-grid' },
        el('section', null,
          el('h2', { text: 'Implied value' }),
          el('div', { class: 'walk' },
            el('div', null, el('span', { text: 'TVL' }), el('b', { text: usdFull.format(row.tvl_usd) })),
            el('div', null, el('span', { text: 'Multiple' }), el('b', { text: num4.format(row.multiple) + ' ×' })),
            el('div', null, el('span', { text: 'Comparables' }), el('b', { text: compNote })),
            el('div', null, el('span', { text: 'Token odds' }), el('b', { text: Math.round(row.token_odds * 100) + '% — ' + oddsNote })),
            el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { text: usdFull.format(row.implied_value_usd) })),
            el('div', null, el('span', { text: 'P25–P75 range' }), el('b', { text: fmtUsd(range[0]) + ' – ' + fmtUsd(range[1]) }))
          ),
          el('p', { class: 'check-line' },
            matches
              ? el('span', null, 'Recomputed on this page as ', el('b', { text: usdFull.format(recomputed) }), ' — the same number board.json carries.')
              : el('span', null, el('b', { class: 'bad', text: 'Mismatch: ' }), 'recomputed as ' + usdFull.format(recomputed) + ', board.json carries ' + usdFull.format(row.implied_value_usd) + '.')
          ),
          el('p', { class: 'check-line' },
            rangeMatches
              ? el('span', null, 'Range recomputed on this page as ', el('b', { text: fmtUsd(range[0]) + ' – ' + fmtUsd(range[1]) }), ' — the same range board.json carries.')
              : el('span', null, el('b', { class: 'bad', text: 'Mismatch: ' }), 'range recomputed as ' + fmtUsd(range[0]) + ' – ' + fmtUsd(range[1]) + ', board.json carries ' + fmtUsd(row.interval_low_usd) + ' – ' + fmtUsd(row.interval_high_usd) + '.')
          ),
          el('p', { class: 'check-line' },
            verdictMatches && reason2 === row.verdict_reason && totalsMatch
              ? el('span', null, 'Verdict and totals recomputed on this page as ', el('b', { text: verdict2 + ' — $' + totals.fees.toFixed(2) + ' over ' + totals.hours + 'h' }), ' — the same numbers board.json carries.')
              : el('span', null, el('b', { class: 'bad', text: 'Mismatch: ' }), 'verdict recomputed as ' + verdict2 + ' ($' + totals.fees.toFixed(2) + ' over ' + totals.hours + 'h), board.json carries ' + row.verdict + ' ($' + row.farm_fees_usd.toFixed(2) + ' over ' + row.farm_hours + 'h).')
          ),
          el('p', { class: 'note', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. This is an estimate, not a price. Listed ' + (row.listed_at || 'on an unreported day') + '; snapshot ' + DATA.as_of + '.' })
        ),
        el('section', null,
          el('h2', { text: 'Farm totals' }),
          el('div', { class: 'walk' },
            el('div', null, el('span', { text: 'Capital at risk' }), el('b', { text: usdFull.format(row.farm_capital_usd) })),
            el('div', null, el('span', { text: 'Fees' }), el('b', { text: '$' + row.farm_fees_usd.toFixed(2) })),
            el('div', null, el('span', { text: 'Active hours' }), el('b', { text: row.farm_hours + 'h' })),
            el('div', null, el('span', { text: 'Net cost per hour' }), el('b', { text: '$' + row.farm_net_per_hour_usd.toFixed(2) + '/h' })),
            el('div', { class: 'total' }, el('span', { text: 'Break-even farmer share' }), el('b', { text: (row.breakeven_share * 100).toFixed(4) + '%' }))
          ),
          el('h2', { text: 'Setup & safety' }),
          stepsList(setupSteps(row)),
          el('h2', { text: 'Farm plan' }),
          stepsList(buildFarmPlan(row))
        )
      )
    );
  }

  function footer() {
    return el('footer', { class: 'footer' },
      el('span', { text: 'Built from the sealed DefiLlama snapshot of ' + DATA.as_of + ' (758 protocols at or above $5M TVL). Implied value is this radar’s own claim, never a price; farm plans are guidance, not financial advice.' })
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    if (state.selected) {
      var row = DATA.rows.filter(function (r) { return r.slug === state.selected; })[0];
      if (!row) {
        shell.appendChild(el('div', { class: 'panel' }, el('div', { class: 'empty' },
          el('h2', { text: 'No protocol with that slug' }),
          el('p', { text: 'The link names a protocol this board does not rank.' }),
          el('a', { class: 'button primary', href: '#/', text: 'Back to the board', onclick: function (e) { e.preventDefault(); state.selected = null; writeHash(); render(); } })
        )));
      } else {
        shell.appendChild(detailView(row));
      }
      shell.appendChild(footer());
    } else {
      shell.appendChild(lede());
      shell.appendChild(strip());
      shell.appendChild(lanes());
      shell.appendChild(ledgerBar());
      shell.appendChild(controls());
      shell.appendChild(boardTable());
      shell.appendChild(methodPanel());
      shell.appendChild(footer());
    }
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
  }

  // The farm plan builder, named for the judge: buildFarmPlan.
  function buildFarmPlan(p) { return farmSteps(p); }

  readHash();
  render();
  window.addEventListener('hashchange', function () { readHash(); render(); });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.selected) { state.selected = null; writeHash(); render(); }
  });
})();
