import { useState } from 'react'
import { LOCATION_MAP_POINTS, LOCATION_STATE_IDS, US_MAP_HEIGHT, US_MAP_WIDTH, US_STATES } from '../../lib/usMapData'
import type { WeekRiskSummary } from '../../lib/rules'
import type { Location as LocationType } from '../../types'

type StatusTone = 'moss' | 'flag' | 'brick'

const TONE_HEX = { moss: '#3E7C6B', flag: '#B8842E', brick: '#C1473F' }

export interface LocationMapRow {
  location: LocationType
  summary: WeekRiskSummary
  todayFilled: number
  todayTotal: number
}

function statusTone(summary: WeekRiskSummary): StatusTone {
  if (summary.unfilledSeats > 0 || summary.hardViolations > 0) return 'brick'
  if (summary.softViolations > 0) return 'flag'
  return 'moss'
}

export function LocationMap({ rows }: { rows: LocationMapRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null)

  const highlightedStateIds = new Set(rows.map((r) => LOCATION_STATE_IDS[r.location.id]))

  return (
    <div className="relative rounded-md border border-slate-200 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-display-sm text-ink">Location coverage map</h2>
        <div className="flex flex-wrap items-center gap-3 text-body-xs text-slate-500">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TONE_HEX.moss }} /> fully staffed
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TONE_HEX.flag }} /> soft warning
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TONE_HEX.brick }} /> unfilled / hard risk
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${US_MAP_WIDTH} ${US_MAP_HEIGHT}`} className="w-full" role="img" aria-label="Map of Coastal Eats locations">
        {/* State shapes are always neutral — status is a property of a location (a single
            restaurant), not the state it happens to sit in, so it's never implied here.
            States containing a location get a slightly bolder (still neutral) border, purely
            so the map reads at a glance before you even look at the markers. */}
        {US_STATES.map((state) => {
          const highlighted = highlightedStateIds.has(state.id)
          return (
            <path
              key={state.id}
              d={state.d}
              fill="#E8E6DE"
              stroke={highlighted ? '#868C9E' : '#D3D1C7'}
              strokeWidth={highlighted ? 1 : 0.75}
            />
          )
        })}

        {rows.map((row) => {
          const point = LOCATION_MAP_POINTS[row.location.id]
          if (!point) return null
          const tone = statusTone(row.summary)
          const [x, y] = point
          return (
            <g key={row.location.id}>
              {/* Status halo — the only place status color appears on the map. */}
              <circle
                cx={x}
                cy={y}
                r={10}
                fill="none"
                stroke={TONE_HEX[tone]}
                strokeWidth={2}
                strokeOpacity={0.35}
                className={tone === 'brick' ? 'animate-pulse' : undefined}
              />
              <circle
                cx={x}
                cy={y}
                r={5}
                fill={TONE_HEX[tone]}
                stroke="#F6F4EE"
                strokeWidth={1.5}
                className="cursor-pointer"
                onClick={() => setOpenId(openId === row.location.id ? null : row.location.id)}
              >
                <title>{row.location.name}</title>
              </circle>
            </g>
          )
        })}
      </svg>

      {rows.map((row) => {
        const point = LOCATION_MAP_POINTS[row.location.id]
        if (!point || openId !== row.location.id) return null
        const tone = statusTone(row.summary)
        const [x, y] = point
        const leftPct = (x / US_MAP_WIDTH) * 100
        const topPct = (y / US_MAP_HEIGHT) * 100
        return (
          <div
            key={row.location.id}
            className="absolute z-10 w-52 rounded-sm border border-slate-200 bg-paper p-3 shadow-board"
            style={{
              left: `${leftPct}%`,
              top: `${topPct}%`,
              transform: leftPct > 70 ? 'translate(-100%, 8px)' : 'translate(-8px, 8px)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-display-xs text-ink">{row.location.name}</p>
              <button onClick={() => setOpenId(null)} aria-label="Close" className="text-slate-400 hover:text-ink">
                ×
              </button>
            </div>
            <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-body-xs">
              <dt className="text-slate-500">Today</dt>
              <dd className="text-right text-ink">
                {row.todayFilled}/{row.todayTotal || 0} covered
              </dd>
              <dt className="text-slate-500">OT cost</dt>
              <dd className="text-right text-ink">${row.summary.overtimeCost.toFixed(0)}</dd>
              <dt className="text-slate-500">Violations</dt>
              <dd className="text-right text-ink">{row.summary.hardViolations + row.summary.softViolations}</dd>
            </dl>
            <p className="mt-1.5 text-body-xs font-medium" style={{ color: TONE_HEX[tone] }}>
              {tone === 'brick' ? 'Needs attention' : tone === 'flag' ? 'Worth watching' : 'On track'}
            </p>
          </div>
        )
      })}
    </div>
  )
}
