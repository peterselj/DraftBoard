// Builds the standalone shareable HTML report from the latest Polymarket vs
// JP $ comparison. Reads scripts/prototypes/out/polymarket-vs-jp.json
// (produced by polymarket-fantasy-values.mjs) and writes public/polymarket.html
// — a fully static page, unlinked from the app's own UI/routing.
//
// Run: node scripts/prototypes/polymarket-fantasy-values.mjs && node scripts/prototypes/build-report.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

const { generated, results } = JSON.parse(
  readFileSync(join(here, "out", "polymarket-vs-jp.json"), "utf8")
);

// RB/WR: the full field (their matched pools top out at 43 and 46 — "top 45"
// is effectively "everyone we can price"). QB/TE stay at 15: those pools are
// dominated by backups with no real signal past the first dozen names.
const LIMITS = { QB: 15, RB: 45, WR: 45, TE: 15 };

// A row is "thin" when nobody is actually bidding on it — bestBid under a
// penny means the quoted price is just the midpoint of an empty order book,
// not a considered price. Traded volume looks like the obvious thinness
// signal but isn't reliable (Josh Allen shows $0 recorded volume despite a
// live, tight 28c/30c book) — bestBid is what actually separates "a handful
// of traders have real conviction here" from "nobody has touched this."
const THIN_BID = 0.01;
function markRows(rows) {
  return rows.map((r) => ({ ...r, thin: r.bestBid == null || r.bestBid < THIN_BID }));
}

const DATA = {};
for (const pos of Object.keys(LIMITS)) {
  DATA[pos] = markRows(results[pos].rows.slice(0, LIMITS[pos])).map((r) => ({
    name: r.name,
    jpRank: r.jpRank,
    jpValue: r.jpValue,
    marketValue: r.marketValue,
    dollarDelta: r.dollarDelta,
    thin: r.thin,
  }));
}

const pools = {
  QB: results.QB.jpPool, RB: results.RB.jpPool,
  WR: results.WR.jpPool, TE: results.TE.jpPool,
};
const volumes = {
  QB: results.QB.totalMarketVolume, RB: results.RB.totalMarketVolume,
  WR: results.WR.totalMarketVolume, TE: results.TE.totalMarketVolume,
};

const snapshotDate = new Date(generated).toLocaleDateString("en-US", {
  year: "numeric", month: "long", day: "numeric",
});

const template = readFileSync(join(here, "report-template.html"), "utf8");
const out = template
  .replace("__DATA__", JSON.stringify(DATA))
  .replace("__SNAPSHOT_DATE__", snapshotDate)
  .replace("__QB_POOL__", pools.QB.toFixed(2))
  .replace("__QB_VOL__", Math.round(volumes.QB).toLocaleString())
  .replace("__RB_POOL__", pools.RB.toFixed(2))
  .replace("__RB_VOL__", Math.round(volumes.RB).toLocaleString())
  .replace("__WR_POOL__", pools.WR.toFixed(2))
  .replace("__WR_VOL__", Math.round(volumes.WR).toLocaleString())
  .replace("__TE_POOL__", pools.TE.toFixed(2))
  .replace("__TE_VOL__", Math.round(volumes.TE).toLocaleString());

writeFileSync(join(repoRoot, "public", "polymarket.html"), out);
console.log("Wrote public/polymarket.html");
