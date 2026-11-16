import { motion } from 'framer-motion'
import type { CSSProperties } from 'react'
import ReactECharts from 'echarts-for-react'
import type { SensorDetail } from '../types'

interface Props {
  detail: SensorDetail
  style: CSSProperties
  onClose: () => void
  onInspect: () => void
}

export function AnnotationPanel({ detail, style, onClose, onInspect }: Props) {
  const { sensor, series, anomalies } = detail
  const counts = anomalies.reduce<Record<string, number>>((a, x) => {
    a[x.type] = (a[x.type] ?? 0) + 1
    return a
  }, {})
  const vals = series.map((p) => p[1])
  const peak = Math.max(0, ...vals.map((v) => v ?? 0))

  const spark = {
    grid: { left: 2, right: 2, top: 6, bottom: 2 },
    xAxis: { type: 'category', show: false, data: series.map((p) => p[0]) },
    yAxis: { type: 'value', show: false },
    tooltip: {
      trigger: 'axis', backgroundColor: '#171922', borderColor: 'rgba(236,231,219,.22)',
      textStyle: { color: '#ece7db', fontFamily: 'JetBrains Mono', fontSize: 10 },
      formatter: (p: { name: string; value: number }[]) =>
        `${p[0].name.slice(5, 16)}<br/>${p[0].value ?? '—'} ped/h`,
    },
    series: [{
      type: 'line', data: vals, showSymbol: false, lineStyle: { color: '#f0611f', width: 1 },
      areaStyle: { color: 'rgba(240,97,31,.12)' },
    }],
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="absolute z-10"
      style={{ ...style, background: 'var(--surface)', border: '1px solid var(--line-2)', boxShadow: '0 8px 30px rgba(0,0,0,.14)' }}
    >
      {/* corner ticks */}
      <span className="pointer-events-none absolute -left-px -top-px h-2.5 w-2.5 border-l border-t" style={{ borderColor: 'var(--coral)' }} />
      <span className="pointer-events-none absolute -bottom-px -right-px h-2.5 w-2.5 border-b border-r" style={{ borderColor: 'var(--coral)' }} />

      <div className="flex items-start justify-between px-4 pt-3">
        <div>
          <div className="label" style={{ color: 'var(--coral)' }}>NODE {sensor.id}</div>
          <div className="font-mono text-[11px] leading-snug" style={{ color: 'var(--ink)' }}>
            {sensor.desc}
          </div>
        </div>
        <button onClick={onClose} className="font-mono text-xs leading-none" style={{ color: 'var(--muted)' }}>✕</button>
      </div>

      <div className="font-mono mt-2 px-4 text-[9.5px]" style={{ color: 'var(--faint)', letterSpacing: '.08em' }}>
        {sensor.lat.toFixed(4)}°  {sensor.lon.toFixed(4)}°
      </div>

      <div className="mt-2 px-3">
        <ReactECharts option={spark} style={{ height: 58 }} opts={{ renderer: 'svg' }} />
      </div>

      <div className="label px-4 pb-1 pt-1">HOURLY COUNT · PEAK {peak.toLocaleString()}</div>

      <div className="mt-1 grid grid-cols-3 gap-px px-4" style={{ color: 'var(--ink)' }}>
        {['outage', 'flat_line', 'off_baseline'].map((t) => (
          <div key={t}>
            <div className="font-display text-lg leading-none" style={{ color: counts[t] ? 'var(--fault)' : 'var(--muted)' }}>
              {counts[t] ?? 0}
            </div>
            <div className="label mt-1" style={{ fontSize: '.52rem' }}>{t.replace('_', ' ')}</div>
          </div>
        ))}
      </div>

      <button onClick={onInspect}
        className="font-mono mt-3 w-full border-t py-2.5 text-[9.5px] tracking-widest"
        style={{ borderColor: 'var(--line-2)', color: 'var(--coral)' }}>
        FULL ANALYSIS →
      </button>
    </motion.div>
  )
}
