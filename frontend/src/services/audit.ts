import { db, nextDbId } from '../lib/db'
import { withMockLatency } from '../lib/delay'
import type { AuditEntry } from '../types'

export interface AuditFilters {
  actorId?: string
  entity?: string
  locationId?: string
  from?: string // ISO date
  to?: string // ISO date
  query?: string
}

export async function getAuditLog(filters: AuditFilters = {}): Promise<AuditEntry[]> {
  return withMockLatency(() => {
    return db.audit
      .filter((entry) => (filters.actorId ? entry.actorId === filters.actorId : true))
      .filter((entry) => (filters.entity ? entry.entity === filters.entity : true))
      .filter((entry) => (filters.locationId ? entry.locationId === filters.locationId : true))
      .filter((entry) => (filters.from ? entry.at >= filters.from : true))
      .filter((entry) => (filters.to ? entry.at <= filters.to : true))
      .filter((entry) =>
        filters.query
          ? `${entry.actorName} ${entry.action} ${entry.entity} ${entry.details ?? ''}`
              .toLowerCase()
              .includes(filters.query.toLowerCase())
          : true,
      )
      .sort((a, b) => (a.at < b.at ? 1 : -1))
  })
}

export function pushAudit(entry: Omit<AuditEntry, 'id' | 'at'>): AuditEntry {
  const full: AuditEntry = { ...entry, id: nextDbId('audit'), at: new Date().toISOString() }
  db.audit.unshift(full)
  return full
}

export async function exportAuditLogCsv(filters: AuditFilters = {}): Promise<string> {
  const rows = await getAuditLog(filters)
  const header = 'id,actor,action,entity,entityId,locationId,at,details'
  const lines = rows.map((r) =>
    [r.id, r.actorName, r.action, r.entity, r.entityId, r.locationId, r.at, r.details ?? '']
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  )
  return [header, ...lines].join('\n')
}
