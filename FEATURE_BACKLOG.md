# Backlog

## Bugs
Josh has spotted a few bugs from using it during a live draft but hasn't
enumerated them yet — first thing to do in the new thread is list them
here with repro steps, then fix.

- [ ] (fill in)

## Features Josh wants next
- [ ] **2026 data refresh, on demand.** Replace `scripts/gen_seed.mjs`
      placeholder with something that actually pulls current Yahoo/ESPN/NFFC
      AAV and regenerates the seed JSON — ideally a button/command that
      re-fetches without needing a redeploy.
- [ ] Quality-of-life items — Josh to specify (sorting/filtering preferences,
      keyboard shortcuts for faster in-draft entry, undo history beyond
      single-step, CSV/roster export at draft end, etc.)

## Known modeling limitation (see README)
- [ ] **Tier-aware scarcity.** Current scarcity multiplier is a flat
      head-count ratio and can't detect a "run on the studs while depth
      remains" situation (e.g. RJ Harvey being underpriced at $20 despite
      RB1-3 being long gone). Needs a supply definition weighted by
      roster-relevant quality (e.g. top-24 RBs in a 12-team/2-starter
      league) rather than counting every remaining player equally.

## Nice-to-haves / not yet requested but worth considering
- [ ] Multi-device sync (currently localStorage only — one browser, one
      machine). Would need a real backend if Josh ever wants to run this
      from his phone during a draft while someone else is on a laptop.
- [ ] Draft history/undo log beyond last-pick undo.
- [ ] Historical accuracy check: log how "Live Value" vs. actual price paid
      tracked across a full draft, to validate the model season over season.
