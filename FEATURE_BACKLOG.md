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

## Next up

- [ ] **Tier-aware scarcity.** The multiplier is a flat head-count ratio and
      can't detect a run on the studs while depth remains (e.g. an RB priced at
      $20 looking fine while RB1–3 are long gone). Needs supply weighted by
      roster-relevant quality. The model's replacement-level logic in
      `valueModel.js` already locates the cliff — reuse it.
- [ ] **Reconcile against the elboberto spreadsheet.** Particularly the
      replacement-rank definition and whether bench slots create demand. See
      `docs/VALUE_MODEL.md` for the open choices.
- [ ] **Yahoo market values** without a manual paste — needs a registered OAuth
      app. See `docs/DATA.md`.
- [ ] **Roster view per team.** Right now the strip shows budget and open
      slots but not who's on each roster; useful for reading who still needs a
      QB late.
- [ ] **Nomination suggestions.** Given my budget and needs, who should I throw
      out to drain other teams' money?

## Nice-to-haves

- [ ] Multi-device sync — currently localStorage, one browser, one machine.
      Would need a backend to run the board from a phone while someone else is
      on a laptop.
- [ ] CSV/roster export at draft end.
- [ ] Historical accuracy check: log Live Value vs. actual price paid across a
      full draft to validate the model season over season.
- [ ] Tier bands in the table (visual gaps where the cliffs are).
