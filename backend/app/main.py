"""Factory Pulse API — FastAPI over the existing analytical core (src/).

Run (from project root):
    uvicorn backend.app.main:app --reload --port 8000

Endpoints (all read-only except the report generator, which only reads the DB
and calls a local model):
    GET  /api/health                 liveness
    GET  /api/fleet?days=            fleet summary, issue mix, worst outage, attention
    GET  /api/sensors?days=          all sensors + health state (for the map)
    GET  /api/sensors/{id}?days=     one sensor: metadata, time series, anomalies
    GET  /api/anomalies              filterable issue records (type, sensor)
    GET  /api/anomalies/export       same, as CSV or XLSX
    GET  /api/anomaly-types          distinct types (for filters)
    POST /api/report                 weekly report (Ollama if up, else template)
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from src.db import get_engine  # noqa: E402
from src.report import generate_report  # noqa: E402
from backend.app import queries as q  # noqa: E402

app = FastAPI(title="Factory Pulse API", version="1.0.0")

# Dev frontend runs on Vite (5173/4173); lock CORS to localhost origins.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_methods=["*"], allow_headers=["*"],
)

_engine = None


def engine():
    global _engine
    if _engine is None:
        _engine = get_engine()
    return _engine


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/fleet")
def fleet(days: int | None = Query(None, ge=1, le=365)):
    return q.fleet_summary(engine(), days)


@app.get("/api/sensors")
def sensors(days: int | None = Query(None, ge=1, le=365)):
    return {"sensors": q.sensors_health(engine(), days)}


@app.get("/api/sensors/{location_id}")
def sensor(location_id: int, days: int | None = Query(None, ge=1, le=365)):
    detail = q.sensor_detail(engine(), location_id, days)
    if not detail:
        raise HTTPException(404, f"sensor {location_id} not found")
    return detail


@app.get("/api/anomaly-types")
def types():
    return {"types": q.anomaly_types(engine())}


@app.get("/api/anomalies")
def anomalies(
    type: list[str] | None = Query(None),
    location_id: int | None = Query(None),
    limit: int = Query(2000, ge=1, le=20000),
):
    return {"anomalies": q.anomalies(engine(), type, location_id, limit)}


@app.get("/api/anomalies/export")
def export(
    format: str = Query("csv", pattern="^(csv|xlsx)$"),
    type: list[str] | None = Query(None),
    location_id: int | None = Query(None),
):
    df = pd.DataFrame(q.anomalies(engine(), type, location_id, limit=20000))
    if format == "csv":
        buf = io.BytesIO(df.to_csv(index=False).encode())
        media = "text/csv"
        name = "factory_pulse_issues.csv"
    else:
        buf = io.BytesIO()
        with pd.ExcelWriter(buf, engine="openpyxl") as w:
            df.to_excel(w, index=False, sheet_name="issues")
        buf.seek(0)
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        name = "factory_pulse_issues.xlsx"
    return StreamingResponse(buf, media_type=media,
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})


class ReportReq(BaseModel):
    days: int = 7


@app.post("/api/report")
def report(req: ReportReq):
    if not 1 <= req.days <= 90:
        raise HTTPException(422, "days must be 1..90")
    text_md, source = generate_report(engine(), days=req.days)
    return {"report": text_md, "source": source,
            "is_llm": not source.startswith("template")}
