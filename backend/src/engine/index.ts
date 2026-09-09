import type { EngineViolation, EvaluateAssignmentInput } from './types'
import {
  checkAvailability,
  checkCertification,
  checkConsecutiveDays,
  checkDailyHours,
  checkDoubleBooking,
  checkRestGap,
  checkWeeklyHours,
} from './rules'

export * from './types'
export * from './rules'

/**
 * Runs every §2/§4 rule for one staff+shift pair and returns every violation found.
 * Mirrors the frontend's `evaluateAssignment` shape and ordering exactly (cert check
 * first, short-circuiting the rest on failure — the one rule that does), so behavior the
 * frontend already demonstrated (e.g. which message shows first) carries over unchanged.
 */
export function evaluateAssignment(input: EvaluateAssignmentInput): EngineViolation[] {
  const certViolation = checkCertification(input)
  if (certViolation) return [certViolation]

  const violations: EngineViolation[] = []
  for (const check of [checkAvailability, checkDoubleBooking, checkRestGap, checkDailyHours, checkWeeklyHours, checkConsecutiveDays]) {
    const v = check(input)
    if (v) violations.push(v)
  }
  return violations
}

export function isBlocking(violations: EngineViolation[]): boolean {
  return violations.some((v) => v.severity === 'block')
}

export function isOverridableBlocking(violations: EngineViolation[]): boolean {
  return violations.some((v) => v.severity === 'overridable')
}

/** An override is only ever offered when every hard stop present is the overridable kind
 *  (currently just the 7th-consecutive-day rule) — a plain `block` violation (double
 *  booking, missing cert, 10h rest gap, 12h daily cap, unavailable) can never be forced
 *  through no matter what else is going on, matching the frontend's ViolationPanel logic
 *  (`canOverride = hardViolations.length > 0 && hardViolations.every(v => v.overridable)`). */
export function canOverride(violations: EngineViolation[]): boolean {
  return isOverridableBlocking(violations) && !isBlocking(violations)
}
