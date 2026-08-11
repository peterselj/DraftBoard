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
| **Site $** | What the platform you're drafting on publishes — the number the rest of your room is anchored to. Set it in Settings → Drafting on. |
| **Edge** | `Model − Site`. Positive means the room is underpricing him. |
| **Live $** | Model value adjusted for how the draft is actually going. |

Keeping model and market apart is the whole point. A single blended number
hides the disagreement, and the disagreement is where the edge is.

**Site $**, specifically, is the platform's own number rather than a consensus
across sites. Everyone in a good league does their own homework, but if the
screen in front of them says `James Cook $43`, that anchors the bidding — and
it's decisive if even one team is on autodraft. Hover any cell to see every
source we have, plus the consensus and ADP.

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

Above 1x means the room has money left over relative to the talent left, so
expect to pay *more* than model value from here. Below 1x means the money is
drained and players are about to go cheap.

**Positional scarcity** — local: has one position dried up?

```
demand[pos]        = open slots at pos + pos's share of open FLEX slots
supply[pos]        = Σ (model $ − 1) over undrafted players at that position
scarcityMult[pos]  = (demand/supply now) / (demand/supply at draft start),
                     clamped to [0.4, 3]
```

Supply is counted in **dollars still on the board**, not in bodies. Taking the
top four RBs off a 130-deep board moves value by −24% while head count moves
−3%, so a head-count ratio would report RB as having gotten *easier*. Counting
value reports 1.17x — the position tightened. Details in
[docs/VALUE_MODEL.md](docs/VALUE_MODEL.md).

What someone *paid* never affects scarcity — only what left the board. Price
moves the money gauge instead.

**Live value**

```
liveValue = $1 + (model $ − 1) × budgetInflationMult × scarcityMult[pos]
```

Inflation and scarcity are deliberately separate readings. A stud going for $1
makes his position scarcer *and* leaves the room with surplus cash; those are
two different facts and they should be readable separately.

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
