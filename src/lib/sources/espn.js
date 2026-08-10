// ESPN auction values — the market side.
//
// The `leaguedefaults/3` endpoint is ESPN's own public default-league view: no
// auth, and it carries `ownership.auctionValueAverage` (what ESPN drafters
// actually pay) plus ADP. Without the X-Fantasy-Filter header it returns only
// 50 players, so the header is what makes this useful.
//
// Note: that custom header makes the browser preflight the request, which ESPN
// may refuse — so the browser path degrades to the published snapshot while CI
// (no CORS) always gets the full list.

import { ESPN_POSITIONS } from "../names.js";

export const espnUrl = (season) =>
  `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}` +
  `/segments/0/leaguedefaults/3?view=kona_player_info`;

export const espnFilter = (limit) =>
  JSON.stringify({ players: { limit, sortPercOwned: { sortPriority: 1, sortAsc: false } } });

export async function fetchEspnValues(season, { limit = 500, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(espnUrl(season), {
    headers: { "X-Fantasy-Filter": espnFilter(limit) },
  });
  if (!res.ok) throw new Error(`ESPN player feed failed: HTTP ${res.status}`);
  const body = await res.json();

  return (body.players || [])
    .map((entry) => {
      const p = entry.player || {};
      const own = p.ownership || {};
      return {
        espnId: String(p.id),
        name: p.fullName,
        pos: ESPN_POSITIONS[p.defaultPositionId] || null,
        aav: typeof own.auctionValueAverage === "number" ? own.auctionValueAverage : null,
        adp: typeof own.averageDraftPosition === "number" && own.averageDraftPosition > 0
          ? own.averageDraftPosition
          : null,
        percentOwned: own.percentOwned ?? null,
      };
    })
    .filter((p) => p.name && p.pos);
}
