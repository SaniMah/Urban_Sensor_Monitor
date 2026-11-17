import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from '../api'
import type { FleetSummary, Sensor, SensorDetail } from '../types'
import { SensorMap, type Pinned } from '../components/SensorMap'

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

  useEffect(() => {
    let live = true; setErr(null)
    Promise.all([api.fleet(days), api.sensors(days)])
      .then(([f, s]) => { if (live) { setFleet(f); setSensors(s) } })
      .catch((e) => live && setErr(String(e.message)))
    return () => { live = false }
  }, [days])

  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    let live = true
    api.sensor(selectedId, Math.max(days ?? 30, 30)).then((d) => live && setDetail(d)).catch(() => live && setDetail(null))
    return () => { live = false }
  }, [selectedId, days])

  const f = fleet?.fleet
  const counts = {
    ok: sensors.filter((s) => s.status === 'ok').length,
    fault: sensors.filter((s) => s.status === 'fault').length,
    nodata: sensors.filter((s) => s.status === 'nodata').length,
  }

  // the three most critical sensors, resolved to coordinates for annotation
  const pinned: Pinned[] = (fleet?.attention ?? []).slice(0, 3)
    .map((a) => { const s = sensors.find((x) => x.id === a.id); return s ? { id: a.id, desc: a.desc, issues: a.issues, lat: s.lat, lon: s.lon } : null })
    .filter((x): x is Pinned => x !== null)

  return (
    <div className="theme-light plate-grid relative h-full w-full overflow-hidden">
      <div className="absolute inset-0 isolate">
        <SensorMap sensors={sensors} selectedId={selectedId} detail={detail} pinned={pinned}
          light onSelect={setSelectedId} onInspect={onInspect} />
      </div>

      {/* paper fade over the left margin so the masthead reads cleanly */}
      <div className="pointer-events-none absolute inset-0 z-[5]"
        style={{ background: 'linear-gradient(90deg, var(--bg) 2%, rgba(243,239,230,.72) 20%, transparent 40%)' }} />
      {/* registration crosshairs at the plate corners */}
      <div className="reg" style={{ top: 18, left: 18 }} /><div className="reg" style={{ top: 18, right: 18 }} />
      <div className="reg" style={{ bottom: 18, left: 18 }} /><div className="reg" style={{ bottom: 18, right: 18 }} />

      {/* masthead */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="pointer-events-none absolute left-9 top-9 z-10 max-w-[300px]">
        <div className="font-mono text-[10px] tracking-[0.26em]" style={{ color: 'var(--coral)' }}>URBAN SENSOR MONITOR / OBSERVATORY</div>
        <h1 className="font-serif mt-2 text-[3.1rem] font-normal italic leading-[0.92]" style={{ color: 'var(--ink)', letterSpacing: '-.01em' }}>
          Urban<br />Observatory
        </h1>
        <p className="font-mono mt-3 text-[9.5px] leading-relaxed" style={{ color: 'var(--muted)', letterSpacing: '.14em' }}>
          FIG. 01 - SPATIAL HEALTH OF THE CITY<br />OF MELBOURNE PEDESTRIAN NETWORK
        </p>
        <div className="font-mono mt-4 text-[9px]" style={{ color: 'var(--faint)', letterSpacing: '.14em' }}>
          37.8136°S · 144.9631°E
        </div>
      </motion.div>

      {/* window toggle + legend (top-right) */}
      <div className="absolute right-9 top-9 z-10 text-right">
        <div className="pointer-events-auto inline-flex border" style={{ borderColor: 'var(--line-2)' }}>
          {WINDOWS.map((w) => (
            <button key={w.label} onClick={() => { setDays(w.days); setSelectedId(null) }}
              className="font-mono px-3 py-1.5 text-[10px] tracking-wider"
              style={{ color: days === w.days ? 'var(--surface)' : 'var(--muted)', background: days === w.days ? 'var(--coral)' : 'transparent' }}>
              {w.label}
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-4 font-mono text-[9.5px]" style={{ letterSpacing: '.1em' }}>
          <span style={{ color: 'var(--ok)' }}>● NOMINAL {counts.ok}</span>
          <span style={{ color: 'var(--fault)' }}>● FAULT {counts.fault}</span>
          <span style={{ color: 'var(--muted)' }}>● NO SIGNAL {counts.nodata}</span>
        </div>
        <div className="mt-1 font-mono text-[9px]" style={{ color: 'var(--faint)', letterSpacing: '.1em' }}>
          WINDOW · {days ? `LAST ${days} DAYS` : 'FULL HISTORY'}
        </div>
      </div>

      {/* figure caption (bottom-left): fleet status */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
        className="absolute bottom-9 left-9 z-10 border-t pt-3" style={{ borderColor: 'var(--line-2)', width: 300 }}>
        <div className="font-mono text-[9px] tracking-[0.2em]" style={{ color: 'var(--muted)' }}>FIG. 01 · FLEET STATUS</div>
        <div className="mt-2 flex gap-6">
          {[['SENSORS', f?.sensors], ['REPORTING', f?.reporting], ['FLAGGED', f?.flagged]].map(([k, v], i) => (
            <motion.div key={k as string} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 + i * 0.07 }}>
              <div className="font-display text-[1.5rem] font-semibold leading-none" style={{ color: 'var(--ink)' }}>{v ?? '-'}</div>
              <div className="font-mono mt-1 text-[8px] tracking-[0.16em]" style={{ color: 'var(--muted)' }}>{k}</div>
            </motion.div>
          ))}
        </div>
        {fleet?.worst_outage && (
          <div className="font-mono mt-3 text-[9px] leading-relaxed" style={{ color: 'var(--muted)', letterSpacing: '.06em' }}>
            {fleet.fleet.issues_total.toLocaleString()} ANOMALIES · LONGEST OUTAGE{' '}
            <span style={{ color: 'var(--fault)' }}>{fleet.worst_outage.hours}H</span> @ NODE {fleet.worst_outage.id}
          </div>
        )}
      </motion.div>

      <div className="pointer-events-none absolute bottom-9 right-9 z-10 font-mono text-[9px]" style={{ color: 'var(--faint)', letterSpacing: '.12em' }}>
        {selectedId ? 'CLICK EMPTY SPACE TO RESET' : 'SELECT A NODE TO INSPECT →'}
      </div>

      {err && <div className="absolute left-1/2 top-1/2 z-20 font-mono text-xs" style={{ color: 'var(--fault)' }}>API ERROR - {err}</div>}
    </div>
  )
}
