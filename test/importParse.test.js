import test from "node:test";
import assert from "node:assert/strict";
import { parseImport, applyImport } from "../src/lib/importParse.js";

const pool = [
  { id: "a", name: "Justin Jefferson", pos: "WR", projected: 50 },
  { id: "b", name: "Ja'Marr Chase", pos: "WR", projected: 60 },
  { id: "c", name: "Marvin Harrison Jr.", pos: "WR", projected: 20 },
  { id: "d", name: "Houston Texans", pos: "DEF", projected: 1 },
  { id: "e", name: "James Cook", pos: "RB", projected: 30 }, // Yahoo calls him "James Cook III"
];

test("tab-separated paste with a header is parsed", () => {
  const { rows, hadHeader } = parseImport(
    "Player\tPos\tAAV\nJustin Jefferson\tWR\t$46\nJa'Marr Chase\tWR\t57.3"
  );
  assert.equal(hadHeader, true);
  assert.deepEqual(rows, [
    { name: "Justin Jefferson", pos: "WR", value: 46 },
    { name: "Ja'Marr Chase", pos: "WR", value: 57.3 },
  ]);
});

test("headerless comma paste works too", () => {
  const { rows, hadHeader } = parseImport("Justin Jefferson,WR,46\nJa'Marr Chase,WR,57");
  assert.equal(hadHeader, false);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].value, 46);
});

test("the dollar column is chosen by header even when other numbers are present", () => {
  const { rows } = parseImport("Player,Rank,Value\nJustin Jefferson,3,46\nJa'Marr Chase,1,57");
  assert.equal(rows[0].value, 46);
  assert.equal(rows[1].value, 57);
});

test("D/ST spellings normalize to DEF", () => {
  const { rows } = parseImport("Player\tPos\t$\nHouston Texans\tD/ST\t3");
  assert.equal(rows[0].pos, "DEF");
});

test("junk input reports a warning rather than throwing", () => {
  assert.match(parseImport("").warnings[0], /Nothing to import/);
  assert.match(parseImport("just some prose here").warnings[0], /dollar value/);
  assert.match(parseImport("Player\tPos\tAAV").warnings[0], /dollar value/);
});

test("values land on the matching players and suffixes are tolerated", () => {
  const rows = [
    { name: "justin jefferson", pos: "WR", value: 46 },
    { name: "Marvin Harrison", pos: "WR", value: 25 },  // no "Jr."
    { name: "Nobody At All", pos: "WR", value: 9 },
  ];
  const { players, matched, unmatched } = applyImport(pool, rows, "yahoo");
  assert.equal(matched, 2);
  assert.equal(unmatched.length, 1);
  assert.equal(unmatched[0].name, "Nobody At All");
  assert.equal(players.find((p) => p.id === "a").yahoo, 46);
  assert.equal(players.find((p) => p.id === "c").yahoo, 25);
  assert.equal(players.find((p) => p.id === "a").projected, 50, "other fields untouched");
});

// This is what you get from selecting Yahoo's salary-cap draft-analysis table
// and hitting copy: one cell per line, blank cells dropped entirely.
const YAHOO_PASTE = `Player\tRank\tPos Rank\tCER\t%Drafted\tAvg $\tProj $

Jahmyr Gibbs
Det - RB
Q
1
100%
73.3
64

Ja'Marr Chase
Cin - WR
3
100%
65.5
60

James Cook III
Buf - RB
10
100%
53.4
50
`;

test("Yahoo's vertical copy is read correctly", () => {
  const { rows, layout } = parseImport(YAHOO_PASTE);
  assert.equal(layout, "vertical");
  assert.equal(rows.length, 3);
  // Avg $, not Proj $ and not the rank.
  assert.deepEqual(
    rows.map((r) => [r.name, r.pos, r.value]),
    [
      ["Jahmyr Gibbs", "RB", 73.3],
      ["Ja'Marr Chase", "WR", 65.5],
      ["James Cook III", "RB", 53.4],
    ]
  );
});

test("an injury flag between name and numbers doesn't shift the value", () => {
  const { rows } = parseImport(YAHOO_PASTE);
  const gibbs = rows.find((r) => r.name === "Jahmyr Gibbs"); // had a "Q" line
  const chase = rows.find((r) => r.name === "Ja'Marr Chase"); // had none
  assert.equal(gibbs.value, 73.3);
  assert.equal(chase.value, 65.5);
});

test("undrafted Yahoo rows are skipped, not read as rank-priced", () => {
  // Real deep rows look like "294  -  -  1": rank, no % drafted, no Avg $, and
  // a $1 projection. Importing 294 as a dollar value would be catastrophic.
  const { rows } = parseImport(
    YAHOO_PASTE + "\nJaylen Wright\nMia - RB\n294\n-\n-\n1\n"
  );
  assert.equal(rows.find((r) => r.name === "Jaylen Wright"), undefined);
  assert.equal(rows.length, 3, "the three real rows still import");
  assert.ok(rows.every((r) => r.value < 100), "no rank ever lands in the value column");
});

test("vertical rows land on the right players, suffixes and all", () => {
  const { rows } = parseImport(YAHOO_PASTE);
  const { players, matched, unmatched } = applyImport(pool, rows, "yahoo");
  assert.equal(matched, 2); // Gibbs isn't in this small pool; Chase and Cook are
  assert.deepEqual(unmatched.map((r) => r.name), ["Jahmyr Gibbs"]);
  assert.equal(players.find((p) => p.id === "b").yahoo, 65.5);
  assert.equal(players.find((p) => p.id === "e").yahoo, 53.4, '"James Cook III" must find "James Cook"');
});

test("a full round trip from pasted text to updated pool", () => {
  const { rows } = parseImport("Player\tPos\tAuction $\nJa'Marr Chase\tWR\t61\nHouston Texans\tD/ST\t2");
  const { players, matched } = applyImport(pool, rows, "projected");
  assert.equal(matched, 2);
  assert.equal(players.find((p) => p.id === "b").projected, 61);
  assert.equal(players.find((p) => p.id === "d").projected, 2);
});

// What copying First Down Studio's season-rankings table (firstdown.studio)
// actually produces: no "TEAM - POS" line like Yahoo's paste has (there's no
// position column at all — each position is its own page), the player name
// doubled, and a tab-separated stat line — Pts first — after the team code.
// This is real output pasted from the site, not reshaped for the test.
const FIRSTDOWN_PASTE = `#\tPlayer\tPts\tPass Yds\tPass TDs\tRush Yds\tRush TDs\tMVP
1
Josh Allen
Josh Allen
BUF
332\t3,614\t24.8\t499\t10.7\t+600
2
Joe Burrow
Joe Burrow
CIN
289\t3,944\t32.8\t138\t2\t+800
3
Drake Maye
Drake Maye
NE
288\t3,764\t25.7\t414\t3.6\t+1000
4
Trevor Lawrence
Trevor Lawrence
JAX
288\t3,759\t25.7\t339\t5.2\t+1600
5
Jalen Hurts
Jalen Hurts
PHI
285\t3,204\t22.1\t412\t8.2\t+2500
16
Matthew Stafford
Matthew Stafford
LAR
250\t3,854\t30.1\t19\t-\t+1100
`;

test("First Down Studio's vertical copy is read correctly", () => {
  const { rows, layout } = parseImport(FIRSTDOWN_PASTE);
  assert.equal(layout, "firstdown");
  assert.deepEqual(
    rows.map((r) => [r.name, r.value]),
    [
      ["Josh Allen", 332],
      ["Joe Burrow", 289],
      ["Drake Maye", 288],
      ["Trevor Lawrence", 288],   // was misread as Hurts's row before this fix
      ["Jalen Hurts", 285],       // was misread as Lawrence's row before this fix
      ["Matthew Stafford", 250],  // "-" in the stat line (no rush TDs) doesn't shift Pts
    ]
  );
});

test("First Down Studio rows land on the right players by name alone (no position column)", () => {
  const qbPool = [
    { id: "a", name: "Josh Allen", pos: "QB", projected: 30 },
    { id: "b", name: "Trevor Lawrence", pos: "QB", projected: 10 },
    { id: "c", name: "Jalen Hurts", pos: "QB", projected: 25 },
  ];
  const { rows } = parseImport(FIRSTDOWN_PASTE);
  const { players, matched } = applyImport(qbPool, rows, "fdvPoints");
  assert.equal(matched, 3);
  assert.equal(players.find((p) => p.id === "a").fdvPoints, 332);
  assert.equal(players.find((p) => p.id === "b").fdvPoints, 288);
  assert.equal(players.find((p) => p.id === "c").fdvPoints, 285);
});

// FantasyPros' auction calculator copies out as several tables stitched
// together, one per position, each with its own repeated "#  POS  Value"
// header, and names carry the team (and sometimes an injury badge) right in
// the cell: "Josh Allen, BUF", "Patrick Mahomes II, KCDTD".
const FANTASYPROS_PASTE =
  "#\tQB\tValue\n" +
  "1.\tJosh Allen, BUF\t$31\n" +
  "11.\tPatrick Mahomes II, KCDTD\t$6\n" +
  "#\tDST\tValue\n" +
  "1.\tHouston Texans\t$2\n" +
  "#\tRB\tValue\n" +
  "1.\tJahmyr Gibbs, DET\t$62\n" +
  "7.\tJames Cook III, BUF\t$37\n" +
  "85.\tAustin Ekeler,\t$0\n" +
  "#\tWR\tValue\n" +
  "32.\tMarvin Harrison Jr., ARI\t$13\n";

test("FantasyPros' repeated per-position headers don't wreck column detection", () => {
  const { rows, warnings } = parseImport(FANTASYPROS_PASTE);
  assert.deepEqual(warnings, []);
  assert.deepEqual(
    rows.map((r) => [r.name, r.pos, r.value]),
    [
      ["Josh Allen", "QB", 31],
      ["Patrick Mahomes II", "QB", 6],
      ["Houston Texans", "DEF", 2],
      ["Jahmyr Gibbs", "RB", 62],
      ["James Cook III", "RB", 37],
      ["Austin Ekeler", "RB", 0],
      ["Marvin Harrison Jr.", "WR", 13],
    ]
  );
});

test("a prose blurb above FantasyPros' table doesn't hijack the value column", () => {
  // The live page prepends a line like this above the table itself. It has
  // no dollar sign (so it reads as a header) and contains the word "values"
  // (so a naive header-keyword search picks *it* as the value column instead
  // of the real "Value" header a couple lines down).
  const BLURB =
    "*Values are based on a standard roster. Use our Draft Wizard to get custom values.\n" +
    FANTASYPROS_PASTE;
  const { rows, warnings } = parseImport(BLURB);
  assert.deepEqual(warnings, []);
  assert.deepEqual(
    rows.map((r) => [r.name, r.pos, r.value]),
    [
      ["Josh Allen", "QB", 31],
      ["Patrick Mahomes II", "QB", 6],
      ["Houston Texans", "DEF", 2],
      ["Jahmyr Gibbs", "RB", 62],
      ["James Cook III", "RB", 37],
      ["Austin Ekeler", "RB", 0],
      ["Marvin Harrison Jr.", "WR", 13],
    ]
  );
});

test("FantasyPros rows land on the right players despite the team in the name cell", () => {
  const { rows } = parseImport(FANTASYPROS_PASTE);
  const { players, matched, unmatched } = applyImport(pool, rows, "fantasypros");
  assert.deepEqual(unmatched.map((r) => r.name), ["Josh Allen", "Patrick Mahomes II", "Jahmyr Gibbs", "Austin Ekeler"]);
  assert.equal(matched, 3); // Houston Texans, James Cook III -> James Cook, Marvin Harrison Jr.
  assert.equal(players.find((p) => p.id === "d").fantasypros, 2);
  assert.equal(players.find((p) => p.id === "e").fantasypros, 37);
  assert.equal(players.find((p) => p.id === "c").fantasypros, 13);
});
