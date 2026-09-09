import { addDays, differenceInMinutes, format, parseISO } from 'date-fns'
import type { EligibleCandidate, Location, Shift, StaffMember, Violation } from '../types'
import { roleLabel, ordinal } from './format'
import { localDateKey, formatDateInZone } from './timezone'

const DAILY_HARD_LIMIT_HOURS = 12
const WEEKLY_WARNING_HOURS = 35
const WEEKLY_REFERENCE_HOURS = 40
const CONSECUTIVE_DAY_WARNING = 6 // soft
const CONSECUTIVE_DAY_HARD = 7 // hard, overridable

const PUBLISH_CUTOFF_HOURS = 48

export function isWithinPublishCutoff(shift: Shift, now: Date = new Date()): boolean {
  const msUntilStart = new Date(shift.startUtc).getTime() - now.getTime()
  return msUntilStart >= 0 && msUntilStart < PUBLISH_CUTOFF_HOURS * 3600 * 1000
}

/** Groups shift "seats" that belong to the same board cell (same location/day/time/role). */
export function slotKey(shift: Shift): string {
  return `${shift.locationId}__${shift.date}__${shift.startUtc}__${shift.endUtc}__${shift.role}`
}

export function shiftHours(shift: Shift): number {
  return differenceInMinutes(new Date(shift.endUtc), new Date(shift.startUtc)) / 60
}

export function shiftsOverlap(a: Shift, b: Shift): boolean {
  return new Date(a.startUtc) < new Date(b.endUtc) && new Date(b.startUtc) < new Date(a.endUtc)
}

export function isCertifiedFor(staff: StaffMember, locationId: string, role: Shift['role']): boolean {
  return staff.certifications.some((c) => c.locationId === locationId && c.skills.includes(role))
}

export function weeklyHoursFor(
  staffId: string,
  weekStart: string,
  shifts: Shift[],
  excludeShiftId?: string,
): number {
  return shifts
    .filter((s) => s.assignedStaffId === staffId && s.weekStart === weekStart && s.id !== excludeShiftId)
    .reduce((sum, s) => sum + shiftHours(s), 0)
}

export function consecutiveDaysIncluding(
  staffId: string,
  location: Location,
  shifts: Shift[],
  dateKey: string,
): number {
  const workedDayKeys = new Set(
    shifts.filter((s) => s.assignedStaffId === staffId).map((s) => localDateKey(s.startUtc, location.timezone)),
  )
  workedDayKeys.add(dateKey)

  let streak = 0
  let cursor = parseISO(dateKey)
  while (workedDayKeys.has(format(cursor, 'yyyy-MM-dd'))) {
    streak++
    cursor = addDays(cursor, -1)
  }
  return streak
}

export function evaluateAssignment(
  shift: Shift,
  staff: StaffMember,
  allShifts: Shift[],
  location: Location,
): Violation[] {
  const violations: Violation[] = []

  if (!isCertifiedFor(staff, shift.locationId, shift.role)) {
    violations.push({
      type: 'not_certified',
      severity: 'hard',
      message: `${staff.name} isn't certified for ${roleLabel(shift.role)} at ${location.name}.`,
    })
    return violations
  }

  const staffShifts = allShifts.filter((s) => s.assignedStaffId === staff.id && s.id !== shift.id)

  const overlapping = staffShifts.find((s) => shiftsOverlap(s, shift))
  if (overlapping) {
    violations.push({
      type: 'double_booking',
      severity: 'hard',
      message: `${staff.name} is already on the schedule ${formatDateInZone(overlapping.startUtc, location.timezone)} at that time.`,
    })
  }

  const dateKey = localDateKey(shift.startUtc, location.timezone)
  const sameDayHours =
    staffShifts
      .filter((s) => localDateKey(s.startUtc, location.timezone) === dateKey)
      .reduce((sum, s) => sum + shiftHours(s), 0) + shiftHours(shift)
  if (sameDayHours > DAILY_HARD_LIMIT_HOURS) {
    violations.push({
      type: 'daily_overtime',
      severity: 'hard',
      message: `This would put ${staff.name} at ${sameDayHours.toFixed(1)}h on ${dateKey}, over the 12-hour daily limit.`,
    })
  }

  const projectedWeekly = weeklyHoursFor(staff.id, shift.weekStart, allShifts, shift.id) + shiftHours(shift)
  if (projectedWeekly >= WEEKLY_WARNING_HOURS) {
    violations.push({
      type: 'weekly_overtime',
      severity: 'soft',
      message:
        projectedWeekly > WEEKLY_REFERENCE_HOURS
          ? `This would put ${staff.name} at ${projectedWeekly.toFixed(1)}h this week, over the 40h mark.`
          : `This would put ${staff.name} at ${projectedWeekly.toFixed(1)}h this week, approaching the 40h mark.`,
    })
  }

  const streak = consecutiveDaysIncluding(staff.id, location, staffShifts, dateKey)
  if (streak >= CONSECUTIVE_DAY_HARD) {
    violations.push({
      type: 'consecutive_days',
      severity: 'hard',
      overridable: true,
      message: `This would be ${staff.name}'s ${ordinal(streak)} consecutive day worked — requires manager override with a documented reason.`,
    })
  } else if (streak >= CONSECUTIVE_DAY_WARNING) {
    violations.push({
      type: 'consecutive_days',
      severity: 'soft',
      message: `This would be ${staff.name}'s ${ordinal(streak)} consecutive day worked.`,
    })
  }

  return violations
}

const MOCK_HOURLY_RATE = 19
const OVERTIME_MULTIPLIER = 1.5

export function overtimeHours(totalHours: number): number {
  return Math.max(0, totalHours - WEEKLY_REFERENCE_HOURS)
}

export function estimateOvertimeCost(totalHours: number, hourlyRate = MOCK_HOURLY_RATE): number {
  return overtimeHours(totalHours) * hourlyRate * OVERTIME_MULTIPLIER
}

export interface WeekRiskSummary {
  unfilledSeats: number
  totalSeats: number
  hardViolations: number
  softViolations: number
  overtimeCost: number
}

/** Retrospective summary of a published/draft week already on the books (not a prospective check). */
export function summarizeWeek(locationId: string, weekStart: string, shifts: Shift[]): WeekRiskSummary {
  const weekShifts = shifts.filter((s) => s.locationId === locationId && s.weekStart === weekStart)
  const unfilledSeats = weekShifts.filter((s) => !s.assignedStaffId).length
  const totalSeats = weekShifts.length

  let hardViolations = 0
  let softViolations = 0
  let overtimeCost = 0

  const staffIds = new Set(weekShifts.map((s) => s.assignedStaffId).filter((id): id is string => !!id))
  for (const staffId of staffIds) {
    const assigned = weekShifts.filter((s) => s.assignedStaffId === staffId)
    const totalHours = assigned.reduce((sum, s) => sum + shiftHours(s), 0)
    if (totalHours >= WEEKLY_WARNING_HOURS) softViolations += 1
    overtimeCost += estimateOvertimeCost(totalHours)

    for (let i = 0; i < assigned.length; i++) {
      for (let j = i + 1; j < assigned.length; j++) {
        if (shiftsOverlap(assigned[i], assigned[j])) hardViolations += 1
      }
    }
  }

  return { unfilledSeats, totalSeats, hardViolations, softViolations, overtimeCost }
}

export function getEligibleCandidates(
  shift: Shift,
  allStaff: StaffMember[],
  allShifts: Shift[],
  location: Location,
): EligibleCandidate[] {
  return allStaff
    .filter((s) => s.role === 'staff')
    .map((staff) => {
      const violations = evaluateAssignment(shift, staff, allShifts, location)
      const hardBlocked = violations.some((v) => v.severity === 'hard')
      const notCertified = violations.some((v) => v.type === 'not_certified')
      const projectedWeeklyHours = notCertified
        ? weeklyHoursFor(staff.id, shift.weekStart, allShifts, shift.id)
        : weeklyHoursFor(staff.id, shift.weekStart, allShifts, shift.id) + shiftHours(shift)

      const reasons: string[] = []
      if (!hardBlocked) {
        reasons.push(`Certified for ${roleLabel(shift.role)} at ${location.name}`)
        reasons.push(`Would be at ${projectedWeeklyHours.toFixed(1)}h this week`)
        if (violations.length === 0) reasons.push('No scheduling conflicts')
      }

      return {
        staffId: staff.id,
        qualifies: !hardBlocked,
        reasons,
        projectedWeeklyHours,
        violations,
      }
    })
    .sort((a, b) => Number(b.qualifies) - Number(a.qualifies) || a.violations.length - b.violations.length)
}
