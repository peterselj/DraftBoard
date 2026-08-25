import React, { useRef, useState } from "react";
import { RotateCcw, EyeOff } from "lucide-react";
import TeamPicker from "./TeamPicker.jsx";
import { C, F, money } from "../theme.js";

const deltaColor = (d) => (d > 1 ? C.tealLt : d < -1 ? C.redLt : C.dim);

const PLATFORM_LABEL = { espn: "ESPN", yahoo: "Yahoo", sleeper: "Sleeper", nffc: "NFFC" };

// The three pasted/derived sources, stacked compact next to each other. Any
// one of them can be picked (Settings → Value basis, or double-clicking its
// header here) as what Live $ and Site Edge are built from — see App.jsx's
// basisOf.
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

  // Double-click a source header to use it as the basis, triple-click to
  // hide it — replaces an earlier hover-revealed eye/check icon pair that
  // was unusable in practice: reaching for a target that only exists while
  // hovered, positioned right where the next header's own hit-area begins,
  // meant the icons routinely vanished (or the wrong header activated) on
  // the way over. Click count is tracked per column with a short debounce
  // rather than reading the DOM click event's own `detail` field, because
  // detail fires the *double*-click action partway through every triple
  // click (1, 2, then 3) — debouncing waits for the sequence to finish
  // before deciding what happened, so a triple-click never briefly changes
  // the basis on its way to hiding the column.
  const clickState = useRef({});
  const handleHeaderClick = (key) => {
    const state = clickState.current[key] || { count: 0, timer: null };
    state.count += 1;
    clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      if (state.count === 2) onSelectBasis?.(key);
      else if (state.count >= 3) toggleVisible(key);
      state.count = 0;
    }, 350);
    clickState.current[key] = state;
  };

  // Player+Pos / FP+JP+ETR / Site+SiteEdge / Live $ / Draft read as five
  // clusters, not nine ordinary columns — a spacer column sits between each
  // one so the grouping is visible at a glance, matching the "bundle the
  // related numbers" layout Pete mocked up.
  const columnCount = 2 /* player, pos */ + 1 /* spacer */ + SRC_COLUMNS.length + 1 /* spacer */
    + (showSite ? 2 : 0) + 1 /* spacer */ + 1 /* live */ + 1 /* spacer */ + 1 /* draft */;

  return (
    <div style={styles.wrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Player</th>
            <th style={styles.thCenter}>Pos</th>
            <th style={styles.thGap} aria-hidden />
            {SRC_COLUMNS.map((c) => (
              <th
                key={c.key}
                style={{
                  ...styles.thNum,
                  ...styles.thTight,
                  ...styles.thClickable,
                  ...(visible[c.key] ? null : styles.thSrcHidden),
                }}
                onClick={() => handleHeaderClick(c.key)}
                title={
                  visible[c.key]
                    ? `${c.title}. Double-click to use as the Live $ basis, triple-click to hide.`
                    : `${c.short} $ is hidden. Triple-click to show it again.`
                }
              >
                {visible[c.key] ? (
                  <span style={{ color: basisSource === c.key ? C.gold : C.dim }}>{c.short} $</span>
                ) : (
                  <EyeOff size={12} color={C.dim} />
                )}
              </th>
            ))}
            <th style={styles.thGap} aria-hidden />
            {showSite && (
              <>
                <th
                  style={{ ...styles.thNum, ...styles.thTight }}
                  title={`What ${siteLabel} publishes — the number the rest of your room is anchored to. Hover a cell to see every source.`}
                >
                  {siteLabel} $
                </th>
                <th
                  style={{ ...styles.thNum, ...styles.thTight }}
                  title={`Site Edge — basis (${basisSource === "model" ? "JP" : basisSource === "etr" ? "ETR" : "FP"} $) minus ${siteLabel}: positive means ${siteLabel} is pricing him below what we think he's worth — a bargain. Shortened to "Edge" here so it doesn't force this column wider than ${siteLabel} $ needs, which was pushing the two apart.`}
                >
                  Edge
                </th>
              </>
            )}
            <th style={styles.thGapWide} aria-hidden />
            <th style={{ ...styles.thNum, ...styles.thLive }} title="Value adjusted for live budget inflation and positional scarcity, based on whichever source is selected as the basis">
              Live $
            </th>
            <th style={styles.thGapWide} aria-hidden />
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
              basisSource={basisSource}
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

function Row({ p, teams, myTeamId, input, setDraftInput, onDraft, onUndraft, maxBidFor, visible, showSite, basisSource }) {
  const v = p._val;
  const state = input || { price: "", teamId: "" };
  const priceNum = parseInt(state.price, 10);
  const overMax = state.teamId && priceNum > 0 && priceNum > maxBidFor(state.teamId);
  const mine = p.drafted && p.draftedBy === myTeamId;

  return (
    <tr style={{ opacity: p.drafted ? 0.5 : 1, background: mine ? "rgba(216,166,61,0.07)" : "transparent" }}>
      <td style={styles.tdName}>{p.name}</td>
      <td style={styles.tdCenter}><span style={styles.posPill}>{p.pos}</span></td>
      <td style={styles.tdGap} aria-hidden />
      {SRC_COLUMNS.map((c) => (
        <td
          key={c.key}
          style={{
            ...styles.tdNum,
            ...styles.tdTight,
            ...(basisSource === c.key ? styles.tdBasisActive : null),
          }}
        >
          {visible[c.key] && (
            v[c.valueKey] != null ? money(v[c.valueKey]) : <span style={{ color: C.dimmer }}>—</span>
          )}
        </td>
      ))}
      <td style={styles.tdGap} aria-hidden />
      {showSite && (
        <>
          <td style={{ ...styles.tdNum, ...styles.tdTight }} title={marketBreakdown(p, v)}>
            {v.site != null && money(v.site)}
            {/* No value from the league's own platform — show the consensus of the
                other sources instead, marked so it isn't mistaken for the real one. */}
            {v.site == null && v.consensus != null && (
              <span style={{ color: C.dim, fontStyle: "italic" }}>~{money(v.consensus)}</span>
            )}
            {v.site == null && v.consensus == null && <span style={{ color: C.dimmer }}>—</span>}
          </td>
          <td style={{ ...styles.tdNum, ...styles.tdTight, color: deltaColor(v.siteEdge) }}>{edgeText(v.siteEdge)}</td>
        </>
      )}
      <td style={styles.tdGapWide} aria-hidden />
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
      <td style={styles.tdGapWide} aria-hidden />
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
  thCenter: { ...headCell, textAlign: "center", width: "1%", whiteSpace: "nowrap" },
  // `width: "1%"` is the standard trick for an auto-layout table: with no
  // width at all, a column can get handed a share of whatever space is left
  // over once every column's own content is satisfied, and that leftover
  // isn't necessarily split evenly — it's exactly why Site $/Site Edge sat
  // further apart than FP $/JP $/ETR $ despite identical padding on both
  // pairs. A tiny explicit width pins a column to its true content width, so
  // every dollar/edge column is pinned the same way, and Player (the one
  // column that should actually stretch) absorbs the leftover instead.
  thNum: { ...headCell, textAlign: "right", width: "1%", whiteSpace: "nowrap" },
  // Applied to both bundles — FP $/JP $/ETR $ and Site $/Site Edge — so each
  // reads as one tight block. The gap columns (much wider) are what separate
  // the blocks from each other; this is what keeps a block's own columns
  // close together instead of spread as far apart as the blocks are.
  thTight: { padding: "9px 4px" },
  thSrcHidden: { padding: "9px 3px", textAlign: "center" },
  thClickable: { cursor: "pointer", userSelect: "none" },
  thGap: { ...headCell, width: 26, padding: 0 },
  // A little wider than the other gaps — Live $ is the one number worth
  // singling out, so it gets more air on both sides than the bundles do.
  thGapWide: { ...headCell, width: 34, padding: 0 },
  thLive: { color: C.gold, textAlign: "center" },
  thDraft: { ...headCell, textAlign: "right", minWidth: 250 },
  td: { padding: "7px 12px", borderBottom: `1px solid #1c261f`, fontSize: 12.5 },
  tdCenter: { padding: "7px 12px", borderBottom: `1px solid #1c261f`, fontSize: 12.5, textAlign: "center" },
  tdName: { padding: "7px 12px", borderBottom: `1px solid #1c261f`, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" },
  tdNum: { padding: "7px 12px", borderBottom: `1px solid #1c261f`, fontSize: 12.5, textAlign: "right", fontFamily: F.mono },
  tdTight: { padding: "7px 4px" },
  // The header already marks the active basis column in gold; bolding the
  // actual number too means you can tell which source Live $ is built from
  // by glancing at any row, not just the header at the top of the table.
  tdBasisActive: { fontWeight: 700, color: C.bone },
  tdGap: { padding: 0, width: 26, borderBottom: `1px solid #1c261f` },
  tdGapWide: { padding: 0, width: 34, borderBottom: `1px solid #1c261f` },
  tdLive: { padding: "7px 14px", textAlign: "center" },
  tdDraft: { padding: "5px 12px", borderBottom: `1px solid #1c261f` },
  liveCell: { display: "inline-flex", alignItems: "baseline", justifyContent: "center" },
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
