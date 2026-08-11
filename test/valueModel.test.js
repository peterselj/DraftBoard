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

test("the last rostered player prices at the $1 floor", () => {
  const { values, benchBaseline } = computeModelValues(pool(), settings);
  const rbs = pool().filter((p) => p.pos === "RB")
    .map((p) => ({ id: p.id, pts: projectedPoints(p, DEFAULT_SCORING) }))
    .sort((a, b) => b.pts - a.pts);
  const lastRostered = rbs.find((r) => r.pts <= benchBaseline.RB);
  assert.equal(Math.round(values.get(lastRostered.id)), 1);
});

test("a starter-baseline player is worth real money, not $1", () => {
  // The two-tier model's reason for existing. A player right at the starter
  // cutoff has zero starter-VORP but plenty of bench-VORP, so he prices in the
  // high single digits — which is what rooms actually pay. A single-baseline
  // VORP model calls him $1 and would have you passing on every mid-tier arm.
  const { values, startBaseline } = computeModelValues(pool(), settings);
  const rbs = pool().filter((p) => p.pos === "RB")
    .map((p) => ({ id: p.id, pts: projectedPoints(p, DEFAULT_SCORING) }))
    .sort((a, b) => b.pts - a.pts);
  const marginalStarter = rbs.find((r) => r.pts <= startBaseline.RB);
  const price = values.get(marginalStarter.id);
  assert.ok(price > 3, `marginal starter should carry real value, got $${price.toFixed(2)}`);
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

test("deeper leagues push replacement level down", () => {
  // Note what is deliberately *not* asserted: that top-end prices rise with
  // league size. They come out roughly flat, because a bigger league brings
  // both more money and more rostered players, and those largely cancel. The
  // elboberto workbook behaves the same way, and real $200 auctions price the
  // top pick similarly at 10 and 12 teams. Asserting "more teams = pricier
  // studs" would be encoding folklore over the model's actual behaviour.
  const small = computeModelValues(pool(), { ...settings, numTeams: 8 });
  const big = computeModelValues(pool(), { ...settings, numTeams: 14 });
  assert.ok(big.startBaseline.RB < small.startBaseline.RB,
    "a 14-team league has to start worse running backs than an 8-team one");
  assert.ok(big.benchBaseline.WR < small.benchBaseline.WR);
});

test("a bigger starter share moves money from the bench to the starters", () => {
  const lean = computeModelValues(pool(), { ...settings, starterShare: 0.75 });
  const rich = computeModelValues(pool(), { ...settings, starterShare: 0.95 });
  assert.ok(rich.starterRate > lean.starterRate);
  assert.ok(rich.benchRate < lean.benchRate);
  assert.ok(Math.max(...rich.values.values()) > Math.max(...lean.values.values()),
    "concentrating money on starters should raise the top of the board");
});

test("an empty or projection-free pool degrades quietly", () => {
  assert.equal(computeModelValues([], settings).values.size, 0);
  assert.equal(computeModelValues([{ id: "x", pos: "WR" }], settings).values.size, 0);
});
