import React, { useState } from "react";

/* ==================================================================
   SKILLS MAP
   Every skill listed in "About Me", grouped by area, and linked to the
   projects on this desktop where it was actually used. Every "where"
   line restates something from that project's own write-up.
================================================================== */

const RAISED = "inset -1px -1px 0 #0a0a0a, inset 1px 1px 0 #fff, inset -2px -2px 0 #808080, inset 2px 2px 0 #dfdfdf";
const SUNKEN = "inset 1px 1px 0 #0a0a0a, inset -1px -1px 0 #fff, inset 2px 2px 0 #808080, inset -2px -2px 0 #dfdfdf";

const PROJECT_NAMES = {
  PowerController: "⚡ Power Controller",
  Alaris: "✈️ Project Alaris",
  "F1-DataCenter": "🏁 F1 Data Center",
};

const AREAS = [
  {
    name: "Embedded firmware",
    skills: [
      { name: "ESP32", uses: [
        ["PowerController", "Main MCU of IGNIS. Chosen as the only dual-core option, leaving room for redundancy."],
        ["Alaris", "ESP32-C3 in the distributed avionics."],
      ]},
      { name: "STM32", uses: [
        ["Alaris", "STM32H7 / STM32F4 units running the avionics firmware."],
      ]},
      { name: "FreeRTOS", uses: [
        ["Alaris", "Preemptive task scheduling on the DAPU, GNCU and CGU, with measured rates."],
      ], app: ["alaris-rtos", "RTOS Scheduler"] },
      { name: "DMA", uses: [
        ["Alaris", "DMA moves sensor data into ring buffers, so a delayed task never loses a GPS frame."],
      ]},
      { name: "SPI / UART / I²C", uses: [
        ["Alaris", "Links between units and sensors; the GPS is configured over UART at boot with UBX frames."],
        ["PowerController", "External ADS1115 16-bit ADC over I²C, and a crosstalk fix on the PCB."],
      ]},
    ],
  },
  {
    name: "Hardware",
    skills: [
      { name: "KiCad PCB", uses: [
        ["PowerController", "The IGNIS PCB: about 10× less noise than the protoboard, at less than half the mass."],
        ["Alaris", "Schematics and PCB for the avionics, published on GitHub."],
      ]},
      { name: "Sensor front-ends", uses: [
        ["Alaris", "Pitot front-end, barometer, IMU and GPS chosen and conditioned for the aircraft."],
        ["PowerController", "Voltage and current sensing that must not disturb the power system."],
      ], app: ["alaris-signals", "Signal Chain"] },
      { name: "Power budget", uses: [
        ["Alaris", "Power distribution network and per-unit budget."],
      ], app: ["alaris-board", "Board Explorer"] },
      { name: "Bench debugging", uses: [
        ["PowerController", "Tracked down an ADC that died after 5 minutes: supply, buffering and I²C routing."],
      ]},
    ],
  },
  {
    name: "Control & estimation",
    skills: [
      { name: "PID control", uses: [
        ["PowerController", "Power-limiting loop; two test matrices on the real motor set the practical gain limit."],
        ["Alaris", "Cascaded loops (roll, sideslip, course, pitch, altitude, airspeed) run on the avionics."],
      ], app: ["pid-lab", "PID Lab"] },
      { name: "System identification", uses: [
        ["PowerController", "Transfer-function fit of the motor before tuning."],
      ]},
      { name: "Kalman filters", uses: [
        ["PowerController", "1-D Kalman filters that clean the voltage and current signals."],
        ["Alaris", "Federated EKFs for state estimation, plus barometer/IMU altitude fusion."],
      ], app: ["kalman", "Kalman Filter"] },
      { name: "MATLAB / Simulink", uses: [
        ["PowerController", "Simulation and tuning of the closed loop."],
        ["Alaris", "The team's nonlinear 6DoF simulator the controllers are designed against."],
      ]},
      { name: "Signal processing", uses: [
        ["Alaris", "Propeller RPM from an FFT."],
      ], app: ["alaris-signals", "Signal Chain"] },
    ],
  },
  {
    name: "Safety & reliability",
    skills: [
      { name: "FMEA / FTA", uses: [
        ["PowerController", "Failure modes, risk priority numbers and a fault tree before flight."],
      ], app: ["fmea", "FMEA Board"] },
      { name: "Health management", uses: [
        ["Alaris", "Power switch, state machine, watchdog and manual/auto logic that keeps the pilot in charge."],
      ], app: ["alaris-failsafe", "Failsafe Panel"] },
      { name: "Requirements", uses: [
        ["PowerController", "Numbered sensing, operation and control requirements."],
        ["Alaris", "Separate acceptance criteria per front before integration."],
      ]},
    ],
  },
  {
    name: "Software & data",
    skills: [
      { name: "Python", uses: [
        ["F1-DataCenter", "UDP recorder, 13 binary packet parsers, ingest and API (Python 3.13, FastAPI)."],
      ]},
      { name: "TypeScript / React", uses: [
        ["F1-DataCenter", "The analysis UI; this whole desktop is React too."],
      ], app: ["f1-compare", "Lap Compare"] },
      { name: "Parquet + DuckDB", uses: [
        ["F1-DataCenter", "Columnar store for 12.5 M packets across 19 sessions."],
      ], app: ["f1-library", "Session Library"] },
      { name: "Testing", uses: [
        ["F1-DataCenter", "296 unit, contract and integration tests against real capture bytes."],
      ]},
      { name: "Spec-driven development", uses: [
        ["F1-DataCenter", "Constitution, spec, plan and task list per feature with GitHub Spec Kit."],
      ]},
    ],
  },
];

const btn = { fontSize: 11, padding: "3px 8px", background: "#c0c0c0", border: "none", cursor: "pointer", boxShadow: RAISED, color: "#000", fontFamily: "inherit" };

export function SkillsMap({ sfx, onOpen }) {
  const [sel, setSel] = useState(AREAS[0].skills[0]);
  const [project, setProject] = useState(null);

  const matches = (s) => !project || s.uses.some(([id]) => id === project);

  return (
    <div style={{ fontSize: 12, color: "#000" }}>
      <p style={{ margin: "0 0 8px", fontSize: 12 }}>
        Pick a skill to see where it was used. Filter by project to see what each one took.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#555" }}>Project:</span>
        {[[null, "All"], ...Object.entries(PROJECT_NAMES)].map(([id, label]) => (
          <button
            key={label}
            onClick={() => { sfx && sfx.click(); setProject(id); }}
            style={{ ...btn, ...(project === id ? { boxShadow: SUNKEN, background: "#d4d4d4", fontWeight: 700 } : null) }}
          >
            {label}
          </button>
        ))}
      </div>

      {AREAS.map((area) => (
        <fieldset key={area.name} style={{ border: "1px solid #808080", boxShadow: "1px 1px 0 #fff", padding: "10px 8px 8px", margin: "10px 0 6px", position: "relative" }}>
          <span style={{ position: "absolute", top: -8, left: 8, background: "#fff", padding: "0 4px", fontSize: 11, fontWeight: 700, color: "#000080" }}>
            {area.name}
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {area.skills.map((s) => {
              const on = matches(s);
              const active = sel === s;
              return (
                <button
                  key={s.name}
                  disabled={!on}
                  onClick={() => { sfx && sfx.click(); setSel(s); }}
                  onMouseEnter={() => on && sfx && sfx.hover()}
                  style={{
                    ...btn,
                    ...(active ? { boxShadow: SUNKEN, background: "#000080", color: "#fff" } : null),
                    ...(on ? null : { color: "#999", cursor: "default", textShadow: "1px 1px 0 #fff" }),
                  }}
                >
                  {s.name}
                  <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>×{s.uses.length}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      {sel && (
        <div style={{ marginTop: 12, background: "#fff", boxShadow: SUNKEN, padding: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#000080", marginBottom: 6 }}>{sel.name}</div>
          {sel.uses.map(([id, note]) => (
            <div key={id} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
              <button
                onClick={() => onOpen && onOpen(id)}
                onMouseEnter={() => sfx && sfx.hover()}
                style={{ ...btn, whiteSpace: "nowrap", flexShrink: 0 }}
              >
                {PROJECT_NAMES[id]} ▸
              </button>
              <span style={{ lineHeight: 1.45 }}>{note}</span>
            </div>
          ))}
          {sel.app && (
            <button
              onClick={() => onOpen && onOpen(sel.app[0])}
              onMouseEnter={() => sfx && sfx.hover()}
              style={{ ...btn, marginTop: 4 }}
            >
              Try it in {sel.app[1]} ▸
            </button>
          )}
        </div>
      )}
    </div>
  );
}
