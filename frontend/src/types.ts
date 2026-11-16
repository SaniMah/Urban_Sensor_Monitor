// Shared API types. Mirror the FastAPI responses in backend/app.

export type Status = 'ok' | 'fault' | 'nodata'

export interface Sensor {
  id: number
  desc: string
  lat: number
  lon: number
  issues: number
  readings: number
  status: Status
}

export interface IssueMix { type: string; n: number }

export interface Attention {
  id: number
  desc: string
  issues: number
  outages: number
  flat: number
  off_base: number
}

export interface WorstOutage {
  id: number
  desc: string
  hours: number
  start: string
}

export interface FleetSummary {
  window_days: number | null
  fleet: { sensors: number; reporting: number; flagged: number; issues_total: number }
  by_type: IssueMix[]
  worst_outage: WorstOutage | null
  attention: Attention[]
}

export interface Anomaly {
  type: string
  start_ts: string
  end_ts: string
  value: number | null
  detail: string | null
}

export interface SensorDetail {
  sensor: { id: number; desc: string; lat: number; lon: number }
  series: [string, number | null][]
  anomalies: Anomaly[]
}

export interface IssueRecord {
  id: number
  type: string
  location_id: number
  desc: string
  start_ts: string
  end_ts: string
  value: number | null
  detail: string | null
}
