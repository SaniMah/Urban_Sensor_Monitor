import type { ReactNode } from 'react'

/** Editorial masthead shared by the dark analytical screens. */
export function ScreenHeader({ n, title, caption, right }: {
  n: string; title: string; caption?: string; right?: ReactNode
}) {
  return (
    <div className="flex items-end justify-between gap-6 border-b pb-4" style={{ borderColor: 'var(--line)' }}>
      <div>
        <div className="font-mono text-[10px] tracking-[0.26em]" style={{ color: 'var(--coral)' }}>
          FIG. {n} · URBAN SENSOR MONITOR
        </div>
        <h2 className="font-serif mt-2 text-[2.5rem] font-normal italic leading-none" style={{ letterSpacing: '-.01em' }}>
          {title}
        </h2>
        {caption && (
          <p className="font-mono mt-2 text-[10px]" style={{ color: 'var(--muted)', letterSpacing: '.1em' }}>{caption}</p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}
