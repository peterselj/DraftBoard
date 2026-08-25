// ---------------------------------------------------------------------------
// Firebase configuration for live room sync (see lib/liveSync.js and
// docs/ROOMS.md). Same pattern as the showdown project: a Realtime Database
// keyed by room code, no login. The apiKey below isn't a secret — Firebase's
// client keys are meant to be public; what actually protects the data is
// database.rules.json, published separately in the Firebase console.
// ---------------------------------------------------------------------------
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAnUVa8c5GZXDIiC16iMVAALbGLidRvnfA",
  authDomain: "draftboard-330a5.firebaseapp.com",
  databaseURL: "https://draftboard-330a5-default-rtdb.firebaseio.com",
  projectId: "draftboard-330a5",
  storageBucket: "draftboard-330a5.firebasestorage.app",
  messagingSenderId: "416142745452",
  appId: "1:416142745452:web:2de9a771913b3ea4cadd49",
};
