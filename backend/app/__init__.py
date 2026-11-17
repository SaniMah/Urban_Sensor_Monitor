"""Urban Sensor Monitor API - FastAPI layer over the existing analytical core.

The anomaly detection, seasonal baseline and report generation all live in the
project's `src/` package and are reused as-is; this package only exposes them
over HTTP for the React frontend. No business logic is duplicated here.
"""
