import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, Download, MapPinned, Search, Zap } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getAuditLog, exportAuditLogCsv } from '../../services/audit'
import { getLocations } from '../../services/locations'
import { getStaff } from '../../services/staff'
import { computeAuditWeekStats, computeActionsPerDay } from '../../lib/adminStats'
import { LoadingState, ErrorState, EmptyState } from '../../components/shared/States'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Tabs } from '../../components/ui/Tabs'
import { KpiStrip } from '../../components/admin/KpiStrip'
import { ActionBadge, actionLabel } from '../../components/admin/ActionBadge'
import { Avatar } from '../../components/shared/Avatar'
import { format, parseISO } from 'date-fns'

const ENTITY_OPTIONS = ['shift', 'week', 'swap', 'staff', 'location']

export function AuditLog() {
  const [query, setQuery] = useState('')
  const [entity, setEntity] = useState('')
  const [locationId, setLocationId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const locationsQuery = useQuery({ queryKey: ['locations'], queryFn: getLocations })
  const staffQuery = useQuery({ queryKey: ['staff'], queryFn: getStaff })
  const auditQuery = useQuery({
    queryKey: ['audit', { query, entity, locationId, from, to }],
    queryFn: () =>
      getAuditLog({
        query: query || undefined,
        entity: entity || undefined,
        locationId: locationId || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(to).toISOString() : undefined,
      }),
  })

  const staffByName = useMemo(
    () => new Map((staffQuery.data ?? []).map((s) => [s.name, s])),
    [staffQuery.data],
  )
  const locationById = useMemo(
    () => new Map((locationsQuery.data ?? []).map((l) => [l.id, l])),
    [locationsQuery.data],
  )

  const weekStats = useMemo(() => {
    if (!auditQuery.data || !locationsQuery.data) return null
    return computeAuditWeekStats(auditQuery.data, locationsQuery.data)
  }, [auditQuery.data, locationsQuery.data])

  const dayCounts = useMemo(() => (auditQuery.data ? computeActionsPerDay(auditQuery.data) : []), [auditQuery.data])

  async function handleExport() {
    const csv = await exportAuditLogCsv({
      query: query || undefined,
      entity: entity || undefined,
      locationId: locationId || undefined,
    })
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `shiftsync-audit-log-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-6 px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-display-lg text-ink">Audit log</h1>
          <p className="text-body-sm text-slate-600">Every schedule, swap, and roster change across Coastal Eats.</p>
        </div>
        <Button variant="secondary" onClick={handleExport}>
          <Download size={16} /> Export CSV
        </Button>
      </div>

      {weekStats && (
        <KpiStrip
          stats={[
            {
              label: 'Actions this week',
              value: String(weekStats.totalThisWeek),
              icon: <Activity size={16} />,
            },
            {
              label: 'Most active location',
              value: weekStats.mostActiveLocation?.location.name ?? '—',
              icon: <MapPinned size={16} />,
              hint: weekStats.mostActiveLocation ? `${weekStats.mostActiveLocation.count} actions` : undefined,
            },
            {
              label: 'Most common action',
              value: weekStats.mostCommonAction ? actionLabel(weekStats.mostCommonAction.action) : '—',
              icon: <Zap size={16} />,
              hint: weekStats.mostCommonAction
                ? `${weekStats.mostCommonAction.count} time${weekStats.mostCommonAction.count === 1 ? '' : 's'}`
                : undefined,
            },
          ]}
        />
      )}

      <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-100/40 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="relative col-span-2 sm:col-span-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} className="bg-paper pl-8" />
          </div>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className="bg-paper" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" className="bg-paper" />
        </div>

        <div className="flex flex-col gap-2">
          <Tabs
            value={entity}
            onChange={setEntity}
            options={[{ value: '', label: 'All entities' }, ...ENTITY_OPTIONS.map((e) => ({ value: e, label: e }))]}
          />
          <Tabs
            value={locationId}
            onChange={setLocationId}
            options={[
              { value: '', label: 'All locations' },
              ...(locationsQuery.data ?? []).map((l) => ({ value: l.id, label: l.name })),
            ]}
          />
        </div>
      </div>

      {auditQuery.isLoading && <LoadingState label="Loading audit log…" />}
      {auditQuery.isError && <ErrorState message="Couldn't load the audit log." onRetry={() => auditQuery.refetch()} />}
      {auditQuery.data && auditQuery.data.length === 0 && (
        <EmptyState title="No matching audit entries" body="Try widening your filters or date range." />
      )}

      {auditQuery.data && auditQuery.data.length > 0 && (
        <>
          {dayCounts.length > 1 && (
            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-1 text-body-xs font-semibold uppercase tracking-normal text-slate-500">
                Actions per day (visible range)
              </p>
              <div style={{ width: '100%', height: 90 }}>
                <ResponsiveContainer>
                  <BarChart data={dayCounts} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#E8E6DE" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#656B82' }} tickLine={false} axisLine={{ stroke: '#D3D1C7' }} />
                    <YAxis hide allowDecimals={false} />
                    <Tooltip
                      formatter={(value) => [String(value), 'Actions']}
                      contentStyle={{ borderColor: '#D3D1C7', borderRadius: 4, fontSize: 12 }}
                    />
                    <Bar dataKey="count" fill="#1C2333" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-sm border border-slate-200">
            <table className="w-full min-w-[760px] border-collapse text-body-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/60 text-left">
                  <th className="px-4 py-2.5 text-body-xs font-semibold text-slate-600">When</th>
                  <th className="px-4 py-2.5 text-body-xs font-semibold text-slate-600">Actor</th>
                  <th className="px-4 py-2.5 text-body-xs font-semibold text-slate-600">Action</th>
                  <th className="px-4 py-2.5 text-body-xs font-semibold text-slate-600">Entity</th>
                  <th className="px-4 py-2.5 text-body-xs font-semibold text-slate-600">Location</th>
                  <th className="px-4 py-2.5 text-body-xs font-semibold text-slate-600">Details</th>
                </tr>
              </thead>
              <tbody>
                {auditQuery.data.map((entry) => {
                  const actor = staffByName.get(entry.actorName)
                  return (
                    <tr key={entry.id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-100/60">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {format(parseISO(entry.at), 'MMM d, h:mma')}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="flex items-center gap-2">
                          <Avatar name={entry.actorName} color={actor?.avatarColor ?? '#656B82'} size={22} />
                          {entry.actorName}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <ActionBadge action={entry.action} />
                      </td>
                      <td className="px-4 py-3 text-slate-600">{entry.entity}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {locationById.get(entry.locationId)?.name ?? entry.locationId}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{entry.details}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
