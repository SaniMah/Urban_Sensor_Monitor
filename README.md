# Factory Pulse

**Sensor-fleet health monitoring** — ingest readings from a fleet of sensors,
learn each sensor's normal pattern, flag health problems (outages, flat-lines,
impossible values, duplicates, readings far from expected), show them on a map
dashboard, and generate a weekly health report.

Demonstrated on a **real public sensor network**: the City of Melbourne
**Pedestrian Counting System** (hourly counts from street sensors across the
city, plus sensor locations).

> ⚠️ **Status: in development.** This README describes the target; see
> [NOTES.md](NOTES.md) for what is actually built so far. Only tested features
> will be claimed here on completion.

---

## Problem

An organisation running a fleet of sensors — pedestrian counters, factory-floor
IoT, environmental monitors — needs to know, every day, which sensors are
**healthy** and which are lying or silent. A sensor that has died, frozen on one
value, or is reporting impossible numbers quietly corrupts every dashboard and
decision downstream. Checking hundreds of sensors by hand does not scale.

Factory Pulse automates that: it screens the whole fleet, flags the unhealthy
sensors with evidence, and summarises the week for the people who act on it.

## What it does (target)

1. **Ingest** hourly counts + sensor locations from the City of Melbourne
   Socrata API into a database.
2. **Profile** each sensor: a seasonal baseline (expected count by hour-of-day
   and day-of-week), and its normal range.
3. **Detect** health issues → an `anomaly` table:
   - **outage** (no data when data is expected),
   - **flat-line** (same value repeating — a stuck sensor),
   - **impossible value** (negative counts, or far beyond plausible),
   - **duplicate** (repeated timestamps),
   - **off-baseline** (far above/below the seasonal expectation).
4. **Dashboard** (Streamlit + map): fleet overview, a map of sensor health,
   per-sensor drill-down, and a downloadable issues table.
5. **Weekly report**: an LLM writes a plain-English health summary for council
   staff, from the computed numbers only.
6. **Evaluate**: precision/recall against injected and known issues.

## Tech stack

Python · pandas · NumPy · PostgreSQL (SQLAlchemy) · Streamlit + pydeck ·
Socrata API (requests) · pytest · an LLM (local or API).

## Project layout

```
data/        cached API pulls (git-ignored — not committed)
src/         ingest, profile, detect, evaluate, report, db
sql/         schema + saved analysis queries
app/         Streamlit dashboard
tests/       pytest
notebooks/   exploratory analysis
NOTES.md     plain-English notes (how each part works)
```

## Setup

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env     # then edit .env with your PostgreSQL URL
```

## Data & licence

- **City of Melbourne — Pedestrian Counting System** (hourly counts + sensor
  locations), via the open-data portal <https://data.melbourne.vic.gov.au>.
  Licence to be credited here on completion (City of Melbourne open data).
- Data pulls live in `data/` and are git-ignored.

## Note on AI assistance

This project was built with AI assistance. Design decisions, code and
documentation were reviewed before use.
