import { formatInTimeZone } from 'date-fns-tz'
import { prisma } from './prisma'
import { weekStartKeyForDateString } from './shiftSeats'
import { evaluateAssignment } from '../engine'
import { roleLabel } from '../engine/labels'
import { shiftHours } from '../engine/rules'
import { hoursBetween } from '../engine/timeHelpers'
import { buildEvaluationInputForStaff } from './assignmentContext'
import type { EngineLocation, EngineResult, EngineShift, EngineViolation, EvaluateAssignmentInput, StaffSuggestion } from '../engine/types'

export interface WireViolation {
  type: string
  severity: 'hard' | 'soft'
  message: string
  overridable?: boolean
}

export interface EligibleCandidateDto {
  staffId: string
  staffName: string
  qualifies: boolean
  reasons: string[]
  projectedWeeklyHours: number
  violations: WireViolation[]
}

// Maps the engine's 3-level severity ('block' | 'overridable' | 'warning') onto the
// frontend's pre-existing 2-level Violation shape ('hard' | 'soft' + an `overridable`
// flag) — the wire contract the ViolationPanel/AssignPanel components already consume
// unchanged from the mock era.
export function toWireViolations(violations: EngineViolation[]): WireViolation[] {
  return violations.map((v) => ({
    type: v.rule,
    severity: v.severity === 'warning' ? 'soft' : 'hard',
    message: v.message,
    ...(v.severity === 'overridable' ? { overridable: true } : {}),
  }))
}

function hasAnyHardStop(violations: EngineViolation[]): boolean {
  return violations.some((v) => v.severity !== 'warning')
}

function evaluateOneCandidate(
  u: { id: string; name: string; role: 'admin' | 'manager' | 'staff'; certifications: { locationId: string; skillKey: string }[] },
  input: EvaluateAssignmentInput,
  engineShift: EngineShift,
  engineLocation: EngineLocation,
): EligibleCandidateDto {
  const violations = evaluateAssignment(input)
  const hardBlocked = hasAnyHardStop(violations)
  const notCertified = violations.some((v) => v.rule === 'not_certified')
  const projectedWeeklyHours = input.weeklyHoursExcludingThisShift + (notCertified ? 0 : shiftHours(engineShift.startsAt, engineShift.endsAt))

  const reasons: string[] = []
  if (!hardBlocked) {
    reasons.push(`Certified for ${roleLabel(engineShift.skillRequired)} at ${engineLocation.name}`)
    reasons.push(`Would be at ${projectedWeeklyHours.toFixed(1)}h this week`)
    if (violations.length === 0) reasons.push('No scheduling conflicts')
  }

  return {
    staffId: u.id,
    staffName: u.name,
    qualifies: !hardBlocked,
    reasons,
    projectedWeeklyHours,
    violations: toWireViolations(violations),
  }
}

/**
 * Full roster evaluated against one shift, sorted best-first — same contract as the
 * frontend mock's `getEligibleCandidates` (used both for the Assign panel's staff list
 * and, filtered/sliced client-side, as "suggested alternatives" in the violation panel).
 *
 * Deliberately batches into a fixed 4 queries (staff+certs, bookings, rules, exceptions)
 * instead of looping `buildEvaluationInputForStaff` once per staff member — the N+1
 * version measured at 20+ seconds for an 11-person roster against Neon's pooled
 * connection (Promise.all alone only brought it to ~8s; concurrent requests still queue
 * on the pool). Grouping in memory after a handful of `IN (...)` queries is the actual
 * fix, not more parallelism.
 */
export async function computeCandidates(
  engineShift: EngineShift,
  engineLocation: EngineLocation,
  excludeShiftId?: string,
): Promise<EligibleCandidateDto[]> {
  const excludeId = excludeShiftId ?? engineShift.id

  // All four fetch everything unconditionally (no "which staff ids do we need" gate) so
  // they can run in the same Promise.all wave as the staff query itself, rather than
  // waiting for staff ids before firing the other three — one round-trip-time instead of
  // two. These tables are small (bounded by total assignments/rules/exceptions across the
  // whole roster, not per-shift), so fetching unfiltered rows and grouping in memory below
  // costs nothing meaningful over filtering server-side.
  const [staffUsers, bookingRows, ruleRows, exceptionRows] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'staff' },
      orderBy: { name: 'asc' },
      include: { certifications: { where: { revokedAt: null }, include: { skill: true } } },
    }),
    prisma.assignment.findMany({ where: { status: 'active', shiftId: { not: excludeId } }, include: { shift: true } }),
    prisma.availabilityRule.findMany(),
    prisma.availabilityException.findMany(),
  ])

  const bookingsByStaff = new Map<string, { staffId: string; shiftId: string; startsAt: Date; endsAt: Date }[]>()
  for (const a of bookingRows) {
    const list = bookingsByStaff.get(a.staffId) ?? []
    list.push({ staffId: a.staffId, shiftId: a.shiftId, startsAt: a.shift.startsAt, endsAt: a.shift.endsAt })
    bookingsByStaff.set(a.staffId, list)
  }
  const rulesByStaff = new Map<string, { dayOfWeek: number; startTime: string; endTime: string }[]>()
  for (const r of ruleRows) {
    const list = rulesByStaff.get(r.staffId) ?? []
    list.push({ dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime })
    rulesByStaff.set(r.staffId, list)
  }
  const exceptionsByStaff = new Map<string, { date: string; available: boolean }[]>()
  for (const e of exceptionRows) {
    const list = exceptionsByStaff.get(e.staffId) ?? []
    list.push({ date: formatInTimeZone(e.date, 'UTC', 'yyyy-MM-dd'), available: e.available })
    exceptionsByStaff.set(e.staffId, list)
  }

  const weekStart = weekStartKeyForDateString(formatInTimeZone(engineShift.startsAt, engineLocation.timezone, 'yyyy-MM-dd'))

  const results = staffUsers.map((u) => {
    const bookings = bookingsByStaff.get(u.id) ?? []
    const weeklyHoursExcludingThisShift = bookings
      .filter((b) => weekStartKeyForDateString(formatInTimeZone(b.startsAt, engineLocation.timezone, 'yyyy-MM-dd')) === weekStart)
      .reduce((sum, b) => sum + hoursBetween(b.startsAt, b.endsAt), 0)

    const input: EvaluateAssignmentInput = {
      shift: engineShift,
      location: engineLocation,
      staff: {
        id: u.id,
        name: u.name,
        role: u.role,
        certifications: u.certifications.map((c) => ({ locationId: c.locationId, skillKey: c.skill.key })),
      },
      existingBookings: bookings,
      availabilityRules: rulesByStaff.get(u.id) ?? [],
      availabilityExceptions: exceptionsByStaff.get(u.id) ?? [],
      weeklyHoursExcludingThisShift,
    }

    return evaluateOneCandidate(input.staff, input, engineShift, engineLocation)
  })

  results.sort((a, b) => Number(b.qualifies) - Number(a.qualifies) || a.violations.length - b.violations.length)
  return results
}

/**
 * The engine's own public decision contract per BACKEND_PROMPT: evaluates one staff
 * member and, on failure, attaches 2-3 real qualifying alternatives. This is the thin,
 * DB-touching layer around the pure `evaluateAssignment` (which is what's unit-tested
 * with hand-built fixtures) — generating suggestions inherently needs the rest of the
 * roster, which only the DB has.
 */
export async function decideAssignment(
  engineShift: EngineShift,
  engineLocation: EngineLocation,
  staffId: string,
  excludeShiftId?: string,
): Promise<EngineResult | null> {
  const input = await buildEvaluationInputForStaff(staffId, engineShift, engineLocation, excludeShiftId)
  if (!input) return null

  const violations = evaluateAssignment(input)
  if (!hasAnyHardStop(violations)) return { ok: true }

  const candidates = await computeCandidates(engineShift, engineLocation, excludeShiftId)
  const suggestions: StaffSuggestion[] = candidates
    .filter((c) => c.qualifies && c.staffId !== staffId)
    .slice(0, 3)
    .map((c) => ({ staffId: c.staffId, name: c.staffName, reasons: c.reasons, projectedWeeklyHours: c.projectedWeeklyHours }))

  return { ok: false, violations, suggestions }
}
