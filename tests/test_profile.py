"""Tests for the seasonal baseline (src/profile.compute_baseline)."""
import pandas as pd

from src.profile import compute_baseline


def test_baseline_median_per_slot():
    # same sensor, same weekday+hour, several weeks -> one baseline row = median
    ts = pd.to_datetime([
        "2026-01-05 12:00", "2026-01-12 12:00", "2026-01-19 12:00",  # Mondays 12:00
    ])
    df = pd.DataFrame({
        "location_id": [1, 1, 1],
        "timestamp": ts,
        "hourday": [12, 12, 12],
        "pedestriancount": [100, 200, 300],
    })
    base = compute_baseline(df)
    assert len(base) == 1
    row = base.iloc[0]
    assert row["location_id"] == 1
    assert row["dow"] == 0            # Monday
    assert row["hourday"] == 12
    assert row["expected_count"] == 200   # median of 100/200/300
    assert row["n_samples"] == 3


def test_baseline_separates_slots():
    ts = pd.to_datetime(["2026-01-05 08:00", "2026-01-05 18:00"])  # two hours
    df = pd.DataFrame({
        "location_id": [1, 1], "timestamp": ts, "hourday": [8, 18],
        "pedestriancount": [50, 400],
    })
    base = compute_baseline(df)
    assert len(base) == 2
    assert set(base["hourday"]) == {8, 18}
