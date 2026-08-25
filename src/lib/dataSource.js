// Where player data comes from at runtime, in order of preference:
//
//   1. A live refresh straight from the sources (both send permissive CORS
//      headers, so the browser can do this itself — no server involved).
//   2. public/data/values-<season>.json, refreshed by CI and served alongside
//      the app. Always present, never more than a day stale.
//   3. The bundled seed file, so a cold start with no network still works.
//
// Refreshing mid-draft must never cost picks: values merge into the existing
// pool by id, and drafted state is preserved.

import { fetchSleeperProjections } from "./sources/sleeper.js";
import { fetchEspnValues } from "./sources/espn.js";
import { mergeSources } from "./merge.js";
import { playerKey } from "./names.js";
import seedData from "../data/players2025.json";

/** NFL seasons start in September; before then the upcoming season is the
 *  one being drafted for. */
export function currentSeason(now = new Date()) {
  return now.getUTCFullYear();
}

const blankDraftState = {
  drafted: false, paid: null, draftedBy: null,
  snapAdjValue: null, snapBudgetMult: null, snapScarcityMult: null,
};

/** Dataset row -> the shape the board works with. */
export function toAppPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    pos: p.pos,
    team: p.team ?? null,
    stats: p.stats ?? null,
    adp: p.adp ?? null,
    espn: p.espn ?? null,
    yahoo: p.yahoo ?? null,
    nffc: p.nffc ?? null,
    sleeper: p.sleeper ?? null,
    etr: p.etr ?? null,
    // Fallback standalone value for players the model can't price.
    projected: p.projected ?? p.espn ?? 1,
    ...blankDraftState,
  };
}

export function seedPlayers() {
  return seedData.players.map(toAppPlayer);
}

export async function loadPublishedDataset(season = currentSeason(), { signal } = {}) {
  const base = (import.meta.env?.BASE_URL) || "/";
  const url = `${base}data/values-${season}.json?t=${Date.now()}`;
  const res = await fetch(url, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`No published dataset for ${season} (HTTP ${res.status})`);
  const data = await res.json();
  if (!Array.isArray(data.players) || data.players.length === 0) {
    throw new Error("Published dataset is empty");
  }
  return data;
}

/** Go straight to the sources. ESPN needs a custom header, which makes the
 *  browser preflight it — if ESPN refuses, we still return fresh projections
 *  and report that the market half is missing rather than failing outright. */
export async function refreshFromLiveSources(season = currentSeason()) {
  const notes = [];
  const [projections, market] = await Promise.all([
    fetchSleeperProjections(season).catch((e) => {
      notes.push(`projections unavailable (${e.message})`);
      return [];
    }),
    fetchEspnValues(season).catch((e) => {
      notes.push(`market values unavailable (${e.message})`);
      return [];
    }),
  ]);
  if (projections.length === 0 && market.length === 0) {
    throw new Error(`Live refresh failed: ${notes.join("; ")}`);
  }
  const { players } = mergeSources({ projections, market });
  return { season, generated: new Date().toISOString(), players, notes };
}

/**
 * Fold fresh values into the pool without disturbing the draft.
 * Matches on id first, then name+position so a pool seeded from the old
 * bundled file still picks up new numbers.
 */
export function mergeValuesIntoPool(existing, incoming) {
  const byId = new Map(existing.map((p) => [p.id, p]));
  const byName = new Map(existing.map((p) => [playerKey(p.name, p.pos), p]));
  const seen = new Set();
  const updated = [];

  for (const fresh of incoming) {
    const match = byId.get(fresh.id) || byName.get(playerKey(fresh.name, fresh.pos));
    if (match) {
      seen.add(match.id);
      updated.push({
        ...match,
        // New numbers, same draft state.
        stats: fresh.stats ?? match.stats,
        espn: fresh.espn ?? match.espn,
        adp: fresh.adp ?? match.adp,
        team: fresh.team ?? match.team,
        projected: fresh.projected ?? match.projected,
      });
    } else {
      updated.push(fresh);
    }
  }

  // Anything the new dataset dropped stays if it's part of this draft
  // (drafted, or hand-added) — losing a drafted player would corrupt budgets.
  const keptExtras = existing.filter(
    (p) => !seen.has(p.id) && (p.drafted || String(p.id).startsWith("custom-"))
  );
  return [...updated, ...keptExtras];
}
