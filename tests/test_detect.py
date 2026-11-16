"""Tests for the sensor-health rules. All on synthetic data - no database."""
import numpy as np
import pandas as pd

from src.detect import (
    detect_duplicates,
    detect_flatline,
    detect_impossible,
    detect_off_baseline,
    detect_outages,
)


def series(loc, counts, start="2026-01-05"):
    """A gap-free hourly series for one sensor."""
    ts = pd.date_range(start, periods=len(counts), freq="h")
    return pd.DataFrame({"location_id": loc, "timestamp": ts,
                         "hourday": ts.hour, "pedestriancount": counts})


# --- clean data: no rule should fire -------------------------------------- #

def test_clean_data_has_no_anomalies():
    df = series(1, [i % 40 + 1 for i in range(72)])  # varying, continuous, >0
    assert detect_duplicates(df).empty
    assert detect_impossible(df).empty
    assert detect_outages(df).empty
    assert detect_flatline(df).empty


# --- each rule fires on its own injected issue ---------------------------- #

def test_duplicate_detected():
    df = series(1, list(range(1, 25)))
    dup = pd.concat([df, df.iloc[[5]]], ignore_index=True)  # repeat one hour
    res = detect_duplicates(dup)
    assert len(res) == 1
    assert res.iloc[0]["anomaly_type"] == "duplicate"


def test_impossible_detected():
    counts = list(range(1, 25))
    counts[3] = -5
    counts[10] = 999999
    res = detect_impossible(series(1, counts))
    assert len(res) == 2
    assert set(res["anomaly_type"]) == {"impossible_value"}


def test_flatline_detected():
    counts = [10, 20, 30] + [77] * 8 + [40, 50, 60]  # 8-hour stuck run at 77
    res = detect_flatline(series(1, counts), run=6)
    assert len(res) == 1
    assert res.iloc[0]["value"] == 77


def test_flatline_ignores_repeated_zero():
    counts = [5, 6, 7] + [0] * 10 + [8, 9]  # night zeros are not a fault
    assert detect_flatline(series(1, counts), run=6).empty


def test_outage_detected():
    before = series(1, list(range(1, 11)))                 # hours 0..9
    after = series(1, list(range(1, 11)), start="2026-01-05 15:00")  # 5h gap
    df = pd.concat([before, after], ignore_index=True)
    res = detect_outages(df, min_gap_hours=3)
    assert len(res) == 1
    assert res.iloc[0]["anomaly_type"] == "outage"
    assert res.iloc[0]["value"] >= 3


def test_off_baseline_detected():
    baseline = pd.DataFrame({
        "location_id": [1, 1], "dow": [0, 0], "hourday": [12, 13],
        "expected_count": [100.0, 100.0], "spread": [10.0, 10.0],
    })
    readings = pd.DataFrame({
        "location_id": [1, 1],
        "timestamp": [pd.Timestamp("2026-01-05 12:00"),   # Monday -> dow 0
                      pd.Timestamp("2026-01-05 13:00")],
        "hourday": [12, 13],
        "pedestriancount": [500, 110],   # 500 is far off; 110 is within band
    })
    res = detect_off_baseline(readings, baseline, k=6.0, min_band=50.0)
    assert len(res) == 1
    assert res.iloc[0]["location_id"] == 1


# --- empty input must not crash ------------------------------------------- #

def test_empty_input():
    empty = pd.DataFrame({"location_id": [], "timestamp": [], "hourday": [],
                          "pedestriancount": []})
    assert detect_duplicates(empty).empty
    assert detect_impossible(empty).empty
    assert detect_outages(empty).empty
    assert detect_flatline(empty).empty
