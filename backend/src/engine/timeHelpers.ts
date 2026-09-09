import { formatInTimeZone } from 'date-fns-tz'

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
