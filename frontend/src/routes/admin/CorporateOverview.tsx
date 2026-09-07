import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertOctagon, ArrowRight, Clock, DollarSign, TriangleAlert } from 'lucide-react'
import { formatInTimeZone } from 'date-fns-tz'
import { getLocations } from '../../services/locations'
import { getShiftsForWeekAllLocations } from '../../services/shifts'
import { LoadingState, ErrorState } from '../../components/shared/States'
import { KpiStrip } from '../../components/admin/KpiStrip'
import { LocationMap } from '../../components/admin/LocationMap'
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
      {isError && (
        <ErrorState
          message="Couldn't load the corporate overview."
          onRetry={() => {
            locationsQuery.refetch()
            shiftsQuery.refetch()
          }}
        />
      )}

      {!isLoading && !isError && (
        <>
          <KpiStrip
            stats={[
              {
                label: 'Unfilled shifts this week',
                value: String(totals.unfilled),
                icon: <AlertOctagon size={16} />,
                tone: totals.unfilled > 0 ? 'brick' : 'ink',
              },
              {
                label: 'Projected OT cost this week',
                value: `$${totals.overtimeCost.toFixed(0)}`,
                icon: <DollarSign size={16} />,
                tone: totals.overtimeCost > 0 ? 'flag' : 'ink',
              },
              {
                label: 'Open violations needing attention',
                value: String(totals.violations),
                icon: <TriangleAlert size={16} />,
                tone: totals.violations > 0 ? 'amber' : 'ink',
              },
            ]}
          />

          <LocationMap rows={rows} />

          <div className="flex flex-col gap-1">
            <h2 className="text-body-xs font-semibold uppercase tracking-normal text-slate-500">Locations</h2>
            <div className="flex flex-col divide-y divide-slate-200 rounded-md border border-slate-200 bg-paper">
              {rows.map(({ location, todayFilled, todayTotal }) => {
                const fullyCovered = todayTotal > 0 && todayFilled === todayTotal
                return (
                  <div key={location.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
                    <div className="sm:w-44 sm:shrink-0">
                      <p className="font-display text-display-sm text-ink">{location.name}</p>
                      <p className="text-body-xs text-slate-500">{location.city}</p>
                    </div>

                    <div className="flex flex-1 items-center gap-3">
                      <div className="h-2 flex-1 rounded-full bg-slate-100">
                        <div
                          className={`h-2 rounded-full ${fullyCovered ? 'bg-moss' : 'bg-brick'}`}
                          style={{ width: `${todayTotal > 0 ? (todayFilled / todayTotal) * 100 : 0}%` }}
                        />
                      </div>
                      <span className={`shrink-0 text-body-xs font-medium ${fullyCovered ? 'text-moss' : 'text-brick'}`}>
                        {todayFilled}/{todayTotal || 0} covered today
                      </span>
                    </div>

                    <div className="flex items-center gap-3 sm:w-40 sm:shrink-0 sm:justify-end">
                      <span className="flex items-center gap-1 text-body-sm text-slate-600">
                        <Clock size={13} className="text-slate-400" />
                        {formatInTimeZone(new Date(), location.timezone, 'h:mm a')}
                      </span>
                      <Link
                        to="/admin/fairness"
                        aria-label={`View fairness report for ${location.name}`}
                        className="text-slate-400 hover:text-amber-dark"
                      >
                        <ArrowRight size={14} />
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
