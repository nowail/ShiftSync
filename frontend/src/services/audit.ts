import { apiRequest, apiRequestText } from '../lib/apiClient'
import type { AuditEntry } from '../types'

export interface AuditFilters {
  actorId?: string
  entity?: string
  locationId?: string
  from?: string // ISO date
  to?: string // ISO date
  query?: string
}

function toQueryString(filters: AuditFilters): string {
  const params = new URLSearchParams()
  if (filters.actorId) params.set('actorId', filters.actorId)
  if (filters.entity) params.set('entity', filters.entity)
  if (filters.locationId) params.set('locationId', filters.locationId)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.query) params.set('query', filters.query)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export async function getAuditLog(filters: AuditFilters = {}): Promise<AuditEntry[]> {
  return apiRequest<AuditEntry[]>(`/audit${toQueryString(filters)}`)
}

export async function exportAuditLogCsv(filters: AuditFilters = {}): Promise<string> {
  return apiRequestText(`/audit/export${toQueryString(filters)}`)
}
