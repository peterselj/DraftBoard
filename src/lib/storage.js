// Minimal persistence wrapper. In the Claude.ai artifact this used the
// sandboxed window.storage API; as a standalone app it uses localStorage.
// Swap this out if/when a real backend or multi-device sync is wanted.

const KEY = "ff-draft-room-2026";

export function loadDraft() {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn("Failed to load saved draft:", e);
    return null;
  }
}

export function saveDraft(state) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.warn("Failed to save draft:", e);
    return false;
  }
}

export function clearDraft() {
  try {
    window.localStorage.removeItem(KEY);
  } catch (e) {
    console.warn("Failed to clear saved draft:", e);
  }
}
