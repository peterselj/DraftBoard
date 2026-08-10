import test from "node:test";
import assert from "node:assert/strict";
import { parseImport, applyImport } from "../src/lib/importParse.js";

const pool = [
  { id: "a", name: "Justin Jefferson", pos: "WR", projected: 50 },
  { id: "b", name: "Ja'Marr Chase", pos: "WR", projected: 60 },
  { id: "c", name: "Marvin Harrison Jr.", pos: "WR", projected: 20 },
  { id: "d", name: "Houston Texans", pos: "DEF", projected: 1 },
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

test("a full round trip from pasted text to updated pool", () => {
  const { rows } = parseImport("Player\tPos\tAuction $\nJa'Marr Chase\tWR\t61\nHouston Texans\tD/ST\t2");
  const { players, matched } = applyImport(pool, rows, "projected");
  assert.equal(matched, 2);
  assert.equal(players.find((p) => p.id === "b").projected, 61);
  assert.equal(players.find((p) => p.id === "d").projected, 2);
});
