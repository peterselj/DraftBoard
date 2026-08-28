// PROTOTYPE — not wired into the app. Answers one question: does Polymarket's
// season-long "fantasy points leader" market field disagree with our
// bottoms-up JP $ model in ways that would actually move an auction price?
//
// Data: Polymarket's public Gamma API (no key, no auth) for the four
// "Fantasy Football: 2026-27 <POS> Points Leader" markets. Each is a
// winner-take-all field: one market per candidate, each priced as
// P(that player finishes #1 in fantasy points at his position).
//
// v1 of this script redistributed each position's JP $ pool in direct
// proportion to raw probability. That's wrong on two independent counts,
// both caught by sanity-checking the output against real numbers rather than
// trusting the pipeline:
//
//   1. P(finish #1 of ~40) is not a linear rescaling of point production.
//      Gibbs at 32% vs. McCaffrey at 6.85% does NOT mean Gibbs is expected to
//      score ~4.7x McCaffrey's points — our own projections have them 17%
//      apart (299.9 vs 256.0). Win-probability in a large field is a *softmax*
//      of underlying strength (Plackett-Luce / Gumbel-max), so the right
//      inversion is logarithmic: points_i - points_j = beta * ln(P_i/P_j),
//      not proportional to P_i/P_j directly. beta is the season's assumed
//      point-total standard deviation — genuinely uncertain, which is why the
//      report exposes it as a slider rather than baking in one number.
//
//   2. Markets nobody has traded (bestBid near $0) aren't "5% conviction" —
//      they're un-priced. Feeding them through ANY transform, linear or log,
//      manufactures a number from noise (v1 had untraded backups like Isiah
//      Pacheco pricing higher than Jonathan Taylor). Rows without a real bid
//      get no market figure at all now, full stop — see REAL_BID_MIN below.
//
// This script only fetches + matches + tags "real" vs. "thin" and hands the
// raw probabilities to the report; the log-odds -> $ conversion itself lives
// client-side in the report (report-template.html) so the beta assumption is
// an interactive slider, not a fixed number baked into a build step.
//
// Run: node scripts/prototypes/polymarket-fantasy-values.mjs
// Output: scripts/prototypes/out/polymarket-vs-jp.json (also printed as a table)

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeModelValues } from "../../src/lib/valueModel.js";
import { DEFAULT_SETTINGS } from "../../src/lib/draftMath.js";
import { normalize } from "../../src/lib/fuzzy.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

// Below this best-bid, a contract has no real two-sided market behind it —
// see the RB spot-check that started this: Isiah Pacheco (bestBid $0.003)
// and Jonathan Taylor (bestBid $0.04) both showed ~5% "probability," but only
// one of those numbers reflects anyone actually trading.
const REAL_BID_MIN = 0.02;

const EVENTS = {
  QB: "fantasy-football-2026-27-qb-points-leader-20260807010541883",
  RB: "fantasy-football-2026-27-rb-points-leader-20260807010548393",
  WR: "fantasy-football-2026-27-wr-points-leader-20260807010554721",
  TE: "fantasy-football-2026-27-te-points-leader-20260807010600911",
};

async function fetchLeaderField(slug) {
  const url = `https://gamma-api.polymarket.com/events?slug=${slug}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Polymarket fetch failed for ${slug}: ${res.status}`);
  const [event] = await res.json();
  if (!event) throw new Error(`No event returned for slug ${slug}`);
  return event.markets.map((m) => {
    const prices = JSON.parse(m.outcomePrices); // ["Yes price", "No price"]
    return {
      name: m.groupItemTitle,
      prob: Number(prices[0]),
      bestBid: m.bestBid == null ? null : Number(m.bestBid),
    };
  }).filter((r) => r.name && Number.isFinite(r.prob));
}

function loadCurrentPool() {
  const raw = readFileSync(join(repoRoot, "public/data/values-2026.json"), "utf8");
  const { players } = JSON.parse(raw);
  const { values, starterRate } = computeModelValues(players, DEFAULT_SETTINGS);
  const pool = players
    .map((p) => ({ ...p, jpValue: values.get(p.id) ?? null }))
    .filter((p) => p.jpValue != null);
  return { pool, starterRate };
}

function compareForPosition(pos, field, pool) {
  const byNorm = new Map(pool.filter((p) => p.pos === pos).map((p) => [normalize(p.name), p]));

  const matched = [];
  const unmatched = [];
  for (const row of field) {
    const p = byNorm.get(normalize(row.name));
    if (p) matched.push({ ...row, jpValue: p.jpValue, id: p.id });
    else unmatched.push(row.name);
  }

  const rows = matched.map((r) => ({
    name: r.name,
    prob: r.prob,
    bestBid: r.bestBid,
    real: r.bestBid != null && r.bestBid >= REAL_BID_MIN,
    jpValue: Math.round(r.jpValue * 100) / 100,
  }));

  rows.sort((a, b) => b.jpValue - a.jpValue);
  rows.forEach((r, i) => { r.jpRank = i + 1; });

  return {
    pos,
    jpPool: Math.round(matched.reduce((s, r) => s + r.jpValue, 0) * 100) / 100,
    realCount: rows.filter((r) => r.real).length,
    matchedCount: rows.length,
    rows,
    unmatched,
  };
}

async function main() {
  console.log("Fetching Polymarket fantasy points-leader fields…");
  const { pool, starterRate } = loadCurrentPool();

  const results = {};
  for (const [pos, slug] of Object.entries(EVENTS)) {
    const field = await fetchLeaderField(slug);
    results[pos] = compareForPosition(pos, field, pool);
    const r = results[pos];
    console.log(`  ${pos}: ${field.length} Polymarket candidates, ${r.realCount} with a real bid (of ${r.matchedCount} matched to our pool)`);
  }

  const outDir = join(here, "out");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "polymarket-vs-jp.json");
  writeFileSync(outPath, JSON.stringify({ generated: new Date().toISOString(), starterRate, results }, null, 2));
  console.log(`\nWrote ${outPath}`);

  // Preview at a representative beta=30 just so the console output means
  // something; the report itself makes this a live slider.
  const beta = 30;
  for (const pos of Object.keys(EVENTS)) {
    const { rows } = results[pos];
    const real = rows.filter((r) => r.real).sort((a, b) => b.prob - a.prob);
    if (!real.length) { console.log(`\n=== ${pos} — no rows with a real bid ===`); continue; }
    const anchor = real[0];
    console.log(`\n=== ${pos} — anchor ${anchor.name} (JP $${anchor.jpValue}), beta=${beta} ===`);
    for (const r of real) {
      const corrected = anchor.jpValue + beta * Math.log(r.prob / anchor.prob) * starterRate;
      const delta = corrected - r.jpValue;
      console.log(`  ${r.name.padEnd(22)} JP $${String(r.jpValue).padStart(6)}  ->  $${corrected.toFixed(2).padStart(7)}  (${delta >= 0 ? "+" : ""}${delta.toFixed(2)})`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
