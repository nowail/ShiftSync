import { apiRequest, apiRequestText } from '../lib/apiClient'
import type { AuditEntry, Paginated } from '../types'

export interface AuditFilters {
  actorId?: string
  entity?: string
  entityId?: string
  locationId?: string
  from?: string // ISO date
  to?: string // ISO date
  query?: string
}

export interface AuditPage {
  page?: number
  pageSize?: number
}

function toQueryString(filters: AuditFilters, page: AuditPage = {}): string {
  const params = new URLSearchParams()
  if (filters.actorId) params.set('actorId', filters.actorId)
  if (filters.entity) params.set('entity', filters.entity)
  if (filters.entityId) params.set('entityId', filters.entityId)
  if (filters.locationId) params.set('locationId', filters.locationId)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.query) params.set('query', filters.query)
  if (page.page) params.set('page', String(page.page))
  if (page.pageSize) params.set('pageSize', String(page.pageSize))
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export async function getAuditLog(filters: AuditFilters = {}, page: AuditPage = {}): Promise<Paginated<AuditEntry>> {
  return apiRequest<Paginated<AuditEntry>>(`/audit${toQueryString(filters, page)}`)
}

// Exports aren't paginated — a CSV export should contain every row matching the filters,
// not just one page of them.
export async function exportAuditLogCsv(filters: AuditFilters = {}): Promise<string> {
  return apiRequestText(`/audit/export${toQueryString(filters)}`)
}
