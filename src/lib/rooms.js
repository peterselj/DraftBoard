// Rooms let one board serve several leagues. Each room is a completely
// separate draft — its own managers, roster, scoring, platform and picks —
// stored under its own key, so prepping one can't disturb another.
//
// A word on privacy: rooms live in *this browser's* localStorage. Nothing is
// uploaded and nothing is in the repo, so a stranger loading the site sees an
// empty board and no room list. That also means a room doesn't follow you to
// another device — use Export/Import for that.

const INDEX_KEY = "ff-draft-board-rooms";
const ROOM_PREFIX = "ff-draft-board:";
export const LEGACY_KEY = "ff-draft-board"; // the pre-rooms single draft

/** Room codes are lowercase, no spaces — they show up in the URL hash. */
export function normalizeCode(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export const roomKey = (code) => `${ROOM_PREFIX}${normalizeCode(code)}`;

function read(key, fallback = null) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn(`Couldn't read ${key}:`, e);
    return fallback;
  }
}

/** [{ code, label, lastOpened, picks }] — newest first. */
export function listRooms() {
  const index = read(INDEX_KEY, []);
  if (!Array.isArray(index)) return [];
  return [...index].sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));
}

export function upsertRoom(code, patch = {}) {
  const c = normalizeCode(code);
  if (!c) return listRooms();
  const index = listRooms().filter((r) => r.code !== c);
  const existing = listRooms().find((r) => r.code === c) || {};
  const next = [{ code: c, label: c, ...existing, ...patch, lastOpened: Date.now() }, ...index];
  try {
    window.localStorage.setItem(INDEX_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn("Couldn't update the room list:", e);
  }
  return next;
}

export function deleteRoom(code) {
  const c = normalizeCode(code);
  try {
    window.localStorage.removeItem(roomKey(c));
    window.localStorage.setItem(
      INDEX_KEY,
      JSON.stringify(listRooms().filter((r) => r.code !== c))
    );
  } catch (e) {
    console.warn("Couldn't delete the room:", e);
  }
  return listRooms();
}

/** The room named in the URL (#room=retrocade), if any. */
export function roomFromUrl() {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash || "";
  const m = /(?:^#|&)room=([^&]+)/.exec(hash);
  return m ? normalizeCode(decodeURIComponent(m[1])) : null;
}

export function setUrlRoom(code) {
  if (typeof window === "undefined") return;
  const c = normalizeCode(code);
  const next = c ? `#room=${c}` : "";
  if (window.location.hash !== next) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${next}`);
  }
}

/** A draft saved before rooms existed becomes the first room, so nobody
 *  opens the app mid-season to find their draft gone. */
export function adoptLegacyDraft(code = "my-league") {
  const legacy = read(LEGACY_KEY);
  if (!legacy) return null;
  const c = normalizeCode(code);
  try {
    if (!window.localStorage.getItem(roomKey(c))) {
      window.localStorage.setItem(roomKey(c), JSON.stringify(legacy));
      upsertRoom(c, { label: c, adoptedFromLegacy: true });
    }
    window.localStorage.removeItem(LEGACY_KEY);
    return c;
  } catch (e) {
    console.warn("Couldn't migrate the pre-rooms draft:", e);
    return null;
  }
}

/** Everything needed to recreate a room elsewhere. */
export function exportRoom(code) {
  const c = normalizeCode(code);
  return JSON.stringify({ room: c, exported: new Date().toISOString(), state: read(roomKey(c)) }, null, 2);
}

export function importRoom(json, codeOverride) {
  const parsed = typeof json === "string" ? JSON.parse(json) : json;
  const c = normalizeCode(codeOverride || parsed.room);
  if (!c) throw new Error("That file has no room name.");
  if (!parsed.state) throw new Error("That file has no draft in it.");
  window.localStorage.setItem(roomKey(c), JSON.stringify(parsed.state));
  upsertRoom(c, { label: c });
  return c;
}
