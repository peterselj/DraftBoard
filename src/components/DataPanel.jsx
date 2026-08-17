import React, { useState } from "react";
import { RefreshCw, Download, AlertTriangle, Check } from "lucide-react";
import { parseImport } from "../lib/importParse.js";
import { C, F, ui } from "../theme.js";

const MARKET_FIELDS = [
  { key: "projected", label: "sheet value (drives the model when there are no projections)" },
  { key: "espn", label: "ESPN market" },
  { key: "yahoo", label: "Yahoo market" },
  { key: "nffc", label: "NFFC market" },
  { key: "sleeper", label: "Sleeper market" },
  { key: "fantasypros", label: "FantasyPros market (0.5 PPR calculator)" },
];

function ago(iso) {
  if (!iso) return "unknown";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (Number.isNaN(mins)) return "unknown";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function DataPanel({ meta, refreshing, onRefresh, onImport }) {
  const [importOpen, setImportOpen] = useState(false);
  const [text, setText] = useState("");
  const [field, setField] = useState("projected");
  const [result, setResult] = useState(null);

  const preview = text.trim() ? parseImport(text) : null;

  const apply = () => {
    if (!preview?.rows.length) return;
    setResult(onImport(preview.rows, field));
    setText("");
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.statusRow}>
        <span style={styles.status}>
          <b style={{ color: C.bone }}>{meta?.season ?? "—"} values</b>
          {meta?.origin ? ` · ${meta.origin}` : ""}
          {meta?.generated ? ` · updated ${ago(meta.generated)}` : ""}
          {meta?.count ? ` · ${meta.count} players` : ""}
        </span>

        <button style={ui.btn} onClick={onRefresh} disabled={refreshing}>
          <RefreshCw size={14} style={refreshing ? { animation: "spin 1s linear infinite" } : undefined} />
          {refreshing ? "refreshing…" : "Refresh values"}
        </button>
        <button
          style={{ ...ui.btn, ...(importOpen ? { borderColor: C.gold, color: C.gold } : {}) }}
          onClick={() => setImportOpen((o) => !o)}
        >
          <Download size={14} /> Import
        </button>
      </div>

      {meta?.notes?.length > 0 && (
        <div style={styles.warn}>
          <AlertTriangle size={13} /> {meta.notes.join(" · ")}
        </div>
      )}

      {importOpen && (
        <div style={styles.importBox}>
          <div style={styles.help}>
            Paste rows from the elboberto sheet, a site export, anything — name,
            position and dollar value in any column order, with or without a
            header. Tabs, commas and semicolons all work.
            <br />
            <b style={{ color: C.bone }}>Yahoo:</b> open{" "}
            <span style={{ fontFamily: F.mono, fontSize: 11 }}>
              football.fantasysports.yahoo.com/f1/draftanalysis?type=salcap
            </span>
            , select the table, copy, paste here. Its one-cell-per-line layout is
            handled, and <b style={{ color: C.bone }}>Avg $</b> (what people
            actually paid) is used rather than Yahoo's projected value.
          </div>
          <textarea
            style={styles.textarea}
            rows={6}
            placeholder={"Player\tPos\tAAV\nJa'Marr Chase\tWR\t61\nBijan Robinson\tRB\t63"}
            value={text}
            onChange={(e) => { setText(e.target.value); setResult(null); }}
          />
          <div style={styles.importControls}>
            <label style={styles.fieldLabel}>
              import into
              <select style={{ ...ui.input, marginLeft: 8 }} value={field} onChange={(e) => setField(e.target.value)}>
                {MARKET_FIELDS.map((f) => (
                  <option key={f.key} value={f.key}>{f.key}</option>
                ))}
              </select>
            </label>
            <span style={styles.fieldHelp}>{MARKET_FIELDS.find((f) => f.key === field)?.label}</span>
            <button
              style={{ ...styles.applyBtn, opacity: preview?.rows.length ? 1 : 0.45 }}
              disabled={!preview?.rows.length}
              onClick={apply}
            >
              apply {preview?.rows.length || 0} rows
            </button>
          </div>

          {preview?.warnings?.length > 0 && (
            <div style={styles.warn}><AlertTriangle size={13} /> {preview.warnings.join(" ")}</div>
          )}
          {preview?.rows.length > 0 && (
            <div style={styles.previewRows}>
              {preview.layout === "vertical" && (
                <span style={{ ...styles.previewChip, borderColor: C.gold, color: C.goldLt }}>
                  one-cell-per-line layout
                </span>
              )}
              {preview.rows.slice(0, 3).map((r, i) => (
                <span key={i} style={styles.previewChip}>
                  {r.name}{r.pos ? ` · ${r.pos}` : ""} · ${r.value}
                </span>
              ))}
              {preview.rows.length > 3 && <span style={styles.previewChip}>+{preview.rows.length - 3} more</span>}
            </div>
          )}

          {result && (
            <div style={result.unmatched.length ? styles.warn : styles.ok}>
              {result.unmatched.length ? <AlertTriangle size={13} /> : <Check size={13} />}
              Updated {result.matched} players
              {result.unmatched.length > 0 &&
                ` · no match for ${result.unmatched.slice(0, 6).map((r) => r.name).join(", ")}` +
                (result.unmatched.length > 6 ? ` and ${result.unmatched.length - 6} more` : "")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  wrap: { marginBottom: 12 },
  statusRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  status: { fontSize: 11.5, color: C.dimmer, marginRight: "auto" },
  warn: {
    display: "flex", alignItems: "center", gap: 6, marginTop: 8,
    fontSize: 11.5, color: C.goldLt,
  },
  ok: { display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 11.5, color: C.tealLt },
  importBox: { ...ui.panel, padding: 12, marginTop: 10 },
  help: { fontSize: 11.5, color: C.dimmer, lineHeight: 1.5, marginBottom: 8, maxWidth: 620 },
  textarea: { ...ui.input, width: "100%", fontFamily: F.mono, fontSize: 12, resize: "vertical" },
  importControls: { display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" },
  fieldLabel: { fontSize: 11.5, color: C.bone, display: "flex", alignItems: "center" },
  fieldHelp: { fontSize: 11, color: C.dimmer, marginRight: "auto" },
  applyBtn: { background: C.gold, color: C.bg, border: "none", borderRadius: 5, padding: "7px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer" },
  previewRows: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 },
  previewChip: {
    fontSize: 11, fontFamily: F.mono, color: C.dim, border: `1px solid ${C.line2}`,
    borderRadius: 4, padding: "2px 7px",
  },
};
