import { apiRequest } from '../lib/apiClient'
import type { FairnessRow, Paginated } from '../types'

export type FairnessSortKey = Exclude<keyof FairnessRow, 'staffId'>

export interface FairnessQuery {
  weekStart: string
  locationId?: string
  page?: number
  sortKey?: FairnessSortKey
  sortDir?: 'asc' | 'desc'
}

// Sorted server-side, before pagination — the table's column-sort has to reorder the
// whole result, not just whichever 10 rows are on the current page.
export async function getFairnessRows({ weekStart, locationId, page = 1, sortKey, sortDir }: FairnessQuery): Promise<Paginated<FairnessRow>> {
  const params = new URLSearchParams({ weekStart, page: String(page) })
  if (locationId) params.set('locationId', locationId)
  if (sortKey) params.set('sortKey', sortKey)
  if (sortDir) params.set('sortDir', sortDir)
  return apiRequest<Paginated<FairnessRow>>(`/fairness?${params.toString()}`)
}

export interface LocationFairnessRow {
  locationId: string
  totalHours: number
  premiumCount: number
  hoursShare: number
  premiumShare: number
  score: number
}

export async function getLocationFairnessRows(weekStart: string): Promise<LocationFairnessRow[]> {
  return apiRequest<LocationFairnessRow[]>(`/fairness/locations?weekStart=${encodeURIComponent(weekStart)}`)
}
