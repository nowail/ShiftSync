import { apiRequest } from '../lib/apiClient'
import type { Paginated } from '../types'

export interface OvertimeRow {
  staffId: string
  totalHours: number
  dailyHours: { date: string; hours: number }[]
  maxConsecutiveDays: number
  overtimeCost: number
}

// projectedWeeklyCost is a location-wide total (computed from every staff member, not
// just the current page) attached alongside the standard pagination envelope.
export type OvertimeSummary = Paginated<OvertimeRow> & { projectedWeeklyCost: number }

export async function getOvertimeSummary(locationId: string, weekStart: string, page = 1): Promise<OvertimeSummary> {
  return apiRequest<OvertimeSummary>(
    `/overtime?locationId=${encodeURIComponent(locationId)}&weekStart=${encodeURIComponent(weekStart)}&page=${page}`,
  )
}
