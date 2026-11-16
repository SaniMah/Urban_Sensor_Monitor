import { Fragment, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import type { IssueRecord } from '../types'
import { ScreenHeader } from '../components/ScreenHeader'

const SEVERITY: Record<string, { c: string; label: string }> = {
  outage: { c: 'var(--fault)', label: 'CRITICAL' },
  flat_line: { c: 'var(--warn)', label: 'MAJOR' },
  impossible_value: { c: 'var(--warn)', label: 'MAJOR' },
  off_baseline: { c: 'var(--muted)', label: 'MINOR' },
  duplicate: { c: 'var(--muted)', label: 'MINOR' },
}

export function Incidents({ onInspect }: { onInspect: (id: number) => void }) {
  const [types, setTypes] = useState<string[]>([])
  const [active, setActive] = useState<string[]>([])
  const [rows, setRows] = useState<IssueRecord[]>([])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { api.anomalyTypes().then(setTypes).catch(() => {}) }, [])
  useEffect(() => {
    setLoading(true)
    api.anomalies({ type: active.length ? active : undefined, limit: 5000 })
      .then(setRows).catch(() => setRows([])).finally(() => setLoading(false))
  }, [active])

  const filtered = useMemo(() => {
    if (!q) return rows
    const s = q.toLowerCase()
    return rows.filter((r) => r.desc?.toLowerCase().includes(s) || String(r.location_id).includes(s))
  }, [rows, q])

  const mix = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of filtered) m[r.type] = (m[r.type] ?? 0) + 1
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [filtered])

  const toggle = (t: string) => setActive((a) => (a.includes(t) ? a.filter((x) => x !== t) : [...a, t]))

  return (
    <div className="grid-bg flex h-full min-h-0 flex-col px-8 pb-6 pt-7">
      <ScreenHeader n="03" title="Incident Explorer" caption="OPERATIONAL INVESTIGATION WORKSPACE"
        right={
          <div className="flex gap-2">
            <a href={api.exportUrl('csv', active.length ? active : undefined)}
              className="font-mono border px-3 py-2 text-[10px] tracking-wider" style={{ borderColor: 'var(--line-2)', color: 'var(--ink)' }}>⬇ CSV</a>
            <a href={api.exportUrl('xlsx', active.length ? active : undefined)}
              className="font-mono border px-3 py-2 text-[10px] tracking-wider" style={{ borderColor: 'var(--line-2)', color: 'var(--ink)' }}>⬇ XLSX</a>
          </div>
        } />

      {/* type-mix summary strip */}
      <div className="mt-4 flex flex-wrap items-center gap-5">
        {mix.map(([t, n]) => (
          <div key={t} className="flex items-baseline gap-2">
            <span className="h-2 w-2" style={{ background: SEVERITY[t]?.c ?? 'var(--muted)', display: 'inline-block' }} />
            <span className="font-display text-lg font-semibold">{n.toLocaleString()}</span>
            <span className="font-mono text-[9px] tracking-[0.12em]" style={{ color: 'var(--muted)' }}>{t.replace('_', ' ').toUpperCase()}</span>
          </div>
        ))}
      </div>

      {/* filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {types.map((t) => {
          const on = active.includes(t)
          return (
            <button key={t} onClick={() => toggle(t)}
              className="font-mono border px-3 py-1 text-[10px] tracking-wider"
              style={{ borderColor: on ? 'var(--coral)' : 'var(--line-2)', color: on ? '#0b0c0f' : 'var(--muted)', background: on ? 'var(--coral)' : 'transparent' }}>
              {t.replace('_', ' ').toUpperCase()}
            </button>
          )
        })}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SEARCH SENSOR / ID"
          className="font-mono ml-auto border bg-transparent px-3 py-1 text-[10px] tracking-wider outline-none"
          style={{ borderColor: 'var(--line-2)', color: 'var(--ink)', width: 220 }} />
      </div>

      <div className="font-mono mt-4 text-[10px] tracking-[0.14em]" style={{ color: 'var(--muted)' }}>
        {loading ? 'LOADING…' : `${filtered.length.toLocaleString()} RECORDS · CLICK A ROW FOR DETAIL`}
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-auto border" style={{ borderColor: 'var(--line)' }}>
        <table className="w-full border-collapse font-mono text-[11px]">
          <thead className="sticky top-0 z-10" style={{ background: 'var(--surface)' }}>
            <tr style={{ color: 'var(--muted)' }}>
              {['SEVERITY', 'TYPE', 'NODE', 'SENSOR', 'START', 'VALUE', ''].map((h) => (
                <th key={h} className="border-b px-3 py-2 text-left font-normal tracking-wider" style={{ borderColor: 'var(--line)', fontSize: '.6rem' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 1200).map((r) => {
              const sev = SEVERITY[r.type] ?? { c: 'var(--muted)', label: '—' }
              const isOpen = open === r.id
              return (
                <Fragment key={r.id}>
                  <tr onClick={() => setOpen(isOpen ? null : r.id)} style={{ color: 'var(--ink)', cursor: 'pointer' }}>
                    <td className="border-b px-3 py-1.5" style={{ borderColor: 'var(--line)' }}>
                      <span className="inline-flex items-center gap-1.5" style={{ color: sev.c }}>
                        <span className="h-1.5 w-1.5" style={{ background: sev.c, display: 'inline-block' }} />{sev.label}
                      </span>
                    </td>
                    <td className="border-b px-3 py-1.5" style={{ borderColor: 'var(--line)' }}>{r.type.replace('_', ' ')}</td>
                    <td className="border-b px-3 py-1.5" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>{r.location_id}</td>
                    <td className="border-b px-3 py-1.5" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>{r.desc?.slice(0, 32)}</td>
                    <td className="border-b px-3 py-1.5" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>{r.start_ts?.slice(0, 16)}</td>
                    <td className="border-b px-3 py-1.5" style={{ borderColor: 'var(--line)' }}>{r.value ?? '—'}</td>
                    <td className="border-b px-3 py-1.5" style={{ borderColor: 'var(--line)', color: 'var(--coral)' }}>{isOpen ? '−' : '+'}</td>
                  </tr>
                  {isOpen && (
                    <tr style={{ background: 'var(--surface)' }}>
                      <td colSpan={7} className="border-b px-3 py-3" style={{ borderColor: 'var(--line)' }}>
                        <div className="flex items-start justify-between gap-6">
                          <div className="font-mono text-[10.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                            <span style={{ color: 'var(--ink)' }}>NODE {r.location_id}</span> · {r.desc}<br />
                            WINDOW {r.start_ts?.slice(0, 16)} → {r.end_ts?.slice(0, 16)}<br />
                            {r.detail && <span>DETAIL: {r.detail}</span>}
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); onInspect(r.location_id) }}
                            className="font-mono shrink-0 border px-3 py-1.5 text-[10px] tracking-widest"
                            style={{ borderColor: 'var(--coral)', color: 'var(--coral)' }}>INSPECT SENSOR →</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
