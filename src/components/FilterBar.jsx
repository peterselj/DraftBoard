import React from "react";
import { Search, Plus, EyeOff, Eye } from "lucide-react";
import { POSITIONS, FLEX_ELIGIBLE } from "../lib/draftMath.js";
import { C, F, ui } from "../theme.js";

// Positions are multi-select: WR+RB, QB+RB+TE, any combination. FLEX is a
// separate toggle that unions RB/WR/TE on top of whatever is already picked,
// so switching it off restores the previous selection rather than clearing.
export default function FilterBar({
  search, setSearch, searchRef,
  selectedPos, togglePos, clearPos,
  flexOn, toggleFlex,
  hideDrafted, toggleHideDrafted, draftedCount,
  addOpen, toggleAdd,
}) {
  const showingAll = selectedPos.size === 0 && !flexOn;

  return (
    <div style={styles.bar}>
      <div style={styles.searchWrap}>
        <Search size={14} style={{ color: C.dimmer }} />
        <input
          ref={searchRef}
          style={styles.searchInput}
          placeholder="Filter list…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Filter player list"
        />
      </div>

      <div style={styles.tabs}>
        <button
          onClick={clearPos}
          style={{ ...styles.tab, ...(showingAll ? styles.tabActive : {}) }}
          aria-pressed={showingAll}
        >
          ALL
        </button>
        {POSITIONS.map((p) => {
          const viaFlex = flexOn && FLEX_ELIGIBLE.includes(p);
          const active = selectedPos.has(p) || viaFlex;
          return (
            <button
              key={p}
              onClick={() => togglePos(p)}
              style={{
                ...styles.tab,
                ...(active ? styles.tabActive : {}),
                ...(viaFlex && !selectedPos.has(p) ? styles.tabViaFlex : {}),
              }}
              aria-pressed={active}
            >
              {p}
            </button>
          );
        })}
        <button
          onClick={toggleFlex}
          style={{ ...styles.tab, ...styles.flexTab, ...(flexOn ? styles.tabActive : {}) }}
          aria-pressed={flexOn}
          title="RB + WR + TE"
        >
          FLEX
        </button>
      </div>

      <button
        onClick={toggleHideDrafted}
        style={{ ...styles.toggle, ...(hideDrafted ? styles.toggleOn : {}) }}
        aria-pressed={hideDrafted}
      >
        {hideDrafted ? <EyeOff size={13} /> : <Eye size={13} />}
        hide drafted{draftedCount > 0 ? ` (${draftedCount})` : ""}
      </button>

      <button
        style={{ ...styles.addBtn, ...(addOpen ? { borderColor: C.gold, color: C.gold } : {}) }}
        onClick={toggleAdd}
      >
        <Plus size={13} /> add player
      </button>
    </div>
  );
}

const styles = {
  bar: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 },
  searchWrap: {
    display: "flex", alignItems: "center", gap: 6, ...ui.panel,
    padding: "6px 10px", minWidth: 170,
  },
  searchInput: { background: "none", border: "none", color: C.text, fontSize: 12.5, width: "100%", outline: "none" },
  tabs: { display: "flex", gap: 4, flexWrap: "wrap" },
  // Borders are split into shorthand + explicit colour so that toggling a
  // variant off restores the base colour instead of resetting it to black.
  // See the note in theme.js.
  tab: {
    background: C.panel, border: "1px solid", borderColor: C.line, color: C.dim,
    fontSize: 11, fontWeight: 600, padding: "5px 9px", borderRadius: 5,
    cursor: "pointer", fontFamily: F.body,
  },
  tabActive: { background: C.gold, color: C.bg, borderColor: C.gold },
  tabViaFlex: { background: "rgba(216,166,61,0.35)", color: C.text, borderColor: C.gold },
  flexTab: { marginLeft: 6, letterSpacing: "0.04em" },
  toggle: {
    display: "flex", alignItems: "center", gap: 6, background: C.panel,
    border: "1px solid", borderColor: C.line, color: C.dim, fontSize: 11.5,
    padding: "6px 10px", borderRadius: 6, cursor: "pointer",
  },
  toggleOn: { background: C.gold, color: C.bg, borderColor: C.gold, fontWeight: 700 },
  addBtn: {
    marginLeft: "auto", display: "flex", alignItems: "center", gap: 5,
    background: "none", border: "1px dashed", borderColor: C.line2, color: C.dim,
    fontSize: 11.5, padding: "6px 10px", borderRadius: 6, cursor: "pointer",
  },
};
