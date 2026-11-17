import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";

/* ==================================================================
   APPS BUILT ON THE F1 DATA CENTER
   Every number here is real: tools/export_f1_data.py reads the derived
   Parquet store that `f1dc ingest` writes from my own F1 23 recordings
   and exports public/data/f1/*.json. Re-run it after new sessions.

   - SessionLibrary: every recorded session with its context
   - RacePace:       lap times across a session, stints and lap detail
   - LapCompare:     two laps on the same circuit, aligned by distance
================================================================== */

const RAISED = "inset -1px -1px 0 #0a0a0a, inset 1px 1px 0 #fff, inset -2px -2px 0 #808080, inset 2px 2px 0 #dfdfdf";
const SUNKEN = "inset 1px 1px 0 #0a0a0a, inset -1px -1px 0 #fff, inset 2px 2px 0 #808080, inset -2px -2px 0 #dfdfdf";

const ui = {
  group: { border: "1px solid #808080", boxShadow: "1px 1px 0 #fff", padding: "10px 8px 8px", margin: "12px 0 8px", position: "relative", minWidth: 0 },
  legend: { position: "absolute", top: -8, left: 8, background: "#fff", padding: "0 4px", fontSize: 11, fontWeight: 700, color: "#000080" },
  btn: { fontSize: 11, padding: "3px 8px", background: "#c0c0c0", border: "none", cursor: "pointer", boxShadow: RAISED, color: "#000", fontFamily: "inherit" },
  btnDown: { boxShadow: SUNKEN, background: "#d4d4d4" },
  select: { fontSize: 11, fontFamily: "inherit", padding: 2, maxWidth: "100%", minWidth: 0 },
  label: { fontSize: 11, display: "flex", alignItems: "center", gap: 6 },
  small: { fontSize: 11, color: "#555" },
};

const COLOR_A = "#0047ab";
const COLOR_B = "#d2691e";
const TYRE_COLORS = { Soft: "#e10600", Medium: "#f2c500", Hard: "#9a9a9a", Intermediate: "#2e9e3e", Wet: "#1e6fd9" };
const tyreColor = (t) => TYRE_COLORS[t] || "#666";
const REASONS = {
  pit: "pit stop",
  in_lap: "in-lap",
  out_lap: "out-lap",
  first_lap: "standing start",
  incomplete: "incomplete",
  invalidated: "invalidated (track limits)",
  safety_car: "safety car",
};

/* ----------------------------- format ----------------------------- */
const fmtLap = (ms) => {
  if (ms == null) return "—";
  const m = Math.floor(ms / 60000);
  const s = (ms % 60000) / 1000;
  return `${m}:${s.toFixed(3).padStart(6, "0")}`;
};
const fmtSec = (ms) => (ms == null ? "—" : (ms / 1000).toFixed(3));
const fmtDelta = (ms) => (ms == null ? "—" : `${ms > 0 ? "+" : ms < 0 ? "−" : "±"}${Math.abs(ms / 1000).toFixed(3)}`);
const fmtDate = (d) => {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y.slice(2)}`;
};
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const stdev = (a) => {
  if (a.length < 2) return null;
  const mu = a.reduce((x, y) => x + y, 0) / a.length;
  return Math.sqrt(a.reduce((x, y) => x + (y - mu) ** 2, 0) / (a.length - 1));
};

/* ---------------------------- widgets ----------------------------- */
function Group({ title, children, style }) {
  return (
    <fieldset style={{ ...ui.group, ...style }}>
      <span style={ui.legend}>{title}</span>
      {children}
    </fieldset>
  );
}

function Btn({ active, onClick, children, sfx, style, title }) {
  return (
    <button title={title} onClick={() => { sfx && sfx.click(); onClick(); }} style={{ ...ui.btn, ...(active ? ui.btnDown : null), ...style }}>
      {children}
    </button>
  );
}

function Stat({ label, value, sub, color }) {
  return (
    <div style={{ padding: "4px 6px", boxShadow: SUNKEN, background: "#fff", minWidth: 84, flex: "1 1 84px" }}>
      <div style={{ fontSize: 10, color: "#555" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: color || "#000", fontFamily: "Tahoma, sans-serif" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#777" }}>{sub}</div>}
    </div>
  );
}

function TyreDot({ tyre, size = 10, hollow }) {
  return (
    <span
      title={tyre || "unknown"}
      style={{ display: "inline-block", width: size, height: size, borderRadius: "50%", border: `2px solid ${tyreColor(tyre)}`, background: hollow ? "#fff" : "#222", boxSizing: "border-box", verticalAlign: "middle", flexShrink: 0 }}
    />
  );
}

function Loading({ error }) {
  return (
    <div style={{ padding: 16, fontSize: 12, color: error ? "#a00000" : "#333" }}>
      {error ? `Couldn't load the telemetry data (${error}).` : "⏳ Loading telemetry…"}
    </div>
  );
}

/* ------------------------------ data ------------------------------ */
const cache = new Map();
function fetchJSON(url) {
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
    );
  }
  return cache.get(url);
}
function useJSON(url) {
  const [state, setState] = useState({ data: null, error: null });
  useEffect(() => {
    if (!url) return;
    let alive = true;
    setState({ data: null, error: null });
    fetchJSON(url).then(
      (data) => alive && setState({ data, error: null }),
      (e) => { cache.delete(url); alive && setState({ data: null, error: e.message }); }
    );
    return () => { alive = false; };
  }, [url]);
  return state;
}
const useSessions = () => {
  const { data, error } = useJSON("data/f1/sessions.json");
  return { sessions: data ? data.sessions : null, gridM: data ? data.gridM : 5, error };
};

// Tiny shared store so the apps can hand a session to each other
// ("open this session in Race Pace" from the library, etc.).
const store = { sel: { uid: null, lap: null, n: 0 }, listeners: new Set() };
function selectSession(uid, lap = null) {
  store.sel = { uid, lap, n: store.sel.n + 1 };
  store.listeners.forEach((fn) => fn(store.sel));
}
function useSelection() {
  const [sel, setSel] = useState(store.sel);
  useEffect(() => {
    store.listeners.add(setSel);
    return () => store.listeners.delete(setSel);
  }, []);
  return sel;
}
const useSelectedSession = () => useSelection().uid;

const sessionLabel = (s) => `${fmtDate(s.date)} · ${s.track} · ${s.type} (${s.laps.length} laps)`;

/* ------------------------------ chart ----------------------------- */
function niceStep(range, target) {
  const raw = range / Math.max(1, target);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag;
}
const tick = (v) => String(Math.round(v * 1000) / 1000);

function useWidth(min = 220) {
  const ref = useRef(null);
  const [w, setW] = useState(420);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(min, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [min]);
  return [ref, w];
}

const PAD = { L: 44, R: 8, T: 8, B: 26 };

/* Canvas chart with a shared hover cursor and drag-to-zoom.
   series: { x, y, color, width, dash, dots, hollow, radius, step } */
function Chart({
  series, xMin, xMax, yMin, yMax, height = 150, xLabel, yLabel, bands = [], vLines = [], hLines = [],
  cursorX, onHover, onPick, onZoom, onReset, xFmt = tick, yFmt = tick, title,
}) {
  const [wrapRef, w] = useWidth();
  const canvasRef = useRef(null);
  const drag = useRef(null);
  const [sel, setSel] = useState(null);
  const pw = w - PAD.L - PAD.R;
  const ph = height - PAD.T - PAD.B;
  const X = useCallback((x) => PAD.L + ((x - xMin) / (xMax - xMin || 1)) * pw, [xMin, xMax, pw]);
  const Y = useCallback((y) => PAD.T + (1 - (y - yMin) / (yMax - yMin || 1)) * ph, [yMin, yMax, ph]);
  const invX = (px) => xMin + ((px - PAD.L) / pw) * (xMax - xMin);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr;
    c.height = height * dpr;
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#fff";
    g.fillRect(0, 0, w, height);
    g.font = "10px Tahoma, sans-serif";

    bands.forEach((b) => {
      if (b.x1 < xMin || b.x0 > xMax) return;
      const x0 = Math.max(X(b.x0), PAD.L), x1 = Math.min(X(b.x1), PAD.L + pw);
      g.fillStyle = b.color;
      g.fillRect(x0, PAD.T, x1 - x0, ph);
      if (b.label && x1 - x0 > 30) {
        g.fillStyle = "#555";
        g.textAlign = "left";
        g.fillText(b.label, x0 + 3, PAD.T + 11);
      }
    });

    g.strokeStyle = "#e6e6e6";
    g.lineWidth = 1;
    g.fillStyle = "#333";
    const xs = niceStep(xMax - xMin, Math.max(3, Math.floor(pw / 70)));
    for (let x = Math.ceil(xMin / xs) * xs; x <= xMax + 1e-9; x += xs) {
      const px = Math.round(X(x)) + 0.5;
      g.beginPath(); g.moveTo(px, PAD.T); g.lineTo(px, PAD.T + ph); g.stroke();
      g.textAlign = "center"; g.fillText(xFmt(x), px, PAD.T + ph + 12);
    }
    const ys = niceStep(yMax - yMin, Math.max(2, Math.floor(ph / 28)));
    for (let y = Math.ceil(yMin / ys) * ys; y <= yMax + 1e-9; y += ys) {
      const py = Math.round(Y(y)) + 0.5;
      g.beginPath(); g.moveTo(PAD.L, py); g.lineTo(PAD.L + pw, py); g.stroke();
      g.textAlign = "right"; g.fillText(yFmt(y), PAD.L - 4, py + 3);
    }
    g.strokeStyle = "#808080";
    g.strokeRect(PAD.L + 0.5, PAD.T + 0.5, pw, ph);
    if (xLabel) { g.textAlign = "center"; g.fillText(xLabel, PAD.L + pw / 2, height - 2); }
    if (yLabel) { g.save(); g.translate(9, PAD.T + ph / 2); g.rotate(-Math.PI / 2); g.textAlign = "center"; g.fillText(yLabel, 0, 0); g.restore(); }

    g.save();
    g.beginPath(); g.rect(PAD.L, PAD.T, pw, ph); g.clip();
    vLines.forEach((v) => {
      g.strokeStyle = v.color || "#999"; g.setLineDash(v.dash || [3, 3]); g.lineWidth = 1;
      g.beginPath(); g.moveTo(X(v.x), PAD.T); g.lineTo(X(v.x), PAD.T + ph); g.stroke(); g.setLineDash([]);
      if (v.label) { g.fillStyle = v.color || "#777"; g.textAlign = "left"; g.fillText(v.label, X(v.x) + 3, PAD.T + ph - 4); }
    });
    hLines.forEach((h) => {
      g.strokeStyle = h.color; g.setLineDash(h.dash || [5, 4]); g.lineWidth = 1;
      g.beginPath(); g.moveTo(PAD.L, Y(h.y)); g.lineTo(PAD.L + pw, Y(h.y)); g.stroke(); g.setLineDash([]);
      if (h.label) { g.fillStyle = h.color; g.textAlign = "right"; g.fillText(h.label, PAD.L + pw - 4, Y(h.y) - 3); }
    });
    series.forEach((s) => {
      const n = s.y.length;
      if (s.dots) {
        for (let i = 0; i < n; i++) {
          if (s.y[i] == null) continue;
          const xv = s.x[i];
          if (xv < xMin || xv > xMax) continue;
          let yv = s.y[i], clipped = false;
          if (yv > yMax) { yv = yMax; clipped = true; }
          const px = X(xv), py = Y(yv) + (clipped ? 5 : 0);
          const col = Array.isArray(s.color) ? s.color[i] : s.color;
          const r = s.radius || 3.5;
          g.beginPath();
          if (clipped) { g.moveTo(px, py - 5); g.lineTo(px - 4, py + 2); g.lineTo(px + 4, py + 2); g.closePath(); }
          else g.arc(px, py, r, 0, Math.PI * 2);
          if (s.hollow && s.hollow[i]) { g.fillStyle = "#fff"; g.fill(); g.lineWidth = 1.5; g.strokeStyle = col; g.stroke(); }
          else { g.fillStyle = col; g.fill(); g.lineWidth = 1; g.strokeStyle = "#222"; g.stroke(); }
        }
        return;
      }
      g.strokeStyle = s.color; g.lineWidth = s.width || 1.3; g.setLineDash(s.dash || []);
      g.beginPath();
      let pen = false, lastY = null;
      for (let i = 0; i < n; i++) {
        const yv = s.y[i], xv = s.x[i];
        if (yv == null) { pen = false; continue; }
        if (xv < xMin - (xMax - xMin) * 0.02 || xv > xMax + (xMax - xMin) * 0.02) { pen = false; continue; }
        const px = X(xv), py = Y(yv);
        if (!pen) { g.moveTo(px, py); pen = true; }
        else if (s.step && lastY != null) { g.lineTo(px, Y(lastY)); g.lineTo(px, py); }
        else g.lineTo(px, py);
        lastY = yv;
      }
      g.stroke(); g.setLineDash([]);
    });
    if (cursorX != null && cursorX >= xMin && cursorX <= xMax) {
      g.strokeStyle = "#000"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(Math.round(X(cursorX)) + 0.5, PAD.T); g.lineTo(Math.round(X(cursorX)) + 0.5, PAD.T + ph); g.stroke();
    }
    if (sel) {
      g.fillStyle = "rgba(0,0,128,0.15)";
      g.fillRect(Math.min(sel[0], sel[1]), PAD.T, Math.abs(sel[1] - sel[0]), ph);
    }
    g.restore();
    if (title) { g.fillStyle = "#000080"; g.font = "bold 10px Tahoma, sans-serif"; g.textAlign = "left"; g.fillText(title, PAD.L + 4, PAD.T + 11); }
  }, [w, height, series, xMin, xMax, yMin, yMax, bands, vLines, hLines, cursorX, sel, X, Y, pw, ph, xLabel, yLabel, xFmt, yFmt, title]);

  const localX = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return Math.min(PAD.L + pw, Math.max(PAD.L, e.clientX - r.left));
  };

  return (
    <div ref={wrapRef} style={{ width: "100%", boxShadow: SUNKEN, padding: 2, background: "#fff", boxSizing: "border-box", marginBottom: 4 }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height, display: "block", cursor: onZoom ? "crosshair" : "default", touchAction: onZoom ? "none" : "auto" }}
        onPointerMove={(e) => {
          const px = localX(e);
          if (drag.current != null) setSel([drag.current, px]);
          onHover && onHover(invX(px), e);
        }}
        onPointerLeave={() => { onHover && onHover(null); }}
        onPointerDown={(e) => { if (onZoom) { drag.current = localX(e); e.currentTarget.setPointerCapture(e.pointerId); } }}
        onPointerUp={(e) => {
          if (drag.current != null) {
            const a = drag.current, b = localX(e);
            drag.current = null;
            setSel(null);
            if (Math.abs(b - a) > 8) onZoom(invX(Math.min(a, b)), invX(Math.max(a, b)));
          }
        }}
        onClick={(e) => onPick && onPick(invX(localX(e)))}
        onDoubleClick={() => onReset && onReset()}
      />
    </div>
  );
}

/* ==================================================================
   1) SESSION LIBRARY
================================================================== */
export function SessionLibrary({ sfx, onOpen }) {
  const { sessions, error } = useSessions();
  const selected = useSelectedSession();
  const [track, setTrack] = useState("all");
  const [sort, setSort] = useState({ key: "date", dir: -1 });

  if (!sessions) return <Loading error={error} />;

  const tracks = [...new Set(sessions.map((s) => s.track))].sort();
  const totals = {
    laps: sessions.reduce((a, s) => a + s.laps.length, 0),
    km: sessions.reduce((a, s) => a + s.laps.length * s.lengthM, 0) / 1000,
    hours: sessions.reduce((a, s) => a + s.durationS, 0) / 3600,
    gb: sessions.reduce((a, s) => a + (s.rawBytes || 0), 0) / 1e9,
    packets: sessions.reduce((a, s) => a + (s.packets || 0), 0),
    loss: Math.max(...sessions.map((s) => s.lossPct || 0)),
  };

  const cols = [
    { key: "date", label: "Date", get: (s) => s.date, show: (s) => fmtDate(s.date) },
    { key: "track", label: "Circuit", get: (s) => s.track, show: (s) => s.track },
    { key: "type", label: "Type", get: (s) => s.type, show: (s) => s.type },
    { key: "laps", label: "Laps", get: (s) => s.laps.length, show: (s) => `${s.laps.length}${s.totalLaps > s.laps.length ? `/${s.totalLaps}` : ""}` },
    { key: "best", label: "Best lap", get: (s) => s.bestMs || 1e12, show: (s) => fmtLap(s.bestMs) },
    { key: "pos", label: "Pos", get: (s) => s.finish || 99, show: (s) => (s.finish ? `P${s.finish}` : "—") },
    { key: "cond", label: "Conditions", get: (s) => s.weather, show: (s) => `${s.weather}, ${s.trackC}°C` },
    { key: "assists", label: "Assists", get: (s) => s.assists, show: (s) => s.assists },
  ];
  const col = cols.find((c) => c.key === sort.key);
  const rows = sessions
    .filter((s) => track === "all" || s.track === track)
    .sort((a, b) => {
      const va = col.get(a), vb = col.get(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
  const sel = sessions.find((s) => s.uid === selected);

  // personal best per circuit, with the context that makes it comparable
  const pbs = tracks.map((t) => {
    const withBest = sessions.filter((s) => s.track === t && s.bestMs);
    const best = withBest.sort((a, b) => a.bestMs - b.bestMs)[0];
    return { track: t, best, n: sessions.filter((s) => s.track === t).length };
  });

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <Stat label="Sessions" value={sessions.length} />
        <Stat label="Laps" value={totals.laps} />
        <Stat label="Distance" value={`${Math.round(totals.km).toLocaleString("en-US")} km`} />
        <Stat label="On track" value={`${totals.hours.toFixed(1)} h`} />
        <Stat label="Raw capture" value={`${totals.gb.toFixed(1)} GB`} sub={`${(totals.packets / 1e6).toFixed(1)} M packets`} />
        <Stat label="Worst loss" value={`${totals.loss.toFixed(2)} %`} color="#006400" />
      </div>

      <Group title="Sessions">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
          <label style={ui.label}>
            Circuit
            <select style={ui.select} value={track} onChange={(e) => setTrack(e.target.value)}>
              <option value="all">All circuits</option>
              {tracks.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <span style={ui.small}>Click a header to sort, a row to select.</span>
        </div>
        <div style={{ overflow: "auto", maxHeight: 260, boxShadow: SUNKEN, padding: 2 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
            <thead>
              <tr>
                {cols.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => { sfx && sfx.click(); setSort((s) => ({ key: c.key, dir: s.key === c.key ? -s.dir : 1 })); }}
                    style={{ position: "sticky", top: 0, textAlign: "left", padding: "3px 6px", background: "#c0c0c0", boxShadow: RAISED, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    {c.label} {sort.key === c.key ? (sort.dir > 0 ? "▲" : "▼") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((s, j) => {
                const on = s.uid === selected;
                return (
                  <tr
                    key={s.uid}
                    onClick={() => { sfx && sfx.click(); selectSession(s.uid); }}
                    onDoubleClick={() => { selectSession(s.uid); onOpen && onOpen("f1-pace"); }}
                    style={{ background: on ? "#000080" : j % 2 ? "#f3f3f3" : "#fff", color: on ? "#fff" : "#000", cursor: "pointer" }}
                  >
                    {cols.map((c) => (
                      <td key={c.key} style={{ padding: "3px 6px", whiteSpace: "nowrap", fontFamily: c.key === "best" ? "monospace" : "inherit" }}>{c.show(s)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {sel ? (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 8 }}>
            <b style={{ fontSize: 11 }}>{sessionLabel(sel)}</b>
            <Btn sfx={sfx} onClick={() => onOpen && onOpen("f1-pace")}>📈 Race Pace ▸</Btn>
            {sel.traceLaps.length > 0 && <Btn sfx={sfx} onClick={() => onOpen && onOpen("f1-compare")}>⏱️ Compare laps ▸</Btn>}
          </div>
        ) : (
          <div style={{ ...ui.small, marginTop: 6 }}>Select a session to open it in Race Pace or Lap Compare (double-click opens Race Pace).</div>
        )}
      </Group>

      <Group title="Personal best per circuit">
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
          <tbody>
            {pbs.map(({ track: t, best, n }, j) => (
              <tr key={t} style={{ background: j % 2 ? "#f3f3f3" : "#fff" }}>
                <td style={{ padding: "2px 6px", fontWeight: 700 }}>{t}</td>
                <td style={{ padding: "2px 6px", fontFamily: "monospace" }}>{best ? fmtLap(best.bestMs) : "—"}</td>
                <td style={{ padding: "2px 6px", color: "#555" }}>
                  {best ? `${best.type}, ${best.weather}, ${best.assists}` : "no counting lap"}
                </td>
                <td style={{ padding: "2px 6px", color: "#555", textAlign: "right" }}>{n} session{n > 1 ? "s" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ ...ui.small, marginTop: 6 }}>
          A best lap is only shown with its context. A 1:11 with traction control isn't the same as a 1:11 without it.
        </div>
      </Group>
    </div>
  );
}

/* ==================================================================
   2) RACE PACE
================================================================== */
const PACE_METRICS = [
  { key: "wear", label: "Tyre wear", unit: "%", get: (l) => l.wear },
  { key: "fuel", label: "Fuel at lap start", unit: "kg", get: (l) => l.fuel },
  { key: "pos", label: "Position", unit: "P", get: (l) => l.pos, invert: true },
  { key: "tyreTemp", label: "Tyre surface temp", unit: "°C", get: (l) => l.tyreTemp },
  { key: "ers", label: "ERS deployed", unit: "MJ", get: (l) => l.ersDep },
];

function defaultSession(sessions) {
  return [...sessions].sort((a, b) => b.counting - a.counting)[0];
}

export function RacePace({ sfx, onOpen }) {
  const { sessions, error } = useSessions();
  const selected = useSelectedSession();
  const [hover, setHover] = useState(null);
  const [pinned, setPinned] = useState(null);
  const [metric, setMetric] = useState("wear");
  const [avg, setAvg] = useState(true);

  const session = useMemo(() => {
    if (!sessions) return null;
    return sessions.find((s) => s.uid === selected) || defaultSession(sessions);
  }, [sessions, selected]);

  useEffect(() => { setPinned(null); setHover(null); }, [session && session.uid]);

  const derived = useMemo(() => {
    if (!session) return null;
    const laps = session.laps.filter((l) => l.t);
    const counting = laps.filter((l) => l.counts).map((l) => l.t);
    const best = counting.length ? Math.min(...counting) : Math.min(...laps.map((l) => l.t));
    const worstCounting = counting.length ? Math.max(...counting) : best * 1.05;
    const yMin = Math.floor((best / 1000) * 0.995);
    const yMax = Math.ceil(Math.min(worstCounting * 1.01, best * 1.15) / 1000 + 0.5);
    // centred 5-lap moving average over counting laps only
    const ma = laps.map((l, i) => {
      if (!l.counts) return null;
      const win = laps.slice(Math.max(0, i - 2), i + 3).filter((x) => x.counts && x.stint === l.stint);
      return win.length >= 3 ? win.reduce((a, x) => a + x.t, 0) / win.length / 1000 : null;
    });
    return { laps, counting, best, yMin, yMax, ma };
  }, [session]);

  if (!sessions) return <Loading error={error} />;
  const { laps, counting, best, yMin, yMax, ma } = derived;
  const xs = laps.map((l) => l.n);
  const xMin = 0.5, xMax = Math.max(...xs) + 0.5;

  const bands = session.stints.map((st, i) => ({
    x0: st.from - 0.5, x1: st.to + 0.5,
    color: i % 2 ? "rgba(0,0,0,0.035)" : "rgba(0,0,128,0.04)",
    label: `${st.tyre} ${st.compound}`,
  }));
  const pitLines = session.stints.slice(1).map((st) => ({ x: st.from - 0.5, color: "#999", label: "pit" }));

  const nearest = (x) => {
    if (x == null) return null;
    let bi = null, bd = Infinity;
    laps.forEach((l) => { const d = Math.abs(l.n - x); if (d < bd) { bd = d; bi = l.n; } });
    return bd <= 0.6 ? bi : null;
  };
  const shownN = hover != null ? hover : pinned;
  const lap = laps.find((l) => l.n === shownN);
  const m = PACE_METRICS.find((p) => p.key === metric);
  const mVals = laps.map((l) => m.get(l));
  const mDef = mVals.filter((v) => v != null);
  const mMin = mDef.length ? Math.min(...mDef) : 0, mMax = mDef.length ? Math.max(...mDef) : 1;
  const mPad = (mMax - mMin) * 0.1 || 1;

  const sd = stdev(counting);
  const vsGrid = session.gridBestMs && session.bestMs ? session.bestMs - session.gridBestMs : null;

  return (
    <div style={{ fontSize: 12 }}>
      <label style={{ ...ui.label, marginBottom: 6 }}>
        Session
        <select style={{ ...ui.select, flex: 1 }} value={session.uid} onChange={(e) => { sfx && sfx.click(); selectSession(e.target.value); }}>
          {[...sessions].reverse().map((s) => <option key={s.uid} value={s.uid}>{sessionLabel(s)}</option>)}
        </select>
      </label>
      <div style={{ ...ui.small, marginBottom: 8 }}>
        {session.weather}, air {session.airC}°C / track {session.trackC}°C · AI {session.ai} · {session.assists}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <Stat label="Best lap" value={fmtLap(session.bestMs)} sub={session.bestLap ? `lap ${session.bestLap}` : "no counting lap"} color="#6a0dad" />
        <Stat label="Median (counting)" value={fmtLap(median(counting))} sub={`${counting.length} of ${laps.length} laps count`} />
        <Stat label="Consistency σ" value={sd ? `${(sd / 1000).toFixed(2)} s` : "—"} sub="std. dev. of counting laps" />
        <Stat label="vs. AI's best" value={vsGrid != null ? `${fmtDelta(vsGrid)} s` : "—"} sub={session.gridBestMs ? fmtLap(session.gridBestMs) : null} color={vsGrid != null ? (vsGrid <= 0 ? "#006400" : "#a00000") : undefined} />
        <Stat label="Finished" value={session.finish ? `P${session.finish}` : "—"} sub={session.category === "race" ? "position at the last line" : session.type} />
      </div>

      <Group title="Lap times">
        <Chart
          onPick={(x) => setPinned(nearest(x))}
          height={210}
          xMin={xMin} xMax={xMax} yMin={yMin} yMax={yMax}
          xLabel="Lap" yLabel="Lap time [s]"
          xFmt={(v) => (Number.isInteger(v) ? String(v) : "")}
          yFmt={(v) => fmtLap(v * 1000).replace(/\.\d+$/, "")}
          bands={bands}
          vLines={pitLines}
          hLines={session.gridBestMs ? [{ y: session.gridBestMs / 1000, color: "#6a0dad", label: "AI best" }] : []}
          cursorX={shownN}
          onHover={(x) => setHover(nearest(x))}
          series={[
            ...(avg ? [{ x: xs, y: ma, color: "#000080", width: 1.5 }] : []),
            {
              x: xs, y: laps.map((l) => l.t / 1000), dots: true,
              color: laps.map((l) => tyreColor(l.tyre)), hollow: laps.map((l) => !l.counts),
            },
          ]}
        />
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px", fontSize: 11 }}>
          {[...new Set(laps.map((l) => l.tyre).filter(Boolean))].map((t) => (
            <span key={t} style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: tyreColor(t), border: "1px solid #222" }} />{t}</span>
          ))}
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: "50%", border: "1.5px solid #666" }} />doesn't count</span>
          <span>▲ off the scale</span>
          <label style={{ ...ui.label, marginLeft: "auto" }}>
            <input type="checkbox" checked={avg} onChange={(e) => setAvg(e.target.checked)} /> 5-lap average
          </label>
        </div>
        <div style={{ ...ui.small, marginTop: 4 }}>Point at a lap for its details. Click the chart to pin it.</div>
      </Group>

      <LapCard lap={lap} session={session} best={best} onCompare={() => { selectSession(session.uid, lap.n); onOpen && onOpen("f1-compare"); }} sfx={sfx} />

      <Group title="Through the session">
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
          {PACE_METRICS.map((p) => (
            <Btn key={p.key} sfx={sfx} active={metric === p.key} onClick={() => setMetric(p.key)}>{p.label}</Btn>
          ))}
        </div>
        <div>
          <Chart
            onPick={(x) => setPinned(nearest(x))}
            height={130}
            xMin={xMin} xMax={xMax}
            yMin={m.invert ? mMax + 0.5 : mMin - mPad} yMax={m.invert ? mMin - 0.5 : mMax + mPad}
            xLabel="Lap" yLabel={`${m.label} [${m.unit}]`}
            xFmt={(v) => (Number.isInteger(v) ? String(v) : "")}
            yFmt={(v) => (m.invert ? `P${Math.round(v)}` : tick(Math.round(v * 10) / 10))}
            bands={bands.map((b) => ({ ...b, label: null }))}
            vLines={pitLines}
            cursorX={shownN}
            onHover={(x) => setHover(nearest(x))}
            series={[{ x: xs, y: mVals, color: "#000080", width: 1.5, step: m.key === "pos" }]}
          />
        </div>
      </Group>
    </div>
  );
}

function LapCard({ lap, session, best, onCompare, sfx }) {
  if (!lap) {
    return (
      <div style={{ padding: 8, boxShadow: SUNKEN, background: "#ffffe1", fontSize: 11, color: "#555", margin: "8px 0" }}>
        Point at a lap in the chart to see its sectors, tyres, fuel and why it does or doesn't count.
      </div>
    );
  }
  const bestLap = session.laps.find((l) => l.n === session.bestLap);
  const rows = [
    ["Tyre", <span key="t" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><TyreDot tyre={lap.tyre} /> {lap.tyre || "?"}, {lap.age} lap{lap.age === 1 ? "" : "s"} old</span>],
    ["Tyre wear", lap.wear != null ? `${lap.wear} %` : "—"],
    ["Fuel at start", lap.fuel != null ? `${lap.fuel} kg${lap.fuelUsed != null ? ` (used ${lap.fuelUsed} kg)` : ""}` : "—"],
    ["ERS", lap.ersDep != null ? `${lap.ersDep} MJ out, ${lap.ersHarv} MJ in` : "—"],
    ["Position", lap.pos ? `P${lap.pos}` : "—"],
    ["Brakes / tyres", lap.brakeMax != null ? `${lap.brakeMax} °C max · ${lap.tyreTemp} °C tyre surface` : "—"],
  ];
  return (
    <div style={{ padding: 8, boxShadow: SUNKEN, background: "#fff", margin: "8px 0", fontSize: 11 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
        <b style={{ fontSize: 13 }}>Lap {lap.n}</b>
        <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: lap.n === session.bestLap ? "#6a0dad" : "#000" }}>{fmtLap(lap.t)}</span>
        {lap.counts ? (
          <span style={{ color: "#555" }}>{fmtDelta(lap.t - best)} s to best</span>
        ) : (
          <span style={{ background: "#ffe4e1", padding: "0 5px", border: "1px solid #c99" }}>doesn't count: {REASONS[lap.why] || lap.why}</span>
        )}
        {lap.sc && <span style={{ background: "#fff3b0", padding: "0 5px", border: "1px solid #cc9" }}>safety car</span>}
        {session.traceLaps.includes(lap.n) ? (
          <Btn sfx={sfx} style={{ marginLeft: "auto" }} onClick={onCompare}>⏱️ Compare ▸</Btn>
        ) : session.traceLaps.length > 0 && (
          <span style={{ marginLeft: "auto", color: "#777" }}>Traces on this site: laps {session.traceLaps.join(", ")}</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        {lap.s.map((sv, i) => {
          const d = bestLap && sv != null && bestLap.s[i] != null ? sv - bestLap.s[i] : null;
          return (
            <div key={i} style={{ flex: 1, padding: "2px 6px", background: "#f3f3f3", border: "1px solid #ccc" }}>
              <div style={{ fontSize: 10, color: "#555" }}>Sector {i + 1}</div>
              <div style={{ fontFamily: "monospace" }}>{fmtSec(sv)}</div>
              {d != null && lap.n !== session.bestLap && <div style={{ fontSize: 10, color: d > 0 ? "#a00000" : "#006400" }}>{fmtDelta(d)}</div>}
            </div>
          );
        })}
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td style={{ padding: "1px 6px 1px 0", color: "#555", whiteSpace: "nowrap", width: 1 }}>{k}</td>
              <td style={{ padding: "1px 0" }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ==================================================================
   3) LAP COMPARE
================================================================== */
const MAP_MODES = [
  { key: "delta", label: "Who's faster" },
  { key: "speed", label: "Speed" },
  { key: "throttle", label: "Throttle" },
  { key: "brake", label: "Brake" },
  { key: "gear", label: "Gear" },
];

function heat(t) {
  // blue -> cyan -> green -> yellow -> red
  const c = Math.min(1, Math.max(0, t));
  const stops = [[0, [40, 60, 200]], [0.25, [0, 170, 210]], [0.5, [40, 180, 60]], [0.75, [240, 200, 0]], [1, [220, 30, 20]]];
  for (let i = 1; i < stops.length; i++) {
    if (c <= stops[i][0]) {
      const [a, ca] = stops[i - 1], [b, cb] = stops[i];
      const k = (c - a) / (b - a);
      return `rgb(${ca.map((v, j) => Math.round(v + (cb[j] - v) * k)).join(",")})`;
    }
  }
  return "rgb(220,30,20)";
}

function TrackMap({ A, B, mode, cursorI, sectorsM, gridM, height = 260 }) {
  const [wrapRef, w] = useWidth(200);
  const canvasRef = useRef(null);
  const geo = useMemo(() => {
    const src = A.x.some((v) => v != null) ? A : B;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    src.x.forEach((x, i) => {
      const z = src.z[i];
      if (x == null || z == null) return;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    });
    return { src, minX, maxX, minZ, maxZ };
  }, [A, B]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr; c.height = height * dpr;
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, height);
    const { src, minX, maxX, minZ, maxZ } = geo;
    if (!Number.isFinite(minX)) return;
    const P = 16;
    const s = Math.min((w - 2 * P) / (maxX - minX || 1), (height - 2 * P) / (maxZ - minZ || 1));
    const ox = (w - (maxX - minX) * s) / 2, oy = (height - (maxZ - minZ) * s) / 2;
    const pt = (i) => (src.x[i] == null || src.z[i] == null ? null : [ox + (src.x[i] - minX) * s, oy + (maxZ - src.z[i]) * s]);

    // outline
    g.lineCap = "round"; g.lineJoin = "round";
    g.strokeStyle = "#d8d8d8"; g.lineWidth = 9;
    g.beginPath();
    let pen = false;
    for (let i = 0; i < src.x.length; i++) { const p = pt(i); if (!p) { pen = false; continue; } if (!pen) { g.moveTo(...p); pen = true; } else g.lineTo(...p); }
    g.stroke();

    // coloured line
    const n = Math.min(A.speed_kph.length, B.speed_kph.length);
    let lo = 0, hi = 1;
    if (mode === "speed") {
      const v = A.speed_kph.filter((x) => x != null);
      lo = Math.min(...v); hi = Math.max(...v);
    } else if (mode === "gear") { lo = 1; hi = 8; }
    const W = 30; // metres either side for the "who's faster" slope
    g.lineWidth = 5;
    for (let i = 1; i < src.x.length; i++) {
      const p0 = pt(i - 1), p1 = pt(i);
      if (!p0 || !p1) continue;
      let col;
      if (mode === "delta") {
        const k = Math.max(1, Math.round(W / gridM));
        const a0 = Math.max(0, i - k), a1 = Math.min(n - 1, i + k);
        if (i >= n || A.time_ms[a0] == null || A.time_ms[a1] == null || B.time_ms[a0] == null || B.time_ms[a1] == null) col = "#bbb";
        else {
          const dA = A.time_ms[a1] - A.time_ms[a0], dB = B.time_ms[a1] - B.time_ms[a0];
          const diff = dB - dA; // >0: A faster here
          col = Math.abs(diff) < 4 ? "#999" : diff > 0 ? COLOR_A : COLOR_B;
        }
      } else {
        const key = mode === "speed" ? "speed_kph" : mode;
        const v = A[key][i];
        col = v == null ? "#bbb" : heat((v - lo) / (hi - lo || 1));
      }
      g.strokeStyle = col;
      g.beginPath(); g.moveTo(...p0); g.lineTo(...p1); g.stroke();
    }

    // start/finish + sectors
    const mark = (i, label) => {
      const p = pt(Math.min(i, src.x.length - 1));
      if (!p) return;
      g.fillStyle = "#000"; g.beginPath(); g.arc(p[0], p[1], 3, 0, Math.PI * 2); g.fill();
      g.font = "bold 10px Tahoma, sans-serif"; g.textAlign = "left";
      g.lineWidth = 3; g.strokeStyle = "#fff"; g.strokeText(label, p[0] + 6, p[1] - 4);
      g.fillText(label, p[0] + 6, p[1] - 4);
    };
    let first = src.x.findIndex((v) => v != null);
    mark(Math.max(0, first), "S/F");
    sectorsM.forEach((m, k) => mark(Math.round(m / gridM), `S${k + 2}`));

    if (cursorI != null) {
      const p = pt(Math.min(cursorI, src.x.length - 1));
      if (p) {
        g.beginPath(); g.arc(p[0], p[1], 7, 0, Math.PI * 2);
        g.fillStyle = "#000"; g.fill(); g.lineWidth = 3; g.strokeStyle = "#fff"; g.stroke();
      }
    }
  }, [w, height, geo, A, B, mode, cursorI, sectorsM, gridM]);

  return (
    <div ref={wrapRef} style={{ boxShadow: SUNKEN, padding: 2, background: "#fff" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height, display: "block" }} />
    </div>
  );
}

function GGDiagram({ A, B, range, gridM, height = 200 }) {
  const [wrapRef, w] = useWidth(160);
  const canvasRef = useRef(null);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const size = Math.min(w, height);
    c.width = w * dpr; c.height = height * dpr;
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, height);
    const cx = w / 2, cy = height / 2, R = size / 2 - 14, G = 5;
    const sc = R / G;
    g.strokeStyle = "#e3e3e3"; g.fillStyle = "#777"; g.font = "9px Tahoma, sans-serif"; g.textAlign = "left";
    for (let r = 1; r <= G; r++) { g.beginPath(); g.arc(cx, cy, r * sc, 0, Math.PI * 2); g.stroke(); if (r % 2 === 1) g.fillText(`${r}g`, cx + r * sc * 0.71 + 2, cy - r * sc * 0.71); }
    g.strokeStyle = "#bbb"; g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
    g.fillStyle = "#555"; g.textAlign = "center";
    g.fillText("braking", cx, cy + R + 11); g.fillText("accel.", cx, cy - R - 3);
    const i0 = Math.max(0, Math.floor(range[0] / gridM)), i1 = Math.ceil(range[1] / gridM);
    [[B, COLOR_B], [A, COLOR_A]].forEach(([L, col]) => {
      g.fillStyle = col; g.globalAlpha = 0.35;
      for (let i = i0; i < Math.min(i1, L.g_lat.length); i++) {
        const gl = L.g_lat[i], gn = L.g_lon[i];
        if (gl == null || gn == null) continue;
        g.fillRect(cx + gl * sc - 1, cy - gn * sc - 1, 2.2, 2.2);
      }
      g.globalAlpha = 1;
    });
  }, [w, height, A, B, range, gridM]);
  return (
    <div ref={wrapRef} style={{ boxShadow: SUNKEN, padding: 2, background: "#fff" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height, display: "block" }} />
    </div>
  );
}

const lapKey = (t) => `${t.uid}:${t.lap}`;

export function LapCompare({ sfx }) {
  const { sessions, gridM, error } = useSessions();
  const selection = useSelection();
  const selected = selection.uid;
  const tracks = useMemo(() => {
    if (!sessions) return [];
    const by = {};
    sessions.forEach((s) => { if (s.traceLaps.length) (by[s.trackSlug] = by[s.trackSlug] || { slug: s.trackSlug, name: s.track, n: 0 }).n += s.traceLaps.length; });
    return Object.values(by).sort((a, b) => a.name.localeCompare(b.name));
  }, [sessions]);

  const selSession = sessions && sessions.find((s) => s.uid === selected && s.traceLaps.length);
  const [slug, setSlug] = useState(null);
  useEffect(() => { if (selSession) setSlug(selSession.trackSlug); }, [selSession && selSession.uid]);
  const activeSlug = slug || (tracks.find((t) => t.slug === "interlagos") || tracks[0] || {}).slug;
  const { data: traces, error: tErr } = useJSON(activeSlug ? `data/f1/traces/${activeSlug}.json` : null);

  const [keyA, setKeyA] = useState(null);
  const [keyB, setKeyB] = useState(null);
  const [range, setRange] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [mapMode, setMapMode] = useState("delta");

  const options = useMemo(() => {
    if (!traces || !sessions) return [];
    return traces
      .map((t) => {
        const s = sessions.find((x) => x.uid === t.uid);
        const l = s && s.laps.find((x) => x.n === t.lap);
        if (!s || !l) return null;
        return { key: lapKey(t), trace: t, session: s, lap: l };
      })
      .filter(Boolean)
      .sort((a, b) => a.lap.t - b.lap.t);
  }, [traces, sessions]);

  // pick sensible defaults whenever the circuit (or handed-over session) changes
  // (options are sorted fastest first)
  useEffect(() => {
    if (!options.length) return;
    const fromSel = selSession && selSession.trackSlug === activeSlug ? options.filter((o) => o.session.uid === selSession.uid) : [];
    const a = fromSel[0] || options[0];
    const asked = fromSel.find((o) => o.lap.n === selection.lap && o.key !== a.key);
    const b =
      asked ||
      (fromSel.length > 1 ? fromSel[fromSel.length - 1] : null) ||
      options.find((o) => o.session.uid !== a.session.uid) ||
      options.find((o) => o.key !== a.key) ||
      a;
    setKeyA(a.key);
    setKeyB(b.key);
    setRange(null);
    setCursor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, selection.n]);

  if (!sessions) return <Loading error={error} />;
  if (tErr) return <Loading error={tErr} />;
  const oA = options.find((o) => o.key === keyA);
  const oB = options.find((o) => o.key === keyB);
  if (!traces || !oA || !oB) return <Loading />;

  return (
    <CompareView
      sfx={sfx} gridM={gridM} tracks={tracks} slug={activeSlug}
      onTrack={(s) => { sfx && sfx.click(); setSlug(s); }}
      options={options} oA={oA} oB={oB}
      setKeyA={(k) => { setKeyA(k); }} setKeyB={(k) => { setKeyB(k); }}
      range={range} setRange={setRange} cursor={cursor} setCursor={setCursor}
      mapMode={mapMode} setMapMode={setMapMode}
    />
  );
}

function CompareView({ sfx, gridM, tracks, slug, onTrack, options, oA, oB, setKeyA, setKeyB, range, setRange, cursor, setCursor, mapMode, setMapMode }) {
  const A = oA.trace, B = oB.trace;
  const length = oA.session.lengthM;
  const n = Math.min(A.time_ms.length, B.time_ms.length);
  const dist = useMemo(() => Array.from({ length: Math.max(A.time_ms.length, B.time_ms.length) }, (_, i) => i * gridM), [A, B, gridM]);
  const gap = useMemo(() => {
    const out = new Array(n).fill(null);
    for (let i = 0; i < n; i++) if (A.time_ms[i] != null && B.time_ms[i] != null) out[i] = (B.time_ms[i] - A.time_ms[i]) / 1000;
    return out;
  }, [A, B, n]);
  const [x0, x1] = range || [0, (dist.length - 1) * gridM];
  const i0 = Math.max(0, Math.floor(x0 / gridM)), i1 = Math.min(n - 1, Math.ceil(x1 / gridM));
  const ext = (arrs) => {
    let lo = Infinity, hi = -Infinity;
    arrs.forEach((a) => { for (let i = i0; i <= i1 && i < a.length; i++) { const v = a[i]; if (v == null) continue; if (v < lo) lo = v; if (v > hi) hi = v; } });
    return Number.isFinite(lo) ? [lo, hi] : [0, 1];
  };
  const [gLo, gHi] = ext([gap]);
  const gPad = Math.max(0.05, (gHi - gLo) * 0.12);
  const [sLo, sHi] = ext([A.speed_kph, B.speed_kph]);
  const ci = cursor != null ? Math.round(cursor / gridM) : null;
  const sectorsM = oA.session.sectorsM || [];
  const vLines = sectorsM.map((m, k) => ({ x: m, label: `S${k + 2}` }));
  const common = {
    xMin: x0, xMax: x1, cursorX: cursor, vLines,
    onHover: (x) => setCursor(x == null ? null : Math.round(x / gridM) * gridM),
    onZoom: (a, b) => { sfx && sfx.click(); setRange([Math.max(0, a), b]); },
    onReset: () => setRange(null),
    xFmt: (v) => `${Math.round(v)}`,
  };
  const val = (arr, digits = 0, mul = 1) => (ci != null && arr[ci] != null ? (arr[ci] * mul).toFixed(digits) : "—");

  // context, side by side; highlight what changes lap time
  const ctx = (o) => ({
    Session: `${o.session.type}, ${fmtDate(o.session.date)}`,
    Lap: `${o.lap.n} of ${o.session.laps.length}`,
    Assists: o.session.assists,
    Tyre: `${o.lap.tyre || "?"}, ${o.lap.age} lap${o.lap.age === 1 ? "" : "s"} old`,
    "Fuel at start": o.lap.fuel != null ? `${o.lap.fuel} kg` : "—",
    Weather: o.session.weather,
    "Track temp": `${o.session.trackC} °C`,
    "AI difficulty": o.session.ai,
  });
  const cA = ctx(oA), cB = ctx(oB);
  const differs = (k) => {
    if (k === "Session" || k === "Lap") return false;
    if (k === "Fuel at start") return oA.lap.fuel != null && oB.lap.fuel != null && Math.abs(oA.lap.fuel - oB.lap.fuel) > 1;
    return cA[k] !== cB[k];
  };
  const nDiff = Object.keys(cA).filter(differs).length;
  const total = oB.lap.t - oA.lap.t;

  const lapSelect = (value, onChange, color) => (
    <select style={{ ...ui.select, flex: 1, borderLeft: `6px solid ${color}` }} value={value} onChange={(e) => { sfx && sfx.click(); onChange(e.target.value); }}>
      {options.map((o) => (
        <option key={o.key} value={o.key}>
          {fmtLap(o.lap.t)} · {fmtDate(o.session.date)} {o.session.type} · lap {o.lap.n} · {o.lap.tyre || "?"} {o.lap.age}L{o.session.bestLap === o.lap.n ? " ★" : ""}
        </option>
      ))}
    </select>
  );

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
        {tracks.map((t) => (
          <Btn key={t.slug} sfx={null} active={t.slug === slug} onClick={() => onTrack(t.slug)}>{t.name}</Btn>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 6px", alignItems: "center" }}>
        <b style={{ color: COLOR_A, fontSize: 11 }}>Lap A</b>{lapSelect(oA.key, setKeyA, COLOR_A)}
        <b style={{ color: COLOR_B, fontSize: 11 }}>Lap B</b>{lapSelect(oB.key, setKeyB, COLOR_B)}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        <Stat label="Lap A" value={fmtLap(oA.lap.t)} color={COLOR_A} />
        <Stat label="Lap B" value={fmtLap(oB.lap.t)} color={COLOR_B} />
        <Stat label="B vs A" value={`${fmtDelta(total)} s`} color={total > 0 ? COLOR_A : COLOR_B} sub={total > 0 ? "A is faster" : total < 0 ? "B is faster" : "dead heat"} />
        {[0, 1, 2].map((k) => {
          const d = oB.lap.s[k] != null && oA.lap.s[k] != null ? oB.lap.s[k] - oA.lap.s[k] : null;
          return <Stat key={k} label={`Sector ${k + 1}`} value={d != null ? fmtDelta(d) : "—"} color={d == null ? undefined : d > 0 ? COLOR_A : COLOR_B} sub={`${fmtSec(oA.lap.s[k])} / ${fmtSec(oB.lap.s[k])}`} />;
        })}
      </div>

      <Group title={nDiff ? `Conditions: ${nDiff} difference${nDiff > 1 ? "s" : ""} that change lap time` : "Conditions: comparable"}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "2px 6px" }} />
              <th style={{ textAlign: "left", padding: "2px 6px", color: COLOR_A }}>A</th>
              <th style={{ textAlign: "left", padding: "2px 6px", color: COLOR_B }}>B</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(cA).map((k) => {
              const d = differs(k);
              return (
                <tr key={k} style={{ background: d ? "#fff3b0" : "transparent" }}>
                  <td style={{ padding: "2px 6px", color: "#555", whiteSpace: "nowrap" }}>{d ? "⚠ " : ""}{k}</td>
                  <td style={{ padding: "2px 6px" }}>{cA[k]}</td>
                  <td style={{ padding: "2px 6px" }}>{cB[k]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Group>

      <Group title="Circuit map">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
          {MAP_MODES.map((m) => <Btn key={m.key} sfx={sfx} active={mapMode === m.key} onClick={() => setMapMode(m.key)}>{m.label}</Btn>)}
        </div>
        <TrackMap A={A} B={B} mode={mapMode} cursorI={ci} sectorsM={sectorsM} gridM={gridM} />
        <div style={{ ...ui.small, marginTop: 4 }}>
          {mapMode === "delta" ? (
            <>Each stretch is coloured by the lap that covered it faster: <b style={{ color: COLOR_A }}>A</b> or <b style={{ color: COLOR_B }}>B</b> (grey: within 4 ms per 60 m).</>
          ) : (
            <>Lap A's {mapMode}, from low (blue) to high (red). Drawn from the car's own recorded positions.</>
          )}
        </div>
      </Group>

      <Group title="Telemetry by distance">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px", fontSize: 11, marginBottom: 4, minHeight: 16 }}>
          <span style={{ width: 80 }}>{cursor != null ? <b>{cursor} m</b> : <span style={{ color: "#777" }}>Point at a chart</span>}</span>
          <span>Gap <b>{ci != null && gap[ci] != null ? `${fmtDelta(gap[ci] * 1000)} s` : "—"}</b></span>
          <span style={{ color: COLOR_A }}>A {val(A.speed_kph)} km/h · G{val(A.gear)} · T{val(A.throttle, 0, 100)}% B{val(A.brake, 0, 100)}%</span>
          <span style={{ color: COLOR_B }}>B {val(B.speed_kph)} km/h · G{val(B.gear)} · T{val(B.throttle, 0, 100)}% B{val(B.brake, 0, 100)}%</span>
        </div>
        <Chart {...common} title="Gap: B behind A [s]  (rising = B losing time)" height={120} yMin={gLo - gPad} yMax={gHi + gPad} hLines={[{ y: 0, color: "#888", dash: [2, 2] }]}
          series={[{ x: dist, y: gap, color: "#000", width: 1.5 }]} />
        <Chart {...common} title="Speed [km/h]" height={140} yMin={Math.max(0, sLo - 10)} yMax={sHi + 10}
          series={[{ x: dist, y: B.speed_kph, color: COLOR_B }, { x: dist, y: A.speed_kph, color: COLOR_A }]} />
        <Chart {...common} title="Throttle (up) / brake (down) [%]" height={120} yMin={-105} yMax={105} yFmt={(v) => `${Math.abs(Math.round(v))}`}
          hLines={[{ y: 0, color: "#bbb", dash: [] }]}
          series={[
            { x: dist, y: B.throttle.map((v) => (v == null ? null : v * 100)), color: COLOR_B },
            { x: dist, y: A.throttle.map((v) => (v == null ? null : v * 100)), color: COLOR_A },
            { x: dist, y: B.brake.map((v) => (v == null ? null : -v * 100)), color: COLOR_B, dash: [3, 2] },
            { x: dist, y: A.brake.map((v) => (v == null ? null : -v * 100)), color: COLOR_A, dash: [3, 2] },
          ]} />
        <Chart {...common} title="Gear" height={100} yMin={0.5} yMax={8.5} xLabel="Lap distance [m]"
          series={[{ x: dist, y: B.gear, color: COLOR_B, step: true }, { x: dist, y: A.gear, color: COLOR_A, step: true }]} />
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, ...ui.small }}>
          <span>Drag across a chart to zoom every chart; double-click to reset.</span>
          {range && <Btn sfx={sfx} onClick={() => setRange(null)}>Reset zoom ({Math.round(x0)}–{Math.round(x1)} m)</Btn>}
        </div>
      </Group>

      <Group title={range ? `G-G diagram (${Math.round(x0)}–${Math.round(x1)} m)` : "G-G diagram (whole lap)"}>
        <GGDiagram A={A} B={B} range={[x0, x1]} gridM={gridM} />
        <div style={{ ...ui.small, marginTop: 4 }}>
          Lateral vs longitudinal g at every 5 m. The fuller the circle's edge, the more of the tyres' grip the lap used. Zoom the charts above to see a single corner.
        </div>
      </Group>
      <div style={{ ...ui.small, marginTop: 4 }}>Track length {length.toLocaleString("en-US")} m · traces resampled from the 1 m store to a {gridM} m grid for the web.</div>
    </div>
  );
}
