// Saved drafts have to survive upgrades. A draft is live when this code runs;
// silently loading incompatible state is worse than loading nothing.

import test from "node:test";
import assert from "node:assert/strict";

// Minimal localStorage stand-in so the module can be exercised under node.
const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  },
};

const { loadDraft, saveDraft, clearDraft, SCHEMA_VERSION } = await import("../src/lib/storage.js");

// Drafts are keyed per room now; these tests use one fixed key.
const KEY = "ff-draft-board";

const reset = () => store.clear();

test("a saved draft round-trips", () => {
  reset();
  saveDraft(KEY, { settings: { numTeams: 12 }, players: [{ id: "a" }], picks: [] });
  const back = loadDraft(KEY);
  assert.equal(back.settings.numTeams, 12);
  assert.equal(back.version, SCHEMA_VERSION);
});

test("a draft saved under the old Draft Room key is picked up", () => {
  reset();
  store.set("ff-draft-room-2026", JSON.stringify({
    settings: { numTeams: 10 },
    players: [{ id: "a", drafted: true, paid: 20, draftedBy: "t1" }],
  }));
  const back = loadDraft(KEY);
  assert.equal(back.settings.numTeams, 10);
  assert.equal(back.picks.length, 1, "picks are reconstructed from drafted players");
  assert.deepEqual(back.picks[0], { playerId: "a", price: 20, teamId: "t1", at: null });
});

test("a v2 head-count baseline is discarded rather than misread as dollars", () => {
  reset();
  store.set("ff-draft-board", JSON.stringify({
    version: 2,
    players: [{ id: "a" }],
    picks: [],
    baselinePool: { QB: 80, RB: 133, WR: 199, TE: 106 }, // counts, not dollars
  }));
  const back = loadDraft(KEY);
  assert.equal(back.baselinePool, null,
    "stale counts must not be compared against a dollar-denominated supply");
  assert.equal(back.version, SCHEMA_VERSION);
});

test("a current-version baseline is kept", () => {
  reset();
  const baselinePool = { QB: 111, RB: 749, WR: 884, TE: 151 };
  saveDraft(KEY, { players: [], picks: [], baselinePool });
  assert.deepEqual(loadDraft(KEY).baselinePool, baselinePool);
});

test("corrupt storage loads as nothing instead of throwing", () => {
  reset();
  store.set("ff-draft-board", "{not json");
  assert.equal(loadDraft(KEY), null);
});

test("clearing removes the legacy key too", () => {
  reset();
  store.set("ff-draft-board", JSON.stringify({ players: [] }));
  store.set("ff-draft-room-2026", JSON.stringify({ players: [] }));
  clearDraft(KEY);
  assert.equal(store.size, 0);
});
