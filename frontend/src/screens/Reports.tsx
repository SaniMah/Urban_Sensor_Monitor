import { useState } from 'react'
import { api } from '../api'

export function Reports() {
  const [days, setDays] = useState(7)
  const [report, setReport] = useState<string | null>(null)
  const [source, setSource] = useState<string>('')
  const [isLlm, setIsLlm] = useState(false)
  const [busy, setBusy] = useState(false)

  const generate = async () => {
    setBusy(true); setReport(null)
    try {
      const r = await api.report(days)
      setReport(r.report); setSource(r.source); setIsLlm(r.is_llm)
    } catch (e) {
      setReport(`ERROR — ${(e as Error).message}`)
    } finally { setBusy(false) }
  }

  const download = () => {
    if (!report) return
    const url = URL.createObjectURL(new Blob([report], { type: 'text/markdown' }))
    const a = document.createElement('a')
    a.href = url; a.download = `weekly_report_${days}d.md`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-8 pb-6 pt-7">
      <div className="label" style={{ color: 'var(--coral)' }}>SCREEN 04</div>
      <h2 className="font-display text-3xl font-semibold leading-tight">Intelligence Reports</h2>
      <p className="font-mono mt-2 text-[10px]" style={{ color: 'var(--muted)', letterSpacing: '.06em' }}>
        LOCAL MODEL (OLLAMA) WHEN AVAILABLE · DETERMINISTIC TEMPLATE FALLBACK · ALWAYS A DRAFT
      </p>

      <div className="mt-5 flex items-center gap-4">
        <span className="label">WINDOW</span>
        <input type="range" min={3} max={28} value={days} onChange={(e) => setDays(+e.target.value)}
          style={{ accentColor: 'var(--coral)', width: 220 }} />
        <span className="font-display text-xl font-semibold" style={{ width: 70 }}>{days} D</span>
        <button onClick={generate} disabled={busy}
          className="font-mono ml-auto px-4 py-2 text-[11px] tracking-wider"
          style={{ background: 'var(--coral)', color: '#0b0c0f', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'WRITING…' : 'GENERATE REPORT'}
        </button>
      </div>

      {report && (
        <>
          <div className="mt-5 flex items-center gap-3">
            <span className="font-mono border px-2 py-1 text-[9px] tracking-wider"
              style={{ borderColor: 'var(--line-2)', color: isLlm ? 'var(--ok)' : 'var(--warn)' }}>
              {isLlm ? `LLM · ${source}` : 'TEMPLATE FALLBACK'}
            </span>
            <button onClick={download} className="font-mono text-[10px] tracking-wider" style={{ color: 'var(--muted)' }}>⬇ DOWNLOAD .MD</button>
          </div>
          <pre className="mt-3 min-h-0 flex-1 overflow-auto whitespace-pre-wrap border p-5 text-[12px] leading-relaxed"
            style={{ borderColor: 'var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--sans)' }}>
            {report}
          </pre>
        </>
      )}
    </div>
  )
}
