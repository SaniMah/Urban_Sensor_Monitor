"""Step 2 — database + baseline.

Create the schema, load the cached sensor list and hourly readings, compute each
sensor's seasonal baseline (expected count by day-of-week and hour-of-day), and
verify the row counts from the database.

Run:
    python run_step2.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).parent))
from src.db import get_engine, init_schema  # noqa: E402
from src.ingest import copy_readings, store_sensors  # noqa: E402
from src.profile import compute_baseline, store_baseline  # noqa: E402


def main():
    engine = get_engine()

    print("Creating schema (sql/schema.sql) ...")
    init_schema(engine)

    sensors = pd.read_csv("data/sensors.csv")
    print(f"Loading {len(sensors)} sensors ...")
    store_sensors(engine, sensors)

    counts = pd.read_csv("data/counts_sample.csv")
    known = set(sensors["location_id"])
    before = len(counts)
    counts = counts[counts["location_id"].isin(known)].reset_index(drop=True)
    if len(counts) < before:
        print(f"  dropped {before - len(counts):,} readings from unlisted sensors")

    print(f"Loading {len(counts):,} readings (COPY) ...")
    copy_readings(engine, counts)

    print("Computing seasonal baseline ...")
    base = compute_baseline(counts)
    store_baseline(engine, base)

    print("\nRow counts in the database:")
    with engine.connect() as conn:
        for table in ("sensor", "reading", "baseline", "anomaly"):
            n = conn.execute(text(f"SELECT count(*) FROM {table}")).scalar_one()
            print(f"  {table:<10} {n:>9,}")

        print("\nBusiest sensors by average weekday-noon count (from baseline, via SQL):")
        rows = conn.execute(text(
            """
            SELECT b.location_id, s.description,
                   round(b.expected_count) AS noon_median
            FROM baseline b JOIN sensor s USING (location_id)
            WHERE b.dow < 5 AND b.hourday = 12
            ORDER BY b.expected_count DESC
            LIMIT 5
            """
        )).all()
        for r in rows:
            print(f"  {r.location_id:<5} {str(r.description)[:30]:<30} {int(r.noon_median):>6}")


if __name__ == "__main__":
    main()
