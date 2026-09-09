import { apiRequest } from '../lib/apiClient'

export interface OvertimeRow {
  staffId: string
  totalHours: number
  dailyHours: { date: string; hours: number }[]
  maxConsecutiveDays: number
  overtimeCost: number
}

export interface OvertimeSummary {
  rows: OvertimeRow[]
  projectedWeeklyCost: number
}

export async function getOvertimeSummary(locationId: string, weekStart: string): Promise<OvertimeSummary> {
  return apiRequest<OvertimeSummary>(`/overtime?locationId=${encodeURIComponent(locationId)}&weekStart=${encodeURIComponent(weekStart)}`)
}
