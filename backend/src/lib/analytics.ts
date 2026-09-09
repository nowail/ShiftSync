import { formatInTimeZone } from 'date-fns-tz'
import { prisma } from './prisma'
import { weekStartKeyForDateString } from './shiftSeats'
import { hoursBetween, localDateKey, consecutiveDayStreak, isPremiumShift } from '../engine/timeHelpers'
import { WEEKLY_REFERENCE_HOURS } from '../engine/rules'

// The mock's estimate (frontend lib/rules.ts: MOCK_HOURLY_RATE / OVERTIME_MULTIPLIER) —
// no real wage data exists anywhere in the schema, so this is the same documented
// placeholder rate carried over verbatim, not a new decision.
const MOCK_HOURLY_RATE = 19
const OVERTIME_MULTIPLIER = 1.5

export function overtimeHours(totalHours: number): number {
  return Math.max(0, totalHours - WEEKLY_REFERENCE_HOURS)
}

export function estimateOvertimeCost(totalHours: number): number {
  return overtimeHours(totalHours) * MOCK_HOURLY_RATE * OVERTIME_MULTIPLIER
}

interface WeekWindowShift {
  id: string
  locationId: string
  startsAt: Date
  endsAt: Date
}

/**
 * Same two-step pattern as resolveShiftIdsForWeek (shiftSeats.ts): fetch a UTC window wide
 * enough to cover every timezone's version of the target week, then filter precisely by
 * each shift's own location-local weekStart — one place both callers below share instead
 * of two copies of the same off-by-a-timezone bug waiting to happen.
 */
async function shiftsInWeek(weekStart: string, locationId?: string): Promise<WeekWindowShift[]> {
  const startWindow = new Date(new Date(weekStart).getTime() - 24 * 3600 * 1000)
  const endWindow = new Date(startWindow.getTime() + 9 * 24 * 3600 * 1000)

  const shifts = await prisma.shift.findMany({
    where: { ...(locationId ? { locationId } : {}), startsAt: { gte: startWindow, lt: endWindow } },
    select: { id: true, locationId: true, startsAt: true, endsAt: true },
  })
  if (shifts.length === 0) return []

  const locationIds = Array.from(new Set(shifts.map((s) => s.locationId)))
  const locations = await prisma.location.findMany({ where: { id: { in: locationIds } } })
  const timezoneByLocation = new Map(locations.map((l) => [l.id, l.timezone]))

  return shifts.filter((s) => {
    const timezone = timezoneByLocation.get(s.locationId)!
    const date = formatInTimeZone(s.startsAt, timezone, 'yyyy-MM-dd')
    return weekStartKeyForDateString(date) === weekStart
  })
}

export interface OvertimeRow {
  staffId: string
  totalHours: number
  dailyHours: { date: string; hours: number }[]
  maxConsecutiveDays: number
  overtimeCost: number
}

/**
 * Retrospective per-staff summary for one location's week — "hours so far" and "which
 * days are pushing someone into overtime," built directly on the engine's own hour/streak
 * primitives (hoursBetween, consecutiveDayStreak) rather than a separate reimplementation.
 * Deliberately scoped to just this week's shifts for the streak count, matching the
 * frontend's existing `consecutiveDaysIncluding` behavior exactly (it only ever saw one
 * week of data too) — extending the streak lookback across week boundaries would produce
 * different numbers than what this screen has always shown.
 *
 * Returns one row per given staffId — including a zero-value row for anyone with no
 * assignments that week — matching the frontend's previous behavior of listing every
 * staff member certified at the location regardless of hours worked (and consistent with
 * how computeFairnessRows below handles the same "not everyone has hours" case).
 */
export async function computeOvertimeRows(locationId: string, weekStart: string, staffIds: string[]): Promise<OvertimeRow[]> {
  const shifts = await shiftsInWeek(weekStart, locationId)
  const location = await prisma.location.findUniqueOrThrow({ where: { id: locationId } })

  const assignments =
    shifts.length > 0
      ? await prisma.assignment.findMany({
          where: { shiftId: { in: shifts.map((s) => s.id) }, status: 'active' },
          select: { staffId: true, shiftId: true },
        })
      : []

  const shiftById = new Map(shifts.map((s) => [s.id, s]))
  const byStaff = new Map<string, WeekWindowShift[]>()
  for (const a of assignments) {
    const shift = shiftById.get(a.shiftId)
    if (!shift) continue
    const list = byStaff.get(a.staffId) ?? []
    list.push(shift)
    byStaff.set(a.staffId, list)
  }

  return staffIds.map((staffId) => {
    const staffShifts = byStaff.get(staffId) ?? []
    const dailyMap = new Map<string, number>()
    for (const s of staffShifts) {
      const dateKey = localDateKey(s.startsAt, location.timezone)
      dailyMap.set(dateKey, (dailyMap.get(dateKey) ?? 0) + hoursBetween(s.startsAt, s.endsAt))
    }
    const workedDayKeys = new Set(dailyMap.keys())
    const maxConsecutiveDays = Math.max(0, ...Array.from(workedDayKeys).map((k) => consecutiveDayStreak(workedDayKeys, k)))
    const totalHours = Array.from(dailyMap.values()).reduce((sum, h) => sum + h, 0)

    return {
      staffId,
      totalHours,
      dailyHours: Array.from(dailyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, hours]) => ({ date, hours })),
      maxConsecutiveDays,
      overtimeCost: estimateOvertimeCost(totalHours),
    }
  })
}

export interface FairnessRow {
  staffId: string
  totalHours: number
  premiumShiftCount: number
  totalShiftCount: number
  fairnessScore: number
}

/**
 * Per-staff premium-shift-share ÷ hours-share, computed identically to the frontend's
 * (already-shipped) `computeFairnessRows` in lib/rules.ts: `fairnessScore` divides a
 * staff member's OWN premium-shift ratio (their premium shifts ÷ their total shifts) by
 * their share of the pool's total hours — not "pool premium-hours-share ÷ pool
 * hours-share" the way BACKEND_PROMPT's prose reads in isolation. Matching the existing,
 * already-visualized metric exactly (per the explicit "slot into the same UI" mandate)
 * took precedence over the abstract phrasing. `isPremium` here is the same query-level
 * Fri/Sat->=5pm derivation shiftSeats.ts uses for the wire response — never the stored
 * column. totalHoursAll is scoped to whatever `locationId` narrows the shift set to
 * (company-wide if omitted), matching the frontend's behavior of computing the pool
 * total from whatever shift set was already location-filtered before being handed to it.
 */
export async function computeFairnessRows(weekStart: string, staffIds: string[], locationId?: string): Promise<FairnessRow[]> {
  const shifts = await shiftsInWeek(weekStart, locationId)
  if (shifts.length === 0) return staffIds.map((staffId) => ({ staffId, totalHours: 0, premiumShiftCount: 0, totalShiftCount: 0, fairnessScore: 0 }))

  const locationIds = Array.from(new Set(shifts.map((s) => s.locationId)))
  const locations = await prisma.location.findMany({ where: { id: { in: locationIds } } })
  const timezoneByLocation = new Map(locations.map((l) => [l.id, l.timezone]))

  const assignments = await prisma.assignment.findMany({
    where: { shiftId: { in: shifts.map((s) => s.id) }, status: 'active' },
    select: { staffId: true, shiftId: true },
  })

  const shiftById = new Map(shifts.map((s) => [s.id, s]))
  const isPremiumById = new Map(
    shifts.map((s) => [s.id, isPremiumShift(s.startsAt, timezoneByLocation.get(s.locationId)!)]),
  )

  const totalHoursAll = assignments.reduce((sum, a) => {
    const shift = shiftById.get(a.shiftId)
    return shift ? sum + hoursBetween(shift.startsAt, shift.endsAt) : sum
  }, 0)

  const byStaff = new Map<string, { hours: number; premium: number; total: number }>()
  for (const a of assignments) {
    const shift = shiftById.get(a.shiftId)
    if (!shift) continue
    const entry = byStaff.get(a.staffId) ?? { hours: 0, premium: 0, total: 0 }
    entry.hours += hoursBetween(shift.startsAt, shift.endsAt)
    entry.total += 1
    if (isPremiumById.get(a.shiftId)) entry.premium += 1
    byStaff.set(a.staffId, entry)
  }

  return staffIds.map((staffId) => {
    const mine = byStaff.get(staffId) ?? { hours: 0, premium: 0, total: 0 }
    const premiumShare = mine.total > 0 ? mine.premium / mine.total : 0
    const hoursShare = totalHoursAll > 0 ? mine.hours / totalHoursAll : 0
    const fairnessScore = hoursShare > 0 ? premiumShare / hoursShare : premiumShare > 0 ? Infinity : 0
    return { staffId, totalHours: mine.hours, premiumShiftCount: mine.premium, totalShiftCount: mine.total, fairnessScore }
  })
}

export interface LocationFairnessRow {
  locationId: string
  totalHours: number
  premiumCount: number
  hoursShare: number
  premiumShare: number
  score: number
}

/**
 * Location-level analogue of computeFairnessRows above, ported from the frontend's
 * computeLocationFairness (lib/adminStats.ts) — the actual source of the Fairness
 * screen's KPI strip (Lowest/Highest/Company average), NOT computeFairnessRows'
 * per-staff table column. Structurally different from that per-staff formula: both
 * `premiumShare` and `hoursShare` here are pool shares (a location's share of the
 * company's premium-shift COUNT, divided by its share of company hours) — not a
 * personal ratio divided by a pool share — which is why this metric's scale sits much
 * closer to 1.0 than the per-staff fairnessScore does. Always company-wide (every
 * location, not filtered), matching the frontend's prior behavior of always computing
 * this from the full, unfiltered shift set regardless of the table's location tab.
 */
export async function computeLocationFairnessRows(weekStart: string): Promise<LocationFairnessRow[]> {
  const locations = await prisma.location.findMany({ select: { id: true } })
  const shifts = await shiftsInWeek(weekStart)
  if (shifts.length === 0) {
    return locations.map((l) => ({ locationId: l.id, totalHours: 0, premiumCount: 0, hoursShare: 0, premiumShare: 0, score: 0 }))
  }

  const locationIds = Array.from(new Set(shifts.map((s) => s.locationId)))
  const timezoneRows = await prisma.location.findMany({ where: { id: { in: locationIds } } })
  const timezoneByLocation = new Map(timezoneRows.map((l) => [l.id, l.timezone]))

  const assignments = await prisma.assignment.findMany({
    where: { shiftId: { in: shifts.map((s) => s.id) }, status: 'active' },
    select: { staffId: true, shiftId: true },
  })

  const shiftById = new Map(shifts.map((s) => [s.id, s]))
  const isPremiumById = new Map(
    shifts.map((s) => [s.id, isPremiumShift(s.startsAt, timezoneByLocation.get(s.locationId)!)]),
  )

  const totalHoursAll = assignments.reduce((sum, a) => {
    const shift = shiftById.get(a.shiftId)
    return shift ? sum + hoursBetween(shift.startsAt, shift.endsAt) : sum
  }, 0)
  const totalPremiumAll = assignments.reduce((sum, a) => sum + (isPremiumById.get(a.shiftId) ? 1 : 0), 0)

  const byLocation = new Map<string, { hours: number; premium: number }>()
  for (const a of assignments) {
    const shift = shiftById.get(a.shiftId)
    if (!shift) continue
    const entry = byLocation.get(shift.locationId) ?? { hours: 0, premium: 0 }
    entry.hours += hoursBetween(shift.startsAt, shift.endsAt)
    if (isPremiumById.get(a.shiftId)) entry.premium += 1
    byLocation.set(shift.locationId, entry)
  }

  return locations.map((l) => {
    const mine = byLocation.get(l.id) ?? { hours: 0, premium: 0 }
    const hoursShare = totalHoursAll > 0 ? mine.hours / totalHoursAll : 0
    const premiumShare = totalPremiumAll > 0 ? mine.premium / totalPremiumAll : 0
    const score = hoursShare > 0 ? premiumShare / hoursShare : premiumShare > 0 ? Infinity : 0
    return { locationId: l.id, totalHours: mine.hours, premiumCount: mine.premium, hoursShare, premiumShare, score }
  })
}
