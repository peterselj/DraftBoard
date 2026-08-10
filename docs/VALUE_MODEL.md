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

## Known limitation

Scarcity is a raw head-count ratio and can't see tiers. Losing the top 3 RBs
while 25 replacement-level RBs remain barely moves the multiplier, even though
the position is meaningfully thinner. A tier-aware version would weight supply
by roster-relevant quality — count RB1–24 in a 12-team/2-starter league rather
than every remaining body. Tracked in `FEATURE_BACKLOG.md`.

Note that the model's replacement-level logic *already* knows where the cliff
is; it's only the live scarcity multiplier that doesn't. That's the most likely
place to reuse existing code when this gets fixed.
