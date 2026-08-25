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
derived from projected production, not from what other people paid. Value comes
in two tranches at different rates — what makes a player *rosterable* is cheap,
what makes him *startable* is dear:

```
points        = projected stat line scored by this league's rules
startBaseline = the last starter at his position (FLEX slots go by merit)
benchBaseline = the last rostered player at his position

value = (benchVORP − startVORP) × benchRate + startVORP × starterRate
```

A single-baseline model funnels the whole budget into the ~84 starters and
calls everyone else $1; this one prices the marginal starter at ~$11, which is
what rooms actually pay. Verified against the 2025 elboberto workbook: 144
players, **$0.002 mean difference**. See [docs/VALUE_MODEL.md](docs/VALUE_MODEL.md).

**Budget inflation** (`src/lib/draftMath.js`) — global: is the room spending
hot or cold?

```
competitiveDollars  = Σ remaining budgets − Σ open roster slots
undraftedValue      = Σ (model value − 1) over undrafted players
budgetInflationMult = competitiveDollars / undraftedValue
```

Above 1x means the room has money left over relative to the talent left, so
expect to pay *more* than model value from here. Below 1x means the money is
drained and players are about to go cheap. The gauge is log-scaled between
0.5x and 2x, so 1.00x sits dead centre and a 25% premium is exactly as far
right as a 25% discount is left.

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
block, set the roster and scoring, choose the platform under **Drafting on**,
and star your own team.

## Rooms

One board, several leagues. Type a room name on the way in — `retrocade`,
`lindor` — and each keeps its own managers, settings and picks. Bookmark
`#room=retrocade` to skip the picker. Rooms live in your browser only; nothing
is uploaded, so anyone else opening the site just gets an empty board. See
[docs/ROOMS.md](docs/ROOMS.md).

### Live rooms (optional, ~5 minutes to set up)

A room can sync live across devices — so someone watching on their phone sees
the same board as whoever's running the draft — via Firebase's free tier, same
pattern as the [showdown](https://github.com/peterselj/showdown) project:

1. <https://console.firebase.google.com> → **Add project** (any name, e.g.
   `draft-board-sync`; Analytics off is fine).
2. **Build → Realtime Database → Create Database** → a US region → start in
   **test mode**.
3. **Project settings (gear) → Your apps → Web (`</>`)** → register the app (no
   Hosting needed).
4. Copy the `firebaseConfig` object into [`src/lib/firebaseConfig.js`](src/lib/firebaseConfig.js),
   replacing the blank fields. Include `databaseURL` — that's what turns live
   sync on; it's on the Realtime Database page, like
   `https://draft-board-sync-default-rtdb.firebaseio.com`.
5. **Realtime Database → Rules** → replace the test-mode rules with
   [`database.rules.json`](database.rules.json) → **Publish**. Test-mode rules
   expire 30 days after the database is created and sync silently stops, so do
   this before then.
6. Commit and push; GitHub Pages serves the rest. `npm run dev` locally works
   the same way once the config is filled in.

Leave `firebaseConfig.js` blank and nothing changes — every room stays
local-only, exactly as before. Details and the security model:
[docs/ROOMS.md](docs/ROOMS.md).

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
