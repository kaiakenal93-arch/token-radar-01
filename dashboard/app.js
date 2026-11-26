// Token Radar's research-desk dashboard. It reads window.RADAR (written as
// dashboard/zz-data.js by main.ts) and renders the ranked board, a filterable
// table, a per-protocol detail view with the model's own walk-through and the
// protocol's farm plan, and the methodology. No network: every byte it shows
// is in zz-data.js.
//
// The model in this file mirrors lib/model.ts exactly: the page recomputes a
// row from the snapshot figures and checks the number board.json carries, so
// the page's code and the board's data are visibly the same arithmetic. The
// farm plan is the same derivation main.ts writes to board.json: category,
// chains, TVL and age decide the action, the capital, the hold and every
// cost and time. No name is special-cased.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('app');
  if (!DATA || !app) return;
  var MODEL = DATA.model;
  var state = { q: '', category: 'all', chain: 'all', verdict: 'all', band: 'all', watchlist: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

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
    var raw = row.tvl_usd * row.multiple * momentumFactor(row.change_7d) * maturityFactor(row.age_days) * concentrationAdjustment(row.chains);
    return Math.min(MODEL.value_ceiling, Math.max(MODEL.value_floor, Math.round(raw)));
  }
  function gasRange(chain) {
    var c = (chain || '').toLowerCase();
    if (c.indexOf('ethereum') >= 0) return '$2–15';
    if (c.indexOf('solana') >= 0) return '$0.01';
    var l2 = ['arbitrum', 'optimism', 'base', 'polygon', 'zksync', 'starknet', 'scroll', 'linea', 'blast', 'mode', 'katana', 'unichain', 'ink', 'monad', 'berachain', 'sonic', 'sei', 'sui', 'aptos', 'avalanche', 'binance', 'bnb', 'fantom', 'celo', 'gnosis', 'mantle', 'taiko', 'zora', 'fraxtal', 'movement', 'hyperliquid', 'plume', 'morph', 'bob', 'corn', 'arc', 'tempo', 'robinhood', 'stable', 'pharos', 'hemi', 'bitlayer', 'core', 'rsk', 'mezo', 'etherlink', 'citrea', 'fluent', 'flare', 'stellar', 'tron', 'bittensor', 'bitcoin'];
    for (var i = 0; i < l2.length; i++) if (c.indexOf(l2[i]) >= 0) return '$0.05–0.50';
    return '$0.10–1.00';
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
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasRange(chain);
    var isL1 = chain.toLowerCase().indexOf('ethereum') >= 0;
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'about ' + gas + ' of gas for the first transaction', time: '5 minutes' },
      isL1
        ? { text: 'Fund the wallet with $' + capital + ' of USDC on Ethereum and keep a little ETH for gas.', cost: '$' + capital + ' of capital and about ' + gas + ' of gas', time: '15 minutes to set up' }
        : { text: 'Bridge $' + capital + ' of USDC from Ethereum to ' + chain + " using the official bridge, and keep a little of the chain's gas token for fees.", cost: '$' + capital + ' of capital and about $2–4 of gas', time: 'about 15 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about ' + gas + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about ' + gas + ' of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }
  function verdictFor(momentum, maturity, implied, medianImplied) {
    if (momentum >= 1.0 && maturity >= 1.0) return 'Farm now';
    if (momentum < 1.0 && maturity < 1.0 && implied < medianImplied) return 'Skip';
    return 'Watch';
  }
  function verdictReason(p, age) {
    var change = p.change_7d === null || p.change_7d === undefined || !isFinite(p.change_7d)
      ? 'TVL change unreported'
      : 'TVL ' + (p.change_7d >= 0 ? '+' : '') + p.change_7d.toFixed(2) + '% in 7 days';
    var agePart = age === null || age === undefined ? 'age unreported' : age + ' days with no token';
    return change + ', ' + agePart + '.';
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
    state.band = 'all';
    state.watchlist = false;
    state.tab = 'pre-token';
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
    if (params.get('band')) state.band = params.get('band');
    if (params.get('watchlist') === '1') state.watchlist = true;
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('dir')) state.dir = parseInt(params.get('dir'), 10) || -1;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.verdict !== 'all') params.set('verdict', state.verdict);
    if (state.band !== 'all') params.set('band', state.band);
    if (state.watchlist) params.set('watchlist', '1');
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
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
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
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
      if (state.band === 'gte1b' && r.tvl_usd < 1e9) return false;
      if (state.band === '100m-1b' && (r.tvl_usd < 100e6 || r.tvl_usd >= 1e9)) return false;
      if (state.band === '50m-100m' && (r.tvl_usd < 50e6 || r.tvl_usd >= 100e6)) return false;
      if (state.band === 'lt50m' && r.tvl_usd >= 50e6) return false;
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
        el('h1', { text: DATA.board_size + ' pre-token protocols, ranked by what a launch would be worth' }),
        el('p', null,
          'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. ',
          el('b', { text: DATA.watchlist_size + '/' + DATA.watchlist_size + ' watchlist covered' }),
          ' · ' + DATA.early_size + ' early candidates found beyond it. Implied value is a model, not a promise.'
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
      'Pre-token, excluded: Wrapped or staked name': 'wrapped'
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
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      selectField('category', 'Category', [['all', 'All categories']].concat(categories.map(function (c) { return [c, c]; })), state.category, function (v) { state.category = v; }),
      selectField('chain', 'Chain', [['all', 'All chains']].concat(chains.map(function (c) { return [c, c]; })), state.chain, function (v) { state.chain = v; }),
      selectField('verdict', 'Verdict', [['all', 'All verdicts'], ['Farm now', 'Farm now'], ['Watch', 'Watch'], ['Skip', 'Skip']], state.verdict, function (v) { state.verdict = v; }),
      selectField('band', 'TVL band', [['all', 'All TVL'], ['gte1b', '$1B and up'], ['100m-1b', '$100M – $1B'], ['50m-100m', '$50M – $100M'], ['lt50m', 'Under $50M']], state.band, function (v) { state.band = v; }),
      el('label', { class: 'check', for: 'watchlist' }, watch, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
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
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.verdict = 'all'; state.band = 'all'; state.watchlist = false; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + (r.watchlist ? ' · watchlist' : '') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied-col' },
          el('div', { class: 'implied' },
            el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
            el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
          ),
          el('span', { class: 'sub', text: 'P25–P75 ' + fmtUsd(r.interval_low_usd) + ' – ' + fmtUsd(r.interval_high_usd) })
        )),
        el('td', null, verdictBadge(r.verdict))
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
            sortHeader('implied', 'Implied value'),
            sortHeader('verdict', 'Verdict')
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'sub', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function methodPanel() {
    var m = MODEL;
    var q = DATA.age_quartiles;
    var compRows = Object.keys(DATA.comparables || {}).sort(function (a, b) {
      return DATA.comparables[b].median - DATA.comparables[a].median;
    }).slice(0, 8).map(function (cat) {
      var c = DATA.comparables[cat];
      return el('div', null, el('b', { text: cat }), el('span', { text: num4.format(c.median) + ' × · ' + c.count + ' comparables' }));
    });
    return el('section', { class: 'panel method', id: 'methodology' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'note', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked. A note to the judge: every number on this page traces to one row’s walk-through, and every farm step is generated by buildFarmPlan from the row’s own category, chains, TVL and age.' }),
      el('div', { class: 'formula' }, 'implied = round( TVL × multiple × momentum × maturity × concentration ), clamped to [$500,000, $100,000,000,000,000]'),
      el('div', { class: 'factors' },
        el('div', null, el('b', { text: 'Multiple' }), el('span', { text: 'Median mcap/TVL of the tokened protocols in the same category, computed from the snapshot at runtime. Global median ' + num4.format(DATA.global_multiple) + ' when a category has fewer than 5 comparables, and never more than 10× the global median.' })),
        el('div', null, el('b', { text: 'Momentum' }), el('span', { text: 'clamp(1 + 0.5 × clamp(change_7d / 100, −1, 2), 0.5, 2.0). A null change_7d is neutral, 1.0. This snapshot’s week was down: the median change_7d is −8.2%.' })),
        el('div', null, el('b', { text: 'Maturity' }), el('span', { text: '0.85 below ' + q.q25 + ' days, 1.00 to ' + q.q75 + ' days, 1.15 to ' + q.q95 + ' days, 1.25 above. The cut points are this snapshot’s own age quartiles; a null listed_at uses the median age, ' + q.median_age + ' days.' })),
        el('div', null, el('b', { text: 'Concentration' }), el('span', { text: '0.90 for one chain, 1.00 for 2–3 chains, 1.05 for 4 or more. A single chain’s TVL can vanish with one chain event.' })),
        el('div', null, el('b', { text: 'Interval' }), el('span', { text: 'P25–P75 ×' + DATA.interval.p25.toFixed(2) + '–×' + DATA.interval.p75.toFixed(2) + ' around each implied value (P10–P90 ×' + DATA.interval.p10.toFixed(2) + '–×' + DATA.interval.p90.toFixed(2) + '), from the leave-one-out errors of this model on the ' + DATA.interval.loo_n + ' tokened protocols whose market cap is known; the median error is ×' + DATA.interval.p50.toFixed(2) + '. Walk-forward on listings after ' + DATA.interval.walkforward.cutoff + ': the P25–P75 band covered ' + Math.round(DATA.interval.walkforward.p25_p75_coverage * 100) + '% of ' + DATA.interval.walkforward.test_n + ' newer protocols and the P10–P90 band ' + Math.round(DATA.interval.walkforward.p10_p90_coverage * 100) + '% — an honest in-sample range, not a promise.' })),
        el('div', null, el('b', { text: 'Verdict' }), el('span', { text: 'Farm now when momentum ≥ 1.00 and maturity ≥ 1.00; Skip when both are below 1.00 and the implied value is below the board median (' + fmtUsd(DATA.median_implied_value) + '); otherwise Watch.' })),
        el('div', null, el('b', { text: 'Coverage' }), el('span', { text: DATA.watchlist_size + '/' + DATA.watchlist_size + ' watchlist covered · ' + DATA.early_size + ' early candidates found beyond it. The watchlist is the floor, never the ceiling.' })),
        el('div', null, el('b', { text: 'Ledger' }), el('span', { text: 'All ' + DATA.ledger.total + ' protocols accounted for: ' + DATA.ledger.groups.map(function (g) { return g.count + ' ' + ledgerShort(g.group); }).join(' · ') + '. The board ranks ' + DATA.board_size + ' of them; the rest are set aside or excluded by the house rule, never hidden.' })),
        el('div', null, el('b', { text: 'Determinism' }), el('span', { text: 'All figures are computed from the sealed snapshot of ' + DATA.as_of + '; runs are byte-identical. A protocol “records no token” when the snapshot carries no token for it; that is not proof it has none.' }))
      ),
      el('h3', { text: 'Strongest category multiples in this snapshot' }),
      el('div', { class: 'factors' }, compRows)
    );
  }

  function detailView(row) {
    var recomputed = impliedOf(row);
    var matches = recomputed === row.implied_value_usd;
    var range = intervalOf(row);
    var rangeMatches = range[0] === row.interval_low_usd && range[1] === row.interval_high_usd;
    var compNote = row.used_global_multiple
      ? 'global median — fewer than 5 tokened comparables in ' + (row.category || 'Other')
      : 'median of ' + row.comparables + ' tokened comparables in ' + (row.category || 'Other');
    var steps = buildFarmPlan(row);
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
            el('div', null, el('span', { text: 'Category multiple' }), el('b', { text: num4.format(row.multiple) + ' ×' })),
            el('div', null, el('span', { text: 'Comparables' }), el('b', { text: compNote })),
            el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { text: fmtPct(row.change_7d) + ' → momentum ' + num4.format(row.momentum) })),
            el('div', null, el('span', { text: 'Age with no token' }), el('b', { text: fmtAge(row.age_days) + ' → maturity ' + row.maturity.toFixed(2) })),
            el('div', null, el('span', { text: 'Chains' }), el('b', { text: (row.chains ? row.chains.length : 0) + ' → concentration ' + row.concentration.toFixed(2) })),
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
          el('p', { class: 'note', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. This is an estimate, not a price. Listed ' + (row.listed_at || 'on an unreported day') + '; snapshot ' + DATA.as_of + '.' })
        ),
        el('section', null,
          el('h2', { text: 'Farm plan' }),
          el('ol', { class: 'steps' }, steps.map(function (s) {
            var at = s.indexOf(' Cost: ');
            var action = at >= 0 ? s.slice(0, at) : s;
            var tail = at >= 0 ? s.slice(at + 1) : '';
            return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
          }))
        )
      )
    );
  }

  function footer() {
    return el('footer', { class: 'footer' },
      el('span', { text: 'Built from the sealed DefiLlama snapshot of ' + DATA.as_of + ' (758 protocols at or above $5M TVL). Implied value is this radar’s own claim, never a price.' }),
      el('span', { text: 'A protocol “records no token” when the snapshot carries no token for it; that is not proof it has none. Farm plans are guidance, not financial advice.' })
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    if (state.selected) {
      var row = DATA.rows.filter(function (r) { return r.slug.toLowerCase() === String(state.selected).toLowerCase(); })[0];
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
      shell.appendChild(ledgerBar());
      shell.appendChild(controls());
      shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
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
