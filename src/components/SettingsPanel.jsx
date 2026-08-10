import React, { useState } from "react";
import { Star, ClipboardPaste } from "lucide-react";
import { C, F, ui } from "../theme.js";

export default function SettingsPanel({
  settings, teams, updateRoster, updateNumTeams, renameTeam, setMyTeam, setBudget, applyTeamNames,
}) {
  const [bulk, setBulk] = useState("");
  const bulkNames = bulk.split("\n").map((s) => s.trim()).filter(Boolean);

  return (
    <div style={styles.panel}>
      <div style={styles.col}>
        <div style={ui.heading}>League</div>
        <label style={styles.label}>
          Teams
          <input
            type="number" min="2" max="20" style={styles.input}
            value={settings.numTeams}
            onChange={(e) => updateNumTeams(e.target.value)}
          />
        </label>
        <label style={styles.label}>
          Budget per team
          <input
            type="number" min="1" style={styles.input}
            value={settings.budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </label>
      </div>

      <div style={styles.col}>
        <div style={ui.heading}>Roster slots</div>
        <div style={styles.rosterGrid}>
          {Object.keys(settings.roster).map((k) => (
            <label key={k} style={styles.rosterLabel}>
              {k}
              <input
                type="number" min="0" style={styles.rosterInput}
                value={settings.roster[k]}
                onChange={(e) => updateRoster(k, e.target.value)}
              />
            </label>
          ))}
        </div>
      </div>

      <div style={styles.col}>
        <div style={ui.heading}>Teams in the room</div>
        <div style={styles.teamList}>
          {teams.map((t) => (
            <div key={t.id} style={styles.teamRow}>
              <button
                onClick={() => setMyTeam(t.id)}
                style={{ ...styles.starBtn, color: t.isMe ? C.gold : "#3a4a3e" }}
                title="Mark as my team"
              >
                <Star size={14} fill={t.isMe ? C.gold : "none"} />
              </button>
              <input
                style={styles.teamNameInput}
                value={t.name}
                onChange={(e) => renameTeam(t.id, e.target.value)}
                aria-label={`Name for ${t.name}`}
              />
            </div>
          ))}
        </div>
      </div>

      <div style={styles.col}>
        <div style={ui.heading}>Paste the whole room</div>
        <div style={styles.help}>
          One name per line. Applying sets the team count to match — faster than
          renaming twelve boxes the night before.
        </div>
        <textarea
          style={styles.textarea}
          rows={6}
          placeholder={"Boudreau\nHalloran\nMcAfee\n…"}
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
        />
        <button
          style={{ ...styles.applyBtn, opacity: bulkNames.length ? 1 : 0.45 }}
          disabled={!bulkNames.length}
          onClick={() => { applyTeamNames(bulkNames); setBulk(""); }}
        >
          <ClipboardPaste size={13} /> apply {bulkNames.length || ""} name{bulkNames.length === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}

const styles = {
  panel: { ...ui.panel, display: "flex", gap: 24, flexWrap: "wrap", padding: 16, marginBottom: 16 },
  col: { minWidth: 168 },
  label: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: C.bone, marginBottom: 8, gap: 8, marginTop: 8 },
  input: { ...ui.input, width: 62 },
  rosterGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 14px", marginTop: 8 },
  rosterLabel: { display: "flex", justifyContent: "space-between", fontSize: 11.5, color: C.bone, alignItems: "center" },
  rosterInput: { ...ui.input, width: 46, padding: "2px 4px" },
  teamList: { display: "flex", flexDirection: "column", gap: 5, maxHeight: 168, overflowY: "auto", marginTop: 8 },
  teamRow: { display: "flex", alignItems: "center", gap: 6 },
  starBtn: { background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex" },
  teamNameInput: { ...ui.input, flex: 1, fontSize: 12, padding: "3px 6px" },
  help: { fontSize: 10.5, color: C.dimmer, lineHeight: 1.45, margin: "8px 0 6px" },
  textarea: {
    ...ui.input, width: "100%", minWidth: 190, fontFamily: F.body, resize: "vertical",
    lineHeight: 1.45,
  },
  applyBtn: {
    ...ui.btn, marginTop: 6, background: C.gold, color: C.bg, border: "none", fontWeight: 700,
  },
};
