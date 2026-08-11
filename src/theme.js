// "Turf ledger" palette — dark field green, bone text, gold accents.
// Shared so components don't each re-declare the same hex codes.

export const C = {
  bg: "#0F1712",
  panel: "#141d17",
  panelHi: "#1a241d",
  line: "#26302a",
  line2: "#2a352d",
  text: "#F1EFE6",
  bone: "#D8CFB6",
  dim: "#8CA098",
  dimmer: "#6E8078",
  gold: "#D8A63D",
  goldLt: "#E7BE6C",
  green: "#3E6B4F",
  red: "#C1443C",
  redLt: "#E27167",
  teal: "#4FA69A",
  tealLt: "#6FC4B9",
};

export const F = {
  mono: "'IBM Plex Mono', monospace",
  head: "'Oswald', sans-serif",
  body: "'Inter', sans-serif",
};

// NOTE: every style below splits `border` into `border: "1px solid"` plus an
// explicit `borderColor`, and never uses the colour-carrying shorthand.
// React removes style *longhands* it no longer sees but leaves the shorthand
// in place, so `{...base, borderColor: gold}` -> `{...base}` used to reset the
// colour to `initial` (black) rather than back to the base colour. Keeping
// borderColor present in the base object makes toggles restore correctly.
export const ui = {
  panel: {
    background: C.panel,
    border: "1px solid",
    borderColor: C.line,
    borderRadius: 8,
  },
  input: {
    background: C.bg,
    border: "1px solid",
    borderColor: C.line2,
    color: C.text,
    borderRadius: 4,
    padding: "5px 8px",
    fontSize: 12.5,
  },
  btn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: C.panel,
    border: "1px solid",
    borderColor: C.line2,
    color: C.bone,
    fontSize: 12,
    fontWeight: 600,
    padding: "7px 12px",
    borderRadius: 6,
    cursor: "pointer",
  },
  heading: {
    fontFamily: F.head,
    fontSize: 12,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: C.gold,
  },
};

/** Tone helpers — one place deciding what "hot" and "cold" look like. */
export const toneColor = (tone) =>
  tone === "hot" ? C.redLt : tone === "cold" ? C.tealLt : C.bone;

export const money = (n) => `$${Math.round(n)}`;
export const fmtMult = (n) => `${n.toFixed(2)}x`;
