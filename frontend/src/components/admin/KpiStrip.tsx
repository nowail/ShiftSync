import type { ReactNode } from 'react'

export interface KpiStat {
  label: string
  value: string
  icon?: ReactNode
  tone?: 'ink' | 'moss' | 'brick' | 'flag' | 'amber'
  hint?: string
}

const TONE_TEXT: Record<NonNullable<KpiStat['tone']>, string> = {
  ink: 'text-ink',
  moss: 'text-moss',
  brick: 'text-brick',
  flag: 'text-flag',
  amber: 'text-amber-dark',
}

/**
 * One bordered strip divided into columns, rather than N repeated card shells —
 * keeps a row of KPIs reading as a single considered unit.
 */
export function KpiStrip({ stats }: { stats: KpiStat[] }) {
  return (
    <div className="flex flex-col divide-y divide-slate-200 rounded-md border border-slate-200 bg-paper sm:flex-row sm:divide-x sm:divide-y-0">
      {stats.map((stat) => (
        <div key={stat.label} className="flex-1 px-5 py-4">
          <div className="flex items-center gap-1.5 text-body-xs text-slate-500">
            {stat.icon}
            {stat.label}
          </div>
          <p className={`mt-1 font-display text-display-lg leading-none ${TONE_TEXT[stat.tone ?? 'ink']}`}>
            {stat.value}
          </p>
          {stat.hint && <p className="mt-1 text-body-xs text-slate-500">{stat.hint}</p>}
        </div>
      ))}
    </div>
  )
}
