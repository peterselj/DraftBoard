// Matching for the in-draft typeaheads. Optimized for how a person actually
// types under time pressure: last-name fragments ("jeffer"), initials-ish
// fragments ("ja ch" for Ja'Marr Chase), and team-name prefixes ("bou").
//
// Punctuation is stripped on both sides so "A.J. Brown", "Ja'Marr", and
// "St. Brown" behave like plain words.

export function normalize(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isSubsequence(query, target) {
  let qi = 0;
  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (target[ti] === query[qi]) qi++;
  }
  return qi === query.length;
}

/** Score a single query against a single string. Higher is better;
 *  null means "no match at all". Ties within a tier are broken by the
 *  caller (rankMatches), not by string length here — see its comment for
 *  why. */
export function scoreMatch(rawQuery, rawTarget) {
  const q = normalize(rawQuery);
  const t = normalize(rawTarget);
  if (!q) return null;
  if (!t) return null;

  const words = t.split(" ");
  const qTokens = q.split(" ").filter(Boolean);

  // Multi-token query: every token must prefix some distinct word.
  // "ja ch" -> Ja'Marr Chase, "jus jeff" -> Justin Jefferson.
  if (qTokens.length > 1) {
    const used = new Set();
    let ok = true;
    for (const tok of qTokens) {
      const idx = words.findIndex((w, i) => !used.has(i) && w.startsWith(tok));
      if (idx === -1) { ok = false; break; }
      used.add(idx);
    }
    if (ok) return 850;
  }

  // Take the best applicable branch rather than the first: a surname hit must
  // be able to out-rank a whole-string prefix hit. Typing "jeffer" should find
  // Justin Jefferson, not someone whose *first* name is Jefferson.
  let best = null;
  const consider = (s) => { if (s !== null && (best === null || s > best)) best = s; };

  if (t === q) consider(1000);

  const wordIdx = words.findIndex((w) => w.startsWith(q));
  if (wordIdx === words.length - 1 && wordIdx !== -1) consider(910); // surname
  if (t.startsWith(q)) consider(900);
  if (wordIdx !== -1) consider(800); // any other word

  if (t.includes(q)) consider(700);
  if (isSubsequence(q.replace(/\s/g, ""), t.replace(/\s/g, ""))) consider(500);
  return best;
}

/** Rank a list by how well `query` matches `keyFn(item)`.
 *  Returns [{ item, score }] sorted best-first. Empty query returns [].
 *
 *  Ties (same match tier — e.g. two surname hits) are broken by `valueFn`
 *  when given, highest first: under time pressure the point of typing a
 *  fragment is almost always to pull the best player off the board, so
 *  "mcca" should lead with Christian McCaffrey, not J.J. McCarthy just
 *  because his name happens to be a shorter string. Falls back to shorter-
 *  target-wins (the old behaviour) when there's no value to compare, e.g.
 *  team names. */
export function rankMatches(query, items, keyFn = (x) => x, valueFn = null) {
  if (!normalize(query)) return [];
  const out = [];
  for (const item of items) {
    const score = scoreMatch(query, keyFn(item));
    if (score !== null) out.push({ item, score });
  }
  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (valueFn) {
      const diff = (valueFn(b.item) ?? 0) - (valueFn(a.item) ?? 0);
      if (diff !== 0) return diff;
    }
    return normalize(keyFn(a.item)).length - normalize(keyFn(b.item)).length;
  });
  return out;
}

/** True when the best match is unambiguously better than the runner-up —
 *  used to auto-commit a team on a unique prefix without an extra keystroke. */
export function isUnambiguous(ranked, margin = 60) {
  if (ranked.length === 0) return false;
  if (ranked.length === 1) return true;
  return ranked[0].score - ranked[1].score >= margin;
}
