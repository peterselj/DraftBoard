# Draft Board — working notes

Live fantasy football auction companion. Deployed at
https://peterselj.github.io/DraftBoard/

## Repo conventions

- `main` is always deployable — every push to it builds and deploys to GitHub Pages
  via `.github/workflows/deploy.yml`.
- Feature work goes on `feat/<short-name>` branches, merged into `main` by PR.
- `npm test` (node's built-in test runner, no framework) must pass before merge;
  the deploy workflow runs it as a gate.

## Layout

```
src/
  App.jsx            — app shell: state, wiring, layout
  components/        — UI pieces (one concern each, inline-style objects local to the file)
  lib/
    valueModel.js    — bottom-up dollar values: projections -> VORP -> $ (the elboberto model)
    scoring.js       — league scoring config; raw stat lines -> fantasy points
    draftMath.js     — live budget-inflation + positional-scarcity multipliers
    dataSource.js    — load/refresh/merge player data at runtime
    importParse.js   — CSV/TSV paste import
    storage.js       — localStorage persistence + schema migrations
    fuzzy.js         — prefix/subsequence matching for typeaheads
  data/              — bundled offline fallback seed
public/data/         — runtime-fetched values JSON, refreshed by CI (no rebuild needed)
scripts/             — data refresh pipeline (sources/ + refresh.mjs)
```

## Gotchas

- **Never use the `border: "1px solid <colour>"` shorthand in a style object
  that a variant overrides.** React removes longhands it no longer sees but
  leaves the shorthand, so toggling a variant off resets the colour to black.
  Split it: `border: "1px solid"` + an always-present `borderColor`.
- **Bump `SCHEMA_VERSION` in `src/lib/storage.js` when the *meaning* of a
  persisted field changes, not just its shape.** Saved drafts are live data;
  silently reinterpreting old units is worse than discarding them. The
  head-count → dollars change in the scarcity baseline is the cautionary tale.

## Value basis (important)

Four prices exist per player, and they answer different questions rather than competing
for the same one:

- **`JP $`** (`p.model` / `baseValueOf`) — our own bottom-up figure, derived from projected
  fantasy points for *this* league's exact roster shape (scoring → VORP → $, the elboberto
  model). What *we* think he's worth.
- **`FP $`** (`p.fantasypros`) — FantasyPros' 0.5 PPR auction calculator, pasted in by hand.
  Real, externally calibrated auction money, but assumes a standard roster, not this
  league's.
- **`ETR $`** (`p.etr`) — Establish The Run's values, pasted in by hand. Another external
  reference, same role as FP $.
- **`FDV $`** (`fdvValues`, computed) — [First Down Studio](https://www.firstdown.studio/season-rankings)'s
  Vegas-prop-derived fantasy points (`p.fdvPoints`, pasted in by hand), run through *our own*
  bottom-up model rather than trusted as a dollar figure directly — FDS publishes points, not
  auction money, so it's a rival projection input for the same VORP math JP $ uses, not a peer
  to FP $/ETR $'s pasted dollars. See `docs/DATA.md` for where the numbers come from and the
  half-PPR-only caveat.
- **`site $`** — published AAV from whichever platform the league drafts on (Settings →
  Drafting on). What's actually on the room's screen — a market-price fact, not a valuation.

**One of FP $ / JP $ / ETR $ / FDV $ is picked as *the basis*** — `Settings → Value basis`, or
the check icon on a column header in `PlayerTable` — and everything else measures against
*that* number instead of the four being compared to each other. `App.jsx`'s `basisOf(p)`
resolves it: `model` and `fdv` always resolve to a computed figure (`fdv` falls back to the
model value for anyone with no `fdvPoints` pasted); `fp` / `etr` read the pasted field and
fall back to `model` for anyone missing it, since budget inflation and scarcity need a number
for every undrafted player to stay calibrated to the whole pot.

`siteEdge = basis − site$` is the one comparison that survives: positive means the room's
published price is *below* whichever source is the basis — a bargain, "green is good".
Getting this backwards (`site$ − basis`) is the bug to watch for: it colors a bargain red.
There's no more "Model Edge" (comparing sources to each other) — once one of them is *the*
number, comparing it to the others isn't a decision input, it's just diagnostic noise.

Live $ applies the draft-state multipliers on top of the basis:
`liveValue = 1 + (basis − 1) × budgetInflation × scarcity[pos]`

## Data

See `docs/DATA.md`. Sources are refreshed by `.github/workflows/refresh-values.yml`
(manual dispatch + daily cron), which commits `public/data/values-<season>.json`.
Manual CSV/TSV paste import in the app is the always-works fallback.
