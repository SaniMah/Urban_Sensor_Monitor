# Factory Pulse - Urban Observatory

**A spatial-intelligence platform that monitors the health of a sensor fleet.**
It learns each sensor's normal pattern, flags outages, flat-lines, impossible
values and off-baseline drift, shows them on an interactive map, and writes a
plain-English weekly report - validated with precision/recall.

Demonstrated on a **real public sensor network**: the City of Melbourne
**Pedestrian Counting System** (hourly counts from ~130 street sensors).

> Portfolio project by **Sanithma** (Mechatronics Engineering & Computer
> Science, Monash University). Built with AI tooling; code and results reviewed
> and tested.

---

## The problem

An organisation running a fleet of sensors - pedestrian counters, factory-floor
IoT, environmental monitors - needs to know every day which sensors are
**healthy** and which are silent or lying. A sensor that has died, frozen on one
value, or is reporting impossible numbers quietly corrupts every dashboard and
decision downstream. Checking hundreds by hand does not scale.

Factory Pulse screens the whole fleet automatically, flags the unhealthy sensors
with evidence, and summarises the week for the people who act on it.

## What it does

```
Melbourne API -> ingest -> PostgreSQL -> baseline -> detect -> FastAPI -> React UI
                           (Neon)        (per slot)  (5 rules)             (4 screens)
                                                        |
                                                        +-> precision/recall evaluation
```

1. **Ingest** hourly counts + sensor locations from the City of Melbourne API.
2. **Baseline** each sensor: expected count by day-of-week and hour-of-day
   (median) and how variable each slot is (IQR).
3. **Detect** health issues into an `anomaly` table: **outage, flat-line,
   impossible value, duplicate, off-baseline**.
4. **Serve** everything through a FastAPI layer over the existing Python logic.
5. **Explore** in a React frontend - four screens (below).
6. **Report**: a local LLM writes a weekly health report from the numbers only.
7. **Evaluate**: precision / recall against injected known issues.

## The application (four screens)

- **01. Observatory** - a warm-white "observation plate": an interactive map of
  the whole fleet, sensors coloured by health, with the most critical sensors
  pre-annotated and any node clickable for a contextual panel.
- **02. Sensor Intelligence** - single-sensor investigation: interactive hourly
  time-series with outage/flat-line overlays, detection stats, locator, incidents.
- **03. Incident Explorer** - an operational workspace: filter/search, severity,
  expandable detail, CSV/XLSX export, and jump-to-sensor.
- **04. Intelligence Reports** - generate a weekly report (local LLM or template
  fallback), with a rendered preview and proper empty/loading states.

## Results & proof

**Real findings on the live Melbourne data** (6 months, 433k readings, 100
reporting sensors):

- **4,092 outages** detected - including **Collins Place South dead for 167
  hours** (~7 days) and several multi-day gaps.
- **10 flat-lined (stuck) sensors**.
- A 7-day report flagged a **21-hour outage at Southern Cross** and named the
  five sensors needing attention.

**The detectors are measured, not asserted.** Injecting 12 known issues into a
clean synthetic dataset and scoring by interval/timestamp match:

| rule | precision | recall |
|---|---|---|
| outage | 1.00 | 1.00 |
| flat-line | 1.00 | 1.00 |
| impossible value | 1.00 | 1.00 |
| duplicate | 1.00 | 1.00 |

Every injected issue found, zero false positives. (`off_baseline` is a tunable
"unusual reading" flag validated on real data, not scored here, since "unusual
but real" has no crisp ground truth.)

## Architecture & tech

```
backend/   FastAPI over the existing src/ logic (no business logic duplicated)
           GET /api/fleet, /api/sensors, /api/sensors/{id}
           GET /api/anomalies (+CSV/XLSX export), POST /api/report
src/       ingest / profile (baseline) / detect / evaluate / report / db
frontend/  React + TypeScript + Vite + Tailwind + Leaflet + ECharts + Motion
sql/       3NF schema (sensor / reading / baseline / anomaly)
```

**Python** (pandas, NumPy) / **PostgreSQL** on Neon via **SQLAlchemy** /
**FastAPI** / **React/TypeScript** / **Leaflet** (Esri dark/light basemaps, no
API key) / **Apache ECharts** / a **local LLM** (Ollama).

The frontend is fully decoupled from the backend and talks to it over HTTP; the
Python analysis, detection thresholds, database queries and report logic are
reused unchanged.

## Run it locally

Prerequisites: Python 3.11+, Node 20+, a PostgreSQL database (e.g. a free
[Neon](https://neon.tech) project).

```bash
# 1. backend / data pipeline
python -m venv .venv && .venv\Scripts\Activate.ps1   # (Windows)
pip install -r requirements.txt
copy .env.example .env            # add the Neon DATABASE_URL

python run_step1.py               # ingest + explore
python run_step2.py               # schema + load + baseline
python run_step4.py               # detection -> anomaly table
python run_step5.py               # evaluation: precision/recall

# 2. API
uvicorn backend.app.main:app --port 8000

# 3. frontend (separate terminal)
cd frontend && npm install && npm run dev      # http://localhost:5173
```

The weekly report runs on a **local** model: install
[Ollama](https://ollama.com), `ollama pull llama3.2`, and it upgrades from
template to LLM prose automatically. Without it, a template draft is produced.

## Deploy (one service)

The Dockerfile builds the frontend and runs the API serving it - one image, one
URL, no CORS. On [Render](https://render.com): **New -> Blueprint**, point at this
repo (it reads `render.yaml`), and set **`DATABASE_URL`** (the Neon string) in
the dashboard. The service exposes the whole app at its URL; `/api/health` is the
health check.

## Testing

```bash
pytest -q        # detection rules, baseline, and the precision/recall scorer
cd frontend && npm run build   # strict TypeScript + production build
```

## Limitations (honest notes)

- Evaluation uses **injected** issues on synthetic data: exact ground truth, but
  synthetic. Real-data findings are shown, not scored.
- `off_baseline` is a tunable flag, not a hard fault; thresholds (3-hour outage,
  6-hour flat-line, k*IQR) are starting points to tune with an operations team.
- The free Render tier sleeps when idle, so the first request after a pause is
  slow.

## Data & licence

City of Melbourne - **Pedestrian Counting System** (hourly counts + sensor
locations), open-data portal <https://data.melbourne.vic.gov.au>, under the City
of Melbourne open-data licence. Live data pulls and secrets are git-ignored.
