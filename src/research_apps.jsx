import React, { useState, useMemo, useRef, useEffect } from "react";

/* ==================================================================
   INTERACTIVE APPS BUILT FROM THE IC RESEARCH
   "Controlador de potência PID para motores brushless aplicado a UAVs"
   (UFABC, 2024-2025). Every number below comes from the final report
   unless the comment says "illustrative".

   Each app is a plain React component. portfolio_os.jsx renders it
   inside a window when a project has `component: <Component>`.
================================================================== */

const RAISED = "inset -1px -1px 0 #0a0a0a, inset 1px 1px 0 #fff, inset -2px -2px 0 #808080, inset 2px 2px 0 #dfdfdf";
const SUNKEN = "inset 1px 1px 0 #0a0a0a, inset -1px -1px 0 #fff, inset 2px 2px 0 #808080, inset -2px -2px 0 #dfdfdf";

const ui = {
  group: { border: "1px solid #808080", boxShadow: "1px 1px 0 #fff", padding: "10px 8px 8px", margin: "12px 0 8px", position: "relative" },
  legend: { position: "absolute", top: -8, left: 8, background: "#fff", padding: "0 4px", fontSize: 11, fontWeight: 700, color: "#000080" },
  btn: { fontSize: 11, padding: "3px 8px", background: "#c0c0c0", border: "none", cursor: "pointer", boxShadow: RAISED, color: "#000", fontFamily: "inherit" },
  btnDown: { boxShadow: SUNKEN, background: "#d4d4d4" },
  select: { fontSize: 11, fontFamily: "inherit", padding: 2, maxWidth: "100%" },
  label: { fontSize: 11, display: "flex", alignItems: "center", gap: 6 },
  small: { fontSize: 11, color: "#555" },
};

function Group({ title, children }) {
  return (
    <fieldset style={ui.group}>
      <span style={ui.legend}>{title}</span>
      {children}
    </fieldset>
  );
}

function Btn({ active, onClick, children, sfx, style }) {
  return (
    <button
      onClick={() => { sfx && sfx.click(); onClick(); }}
      style={{ ...ui.btn, ...(active ? ui.btnDown : null), ...style }}
    >
      {children}
    </button>
  );
}

/* --------------------------- math utils --------------------------- */
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeGauss(seed) {
  const r = mulberry32(seed);
  return () => {
    let u = 0;
    while (u === 0) u = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  };
}
function niceStep(range, target) {
  const raw = range / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag;
}
const fmtTick = (v) => (Math.abs(v) >= 1 || v === 0 ? String(Math.round(v * 100) / 100) : v.toPrecision(2));
const lerpTable = (table, x) => {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [x0, y0] = table[i - 1];
      const [x1, y1] = table[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return table[table.length - 1][1];
};

/* ----------------------------- chart ------------------------------ */
// Small canvas line chart styled like the plots in the report.
function Chart({ series, xMin = 0, xMax, yMin, yMax, height = 220, xLabel = "Time [s]", yLabel = "Power [W]", hLines = [], bands = [] }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [w, setW] = useState(420);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(220, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr;
    c.height = height * dpr;
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const L = 46, R = 8, T = 8, B = 30;
    const pw = w - L - R, ph = height - T - B;
    const X = (x) => L + ((x - xMin) / (xMax - xMin)) * pw;
    const Y = (y) => T + (1 - (y - yMin) / (yMax - yMin)) * ph;

    g.fillStyle = "#fff";
    g.fillRect(0, 0, w, height);
    g.font = "10px Tahoma, sans-serif";

    bands.forEach((b) => {
      if (b.x1 < xMin || b.x0 > xMax) return;
      g.fillStyle = b.color;
      const x0 = Math.max(X(b.x0), L), x1 = Math.min(X(b.x1), L + pw);
      g.fillRect(x0, T, x1 - x0, ph);
      if (b.label) {
        g.fillStyle = "#444";
        g.textAlign = "left";
        g.fillText(b.label, x0 + 3, T + 11);
      }
    });

    g.strokeStyle = "#e2e2e2";
    g.lineWidth = 1;
    g.fillStyle = "#333";
    const xs = niceStep(xMax - xMin, Math.max(3, Math.floor(pw / 70)));
    for (let x = Math.ceil(xMin / xs) * xs; x <= xMax + 1e-9; x += xs) {
      g.beginPath(); g.moveTo(Math.round(X(x)) + 0.5, T); g.lineTo(Math.round(X(x)) + 0.5, T + ph); g.stroke();
      g.textAlign = "center"; g.fillText(fmtTick(x), X(x), T + ph + 12);
    }
    const ys = niceStep(yMax - yMin, 5);
    for (let y = Math.ceil(yMin / ys) * ys; y <= yMax + 1e-9; y += ys) {
      g.beginPath(); g.moveTo(L, Math.round(Y(y)) + 0.5); g.lineTo(L + pw, Math.round(Y(y)) + 0.5); g.stroke();
      g.textAlign = "right"; g.fillText(fmtTick(y), L - 4, Y(y) + 3);
    }
    g.strokeStyle = "#808080";
    g.strokeRect(L + 0.5, T + 0.5, pw, ph);
    g.textAlign = "center";
    g.fillText(xLabel, L + pw / 2, height - 3);
    g.save(); g.translate(10, T + ph / 2); g.rotate(-Math.PI / 2); g.fillText(yLabel, 0, 0); g.restore();

    g.save();
    g.beginPath(); g.rect(L, T, pw, ph); g.clip();
    hLines.forEach((h) => {
      g.strokeStyle = h.color; g.lineWidth = 1; g.setLineDash(h.dash || [5, 4]);
      g.beginPath(); g.moveTo(L, Y(h.y)); g.lineTo(L + pw, Y(h.y)); g.stroke(); g.setLineDash([]);
      if (h.label) { g.fillStyle = h.color; g.textAlign = "right"; g.fillText(h.label, L + pw - 4, Y(h.y) - 3); }
    });
    series.forEach((s) => {
      const n = s.y.length;
      if (!n) return;
      const yScale = s.yScale || ((v) => v);
      const path = () => {
        g.beginPath();
        let started = false;
        for (let i = 0; i < n; i++) {
          const xv = s.x[i];
          if (xv < xMin - 1 || xv > xMax + 1) continue;
          const px = X(xv), py = Y(yScale(s.y[i]));
          if (started) g.lineTo(px, py); else { g.moveTo(px, py); started = true; }
        }
      };
      if (s.fill) {
        path();
        const lastX = Math.min(s.x[n - 1], xMax), firstX = Math.max(s.x[0], xMin);
        g.lineTo(X(lastX), Y(Math.max(yMin, 0))); g.lineTo(X(firstX), Y(Math.max(yMin, 0))); g.closePath();
        g.fillStyle = s.fill; g.fill();
      }
      path();
      g.strokeStyle = s.color; g.lineWidth = s.width || 1.2; g.setLineDash(s.dash || []);
      g.stroke(); g.setLineDash([]);
    });
    g.restore();
  }, [w, height, series, xMin, xMax, yMin, yMax, xLabel, yLabel, hLines, bands]);

  return (
    <div ref={wrapRef} style={{ width: "100%", boxShadow: SUNKEN, padding: 2, background: "#fff", boxSizing: "border-box" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height, display: "block" }} />
    </div>
  );
}

function Legend({ items }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 11, margin: "4px 0 2px" }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 14, height: it.fill ? 8 : 0, borderTop: it.fill ? "none" : `2px ${it.dash ? "dashed" : "solid"} ${it.color}`, background: it.fill || "none", border: it.fill ? `1px solid ${it.color}` : undefined }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function Stat({ label, value, ok }) {
  const color = ok === undefined ? "#000" : ok ? "#006400" : "#a00000";
  return (
    <div style={{ padding: "4px 6px", boxShadow: SUNKEN, background: "#fff", minWidth: 92, flex: "1 1 92px" }}>
      <div style={{ fontSize: 10, color: "#555" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color }}>
        {ok !== undefined && <span style={{ marginRight: 4 }}>{ok ? "✔" : "✘"}</span>}
        {value}
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, format = (v) => v, log }) {
  // log sliders map [0,1000] -> [min,max] logarithmically
  const toPos = (v) => (log ? (Math.log10(v / min) / Math.log10(max / min)) * 1000 : v);
  const fromPos = (p) => (log ? min * Math.pow(max / min, p / 1000) : p);
  return (
    <label style={{ ...ui.label, margin: "4px 0" }}>
      <span style={{ width: 92, flexShrink: 0 }}>{label}</span>
      <input
        type="range"
        min={log ? 0 : min}
        max={log ? 1000 : max}
        step={log ? 1 : step}
        value={toPos(value)}
        onChange={(e) => onChange(fromPos(Number(e.target.value)))}
        style={{ flex: 1, minWidth: 80 }}
      />
      <span style={{ width: 62, textAlign: "right", fontFamily: "monospace", fontSize: 11 }}>{format(value)}</span>
    </label>
  );
}

/* ==================================================================
   1) PID LAB — closed-loop power controller simulator
================================================================== */

// Plant: simplified motor+propeller = lightly damped 2nd-order mode
// (the open-loop overshoot in the throttle step tests) driven by a
// fast + slow input path, plus transport delay, scaled so 680 W needs
// 69.74 % throttle (Table 37). The report's ARX model (eq. 13) has a
// very slow pole that drifts, so this cleaner model was grid-searched
// against the bench results instead. It reproduces the key finding:
// matrix-1 test 4 is unstable at a 30 ms PWM update (~51 % overshoot
// vs 58.5 % on the bench) but stable at 5 ms, and the final tune and
// test 3 show no overshoot.
const PLANT = { K: 680 / (69.74 * 1.8), zeta: 0.2, wn: 20, delay: 0.02, fast: 0.5, tauSlow: 0.3 };
// Throttle needed for the same power vs. airspeed (wind tunnel, Table 37).
const WIND_THROTTLE = [[0, 69.74], [2, 68.38], [4, 66.22], [6, 66.13], [8, 64.13], [19, 66.08]];
const windGain = (v) => 69.74 / lerpTable(WIND_THROTTLE, v);
// Sensor noise on power (illustrative magnitudes, with the P1/P2 ratio from Table 39).
const SENSORS = {
  p1: { label: "P1 — perfboard", sigma: 18, sample: 0.01164 },
  p2: { label: "P2 — IGNIS PCB", sigma: 5.8, sample: 0.009408 },
};

const GAIN_PRESETS = [
  { id: "final", label: "Final tune (Ki = 0.25)", kp: 0, ki: 0.25, kd: 0, note: "Chosen in the report: pure integral, no overshoot." },
  { id: "init", label: "Initial Simulink tune", kp: 0.0088, ki: 0.7908, kd: 0, note: "Tuned on the continuous-time model: 0.17 s rise in theory." },
  { id: "m1t1", label: "Matrix 1 · Test 1", kp: 0.001137, ki: 0.075808, kd: 0, note: "Analyse damping: very slow (Ts 6.6 s on the bench)." },
  { id: "m1t2", label: "Matrix 1 · Test 2", kp: 0.032696, ki: 0.72478, kd: 0, note: "Fast, but 11 % overshoot on the bench." },
  { id: "m1t3", label: "Matrix 1 · Test 3", kp: 0.0044, ki: 0.29499, kd: 0, note: "Best balance of matrix 1: no overshoot, within 2 %." },
  { id: "m1t4", label: "Matrix 1 · Test 4", kp: 0.17034, ki: 0.24747, kd: 0, note: "Large Kp: unstable on the bench (58.5 % overshoot, PWM banging)." },
  { id: "m1t5", label: "Matrix 1 · Test 5", kp: 0, ki: 0.594, kd: 0, note: "Fast rise, 28.5 % overshoot on the bench." },
  { id: "m1t6", label: "Matrix 1 · Test 6", kp: 0.0092, ki: 0.616, kd: 0, note: "Good rise, 10.6 % overshoot on the bench." },
  { id: "m1t7", label: "Matrix 1 · Test 7", kp: 0.042, ki: 0.731, kd: 0, note: "Aggressive: very noisy steady state." },
  { id: "m2t3", label: "Matrix 2 · Test 3", kp: 0.0059, ki: 0.3972, kd: 0, note: "Faster rise, 40 % overshoot on the bench." },
  { id: "m2t4", label: "Matrix 2 · Test 4", kp: 0.0038, ki: 0.25361, kd: 0, note: "Steady-state stability check: clean." },
];

const SCENARIOS = {
  step: { label: "Step to 680 W", T: 8, seq: [[0, 0], [1, 680]] },
  matrix2: { label: "Test matrix 2 sequence", T: 127, seq: [[0, 0], [5, 680], [30, 0], [50, 340], [60, 580], [65, 600], [75, 400], [82, 200], [87, 450], [97, 0]] },
  tunnel: { label: "Wind tunnel sweep (600 W cap)", T: 64, seq: [[0, 0], [2, 600]], wind: [[0, 0], [10, 2], [18, 4], [26, 6], [34, 8], [42, 15], [50, 20]] },
};
const stepAt = (seq, t) => { let v = seq[0][1]; for (const [ts, val] of seq) if (t >= ts) v = val; return v; };

function simulatePID({ kp, ki, kd, period, sensor, kalman, wind, scenario, seed = 7 }) {
  const sc = typeof scenario === "string" ? SCENARIOS[scenario] : scenario;
  const sens = SENSORS[sensor];
  const dt = 0.0005;
  const gauss = makeGauss(seed);
  const delayN = Math.round(PLANT.delay / dt);
  const ring = new Float64Array(delayN + 1);
  let ri = 0;
  let x1 = 0, x2 = 0, x3 = 0, u = 0, I = 0, prevMeas = 0, tCtl = 0, tSmp = 0;
  let turb = 0;
  let meas = 0, kx = 0, kP = 400;
  const kQ = 20, kR = sens.sigma * sens.sigma;
  const out = { t: [], sp: [], p: [], raw: [], thr: [], windT: [] };
  let tRec = 0;
  for (let t = 0; t <= sc.T; t += dt) {
    const sp = stepAt(sc.seq, t);
    const v = sc.wind ? stepAt(sc.wind, t) : wind;
    // low-pass turbulence that grows with airspeed (illustrative)
    turb = 0.995 * turb + 0.1 * gauss() * (v / 20) * 0.15;
    const gain = PLANT.K * windGain(v) * (1 + turb * 0.1);

    ring[ri] = u;
    ri = (ri + 1) % ring.length;
    const ud = ring[ri];
    x3 += ((ud - x3) / PLANT.tauSlow) * dt; // slow mode (propeller inflow / battery sag)
    const uEff = PLANT.fast * ud + (1 - PLANT.fast) * x3;
    const acc = PLANT.wn * PLANT.wn * (gain * uEff - x1) - 2 * PLANT.zeta * PLANT.wn * x2;
    x2 += acc * dt;
    x1 += x2 * dt;
    const p = Math.max(0, x1);

    // sensor sampling + optional 1D Kalman filter
    if (t >= tSmp) {
      meas = p + gauss() * sens.sigma;
      kP += kQ;
      const K = kP / (kP + kR);
      kx += K * (meas - kx);
      kP *= 1 - K;
      tSmp += sens.sample;
    }
    const y = kalman ? kx : meas;

    // controller runs at the PWM frame rate (receiver/ESC update)
    if (t >= tCtl) {
      const e = sp - y;
      const dMeas = (y - prevMeas) / period;
      prevMeas = y;
      const Inew = I + e * period;
      let cmd = kp * e + ki * Inew - kd * dMeas;
      if (cmd > 180) cmd = 180;
      else if (cmd < 0) cmd = 0;
      else I = Inew; // conditional integration = simple anti-windup
      u = cmd;
      tCtl += period;
    }

    if (t >= tRec) {
      out.t.push(t); out.sp.push(sp); out.p.push(p); out.raw.push(meas); out.thr.push(u / 1.8); out.windT.push(v);
      tRec += 0.01;
    }
  }
  return out;
}

function stepMetrics(sim, t0 = 1, target = 680) {
  const { t, p } = sim;
  let t10 = null, t90 = null, peak = 0, lastOut = t0;
  const tol = 0.02 * target;
  let ise = 0, ssSum = 0, ssN = 0;
  const tEnd = t[t.length - 1];
  for (let i = 0; i < t.length; i++) {
    if (t[i] < t0) continue;
    const y = p[i];
    if (t10 === null && y >= 0.1 * target) t10 = t[i];
    if (t90 === null && y >= 0.9 * target) t90 = t[i];
    if (y > peak) peak = y;
    if (Math.abs(y - target) > tol) lastOut = t[i];
    ise += (y - target) ** 2 * 0.01;
    if (t[i] > tEnd - 2) { ssSum += y; ssN++; }
  }
  const ss = ssN ? ssSum / ssN : 0;
  const settled = lastOut < tEnd - 1;
  return {
    rise: t10 !== null && t90 !== null ? t90 - t10 : null,
    settle: settled ? lastOut - t0 : null,
    overshoot: Math.max(0, ((peak - target) / target) * 100),
    peak,
    ssErr: ((ss - target) / target) * 100,
    ise,
  };
}

export function PIDLab({ sfx }) {
  const [preset, setPreset] = useState("final");
  const [kp, setKp] = useState(0);
  const [ki, setKi] = useState(0.25);
  const [kd, setKd] = useState(0);
  const [period, setPeriod] = useState(0.03);
  const [sensor, setSensor] = useState("p2");
  const [kalman, setKalman] = useState(true);
  const [wind, setWind] = useState(0);
  const [scenario, setScenario] = useState("step");
  const [showThrottle, setShowThrottle] = useState(true);

  const applyPreset = (id) => {
    const p = GAIN_PRESETS.find((g) => g.id === id);
    setPreset(id);
    if (p) { setKp(p.kp); setKi(p.ki); setKd(p.kd); }
  };
  const custom = (fn) => (v) => { setPreset("custom"); fn(v); };

  const sim = useMemo(
    () => simulatePID({ kp, ki, kd, period, sensor, kalman, wind, scenario }),
    [kp, ki, kd, period, sensor, kalman, wind, scenario]
  );
  const m = useMemo(() => (scenario === "step" ? stepMetrics(sim) : null), [sim, scenario]);
  const ise = useMemo(() => {
    let s = 0;
    for (let i = 0; i < sim.t.length; i++) s += (sim.p[i] - sim.sp[i]) ** 2 * 0.01;
    return s;
  }, [sim]);
  const peak = useMemo(() => Math.max(...sim.p), [sim]);
  const cap = scenario === "tunnel" ? 600 : 680;
  const sc = SCENARIOS[scenario];
  const presetNote = GAIN_PRESETS.find((g) => g.id === preset)?.note;

  const series = useMemo(() => {
    const s = [];
    s.push({ x: sim.t, y: sim.raw, color: "rgba(120,120,120,0.45)", width: 0.8 });
    s.push({ x: sim.t, y: sim.p, color: "#1f7a1f", width: 1.4, fill: "rgba(76,175,80,0.28)" });
    s.push({ x: sim.t, y: sim.sp, color: "#d01010", width: 1.4 });
    if (showThrottle) s.push({ x: sim.t, y: sim.thr, color: "#1a4fd6", width: 1, dash: [3, 2], yScale: (v) => v * 10 });
    return s;
  }, [sim, showThrottle]);

  const bands = useMemo(() => {
    if (!sc.wind) return [];
    const shades = ["rgba(0,0,0,0)", "rgba(0,0,0,0.05)", "rgba(0,0,0,0.09)", "rgba(0,0,0,0.13)", "rgba(0,0,0,0.17)", "rgba(0,0,0,0.21)", "rgba(0,0,0,0.25)"];
    return sc.wind.map(([t0, v], i) => ({ x0: t0, x1: sc.wind[i + 1] ? sc.wind[i + 1][0] : sc.T, color: shades[i], label: v ? `${v} m/s` : "" }));
  }, [sc]);

  const thrSteady = useMemo(() => {
    if (!sc.wind) return null;
    return sc.wind.map(([t0, v], i) => {
      const t1 = sc.wind[i + 1] ? sc.wind[i + 1][0] : sc.T;
      let sum = 0, n = 0;
      for (let k = 0; k < sim.t.length; k++) if (sim.t[k] > t1 - 3 && sim.t[k] < t1) { sum += sim.thr[k]; n++; }
      return { v, thr: n ? sum / n : 0 };
    });
  }, [sim, sc]);

  return (
    <div style={{ fontSize: 12 }}>
      <p style={{ margin: "0 0 6px" }}>
        Simulates the closed loop of the power controller: sensor → Kalman filter → PID → ESC PWM → motor + propeller.
        Load a gain set from the report's test matrices, or set your own, and see why the <b>20–30 ms PWM frame</b> rules out aggressive gains.
      </p>

      <Group title="Gains">
        <label style={{ ...ui.label, marginBottom: 6, flexWrap: "wrap" }}>
          Preset:
          <select value={preset} onChange={(e) => { sfx && sfx.click(); applyPreset(e.target.value); }} style={ui.select}>
            {GAIN_PRESETS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            {preset === "custom" && <option value="custom">Custom</option>}
          </select>
        </label>
        {presetNote && <div style={{ ...ui.small, marginBottom: 4 }}>{presetNote}</div>}
        <Slider label="Kp" value={kp} min={0} max={0.2} step={0.0005} onChange={custom(setKp)} format={(v) => v.toFixed(4)} />
        <Slider label="Ki" value={ki} min={0} max={1} step={0.005} onChange={custom(setKi)} format={(v) => v.toFixed(3)} />
        <Slider label="Kd" value={kd} min={0} max={0.005} step={0.0001} onChange={custom(setKd)} format={(v) => v.toFixed(4)} />
      </Group>

      <Group title="Hardware & conditions">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 11, width: 92 }}>PWM update</span>
          {[[0.005, "5 ms (ideal)"], [0.02, "20 ms"], [0.03, "30 ms (bench)"]].map(([v, l]) => (
            <Btn key={v} sfx={sfx} active={period === v} onClick={() => setPeriod(v)}>{l}</Btn>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 11, width: 92 }}>Sensor board</span>
          {Object.entries(SENSORS).map(([k, s]) => (
            <Btn key={k} sfx={sfx} active={sensor === k} onClick={() => setSensor(k)}>{s.label}</Btn>
          ))}
          <label style={ui.label}>
            <input type="checkbox" checked={kalman} onChange={(e) => setKalman(e.target.checked)} /> Kalman filter
          </label>
        </div>
        {scenario !== "tunnel" ? (
          <Slider label="Airspeed" value={wind} min={0} max={20} step={0.5} onChange={setWind} format={(v) => `${v} m/s`} />
        ) : (
          <div style={ui.small}>Airspeed is set by the tunnel sweep (shaded bands).</div>
        )}
      </Group>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "10px 0 6px" }}>
        {Object.entries(SCENARIOS).map(([k, s]) => (
          <Btn key={k} sfx={sfx} active={scenario === k} onClick={() => setScenario(k)}>{s.label}</Btn>
        ))}
      </div>

      <Chart
        series={series}
        xMax={sc.T}
        yMin={-50}
        yMax={Math.max(1000, Math.min(1500, Math.ceil(peak / 100) * 100 + 100))}
        height={240}
        bands={bands}
        hLines={[{ y: cap, color: "#a00000", label: `${cap} W regulation limit` }]}
      />
      <Legend
        items={[
          { label: "Setpoint", color: "#d01010" },
          { label: "True power", color: "#1f7a1f", fill: "rgba(76,175,80,0.35)" },
          { label: "Raw sensor", color: "#999" },
          ...(showThrottle ? [{ label: "Throttle ×10 [%]", color: "#1a4fd6", dash: true }] : []),
        ]}
      />
      <label style={{ ...ui.label, margin: "2px 0 8px" }}>
        <input type="checkbox" checked={showThrottle} onChange={(e) => setShowThrottle(e.target.checked)} /> Show throttle sent to the ESC
      </label>

      {m ? (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <Stat label="Rise time (10–90 %)" value={m.rise !== null ? `${m.rise.toFixed(2)} s` : "—"} />
            <Stat label="Overshoot · RqC.3 = 0" value={`${m.overshoot.toFixed(1)} %`} ok={m.overshoot < 0.5} />
            <Stat label="Settling 2 % · RqC.4 < 1 s" value={m.settle !== null ? `${m.settle.toFixed(2)} s` : "never"} ok={m.settle !== null && m.settle < 1} />
            <Stat label="SS error · RqC.2 ±1 %" value={`${m.ssErr.toFixed(2)} %`} ok={Math.abs(m.ssErr) <= 1} />
            <Stat label="Peak vs 680 W limit" value={`${m.peak.toFixed(0)} W`} ok={m.peak <= 680} />
            <Stat label="ISE" value={m.ise.toExponential(2)} />
          </div>
          <p style={{ ...ui.small, marginTop: 8 }}>
            On the real bench, none of the tested gain sets met all four control requirements at a 30 ms update.
            The final tune gives up the &lt;1 s settling target (RqC.4) to get zero overshoot, because a penalty for going over the power cap costs more.
          </p>
        </>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <Stat label="Peak power" value={`${peak.toFixed(0)} W`} ok={peak <= cap} />
          <Stat label="ISE (whole run)" value={ise.toExponential(2)} />
          {thrSteady && thrSteady.map((r) => <Stat key={r.v} label={`Throttle @ ${r.v} m/s`} value={`${r.thr.toFixed(1)} %`} />)}
        </div>
      )}
      {scenario === "tunnel" && (
        <p style={{ ...ui.small, marginTop: 8 }}>
          In the wind tunnel the controller held the 600 W cap (2025 rules) while it lowered the throttle from 69.7 % at 0 m/s to 64.1 % at 8 m/s,
          so the propeller turned the airflow into energy savings.
        </p>
      )}
      <p style={{ ...ui.small, marginTop: 8, borderTop: "1px solid #c0c0c0", paddingTop: 6 }}>
        Model: a lightly damped motor+propeller with a slow mode and 20 ms latency, scaled to 680 W at 69.74 % throttle, plus wind gains from the tunnel data.
        It was fitted to the bench test matrices as a teaching approximation; it is not the 5-pole ARX model from the report. Sensor noise levels are illustrative and keep the P1:P2 ratio.
      </p>
    </div>
  );
}

/* ==================================================================
   2) KALMAN FILTER — voltage & current channels
================================================================== */

// Calibration equations (eq. 10/11 for P1, eq. 14/15 for P2) map ADC counts -> V / A.
const BOARDS = {
  p1: { label: "P1 — perfboard", varV: 3.28, varI: 11.415, v: [0.0017283, 0.0235562], i: [0.0065479, -88.364151], sample: 0.01164 },
  p2: { label: "P2 — IGNIS PCB", varV: 0.3, varI: 1.155, v: [0.00177, -0.00501], i: [0.00925, -73.09245], sample: 0.009408 },
};
// Extra noise variance while the motor runs (EMI + vibration), illustrative.
const ENVIRONMENTS = { bench: { label: "Calibration bench", k: 1 }, motor: { label: "Motor running", k: 1500 } };
const REPORT_KF = { qV: 0.001, rV: 3.28026, qI: 0.05, rI: 11.41533 };
const KF_SEQ = [[0, 0], [2, 680], [12, 0], [17, 340], [22, 580], [27, 600], [32, 400], [37, 0]];

function kalman1D(z, Q, R, x0) {
  const out = new Float64Array(z.length);
  let x = x0, P = R;
  for (let i = 0; i < z.length; i++) {
    P += Q;
    const K = P / (P + R);
    x += K * (z[i] - x);
    P *= 1 - K;
    out[i] = x;
  }
  return out;
}

export function KalmanLab({ sfx }) {
  const [board, setBoard] = useState("p1");
  const [env, setEnv] = useState("motor");
  const [qV, setQV] = useState(REPORT_KF.qV);
  const [rV, setRV] = useState(REPORT_KF.rV);
  const [qI, setQI] = useState(REPORT_KF.qI);
  const [rI, setRI] = useState(REPORT_KF.rI);
  const [zoom, setZoom] = useState(false);

  // The "true" power comes from the PID Lab plant running the final tune
  // through a shortened version of test matrix 1 (Table 11).
  const truth = useMemo(
    () => simulatePID({ kp: 0, ki: 0.25, kd: 0, period: 0.03, sensor: "p2", kalman: true, wind: 0, scenario: { T: 42, seq: KF_SEQ }, seed: 3 }),
    []
  );

  const data = useMemo(() => {
    const b = BOARDS[board];
    const k = ENVIRONMENTS[env].k;
    const gauss = makeGauss(11);
    const T = 42, dt = b.sample;
    const Voc = 24.4, rInt = 0.025; // 6S LiPo, internal resistance ~25 mOhm (illustrative)
    const shape = (t) => truth.p[Math.min(truth.p.length - 1, Math.round(t / 0.01))];
    const n = Math.floor(T / dt);
    const t = new Float64Array(n), pTrue = new Float64Array(n), cV = new Float64Array(n), cI = new Float64Array(n);
    const sV = Math.sqrt(b.varV * k), sI = Math.sqrt(b.varI * k);
    for (let i = 0; i < n; i++) {
      const ti = i * dt;
      const P = Math.max(0, shape(ti));
      const I = (Voc - Math.sqrt(Voc * Voc - 4 * rInt * P)) / (2 * rInt);
      const V = Voc - rInt * I;
      t[i] = ti; pTrue[i] = V * I;
      cV[i] = (V - b.v[1]) / b.v[0] + gauss() * sV;
      cI[i] = (I - b.i[1]) / b.i[0] + gauss() * sI;
    }
    const fV = kalman1D(cV, qV, rV, cV[0]);
    const fI = kalman1D(cI, qI, rI, cI[0]);
    const pRaw = new Float64Array(n), pF = new Float64Array(n);
    // noise is measured only where the true power is steady (> 1.5 s after
    // the last change), so step lag doesn't count as noise
    const back = Math.round(1.5 / dt);
    let eRaw = 0, eF = 0, nSteady = 0;
    for (let i = 0; i < n; i++) {
      pRaw[i] = (b.v[0] * cV[i] + b.v[1]) * (b.i[0] * cI[i] + b.i[1]);
      pF[i] = (b.v[0] * fV[i] + b.v[1]) * (b.i[0] * fI[i] + b.i[1]);
      if (i >= back && Math.abs(pTrue[i] - pTrue[i - back]) < 5) {
        eRaw += (pRaw[i] - pTrue[i]) ** 2;
        eF += (pF[i] - pTrue[i]) ** 2;
        nSteady++;
      }
    }
    nSteady = Math.max(nSteady, 1);
    // lag: time between truth and filtered crossing 340 W on the first step
    const cross = (arr) => { for (let i = 0; i < n; i++) if (t[i] > 2 && arr[i] >= 340) return t[i]; return null; };
    const tT = cross(pTrue), tF = cross(pF);
    return {
      t, pTrue, pRaw, pF,
      rmsRaw: Math.sqrt(eRaw / nSteady), rmsF: Math.sqrt(eF / nSteady),
      lag: tT !== null && tF !== null ? (tF - tT) * 1000 : null,
      rate: 1 / dt,
    };
  }, [board, env, qV, rV, qI, rI, truth]);

  const series = useMemo(() => [
    { x: data.t, y: data.pRaw, color: "rgba(110,110,110,0.55)", width: 0.8 },
    { x: data.t, y: data.pF, color: "#d01010", width: 1.6 },
    { x: data.t, y: data.pTrue, color: "#000", width: 1, dash: [4, 3] },
  ], [data]);

  const resetReport = () => { setQV(REPORT_KF.qV); setRV(REPORT_KF.rV); setQI(REPORT_KF.qI); setRI(REPORT_KF.rI); };
  const useBoardR = () => { setRV(BOARDS[board].varV); setRI(BOARDS[board].varI); };
  const f = (v) => (v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(2) : v.toPrecision(2));

  return (
    <div style={{ fontSize: 12 }}>
      <p style={{ margin: "0 0 6px" }}>
        The controller filters the <b>voltage</b> and <b>current</b> ADC channels separately with a 1-D Kalman filter, then multiplies them into power.
        <b> R</b> is the measured sensor variance from calibration. <b>Q</b> was tuned by hand. Raise Q to follow the signal faster, or raise R to smooth harder.
      </p>

      <Group title="Signal source">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 11, width: 92 }}>Board</span>
          {Object.entries(BOARDS).map(([k, b]) => <Btn key={k} sfx={sfx} active={board === k} onClick={() => setBoard(k)}>{b.label}</Btn>)}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 11, width: 92 }}>Environment</span>
          {Object.entries(ENVIRONMENTS).map(([k, e]) => <Btn key={k} sfx={sfx} active={env === k} onClick={() => setEnv(k)}>{e.label}</Btn>)}
        </div>
        <div style={{ ...ui.small, marginTop: 6 }}>
          Measured noise variance (ADC counts²): V {BOARDS[board].varV}, I {BOARDS[board].varI} · sampling {data.rate.toFixed(1)} Hz
        </div>
      </Group>

      <Group title="Filter tuning">
        <Slider label="Voltage Q" value={qV} min={1e-5} max={10} log onChange={setQV} format={f} />
        <Slider label="Voltage R" value={rV} min={0.01} max={1000} log onChange={setRV} format={f} />
        <Slider label="Current Q" value={qI} min={1e-5} max={10} log onChange={setQI} format={f} />
        <Slider label="Current R" value={rI} min={0.01} max={1000} log onChange={setRI} format={f} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          <Btn sfx={sfx} onClick={resetReport}>Report values (P1)</Btn>
          <Btn sfx={sfx} onClick={useBoardR}>R = this board's variance</Btn>
          <Btn sfx={sfx} active={zoom} onClick={() => setZoom((z) => !z)}>{zoom ? "Show full run" : "Zoom on first step"}</Btn>
        </div>
      </Group>

      <Chart series={series} xMin={zoom ? 1 : 0} xMax={zoom ? 8 : 42} yMin={-100} yMax={900} height={230} />
      <Legend items={[{ label: "Raw V×I", color: "#888" }, { label: "Kalman filtered", color: "#d01010" }, { label: "True power", color: "#000", dash: true }]} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        <Stat label="Steady-state noise, raw" value={`±${data.rmsRaw.toFixed(1)} W`} />
        <Stat label="Filtered noise (≤ 1 % of 680 W)" value={`±${data.rmsF.toFixed(1)} W`} ok={data.rmsF < 6.8} />
        <Stat label="Noise reduction" value={`${(data.rmsRaw / Math.max(data.rmsF, 1e-9)).toFixed(1)}×`} />
        <Stat label="Lag on 0→680 W step" value={data.lag !== null ? `${data.lag.toFixed(0)} ms` : "—"} ok={data.lag !== null && data.lag < 100} />
      </div>
      <p style={{ ...ui.small, marginTop: 8 }}>
        Moving from the perfboard (P1) to the IGNIS PCB (P2) cut the raw noise variance by 10.9× on voltage and 9.9× on current, so the filter can follow the signal with less lag.
        The noise while the motor runs is an illustrative multiple of the bench variance.
      </p>
    </div>
  );
}

/* ==================================================================
   3) FMEA BOARD — risk priority numbers from the safety analysis
================================================================== */

// [failure, occurrence, severity, detection, mitigation from the report (optional)]
const FMEA = {
  Hardware: [
    ["Electromagnetic interference (motor, radars)", 7, 8, 10, "Ground planes on both layers + via stitching around analog traces; the 118 mm critical trace was simulated in openEMS (1–9 GHz). Still the top risk, so EMI needs bench testing."],
    ["Temperature variation", 4, 7, 9, "Sized for 10–47 °C, from 3 years of in-aircraft temperature logs plus a safety factor; Hall sensor chosen for low thermal drift."],
    ["Short circuit on the board", 3, 10, 8, "Continuity test on every module. A 5 V–GND short on P2 was found this way and cut."],
    ["Contact with water", 6, 9, 4],
    ["Vibration", 10, 6, 3, "Motor cable tensioned through the WCS1700 so it can't vibrate inside the sensor; test bench stiffened after noisy steady states."],
    ["Component degradation", 6, 6, 4, "72 h stress test with no hardware faults."],
    ["Crosstalk", 3, 4, 10, "Long parallel I²C traces were cut on P2 and replaced by an external jumper."],
    ["Bad module connection", 2, 8, 6],
    ["Voltage drop", 2, 8, 6],
    ["Burnt components", 3, 10, 3, "ADS1115 kept dying after ~5 min: supply standardised to 3.3 V and an op-amp buffer added in front of its inputs."],
    ["Voltage spike", 1, 7, 10, "Divider sized for 28 V input (25.2 V max + margin) with output < 3.1 V."],
    ["Humidity variation", 3, 3, 7],
    ["Pressure variation", 2, 2, 10],
    ["Bad solder joint", 3, 6, 2, "Low-temperature Sn42Bi58 paste for SMD reflow; continuity checks after assembly."],
    ["Power fluctuation", 3, 4, 3, "Step-down regulator chosen over BEC: 23.5 mV vs 106 mV ripple."],
    ["Bad button contact", 1, 3, 7],
    ["Trace overload", 1, 4, 5, "Traces sized with Saturn PCB (IPC-2152); motor current runs on an external wire."],
    ["Wrong schematic connections", 2, 4, 2],
    ["Undersized traces", 1, 3, 5],
    ["Mixed logic-level communication", 1, 3, 3],
    ["Wrong supply voltage", 1, 2, 3, "CH340G was fed 5 V instead of 3.3 V on the first P2. Fixed."],
  ],
  Software: [
    ["Sensor decalibration", 6, 8, 7, "Linear calibration per board (R² = 1 voltage, 0.998 current on P1)."],
    ["Wrong state prediction (filter)", 4, 9, 4, "R taken from measured sensor variance; Q tuned against recorded runs."],
    ["Wrong PID estimate", 2, 7, 8],
    ["Wrong tuning", 2, 10, 5, "Two test matrices on the real motor, scored by ISE, before choosing Ki = 0.25."],
    ["Noise amplification", 2, 3, 10, "Kd = 0 in the final tune; derivative action amplified sensor noise."],
    ["Module communication failure", 2, 8, 2],
    ["Processing delay", 2, 8, 2, "SD card writes batched every 10 s; mean loop 9.4 ms; >90 ms stalls in 0.0013 % of cycles at 72 h."],
    ["Processor freeze", 1, 7, 2],
    ["Corrupted data", 1, 1, 10],
    ["PID implemented wrong", 1, 10, 1, "Hardware-in-the-loop in Simulink caught a ms-vs-s bug in the elapsed-time term."],
    ["Unexpected reboot", 1, 5, 2],
    ["Long boot time", 3, 2, 1],
  ],
  System: [
    ["Wrong wattmeter reading", 5, 10, 8],
    ["Receiver cable disconnects", 4, 10, 7],
    ["ESC signal cable disconnects", 4, 10, 7],
    ["Receiver signal loss", 3, 8, 10],
    ["Motor cable comes loose", 2, 10, 6],
    ["ESC fails to interpret signal", 1, 5, 10],
    ["Battery non-linearity", 5, 4, 1, "Tests avoid a fully charged pack, staying out of the non-linear part of the LiPo curve."],
    ["Short in propulsion cables", 1, 6, 3],
  ],
};
const BASELINE = 400; // highest RPN that already exists in the aircraft's own system

export function FMEABoard({ sfx }) {
  const [group, setGroup] = useState("All");
  const [sortKey, setSortKey] = useState("rpn");
  const [selected, setSelected] = useState(null);

  const rows = useMemo(() => {
    const all = [];
    Object.entries(FMEA).forEach(([g, list]) =>
      list.forEach(([name, o, s, d, mit]) => all.push({ g, name, o, s, d, rpn: o * s * d, mit }))
    );
    const filtered = group === "All" ? all : all.filter((r) => r.g === group);
    return filtered.sort((a, b) => b[sortKey] - a[sortKey] || b.rpn - a.rpn);
  }, [group, sortKey]);

  const above = rows.filter((r) => r.g !== "System" && r.rpn > BASELINE).length;
  const colors = { Hardware: "#c9a400", Software: "#1a6fd6", System: "#2e8b57" };
  const th = (key, label, w) => (
    <th
      onClick={() => { sfx && sfx.click(); setSortKey(key); }}
      style={{ cursor: "pointer", padding: "3px 4px", width: w, background: "#c0c0c0", boxShadow: sortKey === key ? SUNKEN : RAISED, fontWeight: 700, fontSize: 11, textAlign: "center", position: "sticky", top: 0 }}
      title={`Sort by ${label}`}
    >
      {label}{sortKey === key ? " ▼" : ""}
    </th>
  );

  return (
    <div style={{ fontSize: 12 }}>
      <p style={{ margin: "0 0 6px" }}>
        The report listed 61 ways the controller could fail and scored the most significant ones with an FMEA.
        <b> RPN = Occurrence × Severity × Detection</b> (each scored 1–10).
        The pass criterion: the controller should add no risk higher than the worst risk already in the aircraft's own system (RPN {BASELINE}, a wrong wattmeter reading).
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0" }}>
        {["All", "Hardware", "Software", "System"].map((g) => (
          <Btn key={g} sfx={sfx} active={group === g} onClick={() => { setGroup(g); setSelected(null); }}>
            {g !== "All" && <span style={{ display: "inline-block", width: 8, height: 8, background: colors[g], marginRight: 4 }} />}
            {g}
          </Btn>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        <Stat label="Failure modes shown" value={rows.length} />
        <Stat label={`Controller risks above ${BASELINE}`} value={above} ok={above === 0} />
        <Stat label="Top risk" value={rows[0] ? `${rows[0].rpn}` : "—"} />
      </div>

      <div style={{ boxShadow: SUNKEN, background: "#fff", padding: 2, maxHeight: 330, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ padding: "3px 4px", background: "#c0c0c0", boxShadow: RAISED, textAlign: "left", position: "sticky", top: 0 }}>Failure</th>
              {th("o", "O", 28)}
              {th("s", "S", 28)}
              {th("d", "D", 28)}
              {th("rpn", "RPN", 130)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isSel = selected === r.name;
              const barColor = r.rpn > BASELINE ? "#c00000" : r.rpn > 200 ? "#d9a000" : "#3a9a3a";
              return (
                <tr
                  key={r.g + r.name}
                  onClick={() => { sfx && sfx.click(); setSelected(isSel ? null : r.name); }}
                  style={{ cursor: "pointer", background: isSel ? "#000080" : "transparent", color: isSel ? "#fff" : "#000" }}
                >
                  <td style={{ padding: "3px 4px", borderBottom: "1px solid #eee" }}>
                    <span style={{ display: "inline-block", width: 7, height: 7, background: colors[r.g], marginRight: 5 }} />
                    {r.name}
                    {r.mit && <span title="Mitigation described in the report" style={{ marginLeft: 4 }}>🛡️</span>}
                  </td>
                  <td style={{ textAlign: "center", borderBottom: "1px solid #eee" }}>{r.o}</td>
                  <td style={{ textAlign: "center", borderBottom: "1px solid #eee" }}>{r.s}</td>
                  <td style={{ textAlign: "center", borderBottom: "1px solid #eee" }}>{r.d}</td>
                  <td style={{ padding: "3px 4px", borderBottom: "1px solid #eee" }}>
                    <div style={{ position: "relative", height: 12, background: isSel ? "#2a2a9a" : "#f0f0f0" }}>
                      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(r.rpn / 600) * 100}%`, background: barColor }} />
                      <div style={{ position: "absolute", left: `${(BASELINE / 600) * 100}%`, top: -2, bottom: -2, borderLeft: "1px dashed #000" }} />
                      <span style={{ position: "absolute", right: 2, top: -1, fontWeight: 700, fontSize: 10, color: isSel ? "#fff" : "#000" }}>{r.rpn}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (() => {
        const r = rows.find((x) => x.name === selected);
        if (!r) return null;
        return (
          <Group title={r.name}>
            <div style={{ fontSize: 11, marginBottom: 4 }}>
              {r.g} · Occurrence {r.o} × Severity {r.s} × Detection {r.d} = <b>{r.rpn}</b>
              {r.rpn > BASELINE ? " (above the system baseline)" : ""}
            </div>
            <div style={{ fontSize: 12 }}>{r.mit || "No specific mitigation is described for this failure mode in the report."}</div>
          </Group>
        );
      })()}

      <p style={{ ...ui.small, marginTop: 8 }}>
        Click a row for the mitigation (🛡️ = described in the report). Dashed line = system baseline ({BASELINE}).
        Only EMI (560) exceeds it, so EMI testing is the next step before the controller flies.
      </p>
    </div>
  );
}

// Shared UI pieces, reused by the Alaris apps (alaris_apps.jsx)
export { RAISED, SUNKEN, ui, Group, Btn, Chart, Legend, Stat, Slider, makeGauss };
