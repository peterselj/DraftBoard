// Bottom-up auction values, following the elboberto spreadsheet's method:
// price players off *projected production for this league's settings*, not off
// what drafters elsewhere happened to pay.
//
// The important structural idea, taken from that sheet, is that a player's
// value comes in two tranches priced at different rates:
//
//   - the part that makes him *rosterable* (above the last drafted player at
//     his position) is cheap;
//   - the part that makes him *startable* (above the last starter) is dear.
//
// A single-baseline VORP model funnels the entire budget into the ~84 starters
// and prices everyone else at $1, which is not how auctions actually go: real
// rooms pay $8-12 for a competent bench RB. Splitting the tranches reproduces
// that curve, and reproduces the sheet's numbers.
//
//   value = (benchVORP − startVORP) × benchRate + startVORP × starterRate
//
// with starterRate ≈ 2.5× benchRate in a typical 12-team league.

import { FLEX_ELIGIBLE, SCARCITY_POS, POSITIONS } from "./draftMath.js";
import { projectedPoints, DEFAULT_SCORING } from "./scoring.js";

/** Positions whose dollars come out of the competitive pool. K and DEF are
 *  $1 filler — the sheet holds back exactly one dollar per K/DEF slot and
 *  spends the rest on real positions. */
const PRICED_POS = SCARCITY_POS;

export function rosterSize(roster) {
  return Object.values(roster).reduce((s, n) => s + (n || 0), 0);
}

/** Starter demand per position, with FLEX slots handed to whichever
 *  flex-eligible players are actually next-best rather than by a fixed split. */
export function starterCounts(byPos, settings) {
  const { numTeams, roster } = settings;
  const starters = {};
  POSITIONS.forEach((pos) => { starters[pos] = (roster[pos] || 0) * numTeams; });

  let flexSlots = (roster.FLEX || 0) * numTeams;
  if (flexSlots > 0) {
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
      if (!bestPos) break;
      cursor[bestPos] += 1;
      starters[bestPos] += 1;
      flexSlots -= 1;
    }
  }
  return starters;
}

/** Bench slots split across the priced positions in proportion to how many
 *  starters each carries — the sheet's approach, fractional counts and all. */
export function benchCounts(starters, settings) {
  const { numTeams, roster } = settings;
  const totalBench = (roster.BENCH || 0) * numTeams;
  const totalStarters = PRICED_POS.reduce((s, pos) => s + (starters[pos] || 0), 0) || 1;
  const bench = {};
  PRICED_POS.forEach((pos) => {
    bench[pos] = totalBench * ((starters[pos] || 0) / totalStarters);
  });
  return bench;
}

/** Points of the Nth-best player at a position — Excel's LARGE(range, k) as
 *  the sheet uses it: 1-based, so the baseline is the *last* starter rather
 *  than the first non-starter, and the last starter himself has zero
 *  starter-VORP.
 *
 *  Bench counts come out fractional (72 bench slots split across positions).
 *  Rounding those up is what reproduces the sheet exactly — verified against
 *  all four positions in the 2025 workbook, where ceil matched the implied
 *  baseline to the cent and truncation was a rank short.
 *
 *  Past the end of a thin pool this falls back to the worst projection. */
function pointsAtRank(list, count) {
  if (list.length === 0) return 0;
  const k = Math.max(1, Math.min(list.length, Math.ceil(count)));
  return list[k - 1].points;
}

/**
 * @returns {{ values: Map<string, number>, startBaseline, benchBaseline,
 *             starterRate: number, benchRate: number, pointsById: Map }}
 */
export function computeModelValues(players, settings) {
  const scoring = settings.scoring || DEFAULT_SCORING;
  const { numTeams, budget, roster } = settings;
  const starterShare = settings.starterShare ?? 0.88;

  // 1. Score everyone we have a projection for.
  const scored = [];
  const pointsById = new Map();
  for (const p of players) {
    const points = projectedPoints(p, scoring);
    if (points == null) continue;
    pointsById.set(p.id, points);
    scored.push({ id: p.id, pos: p.pos, points });
  }
  const empty = {
    values: new Map(), startBaseline: {}, benchBaseline: {},
    starterRate: 0, benchRate: 0, pointsById,
  };
  if (scored.length === 0) return empty;

  // 2. Rank within each position.
  const byPos = {};
  for (const s of scored) (byPos[s.pos] ||= []).push(s);
  Object.values(byPos).forEach((list) => list.sort((a, b) => b.points - a.points));

  // 3. Two baselines per position: last starter, and last rostered player.
  const starters = starterCounts(byPos, settings);
  const bench = benchCounts(starters, settings);
  const startBaseline = {};
  const benchBaseline = {};
  PRICED_POS.forEach((pos) => {
    const list = byPos[pos] || [];
    startBaseline[pos] = pointsAtRank(list, starters[pos] || 0);
    benchBaseline[pos] = pointsAtRank(list, (starters[pos] || 0) + (bench[pos] || 0));
  });

  // 4. The two VORP measures.
  const startVorp = new Map();
  const benchVorp = new Map();
  for (const s of scored) {
    if (!PRICED_POS.includes(s.pos)) continue;
    startVorp.set(s.id, Math.max(0, s.points - startBaseline[s.pos]));
    benchVorp.set(s.id, Math.max(0, s.points - benchBaseline[s.pos]));
  }

  // 5. Money. Only K/DEF slots are held back at $1 apiece; everything else is
  //    biddable, including bench dollars.
  const fillerSlots = ((roster.K || 0) + (roster.DEF || 0)) * numTeams;
  const totalMoney = Math.max(1, numTeams * budget - fillerSlots);

  // Bench rate first: it's set by the bench budget over the value that only
  // bench-quality players carry.
  const benchMoney = totalMoney * (1 - starterShare);
  let benchVorpSum = 0;
  PRICED_POS.forEach((pos) => {
    const list = byPos[pos] || [];
    const from = Math.round(starters[pos] || 0);
    const to = Math.round((starters[pos] || 0) + (bench[pos] || 0));
    for (let i = from; i < Math.min(to, list.length); i++) {
      benchVorpSum += benchVorp.get(list[i].id) || 0;
    }
  });
  const benchRate = benchVorpSum > 0 ? benchMoney / benchVorpSum : 0;

  // Starters also pay the bench rate on their first tranche, so that spend is
  // deducted before working out what a starter-grade point costs.
  let starterVorpSum = 0;
  for (const v of startVorp.values()) starterVorpSum += v;
  const gapSpend = PRICED_POS.reduce((sum, pos) => {
    const gap = Math.max(0, startBaseline[pos] - benchBaseline[pos]);
    return sum + gap * (starters[pos] || 0);
  }, 0);
  const starterMoney = totalMoney * starterShare - gapSpend * benchRate;
  const starterRate = starterVorpSum > 0 ? starterMoney / starterVorpSum : 0;

  // 6. Dollars.
  const values = new Map();
  for (const s of scored) {
    if (!PRICED_POS.includes(s.pos)) {
      values.set(s.id, 1); // K/DEF: the dollar we held back
      continue;
    }
    const sv = startVorp.get(s.id) || 0;
    const bv = benchVorp.get(s.id) || 0;
    const dollars = (bv - sv) * benchRate + sv * starterRate;
    values.set(s.id, Math.max(1, dollars));
  }

  return { values, startBaseline, benchBaseline, starterRate, benchRate, starters, bench, pointsById };
}

/** Positions the model prices with real scarcity (K/DEF are $1 filler). */
export const MODELED_POS = PRICED_POS;
