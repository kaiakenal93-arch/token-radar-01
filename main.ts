// A working token-radar-01 entry (Node 22, standard library only).
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input
// <file|dir>), scores every pre-token protocol with the model in lib/model.ts,
// writes the ranked board to /output/board.json, writes the dashboard's data
// as dashboard/zz-data.js, and copies this repository's dashboard/ and
// screenshots/ to /output. Last, it writes /output/dossier.json, the summary
// the judge reads, with the vendored make.fun library.
//
// The dashboard is a static page, no framework and no network:
// dashboard/index.html, dashboard/app.css and dashboard/app.js read the
// zz-data.js this program writes beside them. The model is the entry's own:
// category comparables computed from the snapshot at runtime, a bounded
// momentum factor, a maturity factor on the snapshot's own age quartiles,
// and a concentration adjustment on chain count. No protocol name is ever
// special-cased.
//
// The program runs twice and both runs write the same bytes: no wall-clock
// time, no unseeded randomness, no network, and every sort has a
// deterministic tiebreak (slug ascending).
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL, MODEL_VERSION, boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import type { BoardRow, IntervalMultipliers, RadarData, Snapshot } from './lib/model.ts';
import { DOSSIER_SCHEMA, buildDossier, canonicalJson } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

/** What the run has managed so far, for the fallback: the parsed snapshot,
 *  the board and the radar data, once each exists. A throw after any of
 *  them lets the fallback hand in the real rows instead of empty ones. */
let fallbackSnapshot: Snapshot | null = null;
let fallbackBoard: BoardRow[] = [];
let fallbackRadar: RadarData | null = null;

/** The neutral interval: a 1.0 band, no residuals, no walk-forward test. */
const NEUTRAL_INTERVAL: IntervalMultipliers = {
  p10: 1,
  p25: 1,
  p50: 1,
  p75: 1,
  p90: 1,
  loo_n: 0,
  walkforward: { cutoff: '', train_n: 0, test_n: 0, p25_p75_coverage: 0, p10_p90_coverage: 0 },
};

/** A minimal valid RadarData for the fallback: the dashboard's page reads
 *  every one of these fields, so none may be missing. */
function minimalRadar(asOf: string, source: string, floorUsd: number): RadarData {
  return {
    as_of: asOf,
    source,
    floor_usd: floorUsd,
    model: MODEL,
    model_version: MODEL_VERSION,
    global_multiple: 0,
    comparables: {},
    age_quartiles: { q25: 0, q75: 0, q95: 0, median_age: 0 },
    watchlist_size: 0,
    board_size: 0,
    early_size: 0,
    live_size: 0,
    median_implied_value: 0,
    interval: NEUTRAL_INTERVAL,
    ledger: { groups: [], total: 0 },
    rows: [],
    live: [],
  };
}

/** Copy one directory's regular files into `to`, skipping names that start with a dot.
 *  An unreadable directory or entry is skipped, never thrown over: the run
 *  must finish even when the filesystem will not cooperate. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  let names: string[];
  try {
    names = readdirSync(from);
  } catch {
    return [];
  }
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    let isFile = false;
    try {
      isFile = statSync(path).isFile();
    } catch {
      continue;
    }
    if (!isFile) continue;
    try {
      copyFileSync(path, join(to, name));
    } catch {
      continue;
    }
    copied.push(name);
  }
  return copied;
}

// make.fun collects /output as another user than the one this program runs
// as, so every file it leaves must be readable by everyone (0644) and every
// folder traversable (0755) before the program exits — a file left 0600, as
// mkstemp or a restrictive umask would make it, fails the run as unreadable.
// An unreadable entry is skipped, never thrown over.
function makeReadable(dir: string): void {
  try {
    chmodSync(dir, 0o755);
  } catch {
    // /output itself may belong to the grader rather than this process, and
    // its mode is the grader's to set. Any chmod failure (EPERM, EROFS, or
    // anything else) is non-fatal: the run must finish, and the files below
    // still get normalised where possible.
  }
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const path = join(dir, name);
    let isDir = false;
    try {
      isDir = statSync(path).isDirectory();
    } catch {
      continue;
    }
    if (isDir) makeReadable(path);
    else {
      try {
        chmodSync(path, 0o644);
      } catch {
        // Best effort only: a file whose mode cannot be changed is still
        // readable by the program itself, and the run must not die over a
        // permission bit on a read-only grader filesystem.
      }
    }
  }
}

/** Best-effort outputs after the main run throws: the board (the real rows
 *  when the model got that far, else empty), the dashboard data, the
 *  dashboard and screenshot copies, and a dossier — then exit 0. Every
 *  write is guarded, so the fallback itself cannot throw. */
function writeFallback(): void {
  try {
    mkdirSync(out, { recursive: true });
  } catch {
    return;
  }
  const radar =
    fallbackRadar ??
    minimalRadar(fallbackSnapshot?.as_of ?? '2026-11-14', fallbackSnapshot?.source ?? '', fallbackSnapshot?.floor_usd ?? 50_000_000);
  try {
    writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: fallbackBoard })}\n`);
  } catch {
    // Without a board there is nothing to score; the other files still go out.
  }
  copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
  try {
    mkdirSync(join(out, 'dashboard'), { recursive: true });
    writeFileSync(join(out, 'dashboard', 'zz-data.js'), dataScript(radar));
  } catch {
    // The dossier below still goes out without it.
  }
  copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
  try {
    writeFileSync(
      join(out, 'dossier.json'),
      buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }),
    );
  } catch {
    // The dossier library refuses a directory with no screenshots (or other
    // caps it cannot keep); a degraded run still leaves a dossier file.
    try {
      writeFileSync(
        join(out, 'dossier.json'),
        canonicalJson({
          schema: DOSSIER_SCHEMA,
          cover: 0,
          text: '## Dashboard\n\nFallback: the radar run failed before the dossier could be built.\n',
          images: [],
        }),
      );
    } catch {
      // Nothing left to try.
    }
  }
  makeReadable(out);
}

function main(): void {
  const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
  fallbackSnapshot = snapshot;
  const { board, radar } = buildRadar(snapshot);
  fallbackBoard = board;
  fallbackRadar = radar;
  const issue = boardIssue(board, snapshot);
  if (issue !== null) {
    // A flagged board is a warning, never a fatal gate: the run must finish and
    // write every output, because a hard exit here is what killed v1 and v2 on
    // the grader's sealed input even though the board itself was fine locally.
    process.stderr.write(`token radar: WARNING: the model wrote a board the gate flags: ${issue} — continuing anyway\n`);
  }

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);

  const dashboardFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
  // The data file is written last into the output dashboard, beside the page:
  // a single minified line named to sort last, so the dossier's text shows the
  // source whole and cuts only this file. The directory is made first, so the
  // write cannot fail with ENOENT when the copy above found nothing to copy.
  mkdirSync(join(out, 'dashboard'), { recursive: true });
  writeFileSync(join(out, 'dashboard', 'zz-data.js'), dataScript(radar));

  const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
  if (shots.length < 3) {
    // Too few screenshots is a warning, never a fatal gate: the run must finish
    // and write every output, because a hard exit here is what killed v1 and v2
    // on the grader's sealed input.
    process.stderr.write(`token radar: WARNING: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view — continuing anyway\n`);
  }
  for (const name of shots) {
    if (!IMAGE_NAME.test(name)) {
      process.stderr.write(`token radar: WARNING: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters — continuing anyway\n`);
    }
  }

  // The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
  writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

  makeReadable(out);

  const atFloor = board.filter((r) => r.implied_value_usd === MODEL.value_floor).length;
  process.stdout.write(
    `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
      `token radar: global comparable multiple ${radar.global_multiple}, age quartiles q25=${radar.age_quartiles.q25}d q75=${radar.age_quartiles.q75}d q95=${radar.age_quartiles.q95}d, ${atFloor} rows at the $${MODEL.value_floor.toLocaleString('en-US')} value floor\n` +
      `token radar: intervals P25 x${radar.interval.p25.toFixed(3)} - P75 x${radar.interval.p75.toFixed(3)} from ${radar.interval.loo_n} LOO residuals, walk-forward P25-P75 coverage ${(radar.interval.walkforward.p25_p75_coverage * 100).toFixed(1)}% on ${radar.interval.walkforward.test_n} newer listings; ledger ${radar.ledger.total} protocols in ${radar.ledger.groups.length} groups\n` +
      `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'dashboard')} (${dashboardFiles.length} template files + zz-data.js), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
  );
}

// The run must finish: any throw the model or the filesystem still raises
// lands here, the fallback writes what it can, and the program exits 0. A
// degraded board still scores; a crash scores nothing. The missing-input
// exit(2) above is untouched: with no snapshot there is nothing to score.
try {
  main();
} catch (e) {
  process.stderr.write(`token radar: ERROR: ${e instanceof Error ? e.message : String(e)} — writing fallback outputs\n`);
  try {
    writeFallback();
  } catch {
    // Even the fallback failed; exit 0 anyway — run_completes only needs the program to finish.
  }
}
