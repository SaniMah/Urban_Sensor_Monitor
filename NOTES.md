# NOTES — Factory Pulse

Plain-English notes on how each part works, for my own understanding and
interview prep. One short entry per build step.

---

## Step 0 — Setup (11 Nov 2026)

**Goal:** stand up an empty, well-organised project for the Melbourne sensor
health platform, reusing the methodology proven on the CAN Log Analyser so the
two projects together show a repeatable approach.

**What I created and why:**

- **Folder layout** — `data/ src/ sql/ app/ tests/ notebooks/`. Same structure
  as CanLog: code in `src/`, queries in `sql/`, the app in `app/`, tests in
  `tests/`. Empty folders carry a `.gitkeep` so Git tracks them.

- **`.gitignore`** — never commit `.env` (DB password, tokens) or `data/`
  (cached API pulls), plus Python caches and the virtual environment.

- **`.env.example`** — committed template of the secrets needed:
  `DATABASE_URL` (PostgreSQL), `MELBOURNE_APP_TOKEN` (optional Socrata token for
  higher rate limits), and an LLM key for later.

- **`requirements.txt`** — core libs (pandas, numpy, SQLAlchemy, psycopg2,
  streamlit) plus `pydeck` for the sensor map and `requests` for the Socrata
  API. Optional ones (scikit-learn, sodapy) are commented out.

- **`src/__init__.py`** — makes `src/` a package and lists the planned modules
  (ingest, profile, detect, evaluate, report, db).

- **`README.md`** — the public face, framed as a consulting case (problem → what
  it does → how to run). Marked "in development".

**Framing:** Factory Pulse is a general **sensor-fleet health monitor**,
demonstrated on the City of Melbourne Pedestrian Counting System (real public
data). The same idea applies to factory/IoT sensor fleets — which is why the
name fits and the story generalises.

**Data source:** City of Melbourne open data (Socrata) — Pedestrian Counting
System hourly counts + sensor locations. Exact dataset IDs confirmed in Step 1.

**Next (Step 1):** pull one month of counts + the sensor-location table from the
Socrata API into a DataFrame; confirm the schema (sensor id, timestamp, count,
lat/long); plot one sensor's daily pattern.

---

## Step 1 — Ingest + first look (11 Nov 2026)

**Goal:** pull the real Melbourne data, confirm its shape, and see the seasonal
pattern the baseline will learn.

**Data source (confirmed live):** the City of Melbourne portal runs
Opendatasoft; the Explore API v2.1 `exports/json` endpoint returns all matching
records. Two datasets, joined on `location_id`:
- `pedestrian-counting-system-monthly-counts-per-hour` — 1.63M rows since 2009;
  fields `location_id, sensing_date, hourday, direction_1/2, pedestriancount`.
- `pedestrian-counting-system-sensor-locations` — 134 sensors with lat/long,
  `status` (A = active), description.

**What each file does:**
- **`src/ingest.py`** — `fetch_sensors()` and `fetch_counts(where=...)` hit the
  API; counts get a real `timestamp` built from `sensing_date` + `hourday`.
- **`src/db.py`** — the SQLAlchemy engine (same pattern as CanLog), reads
  `DATABASE_URL` from `.env`.
- **`run_step1.py`** — pulls a recent window, caches to `data/`, prints the
  busiest sensors, and plots one sensor's weekday-vs-weekend daily profile.

**Result:** 433,536 rows over May–Nov 2026, 100 of 134 sensors reporting.
Busiest: sensor 4 (Swa123_T). Its daily profile shows the clear day/night cycle
and a weekday/weekend split (weekday lunch + 5pm peaks; weekend afternoon) — the
exact structure the seasonal baseline will model.

**Security note (important):** while wiring this up, a Neon connection string was
accidentally pasted into the `MELBOURNE_APP_TOKEN` field of `.env`, and the first
version of `ingest.py` sent any token as a URL query parameter — so the DB
password was briefly sent to the Melbourne API. Fixes: (1) `ingest.py` now sends
a token only as an `Authorization` header and ignores anything that looks like a
connection string (`://` or `@`); (2) the secret was cleared from `.env`. The
exposed Neon password should be rotated. Lesson: never put secrets in URL query
strings, and validate what a "token" actually is before sending it.

**Next (Step 2):** schema (`sensor`, `reading` with FK, `baseline`, `anomaly`),
bulk-load the counts, and compute the seasonal baseline per sensor — needs the
(rotated) `DATABASE_URL`.

---

## Step 2 — Database + baseline (13 Nov 2026)

**Schema (`sql/schema.sql`):** `sensor` (parent; **natural PK** `location_id`,
stable in the source data), `reading` (hourly facts, FK → sensor, index on
`(location_id, ts)`), `baseline` (expected count per sensor/weekday/hour,
`UNIQUE(location_id, dow, hourday)`), `anomaly` (CHECK on the five types).

**Load (`src/ingest.py`, `src/profile.py`, `run_step2.py`):** sensors via
`to_sql`; 433,536 readings bulk-loaded with PostgreSQL **COPY**; readings from
sensors not in the location table are dropped first so the FK holds. The
**baseline** is the median count for each (sensor, day-of-week, hour-of-day)
plus the IQR (how variable that slot is) — this is the "expected normal".

**Result:** sensor 134, reading 433,536, baseline 16,656 rows, verified by SQL.

## Step 4 — Detection (13 Nov 2026)

**`src/detect.py` — five health rules writing to `anomaly`:**
- **duplicate** — same (sensor, hour) more than once.
- **impossible_value** — negative, or beyond a plausible max (20,000/hr).
- **flat_line** — a non-zero count repeating >= 6 hours (stuck sensor).
- **outage** — a gap of >= 3 hours between readings (sensor down).
- **off_baseline** — a reading beyond `max(k * IQR, floor)` from its slot's
  expected count (k=6; a floor stops quiet slots over-firing).

**Real findings on the Melbourne data** (parallel to CanLog's `3D2`): 0
duplicates / 0 impossible (clean), **10 flat-lines**, **4,092 outages** — e.g.
**Collins Place South was dead for 167 hours** (~7 days) from 29 Oct — and 1,657
off-baseline readings. These are genuine sensor-health issues a council would act
on.

## Step 5 — Evaluation (13 Nov 2026)

**`src/evaluate.py`, `run_step5.py`:** build a clean synthetic hourly dataset
(exact ground truth, isolated from the messy real data), inject 12 known issues
(3 each of outage / flat-line / impossible / duplicate), run the detectors, and
match by interval overlap or exact timestamp.

**Result:** every type scores **precision 1.00, recall 1.00** — all 12 found,
zero false positives. (off_baseline is validated on real data as a tuning
choice, not scored here, since "unusual but real" has no crisp ground truth.)

**Next (Step 6):** Streamlit + map dashboard — fleet overview, a map of sensor
health, per-sensor drill-down, and a downloadable issues table.
