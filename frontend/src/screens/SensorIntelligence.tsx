import { useEffect, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { api } from '../api'
import type { Sensor, SensorDetail } from '../types'
import { Locator } from '../components/Locator'
import { ScreenHeader } from '../components/ScreenHeader'

const RANGES: { label: string; days: number | null }[] = [
  { label: '7D', days: 7 }, { label: '30D', days: 30 },
  { label: '90D', days: 90 }, { label: 'ALL', days: null },
]
const BAND: Record<string, string> = {
  outage: 'rgba(224,73,63,.20)', flat_line: 'rgba(232,161,44,.20)',
}

export function SensorIntelligence({ sensorId }: { sensorId: number | null }) {
  const [list, setList] = useState<Sensor[]>([])
  const [id, setId] = useState<number | null>(sensorId)
  const [days, setDays] = useState<number | null>(30)
  const [detail, setDetail] = useState<SensorDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.sensors().then((s) => {
      const sorted = [...s].sort((a, b) => b.issues - a.issues)
      setList(sorted)
      if (id == null && sorted.length) setId(sorted[0].id)
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { if (sensorId != null) setId(sensorId) }, [sensorId])

  useEffect(() => {
    if (id == null) return
    setLoading(true)
    api.sensor(id, days).then(setDetail).catch(() => setDetail(null)).finally(() => setLoading(false))
  }, [id, days])

  const stats = useMemo(() => {
    if (!detail) return null
    const a = detail.anomalies
    const vals = detail.series.map((p) => p[1] ?? 0)
    const by = (t: string) => a.filter((x) => x.type === t).length
    const worst = Math.max(0, ...a.filter((x) => x.type === 'outage').map((x) => x.value ?? 0))
    return {
      readings: detail.series.length, issues: a.length, outages: by('outage'),
      flat: by('flat_line'), off: by('off_baseline'), worst, peak: Math.max(0, ...vals),
    }
  }, [detail])

  const option = useMemo(() => {
    if (!detail) return {}
    const areas = detail.anomalies
      .filter((x) => x.type === 'outage' || x.type === 'flat_line')
      .map((x) => [{ xAxis: x.start_ts, itemStyle: { color: BAND[x.type] } }, { xAxis: x.end_ts }])
    return {
      grid: { left: 50, right: 18, top: 16, bottom: 58 },
      tooltip: {
        trigger: 'axis', backgroundColor: '#171922', borderColor: 'rgba(236,231,219,.22)',
        textStyle: { color: '#ece7db', fontFamily: 'JetBrains Mono', fontSize: 11 },
      },
      xAxis: {
        type: 'time', axisLine: { lineStyle: { color: 'rgba(236,231,219,.22)' } },
        axisLabel: { color: 'rgba(236,231,219,.5)', fontFamily: 'JetBrains Mono', fontSize: 10 },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: 'rgba(236,231,219,.5)', fontFamily: 'JetBrains Mono', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(236,231,219,.06)' } },
      },
      dataZoom: [
        { type: 'inside' },
        { type: 'slider', height: 16, bottom: 22, borderColor: 'rgba(236,231,219,.18)',
          fillerColor: 'rgba(240,97,31,.14)', handleStyle: { color: '#f0611f' },
          textStyle: { color: 'rgba(236,231,219,.4)', fontFamily: 'JetBrains Mono', fontSize: 9 } },
      ],
      series: [{
        type: 'line', showSymbol: false, data: detail.series.map((p) => [p[0], p[1]]),
        lineStyle: { color: '#f0611f', width: 1 }, areaStyle: { color: 'rgba(240,97,31,.08)' },
        markArea: { silent: true, data: areas },
        markPoint: {
          symbol: 'pin', symbolSize: 36, data: [{ type: 'max' }],
          itemStyle: { color: 'rgba(240,97,31,.85)' },
          label: { color: '#0b0c0f', fontFamily: 'JetBrains Mono', fontSize: 9, formatter: 'PEAK' },
        },
      }],
    }
  }, [detail])

  const current = list.find((s) => s.id === id)

  return (
    <div className="grid-bg flex h-full min-h-0 flex-col px-8 pb-6 pt-7">
      <ScreenHeader n="02" title="Sensor Intelligence"
        caption={current ? `NODE ${id} · ${current.desc.toUpperCase()}` : 'SINGLE-SENSOR INVESTIGATION'}
        right={
          <select value={id ?? ''} onChange={(e) => setId(Number(e.target.value))}
            className="font-mono max-w-[360px] border bg-transparent px-3 py-2 text-[11px] outline-none"
            style={{ borderColor: 'var(--line-2)', color: 'var(--ink)' }}>
            {list.map((s) => (
              <option key={s.id} value={s.id} style={{ background: '#131419' }}>{s.id} - {s.desc} ({s.issues})</option>
            ))}
          </select>
        } />

      <div className="mt-5 grid min-h-0 flex-1 grid-cols-[260px_1fr] gap-7">
        {/* left: ident + locator + stats */}
        <div className="flex min-h-0 flex-col gap-4">
          <div className="h-44 border" style={{ borderColor: 'var(--line)' }}>
            {detail && <Locator lat={detail.sensor.lat} lon={detail.sensor.lon} />}
          </div>
          {detail && (
            <div className="font-mono text-[10px]" style={{ color: 'var(--faint)', letterSpacing: '.08em' }}>
              {detail.sensor.lat.toFixed(4)}°S · {detail.sensor.lon.toFixed(4)}°E
            </div>
          )}
          <div className="grid grid-cols-2 gap-px">
            {stats && ([
              ['READINGS', stats.readings.toLocaleString(), 'var(--ink)'],
              ['PEAK PED/H', stats.peak.toLocaleString(), 'var(--ink)'],
              ['OUTAGES', stats.outages, 'var(--fault)'],
              ['WORST (H)', stats.worst, 'var(--fault)'],
              ['FLAT-LINE', stats.flat, 'var(--warn)'],
              ['OFF-BASELINE', stats.off, 'var(--warn)'],
            ] as const).map(([k, v, c]) => (
              <div key={k} className="border p-3" style={{ borderColor: 'var(--line)' }}>
                <div className="font-display text-xl font-semibold leading-none" style={{ color: c }}>{v}</div>
                <div className="font-mono mt-1 text-[8px] tracking-[0.16em]" style={{ color: 'var(--muted)' }}>{k}</div>
              </div>
            ))}
          </div>
        </div>

        {/* right: chart + incidents */}
        <div className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 font-mono text-[9px] tracking-[0.14em]" style={{ color: 'var(--muted)' }}>
              <span className="flex items-center gap-1.5"><i className="inline-block h-2 w-3" style={{ background: 'rgba(224,73,63,.5)' }} /> OUTAGE</span>
              <span className="flex items-center gap-1.5"><i className="inline-block h-2 w-3" style={{ background: 'rgba(232,161,44,.5)' }} /> FLAT-LINE</span>
              <span className="flex items-center gap-1.5"><i className="inline-block h-[2px] w-3" style={{ background: 'var(--coral)' }} /> HOURLY COUNT</span>
              <span style={{ color: 'var(--faint)' }}>· DRAG TO ZOOM</span>
            </div>
            <div className="inline-flex border" style={{ borderColor: 'var(--line-2)' }}>
              {RANGES.map((r) => (
                <button key={r.label} onClick={() => setDays(r.days)}
                  className="font-mono px-2.5 py-1 text-[10px] tracking-wider"
                  style={{ color: days === r.days ? '#0b0c0f' : 'var(--muted)', background: days === r.days ? 'var(--coral)' : 'transparent' }}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 border" style={{ borderColor: 'var(--line)', height: 310 }}>
            {detail
              ? <ReactECharts option={option} style={{ height: 310 }} opts={{ renderer: 'svg' }} notMerge />
              : <div className="flex h-full items-center justify-center font-mono text-xs" style={{ color: 'var(--muted)' }}>{loading ? 'LOADING...' : 'NO DATA'}</div>}
          </div>

          <div className="font-mono mt-4 text-[10px] tracking-[0.14em]" style={{ color: 'var(--muted)' }}>RELATED INCIDENTS · {detail?.anomalies.length ?? 0}</div>
          <div className="mt-2 min-h-0 flex-1 overflow-auto border" style={{ borderColor: 'var(--line)' }}>
            <table className="w-full border-collapse font-mono text-[10.5px]">
              <tbody>
                {detail?.anomalies.slice().reverse().slice(0, 300).map((a, i) => (
                  <tr key={i} style={{ color: 'var(--ink)' }}>
                    <td className="border-b px-3 py-1.5" style={{ borderColor: 'var(--line)', color: a.type === 'outage' ? 'var(--fault)' : 'var(--warn)', width: 110 }}>{a.type.replace('_', ' ')}</td>
                    <td className="border-b px-3 py-1.5" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>{a.start_ts?.slice(0, 16)}</td>
                    <td className="border-b px-3 py-1.5" style={{ borderColor: 'var(--line)' }}>{a.value ?? '-'}</td>
                    <td className="border-b px-3 py-1.5" style={{ borderColor: 'var(--line)', color: 'var(--faint)' }}>{a.detail?.slice(0, 54)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
