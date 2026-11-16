import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { Sensor, SensorDetail } from '../types'
import { AnnotationPanel } from './AnnotationPanel'

const MELB: [number, number] = [-37.8136, 144.9631]
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas'
const STATUS: Record<string, string> = { ok: '#6f8a46', fault: '#d94e18', nodata: '#b9b2a2' }
const STATUS_DARK: Record<string, string> = { ok: '#8ea96a', fault: '#e0473f', nodata: '#5a5b60' }

export interface Pinned { id: number; desc: string; issues: number; lat: number; lon: number }

interface Props {
  sensors: Sensor[]
  selectedId: number | null
  detail: SensorDetail | null
  pinned?: Pinned[]
  light?: boolean
  onSelect: (id: number | null) => void
  onInspect: (id: number) => void
}

const radius = (s: { status: string; issues: number }) =>
  s.status === 'fault' ? 4 + Math.min(Math.sqrt(s.issues) * 0.7, 11) : 3

export function SensorMap({ sensors, selectedId, detail, pinned = [], light = false, onSelect, onInspect }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const ring = useRef<L.CircleMarker | null>(null)
  const [pts, setPts] = useState<Record<number, { x: number; y: number }>>({})
  const reduce = useReducedMotion()

  const palette = light ? STATUS : STATUS_DARK
  const stroke = light ? 'rgba(243,239,230,.9)' : '#0b0c0f'

  const sensorsRef = useRef(sensors); sensorsRef.current = sensors
  const onSelectRef = useRef(onSelect); onSelectRef.current = onSelect
  const trackRef = useRef<number[]>([]) // ids whose screen points are tracked

  // init once
  useEffect(() => {
    if (!box.current || map.current) return
    const m = L.map(box.current, { zoomControl: false, attributionControl: false, preferCanvas: true }).setView(MELB, 13)
    const base = light ? 'World_Light_Gray_Base' : 'World_Dark_Gray_Base'
    L.tileLayer(`${ESRI}/${base}/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16, attribution: '© Esri' }).addTo(m)
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    layer.current = L.layerGroup().addTo(m)
    m.on('click', () => onSelectRef.current(null))

    const track = () => {
      const next: Record<number, { x: number; y: number }> = {}
      for (const id of trackRef.current) {
        const s = sensorsRef.current.find((x) => x.id === id)
        if (s) { const p = m.latLngToContainerPoint([s.lat, s.lon]); next[id] = { x: p.x, y: p.y } }
      }
      setPts(next)
    }
    m.on('move', track); m.on('zoom', track); m.on('resize', track)
    map.current = m
    return () => { m.remove(); map.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // (re)draw markers
  useEffect(() => {
    const lg = layer.current, m = map.current
    if (!lg) return
    lg.clearLayers()
    for (const s of sensors) {
      const base = radius(s)
      const cm = L.circleMarker([s.lat, s.lon], {
        radius: base, color: stroke, weight: 1,
        fillColor: palette[s.status], fillOpacity: s.status === 'nodata' ? 0.45 : 0.92,
      })
      cm.on('click', (e) => { L.DomEvent.stopPropagation(e); onSelectRef.current(s.id) })
      cm.on('mouseover', () => { cm.setStyle({ radius: base + 3, weight: 1.5, color: '#d94e18' }); if (m) m.getContainer().style.cursor = 'pointer' })
      cm.on('mouseout', () => { cm.setStyle({ radius: base, weight: 1, color: stroke }); if (m) m.getContainer().style.cursor = '' })
      cm.addTo(lg)
    }
  }, [sensors, palette, stroke])

  // which ids to track on the overlay
  const pinnedIds = pinned.map((p) => p.id).join(',')
  useEffect(() => {
    trackRef.current = selectedId ? [selectedId] : pinned.map((p) => p.id)
    const m = map.current
    if (!m) return
    const next: Record<number, { x: number; y: number }> = {}
    for (const id of trackRef.current) {
      const s = sensors.find((x) => x.id === id)
      if (s) { const p = m.latLngToContainerPoint([s.lat, s.lon]); next[id] = { x: p.x, y: p.y } }
    }
    setPts(next)
  }, [selectedId, pinnedIds, sensors]) // eslint-disable-line react-hooks/exhaustive-deps

  // selection highlight ring
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (ring.current) { ring.current.remove(); ring.current = null }
    const s = selectedId == null ? null : sensors.find((x) => x.id === selectedId)
    if (!s) return
    ring.current = L.circleMarker([s.lat, s.lon], { radius: radius(s) + 6, color: '#d94e18', weight: 1.5, fill: false }).addTo(m)
  }, [selectedId, sensors])

  const W = box.current?.clientWidth ?? 0
  const H = box.current?.clientHeight ?? 0

  // right-margin slots for the always-on critical annotations
  const cardW = 214
  const cardX = W - cardW - 26
  const slotYs = [H * 0.17, H * 0.45, H * 0.72]

  const selPt = selectedId ? pts[selectedId] : null
  const panelW = 300
  const panelX = W - panelW - 26
  const panelY = selPt ? Math.max(20, Math.min(selPt.y - 40, H - 232)) : 0
  const midX = selPt ? (selPt.x + panelX) / 2 : 0

  return (
    <div ref={box} className="relative h-full w-full">
      {/* always-on critical annotations (compose mode) */}
      {!selectedId && pinned.map((p, i) => {
        const pt = pts[p.id]; if (!pt) return null
        const cy = slotYs[i] + 22
        if (cardX <= pt.x + 10) return null
        return (
          <div key={p.id}>
            <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 400 }}>
              <circle cx={pt.x} cy={pt.y} r={4} fill="none" stroke="var(--coral)" strokeWidth={1} />
              <motion.path key={`cl-${p.id}`}
                d={`M ${pt.x} ${pt.y} L ${(pt.x + cardX) / 2} ${pt.y} L ${(pt.x + cardX) / 2} ${cy} L ${cardX} ${cy}`}
                fill="none" stroke="var(--coral)" strokeWidth={1} strokeOpacity={0.55}
                initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }}
                transition={{ duration: 0.6, delay: 0.15 * i, ease: 'easeInOut' }} />
            </svg>
            <motion.div className="absolute" style={{ left: cardX, top: slotYs[i], width: cardW, zIndex: 440 }}
              initial={reduce ? false : { opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.15 * i + 0.3 }}>
              <button onClick={() => onSelect(p.id)} className="block w-full border-l pl-3 text-left" style={{ borderColor: 'var(--coral)' }}>
                <div className="font-mono text-[9px] tracking-[0.2em]" style={{ color: 'var(--coral)' }}>NODE {p.id} · {String(i + 1).padStart(2, '0')}</div>
                <div className="font-mono mt-1 text-[10.5px] leading-snug" style={{ color: 'var(--ink)' }}>{p.desc.slice(0, 40)}</div>
                <div className="font-mono mt-1 text-[9px]" style={{ color: 'var(--muted)', letterSpacing: '.08em' }}>{p.issues} ANOMALIES LOGGED →</div>
              </button>
            </motion.div>
          </div>
        )
      })}

      {/* selected: rich panel (focus mode) */}
      {selPt && detail && panelX > selPt.x && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 450 }}>
          {!reduce && (
            <motion.circle key={`ping-${detail.sensor.id}`} cx={selPt.x} cy={selPt.y} fill="none" stroke="var(--coral)" strokeWidth={1}
              initial={{ r: 5, opacity: 0.7 }} animate={{ r: 20, opacity: 0 }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }} />
          )}
          <circle cx={selPt.x} cy={selPt.y} r={5} fill="none" stroke="var(--coral)" strokeWidth={1} />
          <motion.path key={`lead-${detail.sensor.id}`}
            d={`M ${selPt.x} ${selPt.y} L ${midX} ${selPt.y} L ${midX} ${panelY + 24} L ${panelX} ${panelY + 24}`}
            fill="none" stroke="var(--coral)" strokeWidth={1} strokeOpacity={0.7}
            initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, ease: 'easeInOut' }} />
        </svg>
      )}
      <AnimatePresence>
        {detail && selPt && (
          <AnnotationPanel key={detail.sensor.id} detail={detail}
            style={{ left: panelX, top: panelY, width: panelW, zIndex: 500 }}
            onClose={() => onSelect(null)} onInspect={() => onInspect(detail.sensor.id)} />
        )}
      </AnimatePresence>
    </div>
  )
}
