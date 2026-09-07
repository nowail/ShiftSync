import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { getLocations } from '../../services/locations'
import { getStaff } from '../../services/staff'
import { getShiftsForWeekAllLocations } from '../../services/shifts'
import { computeFairnessRows } from '../../lib/rules'
import { CURRENT_WEEK_START_KEY } from '../../lib/weeks'
import { formatHours } from '../../lib/format'
import { LoadingState, ErrorState, EmptyState } from '../../components/shared/States'
import { Select } from '../../components/ui/Select'
import { Avatar } from '../../components/shared/Avatar'
import { Badge } from '../../components/ui/Badge'
import type { FairnessRow } from '../../types'

type SortKey = Exclude<keyof FairnessRow, 'staffId'>

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
    <div className="flex flex-col gap-5 px-6">
      <div>
        <h1 className="font-display text-display-lg text-ink">Fairness & distribution</h1>
        <p className="text-body-sm text-slate-600">
          Premium-shift share relative to hours worked, current week, across Coastal Eats.
        </p>
      </div>

      <Select
        label="Location"
        value={locationFilter}
        onChange={(e) => setLocationFilter(e.target.value)}
        className="max-w-xs"
      >
        <option value="all">All locations</option>
        {locationsQuery.data?.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </Select>

      {isLoading && <LoadingState label="Crunching fairness data…" />}
      {isError && <ErrorState message="Couldn't load the fairness report." />}
      {!isLoading && !isError && rows.length === 0 && (
        <EmptyState title="No scheduled hours yet" body="Once shifts are assigned this week, fairness data will show up here." />
      )}

      {!isLoading && !isError && rows.length > 0 && (
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
                <tr key={row.staffId} className="border-b border-slate-100 last:border-0 hover:bg-slate-100/40">
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
                    <Badge tone={row.fairnessScore > 1.3 ? 'amber' : row.fairnessScore < 0.7 ? 'flag' : 'slate'}>
                      {row.fairnessScore === Infinity ? '∞' : row.fairnessScore.toFixed(2)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
