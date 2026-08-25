# Rooms

One board, several leagues. Each room keeps its own managers, roster, scoring,
platform and picks, so prepping one draft can't disturb another.

## Using them

Opening the site shows the room picker. Type a name — `retrocade`, `lindor`,
whatever you'll remember — and you're in. The name is normalized to something
URL-safe (`Zach's League` → `zach-s-league`), and the URL becomes:

```
https://peterselj.github.io/DraftBoard/#room=retrocade
```

Bookmark that to skip the picker entirely. The room name sits next to the title
in the header; click it to switch rooms.

Prep each room ahead of time: paste the manager names, set the roster and
scoring, pick the platform under **Drafting on**, star your own team. It's all
saved per room the moment you change it.

## Where the data lives, and who can see it

Rooms are stored in **this browser's localStorage**. Nothing is uploaded,
nothing is in the repo, and there's no server. Someone else opening the site
gets the picker with an empty room list and sees none of your setup — not
because the room name is secret, but because their browser simply has none of
your data.

Two consequences worth knowing:

- **A room doesn't follow you to another device.** Prep and draft on the same
  machine, or move a room deliberately (below).
- **Clearing site data clears your rooms.** Export before doing anything drastic
  to a browser profile mid-season.

The room name is not a password. It scopes storage; it doesn't protect
anything. Nothing sensitive should go in a room beyond league names.

## Moving a room between machines

**Export** on the picker downloads `draft-board-<room>.json` — the entire room:
settings, managers, pool and picks. There's no in-app import UI (removed as
unneeded), but `importRoom` in `src/lib/rooms.js` still restores an export
under the same name if it's ever needed — from the browser console, or wire a
button back in. Export is also a cheap way to back up a room before a draft.

## Live rooms (optional)

A room can sync live across browsers/devices instead of staying local-only —
so two people watching the same draft see the same board update in real time.
This is opt-in at the project level: fill in `src/lib/firebaseConfig.js` with
a Firebase Realtime Database config and every room becomes live automatically;
leave it blank and nothing here changes.

**How it works:** `src/lib/liveSync.js` mirrors a room's full state
(`settings`, `teams`, `players`, `picks`, `dataMeta`) to
`rooms/<code>` in Realtime Database on every save (same 400ms debounce as the
local save), and applies incoming changes from anyone else on that room. A
small "● live" indicator appears next to the data status in the header when
it's active. Same pattern as the [showdown](https://github.com/peterselj/showdown)
project's `js/sync.js` — a per-room ref, a `value` listener, last-write-wins.

**Security model:** no login — the room code is the password. `database.rules.json`
at the repo root (published in the Firebase console, not deployed by CI) scopes
reads and writes to `/rooms/<code>` and rejects anything at the database root,
so rooms can't be listed or guessed by scanning. Unlike showdown's rules, there's
no per-field shape validation here — the draft state is a large, evolving
shape (hundreds of players, schema-versioned in `storage.js`) that isn't worth
hand-validating field by field for two private drafts. Anyone with the code can
overwrite the room; that's an acceptable trade for a link shared with two
people you trust.

**Setup** is one-time, in the Firebase console, not something CI does — see the
project README or ask for the walkthrough.

## Upgrading from a single-draft board

A draft saved before rooms existed is adopted automatically as a room called
`my-league` on first load, rather than being stranded under the old key. It
appears in the picker like any other room.

## Implementation

`src/lib/rooms.js` owns room codes, the room index, URL syncing, and
export/import. `src/lib/storage.js` takes the storage key as an argument, so it
knows nothing about rooms — `roomKey(code)` is what ties them together.

`App` resolves the room first and renders `<Board key={room} …>`, so switching
rooms remounts the board and no state can leak across. Tests in
`test/rooms.test.js` cover isolation, deletion, the legacy adoption path, and
export/import round trips.
