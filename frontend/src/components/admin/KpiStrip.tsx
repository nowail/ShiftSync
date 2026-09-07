import type { ReactNode } from 'react'

export interface KpiStat {
  label: string
  value: string
  icon?: ReactNode
  tone?: 'ink' | 'moss' | 'brick' | 'flag' | 'amber'
  hint?: string
  /** e.g. "+3 vs last week" — only pass this when there's a real prior-period value to compare. */
  delta?: string
  deltaTone?: 'moss' | 'brick' | 'flag'
}

const TONE_TEXT: Record<NonNullable<KpiStat['tone']>, string> = {
  ink: 'text-ink',
  moss: 'text-moss',
  brick: 'text-brick',
  flag: 'text-flag',
  amber: 'text-amber-dark',
}

// Solid semantic-token chip behind each icon — never a pastel tint, never an arbitrary
// per-card color. Icons render with no color class of their own so they inherit this via
// currentColor (lucide-react's default stroke).
const CHIP_CLASSES: Record<NonNullable<KpiStat['tone']>, string> = {
  ink: 'bg-ink text-paper',
  moss: 'bg-moss text-paper',
  brick: 'bg-brick text-paper',
  flag: 'bg-flag text-paper',
  amber: 'bg-amber text-ink',
}

const DELTA_TEXT: Record<NonNullable<KpiStat['deltaTone']>, string> = {
  moss: 'text-moss',
  brick: 'text-brick',
  flag: 'text-flag',
}

/**
 * One bordered strip divided into columns, rather than N repeated card shells —
 * keeps a row of KPIs reading as a single considered unit.
 */
export function KpiStrip({ stats }: { stats: KpiStat[] }) {
  return (
    <div className="flex flex-col divide-y divide-slate-200 rounded-md border border-slate-200 bg-paper sm:flex-row sm:divide-x sm:divide-y-0">
      {stats.map((stat) => {
        const tone = stat.tone ?? 'ink'
        return (
          <div key={stat.label} className="flex flex-1 items-start gap-3 px-5 py-4">
            {stat.icon && (
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-sm ${CHIP_CLASSES[tone]}`}>
                {stat.icon}
              </span>
            )}
            <div className="min-w-0">
              <p className="text-body-xs text-slate-500">{stat.label}</p>
              <p className={`mt-0.5 font-display text-display-lg leading-none ${TONE_TEXT[tone]}`}>{stat.value}</p>
              <div className="mt-1 flex items-center gap-1.5">
                {stat.hint && <p className="text-body-xs text-slate-500">{stat.hint}</p>}
                {stat.delta && (
                  <span className={`text-body-xs font-medium ${DELTA_TEXT[stat.deltaTone ?? 'moss']}`}>
                    {stat.delta}
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
