import test from "node:test";
import assert from "node:assert/strict";
import { scoreMatch, rankMatches, isUnambiguous, normalize } from "../src/lib/fuzzy.js";

const PLAYERS = [
  "Ja'Marr Chase", "Justin Jefferson", "Jefferson Smith", "CeeDee Lamb",
  "A.J. Brown", "Amon-Ra St. Brown", "Chase Brown", "Bijan Robinson",
];
const best = (q, list = PLAYERS) => rankMatches(q, list)[0]?.item;

test("punctuation is ignored on both sides", () => {
  assert.equal(normalize("Ja'Marr St. Brown-Jr"), "jamarr st brownjr");
  assert.ok(scoreMatch("aj", "A.J. Brown") !== null);
});

test("a last-name fragment finds the player", () => {
  assert.equal(best("jeffer"), "Justin Jefferson");
  assert.equal(best("bijan"), "Bijan Robinson");
});

test("two short tokens resolve a first+last name", () => {
  assert.equal(best("ja ch"), "Ja'Marr Chase");
  assert.equal(best("jus jeff"), "Justin Jefferson");
});

test("an exact name beats a longer name containing it", () => {
  assert.equal(best("chase brown"), "Chase Brown");
});

test("no match returns null rather than a bad guess", () => {
  assert.equal(scoreMatch("zzzz", "Justin Jefferson"), null);
  assert.deepEqual(rankMatches("zzzz", PLAYERS), []);
});

test("team prefixes disambiguate for the typeahead", () => {
  const teams = ["Boudreau", "Bowman", "Callahan", "Dietrich"];
  assert.equal(best("bou", teams), "Boudreau");
  assert.ok(isUnambiguous(rankMatches("bou", teams)), "unique prefix should auto-commit");
  assert.ok(!isUnambiguous(rankMatches("bo", teams)), "'bo' matches two teams, must not auto-commit");
});

test("empty query matches nothing", () => {
  assert.deepEqual(rankMatches("", PLAYERS), []);
  assert.equal(scoreMatch("", "anything"), null);
});
