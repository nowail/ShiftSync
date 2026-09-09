import { addDays, format, parseISO } from 'date-fns'
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz'

/** Build a UTC ISO string from a location-local wall-clock date + time. */
export function zonedWallTimeToUtcIso(localDateIso: string, hhmm: string, timezone: string): string {
  const naive = `${localDateIso}T${hhmm}:00`
  return fromZonedTime(naive, timezone).toISOString()
}

/**
 * Resolves a shift-form's date + start/end wall-clock times into UTC instants, handling
 * the overnight case (end time <= start time means the shift ends the next calendar day)
 * the same way the seed data's own overnight shift is built. Shared by the Create and Edit
 * Shift forms so the rollover logic only exists in one place.
 */
export function resolveShiftWallTimes(
  date: string,
  startTime: string,
  endTime: string,
  timezone: string,
): { startUtc: string; endUtc: string; overnight: boolean } {
  const overnight = startTime !== '' && endTime !== '' && endTime <= startTime
  const endDate = overnight ? format(addDays(parseISO(date), 1), 'yyyy-MM-dd') : date
  return {
    startUtc: zonedWallTimeToUtcIso(date, startTime, timezone),
    endUtc: zonedWallTimeToUtcIso(endDate, endTime, timezone),
    overnight,
  }
}

export function formatTimeInZone(utcIso: string, timezone: string): string {
  return formatInTimeZone(new Date(utcIso), timezone, 'h:mmaaa').toLowerCase()
}

export function formatDateInZone(utcIso: string, timezone: string, pattern = 'EEE MMM d'): string {
  return formatInTimeZone(new Date(utcIso), timezone, pattern)
}

export function timezoneAbbrev(utcIso: string, timezone: string): string {
  return formatInTimeZone(new Date(utcIso), timezone, 'zzz')
}

export function localDateKey(utcIso: string, timezone: string): string {
  return formatInTimeZone(new Date(utcIso), timezone, 'yyyy-MM-dd')
}
