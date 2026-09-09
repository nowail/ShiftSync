// Pure, admin-screen-only derived stats. Consumes existing mock data shapes as-is —
// nothing here changes what the services return, it just aggregates it differently
// than the per-staff fairness table and per-location week summary already do.
import { format, startOfWeek } from 'date-fns'
import type { AuditEntry, Location } from '../types'

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
