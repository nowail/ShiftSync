import { prisma } from './prisma'
import { ApiError } from '../middleware/errorHandler'
import { writeAudit } from './auditLog'
import { isExclusionViolation } from './dbErrors'
import { emitToUser } from './socket'
import { schedulePresenceForAssignment, cancelPresenceForAssignment } from './presenceScheduler'

export interface PerformAssignmentInput {
  shiftId: string
  staffId: string
  staffName: string
  existingAssignmentId?: string | null
  assignedById: string
  isOverride: boolean
  overrideReason: string | null
  rangeStart: Date
  rangeEnd: Date
  locationId: string
  auditAction: string
  auditDetails: string
}

/**
 * The core "take this seat" transaction — shared by POST /shifts/:id/assign (Phase 3) and
 * the swap-approval endpoints (Phase 4, for `swap`/`claim` approvals, which are just an
 * assignment change with extra paperwork). Row-locks the Shift before counting active
 * assignments (see Phase 3's race-condition fix), cancels a prior assignment on this seat
 * if replacing one, and translates both the app-level capacity guard and a genuine
 * DB-level exclusion-constraint race into the same structured 422 shape — one place to
 * get this right instead of two copies drifting apart.
 */
export async function performAssignment(input: PerformAssignmentInput) {
  let result: { assignment: { id: string; staffId: string }; cancelledStaffId: string | null }
  try {
    result = await prisma.$transaction(async (tx) => {
      const lockedShift = await tx.$queryRaw<{ id: string; headcount: number }[]>`
        SELECT id, headcount FROM "Shift" WHERE id = ${input.shiftId} FOR UPDATE
      `
      if (lockedShift.length === 0) throw new ApiError(404, 'not_found', 'Shift not found')

      let cancelledStaffId: string | null = null
      if (input.existingAssignmentId) {
        const cancelled = await tx.assignment.update({
          where: { id: input.existingAssignmentId },
          data: { status: 'cancelled', cancelledAt: new Date() },
        })
        cancelledStaffId = cancelled.staffId
      }
      const activeCount = await tx.assignment.count({ where: { shiftId: input.shiftId, status: 'active' } })
      if (activeCount >= lockedShift[0].headcount) {
        const message = 'This shift is already fully staffed — someone else was just assigned to the last open seat.'
        throw new ApiError(422, 'fully_staffed', message, { violations: [{ type: 'double_booking', severity: 'hard', message }] })
      }

      const assignment = await tx.assignment.create({
        data: {
          shiftId: input.shiftId,
          staffId: input.staffId,
          status: 'active',
          assignedById: input.assignedById,
          isOverride: input.isOverride,
          overrideReason: input.overrideReason,
          rangeStart: input.rangeStart,
          rangeEnd: input.rangeEnd,
        },
      })

      await writeAudit(tx, {
        actorId: input.assignedById,
        entityType: 'shift',
        entityId: input.shiftId,
        locationId: input.locationId,
        action: input.auditAction,
        details: input.auditDetails,
        after: { staffId: input.staffId, isOverride: input.isOverride, overrideReason: input.overrideReason },
      })

      return { assignment, cancelledStaffId }
    })
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (isExclusionViolation(err)) {
      // Fired the instant the DB catches a genuine concurrent race — the manager who lost
      // it (this request) sees it live, not on their next poll. Outside the transaction
      // (which has already rolled back by the time this catch runs) and non-blocking, per
      // socket.ts's emitToUser contract.
      const message = `${input.staffName} was just booked into an overlapping shift by another manager — refresh and try again.`
      emitToUser(input.assignedById, 'assignment.conflict', {
        title: 'Assignment conflict',
        body: message,
        locationId: input.locationId,
        shiftId: input.shiftId,
      })
      throw new ApiError(422, 'assignment_blocked', message, {
        violations: [{ type: 'double_booking', severity: 'hard', message }],
      })
    }
    throw err
  }

  // Outside the transaction, after it has committed: an in-memory presence timer has no
  // correctness reason to be atomic with the assignment write, and a delay here can never
  // roll back or slow down the response that already went out.
  schedulePresenceForAssignment({
    assignmentId: result.assignment.id,
    staffId: input.staffId,
    shiftId: input.shiftId,
    locationId: input.locationId,
    startsAt: input.rangeStart,
    endsAt: input.rangeEnd,
  })
  if (input.existingAssignmentId && result.cancelledStaffId) {
    cancelPresenceForAssignment({
      assignmentId: input.existingAssignmentId,
      staffId: result.cancelledStaffId,
      shiftId: input.shiftId,
      locationId: input.locationId,
      startsAt: input.rangeStart,
      endsAt: input.rangeEnd,
    })
  }

  return result.assignment
}
