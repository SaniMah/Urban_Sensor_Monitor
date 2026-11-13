"""Step 1 — ingest + first look.

Pull the sensor list and a recent window of hourly counts from the City of
Melbourne API, cache them to data/, print a summary, and plot one sensor's
daily pattern (the seasonal shape the baseline will later learn).

Run:
    python run_step1.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

sys.path.insert(0, str(Path(__file__).parent))
from src.ingest import fetch_counts_since, fetch_sensors  # noqa: E402

START = "2026-05-01"          # recent window to keep the sample manageable
DATA_DIR = Path("data")
FIG_DIR = Path("reports/figures")


def main():
    DATA_DIR.mkdir(exist_ok=True)
    FIG_DIR.mkdir(parents=True, exist_ok=True)

    print("Fetching sensor locations ...")
    sensors = fetch_sensors()
    sensors.to_csv(DATA_DIR / "sensors.csv", index=False)
    active = (sensors["status"] == "A").sum() if "status" in sensors else "?"
    print(f"  {len(sensors)} sensors ({active} active). Saved data/sensors.csv")

    print(f"Fetching hourly counts since {START} ...")
    counts = fetch_counts_since(START)
    counts.to_csv(DATA_DIR / "counts_sample.csv", index=False)
    print(f"  {len(counts):,} rows | {counts['location_id'].nunique()} sensors | "
          f"{counts['timestamp'].min()} -> {counts['timestamp'].max()}")
    print("  Saved data/counts_sample.csv")

    # busiest sensors in the window
    busy = (counts.groupby(["location_id", "sensor_name"])["pedestriancount"]
            .sum().sort_values(ascending=False).head(8))
    print("\nBusiest sensors (total pedestrians in window):")
    print(busy.to_string())

    # pick the busiest to plot
    top_loc = busy.index[0][0]
    g = counts[counts["location_id"] == top_loc].copy()
    name = g["sensor_name"].iloc[0]
    g["dow"] = g["timestamp"].dt.day_of_week        # 0=Mon ... 6=Sun
    g["is_weekend"] = g["dow"] >= 5

    # average hourly profile: weekday vs weekend
    prof = (g.groupby(["is_weekend", "hourday"])["pedestriancount"].mean()
            .unstack("is_weekend"))
    fig, ax = plt.subplots(figsize=(10, 4.5))
    if False in prof.columns:
        ax.plot(prof.index, prof[False], "-o", ms=4, color="#2a6f97", label="weekday avg")
    if True in prof.columns:
        ax.plot(prof.index, prof[True], "-o", ms=4, color="#e07a5f", label="weekend avg")
    ax.set_xlabel("hour of day")
    ax.set_ylabel("avg pedestrians / hour")
    ax.set_title(f"Sensor {top_loc} ({name}) — daily pattern (this is what the baseline learns)")
    ax.set_xticks(range(0, 24, 2))
    ax.legend()
    fig.tight_layout()
    out = FIG_DIR / f"step1_sensor{top_loc}_profile.png"
    fig.savefig(out, dpi=120)
    print(f"\nSaved daily-pattern plot -> {out}")


if __name__ == "__main__":
    main()
