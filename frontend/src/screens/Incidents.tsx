import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import type { IssueRecord } from '../types'

export function Incidents() {
  const [types, setTypes] = useState<string[]>([])
  const [active, setActive] = useState<string[]>([])
  const [rows, setRows] = useState<IssueRecord[]>([])
  const [q, setQ] = useState('')
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

  const toggle = (t: string) =>
    setActive((a) => (a.includes(t) ? a.filter((x) => x !== t) : [...a, t]))

  return (
    <div className="flex h-full flex-col px-8 pb-6 pt-7">
      <div className="label" style={{ color: 'var(--coral)' }}>SCREEN 03</div>
      <h2 className="font-display text-3xl font-semibold leading-tight">Incident Explorer</h2>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {types.map((t) => {
          const on = active.includes(t)
          return (
            <button key={t} onClick={() => toggle(t)}
              className="font-mono border px-3 py-1 text-[10px] tracking-wider"
              style={{
                borderColor: on ? 'var(--coral)' : 'var(--line-2)',
                color: on ? '#0b0c0f' : 'var(--muted)',
                background: on ? 'var(--coral)' : 'transparent',
              }}>{t.replace('_', ' ').toUpperCase()}</button>
          )
        })}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SEARCH SENSOR / ID"
          className="font-mono ml-auto border bg-transparent px-3 py-1 text-[10px] tracking-wider outline-none"
          style={{ borderColor: 'var(--line-2)', color: 'var(--ink)', width: 220 }} />
        <a href={api.exportUrl('csv', active.length ? active : undefined)}
          className="font-mono border px-3 py-1 text-[10px] tracking-wider" style={{ borderColor: 'var(--line-2)', color: 'var(--ink)' }}>⬇ CSV</a>
        <a href={api.exportUrl('xlsx', active.length ? active : undefined)}
          className="font-mono border px-3 py-1 text-[10px] tracking-wider" style={{ borderColor: 'var(--line-2)', color: 'var(--ink)' }}>⬇ XLSX</a>
      </div>

      <div className="label mt-4">{loading ? 'LOADING…' : `${filtered.length.toLocaleString()} RECORDS`}</div>

      <div className="mt-2 min-h-0 flex-1 overflow-auto border" style={{ borderColor: 'var(--line)' }}>
        <table className="w-full border-collapse font-mono text-[11px]">
          <thead className="sticky top-0" style={{ background: 'var(--surface)' }}>
            <tr style={{ color: 'var(--muted)' }}>
              {['TYPE', 'NODE', 'SENSOR', 'START', 'VALUE', 'DETAIL'].map((h) => (
                <th key={h} className="border-b px-3 py-2 text-left font-normal tracking-wider"
                  style={{ borderColor: 'var(--line)', fontSize: '.6rem' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 1000).map((r) => (
              <tr key={r.id} style={{ color: 'var(--ink)' }}>
                <td className="border-b px-3 py-1.5" style={{ borderColor: 'var(--line)', color: r.type === 'outage' ? 'var(--fault)' : 'var(--warn)' }}>
                  {r.type.replace('_', ' ')}
                </td>
                <td className="border-b px-3 py-1.5" style={{ borderColor: 'var(--line)' }}>{r.location_id}</td>
                <td className="border-b px-3 py-1.5" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>{r.desc?.slice(0, 34)}</td>
                <td className="border-b px-3 py-1.5" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>{r.start_ts?.slice(0, 16)}</td>
                <td className="border-b px-3 py-1.5" style={{ borderColor: 'var(--line)' }}>{r.value ?? '—'}</td>
                <td className="border-b px-3 py-1.5" style={{ borderColor: 'var(--line)', color: 'var(--faint)' }}>{r.detail?.slice(0, 48)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
