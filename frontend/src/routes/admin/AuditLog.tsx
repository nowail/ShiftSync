import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Search } from 'lucide-react'
import { getAuditLog, exportAuditLogCsv } from '../../services/audit'
import { getLocations } from '../../services/locations'
import { LoadingState, ErrorState, EmptyState } from '../../components/shared/States'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Button } from '../../components/ui/Button'
import { Table } from '../../components/ui/Table'
import { format, parseISO } from 'date-fns'

const ENTITY_OPTIONS = ['shift', 'week', 'swap', 'staff', 'location']

export function AuditLog() {
  const [query, setQuery] = useState('')
  const [entity, setEntity] = useState('')
  const [locationId, setLocationId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const locationsQuery = useQuery({ queryKey: ['locations'], queryFn: getLocations })
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
    <div className="flex flex-col gap-5 px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-display-lg text-ink">Audit log</h1>
          <p className="text-body-sm text-slate-600">Every schedule, swap, and roster change across Coastal Eats.</p>
        </div>
        <Button variant="secondary" onClick={handleExport}>
          <Download size={16} /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="relative col-span-2 sm:col-span-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="">All entities</option>
          {ENTITY_OPTIONS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </Select>
        <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">All locations</option>
          {locationsQuery.data?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
      </div>

      {auditQuery.isLoading && <LoadingState label="Loading audit log…" />}
      {auditQuery.isError && <ErrorState message="Couldn't load the audit log." onRetry={() => auditQuery.refetch()} />}
      {auditQuery.data && auditQuery.data.length === 0 && (
        <EmptyState title="No matching audit entries" body="Try widening your filters or date range." />
      )}
      {auditQuery.data && auditQuery.data.length > 0 && (
        <Table
          rowKey={(row) => row.id}
          rows={auditQuery.data}
          columns={[
            { header: 'When', render: (r) => format(parseISO(r.at), 'MMM d, h:mma') },
            { header: 'Actor', render: (r) => r.actorName },
            { header: 'Action', render: (r) => r.action.replaceAll('_', ' ') },
            { header: 'Entity', render: (r) => r.entity },
            {
              header: 'Location',
              render: (r) => locationsQuery.data?.find((l) => l.id === r.locationId)?.name ?? r.locationId,
            },
            { header: 'Details', render: (r) => <span className="text-slate-600">{r.details}</span> },
          ]}
        />
      )}
    </div>
  )
}
