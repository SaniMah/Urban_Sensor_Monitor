// Typed fetch client for the Factory Pulse API. One place for every call.
import type { FleetSummary, Sensor, SensorDetail, IssueRecord } from './types'

async function get<T>(path: string): Promise<T> {
  const r = await fetch(path)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} - ${path}`)
  return r.json() as Promise<T>
}

const win = (days?: number | null) => (days ? `?days=${days}` : '')

export const api = {
  fleet: (days?: number | null) => get<FleetSummary>(`/api/fleet${win(days)}`),
  sensors: (days?: number | null) =>
    get<{ sensors: Sensor[] }>(`/api/sensors${win(days)}`).then((r) => r.sensors),
  sensor: (id: number, days?: number | null) =>
    get<SensorDetail>(`/api/sensors/${id}${win(days)}`),
  anomalyTypes: () => get<{ types: string[] }>('/api/anomaly-types').then((r) => r.types),
  anomalies: (opts: { type?: string[]; location_id?: number; limit?: number } = {}) => {
    const p = new URLSearchParams()
    opts.type?.forEach((t) => p.append('type', t))
    if (opts.location_id) p.set('location_id', String(opts.location_id))
    if (opts.limit) p.set('limit', String(opts.limit))
    return get<{ anomalies: IssueRecord[] }>(`/api/anomalies?${p}`).then((r) => r.anomalies)
  },
  exportUrl: (format: 'csv' | 'xlsx', type?: string[]) => {
    const p = new URLSearchParams({ format })
    type?.forEach((t) => p.append('type', t))
    return `/api/anomalies/export?${p}`
  },
  report: (days: number) =>
    fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days }),
    }).then((r) => r.json() as Promise<{ report: string; source: string; is_llm: boolean }>),
}

// map a status to its colour
export const STATUS_COLOR: Record<string, string> = {
  ok: '#8ea96a',
  fault: '#e0473f',
  nodata: 'rgba(236,231,219,.28)',
}
