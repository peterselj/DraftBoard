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
