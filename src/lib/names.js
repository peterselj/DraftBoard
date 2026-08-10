// Joining players across sources. There's no shared id between Sleeper's
// projections feed and ESPN's player feed, so we match on a normalized
// name + position key. Suffixes and punctuation are the usual culprits
// ("A.J. Brown", "Marvin Harrison Jr.", "Amon-Ra St. Brown").

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

export function normalizeName(raw) {
  const cleaned = String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const parts = cleaned.split(" ").filter((w) => !SUFFIXES.has(w));
  return parts.join(" ");
}

export function playerKey(name, pos) {
  // Team defenses are named by city in one feed and by nickname in the other
  // ("Houston Texans" vs "Texans D/ST"). All 32 nicknames are unique, so the
  // last real word is a safe key.
  if (pos === "DEF") {
    const words = normalizeName(name).replace(/\bdst\b/g, "").trim().split(" ");
    return `${words[words.length - 1]}|DEF`;
  }
  return `${normalizeName(name)}|${pos}`;
}

/** ESPN's numeric position ids. */
export const ESPN_POSITIONS = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DEF" };
