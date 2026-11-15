"""Export a JSON snapshot of the current fleet state for the bespoke web UI.

Reads the same Postgres the Streamlit app uses and writes web/data/snapshot.json
(and inlines nothing) — the static front-end consumes this file. Re-run it to
refresh the numbers; later this becomes the single endpoint the deployed site
hits.

    python scripts/export_web_snapshot.py
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from sqlalchemy import text

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from src.db import get_engine  # noqa: E402

OUT = ROOT / "web" / "data" / "snapshot.json"


def main() -> None:
    eng = get_engine()
    with eng.connect() as c:
        fleet_sensors = c.execute(text("SELECT count(*) FROM sensor")).scalar_one()
        reporting = c.execute(text(
            "SELECT count(DISTINCT location_id) FROM reading")).scalar_one()
        flagged = c.execute(text(
            "SELECT count(DISTINCT location_id) FROM anomaly")).scalar_one()
        issues_total = c.execute(text("SELECT count(*) FROM anomaly")).scalar_one()

        by_type = c.execute(text(
            "SELECT anomaly_type, count(*) n FROM anomaly GROUP BY anomaly_type "
            "ORDER BY n DESC")).all()

        attention = c.execute(text(
            """
            SELECT a.location_id, s.description, count(*) n,
              count(*) FILTER (WHERE a.anomaly_type='outage')       n_out,
              count(*) FILTER (WHERE a.anomaly_type='flat_line')    n_flat,
              count(*) FILTER (WHERE a.anomaly_type='off_baseline') n_off
            FROM anomaly a JOIN sensor s USING (location_id)
            GROUP BY a.location_id, s.description ORDER BY n DESC LIMIT 6
            """)).all()

        worst = c.execute(text(
            """
            SELECT a.location_id, s.description, a.value hours, a.start_ts
            FROM anomaly a JOIN sensor s USING (location_id)
            WHERE a.anomaly_type='outage' ORDER BY a.value DESC LIMIT 1
            """)).first()

        # map points: every sensor with a location + its health
        sensors = c.execute(text(
            """
            SELECT s.location_id, s.description, s.latitude, s.longitude,
                   count(a.anomaly_id) n_anom,
                   (SELECT count(*) FROM reading r WHERE r.location_id=s.location_id) n_read
            FROM sensor s LEFT JOIN anomaly a ON a.location_id = s.location_id
            WHERE s.latitude IS NOT NULL
            GROUP BY s.location_id, s.description, s.latitude, s.longitude
            """)).all()

        # one sensor's hourly series for the hero chart (the top offender)
        hero_id = attention[0].location_id if attention else reporting
        series = c.execute(text(
            "SELECT ts, pedestrian_count FROM reading WHERE location_id=:l "
            "ORDER BY ts"), {"l": hero_id}).all()
        hero_desc = next((a.description for a in attention
                          if a.location_id == hero_id), str(hero_id))
        hero_outages = c.execute(text(
            "SELECT start_ts, end_ts FROM anomaly WHERE location_id=:l "
            "AND anomaly_type='outage' ORDER BY start_ts"), {"l": hero_id}).all()

    def status(n_anom, n_read):
        if n_read == 0:
            return "nodata"
        return "fault" if n_anom > 0 else "ok"

    snap = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "fleet": {"sensors": int(fleet_sensors), "reporting": int(reporting),
                  "flagged": int(flagged), "issues_total": int(issues_total)},
        "by_type": [{"type": t, "n": int(n)} for t, n in by_type],
        "attention": [
            {"id": int(r.location_id), "desc": r.description, "issues": int(r.n),
             "outages": int(r.n_out), "flat": int(r.n_flat), "off": int(r.n_off)}
            for r in attention
        ],
        "worst_outage": (
            {"id": int(worst.location_id), "desc": worst.description,
             "hours": int(worst.hours), "start": str(worst.start_ts)}
            if worst else None),
        "sensors": [
            {"id": int(r.location_id), "desc": r.description,
             "lat": float(r.latitude), "lon": float(r.longitude),
             "issues": int(r.n_anom), "readings": int(r.n_read),
             "status": status(r.n_anom, r.n_read)}
            for r in sensors
        ],
        "hero": {
            "id": int(hero_id), "desc": hero_desc,
            "points": [[str(ts), int(v)] for ts, v in series],
            "outages": [[str(s), str(e)] for s, e in hero_outages],
        },
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(snap), encoding="utf-8")
    print(f"wrote {OUT}  ({OUT.stat().st_size/1024:.0f} KB)")
    print(f"fleet={snap['fleet']}  sensors={len(snap['sensors'])}  "
          f"hero={hero_id} pts={len(series)}")


if __name__ == "__main__":
    main()
