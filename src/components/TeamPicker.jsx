import React, { useMemo, useRef, useState } from "react";
import { rankMatches, isUnambiguous } from "../lib/fuzzy.js";
import { C, F } from "../theme.js";

// Type-to-filter team selection. A 12-item dropdown is too slow mid-auction:
// typing "bou" should surface exactly one team and take it.
//
// Controlled by `teamId`; `onPick` fires with a team id. Enter takes the
// highlighted team, or auto-takes a unique prefix match.
export default function TeamPicker({ teams, teamId, onPick, onSubmit, autoFocus, width = 118 }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);

  const selected = teams.find((t) => t.id === teamId) || null;
  const matches = useMemo(() => {
    if (!query) return teams;
    return rankMatches(query, teams, (t) => t.name).map((m) => m.item);
  }, [query, teams]);

  const commit = (team, viaEnter = false) => {
    if (!team) return;
    // `viaEnter` lets the caller finish the whole pick on one keystroke when
    // the rest of the row is already filled in.
    onPick(team.id, { viaEnter });
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setCursor((c) => Math.min(c + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && matches.length) {
        // A unique prefix commits without needing the arrow keys first.
        const ranked = query ? rankMatches(query, teams, (t) => t.name) : [];
        const pick = query && isUnambiguous(ranked) ? ranked[0].item : matches[cursor] || matches[0];
        commit(pick, true);
      } else if (onSubmit) {
        onSubmit();
      }
    } else if (e.key === "Escape") {
      setQuery("");
      setOpen(false);
    }
  };

  return (
    <div style={{ position: "relative", width }}>
      <input
        ref={inputRef}
        style={{
          ...styles.input,
          width: "100%",
          color: query ? C.text : selected ? C.bone : C.dimmer,
          borderColor: open ? C.gold : C.line2,
        }}
        value={query || (open ? "" : selected?.name || "")}
        placeholder="team…"
        autoFocus={autoFocus}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setCursor(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        aria-label="Team"
      />
      {open && matches.length > 0 && (
        <div style={styles.menu}>
          {matches.slice(0, 8).map((t, i) => (
            <button
              key={t.id}
              style={{
                ...styles.option,
                background: i === cursor ? C.line : "transparent",
                color: t.id === teamId ? C.gold : C.bone,
              }}
              onMouseDown={(e) => { e.preventDefault(); commit(t); }}
              onMouseEnter={() => setCursor(i)}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  input: {
    background: C.bg, border: `1px solid ${C.line2}`, borderRadius: 4,
    padding: "5px 6px", fontSize: 11.5, fontFamily: F.body,
  },
  menu: {
    position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, zIndex: 40,
    background: C.panelHi, border: `1px solid ${C.line2}`, borderRadius: 5,
    boxShadow: "0 8px 20px rgba(0,0,0,0.45)", maxHeight: 210, overflowY: "auto", padding: 3,
  },
  option: {
    display: "block", width: "100%", textAlign: "left", border: "none",
    borderRadius: 3, padding: "5px 7px", fontSize: 11.5, cursor: "pointer",
  },
};
