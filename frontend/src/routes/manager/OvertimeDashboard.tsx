import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DollarSign, TriangleAlert } from 'lucide-react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getShiftsForWeek, previewAssignment } from '../../services/shifts'
import { getStaffByLocation } from '../../services/staff'
import { getLocations } from '../../services/locations'
import { getOvertimeSummary } from '../../services/overtime'
import { useSessionStore } from '../../store/session'
import { CURRENT_WEEK_START_KEY, NEXT_WEEK_START_KEY } from '../../lib/weeks'
import { formatHours } from '../../lib/format'
import { Avatar } from '../../components/shared/Avatar'
import { Badge } from '../../components/ui/Badge'
import { Select } from '../../components/ui/Select'
import { Tabs } from '../../components/ui/Tabs'
import { PaginationControl } from '../../components/ui/PaginationControl'
import { LoadingState, ErrorState, EmptyState } from '../../components/shared/States'
import { addDays, format, parseISO } from 'date-fns'

const DAILY_HARD_LIMIT = 12
const WEEKLY_WARNING = 35
const WEEKLY_REFERENCE = 40

// Mirrors tailwind.config.ts — recharts renders SVG, so Tailwind classes don't apply.
const COLOR = { brick: '#C1473F', flag: '#B8842E', ink: '#1C2333' }
const LINE_COLORS = ['#1C2333', '#4B5169', '#656B82', '#868C9E']

function trendDot(lineColor: string) {
  return ({ cx, cy, value }: { cx?: number; cy?: number; value?: number }) => {
    if (cx == null || cy == null || value == null) return <g />
    const fill = value >= WEEKLY_REFERENCE ? COLOR.brick : value >= WEEKLY_WARNING ? COLOR.flag : lineColor
    return <circle cx={cx} cy={cy} r={3} fill={fill} stroke="none" />
  }
}

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
  // Still needed for the what-if preview's "open shift" dropdown (unfilledShifts below) —
  // the per-staff hours/streak/cost numbers now come from the real overtime endpoint
  // instead of being derived from this query client-side.
  const shiftsQuery = useQuery({
    queryKey: ['shifts', activeLocationId, weekStart],
    queryFn: () => getShiftsForWeek(activeLocationId!, weekStart),
    enabled: !!activeLocationId,
  })
  const [overtimePage, setOvertimePage] = useState(1)
  const overtimeQuery = useQuery({
    queryKey: ['overtime', activeLocationId, weekStart, overtimePage],
    queryFn: () => getOvertimeSummary(activeLocationId!, weekStart, overtimePage),
    enabled: !!activeLocationId,
  })

  // Already sorted (highest hours first) and paginated server-side — this just joins each
  // row with its staff record for display.
  const rows = useMemo(() => {
    if (!staffQuery.data || !overtimeQuery.data) return []
    const staffById = new Map(staffQuery.data.map((s) => [s.id, s]))
    return overtimeQuery.data.items
      .map((row) => {
        const staff = staffById.get(row.staffId)
        if (!staff) return null
        const dailyHours = new Map(row.dailyHours.map((d) => [d.date, d.hours]))
        return { staff, totalHours: row.totalHours, dailyHours, maxStreak: row.maxConsecutiveDays }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
  }, [staffQuery.data, overtimeQuery.data])

  // The 3-4 staff closest to or over the weekly thresholds, so the trend chart stays
  // readable instead of plotting everyone on the schedule.
  const trendCandidates = useMemo(() => rows.slice(0, 4), [rows])

  const trendData = useMemo(() => {
    if (trendCandidates.length === 0) return []
    const weekStartDate = parseISO(weekStart)
    let running = trendCandidates.map(() => 0)
    return Array.from({ length: 7 }, (_, dayIndex) => {
      const date = addDays(weekStartDate, dayIndex)
      const dateKey = format(date, 'yyyy-MM-dd')
      const point: Record<string, string | number> = { day: format(date, 'EEE') }
      running = trendCandidates.map((candidate, i) => running[i] + (candidate.dailyHours.get(dateKey) ?? 0))
      trendCandidates.forEach((candidate, i) => {
        point[candidate.staff.name.split(' ')[0]] = running[i]
      })
      return point
    })
  }, [trendCandidates, weekStart])

  const unfilledShifts = shiftsQuery.data?.filter((s) => !s.assignedStaffId) ?? []

  const previewQuery = useQuery({
    queryKey: ['preview', whatIfShiftId, whatIfStaffId],
    queryFn: () => previewAssignment(whatIfShiftId, whatIfStaffId),
    enabled: !!whatIfShiftId && !!whatIfStaffId,
  })

  const isLoading = staffQuery.isLoading || shiftsQuery.isLoading || overtimeQuery.isLoading
  const isError = staffQuery.isError || shiftsQuery.isError || overtimeQuery.isError

  return (
    <div className="flex flex-col gap-6 px-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-display-lg text-ink">Overtime dashboard</h1>
          <p className="text-body-sm text-slate-600">{location?.name}</p>
        </div>
        <Tabs
          value={weekStart}
          onChange={(v) => {
            setWeekStart(v)
            setOvertimePage(1)
          }}
          options={[
            { value: CURRENT_WEEK_START_KEY, label: 'This week' },
            { value: NEXT_WEEK_START_KEY, label: 'Next week' },
          ]}
        />
      </div>

      {isLoading && <LoadingState label="Crunching hours…" />}
      {isError && <ErrorState message="Couldn't load overtime data." />}

      {!isLoading && !isError && overtimeQuery.data && (
        <div className="flex items-center gap-3 rounded-md border border-slate-200 p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brick/10 text-brick">
            <DollarSign size={18} />
          </span>
          <div>
            <p className="text-body-xs text-slate-500">Projected weekly overtime cost</p>
            <p className="font-display text-display-sm text-ink">${overtimeQuery.data.projectedWeeklyCost.toFixed(0)}</p>
          </div>
        </div>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <EmptyState title="No one is scheduled yet" body="Assign shifts on the board to see hours here." />
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <div className="rounded-md border border-slate-200 p-4">
          <h2 className="mb-1 font-display text-display-sm text-ink">Hours so far this week</h2>
          <p className="mb-2 text-body-xs text-slate-500">
            The {trendCandidates.length} closest to the weekly thresholds — dots turn flag at 35h, brick at 40h.
          </p>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={trendData} margin={{ top: 8, right: 34, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#E8E6DE" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#656B82' }} tickLine={false} axisLine={{ stroke: '#D3D1C7' }} />
                <YAxis
                  tickFormatter={(v) => `${v}h`}
                  tick={{ fontSize: 11, fill: '#656B82' }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  domain={[0, 'dataMax + 4']}
                />
                <Tooltip
                  formatter={(value) => `${Number(value).toFixed(1)}h`}
                  contentStyle={{ borderColor: '#D3D1C7', borderRadius: 4, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine y={35} stroke={COLOR.flag} strokeDasharray="4 4" label={{ value: '35h', position: 'right', fill: COLOR.flag, fontSize: 11 }} />
                <ReferenceLine y={40} stroke={COLOR.brick} strokeDasharray="4 4" label={{ value: '40h', position: 'right', fill: COLOR.brick, fontSize: 11 }} />
                {trendCandidates.map((candidate, i) => {
                  const name = candidate.staff.name.split(' ')[0]
                  const color = LINE_COLORS[i % LINE_COLORS.length]
                  return (
                    <Line
                      key={candidate.staff.id}
                      type="monotone"
                      dataKey={name}
                      name={name}
                      stroke={color}
                      strokeWidth={2}
                      dot={trendDot(color)}
                      activeDot={{ r: 4 }}
                    />
                  )
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <div className="flex flex-col gap-3">
          {rows.map(({ staff, totalHours, dailyHours, maxStreak }) => {
            const pctOf48 = Math.min(100, (totalHours / 48) * 100)
            const overWarning = totalHours >= WEEKLY_WARNING
            const overReference = totalHours > WEEKLY_REFERENCE

            // §5: desired vs. actual, per staff member. A half-hour band counts as "on
            // target" rather than requiring an exact match — shifts land on the half hour,
            // so a literal zero-diff is rarer than a practically-equal week.
            const desired = staff.desiredWeeklyHours
            const diff = totalHours - desired
            const onTarget = Math.abs(diff) < 0.5
            const over = diff >= 0.5
            const desiredTone = onTarget ? 'moss' : over ? 'brick' : 'flag'
            const desiredLabel = onTarget
              ? 'on target'
              : over
                ? `+${formatHours(diff)} over`
                : `${formatHours(Math.abs(diff))} under`

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

                <Badge tone={desiredTone}>
                  {formatHours(totalHours)} worked / {formatHours(desired)} desired — {desiredLabel}
                </Badge>

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
          {overtimeQuery.data && (
            <PaginationControl
              page={overtimeQuery.data.page}
              totalPages={overtimeQuery.data.totalPages}
              totalItems={overtimeQuery.data.totalItems}
              onPageChange={setOvertimePage}
            />
          )}
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
