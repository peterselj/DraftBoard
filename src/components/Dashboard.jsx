import React from "react";
import { Star } from "lucide-react";
import { SCARCITY_POS } from "../lib/draftMath.js";
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

export function ScarcityChips({ live }) {
  return (
    <div style={styles.chips}>
      {[...SCARCITY_POS, "FLEX"].map((pos) => {
        const m = live.scarcityMult[pos] || 1;
        const tone = m >= 1.25 ? "hot" : m <= 0.8 ? "cold" : "even";
        const isFlex = pos === "FLEX";
        return (
          <div
            key={pos}
            title={isFlex
              ? "RB + WR + TE combined: whether startable skill talent overall is drying up. Shown for context — a player's price uses his own position."
              : `Open ${pos} slots against ${pos} value left on the board, versus draft start`}
            style={{
              ...styles.chip,
              ...(isFlex ? styles.chipFlex : null),
              borderColor: tone === "hot" ? "#5b2c28" : tone === "cold" ? "#204d47" : "#3a4a3e",
              background: tone === "hot" ? "#221514" : tone === "cold" ? "#0f2320" : "#141d17",
            }}
          >
            <div style={styles.chipPos}>{pos}</div>
            <div
              style={{
                fontFamily: F.mono, fontSize: 18, fontWeight: 700,
                color: tone === "hot" ? C.redLt : tone === "cold" ? C.tealLt : C.bone,
              }}
            >
              {fmtMult(m)}
            </div>
            <div style={styles.chipHint}>
              {tone === "hot" ? "drying up" : tone === "cold" ? "plenty left" : "on pace"}
            </div>
            <div style={styles.chipValue} title="Model value still on the board at this position">
              {money(live.valueLeftByPos?.[pos] ?? 0)} left
            </div>
          </div>
        );
      })}
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
  chip: { border: "1px solid", borderRadius: 8, padding: "10px 14px", minWidth: 76, textAlign: "center" },
  // Set apart because it's context, not a multiplier anyone's price uses.
  chipFlex: { borderStyle: "dashed", opacity: 0.9 },
  chipPos: { fontFamily: F.head, fontSize: 11, letterSpacing: "0.08em", color: C.dim },
  chipHint: { fontSize: 9.5, color: C.dimmer, marginTop: 2 },
  chipValue: { fontSize: 9.5, color: C.dim, marginTop: 3, fontFamily: F.mono },
  strip: { display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6, marginBottom: 14 },
  teamCard: { ...ui.panel, flex: "0 0 auto", minWidth: 112, border: "1px solid", padding: "8px 10px" },
  teamName: { display: "flex", alignItems: "center", fontSize: 11.5, fontWeight: 600, color: C.bone, marginBottom: 4, whiteSpace: "nowrap" },
  teamBudgetRow: { display: "flex", alignItems: "baseline", gap: 5 },
  teamSub: { fontSize: 9.5, color: C.dimmer, marginTop: 3 },
};
