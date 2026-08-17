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

## Getting Yahoo's auction values — step by step

Takes about a minute. No login, no account, no API key.

1. **Open the page.** Go to
   [football.fantasysports.yahoo.com/f1/draftanalysis?type=salcap](https://football.fantasysports.yahoo.com/f1/draftanalysis?type=salcap)
   — that's Yahoo's public Draft Analysis with the **Salary Cap** tab already
   selected. (If you land on the standard tab, click **Salary Cap** at the top.)
   You should see columns: Player, Rank, Pos Rank, CER, %Drafted, **Avg $**,
   Proj $.

2. **Get everyone on one page** by adding `&count=300` to the URL:

   ```
   https://football.fantasysports.yahoo.com/f1/draftanalysis?type=salcap&pos=ALL&count=300
   ```

   That's the whole draftable pool in a single table — no paging, no batching.
   (300 is plenty: a 12-team league rosters ~190 players, and everyone past
   that is a $1 flier.)

3. **Select the table and copy.** Click just above the "Player" header, drag to
   the bottom, Ctrl+C. Grabbing extra page furniture is fine — headers, nav and
   stray text are ignored. Rows too deep to have auction data (`294 - - 1`) are
   skipped rather than guessed at, so a full-page select is safe.

4. **Paste it in.** In Draft Board click **Import**, paste into the box, set
   *import into* → **yahoo**, and click apply. The preview shows the first few
   parsed rows so you can confirm before committing.

**Which number gets used:** **Avg $** — what Yahoo drafters actually paid — not
Yahoo's own **Proj $** projection. We already do our own projection; the point
of importing is to capture the market.

**How many players is enough?** A 12-team league with 15–16 roster spots takes
~190 players. Anything past ~270 is priced at $1 by every source anyway, and
the model floors them there regardless. So a single `count=300` grab is more
than sufficient — there's nothing to gain from going deeper.

**Why it can't be automatic — and why a login wouldn't help.** Yahoo renders
that table with JavaScript after the page loads, so there's nothing in the HTML
to fetch server-side, and the page sends no CORS header, so the browser can't
read it cross-origin either. Neither of those is an authentication problem:
signing in changes nothing about them. Their official API *does* expose
`average_cost` via `draftanalysis`, but it needs OAuth2 with a registered
application — that's a developer app registration, not a username and password.
If it's ever worth setting up, the fetch belongs in `src/lib/sources/yahoo.js`
behind env credentials, shaped like the other source modules, and it would run
locally rather than from the deployed page.

**The paste shape is handled.** Yahoo's table copies out vertically — one cell
per line, with empty cells dropped entirely:

```
Jahmyr Gibbs
Det - RB       <- team + position, which is how records are found
Q              <- injury flag, sometimes absent
1              <- rank
100%           <- % drafted
73.3           <- Avg $   <- this is the one taken
64             <- Proj $
```

The importer detects this layout, reads the position out of the `Det - RB`
line, and takes the first dollar figure after the percentage. Name suffixes are
ignored on both sides, so Yahoo's "James Cook III" finds "James Cook".

## Getting FantasyPros' auction values — step by step

FantasyPros' [auction values calculator](https://www.fantasypros.com/nfl/auction-values/calculator.php)
is a separate, always-visible **FP $** column (between **Model $** and **Site
$**) rather than a "Drafting on" platform choice — it's not a site anyone
actually drafts on, it's a second opinion worth comparing against. It also
folds into **Market $**/consensus and **Edge** like the other sources, since
`applyImport` treats it the same as Yahoo or NFFC.

1. **Open the page** and set the scoring format to match the league (0.5 PPR,
   unless told otherwise — check with whoever set the league scoring, since
   the site defaults to standard).
2. **Select the table and copy** — click above the "Player" header, drag to
   the bottom, Ctrl+C.
3. **Paste it in.** Click **Import**, paste into the box, set *import into* →
   **fantasypros**, and click apply.

Like Yahoo, this page renders with JavaScript and sends no CORS header, so
there's nothing to fetch automatically — paste is the only route in.

**The paste shape is handled.** The calculator copies out as several tables
stitched together, one per position, each with its own repeated header row
(`# QB Value`, then `# RB Value`, ...), and the team rides right in the name
cell — `Josh Allen, BUF`, sometimes with an injury badge stuck on with no
space (`Patrick Mahomes II, KCDTD`). The importer drops the repeated headers,
tags each row with the position from whichever header preceded it, and strips
everything from the first comma onward before matching names.

## Telling the board which site you're on

**Settings → Drafting on** picks which source fills the **Site $** column and
what **Edge** is measured against. Set it to the platform your auction actually
runs on: that's the number on everyone's screen, and it anchors the bidding
whether or not they've done their own homework — especially if a single team is
on autodraft.

If the selected platform has no value for a player, the cell shows the
consensus of the other sources in italics with a `~`, so a fallback is never
mistaken for the real thing.

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
