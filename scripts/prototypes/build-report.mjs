// Builds the standalone shareable HTML report from the latest Polymarket vs
// JP $ comparison. Reads scripts/prototypes/out/polymarket-vs-jp.json
// (produced by polymarket-fantasy-values.mjs) and writes public/polymarket.html
// — a fully static page, unlinked from the app's own UI/routing.
//
// The log-odds -> $ conversion (see polymarket-fantasy-values.mjs's header
// comment for why it's log-odds and not linear) happens client-side in the
// page itself, driven by a beta slider — that assumption is genuinely
// uncertain, so it's exposed as something to explore rather than a fixed
// number baked in at build time.
//
// Run: node scripts/prototypes/polymarket-fantasy-values.mjs && node scripts/prototypes/build-report.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

const { generated, starterRate, results } = JSON.parse(
  readFileSync(join(here, "out", "polymarket-vs-jp.json"), "utf8")
);

// RB/WR: the full matched field (tops out at 43 and 46 — "top 45" is
// effectively "everyone we can price"). QB/TE stay at 15: nothing past that
// has ever traded anyway (see realCount below).
const LIMITS = { QB: 15, RB: 45, WR: 45, TE: 15 };

const DATA = {};
const pools = {};
const realCounts = {};
for (const pos of Object.keys(LIMITS)) {
  const r = results[pos];
  DATA[pos] = r.rows.slice(0, LIMITS[pos]).map((row) => ({
    name: row.name,
    jpRank: row.jpRank,
    jpValue: row.jpValue,
    prob: row.prob,
    real: row.real,
  }));
  pools[pos] = r.jpPool;
  realCounts[pos] = { real: r.realCount, matched: r.matchedCount };
}

const snapshotDate = new Date(generated).toLocaleDateString("en-US", {
  year: "numeric", month: "long", day: "numeric",
});

const template = readFileSync(join(here, "report-template.html"), "utf8");
const out = template
  .replace("__DATA__", JSON.stringify(DATA))
  .replace("__STARTER_RATE_JS__", String(starterRate))
  .replace("__STARTER_RATE_DISPLAY__", starterRate.toFixed(3))
  .replace("__SNAPSHOT_DATE__", snapshotDate)
  .replace("__QB_POOL__", pools.QB.toFixed(2))
  .replace("__QB_REAL__", `${realCounts.QB.real} of ${realCounts.QB.matched}`)
  .replace("__RB_POOL__", pools.RB.toFixed(2))
  .replace("__RB_REAL__", `${realCounts.RB.real} of ${realCounts.RB.matched}`)
  .replace("__WR_POOL__", pools.WR.toFixed(2))
  .replace("__WR_REAL__", `${realCounts.WR.real} of ${realCounts.WR.matched}`)
  .replace("__TE_POOL__", pools.TE.toFixed(2))
  .replace("__TE_REAL__", `${realCounts.TE.real} of ${realCounts.TE.matched}`);

writeFileSync(join(repoRoot, "public", "polymarket.html"), out);
console.log("Wrote public/polymarket.html");
