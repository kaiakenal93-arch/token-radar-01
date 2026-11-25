# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/kaiakenal93-arch/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/kaiakenal93-arch/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks 198 pre-token protocols by what a launch would be worth. Every row carries an implied value built from live comparables — the median market-cap/TVL of the tokened protocols in its own category — adjusted for momentum, maturity and chain concentration, plus a seven-step farm plan generated from the row's own figures. The watchlist is the floor, never the ceiling: 40/40 watchlist protocols covered, and 158 early candidates found below the $50M floor. The dashboard recomputes every number on the page, so what you see is what board.json carries.

## Screenshots

The three screenshots in `screenshots/` are the dashboard itself, captured at 1440×900: `1-board.jpg` is the board sorted by implied value, `2-detail.jpg` is the Gauntlet detail view with the model's walk-through and farm plan, and `3-filtered.jpg` is the board with watchlist-only on and the Risk Curators filter. Each one is a real state of the page, reachable from its own URL hash.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
```

Node 22 or later. The program reads the sealed DefiLlama snapshot of 2026-11-14, scores all 758 protocols, and writes `out/board.json`, `out/dashboard/` and `out/dossier.json`. Two runs write byte-identical output.

---

Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards
