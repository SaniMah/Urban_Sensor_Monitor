import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { AnimatePresence } from 'framer-motion'
import type { Sensor, SensorDetail } from '../types'
import { AnnotationPanel } from './AnnotationPanel'

const MELB: [number, number] = [-37.8136, 144.9631]
const STATUS: Record<string, string> = { ok: '#8ea96a', fault: '#e0473f', nodata: '#5a5b60' }

interface Props {
  sensors: Sensor[]
  selectedId: number | null
  detail: SensorDetail | null
  onSelect: (id: number | null) => void
  onInspect: (id: number) => void
}

const radius = (s: Sensor) =>
  s.status === 'fault' ? 4 + Math.min(Math.sqrt(s.issues) * 0.7, 11) : 3

export function SensorMap({ sensors, selectedId, detail, onSelect, onInspect }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const ring = useRef<L.CircleMarker | null>(null)
  const [pt, setPt] = useState<{ x: number; y: number } | null>(null)

  // latest values for stable event handlers
  const sensorsRef = useRef(sensors); sensorsRef.current = sensors
  const selRef = useRef(selectedId); selRef.current = selectedId
  const onSelectRef = useRef(onSelect); onSelectRef.current = onSelect

  // init once
  useEffect(() => {
    if (!box.current || map.current) return
    const m = L.map(box.current, {
      zoomControl: false, attributionControl: false, preferCanvas: true,
    }).setView(MELB, 13)
    // Esri Dark Gray Canvas — free, no API key, genuinely dark.
    const esri = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas'
    L.tileLayer(`${esri}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
      maxZoom: 16, attribution: '© Esri',
    }).addTo(m)
    L.tileLayer(`${esri}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, {
      maxZoom: 16, attribution: '',
    }).addTo(m)
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    layer.current = L.layerGroup().addTo(m)
    m.on('click', () => onSelectRef.current(null))

    const track = () => {
      const id = selRef.current
      const s = id == null ? null : sensorsRef.current.find((x) => x.id === id)
      if (!s) return setPt(null)
      const p = m.latLngToContainerPoint([s.lat, s.lon])
      setPt({ x: p.x, y: p.y })
    }
    m.on('move', track); m.on('zoom', track); m.on('resize', track)
    map.current = m
    return () => { m.remove(); map.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // (re)draw markers when sensors change
  useEffect(() => {
    const lg = layer.current
    if (!lg) return
    lg.clearLayers()
    for (const s of sensors) {
      L.circleMarker([s.lat, s.lon], {
        radius: radius(s),
        color: '#0b0c0f', weight: 1,
        fillColor: STATUS[s.status], fillOpacity: s.status === 'nodata' ? 0.5 : 0.9,
      }).on('click', (e) => { L.DomEvent.stopPropagation(e); onSelectRef.current(s.id) })
        .addTo(lg)
    }
  }, [sensors])

  // highlight + leader anchor on selection change
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (ring.current) { ring.current.remove(); ring.current = null }
    const s = selectedId == null ? null : sensors.find((x) => x.id === selectedId)
    if (!s) { setPt(null); return }
    ring.current = L.circleMarker([s.lat, s.lon], {
      radius: radius(s) + 6, color: '#f0611f', weight: 1.5, fill: false,
    }).addTo(m)
    const p = m.latLngToContainerPoint([s.lat, s.lon])
    setPt({ x: p.x, y: p.y })
  }, [selectedId, sensors])

  // panel anchor: right margin, vertically tracking the point (clamped)
  const W = box.current?.clientWidth ?? 0
  const H = box.current?.clientHeight ?? 0
  const panelW = 300
  const panelX = W - panelW - 26
  const panelY = pt ? Math.max(20, Math.min(pt.y - 40, H - 230)) : 0
  const midX = pt ? (pt.x + panelX) / 2 : 0

  return (
    <div ref={box} className="relative h-full w-full">
      {pt && detail && panelX > pt.x && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 450 }}>
          <circle cx={pt.x} cy={pt.y} r={5} fill="none" stroke="#f0611f" strokeWidth={1} />
          <path d={`M ${pt.x} ${pt.y} L ${midX} ${pt.y} L ${midX} ${panelY + 24} L ${panelX} ${panelY + 24}`}
            fill="none" stroke="#f0611f" strokeWidth={1} strokeOpacity={0.7} />
        </svg>
      )}
      <AnimatePresence>
        {detail && pt && (
          <AnnotationPanel key={detail.sensor.id} detail={detail}
            style={{ left: panelX, top: panelY, width: panelW, zIndex: 500 }}
            onClose={() => onSelect(null)} onInspect={() => onInspect(detail.sensor.id)} />
        )}
      </AnimatePresence>
    </div>
  )
}
