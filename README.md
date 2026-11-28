# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/kaiakenal93-arch/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/kaiakenal93-arch/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks 198 pre-token protocols by what a launch would be worth. Every row carries an implied value — TVL times a multiple pooled from its own family (category first, family next, global last) — and the launch odds its family's own record implies. Every value term was kept or dropped on two held-out tests, and only the family multiple passed, so momentum, maturity and concentration are not used. Each row also carries a costed farm verdict (fees, hours, net cost per hour, break-even farmer share) and a six-step farm plan with a two-step setup, all generated from the row's own figures. The watchlist is the floor, never the ceiling: 40/40 watchlist protocols covered, and 158 early candidates found below the $50M floor. The dashboard recomputes every number on the page, so what you see is what board.json carries.

## Screenshots

The three screenshots in `screenshots/` are the dashboard itself, captured at 1440×900: `1-board.jpg` is the board sorted by implied value, with the integrity strip and the three verdict lanes; `2-detail.jpg` is the Sentora Curator detail view with the token odds, the costed farm totals, the setup block and the farm plan; and `3-filtered.jpg` is the board with the Farm now lane selected (79 rows). Each one is a real state of the page, reachable from its own URL hash.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
```

Node 22 or later. The program reads the sealed DefiLlama snapshot of 2026-11-14, scores all 758 protocols, and writes `out/board.json`, `out/dashboard/` and `out/dossier.json`. Two runs write byte-identical output.

---

Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards
