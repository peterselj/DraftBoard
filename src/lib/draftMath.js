// Core valuation math for The Draft Room.
//
// Two multipliers, kept deliberately separate:
//   1. Budget inflation  — global: league-wide $ left vs. sheet value left.
//   2. Positional scarcity — local: each position's demand/supply ratio now
//      vs. at draft start.
//
// KNOWN LIMITATION (flagged 2026-08-10, not yet fixed):
// Scarcity is a raw head-count ratio. It can't see tiers/cliffs — losing the
// top 3 RBs while 25 replacement-level RBs remain barely moves the number,
// even though the position "feels" thinner. A tier-aware version would
// weight supply by roster-relevant quality (e.g. only count RB1-24 in a
// 12-team/2-starter league) instead of counting every remaining player
// equally. Backlogged in FEATURE_BACKLOG.md.

import { DEFAULT_SCORING } from "./scoring.js";

export const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];
export const FLEX_ELIGIBLE = ["RB", "WR", "TE"];
export const SCARCITY_POS = ["QB", "RB", "WR", "TE"];

export const DEFAULT_SETTINGS = {
  numTeams: 12,
  budget: 200,
  roster: { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, K: 1, DEF: 1, BENCH: 6 },
  scoring: DEFAULT_SCORING,
};

export function defaultTeams(numTeams) {
  return Array.from({ length: numTeams }, (_, i) => ({
    id: `t${i}`,
    name: i === 0 ? "My Team" : `Team ${i + 1}`,
    isMe: i === 0,
  }));
}

/** Per-team roster slot accounting: how many dedicated/flex/bench slots are
 *  filled and open, given the players currently drafted by that team. */
export function teamSlotBreakdown(teamId, players, roster) {
  const drafted = players.filter((p) => p.draftedBy === teamId);
  const rawCount = {};
  POSITIONS.forEach((p) => (rawCount[p] = 0));
  drafted.forEach((p) => {
    rawCount[p.pos] = (rawCount[p.pos] || 0) + 1;
  });

  const dedicatedFilled = {};
  const overflow = {};
  POSITIONS.forEach((pos) => {
    const cap = roster[pos] || 0;
    dedicatedFilled[pos] = Math.min(rawCount[pos] || 0, cap);
    overflow[pos] = Math.max(0, (rawCount[pos] || 0) - cap);
  });

  const flexOverflow = FLEX_ELIGIBLE.reduce((s, pos) => s + overflow[pos], 0);
  const flexFilled = Math.min(flexOverflow, roster.FLEX || 0);

  const totalDrafted = drafted.length;
  const totalRosterSize =
    POSITIONS.reduce((s, p) => s + (roster[p] || 0), 0) +
    (roster.FLEX || 0) +
    (roster.BENCH || 0);
  const dedicatedFilledSum = POSITIONS.reduce((s, p) => s + dedicatedFilled[p], 0);
  const benchFilled = Math.max(0, totalDrafted - dedicatedFilledSum - flexFilled);

  const openDedicated = {};
  POSITIONS.forEach((pos) => {
    openDedicated[pos] = Math.max(0, (roster[pos] || 0) - dedicatedFilled[pos]);
  });
  const openFlex = Math.max(0, (roster.FLEX || 0) - flexFilled);
  const openBench = Math.max(0, (roster.BENCH || 0) - benchFilled);
  const openSlotsTotal = Math.max(0, totalRosterSize - totalDrafted);

  return {
    rawCount, dedicatedFilled, flexFilled, benchFilled,
    openDedicated, openFlex, openBench, openSlotsTotal,
    totalRosterSize, totalDrafted,
  };
}

/** How many players each scarcity position has in a pool — the supply half of
 *  the baseline. Snapshotted when a draft starts so the baseline reflects the
 *  pool actually being drafted from (including hand-added players), not the
 *  shipped seed file. */
export function positionCounts(players) {
  const counts = {};
  SCARCITY_POS.forEach((pos) => {
    counts[pos] = players.filter((p) => p.pos === pos).length;
  });
  return counts;
}

/** Fixed "at draft start" demand/supply ratio per position — the norm live
 *  scarcity is measured against. */
export function computeBaseline(settings, allPlayers) {
  return computeBaselineFromCounts(settings, positionCounts(allPlayers));
}

/** Same, from a stored supply snapshot. Demand is recomputed from current
 *  settings so editing roster slots mid-draft doesn't leave a stale baseline. */
export function computeBaselineFromCounts(settings, supply) {
  const { numTeams, roster } = settings;
  const at = (pos) => (supply && supply[pos]) || 0;
  const dedicatedDemand = {};
  SCARCITY_POS.forEach((pos) => {
    dedicatedDemand[pos] = (roster[pos] || 0) * numTeams;
  });
  const totalFlexDemand = (roster.FLEX || 0) * numTeams;
  const flexSupplyTotal = FLEX_ELIGIBLE.reduce((s, pos) => s + at(pos), 0) || 1;

  const ratio = {};
  SCARCITY_POS.forEach((pos) => {
    const flexShare = FLEX_ELIGIBLE.includes(pos)
      ? totalFlexDemand * (at(pos) / flexSupplyTotal)
      : 0;
    const demand = dedicatedDemand[pos] + flexShare;
    ratio[pos] = at(pos) > 0 ? demand / at(pos) : 99;
  });
  return ratio;
}

/** Live budget-inflation + positional-scarcity multipliers given the
 *  current state of the draft.
 *
 *  `baseValueOf` says what a player is worth standalone. It must be the same
 *  currency the board prices in — the model value when we have projections —
 *  otherwise inflation measures dollars against a yardstick that never
 *  summed to the budget in the first place, and reads hot from pick one. */
export function computeLive(
  players, teams, settings, baselineRatio,
  baseValueOf = (p) => p.model ?? p.projected
) {
  const { roster, budget } = settings;

  let totalRemainingBudget = 0;
  let totalOpenSlots = 0;
  const teamStats = {};
  const openDedByPos = {};
  SCARCITY_POS.forEach((p) => (openDedByPos[p] = 0));
  let openFlexTotal = 0;

  teams.forEach((t) => {
    const spent = players
      .filter((p) => p.draftedBy === t.id)
      .reduce((s, p) => s + (p.paid || 0), 0);
    const remaining = budget - spent;
    const breakdown = teamSlotBreakdown(t.id, players, roster);
    const maxBid = remaining - Math.max(0, breakdown.openSlotsTotal - 1);
    teamStats[t.id] = { spent, remaining, maxBid, breakdown };
    totalRemainingBudget += remaining;
    totalOpenSlots += breakdown.openSlotsTotal;
    SCARCITY_POS.forEach((p) => {
      openDedByPos[p] += breakdown.openDedicated[p];
    });
    openFlexTotal += breakdown.openFlex;
  });

  const competitiveDollars = Math.max(0, totalRemainingBudget - totalOpenSlots);
  const undraftedValueSum = players
    .filter((p) => !p.drafted)
    .reduce((s, p) => s + Math.max(0, (baseValueOf(p) ?? 1) - 1), 0);
  const budgetInflationMult = undraftedValueSum > 0 ? competitiveDollars / undraftedValueSum : 1;

  const liveSupply = {};
  SCARCITY_POS.forEach((pos) => {
    liveSupply[pos] = players.filter((p) => !p.drafted && p.pos === pos).length;
  });
  const flexSupplyTotal = FLEX_ELIGIBLE.reduce((s, pos) => s + liveSupply[pos], 0) || 1;

  const scarcityMult = {};
  SCARCITY_POS.forEach((pos) => {
    const flexShare = FLEX_ELIGIBLE.includes(pos)
      ? openFlexTotal * (liveSupply[pos] / flexSupplyTotal)
      : 0;
    const demand = openDedByPos[pos] + flexShare;
    const liveRatio = liveSupply[pos] > 0 ? demand / liveSupply[pos] : 99;
    const base = baselineRatio[pos] || 1;
    const raw = base > 0 ? liveRatio / base : 1;
    scarcityMult[pos] = Math.min(3, Math.max(0.4, raw));
  });

  return { teamStats, budgetInflationMult, scarcityMult, competitiveDollars, undraftedValueSum };
}

/** What a player is worth *right now*, given the state of the draft.
 *
 *  `base` is the player's standalone dollar value — the model value derived
 *  from projections when we have them, falling back to the sheet value.
 *  The $1 floor is held out of the multiplier: only money above the roster
 *  minimum inflates. */
export function adjustedValue(player, live, base = player.model ?? player.projected) {
  const b = Math.max(base ?? 1, 1);
  // K/DEF: budget inflation only — positional scarcity isn't meaningful there.
  const scarcity = SCARCITY_POS.includes(player.pos) ? live.scarcityMult[player.pos] || 1 : 1;
  const mult = live.budgetInflationMult * scarcity;
  return Math.max(1, Math.round(1 + (b - 1) * mult));
}
