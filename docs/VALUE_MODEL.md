# The value model

What `src/lib/valueModel.js` does, why it's built this way, and which choices
are still open. Reconcile this against the elboberto spreadsheet when it's to
hand — the assumptions below are the standard formulation, not a reverse-
engineering of that exact sheet.

## Why bottom-up

Published AAV tells you what drafters in *someone else's* league paid under
*their* settings. It's a market signal, not a valuation. Deriving dollars from
projected production for this specific league means:

- the numbers respond to our settings (12 teams, 3 WR, 0.5 PPR, $200);
- the market becomes something to bet **against** rather than copy;
- the disagreement between the two is visible as **Edge**.

## The pipeline

Value comes in two tranches, priced at different rates. This is the part that
matters most, and it's taken directly from the workbook:

```
points        = projected stat line x league scoring          (scoring.js)
starters[pos] = teams x dedicated slots, plus FLEX by merit
bench[pos]    = teams x bench slots, split in proportion to starters
startBaseline = points of the LAST STARTER at the position
benchBaseline = points of the LAST ROSTERED player at the position

startVORP     = max(0, points - startBaseline)      "makes him startable"
benchVORP     = max(0, points - benchBaseline)      "makes him rosterable"

value = (benchVORP - startVORP) x benchRate + startVORP x starterRate
```

The cheap tranche is what gets a player onto a roster at all; the dear tranche
is what makes him worth starting. In a 12-team league the starter rate comes
out around 2.5x the bench rate.

**Why not a single baseline?** Because it funnels the whole budget into the ~84
starters and prices everyone else at $1. Real rooms pay $8-12 for a competent
bench back. The marginal starter — zero startVORP, plenty of benchVORP — should
cost about $11, not $1, and a board that says $1 will have you passing on every
mid-tier player in the draft.

### The money

```
pool         = teams x budget - (filler slots) x teams
benchMoney   = pool x (1 - starterShare)          starterShare defaults to 0.88
starterMoney = pool x starterShare - (bench-rate spend on starters' first tranche)
```

K always holds back a dollar per slot — kickers are low-variance and nobody
spends real auction money on one. DEF used to be filler too, but
`settings.priceDefenses` (on by default) prices it with the same two-tier
VORP math as any other position instead: real dollars off its own projected
points, competing for the pool like QB/RB/WR/TE do. That's the diverge point
from the elboberto workbook itself, which holds DEF at flat $1 — see
`valueModel.js`'s `pricedPositions()` for why the default differs depending
on whether `priceDefenses` is present in the settings object at all (present
and true for the live app, absent — and so `undefined`, which reads as off —
for the elboberto fixture, which is why the golden-file test below still
matches the sheet to the cent). Bench dollars are *biddable* either way and
get spent on real players, which is why the pool is larger than a naive
"reserve $1 per slot" figure.

Starters pay the bench rate on their first tranche too, so that spend is
deducted before working out what a starter-grade point costs. Without it the
model would double-pay and overshoot the budget.

### FLEX allocation

Flex slots aren't split by a fixed ratio. The next-best RB/WR/TEs beyond each
position's dedicated starters compete, and the highest scorers take the slots.
On the 2025 workbook this reproduces its RB 27 / WR 33 split off 24 dedicated
each, without that rule being written down anywhere.

## Validated against the workbook

`test/valueModel.elboberto.test.js` feeds the sheet's own projected points into
`computeModelValues` and compares against the sheet's own dollar column:

| | |
| --- | --- |
| players compared | 144 priced above $1 |
| mean absolute difference | **$0.002** |
| worst single disagreement | **$0.01** (rounding) |
| starter rate | 0.3777 vs sheet 0.3778 |
| bench rate | 0.1527 vs sheet 0.1527 |

Two details were worth chasing to get there, and both are pinned by tests:

- **Baselines are the last starter, not the first non-starter.** Excel's
  `LARGE(range, k)` is 1-based, so the last starter has exactly zero
  starter-VORP.
- **Fractional bench counts round up.** Bench slots divide unevenly across
  positions (RB gets 23.14 of them), and rounding that up is what matches the
  sheet — verified against all four positions, where truncating was a rank
  short every time.

Treat a failure in that test as "did we mean to diverge from the sheet?" rather
than a flaky assertion.

## Choices worth revisiting

| Choice | Current | Alternative |
| --- | --- | --- |
| Starter share | 0.88 of the pool, adjustable in Settings | Derive it from observed spending in past drafts |
| Bench allocation | Proportional to starter counts | By merit, the way FLEX slots are allocated |
| DEF | Priced with real VORP (`priceDefenses: true`) | Flat $1 like the elboberto sheet — set `priceDefenses: false` |
| K | Flat $1, excluded from the pool | Price it too, if your league genuinely bids on kickers |
| Replacement level | Exactly the last starter / last rostered | Average a band around the cutoff (less jumpy) |

The starter share is the one worth tuning: it decides how much of the budget
concentrates at the top. Push it to 0.95 and studs get dearer while bench
depth goes to scraps; drop it to 0.75 and the board flattens.

Note what is deliberately *not* claimed: that top-end prices rise with league
size. They come out roughly flat, because a bigger league brings both more
money and more rostered players. The workbook behaves the same way.

## Interaction with live multipliers

The model is a *pre-draft* valuation. During the draft it's adjusted, never
recomputed:

```
liveValue = $1 + (model $ − 1) × budgetInflation × scarcity[pos]
```

DEF gets real model dollars but no scarcity multiplier of its own — it's
priced, not in `SCARCITY_POS`, so `adjustedValue` only ever applies budget
inflation to a defense, not a position-specific scarcity reading. Adding one
would mean deciding what "DEF is drying up" should even mean; not attempted.

Budget inflation compares remaining money to remaining **model** value — the
same currency. Comparing against market AAV instead would read as inflated from
the first pick, because AAV totals were never scaled to this league's budget.
That was a real bug: the untouched board showed 1.28x room pressure before
anybody had spent a dollar. `test/integration.test.js` now pins an untouched
board at 1.00x.

## Scarcity: value on the board, not bodies

Scarcity asks "how hard is it to fill a slot at this position now, versus at
the start?" Both halves of that ratio matter:

```
demand[pos]   = open dedicated slots + this position's share of open FLEX slots
supply[pos]   = Σ (model value − 1) over undrafted players at the position
scarcity[pos] = (demand/supply now) / (demand/supply at draft start)
```

**Supply is measured in dollars, not head count.** This was the original
"can't see tiers" limitation, and counting value dissolves it without having to
define a tier at all. Take the top four RBs off a 130-deep board:

| | head count | value |
| --- | --- | --- |
| supply change | 133 → 129 (−3%) | $990 → $749 (−24%) |
| demand change | −4 slots (−17%) | −4 slots (−17%) |
| reported scarcity | **0.94x — RB got *easier*** | **1.17x — RB got harder** |

The head-count version was actively misleading: it saw four slots filled and
almost no supply lost, and concluded the position had loosened. Counting
dollars says what everyone at the table already knows.

The same arithmetic handles the cases a tier system would need special rules
for. Four replacement-level RBs leaving barely moves supply, so scarcity
barely moves. A stud stashed on someone's bench drains supply without reducing
starter demand, so the position tightens — correctly, because that player is
gone and nobody's starting requirement got easier.

**Price paid doesn't enter into it.** What leaves the board is the player's
value, whatever he cost. Price moves the *money* gauge instead. That split is
the whole point: a stud going for $1 makes the position scarcer *and* leaves
the room with surplus cash, and those are two different facts that should be
readable separately.

**Slot type matters, which is why picks are attributed to teams.**
`teamSlotBreakdown()` fills each team's dedicated slots first, then FLEX, then
bench. Aggregated across the league that gives `openDedicated[pos]` and
`openFlex` — the demand half. Without knowing *who* drafted a player we
couldn't tell a manager's RB2 (which reduces league-wide RB demand) from his
fourth RB (which doesn't reduce starter demand at all, and so leaves the
position just as tight for everyone else).

FLEX demand is shared out in proportion to each position's remaining *value*,
matching the supply measure.
