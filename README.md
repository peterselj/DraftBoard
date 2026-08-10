# Draft Board

A live fantasy football auction-draft companion. Started as a Claude.ai
artifact, now a real project: hosted, version-controlled, and pulling fresh
data on demand.

**Live at [peterselj.github.io/DraftBoard](https://peterselj.github.io/DraftBoard/)**

## What it's for

Auction drafts move fast, and two questions matter on every nomination:

1. **What is this player actually worth to *my* league?** Not what ESPN's
   drafters paid in someone else's format — what his projected production is
   worth given 12 teams, 3 WR, 0.5 PPR, and a $200 budget.
2. **What is he worth *right now*, this many picks in?** Money and value leave
   the board at different rates, and positions dry up at different rates.

The board answers both, live, and shows the gap between them and the market.

## The two numbers

| Column | What it is |
| --- | --- |
| **Model $** | Bottom-up value: projected stats → this league's scoring → points above replacement → dollars. |
| **Market $** | What the room will likely bid — published auction values (ESPN today, more sources importable). |
| **Edge** | `Model − Market`. Positive means the market is underpricing him. |
| **Live $** | Model value adjusted for how the draft is actually going. |

Keeping model and market apart is the whole point. A single blended number
hides the disagreement, and the disagreement is where the edge is.

## The math

**Model value** (`src/lib/valueModel.js`) — the elboberto approach: value is
derived from projected production, not from what other people paid.

```
points      = projected stat line scored by this league's rules
replacement = best player at the position who doesn't start anywhere
              (FLEX slots go to whichever RB/WR/TEs are genuinely next-best)
VORP        = points − replacement
dollars     = $1 + VORP × (competitive money / total VORP in the draftable pool)

competitive money = teams × budget − teams × roster slots   [$1 held per slot]
```

**Budget inflation** (`src/lib/draftMath.js`) — global: is the room spending
hot or cold?

```
competitiveDollars  = Σ remaining budgets − Σ open roster slots
undraftedValue      = Σ (model value − 1) over undrafted players
budgetInflationMult = competitiveDollars / undraftedValue
```

**Positional scarcity** — local: has one position dried up?

```
liveRatio[pos]     = (open slots at pos + pos's share of open FLEX) / undrafted players at pos
baselineRatio[pos] = the same ratio at draft start
scarcityMult[pos]  = liveRatio / baselineRatio, clamped to [0.4, 3]
```

**Live value**

```
liveValue = $1 + (model $ − 1) × budgetInflationMult × scarcityMult[pos]
```

Inflation and scarcity are deliberately separate readings. "We had to overpay"
means something different when the whole room is hot than when one position
just emptied out.

### Known limitation

Scarcity is a raw head-count ratio, so it can't see tiers. Losing the top 3 RBs
while 25 replacement-level RBs remain barely moves the number, even though the
position feels much thinner. See `FEATURE_BACKLOG.md`.

## Using it during a draft

The fast path is the quick-entry bar — one line, one Enter:

```
jeffer 54 bou        →  Justin Jefferson, $54, to Boudreau
chase brown 12 me    →  Chase Brown, $12, to my team
```

Player and team are fuzzy-matched (last names and prefixes work), and an
ambiguous team refuses to commit rather than guessing wrong.

| Key | Does |
| --- | --- |
| `/` | jump to quick entry |
| `↑` `↓` | choose among matching players |
| `Enter` | log the pick |
| `Ctrl+Z` | undo the last pick (any number of times) |
| `h` | hide drafted |
| `f` | flex filter (RB + WR + TE) |

Before the draft, open Settings and paste your league's team names in one
block, set the roster and scoring, and star your own team.

## Data

Values refresh from live sources with the **Refresh** button — no rebuild, no
deploy. See [docs/DATA.md](docs/DATA.md) for sources, the CI snapshot, and how
to paste values in by hand when a source breaks.

## Development

```bash
npm install
npm run dev       # local dev server
npm test          # node's test runner, no framework
npm run build     # production build
npm run refresh   # rebuild public/data/values-<season>.json from live sources
```

`main` is always deployable — pushing to it builds, tests, and deploys to
GitHub Pages. Feature work goes on `feat/*` branches. See `CLAUDE.md`.

## Project structure

```
src/
  App.jsx            — app shell: state and wiring
  components/        — UI, one concern per file
  lib/
    valueModel.js    — projections → VORP → dollars
    scoring.js       — league scoring config
    draftMath.js     — live inflation + scarcity multipliers
    dataSource.js    — load / refresh / merge player data
    importParse.js   — CSV/TSV paste import
    quickEntry.js    — the one-line pick grammar
    fuzzy.js         — name matching for the typeaheads
    merge.js, names.js, sources/  — shared by the app and the CI script
  data/              — bundled offline fallback pool
public/data/         — runtime-fetched values, refreshed by CI
scripts/refresh.mjs  — CLI entry point for the same pipeline
```
