import React, { useState } from "react";
import { RotateCcw, Eye, EyeOff, Check } from "lucide-react";
import TeamPicker from "./TeamPicker.jsx";
import { C, F, money } from "../theme.js";

const deltaColor = (d) => (d > 1 ? C.tealLt : d < -1 ? C.redLt : C.dim);

const PLATFORM_LABEL = { espn: "ESPN", yahoo: "Yahoo", sleeper: "Sleeper", nffc: "NFFC" };

// The three pasted/derived sources, stacked compact next to each other. Any
// one of them can be picked (Settings → Value basis, or the check icon here)
// as what Live $ and Site Edge are built from — see App.jsx's basisOf.
const SRC_COLUMNS = [
  { key: "fp", short: "FP", valueKey: "fp", title: "FantasyPros' 0.5 PPR auction calculator, pasted in manually" },
  { key: "model", short: "JP", valueKey: "model", title: "Our own bottom-up value from projections, shaped to this league's exact roster" },
  { key: "etr", short: "ETR", valueKey: "etr", title: "Establish The Run's values, pasted in manually" },
];

export default function PlayerTable({
  rows, teams, myTeamId, draftInputs, setDraftInput, onDraft, onUndraft, maxBidFor,
  onClearFilters, platform = "espn", basisSource = "fp", onSelectBasis,
}) {
  const siteLabel = PLATFORM_LABEL[platform] || platform.toUpperCase();
  // Sleeper doesn't publish target auction values at all — a Site $ column
  // for it would just be a blank column, so it (and the edge that depends on
  // it) drops out entirely rather than sitting there empty.
  const showSite = platform !== "sleeper";
  const [visible, setVisible] = useState({ fp: true, model: true, etr: true });
  const toggleVisible = (key) => setVisible((v) => ({ ...v, [key]: !v[key] }));

  const columnCount = 2 /* player, pos */ + SRC_COLUMNS.length + 1 /* spacer */
    + (showSite ? 2 : 0) + 1 /* live */ + 1 /* draft */;

  return (
    <div style={styles.wrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Player</th>
            <th style={styles.th}>Pos</th>
            {SRC_COLUMNS.map((c) => (
              <th
                key={c.key}
                className="src-head"
                style={{
                  ...styles.thNum,
                  ...styles.thSrc,
                  ...(visible[c.key] ? null : styles.thSrcHidden),
                }}
                title={c.title}
              >
                {visible[c.key] ? (
                  <span style={styles.srcHeadInner}>
                    <span style={{ color: basisSource === c.key ? C.gold : C.dim }}>{c.short} $</span>
                    <span className="src-ctrls" style={styles.srcCtrls}>
                      <button
                        type="button"
                        style={styles.srcIconBtn}
                        onClick={() => toggleVisible(c.key)}
                        title={`Hide ${c.short} $`}
                      >
                        <Eye size={11} />
                      </button>
                      <button
                        type="button"
                        style={styles.srcIconBtn}
                        onClick={() => onSelectBasis?.(c.key)}
                        title={`Use ${c.short} $ as the Live $ basis`}
                      >
                        <Check size={11} color={basisSource === c.key ? C.gold : undefined} />
                      </button>
                    </span>
                  </span>
                ) : (
                  <button
                    type="button"
                    style={styles.srcIconBtn}
                    onClick={() => toggleVisible(c.key)}
                    title={`Show ${c.short} $`}
                  >
                    <EyeOff size={12} />
                  </button>
                )}
              </th>
            ))}
            <th style={styles.thGap} aria-hidden />
            {showSite && (
              <>
                <th
                  style={styles.thNum}
                  title={`What ${siteLabel} publishes — the number the rest of your room is anchored to. Hover a cell to see every source.`}
                >
                  {siteLabel} $
                </th>
                <th
                  style={styles.thNum}
                  title={`Basis (${basisSource === "model" ? "JP" : basisSource === "etr" ? "ETR" : "FP"} $) minus ${siteLabel}: positive means ${siteLabel} is pricing him below what we think he's worth — a bargain`}
                >
                  Site Edge
                </th>
              </>
            )}
            <th style={{ ...styles.thNum, ...styles.thLive }} title="Value adjusted for live budget inflation and positional scarcity, based on whichever source is selected as the basis">
              Live $
            </th>
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
              maxBidFor={maxBidFor}
              visible={visible}
              showSite={showSite}
            />
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columnCount} style={styles.empty}>
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

function Row({ p, teams, myTeamId, input, setDraftInput, onDraft, onUndraft, maxBidFor, visible, showSite }) {
  const v = p._val;
  const state = input || { price: "", teamId: "" };
  const priceNum = parseInt(state.price, 10);
  const overMax = state.teamId && priceNum > 0 && priceNum > maxBidFor(state.teamId);
  const mine = p.drafted && p.draftedBy === myTeamId;

  return (
    <tr style={{ opacity: p.drafted ? 0.5 : 1, background: mine ? "rgba(216,166,61,0.07)" : "transparent" }}>
      <td style={styles.tdName}>{p.name}</td>
      <td style={styles.td}><span style={styles.posPill}>{p.pos}</span></td>
      {SRC_COLUMNS.map((c) => (
        <td key={c.key} style={{ ...styles.tdNum, ...styles.tdSrc }}>
          {visible[c.key] && (
            v[c.valueKey] != null ? money(v[c.valueKey]) : <span style={{ color: C.dimmer }}>—</span>
          )}
        </td>
      ))}
      <td style={styles.tdGap} aria-hidden />
      {showSite && (
        <>
          <td style={styles.tdNum} title={marketBreakdown(p, v)}>
            {v.site != null && money(v.site)}
            {/* No value from the league's own platform — show the consensus of the
                other sources instead, marked so it isn't mistaken for the real one. */}
            {v.site == null && v.consensus != null && (
              <span style={{ color: C.dim, fontStyle: "italic" }}>~{money(v.consensus)}</span>
            )}
            {v.site == null && v.consensus == null && <span style={{ color: C.dimmer }}>—</span>}
          </td>
          <td style={{ ...styles.tdNum, color: deltaColor(v.siteEdge) }}>{edgeText(v.siteEdge)}</td>
        </>
      )}
      {/* The delta keeps its width whether or not there's a number in it, so
          the dollar figures stay in one straight column down the page. */}
      <td style={{ ...styles.tdNum, ...styles.tdLive }}>
        <span style={styles.liveCell}>
          <span style={styles.liveFigure}>{money(v.live)}</span>
          <span style={{ ...styles.liveDelta, color: deltaColor(v.live - v.basis) }}>
            {Math.round(v.live - v.basis) !== 0 &&
              `${v.live > v.basis ? "+" : "−"}${Math.abs(Math.round(v.live - v.basis))}`}
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

/** Signed edge display, blank rather than $0 when there's nothing to
 *  compare against (no site value for this player). */
function edgeText(d) {
  if (d == null) return "";
  return `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(Math.round(d))}`;
}

function marketBreakdown(p, v) {
  const parts = [];
  if (p.yahoo != null) parts.push(`Yahoo $${p.yahoo}`);
  if (p.espn != null) parts.push(`ESPN $${p.espn}`);
  if (p.nffc != null) parts.push(`NFFC $${p.nffc}`);
  if (p.sleeper != null) parts.push(`Sleeper $${p.sleeper}`);
  if (p.fantasypros != null) parts.push(`FantasyPros $${p.fantasypros}`);
  if (p.etr != null) parts.push(`ETR $${p.etr}`);
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
  // No overflow here — it scrolls in App's scrollArea instead. `overflow-x:
  // auto` on this div alone used to work fine visually, but it also makes
  // the div a scroll container in the CSS sense (auto leaks onto the y-axis
  // too), which becomes the *sticky* header's positioning ancestor instead
  // of scrollArea — and since this div's own height always matches its
  // content, the header never had anything to stick against and just
  // scrolled away with everything else.
  wrap: { border: `1px solid ${C.line}`, borderRadius: 8 },
  // separate + zero spacing, not collapse: Chrome silently refuses to apply
  // `position: sticky` to a <th> when its table uses border-collapse, so the
  // sticky header just scrolled away with the body. Every cell already
  // draws its own borderBottom, so this renders the same either way.
  table: { width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 780 },
  th: { ...headCell, textAlign: "left" },
  thNum: { ...headCell, textAlign: "right" },
  // The FP $ / JP $ / ETR $ stack: tight padding so the three sit close
  // together, reading as one compact block rather than three ordinary columns.
  thSrc: { padding: "9px 6px" },
  thSrcHidden: { padding: "9px 3px", textAlign: "center" },
  thGap: { ...headCell, width: 18, padding: 0 },
  thLive: { color: C.gold },
  thDraft: { ...headCell, textAlign: "right", minWidth: 250 },
  srcHeadInner: { display: "inline-flex", alignItems: "center", gap: 4 },
  // Hidden until the header is hovered — opacity is set by the `.src-ctrls` /
  // `.src-head:hover .src-ctrls` rules in App.jsx's GlobalStyle, not here: an
  // inline style always wins over a class rule, which would make the CSS
  // :hover toggle a no-op. Keeping these tiny and out of the way is the
  // point: they're for setup, not something you look at mid-auction.
  srcCtrls: { display: "inline-flex", gap: 2 },
  srcIconBtn: {
    background: "none", border: "none", color: C.dim, cursor: "pointer",
    padding: 1, display: "inline-flex", lineHeight: 0,
  },
  td: { padding: "7px 12px", borderBottom: `1px solid #1c261f`, fontSize: 12.5 },
  tdName: { padding: "7px 12px", borderBottom: `1px solid #1c261f`, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" },
  tdNum: { padding: "7px 12px", borderBottom: `1px solid #1c261f`, fontSize: 12.5, textAlign: "right", fontFamily: F.mono },
  tdSrc: { padding: "7px 6px" },
  tdGap: { padding: 0, width: 18, borderBottom: `1px solid #1c261f` },
  tdLive: { padding: "7px 14px" },
  tdDraft: { padding: "5px 12px", borderBottom: `1px solid #1c261f` },
  liveCell: { display: "inline-flex", alignItems: "baseline", justifyContent: "flex-end" },
  liveFigure: { fontWeight: 700, fontSize: 15, color: C.gold },
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
