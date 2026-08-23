// One-line pick entry: "<player> <price> <team>", e.g. `jeffer 54 bou`.
//
// The whole point is that a pick costs one line and one Enter — no mouse, no
// tabbing between three controls, while the auctioneer is already onto the
// next nomination. The first bare number splits the line: everything before it
// is the player, everything after is the team.

import { rankMatches, isUnambiguous, normalize } from "./fuzzy.js";

const PRICE = /^\$?(\d{1,3})$/;
const ME = new Set(["me", "my", "mine", "us"]);

/** Parse a quick-entry line against the current board.
 *  Pure: returns everything the UI needs to render a preview and decide
 *  whether Enter should commit. */
export function parseQuickEntry(text, { players = [], teams = [], myTeamId = null, valueOf = null } = {}) {
  const tokens = String(text || "").trim().split(/\s+/).filter(Boolean);
  const priceIdx = tokens.findIndex((t) => PRICE.test(t));

  const hasPrice = priceIdx !== -1;
  const playerQuery = (hasPrice ? tokens.slice(0, priceIdx) : tokens).join(" ");
  const price = hasPrice ? parseInt(tokens[priceIdx].replace("$", ""), 10) : null;
  const teamQuery = hasPrice ? tokens.slice(priceIdx + 1).join(" ") : "";

  const undrafted = players.filter((p) => !p.drafted);
  // Equally good name matches are broken by live value: "mcca" should lead
  // with Christian McCaffrey, not J.J. McCarthy.
  const playerValue = valueOf ? (p) => valueOf(p).live : null;
  const playerMatches = rankMatches(playerQuery, undrafted, (p) => p.name, playerValue).map((m) => m.item);

  let team = null;
  let teamAmbiguous = false;
  if (teamQuery) {
    if (ME.has(normalize(teamQuery)) && myTeamId) {
      team = teams.find((t) => t.id === myTeamId) || null;
    } else {
      const ranked = rankMatches(teamQuery, teams, (t) => t.name);
      if (ranked.length > 0) {
        team = ranked[0].item;
        teamAmbiguous = !isUnambiguous(ranked);
      }
    }
  }

  const player = playerMatches[0] || null;
  const priceValid = price !== null && price >= 1;

  let hint = null;
  if (!playerQuery) hint = "type a player";
  else if (!player) hint = `no undrafted player matches "${playerQuery}"`;
  else if (!hasPrice) hint = "add a price";
  else if (!priceValid) hint = "price must be at least $1";
  else if (!teamQuery) hint = "add a team (or 'me')";
  else if (!team) hint = `no team matches "${teamQuery}"`;
  else if (teamAmbiguous) hint = `"${teamQuery}" matches more than one team`;

  return {
    playerQuery, price, teamQuery, hasPrice,
    playerMatches, player, team, teamAmbiguous,
    ready: Boolean(player && priceValid && team && !teamAmbiguous),
    hint,
  };
}
