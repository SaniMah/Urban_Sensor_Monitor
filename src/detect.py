"""Sensor-health detection rules. Each returns a DataFrame of anomalies with
ANOMALY_COLS; a runner writes them to the `anomaly` table.

Rules:
    duplicate         the same (sensor, hour) appears more than once
    impossible_value  a negative count, or one beyond any plausible maximum
    flat_line         a non-zero count repeating for many hours (stuck sensor)
    outage            a run of missing hours when the sensor should report
    off_baseline      a reading far from its own (weekday, hour) baseline

Readings are expected with columns: location_id, timestamp, hourday,
pedestriancount.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sqlalchemy import text
from sqlalchemy.engine import Engine

ANOMALY_COLS = ["location_id", "anomaly_type", "start_ts", "end_ts", "value", "detail"]


def detect_duplicates(readings: pd.DataFrame) -> pd.DataFrame:
    g = (readings.groupby(["location_id", "timestamp"]).size()
         .reset_index(name="n"))
    rows = [
        {"location_id": int(r.location_id), "anomaly_type": "duplicate",
         "start_ts": r.timestamp, "end_ts": r.timestamp, "value": float(r.n),
         "detail": f"{int(r.n)} rows for the same hour"}
        for r in g[g["n"] > 1].itertuples()
    ]
    return pd.DataFrame(rows, columns=ANOMALY_COLS)


def detect_impossible(readings: pd.DataFrame, max_count: int = 20000) -> pd.DataFrame:
    bad = readings[(readings["pedestriancount"] < 0)
                   | (readings["pedestriancount"] > max_count)]
    rows = [
        {"location_id": int(r.location_id), "anomaly_type": "impossible_value",
         "start_ts": r.timestamp, "end_ts": r.timestamp,
         "value": float(r.pedestriancount),
         "detail": f"count {int(r.pedestriancount)} is outside [0, {max_count}]"}
        for r in bad.itertuples()
    ]
    return pd.DataFrame(rows, columns=ANOMALY_COLS)


def detect_flatline(readings: pd.DataFrame, run: int = 6) -> pd.DataFrame:
    """Non-zero count repeating for >= `run` consecutive hours = stuck sensor."""
    rows: list[dict] = []
    for loc, g in readings.sort_values("timestamp").groupby("location_id"):
        vals = g["pedestriancount"].to_numpy()
        ts = g["timestamp"].to_numpy()
        i, n = 0, len(vals)
        while i < n:
            j = i
            while j + 1 < n and vals[j + 1] == vals[i]:
                j += 1
            length = j - i + 1
            if length >= run and vals[i] > 0:
                rows.append({
                    "location_id": int(loc), "anomaly_type": "flat_line",
                    "start_ts": ts[i], "end_ts": ts[j], "value": float(vals[i]),
                    "detail": f"value {int(vals[i])} repeated for {length} hours",
                })
            i = j + 1
    return pd.DataFrame(rows, columns=ANOMALY_COLS)


def detect_outages(readings: pd.DataFrame, min_gap_hours: int = 3) -> pd.DataFrame:
    """A gap of >= `min_gap_hours` between consecutive readings = an outage."""
    rows: list[dict] = []
    for loc, g in readings.sort_values("timestamp").groupby("location_id"):
        ts = g["timestamp"].to_numpy()
        if len(ts) < 2:
            continue
        gap_h = (np.diff(ts).astype("timedelta64[h]")).astype(int)
        for i, gh in enumerate(gap_h):
            if gh >= min_gap_hours:
                rows.append({
                    "location_id": int(loc), "anomaly_type": "outage",
                    "start_ts": ts[i], "end_ts": ts[i + 1], "value": float(gh),
                    "detail": f"no data for {gh} hours",
                })
    return pd.DataFrame(rows, columns=ANOMALY_COLS)


def detect_off_baseline(readings: pd.DataFrame, baseline: pd.DataFrame,
                        k: float = 6.0, min_band: float = 50.0) -> pd.DataFrame:
    """Reading far from its (weekday, hour) baseline: |count - expected| beyond
    max(k * IQR, min_band). A floor on the band stops quiet slots over-firing."""
    d = readings.copy()
    d["dow"] = pd.to_datetime(d["timestamp"]).dt.day_of_week
    m = d.merge(baseline[["location_id", "dow", "hourday", "expected_count", "spread"]],
                on=["location_id", "dow", "hourday"], how="left")
    m = m[m["expected_count"].notna()]
    band = np.maximum(m["spread"].to_numpy() * k, min_band)
    dev = m["pedestriancount"].to_numpy() - m["expected_count"].to_numpy()
    flagged = m[np.abs(dev) > band].copy()
    flagged["dev"] = (flagged["pedestriancount"] - flagged["expected_count"])
    rows = [
        {"location_id": int(r.location_id), "anomaly_type": "off_baseline",
         "start_ts": r.timestamp, "end_ts": r.timestamp, "value": float(r.dev),
         "detail": (f"count {int(r.pedestriancount)} vs expected "
                    f"{int(r.expected_count)} ({r.dev:+.0f})")}
        for r in flagged.itertuples()
    ]
    return pd.DataFrame(rows, columns=ANOMALY_COLS)


# ---------------------------------------------------------------------------
# Writing to the database
# ---------------------------------------------------------------------------

def clear_anomalies(engine: Engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM anomaly"))


def write_anomalies(engine: Engine, anomalies: pd.DataFrame) -> int:
    if anomalies.empty:
        return 0
    anomalies[ANOMALY_COLS].to_sql("anomaly", engine, if_exists="append", index=False)
    return len(anomalies)
