"""Pull pedestrian-counting data from the City of Melbourne open-data portal.

The portal runs Opendatasoft; the Explore API v2.1 'exports/json' endpoint
returns every record matching an optional ODSQL ``where`` filter.

Datasets:
    pedestrian-counting-system-monthly-counts-per-hour  (hourly counts, 2009-)
    pedestrian-counting-system-sensor-locations         (134 sensors)
Join key: location_id.
"""
from __future__ import annotations

import io
import os

import pandas as pd
import requests
from dotenv import load_dotenv
from sqlalchemy.engine import Engine

load_dotenv()

_EXPORT = "https://data.melbourne.vic.gov.au/api/v2/catalog/datasets/{dataset}/exports/json"
COUNTS_DATASET = "pedestrian-counting-system-monthly-counts-per-hour"
SENSORS_DATASET = "pedestrian-counting-system-sensor-locations"


def _export_json(dataset: str, where: str | None = None, select: str | None = None,
                 timeout: int = 180) -> pd.DataFrame:
    """Download all matching records from a dataset as a DataFrame."""
    params: dict[str, str] = {}
    if where:
        params["where"] = where
    if select:
        params["select"] = select
    headers: dict[str, str] = {}
    token = os.environ.get("MELBOURNE_APP_TOKEN", "").strip()
    # Only send a real app token, in a header (never in the URL). Guard against a
    # misplaced connection string or other secret ever being sent as a token.
    if token and "://" not in token and "@" not in token:
        headers["Authorization"] = f"Apikey {token}"
    resp = requests.get(_EXPORT.format(dataset=dataset), params=params,
                        headers=headers, timeout=timeout)
    resp.raise_for_status()
    return pd.DataFrame(resp.json())


def fetch_sensors() -> pd.DataFrame:
    """The 134 sensor locations (one row per sensor)."""
    return _export_json(SENSORS_DATASET)


def fetch_counts(where: str | None = None) -> pd.DataFrame:
    """Hourly counts, optionally filtered (e.g. ``"sensing_date >= '2026-01-01'"``).

    Adds a proper ``timestamp`` column from ``sensing_date`` + ``hourday``.
    """
    df = _export_json(COUNTS_DATASET, where=where)
    if not df.empty:
        df["timestamp"] = (
            pd.to_datetime(df["sensing_date"])
            + pd.to_timedelta(df["hourday"], unit="h")
        )
        df = df.sort_values(["location_id", "timestamp"]).reset_index(drop=True)
    return df


def fetch_counts_since(start_date: str) -> pd.DataFrame:
    """Convenience: all hourly counts on/after ``start_date`` (YYYY-MM-DD)."""
    return fetch_counts(where=f"sensing_date >= date'{start_date}'")


# ---------------------------------------------------------------------------
# Loading into the database
# ---------------------------------------------------------------------------

def store_sensors(engine: Engine, sensors: pd.DataFrame) -> int:
    """Write the sensor table (one row per sensor)."""
    rename = {"sensor_description": "description"}
    out = sensors.rename(columns=rename)
    cols = ["location_id", "sensor_name", "description", "status",
            "latitude", "longitude", "direction_1", "direction_2",
            "installation_date"]
    out = out[[c for c in cols if c in out.columns]].copy()
    out.to_sql("sensor", engine, if_exists="append", index=False)
    return len(out)


def _int_or_null(v) -> str:
    return "\\N" if pd.isna(v) else str(int(v))


def copy_readings(engine: Engine, counts: pd.DataFrame) -> int:
    """Bulk-load hourly readings into `reading` with PostgreSQL COPY."""
    buf = io.StringIO()
    for loc, ts, hour, pc, d1, d2 in zip(
        counts["location_id"], counts["timestamp"], counts["hourday"],
        counts["pedestriancount"], counts["direction_1"], counts["direction_2"],
    ):
        buf.write(
            f"{int(loc)}\t{ts}\t{int(hour)}\t"
            f"{_int_or_null(pc)}\t{_int_or_null(d1)}\t{_int_or_null(d2)}\n"
        )
    buf.seek(0)
    raw = engine.raw_connection()
    try:
        cur = raw.cursor()
        cur.copy_expert(
            "COPY reading (location_id, ts, hourday, pedestrian_count, "
            "direction_1, direction_2) FROM STDIN WITH (FORMAT text)",
            buf,
        )
        raw.commit()
    finally:
        raw.close()
    return len(counts)
