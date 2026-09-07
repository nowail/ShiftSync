import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { getShiftsForWeek, previewAssignment } from '../../services/shifts'
import { getStaffByLocation } from '../../services/staff'
import { getLocations } from '../../services/locations'
import { useSessionStore } from '../../store/session'
import { CURRENT_WEEK_START_KEY, NEXT_WEEK_START_KEY } from '../../lib/weeks'
import { shiftHours, weeklyHoursFor, consecutiveDaysIncluding } from '../../lib/rules'
import { localDateKey } from '../../lib/timezone'
import { formatHours } from '../../lib/format'
import { Avatar } from '../../components/shared/Avatar'
import { Badge } from '../../components/ui/Badge'
import { Select } from '../../components/ui/Select'
import { Tabs } from '../../components/ui/Tabs'
import { LoadingState, ErrorState, EmptyState } from '../../components/shared/States'
import { format, parseISO } from 'date-fns'

const DAILY_HARD_LIMIT = 12
const WEEKLY_WARNING = 35
const WEEKLY_REFERENCE = 40

export function OvertimeDashboard() {
  const activeLocationId = useSessionStore((s) => s.activeLocationId)
  const [weekStart, setWeekStart] = useState(CURRENT_WEEK_START_KEY)
  const [whatIfStaffId, setWhatIfStaffId] = useState('')
  const [whatIfShiftId, setWhatIfShiftId] = useState('')

  const locationsQuery = useQuery({ queryKey: ['locations'], queryFn: getLocations })
  const location = locationsQuery.data?.find((l) => l.id === activeLocationId)

  const staffQuery = useQuery({
    queryKey: ['staff', 'location', activeLocationId],
    queryFn: () => getStaffByLocation(activeLocationId!),
    enabled: !!activeLocationId,
  })
  const shiftsQuery = useQuery({
    queryKey: ['shifts', activeLocationId, weekStart],
    queryFn: () => getShiftsForWeek(activeLocationId!, weekStart),
    enabled: !!activeLocationId,
  })

  const rows = useMemo(() => {
    if (!staffQuery.data || !shiftsQuery.data || !location) return []
    return staffQuery.data
      .filter((s) => s.role === 'staff')
      .map((staff) => {
        const totalHours = weeklyHoursFor(staff.id, weekStart, shiftsQuery.data)
        const dailyHours = new Map<string, number>()
        shiftsQuery.data
          .filter((s) => s.assignedStaffId === staff.id)
          .forEach((s) => {
            const key = localDateKey(s.startUtc, location.timezone)
            dailyHours.set(key, (dailyHours.get(key) ?? 0) + shiftHours(s))
          })
        const maxStreak = Math.max(
          0,
          ...Array.from(dailyHours.keys()).map((dateKey) =>
            consecutiveDaysIncluding(staff.id, location, shiftsQuery.data, dateKey),
          ),
        )
        return { staff, totalHours, dailyHours, maxStreak }
      })
      .sort((a, b) => b.totalHours - a.totalHours)
  }, [staffQuery.data, shiftsQuery.data, location, weekStart])

  const unfilledShifts = shiftsQuery.data?.filter((s) => !s.assignedStaffId) ?? []

  const previewQuery = useQuery({
    queryKey: ['preview', whatIfShiftId, whatIfStaffId],
    queryFn: () => previewAssignment(whatIfShiftId, whatIfStaffId),
    enabled: !!whatIfShiftId && !!whatIfStaffId,
  })

  const isLoading = staffQuery.isLoading || shiftsQuery.isLoading
  const isError = staffQuery.isError || shiftsQuery.isError

  return (
    <div className="flex flex-col gap-6 px-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-display-lg text-ink">Overtime dashboard</h1>
          <p className="text-body-sm text-slate-600">{location?.name}</p>
        </div>
        <Tabs
          value={weekStart}
          onChange={setWeekStart}
          options={[
            { value: CURRENT_WEEK_START_KEY, label: 'This week' },
            { value: NEXT_WEEK_START_KEY, label: 'Next week' },
          ]}
        />
      </div>

      {isLoading && <LoadingState label="Crunching hours…" />}
      {isError && <ErrorState message="Couldn't load overtime data." />}
      {!isLoading && !isError && rows.length === 0 && (
        <EmptyState title="No one is scheduled yet" body="Assign shifts on the board to see hours here." />
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <div className="flex flex-col gap-3">
          {rows.map(({ staff, totalHours, dailyHours, maxStreak }) => {
            const pctOf48 = Math.min(100, (totalHours / 48) * 100)
            const overWarning = totalHours >= WEEKLY_WARNING
            const overReference = totalHours > WEEKLY_REFERENCE
            return (
              <div key={staff.id} className="flex flex-col gap-2 rounded-md border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Avatar name={staff.name} color={staff.avatarColor} size={24} />
                    <span className="text-body-sm font-medium text-ink">{staff.name}</span>
                    {maxStreak >= 6 && (
                      <Badge tone="flag">
                        <TriangleAlert size={11} /> {maxStreak}-day streak
                      </Badge>
                    )}
                  </span>
                  <span className="font-display text-display-sm text-ink">{formatHours(totalHours)}</span>
                </div>

                <div className="relative h-3 w-full rounded-full bg-slate-100">
                  <div
                    className={`h-3 rounded-full ${overReference ? 'bg-brick' : overWarning ? 'bg-flag' : 'bg-moss'}`}
                    style={{ width: `${pctOf48}%` }}
                  />
                  <div className="absolute top-0 h-3 w-px bg-slate-400" style={{ left: `${(35 / 48) * 100}%` }} />
                  <div className="absolute top-0 h-3 w-px bg-ink" style={{ left: `${(40 / 48) * 100}%` }} />
                </div>
                <div className="flex justify-between text-body-xs text-slate-400">
                  <span>0h</span>
                  <span style={{ marginLeft: `${(35 / 48) * 100 - 6}%` }}>35h</span>
                  <span style={{ marginLeft: `${(5 / 48) * 100 - 6}%` }}>40h</span>
                  <span>48h</span>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {Array.from(dailyHours.entries()).map(([date, hours]) => (
                    <span
                      key={date}
                      className={`rounded-sm border px-1.5 py-0.5 text-body-xs ${
                        hours > DAILY_HARD_LIMIT
                          ? 'border-brick/40 bg-brick/10 text-brick'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      {format(parseISO(date), 'EEE')} {formatHours(hours)}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="rounded-md border border-slate-200 p-4">
        <h2 className="mb-3 font-display text-display-sm text-ink">What-if preview</h2>
        <p className="mb-3 text-body-sm text-slate-600">
          Check the impact of assigning someone to an open shift before you confirm it.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select label="Staff member" value={whatIfStaffId} onChange={(e) => setWhatIfStaffId(e.target.value)}>
            <option value="">Choose staff…</option>
            {staffQuery.data
              ?.filter((s) => s.role === 'staff')
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </Select>
          <Select label="Open shift" value={whatIfShiftId} onChange={(e) => setWhatIfShiftId(e.target.value)}>
            <option value="">Choose an open shift…</option>
            {unfilledShifts.map((s) => (
              <option key={s.id} value={s.id}>
                {format(parseISO(s.date), 'EEE MMM d')} · {s.role}
              </option>
            ))}
          </Select>
        </div>

        {previewQuery.data && (
          <div className="mt-4 flex flex-col gap-2">
            {previewQuery.data.length === 0 ? (
              <p className="flex items-center gap-2 text-body-sm text-moss">No conflicts — clear to assign.</p>
            ) : (
              previewQuery.data.map((v, i) => (
                <p
                  key={i}
                  className={`flex items-start gap-2 rounded-sm border p-2 text-body-sm ${
                    v.severity === 'hard' ? 'border-brick/30 bg-brick/5' : 'border-flag/40 bg-flag-light/60'
                  }`}
                >
                  <TriangleAlert size={14} className={v.severity === 'hard' ? 'text-brick' : 'text-flag'} />
                  {v.message}
                </p>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
