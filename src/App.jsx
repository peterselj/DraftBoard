import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { RotateCcw, Settings2, X, Undo2, Keyboard } from "lucide-react";
import seedData from "./data/players2025.json";
import {
  POSITIONS, FLEX_ELIGIBLE, DEFAULT_SETTINGS, defaultTeams,
  computeBaselineFromCounts, positionCounts, computeLive, adjustedValue,
} from "./lib/draftMath.js";
import { loadDraft, saveDraft, clearDraft } from "./lib/storage.js";
import { C, F, ui, money } from "./theme.js";
import ConfirmDialog from "./components/ConfirmDialog.jsx";
import QuickEntry from "./components/QuickEntry.jsx";
import FilterBar from "./components/FilterBar.jsx";
import PlayerTable from "./components/PlayerTable.jsx";
import SettingsPanel from "./components/SettingsPanel.jsx";
import { PressureGauge, ScarcityChips, TeamStrip } from "./components/Dashboard.jsx";

const freshPlayers = () =>
  seedData.players.map((p) => ({
    ...p, drafted: false, paid: null, draftedBy: null,
    snapAdjValue: null, snapBudgetMult: null, snapScarcityMult: null,
  }));

const MARKET_KEYS = ["yahoo", "espn", "nffc", "sleeper"];

/** What the room is likely to pay: the mean of whatever published auction
 *  values we have for this player. Null when we have none. */
function marketValue(p) {
  const vals = MARKET_KEYS.map((k) => p[k]).filter((v) => typeof v === "number" && v > 0);
  if (!vals.length) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

export default function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [teams, setTeams] = useState(() => defaultTeams(DEFAULT_SETTINGS.numTeams));
  const [players, setPlayers] = useState(freshPlayers);
  const [picks, setPicks] = useState([]);
  const [baselinePool, setBaselinePool] = useState(() => positionCounts(freshPlayers()));
  const [loaded, setLoaded] = useState(false);

  const [search, setSearch] = useState("");
  const [selectedPos, setSelectedPos] = useState(() => new Set());
  const [flexOn, setFlexOn] = useState(false);
  const [hideDrafted, setHideDrafted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newPlayer, setNewPlayer] = useState({ name: "", pos: "RB", projected: 5 });
  const [draftInputs, setDraftInputs] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);

  const quickRef = useRef(null);
  const searchRef = useRef(null);
  const saveTimer = useRef(null);
  const toastTimer = useRef(null);

  // ---- persistence ---------------------------------------------------------
  useEffect(() => {
    const saved = loadDraft();
    if (saved) {
      if (saved.settings) setSettings(saved.settings);
      if (saved.teams) setTeams(saved.teams);
      if (saved.players) setPlayers(saved.players);
      if (saved.picks) setPicks(saved.picks);
      setBaselinePool(saved.baselinePool || positionCounts(saved.players || freshPlayers()));
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return undefined;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(
      () => saveDraft({ settings, teams, players, picks, baselinePool }),
      400
    );
    return () => clearTimeout(saveTimer.current);
  }, [settings, teams, players, picks, baselinePool, loaded]);

  // ---- derived draft state -------------------------------------------------
  const baselineRatio = useMemo(
    () => computeBaselineFromCounts(settings, baselinePool),
    [settings, baselinePool]
  );
  const live = useMemo(
    () => computeLive(players, teams, settings, baselineRatio),
    [players, teams, settings, baselineRatio]
  );
  const myTeam = teams.find((t) => t.isMe) || teams[0];

  /** The three numbers every row (and the quick-entry preview) needs. */
  const valueOf = useCallback(
    (p) => {
      const model = p.model ?? p.projected;
      const market = marketValue(p);
      return {
        model,
        market,
        edge: market == null ? 0 : model - market,
        live: adjustedValue(p, live, model),
      };
    },
    [live]
  );

  const effectivePos = useMemo(() => {
    const set = new Set(selectedPos);
    if (flexOn) FLEX_ELIGIBLE.forEach((p) => set.add(p));
    return set;
  }, [selectedPos, flexOn]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = players
      .filter((p) => {
        if (hideDrafted && p.drafted) return false;
        if (effectivePos.size > 0 && !effectivePos.has(p.pos)) return false;
        if (q && !p.name.toLowerCase().includes(q)) return false;
        return true;
      })
      .map((p) => ({ ...p, _val: valueOf(p) }));
    rows.sort((a, b) => {
      if (a.drafted !== b.drafted) return a.drafted ? 1 : -1;
      return b._val.live - a._val.live;
    });
    return rows;
  }, [players, hideDrafted, effectivePos, search, valueOf]);

  const draftedCount = useMemo(() => players.filter((p) => p.drafted).length, [players]);
  const maxBidFor = useCallback(
    (teamId) => Math.max(1, live.teamStats[teamId]?.maxBid ?? 1),
    [live]
  );

  // ---- actions -------------------------------------------------------------
  const flashToast = useCallback((node) => {
    setToast(node);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  const commitPick = useCallback(
    ({ playerId, price, teamId }) => {
      const p = players.find((x) => x.id === playerId);
      if (!p || p.drafted || !teamId) return false;
      const paid = Math.max(1, parseInt(price, 10) || 1);
      const snap = adjustedValue(p, live, p.model ?? p.projected);

      setPlayers((prev) =>
        prev.map((x) =>
          x.id === playerId
            ? {
                ...x, drafted: true, paid, draftedBy: teamId,
                snapAdjValue: snap,
                snapBudgetMult: live.budgetInflationMult,
                snapScarcityMult: live.scarcityMult[x.pos] || 1,
              }
            : x
        )
      );
      setPicks((prev) => [...prev, { playerId, price: paid, teamId, at: Date.now() }]);
      setDraftInputs((prev) => {
        const next = { ...prev };
        delete next[playerId];
        return next;
      });
      const teamName = teams.find((t) => t.id === teamId)?.name || "?";
      flashToast(`${p.name} → ${teamName} · ${money(paid)}`);
      return true;
    },
    [players, teams, live, flashToast]
  );

  const draftFromRow = useCallback(
    (playerId, override) => {
      const input = override || draftInputs[playerId];
      if (!input?.teamId || !input?.price) {
        flashToast("Needs a price and a team before it can be logged.");
        return;
      }
      commitPick({ playerId, price: input.price, teamId: input.teamId });
    },
    [draftInputs, commitPick, flashToast]
  );

  const undraftPlayer = useCallback((playerId) => {
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId
          ? { ...p, drafted: false, paid: null, draftedBy: null, snapAdjValue: null, snapBudgetMult: null, snapScarcityMult: null }
          : p
      )
    );
    setPicks((prev) => {
      const idx = [...prev].reverse().findIndex((k) => k.playerId === playerId);
      if (idx === -1) return prev;
      const realIdx = prev.length - 1 - idx;
      return [...prev.slice(0, realIdx), ...prev.slice(realIdx + 1)];
    });
  }, []);

  const undoLastPick = useCallback(() => {
    const last = picks[picks.length - 1];
    if (!last) {
      flashToast("Nothing to undo.");
      return;
    }
    undraftPlayer(last.playerId);
    const name = players.find((p) => p.id === last.playerId)?.name || "pick";
    flashToast(`Undid ${name} (${money(last.price)}).`);
  }, [picks, players, undraftPlayer, flashToast]);

  const requestRemovePlayer = useCallback(
    (playerId) => {
      const p = players.find((x) => x.id === playerId);
      if (!p) return;
      setConfirm({
        title: `Remove ${p.name}?`,
        body: "Takes him out of the pool entirely — he'll stop counting toward positional supply. Undo isn't available for this.",
        confirmLabel: "Remove",
        danger: true,
        onConfirm: () => {
          setPlayers((prev) => prev.filter((x) => x.id !== playerId));
          setConfirm(null);
        },
      });
    },
    [players]
  );

  const requestNewDraft = useCallback(() => {
    setConfirm({
      title: "Start a new draft?",
      body: "Clears every pick and resets budgets. League settings and team names are kept.",
      confirmLabel: "Start new draft",
      danger: true,
      onConfirm: () => {
        const pool = freshPlayers();
        setPlayers(pool);
        setPicks([]);
        setBaselinePool(positionCounts(pool));
        setDraftInputs({});
        setSearch("");
        setSelectedPos(new Set());
        setFlexOn(false);
        setHideDrafted(false);
        setTeams((prev) => prev.map((t) => ({ ...t })));
        clearDraft();
        setConfirm(null);
        flashToast("New draft started.");
      },
    });
  }, [flashToast]);

  const addPlayer = () => {
    const name = newPlayer.name.trim();
    if (!name) return;
    const proj = Math.max(1, parseInt(newPlayer.projected, 10) || 1);
    const player = {
      id: `custom-${Date.now()}`, name, pos: newPlayer.pos,
      yahoo: proj, espn: proj, nffc: proj, projected: proj,
      drafted: false, paid: null, draftedBy: null,
      snapAdjValue: null, snapBudgetMult: null, snapScarcityMult: null,
    };
    setPlayers((prev) => [...prev, player]);
    // Added players count toward positional supply from here on.
    setBaselinePool((prev) => ({ ...prev, [player.pos]: (prev[player.pos] || 0) + 1 }));
    setNewPlayer({ name: "", pos: "RB", projected: 5 });
    setAddOpen(false);
    // Make sure the new row is actually reachable rather than filtered away.
    setSelectedPos(new Set());
    setFlexOn(false);
    setHideDrafted(false);
    setSearch(name);
    flashToast(`Added ${name} (${player.pos}, ${money(proj)}).`);
  };

  // ---- settings ------------------------------------------------------------
  const updateRoster = (key, val) =>
    setSettings((s) => ({ ...s, roster: { ...s.roster, [key]: Math.max(0, parseInt(val, 10) || 0) } }));

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

  const applyTeamNames = (names) => {
    setTeams((prev) => {
      const kept = names.map((name, i) => ({
        id: prev[i]?.id ?? `t${i}`,
        name,
        isMe: prev[i]?.isMe ?? i === 0,
      }));
      if (!kept.some((t) => t.isMe) && kept.length) kept[0].isMe = true;
      return kept;
    });
    setSettings((s) => ({ ...s, numTeams: names.length }));
    flashToast(`Loaded ${names.length} teams.`);
  };

  const renameTeam = (id, name) => setTeams((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)));
  const setMyTeam = (id) => setTeams((prev) => prev.map((t) => ({ ...t, isMe: t.id === id })));

  const togglePos = (pos) =>
    setSelectedPos((prev) => {
      const next = new Set(prev);
      if (next.has(pos)) next.delete(pos);
      else next.add(pos);
      return next;
    });

  const setDraftInput = useCallback((playerId, value) => {
    setDraftInputs((prev) => ({ ...prev, [playerId]: value }));
  }, []);

  const clearFilters = useCallback(() => {
    setSearch("");
    setSelectedPos(new Set());
    setFlexOn(false);
    setHideDrafted(false);
  }, []);

  // ---- keyboard ------------------------------------------------------------
  useEffect(() => {
    const onKey = (e) => {
      const el = e.target;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undoLastPick();
        return;
      }
      if (typing) return;
      if (e.key === "/") {
        e.preventDefault();
        quickRef.current?.focus();
      } else if (e.key.toLowerCase() === "h") {
        setHideDrafted((v) => !v);
      } else if (e.key.toLowerCase() === "f") {
        setFlexOn((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undoLastPick]);

  if (!loaded) return <div style={styles.app}>loading…</div>;

  return (
    <div style={styles.app}>
      <GlobalStyle />

      <div style={styles.headerTop}>
        <div>
          <div style={styles.eyebrow}>
            DRAFT NIGHT — {settings.numTeams} TEAMS · ${settings.budget} ·{" "}
            {draftedCount} {draftedCount === 1 ? "PICK" : "PICKS"} IN
          </div>
          <h1 style={styles.h1}>DRAFT BOARD</h1>
        </div>
        <div style={styles.headerBtns}>
          <button style={ui.btn} onClick={undoLastPick} disabled={!picks.length} title="Ctrl+Z">
            <Undo2 size={16} /> Undo{picks.length ? ` (${picks.length})` : ""}
          </button>
          <button style={ui.btn} onClick={() => setShowSettings((s) => !s)}>
            <Settings2 size={16} /> Settings
          </button>
          <button
            style={{ ...ui.btn, color: C.red, borderColor: "#4a2624" }}
            onClick={requestNewDraft}
          >
            <RotateCcw size={16} /> New Draft
          </button>
        </div>
      </div>

      <div style={styles.gaugeRow}>
        <PressureGauge live={live} />
        <ScarcityChips live={live} />
      </div>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          teams={teams}
          updateRoster={updateRoster}
          updateNumTeams={updateNumTeams}
          renameTeam={renameTeam}
          setMyTeam={setMyTeam}
          setBudget={(v) => setSettings((s) => ({ ...s, budget: Math.max(1, parseInt(v, 10) || 1) }))}
          applyTeamNames={applyTeamNames}
        />
      )}

      <TeamStrip teams={teams} live={live} />

      <QuickEntry
        players={players}
        teams={teams}
        myTeamId={myTeam?.id}
        valueOf={valueOf}
        onCommit={commitPick}
        inputRef={quickRef}
      />

      <FilterBar
        search={search}
        setSearch={setSearch}
        searchRef={searchRef}
        selectedPos={selectedPos}
        togglePos={togglePos}
        clearPos={() => { setSelectedPos(new Set()); setFlexOn(false); }}
        flexOn={flexOn}
        toggleFlex={() => setFlexOn((v) => !v)}
        hideDrafted={hideDrafted}
        toggleHideDrafted={() => setHideDrafted((v) => !v)}
        draftedCount={draftedCount}
        addOpen={addOpen}
        toggleAdd={() => setAddOpen((o) => !o)}
      />

      {addOpen && (
        <div style={styles.addRow}>
          <input
            style={{ ...ui.input, flex: 1 }}
            placeholder="Player name"
            value={newPlayer.name}
            autoFocus
            onChange={(e) => setNewPlayer((p) => ({ ...p, name: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && addPlayer()}
          />
          <select
            style={ui.input}
            value={newPlayer.pos}
            onChange={(e) => setNewPlayer((p) => ({ ...p, pos: e.target.value }))}
          >
            {POSITIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <input
            style={{ ...ui.input, width: 84 }}
            type="number"
            min="1"
            placeholder="$ value"
            value={newPlayer.projected}
            onChange={(e) => setNewPlayer((p) => ({ ...p, projected: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && addPlayer()}
          />
          <button
            style={{ ...styles.addConfirm, opacity: newPlayer.name.trim() ? 1 : 0.45 }}
            onClick={addPlayer}
          >
            add
          </button>
          <button style={styles.addCancel} onClick={() => setAddOpen(false)}><X size={14} /></button>
        </div>
      )}

      <PlayerTable
        rows={visibleRows}
        teams={teams}
        myTeamId={myTeam?.id}
        draftInputs={draftInputs}
        setDraftInput={setDraftInput}
        onDraft={draftFromRow}
        onUndraft={undraftPlayer}
        onRemove={requestRemovePlayer}
        maxBidFor={maxBidFor}
        onClearFilters={clearFilters}
      />

      <div style={styles.footNote}>
        <Keyboard size={13} style={{ verticalAlign: "-2px", marginRight: 6, color: C.dim }} />
        <b style={{ color: C.bone }}>/</b> jump to quick entry · <b style={{ color: C.bone }}>↑↓</b> pick a
        candidate · <b style={{ color: C.bone }}>Enter</b> log it · <b style={{ color: C.bone }}>Ctrl+Z</b> undo ·{" "}
        <b style={{ color: C.bone }}>h</b> hide drafted · <b style={{ color: C.bone }}>f</b> flex
        <div style={{ marginTop: 6 }}>
          Live $ = model value adjusted for room pressure and positional scarcity. Scarcity is a
          raw head-count ratio and doesn't yet account for tiers — see FEATURE_BACKLOG.md.
        </div>
      </div>

      {toast && (
        <div style={styles.toast} onClick={() => setToast(null)} role="status">
          {toast}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        body={confirm?.body}
        confirmLabel={confirm?.confirmLabel}
        danger={confirm?.danger}
        onConfirm={() => confirm?.onConfirm?.()}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=IBM+Plex+Mono:wght@400;600;700&family=Inter:wght@400;500;600&display=swap');
      * { box-sizing: border-box; }
      body { margin: 0; background: ${C.bg}; }
      input, select, button, textarea { font-family: 'Inter', sans-serif; }
      input:focus, select:focus, textarea:focus { outline: 2px solid ${C.gold}; outline-offset: 1px; }
      button:focus-visible { outline: 2px solid ${C.gold}; outline-offset: 1px; }
      button:disabled { opacity: 0.4; cursor: not-allowed; }
      ::-webkit-scrollbar { height: 8px; width: 8px; }
      ::-webkit-scrollbar-thumb { background: #2a352d; border-radius: 4px; }
      @keyframes riseIn { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
    `}</style>
  );
}

const styles = {
  app: { fontFamily: F.body, background: C.bg, color: C.text, minHeight: "100vh", padding: "18px 20px 28px" },
  headerTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  eyebrow: { fontFamily: F.mono, fontSize: 11, letterSpacing: "0.12em", color: C.gold, marginBottom: 4 },
  h1: { fontFamily: F.head, fontWeight: 700, fontSize: 26, letterSpacing: "0.03em", margin: 0, color: C.text },
  headerBtns: { display: "flex", gap: 8, alignItems: "center" },
  gaugeRow: { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 },
  addRow: { ...ui.panel, display: "flex", gap: 8, alignItems: "center", padding: 10, marginBottom: 10 },
  addConfirm: { background: C.gold, color: C.bg, border: "none", borderRadius: 5, padding: "7px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer" },
  addCancel: { background: "none", border: "none", color: C.dim, cursor: "pointer", padding: 6 },
  footNote: { fontSize: 11, color: C.dimmer, marginTop: 14, lineHeight: 1.6, maxWidth: 860 },
  toast: {
    position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)",
    background: C.panelHi, border: `1px solid ${C.gold}`, color: C.text,
    padding: "10px 18px", borderRadius: 8, fontSize: 13, zIndex: 90, cursor: "pointer",
    boxShadow: "0 10px 30px rgba(0,0,0,0.5)", animation: "riseIn .18s ease",
  },
};
