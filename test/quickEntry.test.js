import test from "node:test";
import assert from "node:assert/strict";
import { parseQuickEntry } from "../src/lib/quickEntry.js";

const players = [
  { id: "a", name: "Justin Jefferson", pos: "WR", drafted: false },
  { id: "b", name: "Ja'Marr Chase", pos: "WR", drafted: false },
  { id: "c", name: "Bijan Robinson", pos: "RB", drafted: true },
  { id: "d", name: "Chase Brown", pos: "RB", drafted: false },
];
const teams = [
  { id: "t0", name: "My Team" },
  { id: "t1", name: "Boudreau" },
  { id: "t2", name: "Bowman" },
];
const ctx = { players, teams, myTeamId: "t0" };
const parse = (s) => parseQuickEntry(s, ctx);

test("a complete line resolves to a committable pick", () => {
  const r = parse("jeffer 54 boudreau");
  assert.equal(r.player.name, "Justin Jefferson");
  assert.equal(r.price, 54);
  assert.equal(r.team.name, "Boudreau");
  assert.equal(r.ready, true);
  assert.equal(r.hint, null);
});

test("a $ prefix on the price is accepted", () => {
  assert.equal(parse("jeffer $54 boudreau").price, 54);
});

test("'me' assigns to my own team", () => {
  const r = parse("chase brown 12 me");
  assert.equal(r.team.id, "t0");
  assert.equal(r.ready, true);
});

test("already-drafted players are not offered", () => {
  const r = parse("bijan 30 bou");
  assert.equal(r.player, null);
  assert.equal(r.ready, false);
  assert.match(r.hint, /no undrafted player/);
});

test("an ambiguous team prefix refuses to commit", () => {
  const r = parse("jeffer 54 bo");
  assert.equal(r.teamAmbiguous, true);
  assert.equal(r.ready, false);
  assert.match(r.hint, /more than one team/);
});

test("partial lines report what is still missing", () => {
  assert.match(parse("").hint, /type a player/);
  assert.match(parse("jeffer").hint, /add a price/);
  assert.match(parse("jeffer 54").hint, /add a team/);
  assert.match(parse("jeffer 54 zzz").hint, /no team matches/);
});

test("multi-word player names survive the price split", () => {
  const r = parse("chase brown 12 boudreau");
  assert.equal(r.player.name, "Chase Brown");
  assert.equal(r.playerQuery, "chase brown");
  assert.equal(r.ready, true);
});

test("with no price typed yet the line still filters players", () => {
  const r = parse("chase");
  assert.ok(r.playerMatches.length >= 2, "should offer both Chase candidates");
  assert.equal(r.price, null);
});
