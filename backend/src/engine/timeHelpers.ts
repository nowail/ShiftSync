import { formatInTimeZone } from 'date-fns-tz'
import { addDays, format, parseISO } from 'date-fns'

export function localDateKey(instant: Date, timezone: string): string {
  return formatInTimeZone(instant, timezone, 'yyyy-MM-dd')
}

export function localTimeOfDay(instant: Date, timezone: string): string {
  return formatInTimeZone(instant, timezone, 'HH:mm')
}

export function localDayOfWeek(instant: Date, timezone: string): number {
  // date-fns-tz has no direct "day of week in zone" formatter token, but 'i' (ISO day,
  // 1-7 Mon-Sun) is stable and easy to remap to the app's 0=Sunday convention used
  // everywhere else (AvailabilityRule.dayOfWeek, the frontend's Availability screen).
  const iso = Number(formatInTimeZone(instant, timezone, 'i'))
  return iso % 7 // ISO 7 (Sunday) -> 0, ISO 1-6 (Mon-Sat) -> 1-6
}

export function hoursBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60)
}

export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd
}

/** Per-calendar-day streak ending at (and including) `dateKey`, given the set of every
 *  local-calendar-date key a staff member has worked. Shared by the engine's
 *  checkConsecutiveDays (a single prospective day) and the Phase 6 overtime dashboard's
 *  retrospective per-staff summary (every day in a whole week) — one counting rule, not
 *  reimplemented per caller. */
export function consecutiveDayStreak(workedDayKeys: ReadonlySet<string>, dateKey: string): number {
  let streak = 0
  let cursor = parseISO(dateKey)
  while (workedDayKeys.has(format(cursor, 'yyyy-MM-dd'))) {
    streak++
    cursor = addDays(cursor, -1)
  }
  return streak
}

/** Fri/Sat shifts starting at or after 5pm, in the shift's own location-local time — the
 *  BACKEND_PROMPT Phase 6 premium-shift rule, computed fresh at read (and write) time
 *  rather than trusted from a client-settable stored flag. 0=Sunday convention, matching
 *  localDayOfWeek and every other day-of-week value in this app. */
export function isPremiumShift(startsAt: Date, timezone: string): boolean {
  const dow = localDayOfWeek(startsAt, timezone)
  const isFriOrSat = dow === 5 || dow === 6
  return isFriOrSat && localTimeOfDay(startsAt, timezone) >= '17:00'
}
