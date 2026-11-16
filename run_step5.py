"""Step 5 - evaluation.

Inject known health issues into a clean synthetic dataset, run the detectors,
and report precision / recall for each issue type.

Run:
    python run_step5.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from src.detect import (  # noqa: E402
    detect_duplicates,
    detect_flatline,
    detect_impossible,
    detect_outages,
)
from src.evaluate import inject_issues, make_clean, score  # noqa: E402


def main():
    clean = make_clean()
    dirty, events = inject_issues(clean)
    print(f"Clean dataset: {len(clean):,} readings, {clean['location_id'].nunique()} sensors.")
    print(f"Injected {len(events)} issues; dirty dataset has {len(dirty):,} rows.\n")

    detected = pd.concat([
        detect_duplicates(dirty),
        detect_impossible(dirty),
        detect_flatline(dirty),
        detect_outages(dirty),
    ], ignore_index=True)

    checks = [
        ("outage", True), ("flat_line", True),
        ("impossible_value", False), ("duplicate", False),
    ]
    print(f"{'issue type':<18}{'events':>7}{'det':>6}{'TP':>4}{'FP':>4}{'FN':>4}"
          f"{'prec':>7}{'recall':>8}")
    tot = {"tp": 0, "fp": 0, "fn": 0}
    for typ, interval in checks:
        m = score(detected, events, typ, interval)
        tot["tp"] += m["tp"]; tot["fp"] += m["fp"]; tot["fn"] += m["fn"]
        print(f"{typ:<18}{m['n_events']:>7}{m['n_det']:>6}{m['tp']:>4}{m['fp']:>4}"
              f"{m['fn']:>4}{m['precision']:>7.2f}{m['recall']:>8.2f}")

    prec = tot["tp"] / (tot["tp"] + tot["fp"]) if (tot["tp"] + tot["fp"]) else float("nan")
    rec = tot["tp"] / (tot["tp"] + tot["fn"]) if (tot["tp"] + tot["fn"]) else float("nan")
    print(f"\nOverall: precision {prec:.2f}, recall {rec:.2f} "
          f"(TP {tot['tp']}, FP {tot['fp']}, FN {tot['fn']}).")


if __name__ == "__main__":
    main()
