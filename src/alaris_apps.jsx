import React, { useState, useMemo, useRef, useEffect } from "react";
import { RAISED, SUNKEN, ui, Group, Btn, Chart, Legend, Stat, Slider, makeGauss } from "./research_apps";

/* ==================================================================
   INTERACTIVE APPS BUILT FROM THE GRADUATION THESIS
   "Projeto de um sistema de Guiagem, Navegação e Controle para uma
   aeronave rádio controlada" (UFABC, Aug 2026), Project Alaris.

   These apps cover the embedded system (my part of the thesis).
   Numbers come from the thesis unless the comment or the on-screen
   note says "illustrative" (task execution times, timeouts, noise
   levels the thesis doesn't give).
================================================================== */

const mono = { fontFamily: "monospace", fontSize: 11 };
const Note = ({ children }) => <p style={{ ...ui.small, margin: "8px 0 0" }}>{children}</p>;

function Tabs({ tabs, value, onChange, sfx }) {
  return (
    <div style={{ display: "flex", gap: 2, margin: "0 0 -1px", position: "relative", zIndex: 1, flexWrap: "wrap" }}>
      {tabs.map(([id, label]) => (
        <button
          key={id}
          onClick={() => { sfx && sfx.click(); onChange(id); }}
          style={{
            ...ui.btn,
            padding: value === id ? "4px 10px 5px" : "3px 10px",
            marginTop: value === id ? 0 : 2,
            background: value === id ? "#fff" : "#c0c0c0",
            fontWeight: value === id ? 700 : 400,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function useWidth(initial = 420) {
  const ref = useRef(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/* ==================================================================
   1) BOARD EXPLORER — the distributed architecture + power budget
================================================================== */

const NODES = {
  PDN: {
    title: "PDN — Power Distribution Network",
    chip: "2× Li-ion 18650 (3000 mAh) in series, 7.4 V nominal",
    rows: [
      ["Low-noise rail", "LP2985 3.3 V LDO (150 mA, 280 mV dropout) for the GPS and the analog sensors"],
      ["Main rail", "AMS1117 3.3 V LDO (0.8–1 A, 1.1 V dropout) for everything less noise-sensitive"],
      ["Protection", "Reverse-polarity and over-current protection at the input"],
      ["Mode switch", "3-position switch: Off / On / Warm-up. In Warm-up the whole board is powered, and a diode + 47k/33k divider drives a MOSFET that raises a dedicated WarmUP_mode line to the DAPU"],
      ["Indication", "5-LED bar (heartbeat, SD, sensors, GNCU link, CGU link) and a buzzer that beeps every 5 s"],
    ],
  },
  DAPU: {
    title: "DAPU — Data Acquisition & Processing Unit",
    chip: "STM32H723VGT6 · 550 MHz Cortex-M7 · 564 KB RAM · 1 MB flash · 16-bit ADC",
    rows: [
      ["Role", "Reads every sensor, runs the state estimators, logs to SD, feeds the network, runs health management"],
      ["Base rate", "5 ms loop (200 Hz), FreeRTOS with 14 prioritised tasks"],
      ["Digital sensors", "ICM-20948 IMU, BMP390 + MS5611 barometers, u-blox NEO-M8N GNSS"],
      ["Analog sensors", "Pitot (MPS20N0040D + INA333, G = 1000), AOA vane potentiometer, electret mic (prop RPM), 3 flex sensors (surface deflection), battery voltage divider"],
      ["Estimation", "Federated EKFs: attitude (6 states), altitude (3), velocity/position (7)"],
      ["Storage", "SD card over SDMMC"],
    ],
  },
  GNCU: {
    title: "GNCU — Guidance, Navigation & Control Unit",
    chip: "STM32F446RET6 · 180 MHz Cortex-M4F",
    rows: [
      ["Role", "Reads the pilot, runs guidance and the autopilot, drives the servos and ESC"],
      ["RC input", "5 channels (aileron, elevator, rudder, throttle, mode) read by timer Input Capture: no polling, no CPU load"],
      ["Outputs", "Hardware timer PWM at 50 Hz, independent of task load"],
      ["Loop rates", "Inner loops and RC read at 50 Hz (the servo frame), outer loops and guidance at 5 Hz"],
      ["Backup attitude", "BNO055 with on-chip sensor fusion at 100 Hz. If the DAPU or the SPI link fails, the GNCU still has attitude"],
      ["Modes", "Manual pass-through or Autonomous; leaving Auto is immediate, entering needs consecutive confirmed reads"],
    ],
  },
  CGU: {
    title: "CGU — Communication Gateway Unit",
    chip: "ESP32-C3 · RISC-V · integrated Wi-Fi",
    rows: [
      ["Role", "Telemetry and basic commands/parameters from the user; not in any control loop"],
      ["Tasks", "Collect data from the DAPU (prio 3), web server (2), transmit over Wi-Fi (1)"],
      ["Why separate", "A slow or broken telemetry link can't delay sensing or control"],
    ],
  },
};

const LINKS = {
  spi: { title: "GNCU ⇄ DAPU · SPI full-duplex (critical)", text: "The DAPU sends the state estimate (attitude, altitude, airspeed, position) and the failsafe flag; the GNCU returns actuator state and flight mode. Validated at protocol level. Bring-up found one end set MSB-first and the other LSB-first; intermittent errors were traced to the jumper wires, not the interface." },
  uart: { title: "DAPU ⇄ CGU · UART (non-critical)", text: "Mission data, high-level telemetry, sensor status and the health-management report (used, for example, to show warm-up progress to the user)." },
  pwmIn: { title: "Receiver → GNCU · PWM Input Capture", text: "Validated by generating a PWM signal whose duty cycle was modulated by a sine wave on one pin and capturing it on another: the reading matched the generated signal at every instant." },
  pwmOut: { title: "GNCU → servos/ESC · timer PWM", text: "Standard 50 Hz servo frame generated by hardware timers, so a busy task can't stretch a pulse." },
  wifi: { title: "CGU → user · Wi-Fi web server", text: "The ESP32-C3 serves telemetry to a browser in real time. The packet structure and the web UI are left as future work." },
};

// Table 25 (average draw from datasheets)
const BUDGET = [
  ["STM32H723 (DAPU)", 150], ["STM32F446 (GNCU)", 46], ["ESP32-C3 (CGU)", 100], ["BMP390", 59.2], ["MS5611", 0.125],
  ["HX711", 1.2], ["NEO-M8N", 25], ["ICM-20948", 3.11], ["BNO055", 12.3],
];

export function BoardExplorer({ sfx }) {
  const [sel, setSel] = useState("DAPU");
  const [on, setOn] = useState(() => BUDGET.map(() => true));
  const [ref, w] = useWidth(520);
  const total = BUDGET.reduce((s, [, mA], i) => s + (on[i] ? mA : 0), 0);
  const hours = 3000 / total;

  const pick = (id) => { sfx && sfx.click(); setSel(id); };
  const node = (id, x, y, ww = 110, hh = 46) => (
    <g key={id} onClick={() => pick(id)} style={{ cursor: "pointer" }}>
      <rect x={x} y={y} width={ww} height={hh} rx={6} fill={sel === id ? "#000080" : "#ffe6c7"} stroke={sel === id ? "#000080" : "#c98a1a"} strokeWidth={1.5} />
      <text x={x + ww / 2} y={y + hh / 2 + 6} textAnchor="middle" fontSize={18} fontWeight={700} fill={sel === id ? "#fff" : "#000"}>{id}</text>
    </g>
  );
  const link = (id, x1, y1, x2, y2, label, lx, ly) => (
    <g key={id} onClick={() => pick(id)} style={{ cursor: "pointer" }}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={14} />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={sel === id ? "#c00000" : "#333"} strokeWidth={sel === id ? 3 : 2} markerEnd="url(#arr)" markerStart={id === "spi" || id === "uart" || id === "wifi" ? "url(#arrs)" : undefined} />
      <text x={lx} y={ly} textAnchor="middle" fontSize={11} fill={sel === id ? "#c00000" : "#333"} fontWeight={700}>{label}</text>
    </g>
  );
  const info = NODES[sel] || null;
  const linkInfo = LINKS[sel] || null;

  return (
    <div style={{ fontSize: 12 }}>
      <p style={{ margin: "0 0 6px" }}>
        The avionics are split across three processors so a fault in one can't take the others down. Click a unit or a link.
      </p>
      <div ref={ref} style={{ boxShadow: SUNKEN, background: "#fff", padding: 2 }}>
        <svg viewBox="0 0 560 250" width="100%" style={{ display: "block", maxHeight: Math.max(200, w * 0.46) }}>
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#333" /></marker>
            <marker id="arrs" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M10,0 L0,5 L10,10 z" fill="#333" /></marker>
          </defs>
          <rect x={235} y={4} width={90} height={22} rx={11} fill="#d5ecd4" stroke="#6a9a5a" />
          <text x={280} y={19} textAnchor="middle" fontSize={11}>Battery 7.4 V</text>
          <line x1={280} y1={26} x2={280} y2={42} stroke="#333" strokeWidth={2} markerEnd="url(#arr)" />
          {node("PDN", 225, 44)}
          <path d="M280,90 L280,104 M95,104 L465,104 M95,104 L95,124 M280,104 L280,124 M465,104 L465,124" stroke="#999" strokeWidth={2} fill="none" />
          <text x={378} y={99} fontSize={10} fill="#777">3.3 V rails</text>
          {node("GNCU", 40, 126)}
          {node("DAPU", 225, 126)}
          {node("CGU", 410, 126)}
          {link("spi", 152, 149, 223, 149, "SPI", 188, 142)}
          {link("uart", 337, 149, 408, 149, "UART", 372, 142)}
          {link("pwmIn", 30, 230, 70, 174, "PWM in", 22, 214)}
          {link("pwmOut", 120, 174, 160, 230, "PWM out", 165, 214)}
          {link("wifi", 465, 174, 465, 222, "Wi-Fi", 495, 202)}
          <text x={22} y={244} fontSize={11}>RC receiver</text>
          <text x={150} y={244} fontSize={11}>Servos / ESC</text>
          <text x={440} y={238} fontSize={11}>Browser</text>
          <text x={280} y={192} textAnchor="middle" fontSize={10} fill="#555">IMU · baros · GNSS · pitot · AOA · mic · flex · SD</text>
        </svg>
      </div>

      {info && (
        <Group title={info.title}>
          <div style={{ ...mono, marginBottom: 6, color: "#000080" }}>{info.chip}</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <tbody>
              {info.rows.map(([k, v]) => (
                <tr key={k}>
                  <td style={{ fontWeight: 700, padding: "2px 6px 2px 0", verticalAlign: "top", whiteSpace: "nowrap" }}>{k}</td>
                  <td style={{ padding: "2px 0" }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Group>
      )}
      {linkInfo && (
        <Group title={linkInfo.title}>
          <div style={{ fontSize: 12 }}>{linkInfo.text}</div>
        </Group>
      )}

      <Group title="Power budget (Table 25)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "2px 10px" }}>
          {BUDGET.map(([name, mA], i) => (
            <label key={name} style={{ ...ui.label }}>
              <input type="checkbox" checked={on[i]} onChange={() => { sfx && sfx.click(); setOn((o) => o.map((v, j) => (j === i ? !v : v))); }} />
              <span style={{ flex: 1 }}>{name}</span>
              <span style={mono}>{mA} mA</span>
            </label>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          <Stat label="Average draw" value={`${total.toFixed(1)} mA`} />
          <Stat label="Ideal runtime (3000 mAh)" value={`${hours.toFixed(1)} h`} />
          <Stat label="Thesis estimate, full system" value="6.9 h" />
        </div>
        <Note>Two cells in series double the voltage, not the capacity, so the 3.3 V linear regulators draw from 3000 mAh. The ideal figure ignores regulator quiescent current and usable-capacity margin.</Note>
      </Group>

      <Group title="PCB">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <Stat label="Size (max 100 × 100)" value="86 × 99 mm" ok />
          <Stat label="Layers (max 2)" value="2, FR-4 1.6 mm" ok />
          <Stat label="3.3 V traces" value="0.5 mm → 1.24 A" />
          <Stat label="Signal traces" value="0.2 mm → 0.71 A" />
        </div>
        <Note>Trace widths sized in Saturn PCB for 1 oz copper and a 10 °C rise; 6/6 mil clearance, 0.3 mm minimum drill, ground planes.</Note>
      </Group>
    </div>
  );
}

/* ==================================================================
   2) RTOS SCHEDULER — fixed-priority preemptive FreeRTOS timeline
================================================================== */

// [name, priority, period ms, execution time ms (illustrative), offset ms]
// Priorities (Tables 31-33) and rates (Tables 30, 44, Section 7.3.4) are
// from the thesis; execution times are illustrative estimates.
const UNITS = {
  DAPU: {
    label: "DAPU · STM32H723",
    window: [20, 100],
    tasks: (osr16) => [
      ["Save data (log loop)", 14, 5, 0.4, 0],
      ["Transmit data", 13, 100, 0.3, 2],
      ["GPS (NEO-M8N)", 12, 100, 0.25, 1],
      ["IMU (ICM-20948)", 11, 5, 0.12, 0],
      ["Attitude fusion", 10, 5, 0.25, 0],
      ["Pitot", 9, 5, 0.03, 0],
      ["Altimeter BMP390", 8, osr16 ? 1000 / 11.61 : 10, 0.08, 0],
      ["Altimeter MS5611", 7, 20, 0.1, 0],
      ["Altitude fusion", 6, 5, 0.08, 0],
      ["Position fusion", 5, 5, 0.3, 0],
      ["Health management", 4, 50, 0.15, 3],
      ["AOA", 3, 5, 0.03, 0],
      ["RPM (FFT 1024)", 2, 1000, 0.6, 40],
      ["Surface deflection", 1, 5, 0.03, 0],
    ],
  },
  GNCU: {
    label: "GNCU · STM32F446",
    window: [40, 200],
    tasks: () => [
      ["Read RC receiver", 10, 20, 0.05, 0],
      ["Backup IMU (BNO055)", 9, 10, 0.2, 0],
      ["Elevator inner loop (θ)", 8, 20, 0.05, 0],
      ["Aileron inner loop (φ)", 7, 20, 0.05, 0],
      ["Rudder coordination (β)", 6, 20, 0.05, 0],
      ["Elevator outer loop (h)", 5, 200, 0.04, 0],
      ["Aileron outer loop (χ)", 4, 200, 0.04, 0],
      ["Path following", 3, 200, 0.1, 0],
      ["Path manager", 2, 200, 0.15, 0],
      ["Transmit data", 1, 20, 0.3, 0],
    ],
  },
  CGU: {
    label: "CGU · ESP32-C3",
    window: [100, 400],
    tasks: () => [
      ["Collect data", 3, 20, 0.5, 0],
      ["Web server", 2, 100, 4, 5],
      ["Transmit (Wi-Fi)", 1, 100, 2, 10],
    ],
  },
};

const MEASURED = [
  ["Log loop (base)", 200, 200.01],
  ["ICM-20948", 200, 200.0],
  ["BMP390", 100, 11.61],
  ["NEO-M8N (NAV-PVT)", 10, 10.0],
  ["RPM (FFT)", 1, 0.994], // shown as 0.99 Hz, -0.6 % in Table 44
];

const TASK_COLORS = ["#1a6fd6", "#d9480f", "#2b8a3e", "#ae3ec9", "#e8590c", "#0c8599", "#c2255c", "#5f3dc4", "#5c940d", "#c92a2a", "#364fc7", "#a61e4d", "#087f5b", "#e67700"];

function schedule(tasks, windowMs, load) {
  const TICK = 0.01; // ms
  const N = Math.round(windowMs / TICK);
  const st = tasks.map(([name, prio, period, exec, offset], i) => ({
    i, name, prio, P: Math.max(1, Math.round(period / TICK)), C: Math.max(1, Math.round((exec * load) / TICK)), O: Math.round(offset / TICK),
    rem: 0, rel: 0, worst: 0, jobs: 0, done: 0, misses: 0, busy: 0,
  }));
  const segs = [];
  const releases = [];
  let cur = -1, segStart = 0;
  for (let t = 0; t < N; t++) {
    for (const s of st) {
      if (t >= s.O && (t - s.O) % s.P === 0) {
        if (s.rem > 0) s.misses++; // previous job still running at the next release
        s.rem += s.C; s.rel = s.rem === s.C ? t : s.rel; s.jobs++;
        releases.push([s.i, t]);
      }
    }
    let run = null;
    for (const s of st) if (s.rem > 0 && (!run || s.prio > run.prio)) run = s;
    const id = run ? run.i : -1;
    if (id !== cur) { if (cur >= 0) segs.push([cur, segStart, t]); cur = id; segStart = t; }
    if (run) {
      run.rem--; run.busy++;
      if (run.rem === 0) { run.done++; run.worst = Math.max(run.worst, t + 1 - run.rel); }
    }
  }
  if (cur >= 0) segs.push([cur, segStart, N]);
  const busy = st.reduce((a, s) => a + s.busy, 0);
  return { st, segs, releases, N, TICK, util: busy / N };
}

function Gantt({ tasks, result, windowMs }) {
  const [ref, w] = useWidth(520);
  const canvasRef = useRef(null);
  const rowH = 15, L = Math.min(150, Math.max(96, w * 0.3)), T = 4, B = 20;
  const h = T + tasks.length * rowH + B;
  const order = useMemo(() => tasks.map((t, i) => i).sort((a, b) => tasks[b][1] - tasks[a][1]), [tasks]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
    g.font = "10px Tahoma, sans-serif";
    const pw = w - L - 6;
    const X = (tick) => L + (tick / result.N) * pw;
    const rowOf = {};
    order.forEach((ti, r) => { rowOf[ti] = r; });
    // grid
    const step = windowMs <= 25 ? 1 : windowMs <= 50 ? 5 : windowMs <= 120 ? 10 : windowMs <= 250 ? 20 : 50;
    g.strokeStyle = "#ececec"; g.fillStyle = "#333"; g.textAlign = "center";
    for (let ms = 0; ms <= windowMs + 1e-9; ms += step) {
      const x = Math.round(L + (ms / windowMs) * pw) + 0.5;
      g.beginPath(); g.moveTo(x, T); g.lineTo(x, T + tasks.length * rowH); g.stroke();
      g.fillText(`${ms}`, x, h - 7);
    }
    g.textAlign = "right"; g.fillText("ms", w - 2, h - 7);
    order.forEach((ti, r) => {
      const y = T + r * rowH;
      if (r % 2) { g.fillStyle = "#f7f7f7"; g.fillRect(L, y, pw, rowH); }
      g.fillStyle = result.st[ti].misses ? "#c00000" : "#000";
      g.textAlign = "right";
      const name = `${tasks[ti][1]} · ${tasks[ti][0]}`;
      let label = name;
      while (g.measureText(label).width > L - 6 && label.length > 4) label = label.slice(0, -2);
      g.fillText(label === name ? name : label + "…", L - 4, y + rowH - 4);
    });
    result.segs.forEach(([ti, a, b]) => {
      const y = T + rowOf[ti] * rowH + 2;
      g.fillStyle = TASK_COLORS[ti % TASK_COLORS.length];
      g.fillRect(X(a), y, Math.max(1, X(b) - X(a)), rowH - 4);
    });
    g.strokeStyle = "#000";
    result.releases.forEach(([ti, t]) => {
      const x = Math.round(X(t)) + 0.5, y = T + rowOf[ti] * rowH;
      g.beginPath(); g.moveTo(x, y + 1); g.lineTo(x, y + 5); g.stroke();
    });
    g.strokeStyle = "#808080"; g.strokeRect(L + 0.5, T + 0.5, pw, tasks.length * rowH);
  }, [w, h, L, tasks, result, order, windowMs]);

  return (
    <div ref={ref} style={{ boxShadow: SUNKEN, padding: 2, background: "#fff" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: h, display: "block" }} />
    </div>
  );
}

export function RTOSScheduler({ sfx }) {
  const [unit, setUnit] = useState("DAPU");
  const [osr16, setOsr16] = useState(true);
  const [load, setLoad] = useState(1);
  const [zoom, setZoom] = useState(0);
  const U = UNITS[unit];
  const windowMs = U.window[zoom];
  const tasks = useMemo(() => U.tasks(osr16), [U, osr16]);
  const result = useMemo(() => schedule(tasks, windowMs, load), [tasks, windowMs, load]);
  const misses = result.st.reduce((a, s) => a + s.misses, 0);
  const starved = result.st.filter((s) => s.jobs > 0 && s.done === 0).length;
  const fast = [...result.st].sort((a, b) => a.prio - b.prio).find((s) => s.P * result.TICK <= windowMs / 2);

  return (
    <div style={{ fontSize: 12 }}>
      <p style={{ margin: "0 0 6px" }}>
        Each unit runs FreeRTOS with fixed-priority preemption: the highest-priority ready task always runs.
        Ticks mark releases; a task in red missed a period.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
        {Object.keys(UNITS).map((u) => (
          <Btn key={u} sfx={sfx} active={unit === u} onClick={() => { setUnit(u); setZoom(0); }}>{UNITS[u].label}</Btn>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 4 }}>
        <span style={ui.label}>Window:</span>
        {U.window.map((wms, i) => (
          <Btn key={wms} sfx={sfx} active={zoom === i} onClick={() => setZoom(i)}>{wms} ms</Btn>
        ))}
        {unit === "DAPU" && (
          <label style={ui.label}>
            <input type="checkbox" checked={osr16} onChange={() => { sfx && sfx.click(); setOsr16((v) => !v); }} />
            BMP390 oversampling ×16 (final config)
          </label>
        )}
      </div>
      <Slider label="CPU load ×" value={load} min={0.5} max={unit === "CGU" ? 4 : 12} step={0.1} onChange={setLoad} format={(v) => `${v.toFixed(1)}×`} />

      <Gantt tasks={tasks} result={result} windowMs={windowMs} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        <Stat label="CPU utilisation" value={`${(result.util * 100).toFixed(1)} %`} ok={result.util < 0.7} />
        <Stat label="Missed periods" value={misses} ok={misses === 0} />
        <Stat label="Tasks starved" value={starved} ok={starved === 0} />
        {fast && <Stat label={`Worst response: ${fast.name}`} value={`${(fast.worst * result.TICK).toFixed(2)} ms`} />}
      </div>

      {unit === "DAPU" && (
        <Group title="Measured on the integrated system (10 min log, Table 44)">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr>{["Task", "Target [Hz]", "Measured [Hz]", "Deviation"].map((hh) => <th key={hh} style={{ textAlign: "left", background: "#c0c0c0", boxShadow: RAISED, padding: "2px 4px" }}>{hh}</th>)}</tr>
            </thead>
            <tbody>
              {MEASURED.map(([n, tgt, m]) => {
                const dev = ((m - tgt) / tgt) * 100;
                return (
                  <tr key={n} style={{ color: Math.abs(dev) > 5 ? "#a00000" : "#000" }}>
                    <td style={{ padding: "2px 4px" }}>{n}</td>
                    <td style={mono}>{tgt}</td>
                    <td style={mono}>{m}</td>
                    <td style={mono}>{dev.toFixed(1)} %</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Note>
            The BMP390 miss is a configuration choice, not a scheduling failure: ×16 oversampling buys resolution with a longer internal conversion,
            so the sensor itself only produces 11.61 samples/s. The task rate was re-specified to ≈11 Hz.
          </Note>
        </Group>
      )}
      {unit === "GNCU" && (
        <Note>Inner loops run at 50 Hz because the servos only take a new pulse every 20 ms frame; running them faster wouldn't reach the surfaces. Outer loops and guidance run 10× slower (5 Hz) to keep the bands separated.</Note>
      )}
      {unit === "CGU" && (
        <Note>The CGU isn't in any control loop, so here FreeRTOS just keeps the web server from blocking data collection.</Note>
      )}
      <Note>Priorities and rates are from the thesis; execution times are illustrative. Push the load up to watch the lowest-priority tasks starve first while the critical ones keep their period.</Note>
    </div>
  );
}

/* ==================================================================
   3) FAILSAFE PANEL — power switch, DAPU state machine, health
      management, GNCU manual/auto logic and the LED bar
================================================================== */

const TICK_MS = 20; // 50 Hz, the GNCU's RC read rate
// Illustrative timings (the thesis gives the logic, not these numbers)
const BOOT_S = 0.6, SELFTEST_S = 2.0, GPS_FIX_S = 8, WATCHDOG_S = 0.5, AUTO_READS = 5, HEALTH_EVERY = 5;

const FAULTS = [
  ["gps", "GPS (NEO-M8N)", true],
  ["imu", "IMU (ICM-20948)", true],
  ["bmp", "Baro BMP390", true],
  ["ms", "Baro MS5611", true],
  ["batt", "Battery voltage", true],
  ["deadline", "Task deadline overrun", true],
  ["aoa", "AOA vane", false],
  ["mic", "Microphone (RPM)", false],
  ["flex", "Flex sensors", false],
];

const STATE_INFO = {
  OFF: "Switch off. Nothing powered.",
  BOOT: "Peripherals and clocks initialising.",
  SELFTEST: "Checking every sensor and link; averaging the gyro (bias) and both barometers (h = 0) with the aircraft still.",
  WARMUP: "Warm-up line is high: sensors run and the GPS gets a fix, but the DAPU sends the GNCU a heartbeat + no-op, so no command reaches the surfaces.",
  ARMED: "Everything validated and ready.",
  FLIGHT: "Nominal: acquisition, estimation and control running; health management keeps watching in the background.",
  FAILSAFE: "Critical fault confirmed. The DAPU flags it over SPI and the GNCU is forced back to manual.",
};

function initSim() {
  return {
    t: 0, sw: "off", dapu: "OFF", stT: 0, powT: 0, modeSw: "manual", glitch: 0, autoCount: 0, gncu: "MANUAL",
    inj: {}, strikes: {}, conf: {}, spiCut: false, cguCut: false, hung: false, hungT: 0, tick: 0, ready: false,
    log: [],
  };
}

function stepSim(s0) {
  const s = { ...s0, inj: s0.inj, strikes: { ...s0.strikes }, conf: { ...s0.conf }, log: s0.log };
  const dt = TICK_MS / 1000;
  const log = (m) => { s.log = [[s.t.toFixed(2), m], ...s.log].slice(0, 40); };
  const to = (st, m) => { if (s.dapu !== st) { s.dapu = st; s.stT = 0; log(m || `DAPU → ${st}`); } };
  s.t += dt; s.tick++;
  if (s.sw === "off") return s;
  s.powT += dt;

  // watchdog: a hung supervisor stops kicking it
  if (s.hung) {
    s.hungT += dt;
    if (s.hungT >= WATCHDOG_S) {
      s.hung = false; s.hungT = 0; s.strikes = {}; s.conf = {}; s.ready = false;
      log(`Watchdog expired (${WATCHDOG_S} s) → MCU reset`);
      to("BOOT", "DAPU → BOOT");
    }
  } else {
    s.stT += dt;
    // health management every HEALTH_EVERY ticks; a fault counts after 2 consecutive checks
    if (s.dapu !== "BOOT" && s.tick % HEALTH_EVERY === 0) {
      FAULTS.forEach(([id, name, critical]) => {
        const bad = !!s.inj[id];
        if (bad) {
          s.strikes[id] = (s.strikes[id] || 0) + 1;
          if (s.strikes[id] === 2 && !s.conf[id]) { s.conf[id] = true; log(`Health: ${name} fault confirmed (${critical ? "critical" : "non-critical"})`); }
        } else {
          if (s.conf[id]) log(`Health: ${name} OK again`);
          s.strikes[id] = 0; s.conf[id] = false;
        }
      });
    }
    const critical = FAULTS.some(([id, , c]) => c && s.conf[id]);
    const gpsFix = s.powT >= GPS_FIX_S;

    switch (s.dapu) {
      case "OFF": to("BOOT", "Power on → BOOT"); break;
      case "BOOT": if (s.stT >= BOOT_S) to("SELFTEST"); break;
      case "SELFTEST":
        if (s.stT >= SELFTEST_S && !critical) {
          if (s.sw === "warmup") to("WARMUP");
          else if (gpsFix) { s.ready = true; to("ARMED"); }
        }
        break;
      case "WARMUP":
        s.ready = gpsFix && !critical;
        if (s.sw === "on") { if (s.ready) to("ARMED", "Pilot set switch to On → ARMED"); else to("SELFTEST", "Switch On before checks passed → back to SELFTEST"); }
        break;
      case "ARMED":
        if (critical) { s.ready = false; to("SELFTEST", "Critical fault before flight → SELFTEST"); }
        break;
      case "FLIGHT":
        if (critical) to("FAILSAFE", "Critical fault in flight → FAILSAFE");
        break;
      default: break;
    }
  }

  // GNCU: RC mode channel read every tick (50 Hz)
  const dapuAlive = !s.hung && s.dapu !== "BOOT";
  const linkOk = !s.spiCut && dapuAlive;
  const readAuto = s.glitch > 0 ? true : s.modeSw === "auto";
  if (s.glitch > 0) s.glitch--;
  if (!readAuto || s.dapu === "FAILSAFE") {
    if (s.gncu !== "MANUAL") log(s.dapu === "FAILSAFE" ? "GNCU forced to MANUAL by FAILSAFE" : "Mode channel = manual → GNCU MANUAL (immediate)");
    s.gncu = "MANUAL"; s.autoCount = 0;
  } else if (s.gncu === "MANUAL") {
    s.autoCount++;
    if (s.autoCount >= AUTO_READS) {
      if (s.dapu === "FLIGHT" && linkOk) { s.gncu = "AUTO"; log(`${AUTO_READS} consecutive auto reads → GNCU AUTO`); }
      else s.autoCount = AUTO_READS;
    }
  }
  if (s.gncu === "AUTO" && !linkOk) { s.gncu = "DEGRADED"; log("SPI heartbeat lost → AUTO degraded on BNO055 attitude"); }
  if (s.gncu === "DEGRADED" && linkOk) { s.gncu = "AUTO"; log("SPI heartbeat back → AUTO"); }
  return s;
}

function Led({ on, color, label, blink }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, width: 58 }}>
      <div style={{ width: 14, height: 14, borderRadius: 7, background: on ? color : "#3a3a3a", boxShadow: on ? `0 0 6px 2px ${color}` : "inset 1px 1px 2px #000", transition: blink ? "none" : "background 0.1s" }} />
      <span style={{ fontSize: 9, textAlign: "center", lineHeight: 1.1 }}>{label}</span>
    </div>
  );
}

export function FailsafePanel({ sfx }) {
  const simRef = useRef(initSim());
  const [, force] = useState(0);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => { simRef.current = stepSim(simRef.current); force((n) => n + 1); }, TICK_MS);
    return () => clearInterval(id);
  }, [running]);

  const s = simRef.current;
  const set = (patch) => { sfx && sfx.click(); simRef.current = { ...simRef.current, ...(typeof patch === "function" ? patch(simRef.current) : patch) }; force((n) => n + 1); };
  const setSwitch = (sw) => set((cur) => (sw === "off" ? { ...initSim(), modeSw: cur.modeSw, inj: cur.inj, t: cur.t, log: [[cur.t.toFixed(2), "Switch Off → all power removed"], ...cur.log].slice(0, 40) } : { sw }));
  const powered = s.sw !== "off";
  const pre = ["BOOT", "SELFTEST", "WARMUP"].includes(s.dapu);
  const anySensorFault = FAULTS.some(([id]) => s.conf[id]);
  const sensorsLed = powered && !s.hung && (pre ? s.ready || (s.dapu === "WARMUP" && s.powT >= GPS_FIX_S && !anySensorFault) : ["ARMED", "FLIGHT", "FAILSAFE"].includes(s.dapu) && !anySensorFault);
  const heartbeat = powered && (s.hung ? true : Math.floor(s.t * 2) % 2 === 0);
  const buzz = powered && !s.hung && s.powT > 1 && s.powT % 5 < 0.15;
  const gpsFix = s.powT >= GPS_FIX_S;
  const surfaces = !powered ? "unpowered"
    : pre ? "held (no-op from DAPU)"
    : s.gncu === "MANUAL" ? "pilot (pass-through)"
    : s.gncu === "AUTO" ? "autopilot (GNCU)"
    : "autopilot on backup attitude";
  const states = ["BOOT", "SELFTEST", "WARMUP", "ARMED", "FLIGHT", "FAILSAFE"];

  return (
    <div style={{ fontSize: 12 }}>
      <p style={{ margin: "0 0 6px" }}>
        Power the board, walk it through warm-up, take off, then break things. Health management, the watchdog and the GNCU's mode logic do the rest.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <Group title="Power switch (PDN)">
          <div style={{ display: "flex", gap: 4 }}>
            {[["off", "Off"], ["warmup", "Warm-up"], ["on", "On"]].map(([id, l]) => (
              <Btn key={id} sfx={null} active={s.sw === id} onClick={() => setSwitch(id)}>{l}</Btn>
            ))}
          </div>
        </Group>
        <Group title="Pilot (RC)">
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <Btn sfx={null} active={s.modeSw === "manual"} onClick={() => set({ modeSw: "manual" })}>Manual</Btn>
            <Btn sfx={null} active={s.modeSw === "auto"} onClick={() => set({ modeSw: "auto" })}>Auto</Btn>
            <Btn sfx={null} onClick={() => set({ glitch: 2 })}>Mode glitch (2 frames)</Btn>
            <Btn sfx={null} onClick={() => set((c) => (c.dapu === "ARMED" ? { dapu: "FLIGHT", stT: 0, log: [[c.t.toFixed(2), "Throttle up → FLIGHT"], ...c.log].slice(0, 40) } : {}))} style={{ opacity: s.dapu === "ARMED" ? 1 : 0.5 }}>Take off</Btn>
          </div>
        </Group>
      </div>

      <div style={{ display: "flex", gap: 2, flexWrap: "wrap", margin: "8px 0" }}>
        {states.map((st) => (
          <div key={st} style={{ flex: "1 1 70px", textAlign: "center", padding: "4px 2px", fontSize: 10, fontWeight: 700, boxShadow: s.dapu === st ? SUNKEN : RAISED, background: s.dapu === st ? (st === "FAILSAFE" ? "#c00000" : "#000080") : "#c0c0c0", color: s.dapu === st ? "#fff" : "#000" }}>
            {st}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, minHeight: 30 }}>{s.hung ? <b style={{ color: "#a00000" }}>Supervisor task hung: the watchdog isn't being refreshed… ({s.hungT.toFixed(2)} s)</b> : STATE_INFO[s.dapu]}</div>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 4, padding: 8, background: "#1b1b1b", boxShadow: SUNKEN, color: "#ddd", flexWrap: "wrap" }}>
        <Led on={heartbeat} color="#3cff3c" label="Working" blink />
        <Led on={powered && s.dapu !== "BOOT" && !s.hung} color="#3cff3c" label="SD card" />
        <Led on={sensorsLed} color="#3cff3c" label="Sensors" />
        <Led on={powered && !s.spiCut && s.dapu !== "BOOT" && !s.hung} color="#3cff3c" label="GNCU link" />
        <Led on={powered && !s.cguCut && s.dapu !== "BOOT" && !s.hung} color="#3cff3c" label="CGU link" />
        <Led on={powered && s.sw === "warmup"} color="#ffd43b" label="Warm-up" />
        <div style={{ marginLeft: "auto", fontSize: 18, opacity: buzz ? 1 : 0.15 }} title="Buzzer: beeps every 5 s">🔔</div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        <Stat label="GNCU mode" value={s.gncu === "DEGRADED" ? "AUTO (degraded)" : s.gncu} />
        <Stat label="Surfaces commanded by" value={surfaces} />
        <Stat label="GPS fix" value={powered ? (gpsFix ? "3D fix" : `acquiring ${s.powT.toFixed(1)} s`) : "—"} ok={powered ? gpsFix : undefined} />
        <Stat label="Auto reads" value={`${Math.min(s.autoCount, AUTO_READS)}/${AUTO_READS}`} />
      </div>

      <Group title="Inject faults">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(165px, 1fr))", gap: "2px 8px" }}>
          {FAULTS.map(([id, name, critical]) => (
            <label key={id} style={{ ...ui.label, color: s.conf[id] ? "#a00000" : "#000" }}>
              <input type="checkbox" checked={!!s.inj[id]} onChange={() => set((c) => ({ inj: { ...c.inj, [id]: !c.inj[id] } }))} />
              {name} {critical ? <b style={{ fontSize: 9 }}>CRIT</b> : null}
            </label>
          ))}
          <label style={ui.label}><input type="checkbox" checked={s.spiCut} onChange={() => set((c) => ({ spiCut: !c.spiCut }))} />SPI link DAPU⇄GNCU</label>
          <label style={ui.label}><input type="checkbox" checked={s.cguCut} onChange={() => set((c) => ({ cguCut: !c.cguCut }))} />UART link to CGU</label>
        </div>
        <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Btn sfx={null} onClick={() => set((c) => (c.sw !== "off" && !c.hung ? { hung: true, hungT: 0, log: [[c.t.toFixed(2), "Supervisor task hangs"], ...c.log].slice(0, 40) } : {}))}>Hang supervisor task</Btn>
          <Btn sfx={null} active={!running} onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Resume"}</Btn>
        </div>
      </Group>

      <div style={{ boxShadow: SUNKEN, background: "#fff", padding: 4, height: 120, overflowY: "auto", ...mono, fontSize: 10.5 }}>
        {s.log.length === 0 ? <span style={{ color: "#888" }}>Event log: set the switch to Warm-up to start.</span> : s.log.map(([t, m], i) => (
          <div key={i}><span style={{ color: "#888" }}>{t.padStart(7)} s</span> {m}</div>
        ))}
      </div>

      <Note>
        Logic from the thesis: faults confirmed after 2 consecutive checks; critical faults (GPS, IMU, barometers, deadlines, battery) trigger Failsafe in flight,
        non-critical ones (AOA, RPM, flex) only clear the sensor LED and get reported to the CGU; Auto needs several consecutive reads, Manual is immediate.
        Timings ({BOOT_S} s boot, {SELFTEST_S} s self-test, {GPS_FIX_S} s GPS fix, {WATCHDOG_S} s watchdog, {AUTO_READS} reads) are illustrative.
      </Note>
    </div>
  );
}

/* ==================================================================
   4) SIGNAL CHAIN — pitot front-end, prop RPM by FFT, altitude fusion
================================================================== */

const isaRho = (hM) => { const T = 288.15 - 0.0065 * hM; return 1.225 * Math.pow(T / 288.15, 4.2559); };

function PitotTab({ sfx }) {
  const [V, setV] = useState(15);
  const [alt, setAlt] = useState(760);
  const [sens, setSens] = useState(1.25); // mV per kPa: 50 mV (worst) or 100 mV (best) at 40 kPa
  const [rg, setRg] = useState(100);
  const [correct, setCorrect] = useState(true);
  const G = 1 + 100000 / rg; // INA333
  const rho = isaRho(alt);
  const counts = (v) => {
    const q = 0.5 * rho * v * v / 1000; // kPa
    return Math.min(65535, Math.round(((q * sens * G) / 1000 / 3.3) * 65535));
  };
  const q = 0.5 * rho * V * V / 1000;
  const mv = q * sens;
  const vout = (mv * G) / 1000;
  const c = counts(V);
  const sat = vout >= 3.3;
  // speed resolution: dV per count = 1 / (dCounts/dV)
  const dcdv = (rho * V * sens * G / 1000 / 1000 / 3.3) * 65535;
  const res = V > 0.1 ? 1 / dcdv : Infinity;
  const vAssumedSL = Math.sqrt((2 * q * 1000) / 1.225);
  const series = useMemo(() => {
    const x = [], y = [];
    for (let v = 0; v <= 25.001; v += 0.25) { x.push(v); y.push(counts(v)); }
    return [{ x, y, color: "#1a6fd6", width: 2 }, { x: [V, V], y: [0, c], color: "#c00000", dash: [3, 3] }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rho, sens, G, V, c]);

  return (
    <div>
      <p style={{ margin: "6px 0" }}>
        The MPS20N0040D is a Wheatstone bridge rated for 40 kPa, but at 20 m/s the pitot only sees ≈0.25 kPa: a fraction of a millivolt.
        An INA333 instrumentation amp at its maximum gain (G = 1000, R<sub>g</sub> ≈ 100 Ω on a 10 kΩ trimmer) lifts it into the 16-bit ADC.
      </p>
      <Slider label="Airspeed" value={V} min={0} max={25} step={0.5} onChange={setV} format={(v) => `${v.toFixed(1)} m/s`} />
      <Slider label="Altitude" value={alt} min={0} max={1000} step={10} onChange={setAlt} format={(v) => `${v} m`} />
      <Slider label="Gain resistor" value={rg} min={100} max={10000} step={1} log onChange={(v) => setRg(Math.round(v))} format={(v) => `${Math.round(v)} Ω`} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "4px 0" }}>
        <Btn sfx={sfx} active={sens === 1.25} onClick={() => setSens(1.25)}>Worst-case sensor (50 mV FS)</Btn>
        <Btn sfx={sfx} active={sens === 2.5} onClick={() => setSens(2.5)}>Best-case sensor (100 mV FS)</Btn>
      </div>
      <Chart series={series} xMin={0} xMax={25} yMin={0} yMax={Math.max(2000, Math.min(65535, counts(25) * 1.1))} height={170} xLabel="Airspeed [m/s]" yLabel="ADC counts" hLines={sat ? [{ y: 65535, color: "#c00000", label: "saturated" }] : []} bands={[{ x0: 0, x1: 20, color: "rgba(0,128,0,0.06)", label: "RA.02 envelope" }]} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        <Stat label="Dynamic pressure" value={`${(q * 1000).toFixed(1)} Pa`} />
        <Stat label="Bridge output" value={`${mv.toFixed(3)} mV`} />
        <Stat label={`Amplified (G = ${G.toFixed(0)})`} value={`${vout.toFixed(3)} V`} ok={!sat} />
        <Stat label="ADC counts" value={c} />
        <Stat label="ADC range used" value={`${((Math.min(vout, 3.3) / 3.3) * 100).toFixed(1)} %`} />
        <Stat label="Speed resolution" value={Number.isFinite(res) ? `${res < 0.01 ? res.toFixed(4) : res.toFixed(3)} m/s/bit` : "—"} />
      </div>
      <Group title="Density correction">
        <label style={ui.label}>
          <input type="checkbox" checked={correct} onChange={() => { sfx && sfx.click(); setCorrect((v) => !v); }} />
          Correct ρ using the barometric altitude (as the firmware does)
        </label>
        <div style={{ fontSize: 12, marginTop: 4 }}>
          Speed shown: <b>{(correct ? V : vAssumedSL).toFixed(2)} m/s</b>
          {!correct && <span style={{ color: "#a00000" }}> ({(((vAssumedSL - V) / Math.max(V, 0.01)) * 100).toFixed(1)} % error from assuming sea-level ρ at {alt} m)</span>}
        </div>
      </Group>
      <Note>Output ∝ V², so resolution improves with speed. At G = 1000 the signal uses under a fifth of the ADC, which leaves margin against saturation from sensor tolerance, temperature and altitude. Values follow Table 19.</Note>
    </div>
  );
}

function fftMag(re) {
  const n = re.length;
  const im = new Float64Array(n);
  const r = Float64Array.from(re);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [r[i], r[j]] = [r[j], r[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const ar = r[i + k + len / 2], ai = im[i + k + len / 2];
        const tr = ar * wr - ai * wi, ti = ar * wi + ai * wr;
        r[i + k + len / 2] = r[i + k] - tr; im[i + k + len / 2] = im[i + k] - ti;
        r[i + k] += tr; im[i + k] += ti;
      }
    }
  }
  const out = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) out[k] = Math.hypot(r[k], im[k]);
  return out;
}

function RpmTab({ sfx }) {
  const FS = 1024, N = 1024, BLADES = 2;
  const [rpm, setRpm] = useState(4235);
  const [noise, setNoise] = useState(0.3);
  const [hann, setHann] = useState(true);
  const [aaf, setAaf] = useState(true);
  const [timer, setTimer] = useState(true);
  const [seed, setSeed] = useState(3);

  const res = useMemo(() => {
    const gauss = makeGauss(seed);
    const f0 = (rpm / 60) * BLADES;
    const lp = (f) => (aaf ? 1 / Math.sqrt(1 + Math.pow(f / 450, 4)) : 1); // ~450 Hz 2nd-order anti-aliasing filter
    const tones = [[f0, 1], [2 * f0, 0.45], [900, 1.3]]; // 900 Hz: illustrative motor/EMI component above Nyquist
    const x = new Float64Array(N);
    for (let n = 0; n < N; n++) {
      const t = n / FS + (timer ? 0 : gauss() * 0.0006); // polling jitter when not timer-triggered (illustrative)
      let v = 0;
      tones.forEach(([f, a]) => { v += a * lp(f) * Math.sin(2 * Math.PI * f * t + f * 0.01); });
      v += noise * gauss();
      const wgt = hann ? 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1))) : 1;
      x[n] = v * wgt;
    }
    const mag = fftMag(x);
    const ref = Math.max(...mag);
    const db = Array.from(mag, (m) => 20 * Math.log10(Math.max(m / ref, 1e-5)));
    let pk = 10;
    for (let k = 10; k <= 200; k++) if (mag[k] > mag[pk]) pk = k;
    return { f0, db, pk, est: (pk * 60) / BLADES };
  }, [rpm, noise, hann, aaf, timer, seed]);

  const freqs = useMemo(() => Array.from({ length: N / 2 }, (_, k) => k), []);
  const err = res.est - rpm;

  return (
    <div>
      <p style={{ margin: "6px 0" }}>
        An electret mic hears the blades pass: f = RPM/60 × 2. A hardware timer triggers the ADC at 1024 Hz into a DMA buffer, then CMSIS-DSP runs a 1024-point FFT:
        a 1 s window, so 1 Hz bins (≈30 RPM each), updated once a second. The peak is searched between 10 and 200 Hz.
      </p>
      <Slider label="Motor RPM" value={rpm} min={1000} max={5000} step={5} onChange={setRpm} format={(v) => `${v}`} />
      <Slider label="Noise" value={noise} min={0} max={2} step={0.05} onChange={setNoise} format={(v) => v.toFixed(2)} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, margin: "4px 0" }}>
        <label style={ui.label}><input type="checkbox" checked={hann} onChange={() => { sfx && sfx.click(); setHann((v) => !v); }} />Hann window</label>
        <label style={ui.label}><input type="checkbox" checked={aaf} onChange={() => { sfx && sfx.click(); setAaf((v) => !v); }} />Anti-aliasing filter (~450 Hz)</label>
        <label style={ui.label}><input type="checkbox" checked={timer} onChange={() => { sfx && sfx.click(); setTimer((v) => !v); }} />Timer-triggered sampling</label>
        <Btn sfx={sfx} onClick={() => setSeed((s) => s + 1)}>New noise</Btn>
      </div>
      <Chart
        series={[{ x: freqs, y: res.db, color: "#1a6fd6", width: 1.2 }]}
        xMin={0} xMax={512} yMin={-80} yMax={2} height={190} xLabel="Frequency [Hz]" yLabel="Magnitude [dB]"
        bands={[{ x0: 10, x1: 200, color: "rgba(0,128,0,0.07)", label: "search band" }, { x0: res.pk - 1.5, x1: res.pk + 1.5, color: "rgba(200,0,0,0.35)" }]}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        <Stat label="Blade-pass frequency" value={`${res.f0.toFixed(1)} Hz`} />
        <Stat label="Detected peak" value={`${res.pk} Hz`} />
        <Stat label="Estimated RPM" value={`${res.est}`} ok={Math.abs(err) <= 60} />
        <Stat label="Error" value={`${err > 0 ? "+" : ""}${err} RPM`} />
      </div>
      <Note>
        Try turning off the anti-aliasing filter: the 900 Hz component folds to 1024 − 900 = 124 Hz, inside the search band, and can beat the real peak.
        The 900 Hz tone, noise and jitter are illustrative. On the bench the sampling rate was right (1024 Hz), but a test with a phone playing 100 Hz and 120 Hz tones
        gave a detected frequency that wandered instead of locking on, so the onboard RPM estimate is still marked as future work.
      </Note>
    </div>
  );
}

function AltitudeTab({ sfx }) {
  const [seed, setSeed] = useState(11);
  const [qMul, setQMul] = useState(1);
  const sim = useMemo(() => {
    const g = makeGauss(seed);
    const DT = 0.005, T = 40;
    // bench test: the board is lifted along a ruler (smooth 1 s moves)
    const moves = [[5, 0, 1.0], [15, 1.0, 0.5], [25, 0.5, 0]];
    const hTrue = (t) => {
      let h = 0;
      for (const [t0, a, b] of moves) {
        if (t >= t0 + 1) h = b; else if (t >= t0) { h = a + (b - a) * 0.5 * (1 - Math.cos(Math.PI * (t - t0))); break; } else break;
      }
      return h;
    };
    const aTrue = (t) => {
      for (const [t0, a, b] of moves) if (t >= t0 && t < t0 + 1) return (b - a) * 0.5 * Math.PI * Math.PI * Math.cos(Math.PI * (t - t0));
      return 0;
    };
    const R_BMP = 0.25 ** 2, R_MS = 0.1 ** 2; // from the sensors' altitude resolution (Table 16)
    const sA = 0.09; // ICM-20948 noise ≈ 0.9 mg/√Hz × √100 Hz (illustrative bandwidth)
    let x = [0, 0, 0];
    let P = [[0.1, 0, 0], [0, 0.1, 0], [0, 0, 0.01]];
    const qa = (sA * sA) * qMul, qb = 1e-6;
    let biasTrue = 0.06, dBmp = 0, dMs = 0;
    const out = { t: [], h: [], fused: [], bmpT: [], bmp: [], msT: [], ms: [] };
    let eF = 0, eB = 0, eM = 0, nB = 0, nM = 0, n = 0, lastBmp = 0, lastMs = 0;
    const bmpEvery = 1 / 11.61, msEvery = 1 / 50;
    let nextBmp = 0, nextMs = 0;
    for (let k = 0; k * DT <= T; k++) {
      const t = k * DT;
      biasTrue += 0.0005 * g() * Math.sqrt(DT);
      dBmp += 0.02 * g() * Math.sqrt(DT); dMs += 0.02 * g() * Math.sqrt(DT); // slow drift seen on both barometers
      const am = aTrue(t) + biasTrue + sA * g();
      // predict
      const a = am - x[2];
      x = [x[0] + x[1] * DT + 0.5 * a * DT * DT, x[1] + a * DT, x[2]];
      const F = [[1, DT, -0.5 * DT * DT], [0, 1, -DT], [0, 0, 1]];
      const FP = F.map((r) => [0, 1, 2].map((j) => r[0] * P[0][j] + r[1] * P[1][j] + r[2] * P[2][j]));
      P = FP.map((r) => [0, 1, 2].map((j) => r[0] * F[j][0] + r[1] * F[j][1] + r[2] * F[j][2]));
      P[0][0] += 0.25 * DT ** 4 * qa; P[0][1] += 0.5 * DT ** 3 * qa; P[1][0] += 0.5 * DT ** 3 * qa; P[1][1] += DT * DT * qa; P[2][2] += qb * DT;
      const update = (z, R) => {
        const S = P[0][0] + R;
        const K = [P[0][0] / S, P[1][0] / S, P[2][0] / S];
        const y = z - x[0];
        x = x.map((v, i) => v + K[i] * y);
        const row0 = [...P[0]];
        P = P.map((r, i) => r.map((v, j) => v - K[i] * row0[j]));
      };
      if (t >= nextBmp) { lastBmp = hTrue(t) + dBmp + 0.25 * g(); update(lastBmp, R_BMP); out.bmpT.push(t); out.bmp.push(lastBmp); nextBmp += bmpEvery; eB += (lastBmp - hTrue(t)) ** 2; nB++; }
      if (t >= nextMs) { lastMs = hTrue(t) + dMs + 0.1 * g(); update(lastMs, R_MS); out.msT.push(t); out.ms.push(lastMs); nextMs += msEvery; eM += (lastMs - hTrue(t)) ** 2; nM++; }
      eF += (x[0] - hTrue(t)) ** 2; n++;
      if (k % 4 === 0) { out.t.push(t); out.h.push(hTrue(t)); out.fused.push(x[0]); }
    }
    return { ...out, rmsF: Math.sqrt(eF / n), rmsB: Math.sqrt(eB / nB), rmsM: Math.sqrt(eM / nM) };
  }, [seed, qMul]);

  return (
    <div>
      <p style={{ margin: "6px 0" }}>
        The altitude EKF estimates [h, dh/dt, accel bias]. It predicts with the vertical accelerometer at 200 Hz (projected with the attitude filter's output)
        and corrects with each barometer only when that sensor has a new sample: the BMP390 at 11.6 Hz (R = 0.25² m²) and the MS5611 at 50 Hz (R = 0.1² m²).
      </p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <Btn sfx={sfx} onClick={() => setSeed((s) => s + 1)}>New run</Btn>
      </div>
      <Slider label="Trust model ⇄ baro" value={qMul} min={0.05} max={50} step={0.01} log onChange={setQMul} format={(v) => `Q ×${v.toFixed(2)}`} />
      <Legend items={[{ label: "True height (ruler)", color: "#000", dash: true }, { label: "BMP390", color: "#bbbbbb" }, { label: "MS5611", color: "#8fb8e8" }, { label: "Fused estimate", color: "#c00000" }]} />
      <Chart
        series={[
          { x: sim.bmpT, y: sim.bmp, color: "#cccccc", width: 1 },
          { x: sim.msT, y: sim.ms, color: "#a9c8ee", width: 1 },
          { x: sim.t, y: sim.h, color: "#000", width: 1.5, dash: [5, 4] },
          { x: sim.t, y: sim.fused, color: "#c00000", width: 1.8 },
        ]}
        xMin={0} xMax={40} yMin={-0.8} yMax={1.8} height={200} xLabel="Time [s]" yLabel="Height [m]"
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        <Stat label="RMS error BMP390 alone" value={`${(sim.rmsB * 100).toFixed(1)} cm`} />
        <Stat label="RMS error MS5611 alone" value={`${(sim.rmsM * 100).toFixed(1)} cm`} />
        <Stat label="RMS error fused" value={`${(sim.rmsF * 100).toFixed(1)} cm`} ok={sim.rmsF < Math.min(sim.rmsB, sim.rmsM)} />
      </div>
      <Note>
        A simulation of the bench test planned in the thesis (lifting the board against a ruler), using the filter's design values; sensor noise, drift and accelerometer bias are illustrative.
        Push Q down and the estimate lags the moves; push it up and it copies the baro noise. Drift common to both barometers can't be fused away, which is why h = 0 is re-zeroed in self-test before every flight.
      </Note>
    </div>
  );
}

export function SignalChain({ sfx }) {
  const [tab, setTab] = useState("pitot");
  return (
    <div style={{ fontSize: 12 }}>
      <Tabs sfx={sfx} value={tab} onChange={setTab} tabs={[["pitot", "Pitot front-end"], ["rpm", "Prop RPM (FFT)"], ["alt", "Altitude fusion"]]} />
      <div style={{ boxShadow: RAISED, background: "#fff", padding: "4px 8px 8px" }}>
        {tab === "pitot" && <PitotTab sfx={sfx} />}
        {tab === "rpm" && <RpmTab sfx={sfx} />}
        {tab === "alt" && <AltitudeTab sfx={sfx} />}
      </div>
    </div>
  );
}
