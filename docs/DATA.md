# Where the numbers come from

Three ways to get values onto the board, in order of convenience. All three
produce the same shape, so they're interchangeable.

## 1. The Refresh button (live, no deploy)

Both upstream sources send `Access-Control-Allow-Origin: *`, so the browser
fetches them directly — the hosted app on GitHub Pages can pull genuinely live
numbers with no server, no API key, and no rebuild.

| Source | What it gives | Endpoint |
| --- | --- | --- |
| **Sleeper** | Raw projected stat lines (`rush_yd`, `rec`, `pass_td`, …) plus ADP. Undocumented but public and unauthenticated. | `api.sleeper.app/projections/nfl/<season>?season_type=regular&position[]=RB` |
| **ESPN** | `ownership.auctionValueAverage` — real auction money — plus ADP. Public default-league view. | `lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/<season>/segments/0/leaguedefaults/3?view=kona_player_info` |

We take Sleeper's **raw stats**, not its pre-scored totals, so *this* league's
scoring decides the points. Kickers and defenses are the exception — the feeds
don't expose enough of their components to re-score honestly, so their
pre-scored total is used. They're $1 filler anyway.

ESPN returns only 50 players without the `X-Fantasy-Filter` header; with it,
500. That header makes the browser preflight the request, which ESPN currently
allows — if that ever changes, the refresh degrades to fresh projections plus
the last known market values, and says so in the status line.

Refreshing mid-draft is safe: values merge into the pool by id and drafted
state is preserved. A player who's been drafted is never dropped, even if the
new dataset doesn't list him.

## 2. The committed snapshot (offline fallback)

`.github/workflows/refresh-values.yml` runs the same pipeline daily (and on
demand from the Actions tab), commits `public/data/values-<season>.json`, and
the push redeploys the site. The app loads this file on startup and falls back
to it whenever a live refresh fails.

Locally:

```bash
npm run refresh          # current season
npm run refresh -- 2027  # a specific one
```

The script refuses to overwrite the dataset if both sources fail, so a bad
network can't blank the board.

If everything upstream is down, the app still starts: `src/data/players2025.json`
is bundled into the build as a last-resort pool.

## 3. Paste it in by hand (always works)

**Import** in the data bar takes anything tabular — copied cells from the
elboberto spreadsheet, a site's CSV export, a block of text. It sniffs the
delimiter (tab / comma / semicolon), works out which column is the name, the
position and the dollar figure, and tolerates a header row or none.

Choose which column the values land in:

- `projected` — the standalone sheet value, used as the model value for players
  we have no projections for.
- `espn` / `yahoo` / `nffc` / `sleeper` — market columns, averaged into
  **Market $**.

Names are matched ignoring punctuation and suffixes, so `Marvin Harrison`
finds `Marvin Harrison Jr.` and `A.J. Brown` matches `AJ Brown`. Anything
unmatched is listed explicitly rather than silently dropped.

## Yahoo

Yahoo's `draftanalysis` endpoint exposes `average_cost`, but only behind
OAuth2 with a registered application — there's no unauthenticated path. Rather
than make the app carry an OAuth flow for one market column, use the paste
import above. If a registered app is ever worth setting up, the fetch belongs
in `src/lib/sources/yahoo.js` behind env credentials, following the shape of
the other two source modules.

## When a source breaks on draft day

1. Hit **Refresh**. If a source is down you'll get a note saying which half is
   missing, and the other half still updates.
2. Still broken → the last committed snapshot is already loaded. It's at most a
   day old.
3. Numbers look wrong → paste values in by hand. Two minutes, no dependencies.

The board never blocks on the network: it always has a pool.

## Adding a source

1. Write `src/lib/sources/<name>.js` exporting a fetch that returns normalized
   rows (see `sleeper.js` / `espn.js`).
2. Merge it in `src/lib/merge.js` — join on `playerKey(name, pos)` from
   `names.js`, which already handles suffixes, punctuation, and the
   city-vs-nickname mismatch for team defenses.
3. Add the field to `MARKET_KEYS` in `src/App.jsx` so it counts toward
   **Market $**, and to `MARKET_FIELDS` in `components/DataPanel.jsx` so it's
   an import target.

Because `src/lib` is shared, the CLI script and the in-browser refresh both
pick it up with no extra work.
