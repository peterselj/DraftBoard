import React, { useEffect, useRef } from "react";
import { C, F, ui } from "../theme.js";

// Replaces window.confirm(), which is silently suppressed inside sandboxed
// iframes — that's why "New Draft" appeared to do nothing. This also lets a
// destructive action explain itself before it happens.
export default function ConfirmDialog({ open, title, body, confirmLabel = "Confirm", danger, onConfirm, onCancel }) {
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    confirmRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      if (e.key === "Enter") { e.preventDefault(); onConfirm(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onConfirm, onCancel]);

  if (!open) return null;

  return (
    <div style={styles.scrim} onClick={onCancel} role="presentation">
      <div
        style={styles.card}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <div style={styles.title}>{title}</div>
        {body && <div style={styles.body}>{body}</div>}
        <div style={styles.actions}>
          <button style={styles.cancel} onClick={onCancel}>Cancel</button>
          <button
            ref={confirmRef}
            style={{ ...styles.confirm, background: danger ? C.red : C.gold, color: danger ? C.text : C.bg }}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  scrim: {
    position: "fixed", inset: 0, background: "rgba(6,10,8,0.72)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20,
  },
  card: { ...ui.panel, background: C.panelHi, padding: 20, maxWidth: 420, width: "100%" },
  title: { fontFamily: F.head, fontSize: 17, letterSpacing: "0.02em", color: C.text, marginBottom: 8 },
  body: { fontSize: 13, lineHeight: 1.5, color: C.dim, marginBottom: 16 },
  actions: { display: "flex", gap: 8, justifyContent: "flex-end" },
  cancel: { ...ui.btn, background: "none", borderColor: C.line2, color: C.dim, padding: "8px 14px" },
  confirm: { border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" },
};
