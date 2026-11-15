"""Tests for the evaluation harness: injected issues are recovered by the
detectors with high precision/recall."""
import pandas as pd

from src.detect import (
    detect_duplicates,
    detect_flatline,
    detect_impossible,
    detect_outages,
)
from src.evaluate import inject_issues, make_clean, score


def test_clean_dataset_is_gap_free():
    clean = make_clean(days=7)
    # every sensor's timestamps should be strictly hourly (no gaps)
    for _, g in clean.groupby("location_id"):
        gaps = g.sort_values("timestamp")["timestamp"].diff().dropna()
        assert (gaps == pd.Timedelta(hours=1)).all()


def test_injected_issues_are_recovered():
    clean = make_clean()
    dirty, events = inject_issues(clean)
    detected = pd.concat([
        detect_duplicates(dirty),
        detect_impossible(dirty),
        detect_flatline(dirty),
        detect_outages(dirty),
    ], ignore_index=True)

    for typ, interval in [("outage", True), ("flat_line", True),
                          ("impossible_value", False), ("duplicate", False)]:
        m = score(detected, events, typ, interval)
        assert m["recall"] == 1.0, f"{typ} recall {m['recall']}"
        assert m["precision"] == 1.0, f"{typ} precision {m['precision']}"


def test_score_counts():
    events = [{"type": "duplicate", "location_id": 1,
               "ts": pd.Timestamp("2026-01-05 05:00")}]
    detected = pd.DataFrame({
        "anomaly_type": ["duplicate"], "location_id": [1],
        "start_ts": [pd.Timestamp("2026-01-05 05:00")],
        "end_ts": [pd.Timestamp("2026-01-05 05:00")],
    })
    m = score(detected, events, "duplicate", interval=False)
    assert m["tp"] == 1 and m["fp"] == 0 and m["fn"] == 0
