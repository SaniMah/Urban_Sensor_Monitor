"""Step 4 - run the health rules on the loaded data and store the anomalies.

Reads readings + baseline from the database, applies all five rules, writes the
results to the `anomaly` table, and prints a summary - including the real
sensor-health issues found in the actual Melbourne data.

Run:
    python run_step4.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).parent))
from src.db import get_engine  # noqa: E402
from src.detect import (  # noqa: E402
    clear_anomalies,
    detect_duplicates,
    detect_flatline,
    detect_impossible,
    detect_off_baseline,
    detect_outages,
    write_anomalies,
)


def main():
    engine = get_engine()
    print("Reading data from the database ...")
    readings = pd.read_sql(
        text("SELECT location_id, ts AS timestamp, hourday, "
             "pedestrian_count AS pedestriancount FROM reading"),
        engine, parse_dates=["timestamp"],
    )
    baseline = pd.read_sql(
        text("SELECT location_id, dow, hourday, expected_count, spread FROM baseline"),
        engine,
    )
    print(f"  {len(readings):,} readings, {readings['location_id'].nunique()} sensors")

    parts = {
        "duplicate": detect_duplicates(readings),
        "impossible_value": detect_impossible(readings),
        "flat_line": detect_flatline(readings),
        "outage": detect_outages(readings),
        "off_baseline": detect_off_baseline(readings, baseline),
    }
    anomalies = pd.concat(parts.values(), ignore_index=True)

    clear_anomalies(engine)
    n = write_anomalies(engine, anomalies)
    print(f"\nWrote {n:,} anomalies to the database:")
    for name, df in parts.items():
        print(f"  {name:<16} {len(df):>6,}")

    # a couple of real findings
    with engine.connect() as conn:
        print("\nWorst real outages (longest gaps):")
        rows = conn.execute(text(
            """
            SELECT a.location_id, s.description, a.value AS hours, a.start_ts
            FROM anomaly a JOIN sensor s USING (location_id)
            WHERE a.anomaly_type = 'outage'
            ORDER BY a.value DESC LIMIT 5
            """
        )).all()
        for r in rows:
            print(f"  {r.location_id:<5} {str(r.description)[:28]:<28} "
                  f"{int(r.hours):>4} h  from {r.start_ts}")

        print("\nStuck sensors (longest flat-lines):")
        rows = conn.execute(text(
            """
            SELECT a.location_id, s.description, a.detail
            FROM anomaly a JOIN sensor s USING (location_id)
            WHERE a.anomaly_type = 'flat_line'
            ORDER BY a.value DESC LIMIT 5
            """
        )).all()
        for r in rows:
            print(f"  {r.location_id:<5} {str(r.description)[:28]:<28} {r.detail}")
        if not rows:
            print("  (none)")


if __name__ == "__main__":
    main()
