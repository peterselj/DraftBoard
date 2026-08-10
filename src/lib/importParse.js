// Paste-in values. This is the path that always works: if an endpoint changes
// shape the morning of the draft, copy a block of cells out of the elboberto
// sheet (or any site's export) and paste it in.
//
// Deliberately forgiving about shape — it sniffs the delimiter, works out
// which column is the name / position / dollar figure, and tolerates a header
// row or none at all.

import { normalizeName, playerKey } from "./names.js";

const POSITIONS = new Set(["QB", "RB", "WR", "TE", "K", "DEF", "DST", "D/ST"]);
const MONEY = /^\$?-?\d+(\.\d+)?$/;

function detectDelimiter(text) {
  const line = text.split(/\r?\n/).find((l) => l.trim()) || "";
  const counts = { "\t": 0, ",": 0, ";": 0, "|": 0 };
  for (const ch of line) if (ch in counts) counts[ch] += 1;
  const [best] = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return best[1] > 0 ? best[0] : "\t";
}

const normalizePos = (v) => {
  const up = String(v).trim().toUpperCase();
  if (up === "DST" || up === "D/ST") return "DEF";
  return up;
};

/** Parse pasted text into {name, pos, value} rows. */
export function parseImport(text) {
  const warnings = [];
  const delim = detectDelimiter(text);
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { rows: [], warnings: ["Nothing to import."], delimiter: delim };

  const cells = lines.map((l) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, "")));

  // A first row with no dollar figure in it is a header.
  const looksLikeHeader = !cells[0].some((c) => MONEY.test(c));
  const header = looksLikeHeader ? cells[0].map((c) => c.toLowerCase()) : null;
  const body = looksLikeHeader ? cells.slice(1) : cells;
  if (body.length === 0) {
    // Either a lone header, or text with no numbers in it at all — from the
    // paster's point of view these are the same problem.
    return {
      rows: [],
      warnings: ["No rows with both a player name and a dollar value were found."],
      delimiter: delim,
    };
  }

  const width = Math.max(...body.map((r) => r.length));
  const columnIs = (test) =>
    Array.from({ length: width }, (_, i) =>
      body.filter((r) => r[i] != null && r[i] !== "").every((r) => test(r[i]))
    );

  const numericCols = columnIs((v) => MONEY.test(v));
  const posCols = columnIs((v) => POSITIONS.has(normalizePos(v)));

  // Name: prefer a header that says so, else the first column that's neither
  // numeric nor a position.
  let nameIdx = header ? header.findIndex((h) => /name|player/.test(h)) : -1;
  if (nameIdx === -1) nameIdx = numericCols.findIndex((isNum, i) => !isNum && !posCols[i]);
  if (nameIdx === -1) {
    return { rows: [], warnings: ["Couldn't find a column of player names."], delimiter: delim };
  }

  const posIdx = posCols.findIndex(Boolean);

  // Value: prefer a header naming it, else the last numeric column.
  let valueIdx = header
    ? header.findIndex((h) => /\$|value|aav|cost|price|salary|auction/.test(h))
    : -1;
  if (valueIdx === -1) valueIdx = numericCols.lastIndexOf(true);
  if (valueIdx === -1) {
    return { rows: [], warnings: ["Couldn't find a column of dollar values."], delimiter: delim };
  }

  const rows = [];
  for (const r of body) {
    const name = r[nameIdx];
    const rawValue = r[valueIdx];
    if (!name || !MONEY.test(rawValue || "")) continue;
    rows.push({
      name,
      pos: posIdx >= 0 && r[posIdx] ? normalizePos(r[posIdx]) : null,
      value: Math.round(parseFloat(String(rawValue).replace("$", "")) * 10) / 10,
    });
  }

  if (rows.length === 0) warnings.push("No rows had both a name and a dollar value.");
  return {
    rows,
    warnings,
    delimiter: delim,
    columns: { name: nameIdx, pos: posIdx >= 0 ? posIdx : null, value: valueIdx },
    hadHeader: looksLikeHeader,
  };
}

/**
 * Write imported values onto the pool.
 * @param field which column they land in — "projected" (drives the model when
 *              there are no projections) or a market source like "yahoo".
 * @returns { players, matched, unmatched }
 */
export function applyImport(players, rows, field = "projected") {
  const byKey = new Map(players.map((p) => [playerKey(p.name, p.pos), p.id]));
  const byName = new Map();
  for (const p of players) {
    const k = normalizeName(p.name);
    // Ambiguous bare names (two players, same name) are left for the key match.
    byName.set(k, byName.has(k) ? null : p.id);
  }

  const updates = new Map();
  const unmatched = [];
  for (const row of rows) {
    const id = (row.pos && byKey.get(playerKey(row.name, row.pos))) || byName.get(normalizeName(row.name));
    if (!id) {
      unmatched.push(row);
      continue;
    }
    updates.set(id, row.value);
  }

  const updated = players.map((p) =>
    updates.has(p.id) ? { ...p, [field]: updates.get(p.id) } : p
  );
  return { players: updated, matched: updates.size, unmatched };
}
