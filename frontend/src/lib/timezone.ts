import { fromZonedTime, formatInTimeZone } from 'date-fns-tz'

/** Build a UTC ISO string from a location-local wall-clock date + time. */
export function zonedWallTimeToUtcIso(localDateIso: string, hhmm: string, timezone: string): string {
  const naive = `${localDateIso}T${hhmm}:00`
  return fromZonedTime(naive, timezone).toISOString()
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
