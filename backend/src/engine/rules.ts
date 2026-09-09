import { format, parseISO } from 'date-fns'
import type { EngineViolation, EvaluateAssignmentInput } from './types'
import { consecutiveDayStreak, hoursBetween, localDateKey, localDayOfWeek, localTimeOfDay, rangesOverlap } from './timeHelpers'
import { roleLabel } from './labels'

const DAILY_WARNING_HOURS = 8
const DAILY_HARD_LIMIT_HOURS = 12
// Exported: Phase 6's overtime dashboard reuses these exact thresholds for its
// retrospective weekly summary instead of hardcoding 35/40 again.
export const WEEKLY_WARNING_HOURS = 35
export const WEEKLY_REFERENCE_HOURS = 40
const CONSECUTIVE_DAY_WARNING = 6
const CONSECUTIVE_DAY_HARD = 7
const REST_GAP_HOURS = 10

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

export function shiftHours(startsAt: Date, endsAt: Date): number {
  return hoursBetween(startsAt, endsAt)
}

/** Certified staff have an active (non-revoked, filtered upstream) cert for this exact
 *  location+skill pair. Same rule as the frontend's `isCertifiedFor`; unlike every other
 *  rule here, a failure here short-circuits the rest of the engine (matches the frontend's
 *  `evaluateAssignment`, which returns immediately on this one check). */
export function checkCertification(input: EvaluateAssignmentInput): EngineViolation | null {
  const { staff, shift, location } = input
  const certified = staff.certifications.some((c) => c.locationId === shift.locationId && c.skillKey === shift.skillRequired)
  if (certified) return null
  return {
    rule: 'not_certified',
    severity: 'block',
    message: `${staff.name} isn't certified for ${roleLabel(shift.skillRequired)} at ${location.name}.`,
  }
}

/** Range-overlap against the staff's other active bookings. Comparing real UTC instants
 *  means an overnight shift (e.g. 11pm-3am) is handled correctly with no special-casing —
 *  it is one continuous range like any other, per §8. */
export function checkDoubleBooking(input: EvaluateAssignmentInput): EngineViolation | null {
  const { shift, staff, existingBookings, location } = input
  const overlapping = existingBookings.find((b) => rangesOverlap(b.startsAt, b.endsAt, shift.startsAt, shift.endsAt))
  if (!overlapping) return null
  return {
    rule: 'double_booking',
    severity: 'block',
    message: `${staff.name} is already on the schedule ${localDateKey(overlapping.startsAt, location.timezone)} at that time.`,
  }
}

/** Not in the frontend mock at all — a new rule per BACKEND_PROMPT. Treated as a hard,
 *  non-overridable block in the same category as double-booking (a physical impossibility
 *  / labor-standard violation, not a judgment call), since BACKEND_PROMPT lists it
 *  alongside double-booking/cert/12h-cap without calling out a softer severity the way it
 *  explicitly does for weekly hours and the 6th/7th day rules. Flagged as a judgment call
 *  in the Phase 3 report. Skips bookings that already overlap (those surface as
 *  double_booking instead — no need for both messages on the same conflict). */
export function checkRestGap(input: EvaluateAssignmentInput): EngineViolation | null {
  const { shift, staff, existingBookings, location } = input
  let tightest: { booking: (typeof existingBookings)[number]; gapHours: number } | null = null

  for (const booking of existingBookings) {
    if (rangesOverlap(booking.startsAt, booking.endsAt, shift.startsAt, shift.endsAt)) continue
    const gapHours =
      booking.endsAt <= shift.startsAt
        ? hoursBetween(booking.endsAt, shift.startsAt)
        : hoursBetween(shift.endsAt, booking.startsAt)
    if (gapHours < REST_GAP_HOURS && (!tightest || gapHours < tightest.gapHours)) {
      tightest = { booking, gapHours }
    }
  }

  if (!tightest) return null
  return {
    rule: 'rest_gap',
    severity: 'block',
    message: `This would leave ${staff.name} only ${tightest.gapHours.toFixed(1)}h of rest before/after the shift on ${localDateKey(
      tightest.booking.startsAt,
      location.timezone,
    )} — under the 10-hour minimum.`,
  }
}

/** New rule (frontend never modeled availability at all). Per the settled Timezone
 *  Tangle decision, the shift's own location-local day/time is what's checked against —
 *  no home-timezone conversion. An overnight shift is keyed to its local START date,
 *  matching the frontend's own `date` field convention for overnight shifts. An explicit
 *  AvailabilityException for the date wins outright in either direction (available:true
 *  overrides an otherwise-missing/non-covering recurring rule; available:false blocks
 *  even if a recurring rule would have covered it).
 *
 *  A staff member with *zero* AvailabilityRule rows at all (most of the seed roster —
 *  confirmed against real data: 9 of 11 seeded staff never touched the Availability
 *  screen) has stated no preference at all and is treated as open every day, not blocked
 *  every day — the opposite reading made the entire seeded schedule unassignable and was
 *  caught by testing against real data, not assumed. Once a staff member has set *any*
 *  rule, an uncovered day is then a real, considered gap (they configured other days and
 *  conspicuously not this one) and blocks, same as before. */
export function checkAvailability(input: EvaluateAssignmentInput): EngineViolation | null {
  const { shift, staff, location, availabilityRules, availabilityExceptions } = input
  const dateKey = localDateKey(shift.startsAt, location.timezone)
  const dayOfWeek = localDayOfWeek(shift.startsAt, location.timezone)
  const startTime = localTimeOfDay(shift.startsAt, location.timezone)
  const endTime = localTimeOfDay(shift.endsAt, location.timezone)

  const exception = availabilityExceptions.find((e) => e.date === dateKey)
  if (exception) {
    if (exception.available) return null
    return {
      rule: 'not_available',
      severity: 'block',
      message: `${staff.name} marked themselves unavailable on ${dateKey}.`,
    }
  }

  if (availabilityRules.length === 0) return null

  const rulesForDay = availabilityRules.filter((r) => r.dayOfWeek === dayOfWeek)
  if (rulesForDay.length === 0) {
    return {
      rule: 'not_available',
      severity: 'block',
      message: `${staff.name} hasn't marked themselves available on ${format(parseISO(dateKey), 'EEEE')}s.`,
    }
  }

  const covered = rulesForDay.some((r) => startTime >= r.startTime && endTime <= r.endTime)
  if (covered) return null
  return {
    rule: 'not_available',
    severity: 'block',
    message: `This shift (${startTime}–${endTime}) falls outside ${staff.name}'s declared availability window for that day.`,
  }
}

/** warn > 8h, block > 12h in a single local calendar day — the block threshold matches
 *  the frontend exactly; the 8h warning tier is new per BACKEND_PROMPT. */
export function checkDailyHours(input: EvaluateAssignmentInput): EngineViolation | null {
  const { shift, staff, existingBookings, location } = input
  const dateKey = localDateKey(shift.startsAt, location.timezone)
  const sameDayHours =
    existingBookings
      .filter((b) => localDateKey(b.startsAt, location.timezone) === dateKey)
      .reduce((sum, b) => sum + shiftHours(b.startsAt, b.endsAt), 0) + shiftHours(shift.startsAt, shift.endsAt)

  if (sameDayHours > DAILY_HARD_LIMIT_HOURS) {
    return {
      rule: 'daily_overtime',
      severity: 'block',
      message: `This would put ${staff.name} at ${sameDayHours.toFixed(1)}h on ${dateKey}, over the 12-hour daily limit.`,
    }
  }
  if (sameDayHours > DAILY_WARNING_HOURS) {
    return {
      rule: 'daily_overtime',
      severity: 'warning',
      message: `This would put ${staff.name} at ${sameDayHours.toFixed(1)}h on ${dateKey}, over the 8-hour mark.`,
    }
  }
  return null
}

/** warn >= 35h, no block threshold — matches the frontend exactly (weekly hours never
 *  hard-block there, only daily hours do). */
export function checkWeeklyHours(input: EvaluateAssignmentInput): EngineViolation | null {
  const { shift, staff, weeklyHoursExcludingThisShift } = input
  const projected = weeklyHoursExcludingThisShift + shiftHours(shift.startsAt, shift.endsAt)
  if (projected < WEEKLY_WARNING_HOURS) return null
  return {
    rule: 'weekly_overtime',
    severity: 'warning',
    message:
      projected > WEEKLY_REFERENCE_HOURS
        ? `This would put ${staff.name} at ${projected.toFixed(1)}h this week, over the 40h mark.`
        : `This would put ${staff.name} at ${projected.toFixed(1)}h this week, approaching the 40h mark.`,
  }
}

/** Per-calendar-day streak in location-local time, regardless of shift length — the
 *  settled decision from the frontend README, re-implemented identically to
 *  `consecutiveDaysIncluding` in the frontend's lib/rules.ts. 6th day warns, 7th+ is a
 *  hard block a manager can override with a documented reason (the only overridable rule
 *  in the whole engine). */
export function checkConsecutiveDays(input: EvaluateAssignmentInput): EngineViolation | null {
  const { shift, staff, existingBookings, location } = input
  const dateKey = localDateKey(shift.startsAt, location.timezone)
  const workedDayKeys = new Set(existingBookings.map((b) => localDateKey(b.startsAt, location.timezone)))
  workedDayKeys.add(dateKey)

  const streak = consecutiveDayStreak(workedDayKeys, dateKey)

  if (streak >= CONSECUTIVE_DAY_HARD) {
    return {
      rule: 'consecutive_days',
      severity: 'overridable',
      message: `This would be ${staff.name}'s ${ordinal(streak)} consecutive day worked — requires manager override with a documented reason.`,
    }
  }
  if (streak >= CONSECUTIVE_DAY_WARNING) {
    return {
      rule: 'consecutive_days',
      severity: 'warning',
      message: `This would be ${staff.name}'s ${ordinal(streak)} consecutive day worked.`,
    }
  }
  return null
}
