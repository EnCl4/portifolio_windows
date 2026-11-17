import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, Minus, Square, ChevronsUp, Volume2, VolumeX, Music, Mail, Github, Linkedin, Instagram } from "lucide-react";
import { PIDLab, KalmanLab, FMEABoard } from "./research_apps";

/* ==================================================================
   HOW TO ADD A NEW PROJECT
   Just add an object to the PROJECTS array below. Nothing else in
   the app needs to change.

   {
     id:      "unique-slug",           // used internally, keep it unique
     title:   "Display Name",
     icon:    "🛠️",                    // any emoji, shows on desktop + taskbar
     tagline: "One line description",
     tech:    ["Thing A", "Thing B"],  // shown as little tag chips
     cover:   "https://... or images/your-cover.jpg",
                                        // MAIN picture. Clicking it in the
                                        // window sets it as the desktop wallpaper.
     body: [                           // the article content, top to bottom
       { t: "h",   v: "A heading" },
       { t: "p",   v: "A paragraph of text." },
       { t: "img", src: "https://... or images/figure1.jpg",
         caption: "Optional caption under the figure" },
       { t: "links", items: [          // row of contact/social buttons
         { icon: "mail",      label: "Email",     url: "mailto:you@example.com" },
         { icon: "linkedin",  label: "LinkedIn",  url: "https://linkedin.com/in/you" },
         { icon: "github",    label: "GitHub",    url: "https://github.com/you" },
         { icon: "instagram", label: "Instagram", url: "https://instagram.com/you" },
       ]},
     ],
   }

   In a real project (e.g. built with Vite), swap the `cover`/`img` src
   values for files you drop in public/images/<project-id>/ (reference
   them WITHOUT a leading slash, e.g. "images/<project-id>/x.jpg", so
   paths work on GitHub Pages too), and this
   component doesn't need to change at all. If you'd rather write full
   articles in markdown instead of the `body` array, say the word and
   I'll wire up react-markdown + gray-matter to parse .md files into
   this same shape.
================================================================== */

// Placeholder figure generator (no network needed) — replace `cover`/`src`
// with your own image URLs when you have real photos.
const ph = (label, from, to) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='400'>
      <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
        <stop offset='0' stop-color='${from}'/><stop offset='1' stop-color='${to}'/>
      </linearGradient></defs>
      <rect width='640' height='400' fill='url(#g)'/>
      <text x='320' y='210' font-family='Tahoma,sans-serif' font-size='28'
        fill='#ffffffcc' text-anchor='middle'>${label}</text>
    </svg>`
  )}`;

const PROJECTS = [
  {
    id: "F1-SteeringWheel",
    title: "F1 Steering Wheel",
    icon: "🏎️",
    tagline: "Custom wheel for sim racing",
    tech: ["Arduino", "3D printing", "Button mapping"],
    cover: ph("F1 Steering Wheel — Finished Build", "#7b4b2a", "#c98a4b"),
    body: [
      { t: "h", v: "Why build one" },
      { t: "p", v: "Renting shop time got old. Wanted something accurate enough for enclosures and PCB milling, in a garage footprint." },
      { t: "h", v: "Frame & motion" },
      { t: "p", v: "2020 extrusion frame, ballscrew Z, belt-driven X/Y. Everything modeled in FreeCAD before a single cut." },
      { t: "img", src: ph("FreeCAD Frame Model", "#2a3b7b", "#4b6bc9"), caption: "Frame assembly, modeled before cutting anything" },
      { t: "h", v: "Result" },
      { t: "p", v: "±0.05mm repeatability after tramming. Currently milling enclosures for the other projects on this site." },
      { t: "img", src: ph("First Test Cut", "#2a7b4e", "#4bc984"), caption: "First successful test cut" },
    ],
  },
  {
    id: "PowerController",
    title: "Power Controller",
    icon: "⚡",
    tagline: "IGNIS: an embedded PID power limiter for brushless motors in SAE Aerodesign UAVs (scientific initiation research, UFABC 2024–2025)",
    tech: ["ESP32", "PID control", "Kalman filter", "System identification", "MATLAB / Simulink", "KiCad PCB", "FMEA / FTA"],
    cover: "images/power-controller/p2-final.jpg",
    size: { w: 620, h: 600 },
    body: [
      { t: "h", v: "The problem" },
      { t: "p", v: "Since 2023, SAE Brasil Aerodesign requires electric propulsion with a power cap in the Regular class: 680 W, and 600 W in 2025. Going over the cap means a penalty. But airspeed, battery sag and the propeller change the load on the motor during the whole flight, so a fixed throttle either goes over the limit or leaves power unused." },
      { t: "p", v: "The goal was an onboard controller that measures the propulsion system's power in real time and drives the ESC to stay at the limit, while the pilot stays in command. The throttle stick sets the power setpoint (setpoint = throttle × Pmax), so full stick means exactly the legal maximum." },
      { t: "img", src: "images/power-controller/aircraft.jpg", caption: "Harpia Aerodesign UFABC's 2023 competition aircraft" },
      { t: "img", src: "images/power-controller/gmp-diagram.jpg", caption: "Propulsion chain: LiPo → wattmeter → ESC → motor + propeller, with the receiver sending PWM to the ESC" },
      { t: "h", v: "Requirements" },
      { t: "table", head: ["ID", "Requirement"], rows: [
        ["RqS.1", "Sensor accuracy ≥ 1 W"],
        ["RqS.2", "Sensing must not disturb the power system"],
        ["RqS.3", "Sampling time < 20 ms"],
        ["RqO.1", "The pilot keeps control in every situation"],
        ["RqO.2–6", "Works in bad weather, low power draw, light, small, redundant"],
        ["RqC.1", "Setpoint safety margin of 1 % (673.2 W)"],
        ["RqC.2", "Steady-state error ±1 %"],
        ["RqC.3", "Zero overshoot"],
        ["RqC.4", "Settling time < 1 s"],
      ]},
      { t: "h", v: "Choosing the hardware" },
      { t: "list", items: [
        "Voltage: a 43k/5k1 resistor divider. Its estimated error is 2.26 W, against 3 W for an INA219 and 30.6 W for a MAX471, and it costs R$0.20.",
        "Current: a WCS1700 Hall-effect sensor. The motor cable passes through it, so there's no shunt loss (RqS.2), and its thermal drift is low.",
        "MCU: an ESP32. It's the only dual-core option, which leaves room for redundancy (RqO.6). An external ADS1115 16-bit ADC over I²C replaced the noisy, slow internal ADC.",
        "Power: a step-down converter instead of a BEC (23.5 mV vs 106 mV ripple). Data is logged to an SD card.",
      ]},
      { t: "img", src: "images/power-controller/p1-protoboard.jpg", caption: "Prototype 1 on perfboard: ESP32, ADS1115, SD card module and step-down converter" },
      { t: "h", v: "Firmware" },
      { t: "p", v: "Written in C++ with PlatformIO. A modified Servo library accepts float 'angles' for finer PWM resolution, and a circular buffer holds the samples. Sampling and control are separate modules behind boolean switches, so the same firmware runs data-collection tests and closed-loop tests." },
      { t: "p", v: "Calibration against a lab supply gave linear fits: V = 0.0017283·x + 0.0236 (R² = 1) and I = 0.0065479·x − 88.36 (R² = 0.998)." },
      { t: "h", v: "Identifying the motor" },
      { t: "p", v: "Black-box identification: square throttle steps between 20 % and 40 % on an outdoor test bench, kept away from walls so ground effect wouldn't change the load. The first two cycles were discarded, because they showed a delayed start and an odd double peak. The remaining data was split 80/20 for training and validation, at a mean sample time of 11.64 ms (85.9 Hz)." },
      { t: "img", src: "images/power-controller/test-bench.jpg", caption: "Static test bench with the MN605-S KV320 motor and APC 22×10 propeller" },
      { t: "img", src: "images/power-controller/gmp-step-test.jpg", caption: "Power response to the throttle steps: at least second order, with clear overshoot" },
      { t: "p", v: "In MATLAB's System Identification Toolbox, 15 ARX-based transfer functions were compared. The best one, with 5 poles and 5 zeros, fit the validation data at 79.05 %." },
      { t: "img", src: "images/power-controller/tf-fit.jpg", caption: "Candidate transfer functions vs. validation data" },
      { t: "h", v: "Tuning, and why the first tune failed" },
      { t: "p", v: "The first Simulink tune (Kp = 0.0088, Ki = 0.7908) looked great on paper: 0.167 s rise, 0.22 % overshoot, 64.7° phase margin. A hardware-in-the-loop setup, with the real board talking to the Simulink plant over serial, caught a units bug first: elapsed time was in milliseconds instead of seconds." },
      { t: "img", src: "images/power-controller/hil-sim.jpg", caption: "Hardware-in-the-loop run: the ESP32 controls a simulated motor" },
      { t: "p", v: "Then two test matrices on the real motor (11 gain sets, scored by ISE) showed the real limit. The ESC only gets a new PWM pulse every 20 ms receiver frame, about 30 ms in practice, while the tune assumed continuous time. Aggressive gains oscillated: test 4 hit 58.5 % overshoot, with the PWM banging between maximum and minimum. The rule that came out of it: give the controller at least 20 iterations during the rise, so the rise time should be at least 600 ms." },
      { t: "img", src: "images/power-controller/kalman.jpg", caption: "1-D Kalman filter on each sensor channel: grey is raw, red is filtered" },
      { t: "p", v: "The final tune is a pure integrator, Ki = 0.25 with Kp = Kd = 0: 1.19 s rise, 2.36 s settling, 0 % overshoot, 33 dB gain margin, 94.3° phase margin. It gives up the < 1 s settling target to never overshoot the cap." },
      { t: "img", src: "images/power-controller/final-step.jpg", caption: "Bench step response to 680 W" },
      { t: "open", id: "pid-lab", label: "Try the gain sets yourself in PID Lab" },
      { t: "h", v: "Wind tunnel" },
      { t: "p", v: "In the wind tunnel, with a different propeller (APC 21×13.5) and ESC (T-Motor 70A), the controller held the 2025 cap of 600 W from 2 to 20 m/s. As the airflow helped turn the propeller, the controller lowered the throttle from 69.7 % at 0 m/s to 64.1 % at 8 m/s: same power, less battery." },
      { t: "img", src: "images/power-controller/wind-tunnel.jpg", caption: "Test bench at the tunnel outlet, with an anemometer measuring the real airspeed" },
      { t: "img", src: "images/power-controller/wind-results.jpg", caption: "Throttle (blue) and power (green) across the airspeed bands" },
      { t: "h", v: "Prototype 2: the IGNIS PCB" },
      { t: "p", v: "With the method proven, the next step was a real board. It's a 2-layer FR-4 PCB designed in KiCad: a bare ESP32 chip, USB-C with a CH340G, AMS1117 3.3 V / 5 V regulators fed from the receiver's 6 V bus (so no extra battery), an integrated SD card, and optional BMP280 / BMA253 sensors for future projects. Traces were sized to IPC-2152 in Saturn PCB. Ground planes on both layers, with via stitching around the analog traces, shield against EMI." },
      { t: "img", src: "images/power-controller/pcb-render.jpg", caption: "KiCad 3D render" },
      { t: "img", src: "images/power-controller/pcb-back.jpg", caption: "Bare board from PCBWay" },
      { t: "p", v: "There was no reflow oven, so the board was assembled on an old clothes iron driven by a dimmer, held at 155 °C (checked with an IR thermometer), with low-temperature Sn42Bi58 paste." },
      { t: "img", src: "images/power-controller/reflow-iron.jpg", caption: "The 'reflow station'" },
      { t: "img", src: "images/power-controller/pcb-assembled.jpg", caption: "Assembled board" },
      { t: "h", v: "Bring-up and debugging" },
      { t: "list", items: [
        "A 5 V–GND short found in the continuity test was cut with a hobby knife.",
        "Code uploads worked only once: the CH340G was fed 5 V instead of 3.3 V.",
        "The ADS1115 died after about 5 minutes, every time. Fixes: a 3.3 V supply, an op-amp buffer in front of its inputs, and the long parallel I²C traces (a crosstalk risk) replaced by an external jumper.",
        "It passed a 72 h stress test. The mean loop is 9.4 ms; SD writes, batched every 10 s, cause stalls over 90 ms in only 0.0013 % of cycles.",
      ]},
      { t: "img", src: "images/power-controller/i2c-crosstalk.jpg", caption: "The I²C traces running side by side for a long stretch" },
      { t: "h", v: "P1 vs P2" },
      { t: "table", head: ["", "P1 (perfboard)", "P2 (IGNIS)"], rows: [
        ["Voltage noise variance", "3.280", "0.300 (10.9× lower)"],
        ["Current noise variance", "11.415", "1.155 (9.9× lower)"],
        ["Mass", "128 g (without battery)", "56 g (complete)"],
        ["Size", "180 × 120 mm", "95 × 60 mm"],
      ]},
      { t: "img", src: "images/power-controller/p1-vs-p2-noise.jpg", caption: "Raw current reading during calibration: P1 (grey) vs P2 (red)" },
      { t: "open", id: "kalman", label: "Play with the filter in Kalman Filter" },
      { t: "h", v: "Is it safe to fly?" },
      { t: "p", v: "The controller sits between the pilot and the motor, so a failure can cost the aircraft. The analysis listed 61 failure modes across hardware, software and the system, then ran a fault tree analysis and an FMEA. The 118 mm critical analog trace is far longer than λ/10 at 2.4 GHz (12.5 mm), so it was simulated in openEMS from 1 to 9 GHz. The trace can pick up signals in that band, but very little field leaks outside it, which confirms the shielding works." },
      { t: "img", src: "images/power-controller/emi-sim.jpg", caption: "openEMS simulation of the electric field along the critical trace" },
      { t: "p", v: "In the FMEA, only one controller risk scores higher than the worst risk the aircraft already accepts (a wrong wattmeter reading, RPN 400): EMI, at RPN 560." },
      { t: "open", id: "fmea", label: "Explore the full FMEA Board" },
      { t: "h", v: "Results & next steps" },
      { t: "p", v: "The controller held the power limit on the bench and in the wind tunnel, and the PCB cut noise about 10× while it more than halved the mass and size. The open items are flight tests with the board on the aircraft, practical EMI testing, and a Markov-chain reliability model. Time ran out for all three." },
      { t: "credit", title: "Research", lines: [
        "Scientific initiation (IC) scholarship, call 01/2024, UFABC",
        "Advisor: Prof. Diego Paolo Ferruzzo Correa",
        "Built on Harpia Aerodesign UFABC's 2024 propulsion system",
      ]},
    ],
  },
  {
    id: "pid-lab",
    title: "PID Lab",
    icon: "🎛️",
    tagline: "Interactive simulator of the power controller's closed loop",
    tech: ["Simulation", "PID", "Discrete-time control"],
    cover: null,
    size: { w: 680, h: 640 },
    body: [],
    component: PIDLab,
  },
  {
    id: "kalman",
    title: "Kalman Filter",
    icon: "📉",
    tagline: "Tune the 1-D Kalman filters that clean the voltage and current signals",
    tech: ["Signal processing", "Kalman filter", "ADC calibration"],
    cover: null,
    size: { w: 640, h: 620 },
    body: [],
    component: KalmanLab,
  },
  {
    id: "fmea",
    title: "FMEA Board",
    icon: "⚠️",
    tagline: "Failure modes and risk priority numbers from the controller's safety analysis",
    tech: ["FMEA", "Reliability", "Safety"],
    cover: null,
    size: { w: 620, h: 600 },
    body: [],
    component: FMEABoard,
  },
  {
    id: "airplane",
    title: "Autonomous Airplane",
    icon: "✈️",
    tagline: "Waypoint navigation on a custom flight stack",
    tech: ["ArduPilot", "STM32 telemetry", "Python ground station"],
    cover: "images/rag-inspector/777x.jpg",
    body: [
      { t: "h", v: "Goal" },
      { t: "p", v: "Fly a fixed waypoint loop with no manual input, log telemetry over wifi in real time." },
      { t: "h", v: "Build notes" },
      { t: "p", v: "" },
    ],
  },
  {
    id: "about",
    title: "About Me",
    icon: "👤",
    tagline: "Engineer & maker",
    tech: [],
    cover: null,
    body: [
      { t: "h", v: "Hi, I'm Enzo Claro" },
      { t: "p", v: "Engineer by trade, maker by habit. This site is a running log of things I've built, from CNC hardware to LLM pipelines — with the reasoning behind each decision, not just the finished photo." },
      { t: "p", v: "Double-click an icon (or tap one) to open a project. Click a project's main photo to set it as the desktop wallpaper." },
      { t: "h", v: "Get in touch" },
      { t: "links", items: [
        { icon: "mail", label: "Email", url: "mailto:enzoclaro2003@gmail.com" },
        { icon: "linkedin", label: "LinkedIn", url: "https://www.linkedin.com/in/enzo-claro/" },
        { icon: "github", label: "GitHub", url: "https://github.com/EnCl4" },
        { icon: "instagram", label: "Instagram", url: "https://www.instagram.com/en_cl3/" },
      ]},
      { t: "credit", title: "Music", lines: [
        "Track: Everyone Has a Story",
        { text: "Music by ", url: "https://www.fiftysounds.com", label: "https://www.fiftysounds.com" },
      ]},
    ],
  },
];

/* ------------------------- STYLE HELPERS ------------------------- */
const bevel = {
  raisedOuter: {
    boxShadow:
      "inset -1px -1px 0 #0a0a0a, inset 1px 1px 0 #fff, inset -2px -2px 0 #808080, inset 2px 2px 0 #dfdfdf",
  },
  sunkenOuter: {
    boxShadow:
      "inset 1px 1px 0 #0a0a0a, inset -1px -1px 0 #fff, inset 2px 2px 0 #808080, inset -2px -2px 0 #dfdfdf",
  },
  buttonFlat: {
    boxShadow:
      "inset -1px -1px 0 #0a0a0a, inset 1px 1px 0 #fff, inset -2px -2px 0 #808080, inset 2px 2px 0 #dfdfdf",
  },
};

/* ============================ AUDIO ================================
   Click/open/close SFX are still synthesized with the Web Audio API
   (no files needed for those). Background music is a real audio file
   in public/Audio/ (change MUSIC_TRACK_SRC below to swap tracks). One
   slider controls both, same as a single Windows volume control.
   Music credit is shown in the "About Me" window.
==================================================================== */
const MUSIC_TRACK_SRC = "Audio/everyone-has-a-story.mp3";
const DEFAULT_VOLUME = 0.2; // 20% when the page opens
// App sounds (click/hover/open/close...) are multiplied by this on top of
// the slider, so they can be louder without changing the music level.
// A limiter after it prevents distortion at high slider values.
const SFX_BOOST = 3;

function useAudioEngine() {
  const state = useRef({ ctx: null, master: null });
  const audioElRef = useRef(null);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [muted, setMuted] = useState(false);
  const [musicOn, setMusicOn] = useState(true);

  const ensure = useCallback(() => {
    let s = state.current;
    if (s.ctx) {
      if (s.ctx.state === "suspended") s.ctx.resume();
      return s;
    }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.value = muted ? 0 : volume * SFX_BOOST;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.05;
    master.connect(limiter).connect(ctx.destination);
    s = { ctx, master };
    state.current = s;
    return s;
  }, [muted, volume]);

  // keep SFX master gain in sync with UI
  useEffect(() => {
    const s = state.current;
    if (s.master) s.master.gain.setTargetAtTime(muted ? 0 : volume * SFX_BOOST, s.ctx.currentTime, 0.05);
  }, [volume, muted]);

  const tone = useCallback((freqs, dur, type, peak, delay = 0) => {
    const s = ensure();
    const { ctx, master } = s;
    const t0 = ctx.currentTime + delay;
    (Array.isArray(freqs) ? freqs : [freqs]).forEach((f) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = f;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    });
  }, [ensure]);

  const sfx = {
    click: () => tone(620, 0.05, "square", 0.05),
    // hover + open are boosted so they're clearly audible at the 20% default volume
    hover: () => tone(950, 0.06, "sine", 0.25),
    open: () => { tone(420, 0.1, "triangle", 0.25); tone(700, 0.11, "triangle", 0.2, 0.05); },
    close: () => { tone(500, 0.08, "triangle", 0.08); tone(280, 0.1, "triangle", 0.07, 0.05); },
    minimize: () => tone(300, 0.07, "sine", 0.07),
    maximize: () => tone([500, 640], 0.08, "sine", 0.06),
    start: () => { tone(500, 0.06, "triangle", 0.07); tone(760, 0.08, "triangle", 0.06, 0.06); },
  };

  // --- background music track (real mp3 file) ---
  useEffect(() => {
    const audio = new Audio(MUSIC_TRACK_SRC);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = muted ? 0 : volume;
    audioElRef.current = audio;
    return () => {
      audio.pause();
      audioElRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep music volume in sync with the same slider used for SFX
  useEffect(() => {
    const audio = audioElRef.current;
    if (audio) audio.volume = muted ? 0 : volume;
  }, [volume, muted]);

  // play/pause the music track when the checkbox is toggled
  useEffect(() => {
    const audio = audioElRef.current;
    if (!audio) return;
    if (musicOn) audio.play().catch(() => {}); // rejected until a user gesture happens — fine, we retry below
    else audio.pause();
  }, [musicOn]);

  // first-ever user gesture unlocks both the SFX context and the music track
  useEffect(() => {
    const unlock = () => {
      ensure();
      const audio = audioElRef.current;
      if (audio && musicOn) audio.play().catch(() => {});
      window.removeEventListener("pointerdown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, [ensure, musicOn]);

  return { sfx, volume, setVolume, muted, setMuted, musicOn, setMusicOn };
}

const CONTACT_ICONS = { mail: Mail, linkedin: Linkedin, github: Github, instagram: Instagram };

/* --------------------------- CONTENT ------------------------------- */
function MiniBody({ blocks, sfx, onOpen }) {
  return (
    <div style={{ fontSize: 13, lineHeight: 1.5, color: "#000" }}>
      {blocks.map((b, i) => {
        if (b.t === "list")
          return (
            <ul key={i} style={{ margin: "0 0 10px", paddingLeft: 20 }}>
              {b.items.map((it, j) => <li key={j} style={{ marginBottom: 4 }}>{it}</li>)}
            </ul>
          );
        if (b.t === "table")
          return (
            <div key={i} style={{ overflowX: "auto", margin: "6px 0 12px", ...bevel.sunkenOuter, padding: 2 }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
                {b.head && (
                  <thead>
                    <tr>
                      {b.head.map((h, j) => (
                        <th key={j} style={{ textAlign: "left", padding: "3px 6px", background: "#c0c0c0", ...bevel.buttonFlat }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {b.rows.map((r, j) => (
                    <tr key={j} style={{ background: j % 2 ? "#f3f3f3" : "#fff" }}>
                      {r.map((c, k) => (
                        <td key={k} style={{ padding: "3px 6px", verticalAlign: "top", fontWeight: k === 0 ? 700 : 400, whiteSpace: k === 0 ? "nowrap" : "normal" }}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        if (b.t === "open")
          return (
            <button
              key={i}
              onClick={() => onOpen && onOpen(b.id)}
              onMouseEnter={() => sfx && sfx.hover()}
              style={{ display: "flex", alignItems: "center", gap: 6, margin: "4px 0 12px", padding: "5px 10px", fontSize: 12, background: "#c0c0c0", cursor: "pointer", border: "none", fontFamily: "inherit", ...bevel.buttonFlat }}
            >
              <span>{(PROJECTS.find((p) => p.id === b.id) || {}).icon}</span>
              {b.label} ▸
            </button>
          );
        if (b.t === "h")
          return (
            <h3 key={i} style={{ fontSize: 14, fontWeight: 700, margin: "14px 0 6px", color: "#000080" }}>
              {b.v}
            </h3>
          );
        if (b.t === "img")
          return (
            <figure key={i} style={{ margin: "10px 0" }}>
              <img src={b.src} alt={b.caption || ""} style={{ width: "100%", display: "block", ...bevel.sunkenOuter }} />
              {b.caption && (
                <figcaption style={{ fontSize: 11, color: "#555", marginTop: 4 }}>{b.caption}</figcaption>
              )}
            </figure>
          );
        if (b.t === "credit")
          return (
            <div key={i} style={{ fontSize: 11, color: "#555", margin: "16px 0 4px", paddingTop: 8, borderTop: "1px solid #808080" }}>
              {b.title && <div style={{ fontWeight: 700, color: "#000", marginBottom: 2 }}>{b.title}</div>}
              {b.lines.map((line, j) =>
                typeof line === "string" ? (
                  <div key={j}>{line}</div>
                ) : (
                  <div key={j}>
                    {line.text}
                    <a href={line.url} target="_blank" rel="noopener noreferrer" style={{ color: "#000080" }}>
                      {line.label || line.url}
                    </a>
                  </div>
                )
              )}
            </div>
          );
        if (b.t === "links")
          return (
            <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "6px 0 12px" }}>
              {b.items.map((item) => {
                const Icon = CONTACT_ICONS[item.icon] || Mail;
                return (
                  <a
                    key={item.label}
                    href={item.url}
                    target={item.url.startsWith("mailto:") ? undefined : "_blank"}
                    rel="noopener noreferrer"
                    onClick={() => sfx && sfx.click()}
                    onMouseEnter={() => sfx && sfx.hover()}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "5px 10px",
                      fontSize: 12,
                      color: "#000",
                      textDecoration: "none",
                      background: "#c0c0c0",
                      cursor: "pointer",
                      ...bevel.buttonFlat,
                    }}
                  >
                    <Icon size={14} />
                    {item.label}
                  </a>
                );
              })}
            </div>
          );
        return (
          <p key={i} style={{ margin: "0 0 10px" }}>
            {b.v}
          </p>
        );
      })}
    </div>
  );
}

/* ---------------------------- WINDOW ------------------------------ */
function Win95Window({ win, project, isMobile, isActive, onFocus, onClose, onMinimize, onToggleMaximize, onDrag, onResize, onSetWallpaper, onOpenProject, sfx }) {
  const dragRef = useRef({ dragging: false, offX: 0, offY: 0 });
  const resizeRef = useRef({ resizing: false, startX: 0, startY: 0, startW: 0, startH: 0 });

  const MIN_W = 300;
  const MIN_H = 220;

  const startDrag = (e) => {
    if (isMobile || win.maximized) return;
    onFocus();
    dragRef.current.dragging = true;
    dragRef.current.offX = e.clientX - win.x;
    dragRef.current.offY = e.clientY - win.y;
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", stopDrag);
  };
  const onMouseMove = useCallback(
    (e) => {
      if (!dragRef.current.dragging) return;
      onDrag(Math.max(0, e.clientX - dragRef.current.offX), Math.max(0, e.clientY - dragRef.current.offY));
    },
    [onDrag]
  );
  const stopDrag = () => {
    dragRef.current.dragging = false;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", stopDrag);
  };

  // desktop-only free resize, dragged from the bottom-right corner
  const startResize = (e) => {
    if (isMobile || win.maximized) return;
    e.stopPropagation();
    onFocus();
    resizeRef.current = { resizing: true, startX: e.clientX, startY: e.clientY, startW: win.w, startH: win.h };
    document.addEventListener("mousemove", onResizeMove);
    document.addEventListener("mouseup", stopResize);
  };
  const onResizeMove = useCallback(
    (e) => {
      if (!resizeRef.current.resizing) return;
      const { startX, startY, startW, startH } = resizeRef.current;
      const newW = Math.max(MIN_W, startW + (e.clientX - startX));
      const newH = Math.max(MIN_H, startH + (e.clientY - startY));
      onResize(newW, newH);
    },
    [onResize]
  );
  const stopResize = () => {
    resizeRef.current.resizing = false;
    document.removeEventListener("mousemove", onResizeMove);
    document.removeEventListener("mouseup", stopResize);
  };

  const fullscreen = isMobile || win.maximized;
  const style = fullscreen
    ? { position: "absolute", inset: 0, width: "100%", height: "100%" }
    : { position: "absolute", left: win.x, top: win.y, width: win.w, height: win.h };

  return (
    <div
      style={{ ...style, background: "#c0c0c0", display: win.minimized ? "none" : "flex", flexDirection: "column", zIndex: win.z, ...bevel.raisedOuter }}
      onMouseDown={onFocus}
    >
      <div
        onMouseDown={startDrag}
        style={{
          height: 26,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 4px 0 6px",
          background: isActive ? "linear-gradient(90deg, #000080, #1084d0)" : "linear-gradient(90deg, #7b7b7b, #a4a4a4)",
          color: "#fff",
          fontSize: 13,
          fontWeight: 700,
          cursor: isMobile || win.maximized ? "default" : "grab",
          userSelect: "none",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
          <span>{project.icon}</span>
          {project.title}
        </span>
        <span style={{ display: "flex", gap: 3 }}>
          {isMobile ? (
            <button aria-label="Close" onClick={(e) => { e.stopPropagation(); sfx.close(); onClose(); }} style={titleBtnStyle}>
              <X size={13} strokeWidth={3} />
            </button>
          ) : (
            <>
              <button aria-label="Minimize" onClick={(e) => { e.stopPropagation(); sfx.minimize(); onMinimize(); }} style={titleBtnStyle}>
                <Minus size={13} strokeWidth={3} />
              </button>
              <button aria-label="Maximize" onClick={(e) => { e.stopPropagation(); sfx.maximize(); onToggleMaximize(); }} style={titleBtnStyle}>
                <Square size={11} strokeWidth={3} />
              </button>
              <button aria-label="Close" onClick={(e) => { e.stopPropagation(); sfx.close(); onClose(); }} style={{ ...titleBtnStyle, background: "#c0c0c0" }}>
                <X size={13} strokeWidth={3} />
              </button>
            </>
          )}
        </span>
      </div>

      <div style={{ flex: 1, margin: 4, padding: 12, background: "#fff", overflowY: "auto", ...bevel.sunkenOuter }}>
        <div style={{ fontSize: 11, color: "#555", marginBottom: 8 }}>{project.tagline}</div>

        {project.cover && (
          <div style={{ marginBottom: 10 }}>
            <img
              src={project.cover}
              alt={project.title}
              title="Click to set as desktop wallpaper"
              onClick={() => { sfx.click(); onSetWallpaper(project.cover); }}
              style={{ width: "100%", display: "block", cursor: "pointer", ...bevel.sunkenOuter }}
            />
            <div style={{ fontSize: 10, color: "#777", marginTop: 3 }}>Click the photo to set it as your wallpaper</div>
          </div>
        )}

        {project.tech.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {project.tech.map((t) => (
              <span key={t} style={{ fontSize: 11, padding: "2px 7px", background: "#c0c0c0", ...bevel.buttonFlat }}>
                {t}
              </span>
            ))}
          </div>
        )}
        <MiniBody blocks={project.body} sfx={sfx} onOpen={onOpenProject} />
        {project.component && <project.component sfx={sfx} />}
      </div>

      {!isMobile && !win.maximized && (
        <div
          onMouseDown={startResize}
          title="Drag to resize"
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            width: 16,
            height: 16,
            cursor: "nwse-resize",
            backgroundImage:
              "repeating-linear-gradient(135deg, #808080 0 2px, transparent 2px 4px)",
            backgroundPosition: "bottom right",
            backgroundSize: "8px 8px",
            backgroundRepeat: "no-repeat",
          }}
        />
      )}
    </div>
  );
}

const titleBtnStyle = {
  width: 20,
  height: 18,
  background: "#c0c0c0",
  color: "#000",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "inset -1px -1px 0 #0a0a0a, inset 1px 1px 0 #fff, inset -2px -2px 0 #808080, inset 2px 2px 0 #dfdfdf",
  cursor: "pointer",
};

/* ------------------------- VOLUME TRAY ------------------------------ */
function VolumeTray({ volume, setVolume, muted, setMuted, musicOn, setMusicOn, sfx }) {
  const [open, setOpen] = useState(false);
  const Icon = muted || volume === 0 ? VolumeX : Volume2;

  return (
    <div style={{ position: "relative" }} onMouseDown={(e) => e.stopPropagation()}>
      <button
        aria-label="Volume"
        onClick={() => { sfx.click(); setOpen((o) => !o); }}
        style={{ ...titleBtnStyle, width: 26, height: 24, padding: 0 }}
      >
        <Icon size={14} />
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            bottom: 30,
            right: 0,
            width: 150,
            background: "#c0c0c0",
            padding: 10,
            zIndex: 20000,
            ...bevel.raisedOuter,
          }}
        >
          <div style={{ fontSize: 11, marginBottom: 6, fontWeight: 700 }}>Volume</div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(e) => setVolume(Number(e.target.value) / 100)}
            style={{ width: "100%" }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, marginTop: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} />
            Mute
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, marginTop: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={musicOn} onChange={(e) => setMusicOn(e.target.checked)} />
            <Music size={12} /> Music
          </label>
        </div>
      )}
    </div>
  );
}

const ICON_W = 78;
const ICON_H = 84;

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

function DesktopIcon({ project, pos, onMove, onOpen, sfx }) {
  const dragInfo = useRef({ startX: 0, startY: 0, originX: 0, originY: 0, moved: false });

  const onPointerDown = (e) => {
    dragInfo.current = { startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y, moved: false };
    const onMoveEv = (ev) => {
      const { startX, startY, originX, originY } = dragInfo.current;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragInfo.current.moved = true;
      const maxX = window.innerWidth - ICON_W - 4;
      const maxY = window.innerHeight - ICON_H - 44; // keep clear of the taskbar
      onMove(clamp(originX + dx, 0, Math.max(0, maxX)), clamp(originY + dy, 0, Math.max(0, maxY)));
    };
    const onUpEv = () => {
      document.removeEventListener("pointermove", onMoveEv);
      document.removeEventListener("pointerup", onUpEv);
      if (!dragInfo.current.moved) onOpen();
    };
    document.addEventListener("pointermove", onMoveEv);
    document.addEventListener("pointerup", onUpEv);
  };

  return (
    <button
      onPointerDown={onPointerDown}
      onMouseEnter={() => sfx.hover()}
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        width: ICON_W,
        background: "none",
        border: "none",
        color: "#fff",
        textShadow: "1px 1px 1px #000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        cursor: "grab",
        touchAction: "none",
        zIndex: 1,
      }}
    >
      <span style={{ fontSize: 30 }}>{project.icon}</span>
      <span style={{ fontSize: 11, lineHeight: 1.2 }}>{project.title}</span>
    </button>
  );
}

/* ---------------------------- APP ---------------------------------- */
export default function PortfolioOS() {
  const [isMobile, setIsMobile] = useState(false);
  const [windows, setWindows] = useState([]);
  const [zTop, setZTop] = useState(1);
  const [startOpen, setStartOpen] = useState(false);
  const [clock, setClock] = useState(new Date());
  const [wallpaper, setWallpaper] = useState(null);
  const [iconPos, setIconPos] = useState(() => {
    // stack icons in columns that fit above the taskbar
    const perCol = Math.max(1, Math.floor((Math.max(window.innerHeight, 560) - 60) / (ICON_H + 10)));
    return PROJECTS.reduce((acc, p, i) => {
      acc[p.id] = { x: 16 + Math.floor(i / perCol) * (ICON_W + 12), y: 16 + (i % perCol) * (ICON_H + 10) };
      return acc;
    }, {});
  });

  const { sfx, volume, setVolume, muted, setMuted, musicOn, setMusicOn } = useAudioEngine();

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const openProject = (id) => {
    sfx.open();
    setStartOpen(false);
    setWindows((prev) => {
      const existing = prev.find((w) => w.id === id);
      if (existing) return prev.map((w) => (w.id === id ? { ...w, minimized: false, z: zTop + 1 } : w));
      const idx = prev.length;
      const size = (PROJECTS.find((p) => p.id === id) || {}).size || { w: 480, h: 400 };
      const w = Math.min(size.w, window.innerWidth - 20);
      const h = Math.min(size.h, window.innerHeight - 60);
      const x = Math.max(0, Math.min(100 + idx * 26, window.innerWidth - w - 10));
      const y = Math.max(0, Math.min(20 + idx * 26, window.innerHeight - h - 46));
      return [...prev, { id, x, y, w, h, z: zTop + 1, minimized: false, maximized: false }];
    });
    setZTop((z) => z + 1);
  };

  const focusWin = (id) =>
    setWindows((prev) => {
      setZTop((z) => z + 1);
      return prev.map((w) => (w.id === id ? { ...w, z: zTop + 1 } : w));
    });

  const closeWin = (id) => setWindows((prev) => prev.filter((w) => w.id !== id));
  const minimizeWin = (id) => setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, minimized: true } : w)));
  const toggleMaximize = (id) => setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, maximized: !w.maximized } : w)));
  const dragWin = (id, x, y) => setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, x, y } : w)));
  const resizeWin = (id, w2, h2) => setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, w: w2, h: h2 } : w)));

  const activeId = windows.length ? windows.reduce((a, b) => (b.z > a.z ? b : a)).id : null;

  const desktopBg = wallpaper
    ? { backgroundImage: `url(${wallpaper})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: "repeating-linear-gradient(45deg, #018281, #018281 2px, #017f7e 2px, #017f7e 4px)" };

  return (
    <div
      style={{ position: "relative", width: "100%", height: "100vh", minHeight: 560, ...desktopBg, fontFamily: "Tahoma, Verdana, sans-serif", overflow: "hidden", userSelect: "none" }}
      onMouseDown={() => setStartOpen(false)}
    >
      {PROJECTS.map((p) => (
        <DesktopIcon
          key={p.id}
          project={p}
          pos={iconPos[p.id]}
          onMove={(x, y) => setIconPos((prev) => ({ ...prev, [p.id]: { x, y } }))}
          onOpen={() => openProject(p.id)}
          sfx={sfx}
        />
      ))}

      {wallpaper && (
        <button
          onClick={() => { sfx.click(); setWallpaper(null); }}
          style={{ position: "absolute", bottom: 44, right: 10, fontSize: 11, background: "#c0c0c0", padding: "4px 8px", zIndex: 2, cursor: "pointer", ...bevel.buttonFlat }}
        >
          ↺ Reset wallpaper
        </button>
      )}

      {windows.map((w) => {
        const project = PROJECTS.find((p) => p.id === w.id);
        return (
          <Win95Window
            key={w.id}
            win={w}
            project={project}
            isMobile={isMobile}
            isActive={w.id === activeId}
            onFocus={() => focusWin(w.id)}
            onClose={() => closeWin(w.id)}
            onMinimize={() => minimizeWin(w.id)}
            onToggleMaximize={() => toggleMaximize(w.id)}
            onDrag={(x, y) => dragWin(w.id, x, y)}
            onResize={(w2, h2) => resizeWin(w.id, w2, h2)}
            onSetWallpaper={setWallpaper}
            onOpenProject={openProject}
            sfx={sfx}
          />
        );
      })}

      {startOpen && (
        <div onMouseDown={(e) => e.stopPropagation()} style={{ position: "absolute", bottom: 40, left: 4, width: 200, background: "#c0c0c0", zIndex: 9999, ...bevel.raisedOuter }}>
          {PROJECTS.map((p) => (
            <div
              key={p.id}
              onClick={() => openProject(p.id)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", fontSize: 13, cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#000080")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span>{p.icon}</span>
              <span>{p.title}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 36, background: "#c0c0c0", display: "flex", alignItems: "center", padding: "0 4px", gap: 6, zIndex: 10000, ...bevel.raisedOuter }}>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => { sfx.start(); setStartOpen((s) => !s); }}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", fontWeight: 700, fontSize: 13, background: "#c0c0c0", cursor: "pointer", ...bevel.buttonFlat }}
        >
          <ChevronsUp size={14} />
          Start
        </button>

        <div style={{ width: 1, alignSelf: "stretch", background: "#808080" }} />

        <div style={{ flex: 1, display: "flex", gap: 4, overflowX: "auto" }}>
          {windows.map((w) => {
            const project = PROJECTS.find((p) => p.id === w.id);
            const active = w.id === activeId && !w.minimized;
            return (
              <button
                key={w.id}
                onClick={() => {
                  sfx.click();
                  if (w.minimized) setWindows((prev) => prev.map((x) => (x.id === w.id ? { ...x, minimized: false } : x)));
                  focusWin(w.id);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 10px",
                  fontSize: 12,
                  minWidth: 110,
                  maxWidth: 150,
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  background: "#c0c0c0",
                  cursor: "pointer",
                  boxShadow: active
                    ? "inset 1px 1px 0 #0a0a0a, inset -1px -1px 0 #fff, inset 2px 2px 0 #808080, inset -2px -2px 0 #dfdfdf"
                    : bevel.buttonFlat.boxShadow,
                }}
              >
                <span>{project.icon}</span>
                {project.title}
              </button>
            );
          })}
        </div>

        <VolumeTray volume={volume} setVolume={setVolume} muted={muted} setMuted={setMuted} musicOn={musicOn} setMusicOn={setMusicOn} sfx={sfx} />

        <div style={{ padding: "3px 10px", fontSize: 12, ...bevel.sunkenOuter }}>
          {clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}
