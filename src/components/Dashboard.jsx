import React from "react";
import { Star } from "lucide-react";
import { SCARCITY_POS, FLEX_ELIGIBLE } from "../lib/draftMath.js";
import { C, F, ui, money, fmtMult } from "../theme.js";

// Two readings, deliberately kept apart:
//   Room pressure  — league-wide money vs. value still on the board (global).
//   Scarcity chips — each position's supply/demand vs. where it started (local).
// Conflating them gives bad in-draft advice: "we had to overpay" means
// something different in each case.
// The scale is logarithmic between 0.5x and 2x, which are reciprocals, so
// 1.00x sits dead centre and a 25% premium is exactly as far right as a 25%
// discount is left. A linear 0.6–1.6 scale put "neutral" at 40%, which read as
// though the room were already running hot before anyone had bid.
const GAUGE_MIN = 0.5;
const GAUGE_MAX = 2;
const gaugePercent = (mult) => {
  const clamped = Math.min(GAUGE_MAX, Math.max(GAUGE_MIN, mult));
  return (Math.log(clamped / GAUGE_MIN) / Math.log(GAUGE_MAX / GAUGE_MIN)) * 100;
};

export function PressureGauge({ live }) {
  const mult = live.budgetInflationMult;
  const pct = gaugePercent(mult);
  const tone = mult >= 1.08 ? "hot" : mult <= 0.92 ? "cold" : "even";
  const fill = tone === "hot" ? C.red : tone === "cold" ? C.teal : C.gold;
  const label = tone === "hot" ? C.redLt : tone === "cold" ? C.tealLt : C.goldLt;

  return (
    <div style={styles.gaugeCard}>
      <div style={styles.gaugeLabel}>
        ROOM PRESSURE{" "}
        <span style={{ opacity: 0.6, fontWeight: 400 }}>— what $1 of value costs right now</span>
      </div>
      <div style={styles.gaugeTrack}>
        <div style={styles.gaugeTickCenter} />
        <div style={{ ...styles.gaugeFill, width: `${pct}%`, background: fill }} />
        <div style={{ ...styles.gaugeNeedle, left: `${pct}%` }} />
      </div>
      <div style={styles.gaugeFoot}>
        <span>{GAUGE_MIN}x</span>
        <span style={{ fontFamily: F.mono, fontSize: 20, fontWeight: 700, color: label }}>{fmtMult(mult)}</span>
        <span>{GAUGE_MAX}x</span>
      </div>
      {/* Say the number out loud rather than making it a vibe. Above 1x means
          the room has money left over relative to the talent left, so prices
          run above model value — which is what you do about it. */}
      <div style={{ fontSize: 11.5, color: C.bone, marginTop: 4 }}>
        {tone === "hot" && <>Expect to pay <b>{money(mult * 100)} per $100</b> of model value. Bargains are gone; budget up.</>}
        {tone === "cold" && <>Players are going for <b>{money(mult * 100)} per $100</b> of model value. Money is scarce — good time to buy.</>}
        {tone === "even" && <>Prices are tracking model value — about <b>{money(mult * 100)} per $100</b>.</>}
      </div>
      <div style={styles.gaugeMath}>
        {money(live.competitiveDollars)} of bidding money left chasing{" "}
        {money(live.valueLeftAtPar ?? live.undraftedValueSum)} of value
      </div>
    </div>
  );
}

// Quadrant verdict: scarcity tone (room-wide, from the multiplier) crossed
// with need (yours alone, from your open roster slots). The multiplier only
// tells you the position's temperature; it can't say what to do about it
// without knowing whether you're still shopping there. Four situations,
// stated as an action rather than left for you to re-derive at the table:
//   need + hot   -> the price only gets worse, don't wait
//   need + cold  -> no urgency, the position is currently a buyer's market
//   full + hot   -> your nomination taxes rivals who are stuck needing it
//   full + cold  -> nobody's threatened, nominating here wastes a turn
// FLEX has no verdict of its own below — you nominate a specific RB/WR/TE,
// never "a flex" — so it stays a context-only reading, same as before.
const VERDICTS = {
  "hot-need": { label: "Strike now", detail: "price only climbs from here" },
  "hot-full": { label: "Nominate to bleed rivals", detail: "teams that need it are stuck paying up" },
  "cold-need": { label: "No rush", detail: "buyer's market — wait for your price" },
  "cold-full": { label: "Skip nominating", detail: "nobody's threatened, it won't bleed anyone" },
  "even-need": { label: "Tracking fair", detail: "buy at model price when the player's right" },
  "even-full": { label: "Neutral", detail: "no scarcity edge to exploit here" },
};

const toneOf = (m) => (m >= 1.25 ? "hot" : m <= 0.8 ? "cold" : "even");
const toneColors = (tone) => ({
  borderColor: tone === "hot" ? "#5b2c28" : tone === "cold" ? "#204d47" : "#3a4a3e",
  background: tone === "hot" ? "#221514" : tone === "cold" ? "#0f2320" : "#141d17",
});
const toneTextColor = (tone) => (tone === "hot" ? C.redLt : tone === "cold" ? C.tealLt : C.bone);

export function ScarcityChips({ live, myTeamId, fillCounts, roster = {}, numTeams = 0 }) {
  const myBreakdown = myTeamId ? live.teamStats[myTeamId]?.breakdown : null;
  const taken = fillCounts?.taken || {};
  const flexTotal = (roster.FLEX || 0) * numTeams;
  const benchTotal = (roster.BENCH || 0) * numTeams;
  const flexMult = live.scarcityMult.FLEX || 1;
  const flexTone = toneOf(flexMult);

  return (
    <div style={styles.chips}>
      {SCARCITY_POS.map((pos) => {
        const m = live.scarcityMult[pos] || 1;
        const tone = toneOf(m);
        const posTotal = (roster[pos] || 0) * numTeams;
        const needIt = myBreakdown
          ? (myBreakdown.openDedicated[pos] || 0) > 0 ||
            (FLEX_ELIGIBLE.includes(pos) && myBreakdown.openFlex > 0)
          : true; // no team selected: default to showing the buy-side read
        const verdict = VERDICTS[`${tone}-${needIt ? "need" : "full"}`];
        return (
          <div
            key={pos}
            title={`Open ${pos} slots against ${pos} value left on the board, versus draft start`}
            style={{ ...styles.chip, ...toneColors(tone) }}
          >
            <div style={styles.chipTop}>
              <div style={styles.chipPos}>{pos}</div>
              <div style={styles.chipNeed} title={needIt ? "You have an open slot here" : "Your roster is full here"}>
                {needIt ? "NEED" : "FULL"}
              </div>
            </div>
            <div style={{ fontFamily: F.mono, fontSize: 18, fontWeight: 700, color: toneTextColor(tone) }}>
              {fmtMult(m)}
            </div>
            <div style={styles.chipVerdict}>{verdict.label}</div>
            <div style={styles.chipHint}>{verdict.detail}</div>
            {/* Plain head count, deliberately separate from the verdict above
                — the verdict says what to do, this says how many bodies are
                actually gone. A team's picks past its dedicated slots
                overflow into FLEX and BENCH (see leagueFillCounts), which is
                why those two get their own chips instead of a "taken" count. */}
            <div style={styles.chipCount} title={`${pos} players actually drafted, league-wide`}>
              {taken[pos] ?? 0}/{posTotal} taken
            </div>
            <div style={styles.chipValue} title="Model value still on the board at this position">
              {money(live.valueLeftByPos?.[pos] ?? 0)} left
            </div>
          </div>
        );
      })}

      {/* FLEX: RB+WR+TE combined context reading, not a nomination target of
          its own, so no NEED/FULL badge or verdict — just the multiplier and
          fill count, as before this change. */}
      <div
        title="RB + WR + TE combined: whether startable skill talent overall is drying up. Shown for context — a player's price uses his own position."
        style={{ ...styles.chip, ...styles.chipFlex, ...toneColors(flexTone) }}
      >
        <div style={styles.chipPos}>FLEX</div>
        <div style={{ fontFamily: F.mono, fontSize: 18, fontWeight: 700, color: toneTextColor(flexTone) }}>
          {fmtMult(flexMult)}
        </div>
        <div style={styles.chipHint}>
          {flexTone === "hot" ? "drying up" : flexTone === "cold" ? "plenty left" : "on pace"}
        </div>
        <div style={styles.chipCount} title="Total FLEX slots filled league-wide, from any position's overflow">
          {fillCounts?.flexFilled ?? 0}/{flexTotal} filled
        </div>
        <div style={styles.chipValue} title="Model value still on the board at this position">
          {money(live.valueLeftByPos?.FLEX ?? 0)} left
        </div>
      </div>

      {/* Bench has no scarcity multiplier of its own — it's not a starting
          slot, so there's no "thin vs. draft start" question to ask — but
          the fill count is still worth a glance: it's the overflow that
          didn't fit in a dedicated or FLEX slot. */}
      <div style={{ ...styles.chip, ...styles.chipFlex }} title="Total BENCH slots filled league-wide, from any position's overflow past its dedicated and FLEX slots">
        <div style={styles.chipPos}>BENCH</div>
        <div style={{ fontFamily: F.mono, fontSize: 18, fontWeight: 700, color: C.bone }}>
          {fillCounts?.benchFilled ?? 0}
        </div>
        <div style={styles.chipHint}>filled</div>
        <div style={styles.chipValue}>of {benchTotal} slots</div>
      </div>
    </div>
  );
}

export function TeamStrip({ teams, live }) {
  return (
    <div style={styles.strip}>
      {teams.map((t) => {
        const st = live.teamStats[t.id];
        if (!st) return null;
        const tight = st.remaining <= 15;
        return (
          <div key={t.id} style={{ ...styles.teamCard, borderColor: t.isMe ? C.gold : C.line }}>
            <div style={styles.teamName}>
              {t.isMe && <Star size={11} style={{ marginRight: 4, color: C.gold }} fill={C.gold} />}
              {t.name}
            </div>
            <div style={styles.teamBudgetRow}>
              <span style={{ fontFamily: F.mono, fontWeight: 700, fontSize: 16, color: tight ? C.redLt : C.text }}>
                {money(st.remaining)}
              </span>
              <span style={{ fontSize: 10, color: C.dimmer }}>left</span>
            </div>
            <div style={styles.teamSub}>
              max {money(Math.max(1, st.maxBid))} · {st.breakdown.openSlotsTotal} open
            </div>
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  gaugeCard: { ...ui.panel, flex: "1 1 340px", padding: "14px 16px" },
  gaugeLabel: {
    fontFamily: F.head, fontSize: 12, letterSpacing: "0.05em", color: C.bone,
    marginBottom: 8, textTransform: "uppercase",
  },
  gaugeTrack: { position: "relative", height: 10, borderRadius: 5, background: "#1c261f", overflow: "hidden" },
  gaugeTickCenter: { position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#3a4a3e", zIndex: 1 },
  gaugeFill: { height: "100%", borderRadius: 5, transition: "width .4s ease" },
  gaugeNeedle: { position: "absolute", top: -3, width: 2, height: 16, background: C.text, transform: "translateX(-1px)" },
  gaugeFoot: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, fontSize: 11, color: C.dimmer },
  gaugeMath: { fontSize: 10.5, color: C.dimmer, marginTop: 3, fontFamily: F.mono },
  chips: { display: "flex", gap: 8, flexWrap: "wrap" },
  chip: { border: "1px solid", borderRadius: 8, padding: "10px 14px", minWidth: 118, textAlign: "center" },
  chipTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 },
  // Set apart because it's context, not a multiplier anyone's price uses.
  chipFlex: { borderStyle: "dashed", opacity: 0.9 },
  chipPos: { fontFamily: F.head, fontSize: 11, letterSpacing: "0.08em", color: C.dim },
  chipNeed: { fontFamily: F.head, fontSize: 9, letterSpacing: "0.06em", color: C.dimmer },
  chipVerdict: { fontSize: 11, fontWeight: 700, color: C.bone, marginTop: 4 },
  chipHint: { fontSize: 9.5, color: C.dimmer, marginTop: 2 },
  chipCount: { fontSize: 9.5, color: C.dim, marginTop: 3, fontFamily: F.mono },
  chipValue: { fontSize: 9.5, color: C.dim, marginTop: 3, fontFamily: F.mono },
  strip: { display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6, marginBottom: 14 },
  teamCard: { ...ui.panel, flex: "0 0 auto", minWidth: 112, border: "1px solid", padding: "8px 10px" },
  teamName: { display: "flex", alignItems: "center", fontSize: 11.5, fontWeight: 600, color: C.bone, marginBottom: 4, whiteSpace: "nowrap" },
  teamBudgetRow: { display: "flex", alignItems: "baseline", gap: 5 },
  teamSub: { fontSize: 9.5, color: C.dimmer, marginTop: 3 },
};
