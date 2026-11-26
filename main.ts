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
import { MODEL, boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

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

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const dashboardFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
// The data file is written last into the output dashboard, beside the page:
// a single minified line named to sort last, so the dossier's text shows the
// source whole and cuts only this file.
writeFileSync(join(out, 'dashboard', 'zz-data.js'), dataScript(radar));

const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

// make.fun collects /output as another user than the one this program runs
// as, so every file it leaves must be readable by everyone (0644) and every
// folder traversable (0755) before the program exits — a file left 0600, as
// mkstemp or a restrictive umask would make it, fails the run as unreadable.
(function makeReadable(dir: string): void {
  try {
    chmodSync(dir, 0o755);
  } catch (err) {
    // /output itself may belong to the grader rather than this process; its
    // mode is the grader's to set. Only the files below it need normalising.
    if ((err as { code?: string }).code !== 'EPERM') throw err;
  }
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) makeReadable(path);
    else chmodSync(path, 0o644);
  }
})(out);

const atFloor = board.filter((r) => r.implied_value_usd === MODEL.value_floor).length;
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: global comparable multiple ${radar.global_multiple}, age quartiles q25=${radar.age_quartiles.q25}d q75=${radar.age_quartiles.q75}d q95=${radar.age_quartiles.q95}d, ${atFloor} rows at the $${MODEL.value_floor.toLocaleString('en-US')} value floor\n` +
    `token radar: intervals P25 x${radar.interval.p25.toFixed(3)} - P75 x${radar.interval.p75.toFixed(3)} from ${radar.interval.loo_n} LOO residuals, walk-forward P25-P75 coverage ${(radar.interval.walkforward.p25_p75_coverage * 100).toFixed(1)}% on ${radar.interval.walkforward.test_n} newer listings; ledger ${radar.ledger.total} protocols in ${radar.ledger.groups.length} groups\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'dashboard')} (${dashboardFiles.length} template files + zz-data.js), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
