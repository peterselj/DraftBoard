# Backlog

## Bugs

Fixed in the conversion from the Claude artifact (see git history):

- [x] **New Draft did nothing.** `resetDraft()` gated on `window.confirm()`,
      which sandboxed iframes suppress, so the handler always bailed. Replaced
      with an in-app confirm dialog.
- [x] **Hide Drafted looked dead.** The filter was correct; it was a bare
      checkbox with no visible state, next to a sort that already pushed
      drafted rows to the bottom. Now a real toggle with a count.
- [x] **Add Player half-worked.** It inserted correctly but could land outside
      the active filter, and the scarcity baseline was computed from the
      shipped seed file, so added/removed players never affected it.
- [x] **Unguarded delete.** The trash icon permanently removed a player with no
      confirm and no undo, one click from "draft".
- [x] **Room pressure read hot on an untouched board** (1.28x before anyone had
      spent a dollar) because inflation compared remaining money against market
      AAV, which was never scaled to this league's budget. Now compared against
      model value.
- [x] **`$80` and a zero delta rendered as `$800`.**
- [x] **Position buttons kept a wrong border colour after being toggled once.**
      React drops style *longhands* it no longer sees but leaves the `border`
      shorthand in place, so removing `borderColor` reset the colour to
      `initial` (black) instead of the base colour. Every style now splits
      `border: "1px solid"` from an always-present `borderColor` — see the note
      in `src/theme.js`.
- [x] **Scarcity counted bodies instead of value**, so taking the top 4 RBs
      reported RB as *less* scarce (0.94x) when it had obviously tightened
      (now 1.17x). Supply is measured in dollars on the board.
- [x] **Upgrading mid-draft pinned every scarcity multiplier to the clamp**,
      because a saved head-count baseline was being compared against the new
      dollar-denominated supply. Storage schema v3 discards the stale baseline
      and recomputes it.

## Next up
- [ ] **Reconcile against the elboberto spreadsheet.** Particularly the
      replacement-rank definition and whether bench slots create demand. See
      `docs/VALUE_MODEL.md` for the open choices.
- [ ] **Yahoo market values** without a manual paste — needs a registered OAuth
      app. See `docs/DATA.md`.
- [ ] **Positional need in the team strip.** Not a full roster view — the
      drafting site already shows that. The useful version is "who still needs
      an RB and can afford one", which is what predicts the next bidding war.
- [ ] **Nomination suggestions.** Given my budget and needs, who should I throw
      out to drain other teams' money?
- [ ] **Revisit whether team attribution can become optional.** It currently
      earns its keep: slot type (starter / flex / bench) drives the demand half
      of scarcity, and per-team budgets drive max-bid warnings. If a future
      model stops needing slot type, the third token could be dropped for speed.

## Nice-to-haves

- [ ] Multi-device sync — currently localStorage, one browser, one machine.
      Would need a backend to run the board from a phone while someone else is
      on a laptop.
- [ ] CSV/roster export at draft end.
- [ ] Historical accuracy check: log Live Value vs. actual price paid across a
      full draft to validate the model season over season.
- [ ] Tier bands in the table (visual gaps where the cliffs are).
