import { formatInTimeZone } from 'date-fns-tz'
import { prisma } from './prisma'
import { weekStartKeyForDateString } from './shiftSeats'
import { hoursBetween } from '../engine/timeHelpers'
import type { EngineLocation, EngineShift, EvaluateAssignmentInput } from '../engine/types'

export async function loadShiftAndLocation(
  shiftId: string,
): Promise<{ engineShift: EngineShift; engineLocation: EngineLocation; headcount: number; status: string } | null> {
  // A single joined query, not shift-then-location sequentially — each round trip to
  // Neon costs real network latency, and this runs on nearly every Phase 3 route.
  const shift = await prisma.shift.findUnique({ where: { id: shiftId }, include: { location: true } })
  if (!shift) return null
  return {
    engineShift: {
      id: shift.id,
      locationId: shift.locationId,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      skillRequired: shift.skillRequired,
    },
    engineLocation: { id: shift.location.id, name: shift.location.name, timezone: shift.location.timezone },
    headcount: shift.headcount,
    status: shift.status,
  }
}

// The shape buildEvaluationInputForStaff needs from a User row — matches what
// `prisma.user.findUnique({ include: { certifications: { include: { skill: true } } } })`
// returns, structurally, so a caller who already fetched a user for its own purposes
// (e.g. to read `.name` for a notification) can hand it in directly instead of the
// engine context builder re-fetching the exact same row.
export type UserWithActiveCerts = {
  id: string
  name: string
  role: 'admin' | 'manager' | 'staff'
  certifications: { locationId: string; skill: { key: string } }[]
}

/**
 * Assembles everything the pure engine needs to evaluate one staff member against one
 * (hypothetical or real) shift. `excludeShiftId` lets a caller re-evaluate a shift the
 * staff member is already booked on (edit-after-swap-approval re-checks) without the
 * engine seeing that booking as a self-conflict. `prefetchedUser` lets a caller that
 * already fetched this exact user (with active certifications) for its own purposes pass
 * it straight in, instead of this function re-querying the same row a second time.
 */
export async function buildEvaluationInputForStaff(
  staffId: string,
  engineShift: EngineShift,
  engineLocation: EngineLocation,
  excludeShiftId?: string,
  prefetchedUser?: UserWithActiveCerts | null,
): Promise<EvaluateAssignmentInput | null> {
  // All four queries only need `staffId` (known up front, not derived from any of the
  // others), so they run in one round-trip-time instead of "find the user" then a second
  // wave for everything else — unless the user was already fetched by the caller, in
  // which case there are only three left to wait on.
  const [user, bookings, rules, exceptions] = await Promise.all([
    prefetchedUser !== undefined
      ? Promise.resolve(prefetchedUser)
      : prisma.user.findUnique({
          where: { id: staffId },
          include: { certifications: { where: { revokedAt: null }, include: { skill: true } } },
        }),
    prisma.assignment.findMany({
      where: { staffId, status: 'active', shiftId: { not: excludeShiftId ?? engineShift.id } },
      include: { shift: true },
    }),
    prisma.availabilityRule.findMany({ where: { staffId } }),
    prisma.availabilityException.findMany({ where: { staffId } }),
  ])
  if (!user) return null

  const existingBookings = bookings.map((a) => ({
    staffId: a.staffId,
    shiftId: a.shiftId,
    startsAt: a.shift.startsAt,
    endsAt: a.shift.endsAt,
  }))

  const weekStart = weekStartKeyForDateString(formatInTimeZone(engineShift.startsAt, engineLocation.timezone, 'yyyy-MM-dd'))
  const weeklyHoursExcludingThisShift = existingBookings
    .filter((b) => weekStartKeyForDateString(formatInTimeZone(b.startsAt, engineLocation.timezone, 'yyyy-MM-dd')) === weekStart)
    .reduce((sum, b) => sum + hoursBetween(b.startsAt, b.endsAt), 0)

  return {
    shift: engineShift,
    location: engineLocation,
    staff: {
      id: user.id,
      name: user.name,
      role: user.role,
      certifications: user.certifications.map((c) => ({ locationId: c.locationId, skillKey: c.skill.key })),
    },
    existingBookings,
    availabilityRules: rules.map((r) => ({ dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime })),
    // AvailabilityException.date is a bare @db.Date (no time/tz) — Prisma returns it as a
    // UTC-midnight Date for that calendar date, so it must be read back out in UTC, not
    // the shift's location timezone, or a date near midnight could shift by a day.
    availabilityExceptions: exceptions.map((e) => ({ date: formatInTimeZone(e.date, 'UTC', 'yyyy-MM-dd'), available: e.available })),
    weeklyHoursExcludingThisShift,
  }
}
