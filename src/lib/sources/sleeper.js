// Sleeper projections — the bottom-up inputs.
//
// Undocumented but public, no auth, and it sends `Access-Control-Allow-Origin: *`,
// so the browser can hit it directly too (see src/lib/dataSource.js). We take
// the *raw stat lines* rather than Sleeper's pre-scored totals so the league's
// own scoring settings decide the points.

const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];

// Sleeper tags a handful of players with roles no fantasy roster has a slot
// for. Fold them into the position they're actually drafted as; drop the rest.
const POSITION_ALIASES = { FB: "RB" };

export const sleeperUrl = (season, pos) =>
  `https://api.sleeper.app/projections/nfl/${season}` +
  `?season_type=regular&position[]=${pos}&order_by=adp_half_ppr`;

// Only the fields the scoring model actually consumes, plus the pre-scored
// totals we fall back to for K/DEF. Dropping the rest keeps the published
// dataset small enough to fetch on a phone during a draft.
const KEEP_STATS = [
  "pass_yd", "pass_td", "pass_int", "pass_2pt",
  "rush_yd", "rush_td", "rush_2pt",
  "rec", "rec_yd", "rec_td", "rec_2pt",
  "fum_lost", "gp", "pts_half_ppr",
];

function trimStats(stats = {}) {
  const out = {};
  for (const k of KEEP_STATS) {
    if (typeof stats[k] === "number") out[k] = Math.round(stats[k] * 100) / 100;
  }
  return out;
}

export async function fetchSleeperProjections(season, { fetchImpl = fetch } = {}) {
  const players = [];
  for (const pos of POSITIONS) {
    const res = await fetchImpl(sleeperUrl(season, pos));
    if (!res.ok) throw new Error(`Sleeper ${pos} projections failed: HTTP ${res.status}`);
    const rows = await res.json();
    for (const row of rows) {
      const meta = row.player || {};
      const name = meta.position === "DEF"
        ? `${meta.first_name || ""} ${meta.last_name || ""}`.trim()
        : `${meta.first_name || ""} ${meta.last_name || ""}`.trim();
      if (!name) continue;
      const rawPos = meta.position || pos;
      const position = POSITION_ALIASES[rawPos] || rawPos;
      if (!POSITIONS.includes(position)) continue;
      const stats = row.stats || {};
      players.push({
        sleeperId: String(row.player_id),
        name,
        pos: position,
        team: row.team || meta.team || null,
        adp: typeof stats.adp_half_ppr === "number" && stats.adp_half_ppr < 900 ? stats.adp_half_ppr : null,
        stats: trimStats(stats),
      });
    }
  }
  return players;
}
