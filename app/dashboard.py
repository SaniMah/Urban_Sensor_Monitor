"""Urban Sensor Monitor - Streamlit dashboard.

Views: Fleet overview with a live map of sensor health, per-sensor drill-down,
and a downloadable issues table. Reads everything from PostgreSQL.

Run:
    streamlit run app/dashboard.py
"""
from __future__ import annotations

import sys
from io import BytesIO
from pathlib import Path

import altair as alt
import matplotlib.pyplot as plt
import pandas as pd
import pydeck as pdk
import streamlit as st
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from src.db import get_engine  # noqa: E402
from src.report import generate_report  # noqa: E402

st.set_page_config(page_title="Urban Sensor Monitor", page_icon="📡", layout="wide")

# --------------------------------------------------------------------------- #
# Theme - "sodium instrument": warm ink + bone, a single restrained amber
# signal, flat (no glow), fine hairlines, editorial section indexing. Kept in
# one place so the Python below stays about data, not styling.
# --------------------------------------------------------------------------- #
HUD_CSS = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');

:root{
  --bg:#0a0a0c; --surface:#121214; --surface-2:#161618;
  --line:#242428; --line-2:#34343a; --ink:#e8e3d6; --muted:#857f70;
  --amber:#e8930c; --amber-soft:#c9850f; --fault:#d8453f; --live:#b7c08a;
  --mono:'Space Mono',ui-monospace,monospace; --display:'Space Grotesk',sans-serif;
}

/* body: warm ink, very fine ruled grid */
.stApp{
  background-color:var(--bg);
  background-image:
    linear-gradient(rgba(255,255,255,.022) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.022) 1px, transparent 1px);
  background-size:30px 30px;
}
.stApp, .stApp p, .stApp li, .stApp span{font-family:var(--display);color:var(--ink);}
[data-testid="stHeader"]{background:transparent;}
.block-container{padding-top:1.4rem;max-width:1360px;}

/* ---- header: editorial masthead, one corner mark ---- */
.hud-header{
  position:relative;display:flex;justify-content:space-between;align-items:flex-end;
  flex-wrap:wrap;gap:14px;border-top:1px solid var(--line-2);
  border-bottom:1px solid var(--line-2);padding:18px 2px 14px;margin-bottom:22px;
}
.hud-brand{font-family:var(--display);font-weight:600;font-size:2.15rem;letter-spacing:-.015em;
  color:var(--ink);line-height:.95;}
.hud-brand .reg{font-size:.9rem;vertical-align:super;color:var(--amber);font-weight:400;
  letter-spacing:0;margin-left:4px;}
.hud-sub{font-family:var(--mono);font-size:.68rem;letter-spacing:.26em;color:var(--muted);
  text-transform:uppercase;margin-top:9px;}
.hud-right{text-align:right;font-family:var(--mono);font-size:.64rem;letter-spacing:.12em;
  color:var(--muted);text-transform:uppercase;line-height:1.7;}
.hud-right .code{color:var(--ink);}
.hud-live{color:var(--ink);display:flex;gap:7px;align-items:center;justify-content:flex-end;}
.hud-dot{width:6px;height:6px;border-radius:50%;background:var(--live);}

/* ---- section headings: "01 - TITLE" with a hairline rule ---- */
.stApp h2,.stApp h3{font-family:var(--display);font-weight:500;letter-spacing:.01em;
  text-transform:none;font-size:1.02rem;color:var(--ink);
  display:flex;align-items:center;gap:14px;margin-top:6px;}
.stApp h2::after,.stApp h3::after{content:"";flex:1;height:1px;background:var(--line);}
[data-testid="stCaptionContainer"],.stCaption{font-family:var(--mono);letter-spacing:.02em;
  color:var(--muted);font-size:.72rem;}

/* ---- metric cards: flat readout, hairline top rule, no ticks/no glow ---- */
[data-testid="stMetric"]{
  position:relative;background:var(--surface);border:1px solid var(--line);
  border-top:2px solid var(--line-2);padding:16px 18px 14px;
}
[data-testid="stMetricLabel"]{font-family:var(--mono);text-transform:uppercase;
  letter-spacing:.16em;color:var(--muted);font-size:.64rem;}
[data-testid="stMetricValue"]{font-family:var(--display);color:var(--ink);
  font-weight:600;letter-spacing:-.02em;font-size:2.3rem;}

/* ---- tabs: quiet, letter-spaced, amber active rule ---- */
[data-baseweb="tab-list"]{gap:4px;border-bottom:1px solid var(--line);}
[data-baseweb="tab"]{font-family:var(--mono);text-transform:uppercase;letter-spacing:.1em;
  font-size:.68rem;color:var(--muted);background:transparent;padding:9px 14px;}
[data-baseweb="tab"]:hover{color:var(--ink);}
[data-baseweb="tab"][aria-selected="true"]{color:var(--ink);
  border-bottom:2px solid var(--amber);background:transparent;}

/* ---- buttons: flat, hairline, amber only on primary ---- */
.stButton>button,[data-testid="stDownloadButton"] button{
  font-family:var(--mono);text-transform:uppercase;letter-spacing:.1em;font-size:.72rem;
  border:1px solid var(--line-2);background:transparent;color:var(--ink);border-radius:0;}
.stButton>button:hover,[data-testid="stDownloadButton"] button:hover{
  border-color:var(--ink);background:var(--surface-2);color:var(--ink);}
.stButton>button[kind="primary"]{background:var(--amber);color:#1a1205;
  border-color:var(--amber);font-weight:700;}
.stButton>button[kind="primary"]:hover{background:var(--amber-soft);color:#1a1205;}

/* widgets + dataframe trim */
[data-testid="stDataFrame"]{border:1px solid var(--line);}
label p{font-family:var(--mono);text-transform:uppercase;letter-spacing:.08em;
  font-size:.7rem;color:var(--muted);}
hr{border-color:var(--line);}
</style>
"""
st.markdown(HUD_CSS, unsafe_allow_html=True)


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
        return [78, 78, 86, 140]           # dim slate = no data in window
    if n_anomalies == 0:
        return [167, 176, 106, 180]        # sage = healthy
    return [216, 69, 63, 225]              # red = flagged


# --------------------------------------------------------------------------- #
# Header (custom HUD top bar)
# --------------------------------------------------------------------------- #
st.markdown(
    """
    <div class="hud-header">
      <div class="hud-left">
        <div class="hud-brand">Urban Sensor Monitor<span class="reg">®</span></div>
        <div class="hud-sub">Sensor-fleet health monitor &nbsp;·&nbsp; Melbourne pedestrian network</div>
      </div>
      <div class="hud-right">
        <div><span class="code">37.8136°S&nbsp;&nbsp;144.9631°E</span></div>
        <div><span class="code">FP·01</span> &nbsp;/&nbsp; Pedestrian Counting System</div>
        <div class="hud-live"><span class="hud-dot"></span>Live &nbsp;·&nbsp; Postgres</div>
      </div>
    </div>
    """,
    unsafe_allow_html=True,
)

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
        map_style="dark",
    ))

    if not by_type.empty:
        st.subheader("Issues by type")
        chart = (
            alt.Chart(by_type)
            .mark_bar(color="#e8930c", height=16)
            .encode(
                x=alt.X("n:Q", title="count"),
                y=alt.Y("anomaly_type:N", sort="-x", title=None),
                tooltip=["anomaly_type", "n"],
            )
            .properties(height=max(120, 40 * len(by_type)))
            .configure_view(stroke=None, fill="#121214")
            .configure_axis(
                labelColor="#857f70", titleColor="#857f70", labelFont="Space Mono",
                titleFont="Space Mono", labelFontSize=11, domainColor="#34343a",
                gridColor="#1b1b1e", tickColor="#34343a",
            )
        )
        st.altair_chart(chart, use_container_width=True, theme=None)

# --------------------------------------------------------------------------- #
# Sensor drill-down
# --------------------------------------------------------------------------- #
with tab_drill:
    reporting_sensors = health[health["n_readings"] > 0].sort_values(
        "n_anomalies", ascending=False)
    labels = {int(r.location_id): f"{r.location_id} - {r.description} "
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
    fig.patch.set_facecolor("#121214")
    ax.set_facecolor("#0e0e10")
    ax.plot(r["ts"], r["pedestrian_count"], lw=0.7, color="#d7d0bf")
    for row in outages.itertuples():
        ax.axvspan(row.start_ts, row.end_ts, color="#d8453f", alpha=0.30)
    for row in a[a["anomaly_type"] == "flat_line"].itertuples():
        ax.axvspan(row.start_ts, row.end_ts, color="#e8930c", alpha=0.45)
    ax.set_xlabel("time", color="#857f70", fontfamily="monospace", fontsize=9)
    ax.set_ylabel("pedestrians / hour", color="#857f70", fontfamily="monospace", fontsize=9)
    ax.set_title(f"sensor {loc}  -  hourly counts   (red = outage · amber = flat-line)",
                 color="#e8e3d6", fontfamily="monospace", fontsize=10, loc="left", pad=12)
    ax.tick_params(colors="#857f70", labelsize=8)
    for spine in ax.spines.values():
        spine.set_color("#34343a")
    ax.grid(True, color="#1b1b1e", lw=0.6)
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
                       file_name="urban_sensor_monitor_issues.csv", mime="text/csv")
    c2.download_button("⬇ Download Excel", to_excel_bytes(show),
                       file_name="urban_sensor_monitor_issues.xlsx",
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
            st.info("Ollama not detected - used the built-in template. Install "
                    "Ollama and run `ollama pull llama3.2` for LLM-written prose.")
        else:
            st.success(f"Written by local model ({source}).")
        st.markdown(report_md)
        st.download_button("⬇ Download report (Markdown)", report_md.encode(),
                           file_name=f"weekly_report_{days}d.md", mime="text/markdown")
