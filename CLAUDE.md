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

## Three-number model (important)

`model $` is derived bottom-up from projected fantasy points for *this* league's settings.
`FP $` is FantasyPros' 0.5 PPR auction calculator, pasted in by hand — the board's source
of truth once it's there for a player, real calibrated auction money rather than a guess.
`site $` is published AAV from whichever platform the league drafts on (Settings → Drafting
on) — what's actually on the room's screen.

Model and site are each measured *against* FP $, not blended into one number, and the two
edges run in opposite directions on purpose: `modelEdge = model$ − FP$` just compares two
value estimates (no money changes hands, so there's no "good" direction). `siteEdge = FP$ −
site$` is a price-vs-value bet — positive means the room's published price is *below* what
FP thinks he's worth, a bargain — so it keeps the "green is good" sense the old blended Edge
always had. Getting this backwards (`site$ − FP$`) is the bug to watch for: it colors a
bargain red.

Live value applies the draft-state multipliers on top of FP $ (falling back to model $ for
players nobody's pasted an FP figure in for — budget inflation and scarcity need a number
for every undrafted player to stay calibrated to the whole pot):
`liveValue = 1 + (basis − 1) × budgetInflation × scarcity[pos]`, `basis = FP$ ?? model$`

## Data

See `docs/DATA.md`. Sources are refreshed by `.github/workflows/refresh-values.yml`
(manual dispatch + daily cron), which commits `public/data/values-<season>.json`.
Manual CSV/TSV paste import in the app is the always-works fallback.
