"""Factory Pulse — Streamlit dashboard.

Views: Fleet overview with a live map of sensor health, per-sensor drill-down,
and a downloadable issues table. Reads everything from PostgreSQL.

Run:
    streamlit run app/dashboard.py
"""
from __future__ import annotations

import sys
from io import BytesIO
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
import pydeck as pdk
import streamlit as st
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from src.db import get_engine  # noqa: E402
from src.report import generate_report  # noqa: E402

st.set_page_config(page_title="Factory Pulse", page_icon="📡", layout="wide")


# --------------------------------------------------------------------------- #
# Data access (cached)
# --------------------------------------------------------------------------- #
@st.cache_resource
def engine():
    return get_engine()


@st.cache_data(ttl=300)
def sensor_health() -> pd.DataFrame:
    health = pd.read_sql(text(
        """
        SELECT s.location_id, s.description, s.latitude, s.longitude,
               count(a.anomaly_id) AS n_anomalies
        FROM sensor s
        LEFT JOIN anomaly a ON a.location_id = s.location_id
        GROUP BY s.location_id, s.description, s.latitude, s.longitude
        """), engine())
    reads = pd.read_sql(text(
        "SELECT location_id, count(*) AS n_readings FROM reading GROUP BY location_id"),
        engine())
    df = health.merge(reads, on="location_id", how="left")
    df["n_readings"] = df["n_readings"].fillna(0).astype(int)
    return df


@st.cache_data(ttl=300)
def anomaly_by_type() -> pd.DataFrame:
    return pd.read_sql(text(
        "SELECT anomaly_type, count(*) AS n FROM anomaly GROUP BY anomaly_type "
        "ORDER BY n DESC"), engine())


@st.cache_data(ttl=300)
def all_anomalies() -> pd.DataFrame:
    return pd.read_sql(text(
        """
        SELECT a.anomaly_type, a.location_id, s.description,
               a.start_ts, a.end_ts, a.value, a.detail
        FROM anomaly a JOIN sensor s USING (location_id)
        ORDER BY a.start_ts
        """), engine(), parse_dates=["start_ts", "end_ts"])


@st.cache_data(ttl=300)
def sensor_readings(location_id: int) -> pd.DataFrame:
    return pd.read_sql(text(
        "SELECT ts, pedestrian_count FROM reading WHERE location_id = :l ORDER BY ts"),
        engine(), params={"l": location_id}, parse_dates=["ts"])


def to_excel_bytes(df: pd.DataFrame) -> bytes:
    buf = BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="issues")
    return buf.getvalue()


def health_color(n_anomalies: int, n_readings: int):
    if n_readings == 0:
        return [150, 150, 150, 140]        # grey = no data in window
    if n_anomalies == 0:
        return [38, 166, 91, 160]          # green = healthy
    return [208, 0, 0, 200]                # red = flagged


# --------------------------------------------------------------------------- #
# Header
# --------------------------------------------------------------------------- #
st.title("📡 Factory Pulse")
st.caption("Sensor-fleet health monitoring — City of Melbourne Pedestrian "
           "Counting System.")

health = sensor_health()
if health.empty:
    st.warning("No data loaded. Run `python run_step2.py` and `run_step4.py` first.")
    st.stop()

tab_overview, tab_drill, tab_table, tab_report = st.tabs(
    ["Fleet overview", "Sensor drill-down", "Issues table", "Weekly report"]
)

# --------------------------------------------------------------------------- #
# Fleet overview + map
# --------------------------------------------------------------------------- #
with tab_overview:
    by_type = anomaly_by_type()
    reporting = (health["n_readings"] > 0).sum()
    flagged = (health["n_anomalies"] > 0).sum()

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Sensors", len(health))
    c2.metric("Reporting", int(reporting))
    c3.metric("Flagged", int(flagged))
    c4.metric("Total issues", int(health["n_anomalies"].sum()))

    st.subheader("Sensor health map")
    st.caption("🟢 healthy · 🔴 has issues · ⚪ no data in window")
    m = health.dropna(subset=["latitude", "longitude"]).copy()
    m["color"] = m.apply(lambda r: health_color(r["n_anomalies"], r["n_readings"]),
                         axis=1)
    m["radius"] = 40 + (m["n_anomalies"].clip(upper=500) / 5)
    layer = pdk.Layer(
        "ScatterplotLayer", data=m,
        get_position="[longitude, latitude]", get_fill_color="color",
        get_radius="radius", pickable=True, opacity=0.8,
    )
    view = pdk.ViewState(latitude=-37.8136, longitude=144.9631, zoom=12.5)
    st.pydeck_chart(pdk.Deck(
        layers=[layer], initial_view_state=view,
        tooltip={"text": "{description}\nIssues: {n_anomalies}"},
        map_style="light",
    ))

    if not by_type.empty:
        st.subheader("Issues by type")
        st.bar_chart(by_type.set_index("anomaly_type")["n"])

# --------------------------------------------------------------------------- #
# Sensor drill-down
# --------------------------------------------------------------------------- #
with tab_drill:
    reporting_sensors = health[health["n_readings"] > 0].sort_values(
        "n_anomalies", ascending=False)
    labels = {int(r.location_id): f"{r.location_id} — {r.description} "
              f"({int(r.n_anomalies)} issues)" for r in reporting_sensors.itertuples()}
    loc = st.selectbox("Sensor", list(labels), format_func=labels.get)

    r = sensor_readings(loc)
    anoms = all_anomalies()
    a = anoms[anoms["location_id"] == loc]

    m1, m2, m3 = st.columns(3)
    m1.metric("Readings", f"{len(r):,}")
    m2.metric("Issues", len(a))
    outages = a[a["anomaly_type"] == "outage"]
    m3.metric("Worst outage (h)", int(outages["value"].max()) if not outages.empty else 0)

    fig, ax = plt.subplots(figsize=(11, 4))
    ax.plot(r["ts"], r["pedestrian_count"], lw=0.6, color="#2a6f97")
    for row in outages.itertuples():
        ax.axvspan(row.start_ts, row.end_ts, color="#d00000", alpha=0.25)
    for row in a[a["anomaly_type"] == "flat_line"].itertuples():
        ax.axvspan(row.start_ts, row.end_ts, color="#f48c06", alpha=0.4)
    ax.set_xlabel("time")
    ax.set_ylabel("pedestrians / hour")
    ax.set_title(f"Sensor {loc} — hourly counts (red = outage, orange = flat-line)")
    fig.tight_layout()
    st.pyplot(fig)

# --------------------------------------------------------------------------- #
# Issues table + downloads
# --------------------------------------------------------------------------- #
with tab_table:
    st.subheader("Detected issues")
    anoms = all_anomalies()
    show = anoms.copy()
    show = show[["anomaly_type", "location_id", "description", "start_ts",
                 "value", "detail"]]
    types = st.multiselect("Filter by type", sorted(show["anomaly_type"].unique()),
                           default=list(sorted(show["anomaly_type"].unique())))
    show = show[show["anomaly_type"].isin(types)]
    st.dataframe(show, use_container_width=True, hide_index=True)

    c1, c2 = st.columns(2)
    c1.download_button("⬇ Download CSV", show.to_csv(index=False).encode(),
                       file_name="factory_pulse_issues.csv", mime="text/csv")
    c2.download_button("⬇ Download Excel", to_excel_bytes(show),
                       file_name="factory_pulse_issues.xlsx",
                       mime="application/vnd.openxmlformats-officedocument."
                            "spreadsheetml.sheet")

# --------------------------------------------------------------------------- #
# Weekly AI report
# --------------------------------------------------------------------------- #
with tab_report:
    st.subheader("Weekly health report for council staff")
    st.caption("Uses a local LLM (Ollama) if running, otherwise a built-in "
               "template. Either way it uses only the computed numbers and is a "
               "draft to review before use.")
    days = st.slider("Report window (days)", 3, 28, 7)
    if st.button("Generate weekly report", type="primary"):
        with st.spinner("Writing report..."):
            report_md, source = generate_report(engine(), days=days)
        if source == "template-fallback":
            st.info("Ollama not detected — used the built-in template. Install "
                    "Ollama and run `ollama pull llama3.2` for LLM-written prose.")
        else:
            st.success(f"Written by local model ({source}).")
        st.markdown(report_md)
        st.download_button("⬇ Download report (Markdown)", report_md.encode(),
                           file_name=f"weekly_report_{days}d.md", mime="text/markdown")
