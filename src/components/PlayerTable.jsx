import React from "react";
import { Trash2, RotateCcw } from "lucide-react";
import TeamPicker from "./TeamPicker.jsx";
import { C, F, money } from "../theme.js";

const deltaColor = (d) => (d > 1 ? C.tealLt : d < -1 ? C.redLt : C.dim);

const PLATFORM_LABEL = { espn: "ESPN", yahoo: "Yahoo", sleeper: "Sleeper", nffc: "NFFC" };

export default function PlayerTable({
  rows, teams, myTeamId, draftInputs, setDraftInput, onDraft, onUndraft, onRemove, maxBidFor,
  onClearFilters, platform = "espn",
}) {
  const siteLabel = PLATFORM_LABEL[platform] || platform.toUpperCase();
  return (
    <div style={styles.wrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Player</th>
            <th style={styles.th}>Pos</th>
            <th style={styles.thNum} title="Bottom-up value from projections for this league's settings">Model $</th>
            <th
              style={styles.thNum}
              title={`What ${siteLabel} publishes — the number the rest of your room is anchored to. Hover a cell to see every source.`}
            >
              {siteLabel} $
            </th>
            <th style={styles.thNum} title={`Model minus ${siteLabel}: positive means the room is underpricing him`}>Edge</th>
            <th style={styles.thNum} title="Model value adjusted for live budget inflation and positional scarcity">Live $</th>
            <th style={styles.thDraft}>Draft</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <Row
              key={p.id}
              p={p}
              teams={teams}
              myTeamId={myTeamId}
              input={draftInputs[p.id]}
              setDraftInput={setDraftInput}
              onDraft={onDraft}
              onUndraft={onUndraft}
              onRemove={onRemove}
              maxBidFor={maxBidFor}
            />
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} style={styles.empty}>
                No players match these filters.
                {onClearFilters && (
                  <button style={styles.clearFilters} onClick={onClearFilters}>
                    clear filters
                  </button>
                )}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Row({ p, teams, myTeamId, input, setDraftInput, onDraft, onUndraft, onRemove, maxBidFor }) {
  const v = p._val;
  const state = input || { price: "", teamId: "" };
  const priceNum = parseInt(state.price, 10);
  const overMax = state.teamId && priceNum > 0 && priceNum > maxBidFor(state.teamId);
  const mine = p.drafted && p.draftedBy === myTeamId;

  return (
    <tr style={{ opacity: p.drafted ? 0.5 : 1, background: mine ? "rgba(216,166,61,0.07)" : "transparent" }}>
      <td style={styles.tdName}>{p.name}</td>
      <td style={styles.td}><span style={styles.posPill}>{p.pos}</span></td>
      <td style={styles.tdNum}>{money(v.model)}</td>
      <td style={styles.tdNum} title={marketBreakdown(p, v)}>
        {v.site != null && money(v.site)}
        {/* No value from the league's own platform — show the consensus of the
            other sources instead, marked so it isn't mistaken for the real one. */}
        {v.site == null && v.consensus != null && (
          <span style={{ color: C.dim, fontStyle: "italic" }}>~{money(v.consensus)}</span>
        )}
        {v.site == null && v.consensus == null && <span style={{ color: C.dimmer }}>—</span>}
      </td>
      <td style={{ ...styles.tdNum, color: deltaColor(v.edge) }}>
        {v.market
          ? `${v.edge > 0 ? "+" : v.edge < 0 ? "−" : ""}${Math.abs(Math.round(v.edge))}`
          : ""}
      </td>
      {/* The delta keeps its width whether or not there's a number in it, so
          the dollar figures stay in one straight column down the page. */}
      <td style={styles.tdNum}>
        <span style={styles.liveCell}>
          <span style={{ fontWeight: 700 }}>{money(v.live)}</span>
          <span style={{ ...styles.liveDelta, color: deltaColor(v.live - v.model) }}>
            {Math.round(v.live - v.model) !== 0 &&
              `${v.live > v.model ? "+" : "−"}${Math.abs(Math.round(v.live - v.model))}`}
          </span>
        </span>
      </td>
      <td style={styles.tdDraft}>
        {p.drafted ? (
          <div style={styles.draftedInfo}>
            <span style={{ fontFamily: F.mono, fontWeight: 700 }}>{money(p.paid)}</span>
            <span style={{ fontSize: 11, color: C.dimmer }}>
              {teams.find((t) => t.id === p.draftedBy)?.name || "?"}
            </span>
            <VerdictTag paid={p.paid} snap={p.snapAdjValue} />
            <button style={styles.iconBtn} onClick={() => onUndraft(p.id)} title="Undo this pick">
              <RotateCcw size={12} />
            </button>
          </div>
        ) : (
          <div style={styles.draftForm}>
            <input
              type="number"
              min="1"
              placeholder="$"
              style={{ ...styles.priceInput, borderColor: overMax ? C.red : C.line2 }}
              value={state.price}
              title={overMax ? "Above that team's max bid" : undefined}
              onChange={(e) => setDraftInput(p.id, { ...state, price: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); onDraft(p.id); }
              }}
              aria-label={`Price for ${p.name}`}
            />
            <TeamPicker
              teams={teams}
              teamId={state.teamId}
              onPick={(teamId, opts) => {
                const next = { ...state, teamId };
                setDraftInput(p.id, next);
                // Enter on the team finishes the pick when the price is already
                // in. `next` is passed explicitly — App's copy of this input
                // hasn't re-rendered yet.
                if (opts?.viaEnter && next.price) onDraft(p.id, next);
              }}
              onSubmit={() => onDraft(p.id)}
            />
            <button
              style={{ ...styles.draftBtn, opacity: state.price && state.teamId ? 1 : 0.45 }}
              onClick={() => onDraft(p.id)}
              title={state.price && state.teamId ? "Log this pick" : "Needs a price and a team"}
            >
              draft
            </button>
            <button style={styles.iconBtn} onClick={() => onRemove(p.id)} title="Remove from the pool">
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

function VerdictTag({ paid, snap }) {
  if (snap == null) return null;
  const d = paid - snap;
  if (Math.abs(d) <= 1) return <span style={{ fontSize: 11, color: C.dim }}>fair</span>;
  return (
    <span style={{ fontSize: 11, color: d > 0 ? C.redLt : C.tealLt }}>
      {d > 0 ? "over by " : "value by "}{money(Math.abs(d))}
    </span>
  );
}

function marketBreakdown(p, v) {
  const parts = [];
  if (p.yahoo != null) parts.push(`Yahoo $${p.yahoo}`);
  if (p.espn != null) parts.push(`ESPN $${p.espn}`);
  if (p.nffc != null) parts.push(`NFFC $${p.nffc}`);
  if (p.sleeper != null) parts.push(`Sleeper $${p.sleeper}`);
  if (parts.length === 0) return "no published values";
  if (v?.consensus != null && parts.length > 1) {
    parts.push(`consensus $${Math.round(v.consensus)}`);
  }
  if (p.adp) parts.push(`ADP ${Math.round(p.adp)}`);
  return parts.join("  ·  ");
}

const headCell = {
  fontFamily: F.head, fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase",
  color: C.dim, background: C.panel, padding: "9px 12px",
  borderBottom: `1px solid ${C.line}`, position: "sticky", top: 0, zIndex: 10,
};

const styles = {
  wrap: { overflowX: "auto", border: `1px solid ${C.line}`, borderRadius: 8 },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 780 },
  th: { ...headCell, textAlign: "left" },
  thNum: { ...headCell, textAlign: "right" },
  thDraft: { ...headCell, textAlign: "right", minWidth: 250 },
  td: { padding: "7px 12px", borderBottom: `1px solid #1c261f`, fontSize: 12.5 },
  tdName: { padding: "7px 12px", borderBottom: `1px solid #1c261f`, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" },
  tdNum: { padding: "7px 12px", borderBottom: `1px solid #1c261f`, fontSize: 12.5, textAlign: "right", fontFamily: F.mono },
  tdDraft: { padding: "5px 12px", borderBottom: `1px solid #1c261f` },
  liveCell: { display: "inline-flex", alignItems: "baseline", justifyContent: "flex-end" },
  liveDelta: { fontSize: 10, width: 22, textAlign: "left", paddingLeft: 5, flex: "0 0 auto" },
  posPill: {
    fontFamily: F.mono, fontSize: 10.5, fontWeight: 700, color: C.dim,
    border: `1px solid ${C.line2}`, borderRadius: 4, padding: "1px 6px",
  },
  draftForm: { display: "flex", gap: 5, alignItems: "center", justifyContent: "flex-end" },
  priceInput: {
    width: 52, background: C.bg, border: "1px solid", color: C.text,
    borderRadius: 4, padding: "5px 6px", fontSize: 12, fontFamily: F.mono,
  },
  draftBtn: {
    background: C.green, color: C.text, border: "none", borderRadius: 4,
    padding: "6px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer",
  },
  iconBtn: { background: "none", border: "none", color: "#4a5850", cursor: "pointer", padding: 4 },
  draftedInfo: { display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", fontSize: 11.5 },
  empty: { textAlign: "center", padding: 24, color: C.dimmer, fontSize: 12.5 },
  clearFilters: {
    marginLeft: 10, background: "none", border: `1px solid ${C.line2}`, color: C.bone,
    borderRadius: 5, padding: "4px 10px", fontSize: 11.5, cursor: "pointer",
  },
};
