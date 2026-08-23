// Rooms keep two leagues apart. The failure mode that matters is one draft
// leaking into another, or an existing draft vanishing on upgrade.

import test from "node:test";
import assert from "node:assert/strict";

const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  location: { hash: "", pathname: "/DraftBoard/", search: "" },
  history: { replaceState: (_a, _b, url) => { globalThis.window.location.hash = url.includes("#") ? url.slice(url.indexOf("#")) : ""; } },
};

const rooms = await import("../src/lib/rooms.js");
const { loadDraft, saveDraft } = await import("../src/lib/storage.js");

const reset = () => { store.clear(); globalThis.window.location.hash = ""; };

test("room codes are normalized into something URL-safe", () => {
  assert.equal(rooms.normalizeCode("Retrocade"), "retrocade");
  assert.equal(rooms.normalizeCode("  Zach's League!  "), "zach-s-league");
  assert.equal(rooms.normalizeCode("#$%"), "");
});

test("two rooms hold completely separate drafts", () => {
  reset();
  saveDraft(rooms.roomKey("retrocade"), { picks: [{ playerId: "a" }], settings: { platform: "yahoo" } });
  saveDraft(rooms.roomKey("lindor"), { picks: [], settings: { platform: "sleeper" } });

  assert.equal(loadDraft(rooms.roomKey("retrocade")).settings.platform, "yahoo");
  assert.equal(loadDraft(rooms.roomKey("lindor")).settings.platform, "sleeper");
  assert.equal(loadDraft(rooms.roomKey("retrocade")).picks.length, 1);
  assert.equal(loadDraft(rooms.roomKey("lindor")).picks.length, 0);
});

test("the room list tracks what's been opened, newest first", () => {
  reset();
  rooms.upsertRoom("lindor", { picks: 3 });
  rooms.upsertRoom("retrocade", { picks: 12 });
  const list = rooms.listRooms();
  assert.equal(list[0].code, "retrocade");
  assert.equal(list[0].picks, 12);
  assert.equal(list.length, 2);
});

test("deleting a room removes its draft and nothing else", () => {
  reset();
  saveDraft(rooms.roomKey("retrocade"), { picks: [1] });
  saveDraft(rooms.roomKey("lindor"), { picks: [2] });
  rooms.upsertRoom("retrocade");
  rooms.upsertRoom("lindor");

  rooms.deleteRoom("retrocade");
  assert.equal(loadDraft(rooms.roomKey("retrocade")), null);
  assert.ok(loadDraft(rooms.roomKey("lindor")), "the other league must survive");
  assert.deepEqual(rooms.listRooms().map((r) => r.code), ["lindor"]);
});

test("a pre-rooms draft is adopted rather than lost", () => {
  reset();
  store.set(rooms.LEGACY_KEY, JSON.stringify({ picks: [{ playerId: "x" }], version: 3 }));
  const code = rooms.adoptLegacyDraft("my-league");
  assert.equal(code, "my-league");
  assert.equal(loadDraft(rooms.roomKey("my-league")).picks.length, 1);
  assert.equal(store.get(rooms.LEGACY_KEY), undefined, "the old key is cleaned up");
  assert.deepEqual(rooms.listRooms().map((r) => r.code), ["my-league"]);
});

test("adopting is a no-op when there's nothing to adopt", () => {
  reset();
  assert.equal(rooms.adoptLegacyDraft(), null);
  assert.deepEqual(rooms.listRooms(), []);
});

test("the URL names the room", () => {
  reset();
  assert.equal(rooms.roomFromUrl(), null);
  globalThis.window.location.hash = "#room=Retrocade";
  assert.equal(rooms.roomFromUrl(), "retrocade");
  rooms.setUrlRoom("lindor");
  assert.equal(rooms.roomFromUrl(), "lindor");
});

test("a room survives an export/import round trip", () => {
  reset();
  saveDraft(rooms.roomKey("retrocade"), { picks: [{ playerId: "a", price: 54 }], settings: { numTeams: 12 } });
  const json = rooms.exportRoom("retrocade");
  rooms.deleteRoom("retrocade");
  assert.equal(loadDraft(rooms.roomKey("retrocade")), null);

  const code = rooms.importRoom(json);
  assert.equal(code, "retrocade");
  assert.equal(loadDraft(rooms.roomKey("retrocade")).picks[0].price, 54);
});

test("importing junk fails loudly instead of creating an empty room", () => {
  reset();
  assert.throws(() => rooms.importRoom(JSON.stringify({ room: "x" })), /no draft/);
  assert.throws(() => rooms.importRoom(JSON.stringify({ state: {} })), /no room name/);
});
