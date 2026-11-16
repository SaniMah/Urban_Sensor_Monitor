-- ============================================================================
-- Factory Pulse - database schema (PostgreSQL)
-- ============================================================================
-- Design notes:
--   * sensor uses its NATURAL key (location_id, stable in the source data) as
--     the primary key; the children use surrogate BIGSERIAL keys.
--   * reading, baseline and anomaly are children of sensor via FOREIGN KEYs
--     with ON DELETE CASCADE, so removing a sensor cleans up its data. This is
--     3NF: sensor facts (name, lat/long) live once in sensor, not on every row.
--   * CHECK constraints guard quality (hour 0-23, day 0-6, known anomaly types).
--   * An index on (location_id, ts) matches the common "this sensor over time"
--     query against hundreds of thousands of readings.
-- Re-runnable: children are dropped before parents.
-- ============================================================================

DROP TABLE IF EXISTS anomaly  CASCADE;
DROP TABLE IF EXISTS baseline CASCADE;
DROP TABLE IF EXISTS reading  CASCADE;
DROP TABLE IF EXISTS sensor   CASCADE;

-- One row per pedestrian sensor (the parent).
CREATE TABLE sensor (
    location_id       INTEGER PRIMARY KEY,     -- natural key from the data
    sensor_name       TEXT,
    description       TEXT,
    status            VARCHAR(2),              -- 'A' = active
    latitude          DOUBLE PRECISION,
    longitude         DOUBLE PRECISION,
    direction_1       TEXT,
    direction_2       TEXT,
    installation_date DATE
);

-- One row per hourly reading (the fact table).
CREATE TABLE reading (
    reading_id       BIGSERIAL PRIMARY KEY,
    location_id      INTEGER   NOT NULL REFERENCES sensor(location_id) ON DELETE CASCADE,
    ts               TIMESTAMP NOT NULL,       -- the hour this count is for
    hourday          SMALLINT  NOT NULL,
    pedestrian_count INTEGER,
    direction_1      INTEGER,
    direction_2      INTEGER,
    CONSTRAINT chk_hourday CHECK (hourday BETWEEN 0 AND 23)
);
CREATE INDEX idx_reading_loc_ts ON reading (location_id, ts);

-- Learned "normal": expected count by sensor, day-of-week and hour-of-day.
CREATE TABLE baseline (
    baseline_id    SERIAL PRIMARY KEY,
    location_id    INTEGER  NOT NULL REFERENCES sensor(location_id) ON DELETE CASCADE,
    dow            SMALLINT NOT NULL,          -- 0=Mon .. 6=Sun
    hourday        SMALLINT NOT NULL,
    expected_count DOUBLE PRECISION,           -- median count for this slot
    spread         DOUBLE PRECISION,           -- IQR (how variable the slot is)
    n_samples      INTEGER,
    CONSTRAINT uq_baseline UNIQUE (location_id, dow, hourday),
    CONSTRAINT chk_bl_dow  CHECK (dow BETWEEN 0 AND 6),
    CONSTRAINT chk_bl_hour CHECK (hourday BETWEEN 0 AND 23)
);

-- One row per detected health issue.
CREATE TABLE anomaly (
    anomaly_id   BIGSERIAL PRIMARY KEY,
    location_id  INTEGER   NOT NULL REFERENCES sensor(location_id) ON DELETE CASCADE,
    anomaly_type VARCHAR(20) NOT NULL,
    start_ts     TIMESTAMP,
    end_ts       TIMESTAMP,
    value        DOUBLE PRECISION,
    detail       TEXT,
    detected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_anomaly_type CHECK (anomaly_type IN
        ('outage', 'flat_line', 'impossible_value', 'duplicate', 'off_baseline'))
);
CREATE INDEX idx_anomaly_loc_type ON anomaly (location_id, anomaly_type);
