import React, { useRef, useState } from "react";
import { DoorOpen, Trash2, Download, Upload, Plus } from "lucide-react";
import { listRooms, normalizeCode, exportRoom, importRoom, deleteRoom } from "../lib/rooms.js";
import { C, F, ui } from "../theme.js";

const ago = (ts) => {
  if (!ts) return "";
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
};

// Front door. Each room is a separate league — its own managers, settings and
// picks — so a draft with one crowd can be prepped without touching another.
export default function RoomPicker({ onEnter }) {
  const [rooms, setRooms] = useState(listRooms);
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const clean = normalizeCode(code);

  const enter = (c) => {
    const n = normalizeCode(c);
    if (!n) { setError("Give the room a name — anything you'll remember."); return; }
    onEnter(n);
  };

  const doExport = (c) => {
    const blob = new Blob([exportRoom(c)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `draft-board-${c}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const doImport = async (file) => {
    try {
      const c = importRoom(await file.text());
      setRooms(listRooms());
      setError(null);
      onEnter(c);
    } catch (e) {
      setError(`Couldn't import that file: ${e.message}`);
    }
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.eyebrow}>DRAFT BOARD</div>
        <h1 style={styles.h1}>Which room?</h1>
        <p style={styles.blurb}>
          Each room is its own league — managers, roster, scoring and picks kept
          separate. Rooms live in this browser only; nothing is uploaded, and
          anyone else opening this page just gets an empty board.
        </p>

        <form
          style={styles.form}
          onSubmit={(e) => { e.preventDefault(); enter(code); }}
        >
          <input
            style={styles.input}
            placeholder="room name — e.g. retrocade"
            value={code}
            autoFocus
            onChange={(e) => { setCode(e.target.value); setError(null); }}
            aria-label="Room name"
          />
          <button type="submit" style={styles.enterBtn}>
            {rooms.some((r) => r.code === clean) ? <DoorOpen size={15} /> : <Plus size={15} />}
            {rooms.some((r) => r.code === clean) ? "Open" : "Create"}
          </button>
        </form>
        {clean && clean !== code.toLowerCase() && (
          <div style={styles.hint}>will be saved as “{clean}”</div>
        )}
        {error && <div style={styles.error}>{error}</div>}

        {rooms.length > 0 && (
          <div style={styles.list}>
            {rooms.map((r) => (
              <div key={r.code} style={styles.row}>
                <button style={styles.roomBtn} onClick={() => enter(r.code)}>
                  <span style={styles.roomName}>{r.label || r.code}</span>
                  <span style={styles.roomMeta}>
                    {r.picks ? `${r.picks} picks · ` : ""}{ago(r.lastOpened)}
                  </span>
                </button>
                <button style={styles.iconBtn} title="Export this room" onClick={() => doExport(r.code)}>
                  <Download size={13} />
                </button>
                <button
                  style={styles.iconBtn}
                  title="Delete this room"
                  onClick={() => {
                    if (window.confirm?.(`Delete the "${r.code}" room and its picks?`)) {
                      setRooms(deleteRoom(r.code));
                    }
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={styles.footer}>
          <button style={styles.linkBtn} onClick={() => fileRef.current?.click()}>
            <Upload size={13} /> import a room file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])}
          />
          <span style={styles.footNote}>
            Bookmark <span style={{ fontFamily: F.mono }}>#room=name</span> to jump straight in.
          </span>
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    padding: 20, fontFamily: F.body, background: C.bg, color: C.text,
  },
  card: { ...ui.panel, padding: "26px 28px", maxWidth: 480, width: "100%" },
  eyebrow: { fontFamily: F.mono, fontSize: 11, letterSpacing: "0.14em", color: C.gold },
  h1: { fontFamily: F.head, fontWeight: 700, fontSize: 28, margin: "8px 0 10px", letterSpacing: "0.02em" },
  blurb: { fontSize: 12.5, lineHeight: 1.55, color: C.dim, margin: "0 0 18px" },
  form: { display: "flex", gap: 8 },
  input: { ...ui.input, flex: 1, fontSize: 14, padding: "9px 11px", fontFamily: F.mono },
  enterBtn: {
    display: "flex", alignItems: "center", gap: 6, background: C.gold, color: C.bg,
    border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer",
  },
  hint: { fontSize: 11, color: C.dimmer, marginTop: 6, fontFamily: F.mono },
  error: { fontSize: 12, color: C.redLt, marginTop: 8 },
  list: { display: "flex", flexDirection: "column", gap: 6, marginTop: 18 },
  row: { display: "flex", alignItems: "center", gap: 4 },
  roomBtn: {
    flex: 1, display: "flex", justifyContent: "space-between", alignItems: "baseline",
    background: C.bg, border: "1px solid", borderColor: C.line, color: C.text,
    borderRadius: 6, padding: "9px 12px", cursor: "pointer", textAlign: "left",
  },
  roomName: { fontWeight: 600, fontSize: 13.5 },
  roomMeta: { fontSize: 11, color: C.dimmer },
  iconBtn: {
    background: "none", border: "1px solid", borderColor: C.line, color: C.dimmer,
    borderRadius: 5, padding: "8px 8px", cursor: "pointer", display: "flex",
  },
  footer: { display: "flex", alignItems: "center", gap: 12, marginTop: 18, flexWrap: "wrap" },
  linkBtn: {
    display: "flex", alignItems: "center", gap: 5, background: "none",
    border: "1px dashed", borderColor: C.line2, color: C.dim,
    fontSize: 11.5, padding: "6px 10px", borderRadius: 6, cursor: "pointer",
  },
  footNote: { fontSize: 11, color: C.dimmer },
};
