// Bottom-up auction values, the elboberto way: price players off *projected
// production for this league's settings*, not off what other sites' drafters
// happened to pay. The published AAV then becomes something to bet against
// rather than the source of truth.
//
//   points      = projected stat line scored by this league's rules
//   replacement = the best player at the position who does NOT start anywhere
//   VORP        = points above that replacement
//   dollars     = $1 floor + VORP's proportional share of the room's real money
//
// FLEX is allocated by merit, not by a fixed split: the best RB/WR/TEs left
// after each position's dedicated starters compete for the flex slots, which is
// what actually happens in a draft.

import { FLEX_ELIGIBLE, SCARCITY_POS } from "./draftMath.js";
import { projectedPoints, DEFAULT_SCORING } from "./scoring.js";

export function rosterSize(roster) {
  return Object.values(roster).reduce((s, n) => s + (n || 0), 0);
}

/** Starter demand per position, with flex slots handed to whichever
 *  flex-eligible players are actually next-best. */
export function starterCounts(byPos, settings) {
  const { numTeams, roster } = settings;
  const starters = {};
  Object.keys(byPos).forEach((pos) => {
    starters[pos] = (roster[pos] || 0) * numTeams;
  });

  let flexSlots = (roster.FLEX || 0) * numTeams;
  if (flexSlots > 0) {
    // Next-best available at each flex-eligible position, merged by points.
    const cursor = {};
    FLEX_ELIGIBLE.forEach((pos) => { cursor[pos] = starters[pos] || 0; });
    while (flexSlots > 0) {
      let bestPos = null;
      let bestPts = -Infinity;
      for (const pos of FLEX_ELIGIBLE) {
        const next = byPos[pos]?.[cursor[pos]];
        if (next && next.points > bestPts) {
          bestPts = next.points;
          bestPos = pos;
        }
      }
      if (!bestPos) break; // pool exhausted
      cursor[bestPos] += 1;
      starters[bestPos] += 1;
      flexSlots -= 1;
    }
  }
  return starters;
}

/**
 * @returns {{ values: Map<string, number>, replacementPoints: Object,
 *             pointsById: Map<string, number>, dollarsPerPoint: number }}
 */
export function computeModelValues(players, settings) {
  const scoring = settings.scoring || DEFAULT_SCORING;
  const { numTeams, budget, roster } = settings;

  // 1. Score every player we have a projection for.
  const scored = [];
  const pointsById = new Map();
  for (const p of players) {
    const points = projectedPoints(p, scoring);
    if (points == null) continue;
    pointsById.set(p.id, points);
    scored.push({ id: p.id, pos: p.pos, points });
  }
  if (scored.length === 0) {
    return { values: new Map(), replacementPoints: {}, pointsById, dollarsPerPoint: 0 };
  }

  // 2. Rank within each position.
  const byPos = {};
  for (const s of scored) {
    (byPos[s.pos] ||= []).push(s);
  }
  Object.values(byPos).forEach((list) => list.sort((a, b) => b.points - a.points));

  // 3. Replacement level = first player past the starter cutoff at his position.
  const starters = starterCounts(byPos, settings);
  const replacementPoints = {};
  Object.keys(byPos).forEach((pos) => {
    const list = byPos[pos];
    const cut = starters[pos] || 0;
    // Past the end of a thin pool, fall back to the worst projected player there.
    const repl = list[cut] ?? list[list.length - 1];
    replacementPoints[pos] = repl ? repl.points : 0;
  });

  // 4. VORP.
  const vorp = new Map();
  for (const s of scored) {
    vorp.set(s.id, Math.max(0, s.points - (replacementPoints[s.pos] ?? 0)));
  }

  // 5. Money chasing that VORP. Every roster slot needs $1 held back, so only
  //    the remainder is competitive money.
  const slots = rosterSize(roster);
  const totalMoney = Math.max(1, numTeams * budget - numTeams * slots);

  // Only the players who will actually be rostered absorb the money — counting
  // the whole 700-deep pool would dilute every real value toward zero.
  const draftable = [...vorp.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, numTeams * slots);
  const totalVorp = draftable.reduce((s, [, v]) => s + v, 0);
  const dollarsPerPoint = totalVorp > 0 ? totalMoney / totalVorp : 0;

  // 6. Dollars.
  const values = new Map();
  for (const [id, v] of vorp) {
    values.set(id, Math.max(1, 1 + v * dollarsPerPoint));
  }

  return { values, replacementPoints, pointsById, dollarsPerPoint };
}

/** Positions the model prices with real scarcity (K/DEF are $1 filler). */
export const MODELED_POS = SCARCITY_POS;
