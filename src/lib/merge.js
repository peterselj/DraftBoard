// Join projections (Sleeper) to market values (ESPN) and trim the result to
// the players who could plausibly be drafted. Shared by the CLI refresh script
// and the in-app live refresh, so both produce identically shaped data.

import { playerKey } from "./names.js";

export const DEFAULT_SEASON = new Date().getUTCFullYear();

// A 12-team league rosters ~192 players; keep a healthy multiple so waiver
// bait and late-round fliers are still nominatable, without shipping all 2,000.
const MAX_PLAYERS = 600;

export function mergeSources({ projections = [], market = [] }) {
  const marketByKey = new Map();
  for (const m of market) {
    marketByKey.set(playerKey(m.name, m.pos), m);
  }

  const matched = new Set();
  const players = projections.map((p) => {
    const key = playerKey(p.name, p.pos);
    const m = marketByKey.get(key);
    if (m) matched.add(key);
    return {
      id: `slp-${p.sleeperId}`,
      name: p.name,
      pos: p.pos,
      team: p.team,
      stats: p.stats,
      adp: p.adp ?? m?.adp ?? null,
      // `espn` is a market column in the app; more sources can be added here.
      espn: m && m.aav > 0 ? Math.round(m.aav * 10) / 10 : null,
    };
  });

  const unmatched = market.filter(
    (m) => m.aav > 0 && !matched.has(playerKey(m.name, m.pos))
  );

  return { players: prune(players), unmatched };
}

/** Keep anyone with a market value, an ADP, or meaningful projected points —
 *  ranked so the cut falls on genuinely undraftable players. */
function prune(players) {
  const scoreOf = (p) => {
    if (p.espn) return 10000 + p.espn;              // priced by the market
    if (p.adp) return 5000 - p.adp;                 // drafted somewhere
    return p.stats?.pts_half_ppr || 0;              // projection only
  };
  return players
    .filter((p) => p.espn || p.adp || (p.stats?.pts_half_ppr || 0) > 0)
    .sort((a, b) => scoreOf(b) - scoreOf(a))
    .slice(0, MAX_PLAYERS);
}
