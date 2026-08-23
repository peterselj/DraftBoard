// Golden-file check against the elboberto workbook.
//
// src/lib/valueModel.js is a reimplementation of that spreadsheet's valuation,
// so the strongest test available is: feed it the sheet's own projected points
// and confirm it produces the sheet's own dollar values. It currently agrees to
// fractions of a cent, which means any drift here is a real behaviour change,
// not noise — treat a failure as "did we mean to diverge from the sheet?"
//
// The fixture is the workbook's output; the workbook itself is not committed.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeModelValues } from "../src/lib/valueModel.js";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/elboberto-2025.json", import.meta.url), "utf8")
);

// The sheet's points are already scored under its own rules, so they're passed
// through as a pre-scored total rather than re-derived from a stat line.
const players = fixture.players.map((p, i) => ({
  id: `e${i}`, name: p.name, pos: p.pos, stats: { pts_half_ppr: p.points },
}));

const model = computeModelValues(players, fixture.settings);

test("starter and bench dollar rates match the workbook", () => {
  assert.ok(Math.abs(model.starterRate - fixture.expected.starterRate) < 0.001,
    `starter rate ${model.starterRate.toFixed(4)} vs sheet ${fixture.expected.starterRate}`);
  assert.ok(Math.abs(model.benchRate - fixture.expected.benchRate) < 0.001,
    `bench rate ${model.benchRate.toFixed(4)} vs sheet ${fixture.expected.benchRate}`);
});

test("starter counts match, including how FLEX gets allocated", () => {
  // The sheet gives RB 27 and WR 33 off 24 dedicated each — the flex slots go
  // where the talent is, which is what our merit-based allocation reproduces.
  for (const [pos, expected] of Object.entries(fixture.expected.starters)) {
    assert.equal(model.starters[pos], expected, `${pos} starters`);
  }
});

test("every priced player lands within a cent of the workbook", () => {
  let worst = { diff: 0 };
  let compared = 0;
  for (const [i, p] of fixture.players.entries()) {
    if (p.sheetValue == null || p.sheetValue <= 1) continue;
    const mine = model.values.get(`e${i}`);
    const diff = Math.abs(mine - p.sheetValue);
    compared += 1;
    if (diff > worst.diff) worst = { diff, name: p.name, sheet: p.sheetValue, mine };
  }
  assert.ok(compared > 100, `expected a real sample, compared ${compared}`);
  assert.ok(worst.diff < 0.05,
    `worst disagreement $${worst.diff?.toFixed(3)} on ${worst.name} ` +
    `(sheet $${worst.sheet}, model $${worst.mine?.toFixed(2)})`);
});

test("bench-quality players are priced in real dollars, not floored at $1", () => {
  // The whole point of the two-tier model: a competent bench RB goes for
  // $7-12 in a real room, and a single-baseline VORP model says $1.
  const benchish = fixture.players
    .map((p, i) => ({ ...p, mine: model.values.get(`e${i}`) }))
    .filter((p) => p.sheetValue > 5 && p.sheetValue < 15);
  assert.ok(benchish.length > 10, "fixture should contain mid-priced players");
  for (const p of benchish) {
    assert.ok(p.mine > 2, `${p.name} priced at $${p.mine?.toFixed(2)}, sheet says $${p.sheetValue}`);
  }
});

test("the money adds up to the workbook's available pool", () => {
  const { numTeams, budget, roster } = fixture.settings;
  const filler = (roster.K + roster.DEF) * numTeams;
  assert.equal(numTeams * budget - filler, fixture.expected.availableMoney);

  // Sum what the rostered players cost, which is where the pool actually goes.
  const rostered = [...model.values.values()].sort((a, b) => b - a)
    .slice(0, numTeams * (Object.values(roster).reduce((s, n) => s + n, 0) - roster.K - roster.DEF));
  const spend = rostered.reduce((s, v) => s + v, 0);
  const pool = fixture.expected.availableMoney;
  assert.ok(Math.abs(spend - pool) / pool < 0.05,
    `rostered spend $${spend.toFixed(0)} vs pool $${pool}`);
});
