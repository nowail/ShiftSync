import { apiRequest } from '../lib/apiClient'
import type { FairnessRow } from '../types'

export async function getFairnessRows(weekStart: string, locationId?: string): Promise<FairnessRow[]> {
  const params = new URLSearchParams({ weekStart })
  if (locationId) params.set('locationId', locationId)
  return apiRequest<FairnessRow[]>(`/fairness?${params.toString()}`)
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
