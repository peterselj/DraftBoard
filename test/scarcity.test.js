// Scarcity measures *value* leaving the board, not bodies leaving it.
//
// The motivating case: drafting the top 4 RBs for $1 each. A head-count ratio
// barely notices (4 of ~130 RBs gone) and actually reports RB as *less* scarce,
// because four RB roster slots got filled. Counting dollars instead says what
// everyone at the table already knows — the position just got much thinner.

import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS, defaultTeams, computeBaseline, computeLive, positionSupply,
} from "../src/lib/draftMath.js";

const settings = { ...DEFAULT_SETTINGS };

/** Pool with a clear talent gradient: a few studs, a long replacement tail. */
function pool() {
  const players = [];
  const spec = { RB: 60, WR: 60, TE: 30, QB: 30 };
  for (const [pos, n] of Object.entries(spec)) {
    for (let i = 0; i < n; i++) {
      players.push({
        id: `${pos}${i}`, name: `${pos} ${i}`, pos,
        model: Math.max(1, Math.round(70 * Math.exp(-i / 12))),
        drafted: false, paid: null, draftedBy: null,
      });
    }
  }
  return players;
}

const withPicks = (players, ids, teams, price) =>
  players.map((p) => (ids.includes(p.id)
    ? { ...p, drafted: true, paid: price, draftedBy: teams[ids.indexOf(p.id) % teams.length].id }
    : p));

test("taking the top 4 RBs cheap makes RB scarcer, not less scarce", () => {
  const players = pool();
  const teams = defaultTeams(settings.numTeams);
  const baseline = computeBaseline(settings, players);

  const before = computeLive(players, teams, settings, baseline);
  const after = computeLive(
    withPicks(players, ["RB0", "RB1", "RB2", "RB3"], teams, 1),
    teams, settings, baseline
  );

  assert.equal(before.scarcityMult.RB.toFixed(2), "1.00");
  assert.ok(after.scarcityMult.RB > 1.05,
    `RB should tighten meaningfully, got ${after.scarcityMult.RB.toFixed(2)}x`);
  // Nobody touched the other positions.
  assert.ok(Math.abs(after.scarcityMult.WR - 1) < 0.1,
    `WR should barely move, got ${after.scarcityMult.WR.toFixed(2)}x`);
});

test("taking 4 replacement-level RBs does not tighten the position", () => {
  const players = pool();
  const teams = defaultTeams(settings.numTeams);
  const baseline = computeBaseline(settings, players);
  const studs = computeLive(withPicks(players, ["RB0", "RB1", "RB2", "RB3"], teams, 1), teams, settings, baseline);
  const scrubs = computeLive(withPicks(players, ["RB56", "RB57", "RB58", "RB59"], teams, 1), teams, settings, baseline);

  assert.ok(studs.scarcityMult.RB > scrubs.scarcityMult.RB + 0.1,
    `losing studs (${studs.scarcityMult.RB.toFixed(2)}x) must read scarcer than losing scrubs (${scrubs.scarcityMult.RB.toFixed(2)}x)`);
});

test("what was paid does not affect scarcity — only what left the board", () => {
  const players = pool();
  const teams = defaultTeams(settings.numTeams);
  const baseline = computeBaseline(settings, players);
  const cheap = computeLive(withPicks(players, ["RB0", "RB1"], teams, 1), teams, settings, baseline);
  const pricey = computeLive(withPicks(players, ["RB0", "RB1"], teams, 70), teams, settings, baseline);

  assert.equal(cheap.scarcityMult.RB, pricey.scarcityMult.RB, "scarcity is about supply, not spend");
  assert.ok(pricey.budgetInflationMult < cheap.budgetInflationMult,
    "price is what moves the money gauge instead");
});

test("a stud stashed on the bench still drains the position", () => {
  const players = pool();
  const teams = defaultTeams(settings.numTeams);
  const baseline = computeBaseline(settings, players);
  // One team takes six RBs: two start, one flexes, the rest ride the bench.
  const hoard = ["RB0", "RB1", "RB2", "RB3", "RB4", "RB5"];
  const after = computeLive(
    players.map((p) => (hoard.includes(p.id) ? { ...p, drafted: true, paid: 5, draftedBy: teams[0].id } : p)),
    teams, settings, baseline
  );
  assert.ok(after.scarcityMult.RB > 1.05,
    `hoarding should tighten RB for everyone else, got ${after.scarcityMult.RB.toFixed(2)}x`);
});

test("filling a starting slot reduces demand for that position", () => {
  const players = pool();
  const teams = defaultTeams(settings.numTeams);
  const baseline = computeBaseline(settings, players);
  const before = computeLive(players, teams, settings, baseline);
  // Every team fills a QB slot with an identical mid-tier QB's worth of value.
  const qbIds = players.filter((p) => p.pos === "QB").slice(10, 22).map((p) => p.id);
  const after = computeLive(withPicks(players, qbIds, teams, 5), teams, settings, baseline);

  assert.ok(after.scarcityMult.QB < before.scarcityMult.QB,
    "once everyone has their starting QB, remaining QBs matter less");
});

test("changing league size doesn't corrupt the scarcity reading", () => {
  // Model dollars scale with the size of the pot, so a baseline captured under
  // one set of league settings is meaningless under another. Deriving the
  // baseline from the whole pool (drafted players included) keeps both halves
  // of the ratio in the same units, whatever the settings.
  const players = pool();
  for (const numTeams of [4, 8, 12, 16]) {
    const s = { ...settings, numTeams };
    const teams = defaultTeams(numTeams);
    const live = computeLive(players, teams, s, computeBaseline(s, players));
    for (const pos of ["QB", "RB", "WR", "TE"]) {
      assert.equal(live.scarcityMult[pos].toFixed(2), "1.00",
        `${numTeams}-team league should start neutral at ${pos}, got ${live.scarcityMult[pos].toFixed(2)}x`);
    }
  }
});

test("the FLEX reading tracks the combined skill-position pool", () => {
  const players = pool();
  const teams = defaultTeams(settings.numTeams);
  const baseline = computeBaseline(settings, players);
  assert.equal(computeLive(players, teams, settings, baseline).scarcityMult.FLEX.toFixed(2), "1.00");

  // Drain the top of RB *and* WR: flex-eligible talent overall is thinner.
  const drained = withPicks(players, ["RB0", "RB1", "RB2", "WR0", "WR1", "WR2"], teams, 5);
  const after = computeLive(drained, teams, settings, baseline);
  assert.ok(after.scarcityMult.FLEX > 1.02,
    `FLEX should tighten, got ${after.scarcityMult.FLEX.toFixed(2)}x`);

  // QB is not flex-eligible, so a run on quarterbacks must not move it.
  const qbRun = withPicks(players, ["QB0", "QB1", "QB2", "QB3"], teams, 5);
  const afterQb = computeLive(qbRun, teams, settings, baseline);
  assert.ok(Math.abs(afterQb.scarcityMult.FLEX - 1) < 0.02,
    `a QB run shouldn't move FLEX, got ${afterQb.scarcityMult.FLEX.toFixed(2)}x`);
});

test("position supply is measured in dollars above the floor", () => {
  const supply = positionSupply([
    { pos: "RB", model: 61 },
    { pos: "RB", model: 1 },
    { pos: "WR", model: 21 },
  ]);
  assert.equal(supply.RB, 60);
  assert.equal(supply.WR, 20);
  assert.equal(supply.TE, 0);
});
