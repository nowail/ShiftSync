// Pure, admin-screen-only derived stats. Consumes existing mock data shapes as-is —
// nothing here changes what the services return, it just aggregates it differently
// than the per-staff fairness table and per-location week summary already do.
import { format, startOfWeek } from 'date-fns'
import { shiftHours } from './rules'
import type { AuditEntry, Location, Shift } from '../types'

export interface LocationFairness {
  location: Location
  totalHours: number
  premiumCount: number
  hoursShare: number
  premiumShare: number
  score: number
}

/**
 * Location-level analogue of the per-staff fairness score: a location's share of the
 * company's premium shifts divided by its share of the company's total hours worked.
 * ~1.0 means premium shifts track hours worked proportionally for that location.
 */
export function computeLocationFairness(shifts: Shift[], locations: Location[]): LocationFairness[] {
  const assigned = shifts.filter((s) => s.assignedStaffId)
  const totalHoursAll = assigned.reduce((sum, s) => sum + shiftHours(s), 0)
  const totalPremiumAll = assigned.filter((s) => s.isPremium).length

  return locations.map((location) => {
    const mine = assigned.filter((s) => s.locationId === location.id)
    const totalHours = mine.reduce((sum, s) => sum + shiftHours(s), 0)
    const premiumCount = mine.filter((s) => s.isPremium).length
    const hoursShare = totalHoursAll > 0 ? totalHours / totalHoursAll : 0
    const premiumShare = totalPremiumAll > 0 ? premiumCount / totalPremiumAll : 0
    const score = hoursShare > 0 ? premiumShare / hoursShare : premiumShare > 0 ? Infinity : 0
    return { location, totalHours, premiumCount, hoursShare, premiumShare, score }
  })
}

export interface AuditWeekStats {
  totalThisWeek: number
  mostActiveLocation: { location: Location; count: number } | null
  mostCommonAction: { action: string; count: number } | null
}

export function computeAuditWeekStats(entries: AuditEntry[], locations: Location[]): AuditWeekStats {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 })
  const thisWeek = entries.filter((e) => new Date(e.at) >= weekStart)

  const byLocation = new Map<string, number>()
  const byAction = new Map<string, number>()
  for (const entry of thisWeek) {
    byLocation.set(entry.locationId, (byLocation.get(entry.locationId) ?? 0) + 1)
    byAction.set(entry.action, (byAction.get(entry.action) ?? 0) + 1)
  }

  const topLocationEntry = [...byLocation.entries()].sort((a, b) => b[1] - a[1])[0]
  const topActionEntry = [...byAction.entries()].sort((a, b) => b[1] - a[1])[0]
  const topLocation = topLocationEntry ? locations.find((l) => l.id === topLocationEntry[0]) : undefined

  return {
    totalThisWeek: thisWeek.length,
    mostActiveLocation: topLocation && topLocationEntry ? { location: topLocation, count: topLocationEntry[1] } : null,
    mostCommonAction: topActionEntry ? { action: topActionEntry[0], count: topActionEntry[1] } : null,
  }
}

export interface AuditDayCount {
  date: string // yyyy-MM-dd
  label: string // e.g. "Sep 6"
  count: number
}

/** Actions per calendar day across whatever entries are currently visible (post-filter). */
export function computeActionsPerDay(entries: AuditEntry[]): AuditDayCount[] {
  const byDay = new Map<string, number>()
  for (const entry of entries) {
    const key = format(new Date(entry.at), 'yyyy-MM-dd')
    byDay.set(key, (byDay.get(key) ?? 0) + 1)
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, label: format(new Date(date), 'MMM d'), count }))
}
