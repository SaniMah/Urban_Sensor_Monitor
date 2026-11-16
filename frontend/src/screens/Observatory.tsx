import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from '../api'
import type { FleetSummary, Sensor, SensorDetail } from '../types'
import { SensorMap } from '../components/SensorMap'

const WINDOWS: { label: string; days: number | null }[] = [
  { label: 'ALL', days: null }, { label: '30D', days: 30 }, { label: '7D', days: 7 },
]

export function Observatory({ onInspect }: { onInspect: (id: number) => void }) {
  const [days, setDays] = useState<number | null>(30)
  const [fleet, setFleet] = useState<FleetSummary | null>(null)
  const [sensors, setSensors] = useState<Sensor[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<SensorDetail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    setLoading(true); setErr(null)
    Promise.all([api.fleet(days), api.sensors(days)])
      .then(([f, s]) => { if (live) { setFleet(f); setSensors(s) } })
      .catch((e) => live && setErr(String(e.message)))
      .finally(() => live && setLoading(false))
    return () => { live = false }
  }, [days])

  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    let live = true
    api.sensor(selectedId, Math.max(days ?? 30, 30))
      .then((d) => live && setDetail(d)).catch(() => live && setDetail(null))
    return () => { live = false }
  }, [selectedId, days])

  const f = fleet?.fleet
  const counts = {
    ok: sensors.filter((s) => s.status === 'ok').length,
    fault: sensors.filter((s) => s.status === 'fault').length,
    nodata: sensors.filter((s) => s.status === 'nodata').length,
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-0">
        <SensorMap sensors={sensors} selectedId={selectedId} detail={detail} onSelect={setSelectedId} onInspect={onInspect} />
      </div>

      {/* top-left: masthead + fleet readout */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="pointer-events-none absolute left-7 top-6 z-10 max-w-[280px]">
        <div className="label" style={{ color: 'var(--coral)' }}>FACTORYPULSE</div>
        <h1 className="font-display mt-1 text-[2rem] font-semibold leading-[0.95]">Urban<br />Observatory</h1>
        <p className="font-mono mt-2 text-[9.5px] leading-relaxed" style={{ color: 'var(--muted)', letterSpacing: '.08em' }}>
          SPATIAL HEALTH OF MELBOURNE&apos;S<br />PEDESTRIAN SENSOR NETWORK
        </p>

        <div className="mt-5 flex gap-5">
          {[['SENSORS', f?.sensors], ['REPORTING', f?.reporting], ['FLAGGED', f?.flagged]].map(([k, v]) => (
            <div key={k as string}>
              <div className="font-display text-[1.7rem] font-semibold leading-none">{v ?? '—'}</div>
              <div className="label mt-1" style={{ fontSize: '.52rem' }}>{k}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
          {f ? `${f.issues_total.toLocaleString()} ISSUES LOGGED` : ''}
        </div>
      </motion.div>

      {/* top-right: window toggle + legend */}
      <div className="absolute right-7 top-6 z-10 text-right">
        <div className="pointer-events-auto inline-flex border" style={{ borderColor: 'var(--line-2)' }}>
          {WINDOWS.map((w) => (
            <button key={w.label} onClick={() => { setDays(w.days); setSelectedId(null) }}
              className="font-mono px-3 py-1.5 text-[10px] tracking-wider"
              style={{
                color: days === w.days ? '#0b0c0f' : 'var(--muted)',
                background: days === w.days ? 'var(--coral)' : 'transparent',
              }}>{w.label}</button>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-4 font-mono text-[9.5px]" style={{ color: 'var(--muted)', letterSpacing: '.1em' }}>
          <span style={{ color: 'var(--ok)' }}>● NOMINAL {counts.ok}</span>
          <span style={{ color: 'var(--fault)' }}>● FAULT {counts.fault}</span>
          <span>● NO SIGNAL {counts.nodata}</span>
        </div>
        <div className="mt-1 font-mono text-[9px]" style={{ color: 'var(--faint)', letterSpacing: '.1em' }}>
          WINDOW · {days ? `LAST ${days} DAYS` : 'FULL HISTORY'}
        </div>
      </div>

      {/* bottom-left: worst outage */}
      {fleet?.worst_outage && (
        <div className="absolute bottom-7 left-7 z-10 border-l pl-4" style={{ borderColor: 'var(--line-2)' }}>
          <div className="label">LONGEST OUTAGE · WINDOW</div>
          <div className="font-display text-[1.6rem] font-semibold leading-none" style={{ color: 'var(--fault)' }}>
            {fleet.worst_outage.hours} H
          </div>
          <div className="font-mono mt-1 text-[10px]" style={{ color: 'var(--muted)' }}>
            NODE {fleet.worst_outage.id} · {fleet.worst_outage.desc.slice(0, 32)}
          </div>
        </div>
      )}

      {/* hint */}
      <div className="absolute bottom-7 right-7 z-10 font-mono text-[9px]" style={{ color: 'var(--faint)', letterSpacing: '.12em' }}>
        SELECT A NODE TO INSPECT →
      </div>

      {err && <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 font-mono text-xs" style={{ color: 'var(--fault)' }}>API ERROR — {err}</div>}
      {loading && !fleet && <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 font-mono text-xs" style={{ color: 'var(--muted)' }}>CONNECTING…</div>}
    </div>
  )
}
