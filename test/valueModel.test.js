import test from "node:test";
import assert from "node:assert/strict";
import { computeModelValues, rosterSize, starterCounts } from "../src/lib/valueModel.js";
import { projectedPoints, DEFAULT_SCORING, SCORING_PRESETS } from "../src/lib/scoring.js";
import { DEFAULT_SETTINGS } from "../src/lib/draftMath.js";

const settings = { ...DEFAULT_SETTINGS, scoring: DEFAULT_SCORING };

/** A synthetic pool with a clean linear talent curve per position. */
function pool() {
  const spec = { QB: 40, RB: 90, WR: 110, TE: 40 };
  const players = [];
  for (const [pos, n] of Object.entries(spec)) {
    for (let i = 0; i < n; i++) {
      const scale = 1 - i / n;
      players.push({
        id: `${pos}${i}`,
        name: `${pos} ${i}`,
        pos,
        stats: pos === "QB"
          ? { pass_yd: 4600 * scale, pass_td: 34 * scale, pass_int: 10, rush_yd: 300 * scale, rush_td: 4 * scale }
          : { rush_yd: (pos === "RB" ? 1300 : 60) * scale, rush_td: (pos === "RB" ? 11 : 0) * scale,
              rec: (pos === "RB" ? 55 : 110) * scale, rec_yd: (pos === "RB" ? 420 : 1400) * scale,
              rec_td: (pos === "RB" ? 3 : 10) * scale },
      });
    }
  }
  return players;
}

test("half-PPR scoring adds half a point per catch", () => {
  const p = { pos: "WR", stats: { rec: 100, rec_yd: 1000, rec_td: 5 } };
  const half = projectedPoints(p, SCORING_PRESETS["0.5 PPR"]);
  const full = projectedPoints(p, SCORING_PRESETS["Full PPR"]);
  const std = projectedPoints(p, SCORING_PRESETS["Standard"]);
  assert.equal(std, 100 + 30);
  assert.equal(half, std + 50);
  assert.equal(full, std + 100);
});

test("TE premium only pays tight ends", () => {
  const stats = { rec: 80, rec_yd: 900, rec_td: 6 };
  const te = projectedPoints({ pos: "TE", stats }, SCORING_PRESETS["TE premium"]);
  const wr = projectedPoints({ pos: "WR", stats }, SCORING_PRESETS["TE premium"]);
  assert.equal(te - wr, 40);
});

test("kickers and defenses fall back to the source's own total", () => {
  assert.equal(projectedPoints({ pos: "K", stats: { xpm: 40, pts_half_ppr: 141.2 } }), 141.2);
  assert.equal(projectedPoints({ pos: "DEF", stats: { sack: 40, pts_half_ppr: 98 } }), 98);
  assert.equal(projectedPoints({ pos: "WR" }), null);
});

test("dollars spent match the room's competitive money", () => {
  const { values } = computeModelValues(pool(), settings);
  const slots = rosterSize(settings.roster);
  const competitive = settings.numTeams * settings.budget - settings.numTeams * slots;
  const spentOnTop = [...values.values()]
    .sort((a, b) => b - a)
    .slice(0, settings.numTeams * slots)
    .reduce((s, v) => s + (v - 1), 0);
  assert.ok(Math.abs(spentOnTop - competitive) / competitive < 0.02,
    `top-pool spend ${spentOnTop.toFixed(0)} should be within 2% of ${competitive}`);
});

test("a replacement-level player prices at the $1 floor", () => {
  const { values, replacementPoints } = computeModelValues(pool(), settings);
  const players = pool();
  const rbs = players.filter((p) => p.pos === "RB")
    .map((p) => ({ id: p.id, pts: projectedPoints(p, DEFAULT_SCORING) }))
    .sort((a, b) => b.pts - a.pts);
  const replacement = rbs.find((r) => r.pts <= replacementPoints.RB);
  assert.equal(Math.round(values.get(replacement.id)), 1);
});

test("the best player is worth a real share of the budget", () => {
  const { values } = computeModelValues(pool(), settings);
  const top = Math.max(...values.values());
  assert.ok(top > 40 && top < settings.budget,
    `top value ${top.toFixed(0)} should be a meaningful but not absurd share of $${settings.budget}`);
});

test("flex slots go to whichever position is genuinely deeper", () => {
  const players = pool();
  const byPos = {};
  for (const p of players) {
    (byPos[p.pos] ||= []).push({ id: p.id, pos: p.pos, points: projectedPoints(p, DEFAULT_SCORING) });
  }
  Object.values(byPos).forEach((l) => l.sort((a, b) => b.points - a.points));
  const starters = starterCounts(byPos, settings);
  const dedicated = settings.numTeams * (settings.roster.RB + settings.roster.WR + settings.roster.TE);
  const withFlex = starters.RB + starters.WR + starters.TE;
  assert.equal(withFlex - dedicated, settings.numTeams * settings.roster.FLEX);
  assert.equal(starters.QB, settings.numTeams * settings.roster.QB, "QB must not absorb flex");
});

test("more teams bidding pushes the top values up", () => {
  const small = computeModelValues(pool(), { ...settings, numTeams: 8 });
  const big = computeModelValues(pool(), { ...settings, numTeams: 14 });
  assert.ok(Math.max(...big.values.values()) > Math.max(...small.values.values()));
});

test("an empty or projection-free pool degrades quietly", () => {
  assert.equal(computeModelValues([], settings).values.size, 0);
  assert.equal(computeModelValues([{ id: "x", pos: "WR" }], settings).values.size, 0);
});
