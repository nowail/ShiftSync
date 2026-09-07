import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Scale, TrendingDown, TrendingUp } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getLocations } from '../../services/locations'
import { getStaff } from '../../services/staff'
import { getShiftsForWeekAllLocations } from '../../services/shifts'
import { computeFairnessRows } from '../../lib/rules'
import { computeLocationFairness } from '../../lib/adminStats'
import { CURRENT_WEEK_START_KEY } from '../../lib/weeks'
import { formatHours } from '../../lib/format'
import { LoadingState, ErrorState, EmptyState } from '../../components/shared/States'
import { Tabs } from '../../components/ui/Tabs'
import { KpiStrip } from '../../components/admin/KpiStrip'
import { Avatar } from '../../components/shared/Avatar'
import { Badge } from '../../components/ui/Badge'
import type { FairnessRow } from '../../types'

type SortKey = Exclude<keyof FairnessRow, 'staffId'>

// Mirrors tailwind.config.ts — recharts renders SVG fills, so Tailwind classes don't apply.
const COLOR = { moss: '#3E7C6B', flag: '#B8842E', brick: '#C1473F', slate300: '#ABAFBB' }

function fairnessTone(score: number): 'moss' | 'flag' | 'brick' {
  const distance = Math.abs(score - 1)
  if (distance <= 0.15) return 'moss'
  if (distance <= 0.6) return 'flag'
  return 'brick'
}

const TONE_BAR_BG: Record<ReturnType<typeof fairnessTone>, string> = {
  moss: 'bg-moss',
  flag: 'bg-flag',
  brick: 'bg-brick',
}

function shortName(name: string): string {
  const [first, last] = name.split(' ')
  return last ? `${first} ${last[0]}.` : first
}

export function FairnessReport() {
  const [locationFilter, setLocationFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('fairnessScore')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const locationsQuery = useQuery({ queryKey: ['locations'], queryFn: getLocations })
  const staffQuery = useQuery({ queryKey: ['staff'], queryFn: getStaff })
  const shiftsQuery = useQuery({
    queryKey: ['shifts', 'week', CURRENT_WEEK_START_KEY, 'all'],
    queryFn: () => getShiftsForWeekAllLocations(CURRENT_WEEK_START_KEY),
  })

  const isLoading = locationsQuery.isLoading || staffQuery.isLoading || shiftsQuery.isLoading
  const isError = locationsQuery.isError || staffQuery.isError || shiftsQuery.isError

  const rows = useMemo(() => {
    if (!staffQuery.data || !shiftsQuery.data) return []
    const relevantStaff = staffQuery.data.filter((s) => s.role === 'staff')
    const shifts =
      locationFilter === 'all'
        ? shiftsQuery.data
        : shiftsQuery.data.filter((s) => s.locationId === locationFilter)
    const fairness = computeFairnessRows(
      shifts,
      relevantStaff.map((s) => s.id),
    )
    const merged = fairness
      .map((row) => ({ row, staff: relevantStaff.find((s) => s.id === row.staffId)! }))
      .filter((r) => r.row.totalShiftCount > 0)

    merged.sort((a, b) => {
      const av = a.row[sortKey]
      const bv = b.row[sortKey]
      const diff = (av === Infinity ? 999 : av) - (bv === Infinity ? 999 : bv)
      return sortDir === 'asc' ? diff : -diff
    })
    return merged
  }, [staffQuery.data, shiftsQuery.data, locationFilter, sortKey, sortDir])

  // Both bars are shares of the same company-wide pool (hours pool, premium-shift pool) so
  // they land on a comparable scale — unlike the table's fairnessScore, which divides a
  // per-person premium ratio by a pool-based hours share (kept as-is; it's the existing,
  // already-shipped metric). A taller premium bar than hours bar means "more than their
  // proportional share"; shorter means less — that's the at-a-glance signal this chart exists for.
  const chartData = useMemo(() => {
    const totalHoursAll = rows.reduce((sum, r) => sum + r.row.totalHours, 0)
    const totalPremiumAll = rows.reduce((sum, r) => sum + r.row.premiumShiftCount, 0)
    return rows.map(({ row, staff }) => {
      const hoursShare = totalHoursAll > 0 ? (row.totalHours / totalHoursAll) * 100 : 0
      const premiumShare = totalPremiumAll > 0 ? (row.premiumShiftCount / totalPremiumAll) * 100 : 0
      const ratio = hoursShare > 0 ? premiumShare / hoursShare : premiumShare > 0 ? Infinity : 1
      return { name: shortName(staff.name), fullName: staff.name, premiumShare, hoursShare, ratio }
    })
  }, [rows])

  // Ranked by each person's own premium-shift ratio (their personal "45% premium shifts"
  // stat); colored by the existing fairnessScore instead, since that's the one that already
  // accounts for how much they worked overall — a high premium % isn't inequitable on its
  // own if their hours share is proportionally high too.
  const rankedByPremiumShare = useMemo(() => {
    return rows
      .map(({ row, staff }) => ({
        staff,
        row,
        personalPremiumPct: row.totalShiftCount > 0 ? (row.premiumShiftCount / row.totalShiftCount) * 100 : 0,
      }))
      .sort((a, b) => b.personalPremiumPct - a.personalPremiumPct)
      .slice(0, 6)
  }, [rows])

  const locationFairness = useMemo(() => {
    if (!locationsQuery.data || !shiftsQuery.data) return []
    return computeLocationFairness(shiftsQuery.data, locationsQuery.data)
  }, [locationsQuery.data, shiftsQuery.data])

  const finiteFairness = locationFairness.filter((l) => Number.isFinite(l.score))
  const lowest = finiteFairness.length ? finiteFairness.reduce((a, b) => (a.score <= b.score ? a : b)) : null
  const highest = finiteFairness.length ? finiteFairness.reduce((a, b) => (a.score >= b.score ? a : b)) : null
  const average = finiteFairness.length
    ? finiteFairness.reduce((sum, l) => sum + l.score, 0) / finiteFairness.length
    : 0

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const columns: { key: SortKey; label: string }[] = [
    { key: 'totalHours', label: 'Hours this week' },
    { key: 'premiumShiftCount', label: 'Premium shifts' },
    { key: 'totalShiftCount', label: 'Total shifts' },
    { key: 'fairnessScore', label: 'Fairness score' },
  ]

  return (
    <div className="flex flex-col gap-6 px-6">
      <div>
        <h1 className="font-display text-display-lg text-ink">Fairness & distribution</h1>
        <p className="text-body-sm text-slate-600">
          Premium-shift share relative to hours worked, current week, across Coastal Eats.
        </p>
      </div>

      {isLoading && <LoadingState label="Crunching fairness data…" />}
      {isError && <ErrorState message="Couldn't load the fairness report." />}

      {!isLoading && !isError && (
        <>
          <KpiStrip
            stats={[
              {
                label: 'Lowest fairness score',
                value: lowest ? lowest.score.toFixed(2) : '—',
                icon: <TrendingDown size={16} />,
                tone: lowest ? 'brick' : 'ink',
                hint: lowest?.location.name,
              },
              {
                label: 'Highest fairness score',
                value: highest ? highest.score.toFixed(2) : '—',
                icon: <TrendingUp size={16} />,
                tone: highest ? 'amber' : 'ink',
                hint: highest?.location.name,
              },
              {
                label: 'Company average',
                value: average.toFixed(2),
                icon: <Scale size={16} />,
                hint: '1.00 = perfectly proportional',
              },
            ]}
          />

          <Tabs
            value={locationFilter}
            onChange={setLocationFilter}
            options={[
              { value: 'all', label: 'All locations' },
              ...(locationsQuery.data ?? []).map((l) => ({ value: l.id, label: l.name })),
            ]}
          />

          {rows.length === 0 ? (
            <EmptyState title="No scheduled hours yet" body="Once shifts are assigned this week, fairness data will show up here." />
          ) : (
            <>
              <div className="rounded-md border border-slate-200 p-4">
                <h2 className="mb-3 font-display text-display-sm text-ink">Ranked by premium-shift share</h2>
                <ol className="flex flex-col gap-3">
                  {rankedByPremiumShare.map((entry, i) => {
                    const tone = fairnessTone(entry.row.fairnessScore)
                    return (
                      <li key={entry.staff.id} className="flex items-center gap-3">
                        <span className="w-4 shrink-0 text-right text-body-sm font-semibold text-slate-400">
                          {i + 1}
                        </span>
                        <Avatar name={entry.staff.name} color={entry.staff.avatarColor} size={26} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-body-sm font-medium text-ink">{entry.staff.name}</span>
                            <Badge tone={tone}>{entry.personalPremiumPct.toFixed(0)}% premium shifts</Badge>
                          </div>
                          <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100">
                            <div
                              className={`h-1.5 rounded-full ${TONE_BAR_BG[tone]}`}
                              style={{ width: `${entry.personalPremiumPct}%` }}
                            />
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </div>

              <div className="rounded-md border border-slate-200 p-4">
                <div className="mb-1 flex items-center justify-between">
                  <h2 className="font-display text-display-sm text-ink">Premium share vs. hours share</h2>
                  <div className="flex flex-wrap items-center gap-3 text-body-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-3 rounded-sm" style={{ backgroundColor: COLOR.slate300 }} /> hours share
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLOR.moss }} /> balanced
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLOR.flag }} /> borderline
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLOR.brick }} /> inequitable premium share
                    </span>
                  </div>
                </div>
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer>
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="#E8E6DE" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: '#656B82' }}
                        tickLine={false}
                        axisLine={{ stroke: '#D3D1C7' }}
                      />
                      <YAxis
                        tickFormatter={(v) => `${v}%`}
                        tick={{ fontSize: 11, fill: '#656B82' }}
                        tickLine={false}
                        axisLine={false}
                        width={40}
                      />
                      <Tooltip
                        formatter={(value, key) => [
                          `${Number(value).toFixed(1)}%`,
                          key === 'premiumShare' ? 'Premium share' : 'Hours share',
                        ]}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ''}
                        contentStyle={{ borderColor: '#D3D1C7', borderRadius: 4, fontSize: 12 }}
                      />
                      <Bar dataKey="hoursShare" name="hoursShare" fill={COLOR.slate300} radius={[3, 3, 0, 0]} />
                      <Bar dataKey="premiumShare" name="premiumShare" radius={[3, 3, 0, 0]}>
                        {chartData.map((entry) => (
                          <Cell key={entry.fullName} fill={COLOR[fairnessTone(entry.ratio)]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="overflow-x-auto rounded-sm border border-slate-200">
                <table className="w-full min-w-[720px] border-collapse text-body-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100/60 text-left">
                      <th className="px-4 py-2.5 text-body-xs font-semibold text-slate-600">Staff</th>
                      {columns.map((col) => (
                        <th key={col.key} className="px-4 py-2.5 text-body-xs font-semibold text-slate-600">
                          <button className="flex items-center gap-1" onClick={() => toggleSort(col.key)}>
                            {col.label}
                            {sortKey === col.key &&
                              (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ row, staff }) => (
                      <tr
                        key={row.staffId}
                        className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-100/60"
                      >
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-2">
                            <Avatar name={staff.name} color={staff.avatarColor} size={24} />
                            {staff.name}
                          </span>
                        </td>
                        <td className="px-4 py-3">{formatHours(row.totalHours)}</td>
                        <td className="px-4 py-3">{row.premiumShiftCount}</td>
                        <td className="px-4 py-3">{row.totalShiftCount}</td>
                        <td className="px-4 py-3">
                          <Badge tone={fairnessTone(row.fairnessScore)}>
                            {row.fairnessScore === Infinity ? '∞' : row.fairnessScore.toFixed(2)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
