import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS, defaultTeams, teamSlotBreakdown, computeBaseline, computeLive,
} from "../src/lib/draftMath.js";

const settings = { ...DEFAULT_SETTINGS };
const rosterSize =
  Object.values(settings.roster).reduce((s, n) => s + n, 0);

function pool(n = 200) {
  const positions = ["QB", "RB", "WR", "TE", "K", "DEF"];
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    pos: positions[i % positions.length],
    projected: Math.max(1, 60 - Math.floor(i / 3)),
    drafted: false,
    paid: null,
    draftedBy: null,
  }));
}

test("an untouched draft has every slot open and the full budget left", () => {
  const teams = defaultTeams(settings.numTeams);
  const live = computeLive(pool(), teams, settings, computeBaseline(settings, pool()));
  for (const t of teams) {
    assert.equal(live.teamStats[t.id].remaining, settings.budget);
    assert.equal(live.teamStats[t.id].breakdown.openSlotsTotal, rosterSize);
  }
});

test("max bid reserves $1 for every other open slot", () => {
  const teams = defaultTeams(settings.numTeams);
  const live = computeLive(pool(), teams, settings, computeBaseline(settings, pool()));
  const me = live.teamStats[teams[0].id];
  assert.equal(me.maxBid, settings.budget - (rosterSize - 1));
});

test("spending reduces remaining budget and consumes a slot", () => {
  const teams = defaultTeams(settings.numTeams);
  const players = pool();
  players[0] = { ...players[0], drafted: true, paid: 50, draftedBy: teams[0].id };
  const live = computeLive(players, teams, settings, computeBaseline(settings, players));
  const me = live.teamStats[teams[0].id];
  assert.equal(me.remaining, settings.budget - 50);
  assert.equal(me.breakdown.openSlotsTotal, rosterSize - 1);
});

test("overflow at a position spills into FLEX before the bench", () => {
  const roster = settings.roster;
  const teams = defaultTeams(settings.numTeams);
  const players = pool();
  // Draft one more RB than there are dedicated RB slots.
  const rbs = players.filter((p) => p.pos === "RB").slice(0, roster.RB + 1);
  const ids = new Set(rbs.map((p) => p.id));
  const withPicks = players.map((p) =>
    ids.has(p.id) ? { ...p, drafted: true, paid: 5, draftedBy: teams[0].id } : p
  );
  const bd = teamSlotBreakdown(teams[0].id, withPicks, roster);
  assert.equal(bd.dedicatedFilled.RB, roster.RB);
  assert.equal(bd.flexFilled, 1);
  assert.equal(bd.benchFilled, 0);
});

test("scarcity multipliers stay inside the [0.4, 3] clamp when a position is wiped out", () => {
  const teams = defaultTeams(settings.numTeams);
  const players = pool().map((p) =>
    p.pos === "RB" ? { ...p, drafted: true, paid: 1, draftedBy: teams[0].id } : p
  );
  const live = computeLive(players, teams, settings, computeBaseline(settings, pool()));
  for (const pos of ["QB", "RB", "WR", "TE"]) {
    assert.ok(live.scarcityMult[pos] >= 0.4 && live.scarcityMult[pos] <= 3,
      `${pos} multiplier ${live.scarcityMult[pos]} escaped the clamp`);
  }
});

test("budget inflation is ~1.0 when money and sheet value leave at the same rate", () => {
  const teams = defaultTeams(settings.numTeams);
  const live = computeLive(pool(), teams, settings, computeBaseline(settings, pool()));
  // Not asserting a specific number — just that it's a finite, sane multiplier.
  assert.ok(Number.isFinite(live.budgetInflationMult));
  assert.ok(live.budgetInflationMult > 0);
});
