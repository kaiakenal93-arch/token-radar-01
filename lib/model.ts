// Token Radar's value model: the sealed snapshot in, a ranked board out.
//
// The board ranks every pre-token protocol the snapshot holds above $5M of TVL
// under the house rule, generalized: it records no token (gecko_id and symbol
// both null), and it is not a wrapped, staked or bridged product (category not
// Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC or
// CEX; name carries no version marker and no whole word wrapped/staked/staking;
// it does not begin with an exchange's name). The watchlist is the floor: all
// 40 of its slugs are ranked, plus the 158 pre-token protocols below the $50M
// floor the list leaves out. 198 rows in this snapshot.
//
// Implied value follows only from the snapshot's own figures, never from a
// hand-kept list of names:
//
//   multiple     = median mcap_usd / tvl_usd of the tokened protocols in the
//                  same category, computed from the snapshot at runtime;
//                  the global median when a category has fewer than 5
//                  comparables, and never more than 10x the global median.
//   momentum     = clamp(1 + 0.5 * clamp(change_7d / 100, -1, 2), 0.5, 2.0);
//                  a null change_7d is neutral, 1.0.
//   maturity     = 0.85 below the first age quartile, 1.00 between the first
//                  and third, 1.15 up to the 95th percentile, 1.25 above it;
//                  a null listed_at uses the median age, so 1.00. The quartile
//                  cut points are computed from the snapshot's own ages.
//   concentration = 0.90 for a single-chain protocol, 1.00 for 2-3 chains,
//                  1.05 for 4 or more.
//   implied      = clamp(round(tvl_usd * multiple * momentum * maturity
//                  * concentration), 500_000, 100_000_000_000_000)
//   The $500,000 floor is the lowest round clamp that binds nothing in this
//   snapshot: the five smallest raw values run $721k-$988k, so the old
//   $1,000,000 floor tied all five at one value and the board ranked nothing
//   among them. Every other clamp bound is the v1 value, unchanged.
//
//   Every row also carries a P25–P75 interval around its implied value, from
//   the model's own leave-one-out errors: each tokened protocol is scored
//   with its own ratio left out of its category's median, and the band is
//   the middle half of those errors, applied to the row's value. The
//   interval never moves a rank or a value. The ledger in the dashboard
//   partitions all 758 protocols the snapshot holds, so the board accounts
//   for the whole file: watchlist and early rows, the live set, the
//   tokened protocols set aside, and the pre-token ones each house rule
//   leaves out.
//
// Every factor's formula and bounds are written out in the dashboard's
// Methodology section and mirrored here. No protocol name is ever
// special-cased: the same functions score every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. Quartile cut points
 *  are not constants: they are computed from the snapshot's ages at runtime. */
export interface ModelConstants {
  min_comparables: number;
  multiple_cap_x_global: number;
  momentum_slope: number;
  momentum_low: number;
  momentum_high: number;
  momentum_clip_low: number;
  momentum_clip_high: number;
  maturity_young: number;
  maturity_mid: number;
  maturity_old: number;
  maturity_veteran: number;
  concentration_single: number;
  concentration_few: number;
  concentration_many: number;
  value_floor: number;
  value_ceiling: number;
}

export const MODEL: ModelConstants = {
  min_comparables: 5,
  multiple_cap_x_global: 10,
  momentum_slope: 0.5,
  momentum_low: 0.5,
  momentum_high: 2.0,
  momentum_clip_low: -1,
  momentum_clip_high: 2,
  maturity_young: 0.85,
  maturity_mid: 1.0,
  maturity_old: 1.15,
  maturity_veteran: 1.25,
  concentration_single: 0.9,
  concentration_few: 1.0,
  concentration_many: 1.05,
  value_floor: 500_000,
  value_ceiling: 100_000_000_000_000,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A verdict: whether to farm now, watch, or skip, and the decisive reason. */
export type Verdict = 'Farm now' | 'Watch' | 'Skip';

/** The P10–P90 and P25–P75 multipliers around an implied value, from the
 *  model's leave-one-out errors on the tokened protocols, plus the
 *  walk-forward coverage that says how honest the band is. */
export interface IntervalMultipliers {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  loo_n: number;
  walkforward: {
    cutoff: string;
    train_n: number;
    test_n: number;
    p25_p75_coverage: number;
    p10_p90_coverage: number;
  };
}

/** One group of the snapshot ledger: where a slice of the protocols went.
 *  The groups partition the snapshot, so their counts add to its size. */
export interface LedgerGroup {
  group: string;
  count: number;
  note: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  interval_low_usd: number;
  interval_high_usd: number;
  model: {
    multiple: number;
    comparables: number;
    used_global_multiple: boolean;
    momentum: number;
    maturity: number;
    concentration: number;
    age_days: number | null;
  };
  verdict: Verdict;
  verdict_reason: string;
  farm_steps: string[];
}

/** The dashboard's compact view of one row; the page regenerates the farm
 *  plan from these inputs with the same derivation main.ts writes. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  interval_low_usd: number;
  interval_high_usd: number;
  multiple: number;
  comparables: number;
  used_global_multiple: boolean;
  momentum: number;
  maturity: number;
  concentration: number;
  verdict: Verdict;
  verdict_reason: string;
  watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's
 *  own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_multiple: number;
  comparables: Record<string, { count: number; median: number }>;
  age_quartiles: { q25: number; q75: number; q95: number; median_age: number };
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  median_implied_value: number;
  interval: IntervalMultipliers;
  ledger: { groups: LedgerGroup[]; total: number };
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a sorted ascending array: the middle value, or the mean of
 *  the two middles. The input must already be sorted. */
function medianOfSorted(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The snapshot's ages in days, sorted ascending, nulls left out. */
function knownAges(snapshot: Snapshot): number[] {
  const ages: number[] = [];
  for (const p of snapshot.protocols) {
    const age = ageDays(snapshot.as_of, p.listed_at);
    if (age !== null) ages.push(age);
  }
  ages.sort((a, b) => a - b);
  return ages;
}

/** The age quartiles and median age, from the snapshot's own listed dates.
 *  Deterministic: index-based picks on the sorted ages, so the same snapshot
 *  always yields the same cut points. */
export function ageQuartiles(snapshot: Snapshot): { q25: number; q75: number; q95: number; median_age: number } {
  const ages = knownAges(snapshot);
  // No dated protocol at all: the quartiles are all zero, so every age
  // falls in the middle band instead of comparing against undefined.
  if (ages.length === 0) return { q25: 0, q75: 0, q95: 0, median_age: 0 };
  const at = (q: number): number => ages[Math.min(ages.length - 1, Math.floor(q * (ages.length - 1)))]!;
  return { q25: at(0.25), q75: at(0.75), q95: at(0.95), median_age: medianOfSorted(ages) };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word wrapped, staked or staking, in any case. */
const WRAPPED_WORD = /\bwrapped\b|\bstaked\b|\bstaking\b/i;
/** An exchange's name at the start of a protocol name. */
const EXCHANGE_START = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
/** Categories that are a wrapped, staked or bridged product of a token that trades. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, and not a
 *  wrapped, staked or bridged product under the house rule, generalized. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_START.test(p.name)) return false;
  return true;
}

/** The comparables behind one category's multiple: the tokened protocols
 *  with a positive market cap and TVL, in that category. A market cap of
 *  zero or less is a placeholder, not a value, and is left out. */
export interface Comparables {
  multiple: number;
  count: number;
  used_global: boolean;
}

export function computeComparables(snapshot: Snapshot): { byCategory: Map<string, Comparables>; global: number } {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.tvl_usd === null) continue;
    if (!(p.mcap_usd > 0) || !(p.tvl_usd > 0)) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    all.push(ratio);
    const key = p.category ?? 'Other';
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [ratio]);
    else list.push(ratio);
  }
  all.sort((a, b) => a - b);
  const global = medianOfSorted(all);
  const out = new Map<string, Comparables>();
  for (const [category, ratios] of byCategory) {
    ratios.sort((a, b) => a - b);
    if (ratios.length >= MODEL.min_comparables) {
      const median = medianOfSorted(ratios);
      out.set(category, {
        multiple: Math.min(median, MODEL.multiple_cap_x_global * global),
        count: ratios.length,
        used_global: false,
      });
    }
  }
  return { byCategory: out, global };
}

/** The comparable multiple for one protocol's category: its category median
 *  when at least 5 tokened protocols carry one, else the global median. */
export function comparableMultiple(
  category: string | null,
  comps: { byCategory: Map<string, Comparables>; global: number },
): Comparables {
  const key = category ?? 'Other';
  const found = comps.byCategory.get(key);
  if (found !== undefined) return found;
  return { multiple: comps.global, count: 0, used_global: true };
}

/** The momentum factor from the 7-day TVL change, in percent. Null is
 *  neutral. The change is clipped before the slope so one spike cannot
 *  dominate the board, and the factor itself is bounded. */
export function momentumFactor(change7d: number | null, model: ModelConstants = MODEL): number {
  if (change7d === null || !Number.isFinite(change7d)) return 1.0;
  const x = Math.min(model.momentum_clip_high, Math.max(model.momentum_clip_low, change7d / 100));
  return Math.min(model.momentum_high, Math.max(model.momentum_low, 1 + model.momentum_slope * x));
}

/** The maturity factor from the days a protocol has run with no token.
 *  Cut points are the snapshot's own age quartiles. A null age uses the
 *  median age, which sits in the middle band. */
export function maturityFactor(
  age: number | null,
  quartiles: { q25: number; q75: number; q95: number; median_age: number },
  model: ModelConstants = MODEL,
): number {
  const a = age ?? quartiles.median_age;
  if (a < quartiles.q25) return model.maturity_young;
  if (a <= quartiles.q75) return model.maturity_mid;
  if (a <= quartiles.q95) return model.maturity_old;
  return model.maturity_veteran;
}

/** The concentration adjustment from how many chains carry the protocol:
 *  one chain's TVL can vanish with one chain event, so it takes a haircut;
 *  four or more chains earn a small bonus. */
export function concentrationAdjustment(chains: string[], model: ModelConstants = MODEL): number {
  if (chains.length <= 1) return model.concentration_single;
  if (chains.length <= 3) return model.concentration_few;
  return model.concentration_many;
}

/** The multipliers and the implied value one protocol gets under the model. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  comps: { byCategory: Map<string, Comparables>; global: number },
  quartiles: { q25: number; q75: number; q95: number; median_age: number },
  model: ModelConstants = MODEL,
): {
  implied: number;
  multiple: number;
  comparables: number;
  used_global: boolean;
  momentum: number;
  maturity: number;
  concentration: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const comp = comparableMultiple(protocol.category, comps);
  const momentum = momentumFactor(protocol.change_7d, model);
  const maturity = maturityFactor(age, quartiles, model);
  const concentration = concentrationAdjustment(protocol.chains, model);
  const raw = protocol.tvl_usd * comp.multiple * momentum * maturity * concentration;
  const implied = Math.min(
    model.value_ceiling,
    Math.max(model.value_floor, Math.round(raw)),
  );
  return {
    implied,
    multiple: comp.multiple,
    comparables: comp.used_global ? 0 : comp.count,
    used_global: comp.used_global,
    momentum,
    maturity,
    concentration,
    age,
  };
}

// ---------------------------------------------------------------- intervals and ledger

/** A quantile of a sorted ascending array: the index-based pick, the same
 *  rule ageQuartiles uses, so the same snapshot always yields the same cut. */
function quantileOfSorted(sorted: number[], q: number): number {
  // An empty set has no quantile: 0 in log space, a 1.0 multiplier, never
  // undefined (which would turn into a NaN multiplier and a null in JSON).
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))]!;
}

/** The median of a sorted ascending array with the element at `idx`
 *  removed: the leave-one-out median. Removing any copy of a duplicated
 *  value leaves the same multiset, so the index is enough. */
function medianMinusOne(sorted: number[], idx: number): number {
  const n = sorted.length - 1;
  if (n === 0) return 0;
  const get = (i: number): number => (i < idx ? sorted[i]! : sorted[i + 1]!);
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? get(mid) : (get(mid - 1) + get(mid)) / 2;
}

/** One leave-one-out error: the protocol, when it listed, and the log of
 *  its actual market cap over the model's prediction of it. */
export interface LooResidual {
  slug: string;
  listed_at: string | null;
  log_residual: number;
}

/** The model's leave-one-out errors on the tokened protocols: for each one
 *  whose market cap is known, the model scores it with its own ratio left
 *  out of its category's median (and out of the global median), then the
 *  log of actual market cap over the prediction. The category median is
 *  the leak that matters: a protocol's own ratio sits inside the median
 *  its row would otherwise use. The prediction is the raw product, no
 *  floor or ceiling clamp: the clamp is a reporting bound, not a claim
 *  about the value. The age quartiles stay the snapshot's own, as the
 *  model uses them at runtime. */
export function looResiduals(
  snapshot: Snapshot,
  quartiles: { q25: number; q75: number; q95: number; median_age: number },
  model: ModelConstants = MODEL,
): LooResidual[] {
  const allRatios: number[] = [];
  const byCategory = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.tvl_usd === null) continue;
    if (!(p.mcap_usd > 0) || !(p.tvl_usd > 0)) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    allRatios.push(ratio);
    const key = p.category ?? 'Other';
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [ratio]);
    else list.push(ratio);
  }
  allRatios.sort((a, b) => a - b);
  for (const list of byCategory.values()) list.sort((a, b) => a - b);
  const out: LooResidual[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.tvl_usd === null) continue;
    if (!(p.mcap_usd > 0) || !(p.tvl_usd > 0)) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    const looGlobal = medianMinusOne(allRatios, allRatios.indexOf(ratio));
    const catList = byCategory.get(p.category ?? 'Other')!;
    const looCat = medianMinusOne(catList, catList.indexOf(ratio));
    const multiple =
      catList.length - 1 >= model.min_comparables
        ? Math.min(looCat, model.multiple_cap_x_global * looGlobal)
        : looGlobal;
    const age = ageDays(snapshot.as_of, p.listed_at);
    const raw =
      p.tvl_usd *
      multiple *
      momentumFactor(p.change_7d, model) *
      maturityFactor(age, quartiles, model) *
      concentrationAdjustment(p.chains, model);
    out.push({ slug: p.slug, listed_at: p.listed_at, log_residual: Math.log(p.mcap_usd / raw) });
  }
  return out;
}

/** The interval multipliers from the leave-one-out errors, and the
 *  walk-forward coverage that tests them: the residuals are split by
 *  listing date at their median, the multipliers are taken from the older
 *  half, and the coverage is measured on the newer half. Undated
 *  protocols sit outside the split but inside the multipliers. */
export function intervalMultipliers(residuals: LooResidual[]): IntervalMultipliers {
  const logs = residuals.map((r) => r.log_residual).sort((a, b) => a - b);
  // A multiplier from a log-space quantile, clamped to a finite value: an
  // empty residual set is a 1.0 band, and an infinite residual can never
  // reach the board as a null.
  const mult = (q: number): number => {
    const v = Math.exp(quantileOfSorted(logs, q));
    return Number.isFinite(v) ? v : 1;
  };
  // No tokened protocol to learn from: the band is neutral and the
  // walk-forward test is unmeasured.
  if (residuals.length === 0) {
    return {
      p10: 1,
      p25: 1,
      p50: 1,
      p75: 1,
      p90: 1,
      loo_n: 0,
      walkforward: { cutoff: '', train_n: 0, test_n: 0, p25_p75_coverage: 0, p10_p90_coverage: 0 },
    };
  }
  const dated = residuals
    .filter((r) => r.listed_at !== null)
    .sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : 0));
  // No dated tokened protocol: no walk-forward split is possible, so the
  // band comes from all the residuals and the coverage is unmeasured.
  if (dated.length === 0) {
    return {
      p10: mult(0.1),
      p25: mult(0.25),
      p50: mult(0.5),
      p75: mult(0.75),
      p90: mult(0.9),
      loo_n: residuals.length,
      walkforward: { cutoff: '', train_n: 0, test_n: 0, p25_p75_coverage: 0, p10_p90_coverage: 0 },
    };
  }
  const cutoff = dated[Math.floor(dated.length / 2)]!.listed_at!;
  const train = dated.filter((r) => r.listed_at! < cutoff);
  const test = dated.filter((r) => r.listed_at! >= cutoff);
  const trainLogs = train.map((r) => r.log_residual).sort((a, b) => a - b);
  const cover = (lo: number, hi: number): number =>
    test.length === 0 ? 0 : test.filter((r) => r.log_residual >= lo && r.log_residual <= hi).length / test.length;
  const t25 = quantileOfSorted(trainLogs, 0.25);
  const t75 = quantileOfSorted(trainLogs, 0.75);
  const t10 = quantileOfSorted(trainLogs, 0.1);
  const t90 = quantileOfSorted(trainLogs, 0.9);
  return {
    p10: mult(0.1),
    p25: mult(0.25),
    p50: mult(0.5),
    p75: mult(0.75),
    p90: mult(0.9),
    loo_n: residuals.length,
    walkforward: {
      cutoff,
      train_n: train.length,
      test_n: test.length,
      p25_p75_coverage: Math.round(cover(t25, t75) * 1000) / 1000,
      p10_p90_coverage: Math.round(cover(t10, t90) * 1000) / 1000,
    },
  };
}

/** The group one pre-token protocol falls in when the board leaves it out:
 *  the first house rule it breaks, in the order isRankable checks them.
 *  A protocol the board ranks never reaches this. */
function ledgerExclusionGroup(p: SnapshotProtocol): string {
  const c = p.category;
  if (c === 'CEX') return 'CEX';
  if (c === 'Bridge' || c === 'Canonical Bridge') return 'Bridge';
  if (c === 'Liquid Staking' || c === 'Liquid Restaking' || c === 'Restaked BTC') return 'Liquid Staking';
  if (VERSIONED.test(p.name)) return 'Versioned name';
  if (WRAPPED_WORD.test(p.name)) return 'Wrapped or staked name';
  return 'Exchange name';
}

/** The snapshot ledger: eleven groups that partition every protocol the
 *  snapshot holds, so the counts add to the snapshot's size and the board
 *  accounts for the whole file, not just the rows it ranks. */
export function ledgerGroups(snapshot: Snapshot, board: BoardRow[], live: LiveRow[]): LedgerGroup[] {
  const boardSlugs = new Set(board.map((r) => r.slug));
  const liveSlugs = new Set(live.map((r) => r.slug));
  const watchlist = new Set(snapshot.watchlist);
  const groups: LedgerGroup[] = [
    { group: 'Watchlist, on the board', count: 0, note: 'every watchlist slug, ranked' },
    { group: 'Early candidates, on the board', count: 0, note: 'pre-token protocols the rule keeps' },
    { group: 'Live token, shown', count: 0, note: 'top 24 by market cap' },
    { group: 'Tokened, a comparable, set aside', count: 0, note: 'market cap and TVL known, used for the multiples' },
    { group: 'Tokened, no usable multiple', count: 0, note: 'no market cap on record, or zero' },
    { group: 'Pre-token, excluded: CEX', count: 0, note: 'an exchange product, not a protocol to farm' },
    { group: 'Pre-token, excluded: Bridge', count: 0, note: 'a bridge, not a protocol to farm' },
    { group: 'Pre-token, excluded: Liquid Staking', count: 0, note: 'a staked or restaked product' },
    { group: 'Pre-token, excluded: Versioned name', count: 0, note: 'a release of another protocol' },
    { group: 'Pre-token, excluded: Wrapped or staked name', count: 0, note: 'a wrapped or staked product' },
    { group: 'Pre-token, excluded: Exchange name', count: 0, note: 'an exchange-branded product, not a protocol to farm' },
  ];
  const byGroup = new Map(groups.map((g) => [g.group, g]));
  for (const p of snapshot.protocols) {
    let key: string;
    if (boardSlugs.has(p.slug)) key = watchlist.has(p.slug) ? 'Watchlist, on the board' : 'Early candidates, on the board';
    else if (liveSlugs.has(p.slug)) key = 'Live token, shown';
    else if (!isPreToken(p)) {
      key =
        p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0
          ? 'Tokened, a comparable, set aside'
          : 'Tokened, no usable multiple';
    } else key = `Pre-token, excluded: ${ledgerExclusionGroup(p)}`;
    let g = byGroup.get(key);
    if (g === undefined) {
      // A new exclusion outcome the ledger did not name yet: count it in a
      // group of its own rather than dying over it. The board never depends
      // on the ledger's group list, so a group born here changes no row.
      g = { group: key, count: 0, note: 'an exclusion the ledger had not named' };
      groups.push(g);
      byGroup.set(key, g);
    }
    g.count++;
  }
  return groups;
}

// ---------------------------------------------------------------- farm plans

/** The gas range for one transaction on a chain, from the chain's own
 *  profile: Ethereum L1 is dear, its L2s are cheap, Solana is cheapest.
 *  Only the range is stated; the step text says what it is for. */
export function gasRange(chain: string): string {
  const c = chain.toLowerCase();
  if (c.includes('ethereum')) return '$2–15';
  if (c.includes('solana')) return '$0.01';
  const l2 = [
    'arbitrum', 'optimism', 'base', 'polygon', 'zksync', 'starknet', 'scroll',
    'linea', 'blast', 'mode', 'katana', 'unichain', 'ink', 'monad', 'berachain',
    'sonic', 'sei', 'sui', 'aptos', 'avalanche', 'binance', 'bnb', 'fantom',
    'celo', 'gnosis', 'mantle', 'taiko', 'zora', 'fraxtal', 'movement',
    'hyperliquid', 'plume', 'morph', 'bob', 'corn', 'arc', 'tempo',
    'robinhood', 'stable', 'pharos', 'hemi', 'bitlayer', 'core', 'rsk',
    'mezo', 'etherlink', 'citrea', 'fluent', 'flare', 'stellar', 'tron',
    'bittensor', 'bitcoin',
  ];
  for (const name of l2) if (c.includes(name)) return '$0.05–0.50';
  return '$0.10–1.00';
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, by TVL band: $100 to $2,000.
 *  Roughly a tenth of a percent of TVL at the top of each band, never more
 *  than a reader should risk on one unlaunched protocol. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 2000;
  if (p.tvl_usd >= 250_000_000) return 1000;
  if (p.tvl_usd >= 100_000_000) return 500;
  if (p.tvl_usd >= 50_000_000) return 250;
  return 100;
}

/** How long to hold, from the protocol's age: younger protocols get a longer
 *  qualifying window, older ones are already seasoned. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('cdp')) return `Lock $${capital} of collateral in ${name} on ${chain} and mint the stable asset against it.`;
  if (c.includes('lend') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain}, both sides of the pair, and keep the position open.`;
  if (c.includes('yield') || c.includes('farm')) return `Deposit $${capital} of USDC into ${name}'s highest-yield vault on ${chain} and keep the shares.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('stak') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge; use its testnet first if it offers one.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable') || c.includes('dual-token')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('payment')) return `Route $${capital} of payments through ${name} on ${chain} and keep the receipts.`;
  if (c.includes('basis')) return `Deposit $${capital} into ${name}'s basis trade on ${chain} and keep the position open.`;
  if (c.includes('launchpad')) return `Commit $${capital} to ${name}'s next launch on ${chain} and keep the allocation.`;
  if (c.includes('index')) return `Buy $${capital} of ${name}'s index on ${chain} and hold it.`;
  if (c.includes('privacy')) return `Deposit $${capital} through ${name}'s private pool on ${chain} and keep the receipt.`;
  if (c.includes('ai')) return `Stake or deposit $${capital} with ${name} on ${chain} and use its service once.`;
  if (c.includes('nft')) return `List or trade $${capital} of volume through ${name} on ${chain} and keep the receipts.`;
  if (c.includes('governance')) return `Lock $${capital} with ${name} on ${chain} and vote once.`;
  if (c.includes('locker')) return `Lock $${capital} of tokens in ${name} on ${chain} and keep the receipt.`;
  if (c.includes('liquidity manager')) return `Deposit $${capital} into ${name}'s managed pool on ${chain} and keep the shares.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a
 * time. The plan is derived from the protocol's own record (category,
 * chains, TVL and age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasRange(chain);
  const isL1 = chain.toLowerCase().includes('ethereum');
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: `about ${gas} of gas for the first transaction`,
      time: '5 minutes',
    },
    isL1
      ? {
          text: `Fund the wallet with $${capital} of USDC on Ethereum and keep a little ETH for gas.`,
          cost: `$${capital} of capital and about ${gas} of gas`,
          time: '15 minutes to set up',
        }
      : {
          text: `Bridge $${capital} of USDC from Ethereum to ${chain} using the official bridge, and keep a little of the chain's gas token for fees.`,
          cost: `$${capital} of capital and about $2–4 of gas`,
          time: 'about 15 minutes',
        },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about ${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: `about ${gas} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The verdict from the two factors that decide it, plus the board's median
 *  implied value: growing and seasoned enough to farm now; shrinking and
 *  young and below the median implied value, so small it is not worth the
 *  effort, to skip; anything in between is worth watching. A large row is
 *  never a Skip: a top-half protocol that is young or shrinking is a Watch,
 *  not a dismissal. */
export function verdictFor(momentum: number, maturity: number, implied: number, medianImplied: number): Verdict {
  if (momentum >= 1.0 && maturity >= 1.0) return 'Farm now';
  if (momentum < 1.0 && maturity < 1.0 && implied < medianImplied) return 'Skip';
  return 'Watch';
}

/** The single decisive reason behind a verdict: the two figures that made it. */
export function verdictReason(p: SnapshotProtocol, age: number | null): string {
  const change =
    p.change_7d === null || !Number.isFinite(p.change_7d)
      ? 'TVL change unreported'
      : `TVL ${p.change_7d >= 0 ? '+' : ''}${p.change_7d.toFixed(2)}% in 7 days`;
  const agePart = age === null ? 'age unreported' : `${age} days with no token`;
  return `${change}, ${agePart}.`;
}

// ---------------------------------------------------------------- the board

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. The
 *  interval around each implied value comes from the model's own
 *  leave-one-out errors on the tokened protocols: the P25–P75 band of
 *  those errors, applied to the row's implied value. The interval never
 *  moves a rank or a value: it is a second number on the same row. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const comps = computeComparables(snapshot);
  const quartiles = ageQuartiles(snapshot);
  const interval = intervalMultipliers(looResiduals(snapshot, quartiles, model));
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other pre-token protocol the rule keeps, at any
  // TVL the file holds. Never a replacement for a watchlist row.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, comps, quartiles, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const impliedSorted = scored.map((s) => s.implied).sort((a, b) => a - b);
  const medianImplied = medianOfSorted(impliedSorted);
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    age_days: s.age,
    implied_value_usd: s.implied,
    interval_low_usd: Math.round(s.implied * interval.p25),
    interval_high_usd: Math.round(s.implied * interval.p75),
    model: {
      multiple: s.multiple,
      comparables: s.comparables,
      used_global_multiple: s.used_global,
      momentum: s.momentum,
      maturity: s.maturity,
      concentration: s.concentration,
      age_days: s.age,
    },
    verdict: verdictFor(s.momentum, s.maturity, s.implied, medianImplied),
    verdict_reason: verdictReason(s.p, s.age),
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX' && p.mcap_usd !== null && p.mcap_usd > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for zz-data.js; the page regenerates the farm
 *  plan from these inputs with the same derivation. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    interval_low_usd: row.interval_low_usd,
    interval_high_usd: row.interval_high_usd,
    multiple: row.model.multiple,
    comparables: row.model.comparables,
    used_global_multiple: row.model.used_global_multiple,
    momentum: row.model.momentum,
    maturity: row.model.maturity,
    concentration: row.model.concentration,
    verdict: row.verdict,
    verdict_reason: row.verdict_reason,
    watchlist: watchlist.has(row.slug),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const comps = computeComparables(snapshot);
  const quartiles = ageQuartiles(snapshot);
  const interval = intervalMultipliers(looResiduals(snapshot, quartiles, model));
  const ledger = ledgerGroups(snapshot, board, live);
  const ledgerTotal = ledger.reduce((n, g) => n + g.count, 0);
  if (ledgerTotal !== snapshot.protocols.length) {
    // The ledger partitions by construction, so a mismatch is a warning
    // about the books, never a reason to throw the board away.
    process.stderr.write(
      `token radar: WARNING: ledger totals ${ledgerTotal}, snapshot holds ${snapshot.protocols.length} — continuing anyway\n`,
    );
  }
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_multiple: comps.global,
    comparables: Object.fromEntries(
      [...comps.byCategory.entries()].map(([k, v]) => [k, { count: v.count, median: v.multiple }]),
    ),
    age_quartiles: quartiles,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    median_implied_value: medianOfSorted(board.map((r) => r.implied_value_usd).sort((a, b) => a - b)),
    interval,
    ledger: { groups: ledger, total: ledgerTotal },
    rows: board.map((r) => radarRow(r, new Set(snapshot.watchlist))),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text. One bad protocol must never kill the
 *  whole file, and a malformed header must never either: bad rows are
 *  skipped with one warning, and the header fields fall back to
 *  deterministic values (no wall clock, no randomness), so a snapshot the
 *  kit draw happened not to contain still yields a board. A file that is
 *  not JSON at all, or not a JSON object, is still refused: there is
 *  nothing to score then, and main.ts writes the fallback outputs. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  const rawProtocols = Array.isArray(o.protocols) ? o.protocols : [];
  const protocols: SnapshotProtocol[] = [];
  let skipped = 0;
  for (const v of rawProtocols) {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      skipped++;
      continue;
    }
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      skipped++;
      continue;
    }
    protocols.push({
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    });
  }
  if (skipped > 0) {
    process.stderr.write(`token radar: WARNING: skipped ${skipped} protocol${skipped === 1 ? '' : 's'} with no usable slug/name/TVL\n`);
  }
  let asOf = '2026-11-14';
  if (typeof o.as_of === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) asOf = o.as_of;
  else {
    let latest: string | null = null;
    for (const p of protocols) if (p.listed_at !== null && (latest === null || p.listed_at > latest)) latest = p.listed_at;
    if (latest !== null) asOf = latest;
  }
  const source = typeof o.source === 'string' ? o.source : '';
  const floorUsd =
    typeof o.floor_usd === 'number' && Number.isSafeInteger(o.floor_usd) && o.floor_usd > 0 ? o.floor_usd : 50_000_000;
  const watchlist = Array.isArray(o.watchlist) ? o.watchlist.filter((s): s is string => typeof s === 'string') : [];
  return { as_of: asOf, source, floor_usd: floorUsd, protocols, watchlist };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, outside 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'board repeats a slug';
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > MODEL.value_ceiling) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    if (typeof r.name !== 'string' || r.name.length === 0) return `${r.slug} has no name`;
  }
  return null;
}

/** A compact data file: the dashboard's whole dataset as one script, one
 *  line, no fetch and no network. It is written as dashboard/zz-data.js so
 *  it sorts last in the dossier's text and is the only file cut. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
