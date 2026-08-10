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

## Two-number model (important)

`model $` is derived bottom-up from projected fantasy points for *this* league's settings.
`market $` is published AAV from ESPN/Yahoo/Sleeper — what the room will actually bid.
The edge is `model − market`. Don't collapse these into one number; the whole point is
bidding against the published values.

Live value applies the draft-state multipliers on top:
`liveValue = 1 + (model$ − 1) × budgetInflation × scarcity[pos]`

## Data

See `docs/DATA.md`. Sources are refreshed by `.github/workflows/refresh-values.yml`
(manual dispatch + daily cron), which commits `public/data/values-<season>.json`.
Manual CSV/TSV paste import in the app is the always-works fallback.
