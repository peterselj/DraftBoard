# The Draft Room

A live fantasy football auction-draft companion. Started as a Claude.ai artifact,
graduating to a real project so it can pull fresh data, get fixed/extended
properly, and live on GitHub.

## Origin story (context for whoever/whatever picks this up)

Built to go beyond elboberto's well-known auction calculator spreadsheet.
That sheet is good at averaging AAV across Yahoo/ESPN/NFFC into static
dollar values, but two things it doesn't do:

1. **Track live budget inflation correctly.** As the draft happens, money
   and value leave the board at different rates. The naive inflation
   formula (total budgets ÷ total sheet value) overstates inflation because
   it ignores that every open roster slot — including bench, K, DEF — has a
   guaranteed $1 floor that isn't really "competitive" money.
2. **Separate budget inflation from positional scarcity.** "We had to
   overpay" can mean two different things: the whole room is spending hot
   (global), or one specific position just dried up (local). Conflating
   them gives bad in-draft advice.

This app computes both, live, and shows adjusted "what this player is
actually worth right now" values as the draft happens.

## The math (see `src/lib/draftMath.js` for the real implementation)

**Budget inflation multiplier**
```
competitiveDollars = sum(remaining team budgets) − sum(remaining open roster slots)   [$1 reserved/slot]
undraftedValue      = sum(sheet $ − 1) over all undrafted players
budgetInflationMult = competitiveDollars / undraftedValue
```

**Positional scarcity multiplier** (per QB/RB/WR/TE)
```
liveRatio[pos]     = (open dedicated slots at pos + pos's share of open FLEX slots) / (undrafted players at pos)
baselineRatio[pos] = same ratio, computed at draft start (fixed roster reqs, full pool)
scarcityMult[pos]  = liveRatio[pos] / baselineRatio[pos], clamped to [0.4, 3]
```

**Live value**
```
liveValue = $1 + (sheet $ − 1) × budgetInflationMult × scarcityMult[pos]
```

### Known limitation — not yet fixed
Scarcity is a **raw head-count ratio**. It can't see tiers/cliffs. Losing
the top 3 RBs while 25 replacement-level RBs remain barely moves the
number, even though the position "feels" thinner in the room. A
tier-aware version would weight supply by roster-relevant quality (e.g.
only count RB1–24 in a 12-team/2-starter league) instead of counting every
remaining player equally. See `FEATURE_BACKLOG.md`.

## Project structure

```
src/
  App.jsx           — UI (single component, inline styles, "turf ledger" theme)
  lib/draftMath.js  — pure valuation math, no UI dependencies
  lib/storage.js    — localStorage persistence (swap for a backend later if needed)
  data/players2025.json — seed pool: elboberto's 2025 Yahoo/ESPN/NFFC avg AAV, positions tagged manually
scripts/
  gen_seed.mjs      — regenerates players2025.json from the source tuples (placeholder for a real refresh pipeline)
```

## Running it

```
npm install
npm run dev
```

## Refreshing to 2026 values

Not built yet — `npm run refresh-data` currently just regenerates the 2025
JSON from hardcoded tuples in `scripts/gen_seed.mjs`. The real version needs
to pull current-season AAV from Yahoo/ESPN/NFFC (or wherever) and write out
`src/data/players2026.json` in the same shape. See `FEATURE_BACKLOG.md`.

## Data provenance

Seed values are 2025 season averages from elboberto's public auction
calculator spreadsheet (10-team standard scoring AAV from Yahoo, ESPN, and
NFFC). Positions were tagged by hand, not pulled from source — worth a
spot check.
