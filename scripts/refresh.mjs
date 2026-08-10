// Rebuild public/data/values-<season>.json from live sources.
//
//   npm run refresh              # current season
//   npm run refresh -- 2027      # explicit season
//
// Run by .github/workflows/refresh-values.yml on a schedule and on demand.
// The app fetches the committed output at runtime, so refreshed numbers land
// without a rebuild — and the same file is the fallback when a live in-app
// refresh is blocked.

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetchSleeperProjections } from "../src/lib/sources/sleeper.js";
import { fetchEspnValues } from "../src/lib/sources/espn.js";
import { mergeSources, DEFAULT_SEASON } from "../src/lib/merge.js";

const here = dirname(fileURLToPath(import.meta.url));
const season = Number(process.argv[2]) || DEFAULT_SEASON;

async function main() {
  console.log(`Refreshing ${season} values…`);

  const [projections, market] = await Promise.all([
    fetchSleeperProjections(season).catch((e) => {
      console.error(`  ! Sleeper projections unavailable: ${e.message}`);
      return [];
    }),
    fetchEspnValues(season).catch((e) => {
      console.error(`  ! ESPN values unavailable: ${e.message}`);
      return [];
    }),
  ]);

  console.log(`  Sleeper: ${projections.length} projected players`);
  console.log(`  ESPN:    ${market.length} players, ${market.filter((p) => p.aav > 0).length} with auction values`);

  if (projections.length === 0 && market.length === 0) {
    throw new Error("Both sources failed — refusing to overwrite the dataset with nothing.");
  }

  const { players, unmatched } = mergeSources({ projections, market });
  console.log(`  Merged:  ${players.length} players (${unmatched.length} ESPN rows unmatched)`);
  if (unmatched.length) {
    console.log(`           e.g. ${unmatched.slice(0, 5).map((p) => p.name).join(", ")}`);
  }

  const payload = {
    season,
    generated: new Date().toISOString(),
    sources: {
      projections: "Sleeper (raw projected stat lines, scored by this league's settings)",
      market: "ESPN auction value average (ownership.auctionValueAverage)",
    },
    players,
  };

  const outDir = join(here, "..", "public", "data");
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `values-${season}.json`);
  writeFileSync(outFile, JSON.stringify(payload));
  const kb = (JSON.stringify(payload).length / 1024).toFixed(0);
  console.log(`Wrote ${outFile} (${kb} KB)`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
