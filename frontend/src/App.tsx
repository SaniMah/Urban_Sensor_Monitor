import { useState } from 'react'
import { Observatory } from './screens/Observatory'
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

  return (
    <div className="grid-bg flex h-full w-full">
      <div className="frame tl" /><div className="frame tr" />
      <div className="frame bl" /><div className="frame br" />

      {/* left nav rail */}
      <nav className="z-30 flex w-14 flex-col items-center gap-1 border-r py-6"
        style={{ borderColor: 'var(--line)' }}>
        <div className="mb-6 font-display text-sm font-bold" style={{ color: 'var(--coral)' }}>FP</div>
        {NAV.map((item) => {
          const active = screen === item.id
          return (
            <button key={item.id} onClick={() => setScreen(item.id)}
              title={item.label}
              className="group flex h-16 w-full flex-col items-center justify-center gap-1"
              style={{ color: active ? 'var(--ink)' : 'var(--muted)' }}>
              <span className="font-mono text-[11px]" style={{ color: active ? 'var(--coral)' : 'inherit' }}>{item.n}</span>
              <span className="font-mono text-[7px]" style={{ writingMode: 'vertical-rl', letterSpacing: '.2em' }}>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* screen */}
      <main className="relative min-w-0 flex-1">
        {screen === 'observatory' && <Observatory />}
        {screen === 'sensor' && <Placeholder title="Sensor Intelligence" n="02" />}
        {screen === 'incidents' && <Incidents />}
        {screen === 'reports' && <Reports />}
      </main>
    </div>
  )
}

function Placeholder({ title, n }: { title: string; n: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="label" style={{ color: 'var(--coral)' }}>SCREEN {n}</div>
      <h2 className="font-display mt-2 text-3xl font-semibold">{title}</h2>
      <p className="font-mono mt-3 text-[11px]" style={{ color: 'var(--muted)' }}>// IN DEVELOPMENT</p>
    </div>
  )
}
