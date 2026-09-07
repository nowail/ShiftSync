import { addWeeks, format, startOfWeek } from 'date-fns'

export function weekStartKeyFor(date: Date): string {
  return format(startOfWeek(date, { weekStartsOn: 0 }), 'yyyy-MM-dd')
}

export const CURRENT_WEEK_START_KEY = weekStartKeyFor(new Date())
export const NEXT_WEEK_START_KEY = weekStartKeyFor(addWeeks(new Date(), 1))

export function weekLabel(weekStartKey: string): string {
  return weekStartKey
}
