import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { CircleDot, Users } from 'lucide-react'
import { getOnDutyNow } from '../../services/presence'
import { getStaff } from '../../services/staff'
import { useSessionStore } from '../../store/session'
import { Avatar } from '../../components/shared/Avatar'
import { Badge } from '../../components/ui/Badge'
import { LoadingState, ErrorState, EmptyState } from '../../components/shared/States'
import { roleLabel } from '../../lib/format'
import { getShiftsForWeek } from '../../services/shifts'
import { CURRENT_WEEK_START_KEY } from '../../lib/weeks'

export function OnDutyNow() {
  const activeLocationId = useSessionStore((s) => s.activeLocationId)

  const presenceQuery = useQuery({
    queryKey: ['presence', activeLocationId],
    queryFn: () => getOnDutyNow(activeLocationId ?? undefined),
    refetchInterval: 15_000,
  })
  const staffQuery = useQuery({ queryKey: ['staff'], queryFn: getStaff })
  const shiftsQuery = useQuery({
    queryKey: ['shifts', activeLocationId, CURRENT_WEEK_START_KEY],
    queryFn: () => getShiftsForWeek(activeLocationId!, CURRENT_WEEK_START_KEY),
    enabled: !!activeLocationId,
  })

  const staffById = new Map((staffQuery.data ?? []).map((s) => [s.id, s]))
  const shiftById = new Map((shiftsQuery.data ?? []).map((s) => [s.id, s]))

  const isLoading = presenceQuery.isLoading || staffQuery.isLoading
  const isError = presenceQuery.isError || staffQuery.isError

  return (
    <div className="flex flex-col gap-5 px-4 sm:px-6">
      <div className="flex items-center gap-2">
        <h1 className="font-display text-display-lg text-ink">On duty now</h1>
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-moss opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-moss" />
        </span>
      </div>
      <p className="-mt-3 text-body-sm text-slate-600">Live from the clock-in feed, refreshing automatically.</p>

      {isLoading && <LoadingState label="Checking who's clocked in…" />}
      {isError && <ErrorState message="Couldn't load live presence." onRetry={() => presenceQuery.refetch()} />}
      {presenceQuery.data && presenceQuery.data.length === 0 && (
        <EmptyState
          icon={<Users size={20} className="text-slate-400" />}
          title="No one's clocked in right now"
          body="Staff clocked in for a current shift will appear here in real time."
        />
      )}

      {presenceQuery.data && presenceQuery.data.length > 0 && (
        <div className="flex flex-col gap-2">
          {presenceQuery.data.map((entry) => {
            const staff = staffById.get(entry.staffId)
            const shift = shiftById.get(entry.shiftId)
            if (!staff) return null
            return (
              <div key={entry.staffId} className="flex items-center gap-3 rounded-md border border-slate-200 p-3">
                <Avatar name={staff.name} color={staff.avatarColor} />
                <div className="min-w-0 flex-1">
                  <p className="text-body-sm font-medium text-ink">{staff.name}</p>
                  <p className="text-body-xs text-slate-500">
                    Clocked in {formatDistanceToNow(new Date(entry.clockedInAt), { addSuffix: true })}
                  </p>
                </div>
                {shift && <Badge tone="amber">{roleLabel(shift.role)}</Badge>}
                <span className="flex items-center gap-1 text-body-xs font-medium text-moss">
                  <CircleDot size={12} /> On shift
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
