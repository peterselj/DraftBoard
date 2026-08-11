// Persistence for an in-progress draft. localStorage only — one browser, one
// machine. Swap this module out if multi-device sync is ever wanted.
//
// The draft is live when this runs, so every path here is defensive: a bad
// read must never take the board down mid-auction.

// Which storage key a draft lives under is decided by the caller: each room
// gets its own (see lib/rooms.js), so two leagues can be prepped side by side.
const LEGACY_KEYS = ["ff-draft-room-2026"]; // pre-rename; migrated on first load
export const SCHEMA_VERSION = 3;

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

  // v3 changed the scarcity baseline from head counts to dollars of value.
  // A v2 snapshot is numerically meaningless against the new supply figure —
  // comparing "133 running backs" to "$749 of running back" pins every
  // multiplier to the clamp. Drop it; the app recomputes it from the pool,
  // which still contains the drafted players and so still describes the
  // start-of-draft supply.
  if ((out.version ?? 1) < 3) out.baselinePool = null;

  out.version = SCHEMA_VERSION;
  return out;
}

export function loadDraft(key) {
  let raw = readKey(key);
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

export function saveDraft(key, state) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ ...state, version: SCHEMA_VERSION }));
    return true;
  } catch (e) {
    console.warn("Failed to save draft:", e);
    return false;
  }
}

export function clearDraft(key) {
  try {
    window.localStorage.removeItem(key);
    LEGACY_KEYS.forEach((k) => window.localStorage.removeItem(k));
  } catch (e) {
    console.warn("Failed to clear saved draft:", e);
  }
}
