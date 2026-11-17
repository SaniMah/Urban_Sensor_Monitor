"""Urban Sensor Monitor source package.

A sensor-fleet health monitoring platform, demonstrated on the City of
Melbourne Pedestrian Counting System (public hourly counts + sensor locations).

Planned modules (added in their build steps):
    db.py        database engine + schema helpers
    ingest.py    pull counts + sensor locations from the Socrata API
    profile.py   seasonal baseline (expected count) per sensor
    detect.py    health rules -> anomaly table (outage, flat-line,
                 impossible value, duplicate, below/above expected)
    evaluate.py  precision/recall vs injected / known issues
    report.py    AI weekly health report for council staff
"""
