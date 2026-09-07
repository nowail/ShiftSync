import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertOctagon, ArrowRight, CircleCheck, DollarSign, Users2 } from 'lucide-react'
import { getLocations } from '../../services/locations'
import { getShiftsForWeekAllLocations } from '../../services/shifts'
import { LoadingState, ErrorState } from '../../components/shared/States'
import { Badge } from '../../components/ui/Badge'
import { summarizeWeek } from '../../lib/rules'
import { CURRENT_WEEK_START_KEY } from '../../lib/weeks'
import { formatDateInZone } from '../../lib/timezone'
import { format } from 'date-fns'

export function CorporateOverview() {
  const locationsQuery = useQuery({ queryKey: ['locations'], queryFn: getLocations })
  const shiftsQuery = useQuery({
    queryKey: ['shifts', 'week', CURRENT_WEEK_START_KEY, 'all'],
    queryFn: () => getShiftsForWeekAllLocations(CURRENT_WEEK_START_KEY),
  })

  const rows = useMemo(() => {
    if (!locationsQuery.data || !shiftsQuery.data) return []
    return locationsQuery.data.map((location) => {
      const summary = summarizeWeek(location.id, CURRENT_WEEK_START_KEY, shiftsQuery.data)
      const todayKey = formatDateInZone(new Date().toISOString(), location.timezone, 'yyyy-MM-dd')
      const todayShifts = shiftsQuery.data.filter((s) => s.locationId === location.id && s.date === todayKey)
      const todayFilled = todayShifts.filter((s) => s.assignedStaffId).length
      return { location, summary, todayFilled, todayTotal: todayShifts.length }
    })
  }, [locationsQuery.data, shiftsQuery.data])

  const isLoading = locationsQuery.isLoading || shiftsQuery.isLoading
  const isError = locationsQuery.isError || shiftsQuery.isError

  const totals = rows.reduce(
    (acc, r) => ({
      overtimeCost: acc.overtimeCost + r.summary.overtimeCost,
      unfilled: acc.unfilled + r.summary.unfilledSeats,
      violations: acc.violations + r.summary.hardViolations + r.summary.softViolations,
    }),
    { overtimeCost: 0, unfilled: 0, violations: 0 },
  )

  return (
    <div className="flex flex-col gap-6 px-6">
      <div>
        <h1 className="font-display text-display-lg text-ink">Corporate overview</h1>
        <p className="text-body-sm text-slate-600">
          Coastal Eats · week of {format(new Date(CURRENT_WEEK_START_KEY), 'MMM d, yyyy')}
        </p>
      </div>

      {isLoading && <LoadingState label="Loading overview…" />}
      {isError && <ErrorState message="Couldn't load the corporate overview." onRetry={() => { locationsQuery.refetch(); shiftsQuery.refetch() }} />}

      {!isLoading && !isError && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SummaryTile
              icon={<DollarSign size={18} className="text-flag" />}
              label="Projected OT cost this week"
              value={`$${totals.overtimeCost.toFixed(0)}`}
            />
            <SummaryTile
              icon={<AlertOctagon size={18} className="text-brick" />}
              label="Unfilled shifts"
              value={String(totals.unfilled)}
            />
            <SummaryTile
              icon={<Users2 size={18} className="text-amber-dark" />}
              label="Open violations"
              value={String(totals.violations)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {rows.map(({ location, summary, todayFilled, todayTotal }) => (
              <div key={location.id} className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white/40 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-display text-display-sm text-ink">{location.name}</h2>
                    <p className="text-body-xs text-slate-500">{location.city}</p>
                  </div>
                  {todayFilled === todayTotal && todayTotal > 0 ? (
                    <Badge tone="moss">
                      <CircleCheck size={12} /> Fully covered today
                    </Badge>
                  ) : (
                    <Badge tone="brick">
                      <AlertOctagon size={12} /> {todayTotal - todayFilled} open today
                    </Badge>
                  )}
                </div>

                <dl className="grid grid-cols-3 gap-3 text-body-sm">
                  <div>
                    <dt className="text-body-xs text-slate-500">Today's coverage</dt>
                    <dd className="font-display text-display-sm text-ink">
                      {todayFilled}/{todayTotal || 0}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-body-xs text-slate-500">Projected OT cost</dt>
                    <dd className="font-display text-display-sm text-ink">${summary.overtimeCost.toFixed(0)}</dd>
                  </div>
                  <div>
                    <dt className="text-body-xs text-slate-500">Violations</dt>
                    <dd className="font-display text-display-sm text-ink">
                      {summary.hardViolations + summary.softViolations}
                    </dd>
                  </div>
                </dl>

                <Link
                  to="/admin/fairness"
                  className="flex items-center gap-1 text-body-xs font-medium text-ink hover:text-amber-dark"
                >
                  View fairness report <ArrowRight size={12} />
                </Link>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function SummaryTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white/40 p-4">
      <div className="rounded-sm bg-slate-100 p-2">{icon}</div>
      <div>
        <p className="text-body-xs text-slate-500">{label}</p>
        <p className="font-display text-display-md text-ink">{value}</p>
      </div>
    </div>
  )
}
