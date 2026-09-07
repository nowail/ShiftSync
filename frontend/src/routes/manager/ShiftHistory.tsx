import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Search } from 'lucide-react'
import { getAuditLog } from '../../services/audit'
import { useSessionStore } from '../../store/session'
import { Input } from '../../components/ui/Input'
import { Table } from '../../components/ui/Table'
import { LoadingState, ErrorState, EmptyState } from '../../components/shared/States'

export function ShiftHistory() {
  const activeLocationId = useSessionStore((s) => s.activeLocationId)
  const [query, setQuery] = useState('')

  const auditQuery = useQuery({
    queryKey: ['audit', 'shift-history', activeLocationId, query],
    queryFn: () => getAuditLog({ locationId: activeLocationId ?? undefined, query: query || undefined }),
  })

  const relevant = (auditQuery.data ?? []).filter((r) => r.entity === 'shift' || r.entity === 'week')

  return (
    <div className="flex flex-col gap-5 px-4 sm:px-6">
      <div>
        <h1 className="font-display text-display-lg text-ink">Shift history</h1>
        <p className="text-body-sm text-slate-600">Every assignment change for this location.</p>
      </div>

      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input placeholder="Search history…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
      </div>

      {auditQuery.isLoading && <LoadingState label="Loading history…" />}
      {auditQuery.isError && <ErrorState message="Couldn't load shift history." onRetry={() => auditQuery.refetch()} />}
      {auditQuery.data && relevant.length === 0 && (
        <EmptyState title="No history yet" body="Changes to shifts and published weeks will show up here." />
      )}
      {relevant.length > 0 && (
        <Table
          rowKey={(r) => r.id}
          rows={relevant}
          columns={[
            { header: 'When', render: (r) => format(parseISO(r.at), 'MMM d, h:mma') },
            { header: 'Who', render: (r) => r.actorName },
            { header: 'Change', render: (r) => r.action.replaceAll('_', ' ') },
            { header: 'Details', render: (r) => <span className="text-slate-600">{r.details}</span> },
          ]}
        />
      )}
    </div>
  )
}
