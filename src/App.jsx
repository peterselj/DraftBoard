import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { RotateCcw, Settings2, X, Undo2, Keyboard, RefreshCw, Download } from "lucide-react";
import {
  POSITIONS, FLEX_ELIGIBLE, DEFAULT_SETTINGS, defaultTeams,
  computeBaseline, computeLive, adjustedValue, leagueFillCounts,
} from "./lib/draftMath.js";
import { computeModelValues } from "./lib/valueModel.js";
import { DEFAULT_SCORING } from "./lib/scoring.js";
import {
  seedPlayers, toAppPlayer, loadPublishedDataset, refreshFromLiveSources,
  mergeValuesIntoPool, currentSeason,
} from "./lib/dataSource.js";
import { applyImport } from "./lib/importParse.js";
import { loadDraft, saveDraft, clearDraft } from "./lib/storage.js";
import {
  roomKey, roomFromUrl, setUrlRoom, upsertRoom, adoptLegacyDraft,
} from "./lib/rooms.js";
import RoomPicker from "./components/RoomPicker.jsx";
import { C, F, ui, money } from "./theme.js";
import ConfirmDialog from "./components/ConfirmDialog.jsx";
import QuickEntry from "./components/QuickEntry.jsx";
import FilterBar from "./components/FilterBar.jsx";
import PlayerTable from "./components/PlayerTable.jsx";
import SettingsPanel from "./components/SettingsPanel.jsx";
import DataPanel, { ago } from "./components/DataPanel.jsx";
import { PressureGauge, ScarcityChips, TeamStrip } from "./components/Dashboard.jsx";

const freshPlayers = seedPlayers;

const MARKET_KEYS = ["yahoo", "espn", "nffc", "sleeper", "fantasypros", "etr"];

// Which pasted-in field each basis source reads from. "model" has no field —
// it's always the bottom-up figure itself, never a pasted number.
const BASIS_FIELD = { fp: "fantasypros", etr: "etr" };

// Single-letter position filters, same toggle behavior as clicking the pill.
// "D" is DEF rather than DST to match POSITIONS in draftMath.js.
const POS_KEYS = { q: "QB", r: "RB", w: "WR", t: "TE", k: "K", d: "DEF" };

/** Consensus across every published source we have. Null when we have none. */
function marketValue(p) {
  const vals = MARKET_KEYS.map((k) => p[k]).filter((v) => typeof v === "number" && v > 0);
  if (!vals.length) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

/** The number the rest of the room is actually looking at: whatever the
 *  platform this league drafts on publishes. That's what anchors the bidding —
 *  doubly so if anyone is on autodraft. Falls back to consensus when the
 *  chosen platform has no values loaded. */
function siteValue(p, platform) {
  const v = p[platform];
  return typeof v === "number" && v > 0 ? v : null;
}

export default function App() {
  // A draft saved before rooms existed is adopted as a room rather than lost.
  const [room, setRoom] = useState(() => roomFromUrl() || adoptLegacyDraft());
  if (!room) return <RoomPicker onEnter={(code) => { setUrlRoom(code); setRoom(code); }} />;
  return <Board key={room} room={room} onLeave={() => { setUrlRoom(""); setRoom(null); }} />;
}

function Board({ room, onLeave }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [teams, setTeams] = useState(() => defaultTeams(DEFAULT_SETTINGS.numTeams));
  const [players, setPlayers] = useState(freshPlayers);
  const [picks, setPicks] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const [search, setSearch] = useState("");
  const [selectedPos, setSelectedPos] = useState(() => new Set());
  const [flexOn, setFlexOn] = useState(false);
  const [hideDrafted, setHideDrafted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [newPlayer, setNewPlayer] = useState({ name: "", pos: "RB", projected: 5 });
  const [draftInputs, setDraftInputs] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [dataMeta, setDataMeta] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const quickRef = useRef(null);
  const searchRef = useRef(null);
  const saveTimer = useRef(null);
  const toastTimer = useRef(null);

  // ---- persistence ---------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const saved = loadDraft(roomKey(room));
    if (saved) {
      // Scoring settings arrived after the first saved drafts existed.
      if (saved.settings) setSettings({ scoring: DEFAULT_SCORING, ...saved.settings });
      if (saved.teams) setTeams(saved.teams);
      if (saved.players) setPlayers(saved.players);
      if (saved.picks) setPicks(saved.picks);
      if (saved.dataMeta) setDataMeta(saved.dataMeta);
    }
    setLoaded(true);

    // Pull the published dataset regardless: a fresh board adopts it wholesale,
    // an in-progress draft just takes the new numbers.
    loadPublishedDataset(currentSeason())
      .then((data) => {
        if (cancelled) return;
        const incoming = data.players.map(toAppPlayer);
        const meta = {
          season: data.season,
          generated: data.generated,
          origin: "published values",
          count: incoming.length,
        };
        if (saved?.players?.length) {
          setPlayers((prev) => mergeValuesIntoPool(prev, incoming));
        } else {
          setPlayers(incoming);
        }
        setDataMeta(meta);
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn("Falling back to the bundled seed pool:", e.message);
        setDataMeta((m) => m || {
          season: currentSeason(),
          origin: "bundled seed (offline)",
          notes: ["Couldn't load published values — using the file shipped with the app."],
        });
      });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!loaded) return undefined;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDraft(roomKey(room), { settings, teams, players, picks, dataMeta });
      // Keep the room list's summary line honest.
      upsertRoom(room, { picks: picks.length });
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [settings, teams, players, picks, dataMeta, loaded]);

  // ---- derived draft state -------------------------------------------------
  // Bottom-up dollar values from projections, for this league's exact settings.
  // Players without projections fall through to their sheet value.
  const modelValues = useMemo(
    () => computeModelValues(players, settings).values,
    [players, settings]
  );
  const baseValueOf = useCallback(
    (p) => modelValues.get(p.id) ?? p.model ?? p.projected,
    [modelValues]
  );

  // Which pasted-in source Live $ is built from — FP $, ETR $, or the model
  // itself — is a choice made once in Settings (or from the column headers),
  // not something juggled per player. Whichever one is chosen becomes *the*
  // number: Site Edge and Live $ both measure against it, no more comparing
  // three prices in your head. "model" always resolves; "fp"/"etr" fall back
  // to the model value for anyone missing that pasted field, since budget
  // inflation and scarcity (computeBaseline/computeLive) need a number for
  // every undrafted player to stay calibrated to the whole pot, and neither
  // FP $ nor ETR $ is ever pasted in for the whole pool.
  const basisSource = settings.basisSource || "fp";
  const basisOf = useCallback(
    (p) => {
      if (basisSource === "model") return baseValueOf(p);
      const field = BASIS_FIELD[basisSource];
      const raw = p[field];
      return typeof raw === "number" && raw > 0 ? raw : baseValueOf(p);
    },
    [baseValueOf, basisSource]
  );

  // The scarcity baseline is derived from the *whole* pool — drafted players
  // included — so it always describes the start of the draft in the same units
  // the live figure uses. Snapshotting it instead went stale the moment league
  // settings changed, because model dollars scale with the size of the pot.
  const baselineRatio = useMemo(
    () => computeBaseline(settings, players, basisOf),
    [settings, players, basisOf]
  );

  const live = useMemo(
    () => computeLive(players, teams, settings, baselineRatio, basisOf),
    [players, teams, settings, baselineRatio, basisOf]
  );

  // Plain head counts alongside the scarcity multipliers — how many bodies
  // are actually gone, since a "1.05x" tells you nothing about that on its
  // own (see leagueFillCounts's own comment for why five picks at one
  // position doesn't mean five teams filled their room there).
  const fillCounts = useMemo(
    () => leagueFillCounts(players, teams, settings.roster),
    [players, teams, settings.roster]
  );

  const myTeam = teams.find((t) => t.isMe) || teams[0];

  /** The numbers every row (and the quick-entry preview) needs. */
  const platform = settings.platform || "espn";
  const valueOf = useCallback(
    (p) => {
      const model = baseValueOf(p);
      const fp = typeof p.fantasypros === "number" && p.fantasypros > 0 ? p.fantasypros : null;
      const etr = typeof p.etr === "number" && p.etr > 0 ? p.etr : null;
      const consensus = marketValue(p);
      const site = siteValue(p, platform);
      const basis = basisOf(p);
      return {
        model,
        fp,
        etr,
        site,
        consensus,
        // Site Edge is the one comparison that still matters once a basis is
        // chosen: basis minus the room's price. Positive means the room is
        // pricing him below whichever source you've picked as truth — a
        // bargain, "green is good". There's no Model Edge anymore — comparing
        // sources to each other stopped being useful the moment one of them
        // became *the* number.
        siteEdge: site == null ? null : basis - site,
        // Best available stand-in for "true" market value, for the
        // quick-entry preview and anywhere else a single number is needed.
        market: fp ?? consensus,
        basis,
        live: adjustedValue(p, live, basis),
      };
    },
    [live, baseValueOf, basisOf, platform]
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
      // Snapshot what he was worth at the moment of the pick, so the
      // over/value verdict doesn't drift as the rest of the draft moves.
      const snap = valueOf(p).live;

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
    [players, teams, live, valueOf, flashToast]
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

  const requestNewDraft = useCallback(() => {
    setConfirm({
      title: "Start a new draft?",
      body: "Clears every pick and resets budgets. League settings and team names are kept.",
      confirmLabel: "Start new draft",
      danger: true,
      onConfirm: () => {
        setPlayers((prev) => prev.map((p) => ({
          ...p, drafted: false, paid: null, draftedBy: null,
          snapAdjValue: null, snapBudgetMult: null, snapScarcityMult: null,
        })));
        setPicks([]);
        setDraftInputs({});
        setSearch("");
        setSelectedPos(new Set());
        setFlexOn(false);
        setHideDrafted(false);
        setTeams((prev) => prev.map((t) => ({ ...t })));
        clearDraft(roomKey(room));
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

  // ---- data ----------------------------------------------------------------
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await refreshFromLiveSources(currentSeason());
      const incoming = data.players.map(toAppPlayer);
      setPlayers((prev) => mergeValuesIntoPool(prev, incoming));
      setDataMeta({
        season: data.season,
        generated: data.generated,
        origin: "live from ESPN + Sleeper",
        count: incoming.length,
        notes: data.notes,
      });
      flashToast(`Refreshed ${incoming.length} players from live sources.`);
    } catch (e) {
      // Live fetch blocked (CORS, offline, source down) — fall back to the
      // snapshot CI publishes alongside the app.
      try {
        const data = await loadPublishedDataset(currentSeason());
        const incoming = data.players.map(toAppPlayer);
        setPlayers((prev) => mergeValuesIntoPool(prev, incoming));
        setDataMeta({
          season: data.season,
          generated: data.generated,
          origin: "published values",
          count: incoming.length,
          notes: [`Live refresh unavailable (${e.message}) — used the published snapshot.`],
        });
        flashToast("Live sources unreachable; loaded the published snapshot.");
      } catch (inner) {
        setDataMeta((m) => ({ ...(m || {}), notes: [`Refresh failed: ${inner.message}`] }));
        flashToast(`Refresh failed: ${inner.message}`);
      }
    } finally {
      setRefreshing(false);
    }
  }, [flashToast]);

  const handleImport = useCallback(
    (rows, field) => {
      const result = applyImport(players, rows, field);
      setPlayers(result.players);
      flashToast(`Imported ${result.matched} values into "${field}".`);
      return result;
    },
    [players, flashToast]
  );

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
      const key = e.key.toLowerCase();
      if (e.key === "/") {
        e.preventDefault();
        quickRef.current?.focus();
      } else if (key === "h") {
        setHideDrafted((v) => !v);
      } else if (key === "f") {
        setFlexOn((v) => !v);
      } else if (key === "a") {
        setSelectedPos(new Set());
        setFlexOn(false);
      } else if (POS_KEYS[key]) {
        togglePos(POS_KEYS[key]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undoLastPick, togglePos]);

  if (!loaded) return <div style={styles.app}>loading…</div>;

  return (
    <div style={styles.app}>
      <GlobalStyle />

      <div style={styles.topFixed}>
      <div style={styles.headerTop}>
        <h1 style={styles.h1}>
          DRAFT BOARD
          <button style={styles.roomChip} onClick={onLeave} title="Switch room">
            {room}
          </button>
        </h1>
        <div style={styles.headerBtns}>
          <span style={styles.dataStatus}>
            <b style={{ color: C.bone }}>{dataMeta?.season ?? "—"} values</b>
            {dataMeta?.origin ? ` · ${dataMeta.origin}` : ""}
            {dataMeta?.generated ? ` · updated ${ago(dataMeta.generated)}` : ""}
            {dataMeta?.count ? ` · ${dataMeta.count} players` : ""}
          </span>
          <button style={ui.btn} onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw size={14} style={refreshing ? { animation: "spin 1s linear infinite" } : undefined} />
            {refreshing ? "refreshing…" : "Refresh values"}
          </button>
          <button
            style={{ ...ui.btn, ...(importOpen ? { borderColor: C.gold, color: C.gold } : {}) }}
            onClick={() => setImportOpen((o) => !o)}
          >
            <Download size={14} /> Import
          </button>
          <span style={styles.headerDivider} />
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
        <ScarcityChips
          live={live}
          myTeamId={myTeam?.id}
          fillCounts={fillCounts}
          roster={settings.roster}
          numTeams={settings.numTeams}
        />
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
          setScoring={(scoring) => setSettings((s) => ({ ...s, scoring }))}
          setPlatform={(p) => setSettings((s) => ({ ...s, platform: p }))}
          setBasisSource={(v) => setSettings((s) => ({ ...s, basisSource: v }))}
          setStarterShare={(v) =>
            setSettings((s) => ({ ...s, starterShare: Math.min(1, Math.max(0.5, v || 0.88)) }))}
        />
      )}

      <TeamStrip teams={teams} live={live} />

      <DataPanel
        meta={dataMeta}
        importOpen={importOpen}
        onImport={handleImport}
      />

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
      </div>

      <div style={styles.scrollArea}>
        <PlayerTable
          rows={visibleRows}
          teams={teams}
          myTeamId={myTeam?.id}
          draftInputs={draftInputs}
          setDraftInput={setDraftInput}
          onDraft={draftFromRow}
          onUndraft={undraftPlayer}
          maxBidFor={maxBidFor}
          onClearFilters={clearFilters}
          platform={platform}
          basisSource={basisSource}
          onSelectBasis={(v) => setSettings((s) => ({ ...s, basisSource: v }))}
        />
      </div>

      <div style={styles.footNote}>
        <Keyboard size={13} style={{ verticalAlign: "-2px", marginRight: 6, color: C.dim }} />
        <b style={{ color: C.bone }}>/</b> jump to quick entry · <b style={{ color: C.bone }}>↑↓</b> pick a
        candidate · <b style={{ color: C.bone }}>Enter</b> log it · <b style={{ color: C.bone }}>Ctrl+Z</b> undo ·{" "}
        <b style={{ color: C.bone }}>h</b> hide drafted · <b style={{ color: C.bone }}>q r w t k d</b> filter
        position · <b style={{ color: C.bone }}>f</b> flex · <b style={{ color: C.bone }}>a</b> all
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
      /* FP $ / JP $ / ETR $ column headers: the show/hide and use-as-basis
         icons stay out of the way until the header is actually hovered.
         Opacity lives entirely here, not inline on the element — an inline
         style always beats a class rule, which would make :hover a no-op. */
      .src-ctrls { opacity: 0; transition: opacity 0.12s ease; }
      .src-head:hover .src-ctrls { opacity: 1; }
      ::-webkit-scrollbar { height: 8px; width: 8px; }
      ::-webkit-scrollbar-thumb { background: #2a352d; border-radius: 4px; }
      @keyframes riseIn { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
      @keyframes spin { to { transform: rotate(360deg); } }
    `}</style>
  );
}

const styles = {
  // Fixed-height column: everything above the player list (topFixed) and the
  // shortcut footer stay put, only scrollArea scrolls. `minHeight: 0` on
  // scrollArea is required — a flex child otherwise refuses to shrink below
  // its content size, and the whole page scrolls instead of just the table.
  app: {
    fontFamily: F.body, background: C.bg, color: C.text, height: "100vh",
    padding: "18px 20px 12px", display: "flex", flexDirection: "column", overflow: "hidden",
  },
  topFixed: { flex: "0 0 auto" },
  scrollArea: { flex: "1 1 auto", minHeight: 0, overflowY: "auto", overflowX: "auto", marginBottom: 8 },
  headerTop: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  h1: {
    fontFamily: F.head, fontWeight: 700, fontSize: 26, letterSpacing: "0.03em",
    margin: 0, color: C.text, display: "flex", alignItems: "center", gap: 10,
  },
  roomChip: {
    fontFamily: F.mono, fontSize: 11.5, fontWeight: 600, letterSpacing: "0.04em",
    background: "rgba(216,166,61,0.12)", border: "1px solid", borderColor: C.gold,
    color: C.gold, borderRadius: 20, padding: "3px 11px", cursor: "pointer",
  },
  headerBtns: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  dataStatus: { fontSize: 11, color: C.dimmer, marginRight: 4 },
  headerDivider: { width: 1, alignSelf: "stretch", background: C.line, margin: "0 2px" },
  gaugeRow: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 },
  addRow: { ...ui.panel, display: "flex", gap: 8, alignItems: "center", padding: 10, marginBottom: 10 },
  addConfirm: { background: C.gold, color: C.bg, border: "none", borderRadius: 5, padding: "7px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer" },
  addCancel: { background: "none", border: "none", color: C.dim, cursor: "pointer", padding: 6 },
  footNote: { flex: "0 0 auto", fontSize: 11, color: C.dimmer, marginTop: 8, lineHeight: 1.5, maxWidth: 860 },
  toast: {
    position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)",
    background: C.panelHi, border: `1px solid ${C.gold}`, color: C.text,
    padding: "10px 18px", borderRadius: 8, fontSize: 13, zIndex: 90, cursor: "pointer",
    boxShadow: "0 10px 30px rgba(0,0,0,0.5)", animation: "riseIn .18s ease",
  },
};
