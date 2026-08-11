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

```
1. points      = projected stat line × league scoring        (scoring.js)
2. starters    = teams × dedicated slots, plus FLEX by merit
3. replacement = points of the best player at the position who doesn't start
4. VORP        = max(0, points − replacement)
5. dollars     = $1 + VORP × (competitive money / total VORP in the pool)
```

### FLEX allocation

Flex slots aren't split by a fixed ratio. The next-best RB/WR/TE beyond each
position's dedicated starters compete, and the highest-scoring ones take the
slots — which is what actually happens in a draft. A deep WR class therefore
absorbs more flex slots and pushes WR replacement level deeper, exactly as it
should.

### Competitive money

```
competitive money = teams × budget − teams × roster slots
```

Every roster slot needs a dollar, so that money was never biddable. In a
12-team, $200, 16-slot league: `12 × 200 − 12 × 16 = $2,208` of real money
chasing VORP. The tests assert the model allocates that number to within 2%.

### The draftable pool

Only the top `teams × roster slots` players by VORP absorb the money. Summing
VORP over all ~600 players in the pool would dilute every real value toward
zero, because hundreds of marginal players each carry a sliver of positive
VORP that nobody will ever pay for.

## Choices worth revisiting

| Choice | Current | Alternative |
| --- | --- | --- |
| Replacement level | First player past the starter cutoff | Average of a band around the cutoff (less jumpy) |
| Bench slots | Reserve $1 each, don't create demand | Treat some bench as real demand, deepening replacement |
| K / DEF | Priced off the source's pre-scored total | Re-score from components (the feeds don't expose enough) |
| Pool cap | `teams × slots` | Include a bench buffer |

These are the knobs most likely to differ from the elboberto sheet. Each is one
line in `valueModel.js`, and the tests pin the invariants that must survive any
change: money conservation, a $1 floor at replacement level, and top values
scaling with league size.

## Interaction with live multipliers

The model is a *pre-draft* valuation. During the draft it's adjusted, never
recomputed:

```
liveValue = $1 + (model $ − 1) × budgetInflation × scarcity[pos]
```

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
