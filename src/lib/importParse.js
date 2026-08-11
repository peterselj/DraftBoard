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

// Yahoo's draft-analysis table copies out *vertically* — one cell per line,
// with empty cells omitted entirely rather than left blank:
//
//   Jahmyr Gibbs
//   Det - RB          <- team + position, the reliable record marker
//   Q                 <- injury flag, sometimes absent
//   1                 <- rank
//   100%              <- % drafted
//   73.3              <- Avg $   <- the one we want
//   64                <- Proj $
//
// Positional column mapping is hopeless when blank cells vanish, but the
// "TEAM - POS" line anchors each record, and the money figures reliably follow
// the percentage. That's enough to read it without asking anyone to reshape a
// spreadsheet five minutes before a draft.
const TEAM_POS = /^([A-Za-z.]{2,4})\s*-\s*(QB|RB|WR|TE|K|DEF|DST|D\/ST)$/i;
const PERCENT = /^\d{1,3}(\.\d+)?%$/;

export function parseVerticalBlocks(lines) {
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const m = TEAM_POS.exec(lines[i]);
    if (!m || i === 0) continue;
    const name = lines[i - 1];
    if (!name || MONEY.test(name) || TEAM_POS.test(name)) continue;

    // Collect the record's numbers: everything until the next record's name.
    const numbers = [];
    let sawPercent = false;
    let percentAt = -1;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (TEAM_POS.test(line)) break;            // next record started
      if (PERCENT.test(line)) { sawPercent = true; percentAt = numbers.length; continue; }
      if (MONEY.test(line)) { numbers.push(parseFloat(line.replace("$", ""))); continue; }
      if (/^[A-Za-z]{1,3}$/.test(line)) continue; // injury flag (Q, O, IR…)
      if (numbers.length > 0) break;              // hit the next player's name
    }
    if (numbers.length === 0) continue;

    // Money follows the % drafted column; before that it's ranks.
    const value = sawPercent && numbers.length > percentAt ? numbers[percentAt] : numbers[numbers.length - 1];
    rows.push({ name, pos: normalizePos(m[2]), value: Math.round(value * 10) / 10, candidates: numbers });
  }
  return rows;
}

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

  // Vertical paste (Yahoo and friends) — try it before column detection,
  // since these pastes have almost no delimiters to detect.
  const delimitedLines = lines.filter((l) => l.includes(delim)).length;
  if (delimitedLines < lines.length / 2) {
    const rows = parseVerticalBlocks(lines);
    if (rows.length > 0) {
      return {
        rows,
        warnings,
        layout: "vertical",
        delimiter: null,
        hadHeader: false,
      };
    }
  }

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
