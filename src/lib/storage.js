// Persistence for an in-progress draft. localStorage only — one browser, one
// machine. Swap this module out if multi-device sync is ever wanted.
//
// The draft is live when this runs, so every path here is defensive: a bad
// read must never take the board down mid-auction.

const KEY = "ff-draft-board";
const LEGACY_KEYS = ["ff-draft-room-2026"]; // pre-rename; migrated on first load
export const SCHEMA_VERSION = 2;

function readKey(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn(`Failed to read draft from ${key}:`, e);
    return null;
  }
}

/** Bring older saved drafts up to the current schema. Additive only —
 *  a missing field gets a sane default, nothing is thrown away. */
function migrate(state) {
  if (!state || typeof state !== "object") return null;
  const out = { ...state };
  if (!Array.isArray(out.picks)) {
    // v1 had no pick log; reconstruct what we can from drafted players so
    // undo history isn't empty for a draft that's already underway.
    out.picks = (out.players || [])
      .filter((p) => p.drafted && p.draftedBy)
      .map((p) => ({ playerId: p.id, price: p.paid, teamId: p.draftedBy, at: null }));
  }
  if (out.baselineRatio === undefined) out.baselineRatio = null;
  out.version = SCHEMA_VERSION;
  return out;
}

export function loadDraft() {
  let raw = readKey(KEY);
  if (!raw) {
    for (const legacy of LEGACY_KEYS) {
      raw = readKey(legacy);
      if (raw) {
        console.info(`Migrated saved draft from legacy key "${legacy}".`);
        break;
      }
    }
  }
  return migrate(raw);
}

export function saveDraft(state) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...state, version: SCHEMA_VERSION }));
    return true;
  } catch (e) {
    console.warn("Failed to save draft:", e);
    return false;
  }
}

export function clearDraft() {
  try {
    window.localStorage.removeItem(KEY);
    LEGACY_KEYS.forEach((k) => window.localStorage.removeItem(k));
  } catch (e) {
    console.warn("Failed to clear saved draft:", e);
  }
}
