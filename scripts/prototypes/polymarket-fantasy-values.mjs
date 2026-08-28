// PROTOTYPE — not wired into the app. Answers one question: does Polymarket's
// season-long "fantasy points leader" market field disagree with our
// bottoms-up JP $ model in ways that would actually move an auction price?
//
// Data: Polymarket's public Gamma API (no key, no auth) for the four
// "Fantasy Football: 2026-27 <POS> Points Leader" markets. Each is a
// winner-take-all field: one market per candidate, each priced as
// P(that player finishes #1 in fantasy points at his position).
//
// Method: treat the probability field as a Plackett-Luce / softmax choice
// model, where P(i) ∝ strength(i). That means each player's normalized
// probability *is* their relative strength within the field — no de-vig math
// needed beyond normalizing the named field to sum to 1 (the small residual
// mass belongs to unlisted/rookie players the market still prices as live
// longshots, and we drop it here). We then redistribute the SAME total JP $
// our model already assigns to that field of players, proportional to market
// strength instead of VORP — an apples-to-apples reallocation, not a new
// absolute price. That sidesteps the much harder problem of turning a
// "P(leads league)" field into an absolute yardage/points number.
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
      volume: Number(m.volume || 0),
      // The reported "prob" above is just the midpoint of outcomePrices, which
      // for an untraded market is the midpoint of an empty book — not a
      // considered price. bestBid is the tell: real money resting on "yes" at
      // that level. Traded-volume looked like the obvious thinness signal but
      // is unreliable (e.g. Josh Allen shows $0 recorded volume despite a
      // live, tight 28c/30c book) — bestBid catches what volume misses.
      bestBid: m.bestBid == null ? null : Number(m.bestBid),
    };
  }).filter((r) => r.name && Number.isFinite(r.prob));
}

function loadCurrentPool() {
  const raw = readFileSync(join(repoRoot, "public/data/values-2026.json"), "utf8");
  const { players } = JSON.parse(raw);
  const { values } = computeModelValues(players, DEFAULT_SETTINGS);
  return players
    .map((p) => ({ ...p, jpValue: values.get(p.id) ?? null }))
    .filter((p) => p.jpValue != null);
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

  const probMass = matched.reduce((s, r) => s + r.prob, 0);
  const jpPool = matched.reduce((s, r) => s + r.jpValue, 0);

  const rows = matched.map((r) => ({
    name: r.name,
    prob: r.prob,
    marketShare: probMass > 0 ? r.prob / probMass : 0,
    jpValue: Math.round(r.jpValue * 100) / 100,
    marketValue: probMass > 0 ? Math.max(1, Math.round((jpPool * (r.prob / probMass)) * 100) / 100) : null,
    volume: r.volume,
    bestBid: r.bestBid,
  }));

  rows.sort((a, b) => b.jpValue - a.jpValue);
  rows.forEach((r, i) => { r.jpRank = i + 1; });
  const byMarket = [...rows].sort((a, b) => b.marketValue - a.marketValue);
  byMarket.forEach((r, i) => { r.marketRank = i + 1; });
  rows.forEach((r) => {
    r.rankDelta = r.jpRank - r.marketRank; // positive: market ranks him higher than we do
    r.dollarDelta = Math.round((r.marketValue - r.jpValue) * 100) / 100;
  });

  return { pos, jpPool: Math.round(jpPool * 100) / 100, totalMarketVolume: matched.reduce((s, r) => s + r.volume, 0), rows, unmatched };
}

async function main() {
  console.log("Fetching Polymarket fantasy points-leader fields…");
  const pool = loadCurrentPool();

  const results = {};
  for (const [pos, slug] of Object.entries(EVENTS)) {
    const field = await fetchLeaderField(slug);
    results[pos] = compareForPosition(pos, field, pool);
    console.log(`  ${pos}: ${field.length} Polymarket candidates, ${results[pos].unmatched.length} unmatched to our pool`);
  }

  const outDir = join(here, "out");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "polymarket-vs-jp.json");
  writeFileSync(outPath, JSON.stringify({ generated: new Date().toISOString(), results }, null, 2));
  console.log(`\nWrote ${outPath}`);

  for (const pos of Object.keys(EVENTS)) {
    const { rows, unmatched, jpPool, totalMarketVolume } = results[pos];
    console.log(`\n=== ${pos} — JP pool $${jpPool}, Polymarket volume $${Math.round(totalMarketVolume)} ===`);
    console.log(
      rows.slice(0, 12)
        .map((r) => `  ${String(r.jpRank).padStart(2)}. ${r.name.padEnd(24)} JP $${String(r.jpValue).padStart(6)}  ->  Mkt $${String(r.marketValue).padStart(6)}  (Δ${r.dollarDelta >= 0 ? "+" : ""}${r.dollarDelta}, rank ${r.rankDelta >= 0 ? "+" : ""}${r.rankDelta})`)
        .join("\n")
    );
    if (unmatched.length) console.log(`  Unmatched (not in our pool): ${unmatched.join(", ")}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
