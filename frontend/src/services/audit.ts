import { db, nextDbId } from '../lib/db'
import { apiRequest } from '../lib/apiClient'
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
  const params = new URLSearchParams()
  if (filters.actorId) params.set('actorId', filters.actorId)
  if (filters.entity) params.set('entity', filters.entity)
  if (filters.locationId) params.set('locationId', filters.locationId)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.query) params.set('query', filters.query)
  const qs = params.toString()
  return apiRequest<AuditEntry[]>(`/audit${qs ? `?${qs}` : ''}`)
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
