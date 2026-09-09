import { formatInTimeZone } from 'date-fns-tz'
import type { Assignment, Shift } from '@prisma/client'
import { prisma } from './prisma'
import { isPremiumShift } from '../engine/timeHelpers'

// The frontend's mock `Shift` type is one row per seat (a single `assignedStaffId`).
// The real schema is headcount-based: one `Shift` row can have several concurrent
// `active` Assignment rows (up to `headcount`), with unfilled seats not persisted as
// rows at all. Phase 1's seed script already reconciled this by grouping the mock's
// per-seat rows into `Shift` + `Assignment` groups; this module is the inverse — it
// explodes a headcount-based Shift back into the frontend's per-seat shape so every
// existing component (which only knows the one-row-per-seat contract) keeps working
// unchanged.
//
// Seat id scheme (three cases a caller may hand back to us later, e.g. `GET /shifts/:id`):
//   - a filled seat's id IS the underlying Assignment's id (stable across reassignment
//     once Phase 3 starts updating `Assignment.staffId` in place, same as the mock's
//     "same array element, new occupant" semantics)
//   - an unfilled seat's id is synthetic: `${shift.id}:unfilled:${index}` — there is no
//     row to point at yet, so the id just needs to be stable within one read and to
//     encode enough to resolve back to the parent Shift for a future assign call
//   - a bare Shift.id (used by SwapRequest.shiftId, which references the parent Shift,
//     not a specific seat) resolves to a representative seat — fine because every seat
//     of one Shift shares the same role/time/location, the only fields swap screens read

export interface SeatDto {
  id: string
  locationId: string
  weekStart: string
  date: string
  startUtc: string
  endUtc: string
  role: string
  assignedStaffId: string | null
  status: string
  isPremium: boolean
  overrideReason: string | null
}

/** Sunday-of-week key for a 'yyyy-MM-dd' string, computed in pure UTC-component
 *  arithmetic so it never depends on the server process's local timezone. */
export function weekStartKeyForDateString(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d))
  utc.setUTCDate(utc.getUTCDate() - utc.getUTCDay())
  return utc.toISOString().slice(0, 10)
}

export function explodeShiftToSeats(shift: Shift, assignments: Assignment[], timezone: string): SeatDto[] {
  const date = formatInTimeZone(shift.startsAt, timezone, 'yyyy-MM-dd')
  const weekStart = weekStartKeyForDateString(date)
  const base = {
    locationId: shift.locationId,
    weekStart,
    date,
    startUtc: shift.startsAt.toISOString(),
    endUtc: shift.endsAt.toISOString(),
    role: shift.skillRequired,
    status: shift.status,
    // Computed fresh here rather than trusted from the stored column — the Phase 6
    // premium-shift rule (Fri/Sat starting >=5pm, location-local) per BACKEND_PROMPT.
    // Every shift response goes through this function, so this is the one place that
    // has to be right; the stored Shift.isPremium column is kept in sync at write time
    // (routes/shifts.ts) as a matter of DB hygiene, not because anything here reads it.
    isPremium: isPremiumShift(shift.startsAt, timezone),
  }

  const active = assignments.filter((a) => a.status === 'active')
  const seats: SeatDto[] = active.map((a) => ({
    id: a.id,
    ...base,
    assignedStaffId: a.staffId,
    overrideReason: a.isOverride ? a.overrideReason : null,
  }))

  const unfilledCount = Math.max(0, shift.headcount - active.length)
  for (let i = 0; i < unfilledCount; i++) {
    seats.push({ id: `${shift.id}:unfilled:${i}`, ...base, assignedStaffId: null, overrideReason: null })
  }
  return seats
}

/** Resolves any of the three id shapes described above to one seat, or null if nothing matches. */
export async function resolveSeatById(id: string): Promise<SeatDto | null> {
  const directShift = await prisma.shift.findUnique({ where: { id } })
  if (directShift) {
    const [assignments, location] = await Promise.all([
      prisma.assignment.findMany({ where: { shiftId: id } }),
      prisma.location.findUniqueOrThrow({ where: { id: directShift.locationId } }),
    ])
    const seats = explodeShiftToSeats(directShift, assignments, location.timezone)
    return seats[0] ?? null
  }

  const unfilledMatch = id.match(/^(.+):unfilled:(\d+)$/)
  if (unfilledMatch) {
    const shiftId = unfilledMatch[1]
    const shift = await prisma.shift.findUnique({ where: { id: shiftId } })
    if (!shift) return null
    const [assignments, location] = await Promise.all([
      prisma.assignment.findMany({ where: { shiftId } }),
      prisma.location.findUniqueOrThrow({ where: { id: shift.locationId } }),
    ])
    const seats = explodeShiftToSeats(shift, assignments, location.timezone)
    return seats.find((s) => s.id === id) ?? null
  }

  const assignment = await prisma.assignment.findUnique({ where: { id }, include: { shift: true } })
  if (assignment) {
    const [assignments, location] = await Promise.all([
      prisma.assignment.findMany({ where: { shiftId: assignment.shiftId } }),
      prisma.location.findUniqueOrThrow({ where: { id: assignment.shift.locationId } }),
    ])
    const seats = explodeShiftToSeats(assignment.shift, assignments, location.timezone)
    return seats.find((s) => s.id === id) ?? null
  }

  return null
}

/**
 * Resolves a seat id for a mutation (assign/unassign), which needs to know not just the
 * seat's shape but which underlying Shift it belongs to and — if the seat was already
 * filled — which specific Assignment row a reassignment needs to cancel. Only understands
 * the two shapes the exploded seat list actually produces (an Assignment id, or a
 * synthetic `${shiftId}:unfilled:${n}`) — a bare Shift.id is never handed to a mutation
 * from the UI (see the comment atop this file), so it isn't handled here.
 */
export async function resolveSeatForMutation(
  id: string,
): Promise<{ shiftId: string; existingAssignmentId: string | null } | null> {
  const unfilledMatch = id.match(/^(.+):unfilled:(\d+)$/)
  if (unfilledMatch) {
    const shiftId = unfilledMatch[1]
    const shift = await prisma.shift.findUnique({ where: { id: shiftId } })
    if (!shift) return null
    return { shiftId, existingAssignmentId: null }
  }

  const assignment = await prisma.assignment.findUnique({ where: { id } })
  if (assignment) return { shiftId: assignment.shiftId, existingAssignmentId: assignment.id }

  return null
}

/**
 * `:id`/`shiftId` fields coming from the client are almost never a bare Shift.id — the
 * frontend's per-seat model means callers usually hold an Assignment id (a filled seat)
 * or a synthetic `${shiftId}:unfilled:N` id (an open one). Used by both the Phase 3
 * per-shift routes and Phase 4's swap/drop/claim creation, which takes a shiftId from the
 * same seat-shaped objects the schedule board and My Schedule already render.
 */
export async function resolveShiftIdFromSeatOrShiftId(id: string): Promise<string | null> {
  const direct = await prisma.shift.findUnique({ where: { id }, select: { id: true } })
  if (direct) return direct.id
  const resolved = await resolveSeatForMutation(id)
  return resolved?.shiftId ?? null
}

/** All Shift ids at a location whose location-local date falls in the given weekStart's
 *  Sunday-Saturday range — used by publish/unpublish, which operate on a whole week at
 *  once (matching the mock's `publishWeek(locationId, weekStart)` signature). */
export async function resolveShiftIdsForWeek(locationId: string, weekStart: string): Promise<string[]> {
  const location = await prisma.location.findUniqueOrThrow({ where: { id: locationId } })
  const startWindow = new Date(new Date(weekStart).getTime() - 24 * 3600 * 1000)
  const endWindow = new Date(startWindow.getTime() + 9 * 24 * 3600 * 1000)
  const shifts = await prisma.shift.findMany({
    where: { locationId, startsAt: { gte: startWindow, lt: endWindow } },
  })
  return shifts
    .filter((s) => {
      const date = formatInTimeZone(s.startsAt, location.timezone, 'yyyy-MM-dd')
      return weekStartKeyForDateString(date) === weekStart
    })
    .map((s) => s.id)
}
