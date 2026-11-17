import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Observatory } from './screens/Observatory'
import { SensorIntelligence } from './screens/SensorIntelligence'
import { Incidents } from './screens/Incidents'
import { Reports } from './screens/Reports'

type ScreenId = 'observatory' | 'sensor' | 'incidents' | 'reports'

const NAV: { id: ScreenId; n: string; label: string }[] = [
  { id: 'observatory', n: '01', label: 'OBSERVATORY' },
  { id: 'sensor', n: '02', label: 'SENSOR' },
  { id: 'incidents', n: '03', label: 'INCIDENTS' },
  { id: 'reports', n: '04', label: 'REPORTS' },
]

export default function App() {
  const [screen, setScreen] = useState<ScreenId>('observatory')
  const [activeSensor, setActiveSensor] = useState<number | null>(null)
  const reduce = useReducedMotion()

  const inspect = (id: number) => { setActiveSensor(id); setScreen('sensor') }

  return (
    <div className="grid-bg flex h-full w-full">
      <div className="frame tl" /><div className="frame tr" />
      <div className="frame bl" /><div className="frame br" />

      {/* left nav rail */}
      <nav className="z-30 flex w-14 flex-col items-center gap-1 border-r py-6"
        style={{ borderColor: 'var(--line)' }}>
        <div className="mb-6 font-display text-sm font-bold" style={{ color: 'var(--coral)' }}>USM</div>
        {NAV.map((item) => {
          const active = screen === item.id
          return (
            <button key={item.id} onClick={() => setScreen(item.id)} title={item.label}
              className="group relative flex h-16 w-full flex-col items-center justify-center gap-1 transition-colors duration-200"
              style={{ color: active ? 'var(--ink)' : 'var(--muted)' }}>
              {active && (
                <motion.span layoutId="nav-active" transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                  className="absolute left-0 top-1/2 h-10 w-[2px] -translate-y-1/2"
                  style={{ background: 'var(--coral)' }} />
              )}
              <span className="font-mono text-[11px] transition-colors duration-200"
                style={{ color: active ? 'var(--coral)' : 'inherit' }}>{item.n}</span>
              <span className="font-mono text-[7px] transition-opacity duration-200 group-hover:opacity-100"
                style={{ writingMode: 'vertical-rl', letterSpacing: '.2em', opacity: active ? 1 : 0.7 }}>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* screen with crossfade transition */}
      <main className="relative min-w-0 flex-1">
        <AnimatePresence mode="wait">
          <motion.div key={screen} className="absolute inset-0"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
            {screen === 'observatory' && <Observatory onInspect={inspect} />}
            {screen === 'sensor' && <SensorIntelligence sensorId={activeSensor} />}
            {screen === 'incidents' && <Incidents onInspect={inspect} />}
            {screen === 'reports' && <Reports />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
