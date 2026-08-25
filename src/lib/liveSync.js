// Optional realtime sync layered on top of storage.js. When Firebase is
// configured (lib/firebaseConfig.js), a room's draft state is mirrored to a
// Realtime Database under rooms/<code>, so a second person with the same
// room URL sees live updates. Without a config, everything here is inert and
// every room stays exactly what it always was: local-only.
//
// Ported from the showdown project's js/sync.js — same shape (a room-scoped
// ref, "value" listener, last-write-wins), adapted to load the Firebase SDK
// lazily so an unconfigured board never pays for it.

import { FIREBASE_CONFIG } from "./firebaseConfig.js";

let loadPromise = null;
function loadFirebase() {
  if (!FIREBASE_CONFIG?.databaseURL) return null;
  if (!loadPromise) {
    loadPromise = Promise.all([import("firebase/app"), import("firebase/database")]).then(
      ([{ initializeApp }, rtdb]) => {
        const app = initializeApp(FIREBASE_CONFIG);
        return { rtdb, database: rtdb.getDatabase(app) };
      }
    );
  }
  return loadPromise;
}

/** Mirrors one room's draft state to Realtime Database, if configured.
 *
 *  onRemote(state) fires when someone *else* changes the room — not for the
 *  echo of your own push, so the caller never fights itself.
 *
 *  Returns { live, push(state), stop() }. When Firebase isn't configured,
 *  `live` is false and push/stop are no-ops. */
export function createLiveSync(room, onRemote) {
  const ready = loadFirebase();
  if (!ready) return { live: false, push() {}, stop() {} };

  let ref = null;
  let lastJson = null;
  let stopped = false;

  ready
    .then(({ rtdb, database }) => {
      if (stopped) return;
      ref = rtdb.ref(database, `rooms/${room}`);
      rtdb.onValue(ref, (snap) => {
        const val = snap.val();
        if (!val) return; // room not written yet
        const json = JSON.stringify(val);
        if (json === lastJson) return; // our own write, echoing back
        onRemote(val);
      });
    })
    .catch((e) => console.warn("Live sync unavailable:", e.message));

  return {
    live: true,
    push(state) {
      const json = JSON.stringify(state);
      if (json === lastJson) return;
      lastJson = json;
      ready
        .then(({ rtdb }) => {
          if (stopped || !ref) return;
          rtdb.set(ref, { ...state, updatedAt: Date.now() });
        })
        .catch((e) => console.warn("Live sync push failed:", e.message));
    },
    stop() {
      stopped = true;
      ready.then(({ rtdb }) => ref && rtdb.off(ref)).catch(() => {});
    },
  };
}
