import { useState } from 'react'
import { api } from '../api'
import { ScreenHeader } from '../components/ScreenHeader'

/** Minimal markdown → elements for the known report structure (#, ##, -, **). */
function render(md: string) {
  const bold = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
      p.startsWith('**') ? <strong key={i} style={{ color: 'var(--ink)' }}>{p.slice(2, -2)}</strong> : p)
  return md.split('\n').map((line, i) => {
    if (/^#{3}\s/.test(line)) return <h4 key={i} className="font-mono mt-4 text-[11px] tracking-[0.18em]" style={{ color: 'var(--coral)' }}>{line.replace(/^#{3}\s/, '').toUpperCase()}</h4>
    if (/^#{2}\s/.test(line)) return <h3 key={i} className="font-display mt-5 text-lg font-semibold" style={{ color: 'var(--ink)' }}>{line.replace(/^#{2}\s/, '')}</h3>
    if (/^#\s/.test(line)) return <h2 key={i} className="font-serif mt-2 text-2xl italic" style={{ color: 'var(--ink)' }}>{line.replace(/^#\s/, '')}</h2>
    if (/^[-*]\s/.test(line)) return <li key={i} className="ml-4 list-disc text-[12.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>{bold(line.replace(/^[-*]\s/, ''))}</li>
    if (!line.trim()) return <div key={i} className="h-2" />
    return <p key={i} className="text-[12.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>{bold(line)}</p>
  })
}

export function Reports() {
  const [days, setDays] = useState(7)
  const [report, setReport] = useState<string | null>(null)
  const [source, setSource] = useState('')
  const [isLlm, setIsLlm] = useState(false)
  const [busy, setBusy] = useState(false)

  const generate = async () => {
    setBusy(true); setReport(null)
    try {
      const r = await api.report(days)
      setReport(r.report); setSource(r.source); setIsLlm(r.is_llm)
    } catch (e) { setReport(`ERROR — ${(e as Error).message}`) } finally { setBusy(false) }
  }

  const download = () => {
    if (!report) return
    const url = URL.createObjectURL(new Blob([report], { type: 'text/markdown' }))
    const a = document.createElement('a'); a.href = url; a.download = `weekly_report_${days}d.md`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="grid-bg flex h-full min-h-0 flex-col px-8 pb-6 pt-7">
      <ScreenHeader n="04" title="Intelligence Reports" caption="PLAIN-ENGLISH WEEKLY HEALTH REPORT · DRAFT FOR REVIEW"
        right={
          <div className="flex items-center gap-4">
            <span className="font-mono text-[9px] tracking-[0.14em]" style={{ color: 'var(--muted)' }}>WINDOW</span>
            <input type="range" min={3} max={28} value={days} onChange={(e) => setDays(+e.target.value)} style={{ accentColor: 'var(--coral)', width: 160 }} />
            <span className="font-display text-xl font-semibold" style={{ width: 54 }}>{days}D</span>
            <button onClick={generate} disabled={busy}
              className="font-mono px-4 py-2 text-[11px] tracking-wider"
              style={{ background: 'var(--coral)', color: '#0b0c0f', opacity: busy ? 0.6 : 1 }}>
              {busy ? 'WRITING…' : 'GENERATE'}
            </button>
          </div>
        } />

      <div className="mx-auto mt-6 flex min-h-0 w-full max-w-3xl flex-1 flex-col border" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
        {/* document chrome */}
        <div className="flex items-center justify-between border-b px-5 py-2.5" style={{ borderColor: 'var(--line)' }}>
          <span className="font-mono text-[9px] tracking-[0.2em]" style={{ color: 'var(--muted)' }}>WEEKLY_REPORT_{days}D.MD</span>
          {report && !busy && (
            <div className="flex items-center gap-3">
              <span className="font-mono border px-2 py-0.5 text-[9px] tracking-wider" style={{ borderColor: 'var(--line-2)', color: isLlm ? 'var(--ok)' : 'var(--warn)' }}>
                {isLlm ? `LLM · ${source}` : 'TEMPLATE FALLBACK'}
              </span>
              <button onClick={download} className="font-mono text-[10px] tracking-wider" style={{ color: 'var(--muted)' }}>⬇ .MD</button>
            </div>
          )}
        </div>

        {/* states: loading / result / empty */}
        <div className="min-h-0 flex-1 overflow-auto px-8 py-6">
          {busy && (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <div className="font-mono text-[11px] tracking-[0.2em]" style={{ color: 'var(--coral)' }}>GATHERING FACTS…</div>
              <div className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>querying the last {days} days · composing draft</div>
            </div>
          )}
          {!busy && report && <div>{render(report)}</div>}
          {!busy && !report && (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div className="font-serif text-2xl italic" style={{ color: 'var(--faint)' }}>No report yet</div>
              <p className="font-mono max-w-sm text-[10.5px] leading-relaxed" style={{ color: 'var(--muted)', letterSpacing: '.04em' }}>
                CHOOSE A WINDOW AND GENERATE. THE REPORT USES ONLY COMPUTED NUMBERS —
                WRITTEN BY A LOCAL MODEL (OLLAMA) WHEN AVAILABLE, OTHERWISE A DETERMINISTIC
                TEMPLATE. ALWAYS A DRAFT TO REVIEW BEFORE USE.
              </p>
              <div className="font-mono text-[9px] tracking-[0.18em]" style={{ color: 'var(--faint)' }}>
                SUMMARY · SENSORS NEEDING ATTENTION · ISSUE BREAKDOWN · NEXT CHECKS
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
