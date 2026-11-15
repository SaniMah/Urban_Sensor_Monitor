"""Read-only data access for the API. Pure SQL against the existing schema;
every number is computed from Postgres, nothing is hardcoded. A `days` window
(None = full history) lets the UI show either the current snapshot or all time.
"""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy import text
from sqlalchemy.engine import Engine


def _window_clause(column: str, days: int | None) -> tuple[str, dict]:
    """Return a SQL fragment + params restricting `column` to the last `days`
    (relative to the latest reading), or ('', {}) for full history."""
    if not days:
        return "", {}
    return f" AND {column} >= (SELECT max(ts) FROM reading) - :win ", {
        "win": timedelta(days=days)
    }


def fleet_summary(eng: Engine, days: int | None = None) -> dict:
    aw, ap = _window_clause("a.start_ts", days)
    rw, rp = _window_clause("ts", days)
    with eng.connect() as c:
        sensors = c.execute(text("SELECT count(*) FROM sensor")).scalar_one()
        reporting = c.execute(
            text(f"SELECT count(DISTINCT location_id) FROM reading WHERE 1=1 {rw}"), rp
        ).scalar_one()
        flagged = c.execute(
            text(f"SELECT count(DISTINCT location_id) FROM anomaly a WHERE 1=1 {aw}"), ap
        ).scalar_one()
        by_type = c.execute(text(
            f"SELECT anomaly_type, count(*) n FROM anomaly a WHERE 1=1 {aw} "
            "GROUP BY anomaly_type ORDER BY n DESC"), ap).all()
        total = sum(n for _, n in by_type)
        worst = c.execute(text(
            f"""SELECT a.location_id, s.description, a.value hours, a.start_ts
                FROM anomaly a JOIN sensor s USING (location_id)
                WHERE a.anomaly_type='outage' {aw}
                ORDER BY a.value DESC LIMIT 1"""), ap).first()
        attention = c.execute(text(
            f"""SELECT a.location_id id, s.description desc, count(*) issues,
                  count(*) FILTER (WHERE a.anomaly_type='outage')       outages,
                  count(*) FILTER (WHERE a.anomaly_type='flat_line')    flat,
                  count(*) FILTER (WHERE a.anomaly_type='off_baseline') off_base
                FROM anomaly a JOIN sensor s USING (location_id)
                WHERE 1=1 {aw}
                GROUP BY a.location_id, s.description
                ORDER BY issues DESC LIMIT 8"""), ap).mappings().all()
    return {
        "window_days": days,
        "fleet": {"sensors": int(sensors), "reporting": int(reporting),
                  "flagged": int(flagged), "issues_total": int(total)},
        "by_type": [{"type": t, "n": int(n)} for t, n in by_type],
        "worst_outage": (
            {"id": int(worst.location_id), "desc": worst.description,
             "hours": int(worst.hours), "start": str(worst.start_ts)}
            if worst else None),
        "attention": [dict(r) for r in attention],
    }


def sensors_health(eng: Engine, days: int | None = None) -> list[dict]:
    aw, ap = _window_clause("a.start_ts", days)
    rw, rp = _window_clause("r.ts", days)
    sql = text(
        f"""SELECT s.location_id id, s.description desc, s.latitude lat,
               s.longitude lon,
               (SELECT count(*) FROM anomaly a
                  WHERE a.location_id=s.location_id {aw}) issues,
               (SELECT count(*) FROM reading r
                  WHERE r.location_id=s.location_id {rw}) readings
            FROM sensor s
            WHERE s.latitude IS NOT NULL""")
    with eng.connect() as c:
        rows = c.execute(sql, {**ap, **rp}).mappings().all()
    out = []
    for r in rows:
        d = dict(r)
        d["status"] = "nodata" if d["readings"] == 0 else (
            "fault" if d["issues"] > 0 else "ok")
        out.append(d)
    return out


def sensor_detail(eng: Engine, location_id: int, days: int | None = None) -> dict:
    rw, rp = _window_clause("ts", days)
    with eng.connect() as c:
        meta = c.execute(text(
            "SELECT location_id id, description desc, latitude lat, longitude lon "
            "FROM sensor WHERE location_id=:l"), {"l": location_id}).mappings().first()
        if not meta:
            return {}
        series = c.execute(text(
            f"SELECT ts, pedestrian_count v FROM reading "
            f"WHERE location_id=:l {rw} ORDER BY ts"),
            {"l": location_id, **rp}).all()
        anoms = c.execute(text(
            """SELECT anomaly_type type, start_ts, end_ts, value, detail
               FROM anomaly WHERE location_id=:l ORDER BY start_ts"""),
            {"l": location_id}).mappings().all()
    return {
        "sensor": dict(meta),
        "series": [[str(ts), None if v is None else int(v)] for ts, v in series],
        "anomalies": [dict(a) | {"start_ts": str(a["start_ts"]),
                                 "end_ts": str(a["end_ts"])} for a in anoms],
    }


def anomalies(eng: Engine, types: list[str] | None = None,
              location_id: int | None = None, limit: int = 2000) -> list[dict]:
    clauses, params = [], {"lim": limit}
    if types:
        clauses.append("a.anomaly_type = ANY(:types)")
        params["types"] = types
    if location_id:
        clauses.append("a.location_id = :loc")
        params["loc"] = location_id
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    with eng.connect() as c:
        rows = c.execute(text(
            f"""SELECT a.anomaly_id id, a.anomaly_type type, a.location_id,
                   s.description desc, a.start_ts, a.end_ts, a.value, a.detail
                FROM anomaly a JOIN sensor s USING (location_id)
                {where} ORDER BY a.start_ts DESC LIMIT :lim"""), params).mappings().all()
    return [dict(r) | {"start_ts": str(r["start_ts"]),
                       "end_ts": str(r["end_ts"])} for r in rows]


def anomaly_types(eng: Engine) -> list[str]:
    with eng.connect() as c:
        return [t for (t,) in c.execute(text(
            "SELECT DISTINCT anomaly_type FROM anomaly ORDER BY anomaly_type")).all()]
