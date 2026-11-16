import { useEffect, useRef } from 'react'
import L from 'leaflet'

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'

/** A small, non-interactive dark locator showing one sensor's position. */
export function Locator({ lat, lon }: { lat: number; lon: number }) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const dot = useRef<L.CircleMarker | null>(null)

  useEffect(() => {
    if (!box.current || map.current) return
    const m = L.map(box.current, {
      zoomControl: false, attributionControl: false, dragging: false,
      scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false,
      keyboard: false, touchZoom: false,
    }).setView([lat, lon], 14)
    L.tileLayer(ESRI, { maxZoom: 16 }).addTo(m)
    map.current = m
    return () => { m.remove(); map.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m) return
    m.setView([lat, lon], 14, { animate: false })
    if (dot.current) dot.current.remove()
    dot.current = L.circleMarker([lat, lon], {
      radius: 7, color: '#f0611f', weight: 1.5, fillColor: '#f0611f', fillOpacity: 0.3,
    }).addTo(m)
  }, [lat, lon])

  return <div ref={box} className="h-full w-full" />
}
