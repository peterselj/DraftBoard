import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Search, Trash2, RotateCcw, Star, Settings2, Plus, X } from "lucide-react";
import seedData from "./data/players2025.json";
import {
  POSITIONS, FLEX_ELIGIBLE, SCARCITY_POS, DEFAULT_SETTINGS, defaultTeams,
  computeBaseline, computeLive, adjustedValue,
} from "./lib/draftMath.js";
import { loadDraft, saveDraft, clearDraft } from "./lib/storage.js";

const SEED_PLAYERS = seedData.players.map((p) => ({
  ...p, drafted: false, paid: null, draftedBy: null,
  snapAdjValue: null, snapBudgetMult: null, snapScarcityMult: null,
}));

const money = (n) => `$${Math.round(n)}`;
const fmtMult = (n) => `${n.toFixed(2)}x`;

export default function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [teams, setTeams] = useState(defaultTeams(DEFAULT_SETTINGS.numTeams));
  const [players, setPlayers] = useState(SEED_PLAYERS);
  const [loaded, setLoaded] = useState(false);

  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState("ALL");
  const [hideDrafted, setHideDrafted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newPlayer, setNewPlayer] = useState({ name: "", pos: "RB", projected: 5 });
  const [draftInputs, setDraftInputs] = useState({});

  const saveTimer = useRef(null);

  useEffect(() => {
    const saved = loadDraft();
    if (saved) {
      if (saved.settings) setSettings(saved.settings);
      if (saved.teams) setTeams(saved.teams);
      if (saved.players) setPlayers(saved.players);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveDraft({ settings, teams, players }), 400);
    return () => clearTimeout(saveTimer.current);
  }, [settings, teams, players, loaded]);

  const baselineRatio = useMemo(() => computeBaseline(settings, SEED_PLAYERS), [settings]);
  const live = useMemo(
    () => computeLive(players, teams, settings, baselineRatio),
    [players, teams, settings, baselineRatio]
  );

  const myTeam = teams.find((t) => t.isMe) || teams[0];

  const visiblePlayers = useMemo(() => {
    let list = players.filter((p) => {
      if (hideDrafted && p.drafted) return false;
      if (posFilter !== "ALL" && p.pos !== posFilter) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    list = list.map((p) => ({ ...p, _adj: adjustedValue(p, live) }));
    list.sort((a, b) => {
      if (a.drafted !== b.drafted) return a.drafted ? 1 : -1;
      return b._adj - a._adj;
    });
    return list;
  }, [players, hideDrafted, posFilter, search, live]);

  const draftPlayer = useCallback(
    (playerId) => {
      const input = draftInputs[playerId];
      if (!input || !input.teamId || !input.price) return;
      const price = Math.max(1, parseInt(input.price, 10) || 1);
      setPlayers((prev) =>
        prev.map((p) => {
          if (p.id !== playerId) return p;
          const snap = adjustedValue(p, live);
          return {
            ...p, drafted: true, paid: price, draftedBy: input.teamId,
            snapAdjValue: snap, snapBudgetMult: live.budgetInflationMult,
            snapScarcityMult: live.scarcityMult[p.pos] || 1,
          };
        })
      );
      setDraftInputs((prev) => {
        const n = { ...prev };
        delete n[playerId];
        return n;
      });
    },
    [draftInputs, live]
  );

  const undraftPlayer = useCallback((playerId) => {
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId
          ? { ...p, drafted: false, paid: null, draftedBy: null, snapAdjValue: null, snapBudgetMult: null, snapScarcityMult: null }
          : p
      )
    );
  }, []);

  const removePlayer = useCallback((playerId) => {
    setPlayers((prev) => prev.filter((p) => p.id !== playerId));
  }, []);

  const addPlayer = () => {
    if (!newPlayer.name.trim()) return;
    const proj = Math.max(1, parseInt(newPlayer.projected, 10) || 1);
    setPlayers((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`, name: newPlayer.name.trim(), pos: newPlayer.pos,
        yahoo: proj, espn: proj, nffc: proj, projected: proj,
        drafted: false, paid: null, draftedBy: null,
        snapAdjValue: null, snapBudgetMult: null, snapScarcityMult: null,
      },
    ]);
    setNewPlayer({ name: "", pos: "RB", projected: 5 });
    setAddOpen(false);
  };

  const resetDraft = () => {
    if (!window.confirm("Start a new draft? This clears all picks and resets settings.")) return;
    setPlayers(SEED_PLAYERS);
    setTeams(defaultTeams(DEFAULT_SETTINGS.numTeams));
    setSettings(DEFAULT_SETTINGS);
    clearDraft();
  };

  const updateRoster = (key, val) => {
    setSettings((s) => ({ ...s, roster: { ...s.roster, [key]: Math.max(0, parseInt(val, 10) || 0) } }));
  };
  const updateNumTeams = (val) => {
    const n = Math.max(2, Math.min(20, parseInt(val, 10) || 2));
    setSettings((s) => ({ ...s, numTeams: n }));
    setTeams((prev) => {
      if (n > prev.length) {
        const extra = Array.from({ length: n - prev.length }, (_, i) => ({
          id: `t${prev.length + i}`, name: `Team ${prev.length + i + 1}`, isMe: false,
        }));
        return [...prev, ...extra];
      }
      return prev.slice(0, n);
    });
  };
  const renameTeam = (id, name) => setTeams((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)));
  const setMyTeam = (id) => setTeams((prev) => prev.map((t) => ({ ...t, isMe: t.id === id })));

  const gaugePct = Math.min(100, Math.max(0, ((live.budgetInflationMult - 0.6) / (1.6 - 0.6)) * 100));
  const gaugeTone = live.budgetInflationMult >= 1.08 ? "hot" : live.budgetInflationMult <= 0.92 ? "cold" : "even";

  if (!loaded) return <div style={styles.app}>loading…</div>;

  return (
    <div style={styles.app}>
      <GlobalStyle />

      <div style={styles.header}>
        <div style={styles.headerTop}>
          <div>
            <div style={styles.eyebrow}>DRAFT NIGHT — {settings.numTeams} TEAMS · ${settings.budget}</div>
            <h1 style={styles.h1}>THE DRAFT ROOM</h1>
          </div>
          <div style={styles.headerBtns}>
            <button style={styles.iconBtn} onClick={() => setShowSettings((s) => !s)}>
              <Settings2 size={16} /> Settings
            </button>
            <button style={{ ...styles.iconBtn, color: "#C1443C", borderColor: "#4a2624" }} onClick={resetDraft}>
              <RotateCcw size={16} /> New Draft
            </button>
          </div>
        </div>

        <div style={styles.gaugeRow}>
          <div style={styles.gaugeCard}>
            <div style={styles.gaugeLabel}>
              DRAFT ROOM PRESSURE <span style={{ opacity: 0.6, fontWeight: 400 }}>— league-wide budget vs. value left</span>
            </div>
            <div style={styles.gaugeTrack}>
              <div style={styles.gaugeTickCenter} />
              <div
                style={{
                  ...styles.gaugeFill, width: `${gaugePct}%`,
                  background: gaugeTone === "hot" ? "#C1443C" : gaugeTone === "cold" ? "#4FA69A" : "#D8A63D",
                }}
              />
              <div style={{ ...styles.gaugeNeedle, left: `${gaugePct}%` }} />
            </div>
            <div style={styles.gaugeFoot}>
              <span>0.6x</span>
              <span
                style={{
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: 20, fontWeight: 700,
                  color: gaugeTone === "hot" ? "#E27167" : gaugeTone === "cold" ? "#6FC4B9" : "#E7BE6C",
                }}
              >
                {fmtMult(live.budgetInflationMult)}
              </span>
              <span>1.6x</span>
            </div>
            <div style={{ fontSize: 11, color: "#8CA098", marginTop: 2 }}>
              {gaugeTone === "hot" && "Room is spending hot — dollars are worth less than sheet value."}
              {gaugeTone === "cold" && "Room is cold — dollars are worth more than sheet value. Good time to buy."}
              {gaugeTone === "even" && "Room is roughly on pace with projections."}
            </div>
          </div>

          <div style={styles.scarcityCards}>
            {SCARCITY_POS.map((pos) => {
              const m = live.scarcityMult[pos] || 1;
              const tone = m >= 1.25 ? "hot" : m <= 0.8 ? "cold" : "even";
              return (
                <div
                  key={pos}
                  style={{
                    ...styles.scarcityChip,
                    borderColor: tone === "hot" ? "#5b2c28" : tone === "cold" ? "#204d47" : "#3a4a3e",
                    background: tone === "hot" ? "#221514" : tone === "cold" ? "#0f2320" : "#141d17",
                  }}
                >
                  <div style={styles.scarcityPos}>{pos}</div>
                  <div
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, fontWeight: 700,
                      color: tone === "hot" ? "#E27167" : tone === "cold" ? "#6FC4B9" : "#D8CFB6",
                    }}
                  >
                    {fmtMult(m)}
                  </div>
                  <div style={styles.scarcityHint}>{tone === "hot" ? "drying up" : tone === "cold" ? "plenty left" : "on pace"}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showSettings && (
        <SettingsPanel
          settings={settings} teams={teams}
          updateRoster={updateRoster} updateNumTeams={updateNumTeams}
          renameTeam={renameTeam} setMyTeam={setMyTeam}
          setBudget={(v) => setSettings((s) => ({ ...s, budget: Math.max(1, parseInt(v, 10) || 1) }))}
        />
      )}

      <div style={styles.teamStrip}>
        {teams.map((t) => {
          const st = live.teamStats[t.id];
          if (!st) return null;
          const tight = st.remaining <= 15;
          return (
            <div key={t.id} style={{ ...styles.teamCard, borderColor: t.isMe ? "#D8A63D" : "#26302a" }}>
              <div style={styles.teamName}>
                {t.isMe && <Star size={11} style={{ marginRight: 4, color: "#D8A63D" }} fill="#D8A63D" />}
                {t.name}
              </div>
              <div style={styles.teamBudgetRow}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 16, color: tight ? "#E27167" : "#F1EFE6" }}>
                  {money(st.remaining)}
                </span>
                <span style={{ fontSize: 10, color: "#6E8078" }}>left</span>
              </div>
              <div style={styles.teamSub}>max bid {money(Math.max(1, st.maxBid))} · {st.breakdown.openSlotsTotal} open</div>
            </div>
          );
        })}
      </div>

      <div style={styles.filterBar}>
        <div style={styles.searchWrap}>
          <Search size={14} style={{ color: "#6E8078" }} />
          <input style={styles.searchInput} placeholder="Search players…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div style={styles.posTabs}>
          {["ALL", ...POSITIONS].map((p) => (
            <button key={p} onClick={() => setPosFilter(p)} style={{ ...styles.posTab, ...(posFilter === p ? styles.posTabActive : {}) }}>
              {p}
            </button>
          ))}
        </div>
        <label style={styles.hideToggle}>
          <input type="checkbox" checked={hideDrafted} onChange={(e) => setHideDrafted(e.target.checked)} />
          hide drafted
        </label>
        <button style={styles.addPlayerBtn} onClick={() => setAddOpen((o) => !o)}>
          <Plus size={13} /> add player
        </button>
      </div>

      {addOpen && (
        <div style={styles.addRow}>
          <input style={styles.addInput} placeholder="Player name" value={newPlayer.name} onChange={(e) => setNewPlayer((p) => ({ ...p, name: e.target.value }))} />
          <select style={styles.addSelect} value={newPlayer.pos} onChange={(e) => setNewPlayer((p) => ({ ...p, pos: e.target.value }))}>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <input style={{ ...styles.addInput, width: 80 }} type="number" placeholder="$ proj" value={newPlayer.projected} onChange={(e) => setNewPlayer((p) => ({ ...p, projected: e.target.value }))} />
          <button style={styles.addConfirmBtn} onClick={addPlayer}>add</button>
          <button style={styles.addCancelBtn} onClick={() => setAddOpen(false)}><X size={14} /></button>
        </div>
      )}

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Player</th>
              <th style={styles.th}>Pos</th>
              <th style={styles.thNum}>Yahoo</th>
              <th style={styles.thNum}>ESPN</th>
              <th style={styles.thNum}>NFFC</th>
              <th style={styles.thNum}>Sheet $</th>
              <th style={styles.thNum}>Live Value</th>
              <th style={styles.th}>Draft</th>
            </tr>
          </thead>
          <tbody>
            {visiblePlayers.map((p) => {
              const delta = p._adj - p.projected;
              const deltaTone = delta > 1 ? "#6FC4B9" : delta < -1 ? "#E27167" : "#8CA098";
              const input = draftInputs[p.id] || { price: "", teamId: myTeam ? myTeam.id : "" };
              return (
                <tr key={p.id} style={{ opacity: p.drafted ? 0.55 : 1, background: p.drafted && p.draftedBy === myTeam?.id ? "rgba(216,166,61,0.06)" : "transparent" }}>
                  <td style={styles.tdName}>{p.name}</td>
                  <td style={styles.td}><span style={styles.posPill}>{p.pos}</span></td>
                  <td style={styles.tdNum}>${p.yahoo}</td>
                  <td style={styles.tdNum}>${p.espn}</td>
                  <td style={styles.tdNum}>${p.nffc}</td>
                  <td style={styles.tdNum}>{money(p.projected)}</td>
                  <td style={styles.tdNum}>
                    <span style={{ fontWeight: 700 }}>{money(p._adj)}</span>
                    <span style={{ fontSize: 10, color: deltaTone, marginLeft: 5 }}>{delta > 0 ? "+" : ""}{Math.round(delta)}</span>
                  </td>
                  <td style={styles.tdDraft}>
                    {p.drafted ? (
                      <div style={styles.draftedInfo}>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>{money(p.paid)}</span>
                        <span style={{ fontSize: 11, color: "#6E8078" }}>{teams.find((t) => t.id === p.draftedBy)?.name || "?"}</span>
                        {p.snapAdjValue != null && (
                          <span style={{ fontSize: 11, color: p.paid - p.snapAdjValue > 1 ? "#E27167" : p.paid - p.snapAdjValue < -1 ? "#6FC4B9" : "#8CA098" }}>
                            {p.paid - p.snapAdjValue > 0 ? "over by " : p.paid - p.snapAdjValue < 0 ? "value by " : "fair, "}
                            {p.paid !== p.snapAdjValue ? money(Math.abs(p.paid - p.snapAdjValue)) : ""}
                          </span>
                        )}
                        <button style={styles.undoBtn} onClick={() => undraftPlayer(p.id)}><RotateCcw size={12} /></button>
                      </div>
                    ) : (
                      <div style={styles.draftForm}>
                        <input type="number" placeholder="$" style={styles.priceInput} value={input.price} onChange={(e) => setDraftInputs((prev) => ({ ...prev, [p.id]: { ...input, price: e.target.value } }))} />
                        <select style={styles.teamSelect} value={input.teamId} onChange={(e) => setDraftInputs((prev) => ({ ...prev, [p.id]: { ...input, teamId: e.target.value } }))}>
                          {teams.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                        <button style={styles.draftBtn} onClick={() => draftPlayer(p.id)}>draft</button>
                        <button style={styles.removeBtn} onClick={() => removePlayer(p.id)}><Trash2 size={12} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {visiblePlayers.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: 24, color: "#6E8078" }}>No players match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={styles.footNote}>
        Live Value = $1 + (Sheet $ − 1) × budget-inflation mult × positional-scarcity mult. Scarcity is a raw
        head-count ratio and doesn't yet account for tiers — see FEATURE_BACKLOG.md.
      </div>
    </div>
  );
}

function SettingsPanel({ settings, teams, updateRoster, updateNumTeams, renameTeam, setMyTeam, setBudget }) {
  return (
    <div style={styles.settingsPanel}>
      <div style={styles.settingsCol}>
        <div style={styles.settingsHeading}>League</div>
        <label style={styles.settingsLabel}>Teams
          <input type="number" style={styles.settingsInput} value={settings.numTeams} onChange={(e) => updateNumTeams(e.target.value)} />
        </label>
        <label style={styles.settingsLabel}>Budget per team
          <input type="number" style={styles.settingsInput} value={settings.budget} onChange={(e) => setBudget(e.target.value)} />
        </label>
      </div>
      <div style={styles.settingsCol}>
        <div style={styles.settingsHeading}>Roster slots</div>
        <div style={styles.rosterGrid}>
          {Object.keys(settings.roster).map((k) => (
            <label key={k} style={styles.rosterLabel}>{k}
              <input type="number" style={styles.rosterInput} value={settings.roster[k]} onChange={(e) => updateRoster(k, e.target.value)} />
            </label>
          ))}
        </div>
      </div>
      <div style={styles.settingsCol}>
        <div style={styles.settingsHeading}>Teams in the room</div>
        <div style={styles.teamListEdit}>
          {teams.map((t) => (
            <div key={t.id} style={styles.teamEditRow}>
              <button onClick={() => setMyTeam(t.id)} style={{ ...styles.starBtn, color: t.isMe ? "#D8A63D" : "#3a4a3e" }}>
                <Star size={14} fill={t.isMe ? "#D8A63D" : "none"} />
              </button>
              <input style={styles.teamNameInput} value={t.name} onChange={(e) => renameTeam(t.id, e.target.value)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=IBM+Plex+Mono:wght@400;600;700&family=Inter:wght@400;500;600&display=swap');
      * { box-sizing: border-box; }
      body { margin: 0; background: #0F1712; }
      input, select, button { font-family: 'Inter', sans-serif; }
      input:focus, select:focus { outline: 2px solid #D8A63D; outline-offset: 1px; }
      button:focus-visible { outline: 2px solid #D8A63D; outline-offset: 1px; }
      ::-webkit-scrollbar { height: 8px; width: 8px; }
      ::-webkit-scrollbar-thumb { background: #2a352d; border-radius: 4px; }
    `}</style>
  );
}

const styles = {
  app: { fontFamily: "'Inter', sans-serif", background: "#0F1712", color: "#F1EFE6", minHeight: "100vh", padding: "18px 20px 28px" },
  header: { marginBottom: 16 },
  headerTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  eyebrow: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.12em", color: "#D8A63D", marginBottom: 4 },
  h1: { fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 26, letterSpacing: "0.03em", margin: 0, color: "#F1EFE6" },
  headerBtns: { display: "flex", gap: 8, alignItems: "center" },
  iconBtn: { display: "flex", alignItems: "center", gap: 6, background: "#141d17", border: "1px solid #2a352d", color: "#D8CFB6", fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 6, cursor: "pointer" },
  gaugeRow: { display: "flex", gap: 12, flexWrap: "wrap" },
  gaugeCard: { flex: "1 1 340px", background: "#141d17", border: "1px solid #26302a", borderRadius: 8, padding: "14px 16px" },
  gaugeLabel: { fontFamily: "'Oswald', sans-serif", fontSize: 12, letterSpacing: "0.05em", color: "#D8CFB6", marginBottom: 8, textTransform: "uppercase" },
  gaugeTrack: { position: "relative", height: 10, borderRadius: 5, background: "#1c261f", overflow: "hidden" },
  gaugeTickCenter: { position: "absolute", left: "40%", top: 0, bottom: 0, width: 1, background: "#3a4a3e", zIndex: 1 },
  gaugeFill: { height: "100%", borderRadius: 5, transition: "width .4s ease" },
  gaugeNeedle: { position: "absolute", top: -3, width: 2, height: 16, background: "#F1EFE6", transform: "translateX(-1px)" },
  gaugeFoot: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, fontSize: 11, color: "#6E8078" },
  scarcityCards: { display: "flex", gap: 8, flexWrap: "wrap" },
  scarcityChip: { border: "1px solid", borderRadius: 8, padding: "10px 14px", minWidth: 76, textAlign: "center" },
  scarcityPos: { fontFamily: "'Oswald', sans-serif", fontSize: 11, letterSpacing: "0.08em", color: "#8CA098" },
  scarcityHint: { fontSize: 9.5, color: "#6E8078", marginTop: 2 },
  settingsPanel: { display: "flex", gap: 24, flexWrap: "wrap", background: "#141d17", border: "1px solid #26302a", borderRadius: 8, padding: 16, marginBottom: 16 },
  settingsCol: { minWidth: 160 },
  settingsHeading: { fontFamily: "'Oswald', sans-serif", fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: "#D8A63D", marginBottom: 8 },
  settingsLabel: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "#D8CFB6", marginBottom: 8, gap: 8 },
  settingsInput: { width: 60, background: "#0F1712", border: "1px solid #2a352d", color: "#F1EFE6", borderRadius: 4, padding: "3px 6px" },
  rosterGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 14px" },
  rosterLabel: { display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "#D8CFB6" },
  rosterInput: { width: 44, background: "#0F1712", border: "1px solid #2a352d", color: "#F1EFE6", borderRadius: 4, padding: "2px 4px" },
  teamListEdit: { display: "flex", flexDirection: "column", gap: 5, maxHeight: 150, overflowY: "auto" },
  teamEditRow: { display: "flex", alignItems: "center", gap: 6 },
  starBtn: { background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex" },
  teamNameInput: { flex: 1, background: "#0F1712", border: "1px solid #2a352d", color: "#F1EFE6", borderRadius: 4, padding: "3px 6px", fontSize: 12 },
  teamStrip: { display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6, marginBottom: 14 },
  teamCard: { flex: "0 0 auto", minWidth: 112, background: "#141d17", border: "1px solid", borderRadius: 7, padding: "8px 10px" },
  teamName: { display: "flex", alignItems: "center", fontSize: 11.5, fontWeight: 600, color: "#D8CFB6", marginBottom: 4, whiteSpace: "nowrap" },
  teamBudgetRow: { display: "flex", alignItems: "baseline", gap: 5 },
  teamSub: { fontSize: 9.5, color: "#6E8078", marginTop: 3 },
  filterBar: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 },
  searchWrap: { display: "flex", alignItems: "center", gap: 6, background: "#141d17", border: "1px solid #26302a", borderRadius: 6, padding: "6px 10px", minWidth: 180 },
  searchInput: { background: "none", border: "none", color: "#F1EFE6", fontSize: 12.5, width: "100%" },
  posTabs: { display: "flex", gap: 4 },
  posTab: { background: "#141d17", border: "1px solid #26302a", color: "#8CA098", fontSize: 11, fontWeight: 600, padding: "5px 9px", borderRadius: 5, cursor: "pointer" },
  posTabActive: { background: "#D8A63D", color: "#0F1712", borderColor: "#D8A63D" },
  hideToggle: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#8CA098" },
  addPlayerBtn: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, background: "none", border: "1px dashed #3a4a3e", color: "#8CA098", fontSize: 11.5, padding: "6px 10px", borderRadius: 6, cursor: "pointer" },
  addRow: { display: "flex", gap: 8, alignItems: "center", background: "#141d17", border: "1px solid #26302a", borderRadius: 7, padding: 10, marginBottom: 10 },
  addInput: { background: "#0F1712", border: "1px solid #2a352d", color: "#F1EFE6", borderRadius: 4, padding: "6px 8px", fontSize: 12.5, flex: 1 },
  addSelect: { background: "#0F1712", border: "1px solid #2a352d", color: "#F1EFE6", borderRadius: 4, padding: "6px 8px", fontSize: 12.5 },
  addConfirmBtn: { background: "#D8A63D", color: "#0F1712", border: "none", borderRadius: 5, padding: "7px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer" },
  addCancelBtn: { background: "none", border: "none", color: "#8CA098", cursor: "pointer", padding: 6 },
  tableWrap: { overflowX: "auto", border: "1px solid #26302a", borderRadius: 8 },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 820 },
  th: { textAlign: "left", fontFamily: "'Oswald', sans-serif", fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase", color: "#8CA098", background: "#141d17", padding: "9px 12px", borderBottom: "1px solid #26302a", position: "sticky", top: 0 },
  thNum: { textAlign: "right", fontFamily: "'Oswald', sans-serif", fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase", color: "#8CA098", background: "#141d17", padding: "9px 12px", borderBottom: "1px solid #26302a", position: "sticky", top: 0 },
  td: { padding: "8px 12px", borderBottom: "1px solid #1c261f", fontSize: 12.5 },
  tdName: { padding: "8px 12px", borderBottom: "1px solid #1c261f", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" },
  tdNum: { padding: "8px 12px", borderBottom: "1px solid #1c261f", fontSize: 12.5, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" },
  tdDraft: { padding: "6px 12px", borderBottom: "1px solid #1c261f" },
  posPill: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, fontWeight: 700, color: "#8CA098", border: "1px solid #2a352d", borderRadius: 4, padding: "1px 6px" },
  draftForm: { display: "flex", gap: 5, alignItems: "center", justifyContent: "flex-end" },
  priceInput: { width: 48, background: "#0F1712", border: "1px solid #2a352d", color: "#F1EFE6", borderRadius: 4, padding: "5px 6px", fontSize: 12 },
  teamSelect: { background: "#0F1712", border: "1px solid #2a352d", color: "#F1EFE6", borderRadius: 4, padding: "5px 6px", fontSize: 11.5, maxWidth: 110 },
  draftBtn: { background: "#3E6B4F", color: "#F1EFE6", border: "none", borderRadius: 4, padding: "6px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" },
  removeBtn: { background: "none", border: "none", color: "#4a5850", cursor: "pointer", padding: 4 },
  draftedInfo: { display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", fontSize: 11.5 },
  undoBtn: { background: "none", border: "none", color: "#4a5850", cursor: "pointer", padding: 3 },
  footNote: { fontSize: 11, color: "#6E8078", marginTop: 14, lineHeight: 1.5, maxWidth: 820 },
};
