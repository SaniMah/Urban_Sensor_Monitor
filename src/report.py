"""Step 7 - AI weekly health report.

Collect the week's sensor-health numbers into a `facts` dict, then have a LOCAL
LLM (Ollama) write a plain-English report for council staff that uses ONLY those
numbers. If Ollama isn't running, fall back to a deterministic template filled
from the same facts. Always labelled a draft to review before use.

Local model setup (optional): https://ollama.com, then `ollama pull llama3.2`.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from datetime import timedelta

import pandas as pd
from sqlalchemy import text
from sqlalchemy.engine import Engine

OLLAMA_URL = "http://localhost:11434/api/generate"
DEFAULT_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2")
DRAFT_BANNER = "DRAFT - review before use"


# --------------------------------------------------------------------------- #
# 1. Gather the facts (numbers only)
# --------------------------------------------------------------------------- #
def gather_facts(engine: Engine, days: int = 7) -> dict:
    with engine.connect() as conn:
        last_ts = conn.execute(text("SELECT max(ts) FROM reading")).scalar_one()
        if last_ts is None:
            raise ValueError("no readings loaded")
        start = last_ts - timedelta(days=days)

        n_sensors = conn.execute(text("SELECT count(*) FROM sensor")).scalar_one()
        reporting = conn.execute(text(
            "SELECT count(DISTINCT location_id) FROM reading WHERE ts >= :s"),
            {"s": start}).scalar_one()
        flagged = conn.execute(text(
            "SELECT count(DISTINCT location_id) FROM anomaly WHERE start_ts >= :s"),
            {"s": start}).scalar_one()

        by_type = dict(conn.execute(text(
            "SELECT anomaly_type, count(*) FROM anomaly WHERE start_ts >= :s "
            "GROUP BY anomaly_type"), {"s": start}).all())

        attention = conn.execute(text(
            """
            SELECT a.location_id, s.description, count(*) AS n,
              count(*) FILTER (WHERE a.anomaly_type='outage')       AS n_outage,
              count(*) FILTER (WHERE a.anomaly_type='flat_line')    AS n_flat,
              count(*) FILTER (WHERE a.anomaly_type='off_baseline') AS n_off
            FROM anomaly a JOIN sensor s USING (location_id)
            WHERE a.start_ts >= :s
            GROUP BY a.location_id, s.description
            ORDER BY n DESC LIMIT 5
            """), {"s": start}).all()

        worst = conn.execute(text(
            """
            SELECT a.location_id, s.description, a.value AS hours, a.start_ts
            FROM anomaly a JOIN sensor s USING (location_id)
            WHERE a.anomaly_type='outage' AND a.start_ts >= :s
            ORDER BY a.value DESC LIMIT 1
            """), {"s": start}).first()

    return {
        "period": {"start": str(start), "end": str(last_ts), "days": days},
        "fleet": {"sensors": int(n_sensors), "reporting": int(reporting),
                  "flagged": int(flagged)},
        "issues": {"total": int(sum(by_type.values())),
                   "by_type": {k: int(v) for k, v in by_type.items()}},
        "attention": [
            {"location_id": r.location_id, "description": r.description,
             "issues": int(r.n), "outages": int(r.n_outage),
             "flat_lines": int(r.n_flat), "off_baseline": int(r.n_off)}
            for r in attention
        ],
        "worst_outage": (
            {"location_id": worst.location_id, "description": worst.description,
             "hours": int(worst.hours), "start": str(worst.start_ts)}
            if worst else None
        ),
    }


# --------------------------------------------------------------------------- #
# 2. Prompt + local LLM
# --------------------------------------------------------------------------- #
def build_prompt(facts: dict) -> str:
    return (
        "You are writing a weekly sensor-health report for City of Melbourne "
        "staff who maintain the pedestrian-counting sensors. Use ONLY the numbers "
        "in the JSON below; invent nothing, and do not add numbers together.\n\n"
        "What the fields mean (do not confuse them):\n"
        "- fleet.sensors = total sensors in the network.\n"
        "- fleet.reporting = how many sent any data this period.\n"
        "- fleet.flagged = how many had at least one health issue "
        "(this is the count 'needing attention', NOT fleet.sensors).\n"
        "- issues.total / issues.by_type = number of issues, not sensors.\n"
        "- attention = the specific sensors to name in 'Sensors needing attention'; "
        "use these names and their per-sensor counts, nothing else.\n"
        "- worst_outage = the single longest outage; mention it in the Summary.\n\n"
        "Write in complete, flowing sentences for a human reader. NEVER print the "
        "JSON field names (like 'fleet.sensors' or 'issues.by_type') in your "
        "report - translate every number into plain English.\n\n"
        f"Begin with the line: {DRAFT_BANNER}\n"
        "Then these sections as headings: Summary, Sensors needing attention, "
        "Issue breakdown, Recommended next checks.\n\n"
        f"DATA (JSON):\n{json.dumps(facts, indent=2)}\n"
    )


def ollama_available(timeout: float = 2.0) -> bool:
    try:
        with urllib.request.urlopen("http://localhost:11434/api/tags", timeout=timeout):
            return True
    except Exception:
        return False


# 300s so the first call after boot survives the one-off cold model load
# (~60s) plus generation; once warm a report takes only a few seconds.
def generate_with_ollama(prompt: str, model: str = DEFAULT_MODEL, timeout: int = 300) -> str:
    body = json.dumps({"model": model, "prompt": prompt, "stream": False}).encode()
    req = urllib.request.Request(OLLAMA_URL, data=body,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode()).get("response", "").strip()


# --------------------------------------------------------------------------- #
# 3. Deterministic fallback
# --------------------------------------------------------------------------- #
def render_fallback(facts: dict) -> str:
    p, fl, iss = facts["period"], facts["fleet"], facts["issues"]
    lines = [
        f"# Weekly Sensor-Health Report - {DRAFT_BANNER}",
        "",
        f"**Period:** {p['start']} to {p['end']} ({p['days']} days)",
        "",
        "## Summary",
        f"Of {fl['sensors']} sensors, {fl['reporting']} reported data this period "
        f"and {fl['flagged']} had at least one health issue. "
        f"{iss['total']} issues were detected in total"
        + (f" ({', '.join(f'{k}: {v}' for k, v in iss['by_type'].items())})."
           if iss['by_type'] else "."),
    ]
    if facts["worst_outage"]:
        w = facts["worst_outage"]
        lines += ["", f"The longest outage was **{w['hours']} hours** at "
                      f"{w['description']} (sensor {w['location_id']}), from {w['start']}."]

    lines += ["", "## Sensors needing attention"]
    if facts["attention"]:
        for a in facts["attention"]:
            bits = []
            if a["outages"]:
                bits.append(f"{a['outages']} outage(s)")
            if a["flat_lines"]:
                bits.append(f"{a['flat_lines']} flat-line(s)")
            if a["off_baseline"]:
                bits.append(f"{a['off_baseline']} off-baseline")
            lines.append(f"- **{a['description']}** (sensor {a['location_id']}): "
                         f"{a['issues']} issues - {', '.join(bits)}.")
    else:
        lines.append("- None this period.")

    breakdown = [f"- {k}: {v}" for k, v in iss["by_type"].items()] or ["- None."]
    lines += [
        "",
        "## Issue breakdown",
        *breakdown,
        "",
        "## Recommended next checks",
        "- Prioritise sensors with outages - check power and data connectivity.",
        "- Inspect flat-lined sensors on site; a repeating value usually means a "
        "stuck or faulty unit.",
        "- Review off-baseline sensors against known events (works, weather, "
        "closures) before assuming a fault.",
        "",
        f"_Generated from computed values only. {DRAFT_BANNER}._",
    ]
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# 4. Public entry point
# --------------------------------------------------------------------------- #
def generate_report(engine: Engine, days: int = 7, model: str = DEFAULT_MODEL,
                    use_llm: bool = True) -> tuple[str, str]:
    """Return (report_markdown, source): 'ollama:<model>' or 'template-fallback'."""
    facts = gather_facts(engine, days=days)
    if use_llm and ollama_available():
        try:
            out = generate_with_ollama(build_prompt(facts), model=model)
            if out:
                return out, f"ollama:{model}"
        except (urllib.error.URLError, OSError, TimeoutError, json.JSONDecodeError):
            pass
    return render_fallback(facts), "template-fallback"
