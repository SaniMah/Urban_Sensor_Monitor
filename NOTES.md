# NOTES - Factory Pulse

Plain-English notes on how each part works, for my own understanding and
interview prep. One short entry per build step.

---

## Step 0 - Setup

**Goal:** stand up an empty, well-organised project for the Melbourne sensor
health platform, reusing the methodology proven on the CAN Log Analyser so the
two projects together show a repeatable approach.

**What I created and why:**

- **Folder layout** - `data/ src/ sql/ app/ tests/ notebooks/`. Same structure
  as CanLog: code in `src/`, queries in `sql/`, the app in `app/`, tests in
  `tests/`. Empty folders carry a `.gitkeep` so Git tracks them.

- **`.gitignore`** - never commit `.env` (DB password, tokens) or `data/`
  (cached API pulls), plus Python caches and the virtual environment.

- **`.env.example`** - committed template of the secrets needed:
  `DATABASE_URL` (PostgreSQL), `MELBOURNE_APP_TOKEN` (optional Socrata token for
  higher rate limits), and an LLM key for later.

- **`requirements.txt`** - core libs (pandas, numpy, SQLAlchemy, psycopg2,
  streamlit) plus `pydeck` for the sensor map and `requests` for the Socrata
  API. Optional ones (scikit-learn, sodapy) are commented out.

- **`src/__init__.py`** - makes `src/` a package and lists the planned modules
  (ingest, profile, detect, evaluate, report, db).

- **`README.md`** - the public face, framed as a consulting case (problem -> what
  it does -> how to run). Marked "in development".

**Framing:** Factory Pulse is a general **sensor-fleet health monitor**,
demonstrated on the City of Melbourne Pedestrian Counting System (real public
data). The same idea applies to factory/IoT sensor fleets - which is why the
name fits and the story generalises.

**Data source:** City of Melbourne open data (Socrata) - Pedestrian Counting
System hourly counts + sensor locations. Exact dataset IDs confirmed in Step 1.

**Next (Step 1):** pull one month of counts + the sensor-location table from the
Socrata API into a DataFrame; confirm the schema (sensor id, timestamp, count,
lat/long); plot one sensor's daily pattern.

---

## Step 1 - Ingest + first look

**Goal:** pull the real Melbourne data, confirm its shape, and see the seasonal
pattern the baseline will learn.

**Data source (confirmed live):** the City of Melbourne portal runs
Opendatasoft; the Explore API v2.1 `exports/json` endpoint returns all matching
records. Two datasets, joined on `location_id`:
- `pedestrian-counting-system-monthly-counts-per-hour` - 1.63M rows since 2009;
  fields `location_id, sensing_date, hourday, direction_1/2, pedestriancount`.
- `pedestrian-counting-system-sensor-locations` - 134 sensors with lat/long,
  `status` (A = active), description.

**What each file does:**
- **`src/ingest.py`** - `fetch_sensors()` and `fetch_counts(where=...)` hit the
  API; counts get a real `timestamp` built from `sensing_date` + `hourday`.
- **`src/db.py`** - the SQLAlchemy engine (same pattern as CanLog), reads
  `DATABASE_URL` from `.env`.
- **`run_step1.py`** - pulls a recent window, caches to `data/`, prints the
  busiest sensors, and plots one sensor's weekday-vs-weekend daily profile.

**Result:** 433,536 rows over May-Nov 2026, 100 of 134 sensors reporting.
Busiest: sensor 4 (Swa123_T). Its daily profile shows the clear day/night cycle
and a weekday/weekend split (weekday lunch + 5pm peaks; weekend afternoon) - the
exact structure the seasonal baseline will model.

**Security note (important):** while wiring this up, a Neon connection string was
accidentally pasted into the `MELBOURNE_APP_TOKEN` field of `.env`, and the first
version of `ingest.py` sent any token as a URL query parameter - so the DB
password was briefly sent to the Melbourne API. Fixes: (1) `ingest.py` now sends
a token only as an `Authorization` header and ignores anything that looks like a
connection string (`://` or `@`); (2) the secret was cleared from `.env`. The
exposed Neon password should be rotated. Lesson: never put secrets in URL query
strings, and validate what a "token" actually is before sending it.

**Next (Step 2):** schema (`sensor`, `reading` with FK, `baseline`, `anomaly`),
bulk-load the counts, and compute the seasonal baseline per sensor - needs the
(rotated) `DATABASE_URL`.

---

## Step 2 - Database + baseline

**Schema (`sql/schema.sql`):** `sensor` (parent; **natural PK** `location_id`,
stable in the source data), `reading` (hourly facts, FK -> sensor, index on
`(location_id, ts)`), `baseline` (expected count per sensor/weekday/hour,
`UNIQUE(location_id, dow, hourday)`), `anomaly` (CHECK on the five types).

**Load (`src/ingest.py`, `src/profile.py`, `run_step2.py`):** sensors via
`to_sql`; 433,536 readings bulk-loaded with PostgreSQL **COPY**; readings from
sensors not in the location table are dropped first so the FK holds. The
**baseline** is the median count for each (sensor, day-of-week, hour-of-day)
plus the IQR (how variable that slot is) - this is the "expected normal".

**Result:** sensor 134, reading 433,536, baseline 16,656 rows, verified by SQL.

## Step 4 - Detection

**`src/detect.py` - five health rules writing to `anomaly`:**
- **duplicate** - same (sensor, hour) more than once.
- **impossible_value** - negative, or beyond a plausible max (20,000/hr).
- **flat_line** - a non-zero count repeating >= 6 hours (stuck sensor).
- **outage** - a gap of >= 3 hours between readings (sensor down).
- **off_baseline** - a reading beyond `max(k * IQR, floor)` from its slot's
  expected count (k=6; a floor stops quiet slots over-firing).

**Real findings on the Melbourne data** (parallel to CanLog's `3D2`): 0
duplicates / 0 impossible (clean), **10 flat-lines**, **4,092 outages** - e.g.
**Collins Place South was dead for 167 hours** (~7 days) from 29 Oct - and 1,657
off-baseline readings. These are genuine sensor-health issues a council would act
on.

## Step 5 - Evaluation

**`src/evaluate.py`, `run_step5.py`:** build a clean synthetic hourly dataset
(exact ground truth, isolated from the messy real data), inject 12 known issues
(3 each of outage / flat-line / impossible / duplicate), run the detectors, and
match by interval overlap or exact timestamp.

**Result:** every type scores **precision 1.00, recall 1.00** - all 12 found,
zero false positives. (off_baseline is validated on real data as a tuning
choice, not scored here, since "unusual but real" has no crisp ground truth.)

**Next (Step 6):** Streamlit + map dashboard - fleet overview, a map of sensor
health, per-sensor drill-down, and a downloadable issues table.

---

## Step 6 - Dashboard with health map

**`app/dashboard.py` - reads from PostgreSQL, three tabs:**
- **Fleet overview** - metric cards (sensors, reporting, flagged, total issues)
  and a **geographic health map** (pydeck `ScatterplotLayer` over a Carto
  basemap): every sensor at its real lat/long, coloured green (healthy) / red
  (has issues) / grey (no data in window), radius by issue count. Plus an
  issues-by-type bar chart.
- **Sensor drill-down** - pick a sensor; see its hourly time series with
  **outages shaded red and flat-lines orange**, and headline metrics.
- **Issues table** - all anomalies, filterable by type, with CSV/Excel download.

Caching (`st.cache_data` / `st.cache_resource`) keeps it responsive.

**Verified live in the browser:** 134 sensors / 100 reporting / 99 flagged /
5,759 issues; the map plots the CBD sensor cluster correctly; the drill-down
shades a sensor's outages. The map is the geographic view the CAN project could
not have - a natural fit for city sensor data.

**Launch gotcha (noted):** both this project and CanLog named their launch
config "dashboard", which collided; renamed this one `factory-pulse-dashboard`
on port 8502. Run: `streamlit run app/dashboard.py`.

**Next (Step 7):** the AI weekly health report - summarise the week's anomalies
to JSON and have a local/offline LLM write a plain-English report for council
staff, from the numbers only.

---

## Step 7 - AI weekly report

**Goal:** a plain-English weekly health report for council staff, written by a
**local** LLM from the numbers only (no cloud, no key) - same design as CanLog.

**`src/report.py`:**
1. `gather_facts(days=7)` - queries the DB for the last 7 days of data: fleet
   summary (sensors, reporting, flagged), issues by type, the 5 sensors with the
   most issues (with their outage/flat-line/off-baseline breakdown), and the
   single longest outage. Numbers only.
2. `build_prompt` - tells the model to use **only** those numbers, write for a
   non-technical reader, start with the DRAFT banner, and fill Summary / Sensors
   needing attention / Issue breakdown / Recommended next checks.
3. `generate_with_ollama` + a 2-second `ollama_available()` health-check so it
   never hangs when Ollama is absent.
4. `render_fallback` - a deterministic template producing the same report from
   the same facts, so a useful draft is always produced.

**Where it runs:** `run_step7.py` (CLI -> `reports/weekly_report_7d.md`) and a
**Weekly report** tab in the dashboard (day-window slider + Generate button +
download). Verified in the browser.

**Sample output (7 days):** 99 of 134 sensors reporting, 63 flagged, 221 issues;
longest outage 21 h at Southern Cross (sensor 135); top offenders named with
their issue mix. Reads like a report a maintenance team could act on.

**Why local + numbers-only:** no cost, data stays on the machine, and feeding
the model only pre-computed numbers means it can't invent measurements. Marked a
draft.

**Next (Step 8):** pytest for the detection/baseline logic, and the README as a
consulting case.

---

## Step 8 - Tests & README

**Tests (`tests/`, 13 passing, no database):** all on small synthetic
DataFrames, so they run anywhere / in CI. `conftest.py` puts the project root on
`sys.path`.
- `test_detect.py` - clean data fires nothing; each rule fires on its own
  injected issue (duplicate, impossible, flat-line, outage, off-baseline); a
  repeated **zero** is NOT flagged as a flat-line (night quiet is normal); empty
  input does not crash.
- `test_profile.py` - the baseline is the median per (sensor, weekday, hour),
  and different hours become different rows.
- `test_evaluate.py` - the synthetic clean data is gap-free; injected issues are
  recovered at precision/recall 1.00; the scorer counts TP/FP/FN correctly.

Run with `pytest -q`. (Also fixed a pandas deprecation: `dayofweek` ->
`day_of_week` in the synthetic generator.)

**README:** written as a consulting case - problem, who it's for, what it does,
**real findings** (4,092 outages incl. a 167-hour one; the precision/recall
table), tech/schema, how to run, testing, honest limitations, data & licence,
and the AI-assistance note. Embeds the seasonal-profile figure.

**Status:** Factory Pulse is feature-complete and submission-ready - it mirrors
the CAN Log Analyser method (ingest -> DB -> baseline -> detection -> evaluation ->
dashboard -> AI report) on a different, geographic dataset, which is the point:
one repeatable approach, two domains.

**Remaining (optional):** deploy the dashboard to Streamlit Community Cloud,
screenshots + a short demo recording.
