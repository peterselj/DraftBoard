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
  // Deep rows on Yahoo have no auction data at all — "294  -  -  1", where the
  // only bare numbers are the rank and a $1 projection. Without the % column to
  // mark where the money starts, a "last number wins" guess would import the
  // *rank* as a dollar value. So when the paste uses percentages at all, a row
  // without one is skipped rather than guessed at.
  const usesPercent = lines.some((l) => PERCENT.test(l));
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
    if (usesPercent && !sawPercent) continue;
    if (sawPercent && numbers.length <= percentAt) continue; // no money after the %

    // Money follows the % drafted column; before that it's ranks.
    const value = sawPercent ? numbers[percentAt] : numbers[numbers.length - 1];
    rows.push({ name, pos: normalizePos(m[2]), value: Math.round(value * 10) / 10, candidates: numbers });
  }
  return rows;
}

// First Down Studio's season-rankings tables (firstdown.studio) copy out
// vertically too, but anchored differently from Yahoo's: there's no
// "TEAM - POS" line to key off — no position column at all, since each
// position lives on its own page/tab — so every record is keyed off a bare
// team-code line immediately followed by one line of tab-separated stats
// with Pts first:
//
//   1
//   Josh Allen
//   Josh Allen           <- name, doubled — the site's markup copies it twice
//   BUF                  <- team code, the reliable record marker here
//   332	3,614	24.8	499	10.7	+600   <- Pts, then the rest of the box score
//
// Only Pts (the stat line's first number) is pulled out — see fdvPoints in
// App.jsx for why the rest of the box score isn't needed (yet).
const TEAM_CODE = /^[A-Z]{2,4}$/;
const RANK_LINE = /^\d+\.?$/;

export function parseFirstDownBlocks(lines) {
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!TEAM_CODE.test(lines[i])) continue;
    const statLine = lines[i + 1];
    if (!statLine || !statLine.includes("\t")) continue;
    const pts = parseFloat(statLine.split("\t")[0].trim().replace(/,/g, ""));
    if (!Number.isFinite(pts)) continue;

    // The name is whichever non-rank, non-team-code line sits closest above
    // the team code — the nearer of the two duplicated copies when there
    // are two, robust to there being only one if the site's markup changes.
    const prev = lines[i - 1];
    if (prev == null || RANK_LINE.test(prev) || TEAM_CODE.test(prev)) continue;
    const name = prev;

    rows.push({ name, pos: null, value: Math.round(pts * 10) / 10 });
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
  let lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { rows: [], warnings: ["Nothing to import."], delimiter: delim };

  // Vertical paste (Yahoo and friends) — try it before column detection,
  // since these pastes have almost no delimiters to detect.
  const delimitedLines = lines.filter((l) => l.includes(delim)).length;

  // Sites often prepend a line or two of prose above the actual table —
  // FantasyPros' auction calculator leads with "*Values are based on a
  // standard roster... Use our Draft Wizard..." above the header row. A real
  // header or data row in a delimited paste contains the delimiter; a line
  // that doesn't is stray text, not the header. Left in place it gets mistaken
  // for the header (no dollar sign in it) and — worse — its prose can contain
  // a stray match for a column keyword like "value", hijacking column
  // detection below. Only strip when this genuinely looks like a delimited
  // paste (most lines contain the delimiter); a Yahoo-style vertical paste
  // has none, so this leaves it untouched.
  if (delimitedLines >= lines.length / 2) {
    while (lines.length > 1 && !lines[0].includes(delim)) lines.shift();
  }

  if (delimitedLines < lines.length / 2) {
    const yahooRows = parseVerticalBlocks(lines);
    if (yahooRows.length > 0) {
      return {
        rows: yahooRows,
        warnings,
        layout: "vertical",
        delimiter: null,
        hadHeader: false,
      };
    }
    const fdsRows = parseFirstDownBlocks(lines);
    if (fdsRows.length > 0) {
      return {
        rows: fdsRows,
        warnings,
        layout: "firstdown",
        delimiter: null,
        hadHeader: false,
      };
    }
  }

  const cells = lines.map((l) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, "")));

  // A first row with no dollar figure in it is a header.
  const looksLikeHeader = !cells[0].some((c) => MONEY.test(c));
  const header = looksLikeHeader ? cells[0].map((c) => c.toLowerCase()) : null;
  let body = looksLikeHeader ? cells.slice(1) : cells;

  // FantasyPros' auction calculator (and similar per-position exports) copies
  // out as several tables stitched together, one per position, each with its
  // own repeated header row ("#  QB  Value", then "#  RB  Value", ...). Only
  // the very first one is stripped above by the looksLikeHeader check; the
  // rest land in the body as ordinary rows and poison column detection below
  // — a "Value" cell sits in the same column as real dollar figures, which
  // breaks the "every row matches" test numericCols relies on. A row with no
  // dollar figure anywhere in it can never be real data, header repeat or
  // not, so drop it — but first read off its position, so rows in that
  // section can be tagged even though there's no dedicated position column.
  let sectionTags = null;
  if (looksLikeHeader) {
    // The very first header row (unlike its repeats further down) is already
    // gone by this point, sliced off above — seed the section from it too,
    // so the rows before the first repeat aren't left untagged.
    const firstPosCell = header.find((h) => POSITIONS.has(normalizePos(h)));
    let sectionPos = firstPosCell ? normalizePos(firstPosCell) : null;
    const kept = [];
    const tags = [];
    for (const r of body) {
      if (!r.some((c) => MONEY.test(c))) {
        const posCell = r.find((c) => POSITIONS.has(normalizePos(c)));
        if (posCell) sectionPos = normalizePos(posCell);
        continue;
      }
      kept.push(r);
      tags.push(sectionPos);
    }
    body = kept;
    sectionTags = tags;
  }
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
  // A bare rank ("1.", "23") isn't MONEY (no digits follow a trailing dot)
  // and isn't a position either, so without this it wins the "first
  // non-numeric, non-position column" heuristic below and gets mistaken for
  // the name column — FantasyPros' export leads with exactly this "#" column.
  const rankCols = columnIs((v) => /^\d+\.?$/.test(v));

  // Name: prefer a header that says so, else the first column that's neither
  // numeric, a position, nor a rank number.
  let nameIdx = header ? header.findIndex((h) => /name|player/.test(h)) : -1;
  if (nameIdx === -1) nameIdx = numericCols.findIndex((isNum, i) => !isNum && !posCols[i] && !rankCols[i]);
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
  body.forEach((r, i) => {
    // FantasyPros (and other sites) put the team right in the name cell,
    // comma-separated — "Josh Allen, BUF", sometimes with an injury badge
    // stuck on with no space ("Patrick Mahomes II, KCDTD"). None of that is
    // part of the name a normalized match will find, so it's dropped rather
    // than fed to normalizeName, which would otherwise fold it into the key.
    const rawName = r[nameIdx];
    const name = rawName ? rawName.replace(/,.*$/, "").trim() : rawName;
    const rawValue = r[valueIdx];
    if (!name || !MONEY.test(rawValue || "")) return;
    rows.push({
      name,
      pos: (posIdx >= 0 && r[posIdx] ? normalizePos(r[posIdx]) : null) || (sectionTags ? sectionTags[i] : null),
      value: Math.round(parseFloat(String(rawValue).replace("$", "")) * 10) / 10,
    });
  });

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
