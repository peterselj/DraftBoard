import React, { useMemo, useState, useRef, useEffect } from "react";
import { Zap, CornerDownLeft } from "lucide-react";
import { parseQuickEntry } from "../lib/quickEntry.js";
import { C, F, money } from "../theme.js";

// The fast path for logging a pick: one line, one Enter.
//   jeffer 54 bou   ->  Justin Jefferson, $54, Boudreau
//
// While you type a name (before any price) the candidate list doubles as a
// live valuation lookup — useful the moment a player is nominated.
export default function QuickEntry({ players, teams, myTeamId, valueOf, onCommit, inputRef }) {
  const [text, setText] = useState("");
  const [cursor, setCursor] = useState(0);
  const prevQuery = useRef("");

  const parsed = useMemo(
    () => parseQuickEntry(text, { players, teams, myTeamId, valueOf }),
    [text, players, teams, myTeamId, valueOf]
  );

  const candidates = parsed.playerMatches.slice(0, 6);
  const chosen = candidates[cursor] || parsed.player;
  const canCommit = Boolean(chosen && parsed.price >= 1 && parsed.team && !parsed.teamAmbiguous);

  // Re-rank only actually moves the highlight when the *name* part of the
  // line changes. Without this, arrowing down to the right "jeffer" match
  // and then typing the price snapped the pick back to the top match on the
  // very next keystroke — the highlight looked like a selection but wasn't
  // wired to anything past that render.
  useEffect(() => {
    if (parsed.playerQuery !== prevQuery.current) {
      prevQuery.current = parsed.playerQuery;
      setCursor(0);
    }
  }, [parsed.playerQuery]);

  const commit = () => {
    if (!canCommit) return;
    onCommit({ playerId: chosen.id, price: parsed.price, teamId: parsed.team.id });
    setText("");
    setCursor(0);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, candidates.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      // Before a price is typed there's nothing to commit yet, so Enter/Tab
      // instead locks in whichever player is highlighted — swapping the
      // typed fragment for their full name — and leaves the field open for
      // the price and team. That's the step that was missing: hitting Enter
      // on "jeffer" just sat there with no visible effect.
      if (!parsed.hasPrice && chosen) {
        e.preventDefault();
        setText(`${chosen.name} `);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setText("");
      setCursor(0);
      e.currentTarget.blur();
    }
  };

  return (
    <div style={styles.wrap}>
      <div style={{ ...styles.bar, borderColor: canCommit ? C.green : C.line }}>
        <Zap size={15} style={{ color: canCommit ? C.tealLt : C.gold, flex: "0 0 auto" }} />
        <input
          ref={inputRef}
          style={styles.input}
          value={text}
          placeholder="jeffer 54 bou   —  player, price, team, Enter"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Quick pick entry"
          spellCheck={false}
          autoComplete="off"
        />
        {canCommit ? (
          <div style={styles.ready}>
            <span style={{ color: C.text, fontWeight: 700 }}>{chosen.name}</span>
            <span style={{ color: C.dimmer }}>→</span>
            <span style={{ fontFamily: F.mono, color: C.goldLt, fontWeight: 700 }}>{money(parsed.price)}</span>
            <span style={{ color: C.dimmer }}>→</span>
            <span style={{ color: C.text }}>{parsed.team.name}</span>
            <CornerDownLeft size={13} style={{ color: C.tealLt }} />
          </div>
        ) : (
          parsed.hint && <div style={styles.hint}>{parsed.hint}</div>
        )}
      </div>

      {text && candidates.length > 0 && (
        <div style={styles.candidates}>
          {candidates.map((p, i) => {
            const v = valueOf(p);
            return (
              <button
                key={p.id}
                style={{
                  ...styles.candidate,
                  background: i === cursor ? C.line : "transparent",
                  borderColor: i === cursor ? C.gold : "transparent",
                }}
                onMouseEnter={() => setCursor(i)}
                onMouseDown={(e) => { e.preventDefault(); setCursor(i); }}
              >
                <span style={styles.candName}>{p.name}</span>
                <span style={styles.candPos}>{p.pos}</span>
                <span style={{ fontFamily: F.mono, color: C.goldLt, fontWeight: 700 }}>{money(v.live)}</span>
                <span style={{ fontFamily: F.mono, color: C.dimmer, fontSize: 10.5 }}>mkt {money(v.market)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  wrap: { position: "relative", marginBottom: 10 },
  bar: {
    display: "flex", alignItems: "center", gap: 9, background: C.panel,
    border: "1px solid", borderRadius: 8, padding: "9px 12px",
  },
  input: {
    flex: 1, minWidth: 120, background: "none", border: "none", color: C.text,
    fontSize: 14, fontFamily: F.mono, outline: "none",
  },
  ready: {
    display: "flex", alignItems: "center", gap: 7, fontSize: 12.5,
    whiteSpace: "nowrap", flex: "0 0 auto",
  },
  hint: { fontSize: 11.5, color: C.dimmer, whiteSpace: "nowrap", flex: "0 0 auto" },
  candidates: {
    position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, zIndex: 50,
    background: C.panelHi, border: `1px solid ${C.line2}`, borderRadius: 7,
    boxShadow: "0 10px 26px rgba(0,0,0,0.5)", padding: 4,
  },
  candidate: {
    display: "grid", gridTemplateColumns: "1fr auto 56px 72px", alignItems: "center", gap: 10,
    width: "100%", textAlign: "left", border: "1px solid", borderRadius: 5,
    padding: "6px 8px", cursor: "pointer", color: C.bone, fontSize: 12.5,
  },
  candName: { fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  candPos: { fontFamily: F.mono, fontSize: 10.5, color: C.dim },
};
