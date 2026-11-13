"""Learn each sensor's seasonal baseline: the expected count by day-of-week and
hour-of-day. A healthy pedestrian sensor follows a strong weekly rhythm, so the
median count for (sensor, weekday, hour) is a good "expected normal", and the
IQR says how much that slot naturally varies.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sqlalchemy.engine import Engine


def compute_baseline(counts: pd.DataFrame) -> pd.DataFrame:
    """Expected count per (location_id, dow, hourday).

    Returns columns: location_id, dow, hourday, expected_count (median),
    spread (IQR), n_samples.
    """
    d = counts.copy()
    d["ts"] = pd.to_datetime(d["timestamp"])
    d["dow"] = d["ts"].dt.day_of_week  # 0=Mon .. 6=Sun

    base = (
        d.groupby(["location_id", "dow", "hourday"])["pedestriancount"]
        .agg(
            expected_count="median",
            q1=lambda x: float(np.percentile(x, 25)),
            q3=lambda x: float(np.percentile(x, 75)),
            n_samples="count",
        )
        .reset_index()
    )
    base["spread"] = base["q3"] - base["q1"]
    return base.drop(columns=["q1", "q3"])


def store_baseline(engine: Engine, baseline: pd.DataFrame) -> int:
    """Write the baseline table."""
    cols = ["location_id", "dow", "hourday", "expected_count", "spread", "n_samples"]
    baseline[cols].to_sql("baseline", engine, if_exists="append", index=False)
    return len(baseline)
