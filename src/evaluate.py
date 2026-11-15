"""Evaluation: build a clean synthetic sensor dataset, inject known health
issues, run the detectors, and measure precision / recall per issue type.

Synthetic clean data gives exact ground truth and isolates the detectors from
the messy real data (which already contains real outages). Each injected issue
is recorded so detections can be matched to it.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# a plausible hourly pedestrian shape (midnight .. 23:00)
_SHAPE = np.array([5, 3, 2, 2, 2, 6, 20, 60, 120, 160, 180, 200, 220, 210, 190,
                   180, 185, 210, 160, 110, 70, 45, 25, 12], dtype=float)


def make_clean(location_ids=(1001, 1002, 1003), days=21, seed=0,
               start="2026-01-05") -> pd.DataFrame:
    """A gap-free hourly dataset following a daily (and weekend) pattern."""
    rng = np.random.default_rng(seed)
    hours = pd.date_range(start, periods=days * 24, freq="h")
    rows = []
    for i, loc in enumerate(location_ids):
        scale = 1.0 + 0.5 * i
        for ts in hours:
            base = _SHAPE[ts.hour] * scale * (0.8 if ts.day_of_week >= 5 else 1.0)
            val = max(0, int(round(base + rng.normal(0, base * 0.08 + 1))))
            rows.append((loc, ts, ts.hour, val))
    return pd.DataFrame(rows, columns=["location_id", "timestamp", "hourday",
                                       "pedestriancount"])


def inject_issues(clean: pd.DataFrame, seed=1):
    """Return (dirty_df, events). Injects outages, flat-lines, impossible values
    and duplicates at known places."""
    rng = np.random.default_rng(seed)
    df = clean.sort_values(["location_id", "timestamp"]).reset_index(drop=True)
    locs = sorted(df["location_id"].unique())
    events: list[dict] = []
    remove = np.zeros(len(df), dtype=bool)

    def window(loc, dur):
        sub = df[df["location_id"] == loc]
        i = int(rng.integers(24, len(sub) - 48))
        return sub.iloc[i:i + dur]

    for _ in range(3):  # outages (remove the rows)
        w = window(rng.choice(locs), int(rng.integers(6, 24)))
        remove[w.index] = True
        events.append({"type": "outage", "location_id": int(w["location_id"].iloc[0]),
                       "start": w["timestamp"].iloc[0], "end": w["timestamp"].iloc[-1]})

    for _ in range(3):  # flat-lines (freeze on one value)
        w = window(rng.choice(locs), int(rng.integers(6, 12)))
        val = max(int(df.loc[w.index[0], "pedestriancount"]), 50)
        df.loc[w.index, "pedestriancount"] = val
        events.append({"type": "flat_line", "location_id": int(w["location_id"].iloc[0]),
                       "start": w["timestamp"].iloc[0], "end": w["timestamp"].iloc[-1]})

    for _ in range(3):  # impossible values
        sub = df[df["location_id"] == rng.choice(locs)]
        idx = sub.index[int(rng.integers(0, len(sub)))]
        df.loc[idx, "pedestriancount"] = -5 if rng.random() < 0.5 else 999999
        events.append({"type": "impossible_value", "location_id": int(df.loc[idx, "location_id"]),
                       "ts": df.loc[idx, "timestamp"]})

    dup_rows = []
    for _ in range(3):  # duplicates
        sub = df[df["location_id"] == rng.choice(locs)]
        idx = sub.index[int(rng.integers(0, len(sub)))]
        dup_rows.append(df.loc[idx])
        events.append({"type": "duplicate", "location_id": int(df.loc[idx, "location_id"]),
                       "ts": df.loc[idx, "timestamp"]})

    dirty = df[~remove]
    if dup_rows:
        dirty = pd.concat([dirty, pd.DataFrame(dup_rows)], ignore_index=True)
    return dirty.reset_index(drop=True), events


def _overlap(a0, a1, b0, b1) -> bool:
    return a0 <= b1 and b0 <= a1


def _metrics(truth_hit, det_hit, n_ev, n_det) -> dict:
    tp = sum(truth_hit)
    precision = (sum(det_hit) / n_det) if n_det else float("nan")
    recall = (tp / n_ev) if n_ev else float("nan")
    return {"n_events": n_ev, "n_det": n_det, "tp": tp,
            "fp": n_det - sum(det_hit), "fn": n_ev - tp,
            "precision": precision, "recall": recall}


def score(detected: pd.DataFrame, events, typ: str, interval: bool) -> dict:
    """Match detections of one type to injected events (interval overlap for
    outage/flat_line; exact timestamp for impossible/duplicate)."""
    ev = [e for e in events if e["type"] == typ]
    det = detected[detected["anomaly_type"] == typ]
    truth_hit = [False] * len(ev)
    det_hit = [False] * len(det)
    for di, d in enumerate(det.itertuples()):
        for ti, e in enumerate(ev):
            if d.location_id != e["location_id"]:
                continue
            if interval:
                hit = _overlap(pd.Timestamp(d.start_ts), pd.Timestamp(d.end_ts),
                               pd.Timestamp(e["start"]), pd.Timestamp(e["end"]))
            else:
                hit = pd.Timestamp(d.start_ts) == pd.Timestamp(e["ts"])
            if hit:
                truth_hit[ti] = True
                det_hit[di] = True
    return _metrics(truth_hit, det_hit, len(ev), len(det))
