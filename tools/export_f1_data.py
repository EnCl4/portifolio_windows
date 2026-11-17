"""Export F1 Data Center sessions into small JSON files for the portfolio apps.

Reads the derived Parquet store written by `f1dc ingest` (default C:/F1Data/derived)
and writes:

  public/data/f1/sessions.json         every session with 2+ laps: context, laps, stints
  public/data/f1/traces/<track>.json   a few laps per session, resampled to a 5 m grid

Re-run it after ingesting new sessions:

    python tools/export_f1_data.py [--derived C:/F1Data/derived]
"""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

import pyarrow.parquet as pq

GRID_M = 5  # trace resolution kept for the web (the store is 1 m)
OUT = Path(__file__).resolve().parent.parent / "public" / "data" / "f1"

# channel -> decimals kept in the export
CHANNELS = {
    "time_ms": 0,
    "speed_kph": 0,
    "throttle": 2,
    "brake": 2,
    "steer": 2,
    "gear": 0,
    "rpm": -2,  # round to hundreds
    "g_lat": 2,
    "g_lon": 2,
    "x": 1,
    "z": 1,
}


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def rnd(v, d):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    r = round(v, d) if d > 0 else round(v, d)
    return int(r) if d <= 0 else r


def read(path: Path):
    return pq.read_table(path).to_pylist() if path.exists() else []


def lap_record(lap, car):
    wear = [lap.get(f"tyre_wear_{w}") for w in ("fl", "fr", "rl", "rr")]
    wear = [w for w in wear if w is not None]
    rec = {
        "n": lap["lap_number"],
        "t": lap["lap_time_ms"],
        "s": [lap["sector1_ms"], lap["sector2_ms"], lap["sector3_ms"]],
        "counts": bool(lap["counts"]),
        "why": lap["exclusion_reason"],
        "stint": lap["stint_index"],
        "tyre": None if str(lap["tyre_visual_compound_name"]).startswith("unknown") else lap["tyre_visual_compound_name"],
        "age": lap["tyre_age_laps"],
        "fuel": rnd(lap["fuel_in_tank_start"], 1),
        "wear": rnd(sum(wear) / len(wear), 1) if wear else None,
        "pos": lap["car_position"],
        "pit": bool(lap["is_in_lap"] or lap["is_out_lap"]),
        "sc": bool(lap["under_safety_car"]),
    }
    if car:
        rec["fuelUsed"] = rnd(car["fuel_used_kg"], 2)
        rec["ersDep"] = rnd(car["ers_deployed_mj"], 2)
        rec["ersHarv"] = rnd(car["ers_harvested_mj"], 2)
        rec["tyreTemp"] = rnd(
            sum(car[f"tyre_surface_avg_{w}"] or 0 for w in ("fl", "fr", "rl", "rr")) / 4, 0
        )
        rec["brakeMax"] = rnd(
            max(car[f"brake_max_{w}"] or 0 for w in ("fl", "fr", "rl", "rr")), 0
        )
        rec["offTrack"] = car["excursions"]
    return rec


def pick_trace_laps(laps):
    """Best counting lap, plus first and last counting laps (tyre/fuel contrast)."""
    counting = [l for l in laps if l["counts"]]
    if not counting:
        return []
    best = min(counting, key=lambda l: l["lap_time_ms"])
    picks = [best, counting[0], counting[-1]]
    if len(counting) > 6:
        picks.append(counting[len(counting) // 2])
    seen, out = set(), []
    for l in picks:
        if l["lap_number"] not in seen:
            seen.add(l["lap_number"])
            out.append(l["lap_number"])
    return sorted(out)


def export_traces(sdir: Path, lap_numbers):
    tbl = pq.read_table(
        sdir / "traces.parquet",
        columns=["lap_number", "distance_m", *CHANNELS],
        filters=[("lap_number", "in", lap_numbers)],
    ).to_pydict()
    by_lap: dict[int, dict[str, list]] = {}
    for i, lap in enumerate(tbl["lap_number"]):
        if tbl["distance_m"][i] % GRID_M:
            continue
        ch = by_lap.setdefault(lap, {k: [] for k in CHANNELS})
        for k, d in CHANNELS.items():
            ch[k].append(rnd(tbl[k][i], d))
    return by_lap


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--derived", default="C:/F1Data/derived")
    args = ap.parse_args()
    root = Path(args.derived) / "sessions"

    sessions, traces = [], {}
    for sdir in sorted(root.iterdir()):
        meta = read(sdir / "session.parquet")
        if not meta:
            continue
        s = meta[0]
        if (s["num_laps"] or 0) < 2:
            continue  # menu fragments and abandoned starts
        laps = sorted(read(sdir / "laps.parquet"), key=lambda l: l["lap_number"])
        cars = {c["lap_number"]: c for c in read(sdir / "lap_car.parquet")}
        stints = sorted(read(sdir / "stints.parquet"), key=lambda r: r["stint_index"])
        field = read(sdir / "field.parquet")
        rec = read(sdir / "recordings.parquet")
        track = slug(s["track_name"])
        # field: AI best laps for the "how do I compare to the grid" view
        rivals = sorted(
            (f["best_lap_ms"] for f in field if not f["is_player"] and f["best_lap_ms"]),
        )
        trace_laps = pick_trace_laps(laps) if (sdir / "traces.parquet").exists() else []
        sessions.append({
            "uid": s["session_uid"],
            "date": s["started_at"][:10],
            "track": s["track_name"],
            "trackSlug": track,
            "lengthM": s["track_length_m"],
            "type": s["session_type_name"],
            "category": s["session_category"],
            "totalLaps": s["total_laps"],
            "weather": s["weather_name"],
            "airC": s["air_temp_c"],
            "trackC": s["track_temp_c"],
            "ai": s["ai_difficulty"],
            "assists": s["assists_summary"],
            "durationS": round(s["duration_s"] or 0),
            "bestMs": s["best_lap_ms"],
            "bestLap": s["best_lap_number"],
            "counting": s["num_counting_laps"],
            "lossPct": s["loss_pct"],
            "packets": rec[0]["packets_received"] if rec else None,
            "rawBytes": rec[0]["size_bytes"] if rec else None,
            "finish": laps[-1]["car_position"] if laps else None,
            "gridBestMs": rivals[0] if rivals else None,
            "gridMedianMs": rivals[len(rivals) // 2] if rivals else None,
            "stints": [
                {"from": t["start_lap"], "to": t["end_lap"], "tyre": t["tyre_visual_compound_name"],
                 "compound": t["tyre_actual_compound_name"]}
                for t in stints
            ],
            "laps": [lap_record(l, cars.get(l["lap_number"])) for l in laps],
            "traceLaps": trace_laps,
            "sectorsM": next(
                ([round(l["sector2_start_m"]), round(l["sector3_start_m"])] for l in laps
                 if l.get("sector2_start_m") and l.get("sector3_start_m")),
                [],
            ),
        })
        if trace_laps:
            for lap_no, ch in export_traces(sdir, trace_laps).items():
                traces.setdefault(track, []).append({"uid": s["session_uid"], "lap": lap_no, **ch})

    sessions.sort(key=lambda r: (r["date"], r["uid"]))
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "traces").mkdir(exist_ok=True)
    (OUT / "sessions.json").write_text(json.dumps({"gridM": GRID_M, "sessions": sessions}, separators=(",", ":")))
    for track, laps in traces.items():
        (OUT / "traces" / f"{track}.json").write_text(json.dumps(laps, separators=(",", ":")))
    total_laps = sum(len(s["laps"]) for s in sessions)
    print(f"{len(sessions)} sessions, {total_laps} laps, {sum(len(v) for v in traces.values())} traces -> {OUT}")


if __name__ == "__main__":
    main()
