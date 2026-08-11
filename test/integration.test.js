// End-to-end over the real published dataset: the model, the live multipliers
// and the money supply all have to agree with each other, or in-draft advice
// is quietly wrong.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { computeModelValues, rosterSize } from "../src/lib/valueModel.js";
import { DEFAULT_SETTINGS, defaultTeams, computeBaseline, computeLive, adjustedValue } from "../src/lib/draftMath.js";

const FILE = new URL("../public/data/values-2026.json", import.meta.url);
const dataset = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : null;

const settings = { ...DEFAULT_SETTINGS };
const skip = dataset ? false : "no published dataset — run `npm run refresh`";

test("the published dataset has the shape the app expects", { skip }, () => {
  assert.ok(dataset.players.length > 100, "should carry a real pool");
  const withStats = dataset.players.filter((p) => p.stats && Object.keys(p.stats).length);
  const withMarket = dataset.players.filter((p) => typeof p.espn === "number");
  assert.ok(withStats.length > 100, `${withStats.length} players have projections`);
  assert.ok(withMarket.length > 100, `${withMarket.length} players have market values`);
  for (const p of dataset.players) {
    assert.ok(p.id && p.name && p.pos, `malformed row: ${JSON.stringify(p).slice(0, 80)}`);
  }
});

test("an untouched board reads as neutral, not inflated", { skip }, () => {
  const players = dataset.players.map((p) => ({ ...p, drafted: false, paid: null, draftedBy: null }));
  const { values } = computeModelValues(players, settings);
  const baseValueOf = (p) => values.get(p.id) ?? p.projected ?? 1;
  const teams = defaultTeams(settings.numTeams);
  const live = computeLive(players, teams, settings, computeBaseline(settings, players, baseValueOf), baseValueOf);

  // Exactly 1.00x, not merely close: anything else rounds a $50 player to $49
  // and shows a "-1" drift before a single bid has been made.
  assert.ok(Math.abs(live.budgetInflationMult - 1) < 1e-9,
    `inflation must start at exactly 1.00x, got ${live.budgetInflationMult.toFixed(6)}x`);
  for (const pos of ["QB", "RB", "WR", "TE"]) {
    assert.ok(Math.abs(live.scarcityMult[pos] - 1) < 0.01,
      `${pos} scarcity should start at 1.00x, got ${live.scarcityMult[pos].toFixed(2)}x`);
  }
});

test("paying over the odds early makes the rest of the room cheaper", { skip }, () => {
  const players = dataset.players.map((p) => ({ ...p, drafted: false, paid: null, draftedBy: null }));
  const { values } = computeModelValues(players, settings);
  const baseValueOf = (p) => values.get(p.id) ?? p.projected ?? 1;
  const teams = defaultTeams(settings.numTeams);
  const baseline = computeBaseline(settings, players, baseValueOf);
  const before = computeLive(players, teams, settings, baseline, baseValueOf);

  // Every team blows a third of its budget on one player.
  const ranked = [...players].sort((a, b) => baseValueOf(b) - baseValueOf(a));
  const after = computeLive(
    players.map((p) => {
      const i = ranked.slice(0, teams.length).findIndex((r) => r.id === p.id);
      return i === -1 ? p : { ...p, drafted: true, paid: 70, draftedBy: teams[i].id };
    }),
    teams, settings, baseline, baseValueOf
  );

  assert.ok(after.budgetInflationMult < before.budgetInflationMult,
    "money left the room faster than value did, so remaining players must get cheaper");
});

test("an untouched board shows no drift between model and live value", { skip }, () => {
  // The visible symptom of a non-neutral start: model $50, live $49, "-1".
  const players = dataset.players.map((p) => ({ ...p, drafted: false, paid: null, draftedBy: null }));
  const { values } = computeModelValues(players, settings);
  const baseValueOf = (p) => values.get(p.id) ?? p.projected ?? 1;
  const teams = defaultTeams(settings.numTeams);
  const live = computeLive(players, teams, settings, computeBaseline(settings, players, baseValueOf), baseValueOf);

  const drifted = players.filter((p) => {
    const model = baseValueOf(p);
    return Math.round(adjustedValue(p, live, model)) !== Math.round(model);
  });
  assert.equal(drifted.length, 0,
    `${drifted.length} players drift before any pick, e.g. ${drifted.slice(0, 3).map((p) => p.name).join(", ")}`);
});

test("live value tracks the multipliers", { skip }, () => {
  const player = { id: "x", pos: "WR", projected: 40, model: 40 };
  const hot = { budgetInflationMult: 1.25, scarcityMult: { WR: 1.2 } };
  const cold = { budgetInflationMult: 0.8, scarcityMult: { WR: 1 } };
  assert.ok(adjustedValue(player, hot, 40) > 40);
  assert.ok(adjustedValue(player, cold, 40) < 40);
  // The $1 floor never inflates.
  assert.equal(adjustedValue({ ...player, projected: 1 }, hot, 1), 1);
});

test("the money in the model matches the money in the room", { skip }, () => {
  const { values } = computeModelValues(dataset.players, settings);
  const { numTeams, budget, roster } = settings;
  // Only K and DEF slots are held back at $1; bench dollars are biddable and
  // get spent on real players, per the elboberto method.
  const pool = numTeams * budget - (roster.K + roster.DEF) * numTeams;
  const pricedSlots = numTeams * (rosterSize(roster) - roster.K - roster.DEF);
  const spend = [...values.values()]
    .sort((a, b) => b - a)
    .slice(0, pricedSlots)
    .reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(spend - pool) / pool < 0.05,
    `model allocates $${spend.toFixed(0)} against a $${pool} pool`);
});
