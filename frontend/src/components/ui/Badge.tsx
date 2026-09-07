import type { ReactNode } from 'react'

type BadgeTone = 'amber' | 'brick' | 'moss' | 'flag' | 'slate' | 'ink'

const TONE_CLASSES: Record<BadgeTone, string> = {
  amber: 'bg-amber/15 text-amber-dark border-amber/30',
  brick: 'bg-brick/10 text-brick border-brick/30',
  moss: 'bg-moss/10 text-moss border-moss/30',
  flag: 'bg-flag-light text-flag border-flag/40',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
  ink: 'bg-ink text-paper border-ink',
}

export function Badge({ tone = 'slate', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-body-xs font-medium leading-none ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  )
}
