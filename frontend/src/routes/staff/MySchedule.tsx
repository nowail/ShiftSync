import { useQuery } from '@tanstack/react-query'
import { CalendarDays, MapPin, Moon, Star } from 'lucide-react'
import { getUpcomingShiftsForStaff } from '../../services/shifts'
import { getLocations } from '../../services/locations'
import { useSessionStore } from '../../store/session'
import { Badge } from '../../components/ui/Badge'
import { LoadingState, ErrorState, EmptyState } from '../../components/shared/States'
import { roleLabel } from '../../lib/format'
import { formatDateInZone, formatTimeInZone, localDateKey, timezoneAbbrev } from '../../lib/timezone'

export function MySchedule() {
  const staffId = useSessionStore((s) => s.staffId)!

  const shiftsQuery = useQuery({
    queryKey: ['shifts', 'staff', staffId],
    queryFn: () => getUpcomingShiftsForStaff(staffId),
  })
  const locationsQuery = useQuery({ queryKey: ['locations'], queryFn: getLocations })

  const isLoading = shiftsQuery.isLoading || locationsQuery.isLoading
  const isError = shiftsQuery.isError || locationsQuery.isError

  const [next, ...rest] = shiftsQuery.data ?? []

  return (
    <div className="flex flex-col gap-6 p-4">
      {isLoading && <LoadingState label="Loading your schedule…" />}
      {isError && <ErrorState message="Couldn't load your schedule." onRetry={() => shiftsQuery.refetch()} />}
      {shiftsQuery.data && shiftsQuery.data.length === 0 && (
        <EmptyState
          icon={<CalendarDays size={20} className="text-slate-400" />}
          title="No upcoming shifts"
          body="Once your manager publishes the schedule, your shifts will show up here."
        />
      )}

      {next && locationsQuery.data && (
        <section>
          <h2 className="mb-2 text-body-xs font-semibold uppercase tracking-normal text-slate-500">Next up</h2>
          <ShiftCard shift={next} location={locationsQuery.data.find((l) => l.id === next.locationId)!} featured />
        </section>
      )}

      {rest.length > 0 && locationsQuery.data && (
        <section>
          <h2 className="mb-2 text-body-xs font-semibold uppercase tracking-normal text-slate-500">This week</h2>
          <div className="flex flex-col gap-3">
            {rest.map((shift) => (
              <ShiftCard
                key={shift.id}
                shift={shift}
                location={locationsQuery.data!.find((l) => l.id === shift.locationId)!}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function ShiftCard({
  shift,
  location,
  featured = false,
}: {
  shift: import('../../types').Shift
  location: import('../../types').Location
  featured?: boolean
}) {
  const isOvernight = localDateKey(shift.startUtc, location.timezone) !== localDateKey(shift.endUtc, location.timezone)

  return (
    <div
      className={`flex flex-col gap-2 rounded-md border p-4 ${
        featured ? 'border-ink bg-ink text-paper' : 'border-slate-200 bg-white/50 text-ink'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-body-xs font-medium uppercase ${featured ? 'text-amber' : 'text-slate-500'}`}>
          {formatDateInZone(shift.startUtc, location.timezone, 'EEE MMM d')}
          {isOvernight && ` – ${formatDateInZone(shift.endUtc, location.timezone, 'EEE MMM d')}`}
        </span>
        {shift.isPremium && (
          <span className={`flex items-center gap-1 text-body-xs font-medium ${featured ? 'text-amber' : 'text-amber-dark'}`}>
            <Star size={12} /> Premium
          </span>
        )}
      </div>

      <p className="font-display text-display-md">
        {formatTimeInZone(shift.startUtc, location.timezone)}–{formatTimeInZone(shift.endUtc, location.timezone)}{' '}
        <span className="text-display-xs font-body font-normal opacity-70">
          {timezoneAbbrev(shift.startUtc, location.timezone)}
        </span>
      </p>

      <div className="flex items-center justify-between">
        <span className={`flex items-center gap-1 text-body-sm ${featured ? 'text-slate-300' : 'text-slate-600'}`}>
          <MapPin size={13} /> {location.name}
        </span>
        <Badge tone={featured ? 'amber' : 'slate'}>{roleLabel(shift.role)}</Badge>
      </div>

      {isOvernight && (
        <span className={`flex items-center gap-1 text-body-xs ${featured ? 'text-slate-300' : 'text-slate-500'}`}>
          <Moon size={12} /> Overnight — spans two calendar days in {location.name}'s local time
        </span>
      )}
    </div>
  )
}
