import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth, requireRole } from '../middleware/auth'
import { ApiError } from '../middleware/errorHandler'
import {
  explodeShiftToSeats,
  resolveSeatById,
  resolveSeatForMutation,
  resolveShiftIdsForWeek,
  resolveShiftIdFromSeatOrShiftId,
} from '../lib/shiftSeats'
import { loadShiftAndLocation, buildEvaluationInputForStaff } from '../lib/assignmentContext'
import { computeCandidates, decideAssignment, toWireViolations } from '../lib/candidates'
import { evaluateAssignment, isBlocking, isOverridableBlocking } from '../engine'
import { writeAudit } from '../lib/auditLog'
import { assertManagerLocationAccess } from '../lib/managerScope'
import { performAssignment } from '../lib/performAssignment'
import { notify, type NotifyInput } from '../lib/notify'
import { PENDING_SWAP_STAGES } from './swaps'
import { emitToLocation } from '../lib/socket'
import { cancelPresenceForAssignment, schedulePresenceForAssignment } from '../lib/presenceScheduler'

export const shiftsRouter = Router()

const PUBLISH_CUTOFF_HOURS = 48

function isWithinPublishCutoff(startsAt: Date, now: Date = new Date()): boolean {
  const msUntilStart = startsAt.getTime() - now.getTime()
  return msUntilStart >= 0 && msUntilStart < PUBLISH_CUTOFF_HOURS * 3600 * 1000
}

async function seatsForShifts(shifts: Awaited<ReturnType<typeof prisma.shift.findMany>>) {
  if (shifts.length === 0) return []
  const locationIds = Array.from(new Set(shifts.map((s) => s.locationId)))
  const [assignments, locations] = await Promise.all([
    prisma.assignment.findMany({ where: { shiftId: { in: shifts.map((s) => s.id) } } }),
    prisma.location.findMany({ where: { id: { in: locationIds } } }),
  ])
  const timezoneByLocation = new Map(locations.map((l) => [l.id, l.timezone]))
  const assignmentsByShift = new Map<string, typeof assignments>()
  for (const a of assignments) {
    const list = assignmentsByShift.get(a.shiftId) ?? []
    list.push(a)
    assignmentsByShift.set(a.shiftId, list)
  }
  return shifts.flatMap((shift) =>
    explodeShiftToSeats(shift, assignmentsByShift.get(shift.id) ?? [], timezoneByLocation.get(shift.locationId)!),
  )
}

// GET /shifts?locationId=&weekStart=  -> one location's week (getShiftsForWeek)
// GET /shifts?weekStart=&allLocations=true -> every location's week (getShiftsForWeekAllLocations)
shiftsRouter.get('/shifts', requireAuth, async (req, res) => {
  const query = z
    .object({
      locationId: z.string().optional(),
      weekStart: z.string(),
      allLocations: z.coerce.boolean().optional(),
    })
    .parse(req.query)

  if (!query.allLocations && !query.locationId) {
    throw new ApiError(400, 'bad_request', 'locationId is required unless allLocations=true')
  }

  // weekStart identifies a shift by the location-local calendar date its seats fall on,
  // which we only know after loading each shift's location — so pull a slightly wider
  // UTC window first (the week's boundary Shift could be a day off in UTC for locations
  // west of UTC) and then filter precisely by the derived weekStart/date fields below.
  const startWindow = new Date(new Date(query.weekStart).getTime() - 24 * 3600 * 1000)
  const endWindow = new Date(startWindow.getTime() + 9 * 24 * 3600 * 1000)

  const shifts = await prisma.shift.findMany({
    where: {
      ...(query.locationId ? { locationId: query.locationId } : {}),
      startsAt: { gte: startWindow, lt: endWindow },
    },
  })

  const seats = (await seatsForShifts(shifts))
    .filter((s) => s.weekStart === query.weekStart)
    .sort((a, b) => a.startUtc.localeCompare(b.startUtc))
  res.json(seats)
})

shiftsRouter.get('/shifts/:id', requireAuth, async (req, res) => {
  const seat = await resolveSeatById(String(req.params.id))
  if (!seat) throw new ApiError(404, 'not_found', 'Shift not found')
  res.json(seat)
})

shiftsRouter.get('/staff/:staffId/shifts/upcoming', requireAuth, async (req, res) => {
  const staffId = String(req.params.staffId)
  const assignments = await prisma.assignment.findMany({
    where: {
      staffId,
      status: 'active',
      shift: { status: 'published', endsAt: { gt: new Date() } },
    },
    include: { shift: true },
  })
  if (assignments.length === 0) return res.json([])

  const locations = await prisma.location.findMany({
    where: { id: { in: Array.from(new Set(assignments.map((a) => a.shift.locationId))) } },
  })
  const timezoneByLocation = new Map(locations.map((l) => [l.id, l.timezone]))

  const seats = assignments.map((a) => explodeShiftToSeats(a.shift, [a], timezoneByLocation.get(a.shift.locationId)!)[0])
  seats.sort((a, b) => a.startUtc.localeCompare(b.startUtc))
  res.json(seats)
})

shiftsRouter.get('/staff/:staffId/shifts/claimable', requireAuth, async (req, res) => {
  const staffId = String(req.params.staffId)
  const [certs, myActiveAssignments] = await Promise.all([
    prisma.staffCertification.findMany({ where: { staffId, revokedAt: null }, include: { skill: true } }),
    prisma.assignment.findMany({ where: { staffId, status: 'active' }, include: { shift: true } }),
  ])
  if (certs.length === 0) return res.json([])

  const certifiedPairs = new Set(certs.map((c) => `${c.locationId}::${c.skill.key}`))
  const myRanges = myActiveAssignments.map((a) => ({ start: a.shift.startsAt, end: a.shift.endsAt }))

  const candidateShifts = await prisma.shift.findMany({
    where: { status: 'published', startsAt: { gt: new Date() } },
    include: { assignments: { where: { status: 'active' } } },
  })

  const openShifts = candidateShifts.filter((shift) => {
    if (!certifiedPairs.has(`${shift.locationId}::${shift.skillRequired}`)) return false
    if (shift.assignments.length >= shift.headcount) return false
    const overlapsMine = myRanges.some((r) => r.start < shift.endsAt && shift.startsAt < r.end)
    return !overlapsMine
  })

  const locations = await prisma.location.findMany({
    where: { id: { in: Array.from(new Set(openShifts.map((s) => s.locationId))) } },
  })
  const timezoneByLocation = new Map(locations.map((l) => [l.id, l.timezone]))

  // Only the unfilled seat(s) of each open shift are claimable — reuse the same explode
  // logic and drop the (already-filled) assigned seats.
  const seats = openShifts
    .flatMap((shift) => explodeShiftToSeats(shift, shift.assignments, timezoneByLocation.get(shift.locationId)!))
    .filter((seat) => seat.assignedStaffId === null)
    .sort((a, b) => a.startUtc.localeCompare(b.startUtc))
  res.json(seats)
})

// ---------------------------------------------------------------------------
// Phase 3: the constraint engine, wired to real data, and the mutations that use it.
// ---------------------------------------------------------------------------

shiftsRouter.get('/shifts/:id/candidates', requireAuth, async (req, res) => {
  const shiftId = await resolveShiftIdFromSeatOrShiftId(String(req.params.id))
  if (!shiftId) throw new ApiError(404, 'not_found', 'Shift not found')
  const loaded = await loadShiftAndLocation(shiftId)
  if (!loaded) throw new ApiError(404, 'not_found', 'Shift not found')
  const candidates = await computeCandidates(loaded.engineShift, loaded.engineLocation)
  res.json(candidates)
})

shiftsRouter.get('/shifts/:id/preview', requireAuth, async (req, res) => {
  const staffId = typeof req.query.staffId === 'string' ? req.query.staffId : undefined
  if (!staffId) throw new ApiError(400, 'bad_request', 'staffId query param is required')

  const shiftId = await resolveShiftIdFromSeatOrShiftId(String(req.params.id))
  if (!shiftId) throw new ApiError(404, 'not_found', 'Shift not found')
  const loaded = await loadShiftAndLocation(shiftId)
  if (!loaded) throw new ApiError(404, 'not_found', 'Shift not found')
  const input = await buildEvaluationInputForStaff(staffId, loaded.engineShift, loaded.engineLocation)
  if (!input) throw new ApiError(404, 'not_found', 'Staff member not found')

  res.json(toWireViolations(evaluateAssignment(input)))
})

const assignBodySchema = z.object({
  staffId: z.string(),
  override: z.boolean().optional(),
  overrideReason: z.string().optional(),
})

shiftsRouter.post('/shifts/:id/assign', requireAuth, requireRole('manager', 'admin'), async (req, res) => {
  const seatId = String(req.params.id)
  const body = assignBodySchema.parse(req.body)

  const resolved = await resolveSeatForMutation(seatId)
  if (!resolved) throw new ApiError(404, 'not_found', 'Shift not found')
  const { shiftId, existingAssignmentId } = resolved

  const loaded = await loadShiftAndLocation(shiftId)
  if (!loaded) throw new ApiError(404, 'not_found', 'Shift not found')
  await assertManagerLocationAccess(req.user!, loaded.engineLocation.id)

  const staffUser = await prisma.user.findUnique({ where: { id: body.staffId } })
  if (!staffUser) throw new ApiError(404, 'not_found', 'Staff member not found')

  const decision = await decideAssignment(loaded.engineShift, loaded.engineLocation, body.staffId)
  if (!decision) throw new ApiError(404, 'not_found', 'Staff member not found')

  if (decision.ok === false) {
    // A plain block (double-booking, cert mismatch, 10h rest gap, 12h daily cap,
    // unavailable) can never be forced through. The 7th-consecutive-day rule is the one
    // exception: it's still rejected here unless the caller already confirmed the
    // override, matching the mock's exact assignStaffToShift semantics. Thrown as an
    // ApiError (not a hand-rolled res.json) so it flows through the shared error
    // formatter — apiClient.ts on the frontend already knows how to unpack
    // `error.details` back into a structured AssignResult (see services/shifts.ts).
    const blocked =
      isBlocking(decision.violations) ||
      (isOverridableBlocking(decision.violations) && !body.override) ||
      (isOverridableBlocking(decision.violations) && (!body.overrideReason || !body.overrideReason.trim()))
    if (blocked) {
      throw new ApiError(422, 'assignment_blocked', decision.violations[0]?.message ?? 'Assignment blocked', {
        violations: toWireViolations(decision.violations),
      })
    }
  }

  const isOverride = decision.ok === false && isOverridableBlocking(decision.violations)
  const overrideReason = isOverride ? body.overrideReason!.trim() : null
  const overriddenRule = isOverride ? decision.violations.find((v) => v.severity === 'overridable') : undefined

  const created = await performAssignment({
    shiftId,
    staffId: body.staffId,
    staffName: staffUser.name,
    existingAssignmentId,
    assignedById: req.user!.id,
    isOverride,
    overrideReason,
    rangeStart: loaded.engineShift.startsAt,
    rangeEnd: loaded.engineShift.endsAt,
    locationId: loaded.engineLocation.id,
    auditAction: isOverride ? 'assigned_shift_override' : existingAssignmentId ? 'reassigned_shift' : 'assigned_shift',
    auditDetails: isOverride
      ? `Assigned ${staffUser.name} via manager override (${overriddenRule?.message ?? 'overridable rule'}). Reason: "${overrideReason}"`
      : `Assigned ${staffUser.name} to the shift${existingAssignmentId ? ' (previously assigned to someone else)' : ''}.`,
  })

  await notify(prisma, {
    userId: body.staffId,
    type: 'shift_reminder',
    title: 'New shift assigned',
    body: `You've been assigned a ${loaded.engineShift.skillRequired} shift.`,
    locationId: loaded.engineLocation.id,
  })

  // Weekly-overtime is a soft warning, not a block, so `decision.ok` can be true even
  // when this shift pushed someone over the threshold — re-check specifically for that
  // now that the assignment is committed, and let the manager know (§7's manager list).
  const postInput = await buildEvaluationInputForStaff(body.staffId, loaded.engineShift, loaded.engineLocation)
  const overtimeViolation = postInput ? evaluateAssignment(postInput).find((v) => v.rule === 'weekly_overtime') : undefined
  if (overtimeViolation) {
    const managers = await prisma.managerLocation.findMany({ where: { locationId: loaded.engineLocation.id } })
    await Promise.all(
      managers.map((m) =>
        notify(prisma, {
          userId: m.userId,
          type: 'overtime_warning',
          title: 'Overtime warning',
          body: overtimeViolation.message,
          locationId: loaded.engineLocation.id,
        }),
      ),
    )
  }

  const seat = await resolveSeatById(created.id)
  emitToLocation(loaded.engineLocation.id, 'schedule.updated', {
    title: 'Schedule updated',
    body: `${staffUser.name} was assigned to a shift.`,
    locationId: loaded.engineLocation.id,
    shiftId,
  })
  res.json({ ok: true, shift: seat })
})

shiftsRouter.post('/shifts/:id/unassign', requireAuth, requireRole('manager', 'admin'), async (req, res) => {
  const seatId = String(req.params.id)
  const resolved = await resolveSeatForMutation(seatId)
  if (!resolved || !resolved.existingAssignmentId) throw new ApiError(404, 'not_found', 'That seat has no one assigned to unassign')

  const loaded = await loadShiftAndLocation(resolved.shiftId)
  if (!loaded) throw new ApiError(404, 'not_found', 'Shift not found')
  await assertManagerLocationAccess(req.user!, loaded.engineLocation.id)

  const cancelled = await prisma.assignment.findUniqueOrThrow({ where: { id: resolved.existingAssignmentId } })

  await prisma.$transaction(async (tx) => {
    await tx.assignment.update({ where: { id: resolved.existingAssignmentId! }, data: { status: 'cancelled', cancelledAt: new Date() } })
    await writeAudit(tx, {
      actorId: req.user!.id,
      entityType: 'shift',
      entityId: resolved.shiftId,
      locationId: loaded.engineLocation.id,
      action: 'unassigned_shift',
      details: `Cleared the assignment for ${loaded.engineShift.skillRequired} on ${resolved.shiftId}.`,
      before: { staffId: cancelled.staffId },
    })
  })

  const [shiftRow, remainingAssignments] = await Promise.all([
    prisma.shift.findUniqueOrThrow({ where: { id: resolved.shiftId } }),
    prisma.assignment.findMany({ where: { shiftId: resolved.shiftId } }),
  ])
  const seats = explodeShiftToSeats(shiftRow, remainingAssignments, loaded.engineLocation.timezone)
  const nowUnfilled = seats.find((s) => s.assignedStaffId === null)

  cancelPresenceForAssignment({
    assignmentId: cancelled.id,
    staffId: cancelled.staffId,
    shiftId: resolved.shiftId,
    locationId: loaded.engineLocation.id,
    startsAt: loaded.engineShift.startsAt,
    endsAt: loaded.engineShift.endsAt,
  })
  emitToLocation(loaded.engineLocation.id, 'schedule.updated', {
    title: 'Schedule updated',
    body: 'A shift assignment was cleared.',
    locationId: loaded.engineLocation.id,
    shiftId: resolved.shiftId,
  })
  res.json(nowUnfilled ?? seats[0])
})

const weekBodySchema = z.object({ locationId: z.string(), weekStart: z.string() })

shiftsRouter.post('/shifts/publish', requireAuth, requireRole('manager', 'admin'), async (req, res) => {
  const body = weekBodySchema.parse(req.body)
  await assertManagerLocationAccess(req.user!, body.locationId)
  const shiftIds = await resolveShiftIdsForWeek(body.locationId, body.weekStart)

  const affectedStaffIds = await prisma.$transaction(async (tx) => {
    await tx.shift.updateMany({ where: { id: { in: shiftIds } }, data: { status: 'published' } })
    await writeAudit(tx, {
      actorId: req.user!.id,
      entityType: 'week',
      entityId: body.weekStart,
      locationId: body.locationId,
      action: 'published_schedule',
      details: `Published the week of ${body.weekStart}.`,
    })
    const assignments = await tx.assignment.findMany({ where: { shiftId: { in: shiftIds }, status: 'active' }, distinct: ['staffId'] })
    return assignments.map((a) => a.staffId)
  })

  const location = await prisma.location.findUniqueOrThrow({ where: { id: body.locationId } })
  await Promise.all(
    affectedStaffIds.map((staffId) =>
      notify(prisma, {
        userId: staffId,
        type: 'schedule_published',
        title: 'Schedule published',
        body: `${location.name}'s week of ${body.weekStart} is now live.`,
        locationId: body.locationId,
      }),
    ),
  )
  // A location-wide broadcast, not per-user: the per-user notify() calls above are for the
  // in-app notification badge (only staff who actually had a shift that week); this is for
  // anyone currently looking at this location's board or my-schedule view — including
  // managers, and staff who weren't in affectedStaffIds — to update live, per §6.
  emitToLocation(body.locationId, 'schedule.published', {
    title: 'Schedule published',
    body: `${location.name}'s week of ${body.weekStart} is now live.`,
    locationId: body.locationId,
  })
  res.status(204).send()
})

shiftsRouter.post('/shifts/unpublish', requireAuth, requireRole('manager', 'admin'), async (req, res) => {
  const body = weekBodySchema.parse(req.body)
  await assertManagerLocationAccess(req.user!, body.locationId)
  const shiftIds = await resolveShiftIdsForWeek(body.locationId, body.weekStart)

  await prisma.$transaction(async (tx) => {
    await tx.shift.updateMany({ where: { id: { in: shiftIds } }, data: { status: 'draft' } })
    await writeAudit(tx, {
      actorId: req.user!.id,
      entityType: 'week',
      entityId: body.weekStart,
      locationId: body.locationId,
      action: 'unpublished_schedule',
      details: `Moved the week of ${body.weekStart} back to draft.`,
    })
  })
  emitToLocation(body.locationId, 'schedule.updated', {
    title: 'Schedule updated',
    body: `The week of ${body.weekStart} was moved back to draft.`,
    locationId: body.locationId,
  })
  res.status(204).send()
})

const createShiftSchema = z.object({
  locationId: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  skillRequired: z.string(),
  headcount: z.number().int().min(1).default(1),
  isPremium: z.boolean().default(false),
})

shiftsRouter.post('/shifts', requireAuth, requireRole('manager', 'admin'), async (req, res) => {
  const body = createShiftSchema.parse(req.body)
  await assertManagerLocationAccess(req.user!, body.locationId)

  const shift = await prisma.$transaction(async (tx) => {
    const created = await tx.shift.create({
      data: {
        locationId: body.locationId,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        skillRequired: body.skillRequired,
        headcount: body.headcount,
        isPremium: body.isPremium,
        status: 'draft',
      },
    })
    await writeAudit(tx, {
      actorId: req.user!.id,
      entityType: 'shift',
      entityId: created.id,
      locationId: body.locationId,
      action: 'created_shift',
      details: `Created a ${body.skillRequired} shift.`,
      after: created,
    })
    return created
  })

  const location = await prisma.location.findUniqueOrThrow({ where: { id: shift.locationId } })
  emitToLocation(shift.locationId, 'schedule.updated', {
    title: 'Schedule updated',
    body: `A new ${body.skillRequired} shift was added.`,
    locationId: shift.locationId,
    shiftId: shift.id,
  })
  res.status(201).json(explodeShiftToSeats(shift, [], location.timezone)[0])
})

const patchShiftSchema = z.object({
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  skillRequired: z.string().optional(),
  headcount: z.number().int().min(1).optional(),
  isPremium: z.boolean().optional(),
})

shiftsRouter.patch('/shifts/:id', requireAuth, requireRole('manager', 'admin'), async (req, res) => {
  const shiftId = String(req.params.id)
  const patch = patchShiftSchema.parse(req.body)
  const existing = await prisma.shift.findUnique({ where: { id: shiftId } })
  if (!existing) throw new ApiError(404, 'not_found', 'Shift not found')

  const nextStartsAt = patch.startsAt ? new Date(patch.startsAt) : existing.startsAt
  const nextEndsAt = patch.endsAt ? new Date(patch.endsAt) : existing.endsAt
  const nextSkill = patch.skillRequired ?? existing.skillRequired
  const timeChanged = nextStartsAt.getTime() !== existing.startsAt.getTime() || nextEndsAt.getTime() !== existing.endsAt.getTime()
  const timeOrSkillChanged = timeChanged || nextSkill !== existing.skillRequired

  // Four lookups that only need values already in hand (existing.locationId / shiftId),
  // none depending on any other's result, so they run concurrently instead of as four
  // sequential round trips:
  //  - the manager-scope check
  //  - the location (this endpoint can't change a shift's locationId, so it's safe to
  //    fetch once here and reuse below instead of re-fetching after the transaction)
  //  - every swap request against this shift, in one query instead of two (the old code
  //    ran a separate `findFirst(stage: approved)` before the transaction and a second
  //    `findMany(stage: in pending)` inside it) — skipped entirely when the edit touches
  //    neither time nor skill, since neither the approved-swap re-check nor the
  //    pending-swap auto-cancel is relevant to any other kind of edit
  //  - this shift's assignments for the response body: explodeShiftToSeats only reads
  //    id/status/staffId/isOverride/overrideReason off each one (verified against its
  //    source), none of which this transaction changes (it only syncs rangeStart/rangeEnd,
  //    which nothing here reads) — so it's as fresh fetched now as fetched after commit
  const [, location, allSwapsForShift, assignmentsForResponse] = await Promise.all([
    assertManagerLocationAccess(req.user!, existing.locationId),
    prisma.location.findUniqueOrThrow({ where: { id: existing.locationId } }),
    timeOrSkillChanged ? prisma.swapRequest.findMany({ where: { shiftId } }) : Promise.resolve([]),
    prisma.assignment.findMany({ where: { shiftId } }),
  ])

  // Edit-after-swap-approval: if an approved swap put someone new on this shift, re-run
  // the engine for that person against the *proposed* new time/skill before applying
  // anything — surfaced as a conflict rather than silently applying the edit or silently
  // reverting the swap, per the settled decision.
  const approvedSwap = allSwapsForShift.find((s) => s.stage === 'approved')
  const assigneeId = approvedSwap ? (approvedSwap.type === 'swap' ? approvedSwap.toStaffId : approvedSwap.type === 'claim' ? approvedSwap.fromStaffId : null) : null
  if (assigneeId) {
    const proposedShift = { id: shiftId, locationId: existing.locationId, startsAt: nextStartsAt, endsAt: nextEndsAt, skillRequired: nextSkill }
    const input = await buildEvaluationInputForStaff(assigneeId, proposedShift, { id: location.id, name: location.name, timezone: location.timezone }, shiftId)
    if (input) {
      const violations = evaluateAssignment(input)
      if (isBlocking(violations) || isOverridableBlocking(violations)) {
        throw new ApiError(409, 'swap_conflict', 'This edit conflicts with an approved swap already on this shift.', {
          violations: toWireViolations(violations),
        })
      }
    }
  }

  // Read once, above, rather than re-querying inside the transaction — a small window
  // exists where a pending swap could be resolved by someone else between that read and
  // the write below (this was already true before, just with a marginally smaller
  // window; nothing here adds pessimistic locking, matching the existing, not-hardened,
  // capacity-race note from Phase 3).
  const pendingSwaps = allSwapsForShift.filter((s) => (PENDING_SWAP_STAGES as readonly string[]).includes(s.stage))

  // Notifications are collected as plain data inside the transaction and sent afterward
  // (see swaps.ts's sendNotifications for the incident this fixes: notify() running on
  // `tx` — several sequential Neon round trips per recipient — could push this
  // transaction past Prisma's 5000ms interactive-transaction timeout, which doesn't fail
  // cleanly; it kills the transaction underneath the still-running callback, and the next
  // `tx.*` call throws P2028 well after the real deadline, surfacing as a raw 500).
  const { updated, notifications } = await prisma.$transaction(async (tx) => {
    const result = await tx.shift.update({
      where: { id: shiftId },
      data: {
        startsAt: nextStartsAt,
        endsAt: nextEndsAt,
        skillRequired: nextSkill,
        headcount: patch.headcount ?? existing.headcount,
        isPremium: patch.isPremium ?? existing.isPremium,
      },
    })
    // Assignment.rangeStart/rangeEnd are a denormalized copy of the shift's time range
    // (the exclusion constraint can't reference a joined table) — they must stay in sync
    // whenever the shift's own time changes, or the DB-level double-booking check would
    // silently start checking stale ranges.
    if (timeChanged) {
      await tx.assignment.updateMany({
        where: { shiftId, status: 'active' },
        data: { rangeStart: nextStartsAt, rangeEnd: nextEndsAt },
      })
    }
    await writeAudit(tx, {
      actorId: req.user!.id,
      entityType: 'shift',
      entityId: shiftId,
      locationId: existing.locationId,
      action: 'edited_shift',
      details: existing.status === 'published' && isWithinPublishCutoff(existing.startsAt)
        ? 'Edited a published shift inside the 48-hour publish cutoff.'
        : 'Edited a shift.',
      before: existing,
      after: result,
    })

    // A *pending* swap (unlike an approved one, above) hasn't taken effect yet — nothing
    // to protect by re-running the engine, so instead of blocking the manager's edit, the
    // stale request is simply cancelled with a notification to whoever was waiting on it.
    const pendingNotifications: NotifyInput[] = []
    for (const pending of pendingSwaps) {
      await tx.swapRequest.update({ where: { id: pending.id }, data: { stage: 'cancelled', resolvedAt: new Date() } })
      await writeAudit(tx, {
        actorId: req.user!.id,
        entityType: 'swap',
        entityId: pending.id,
        locationId: existing.locationId,
        action: 'auto_cancelled_swap',
        details: 'Automatically cancelled because the manager edited the shift while this request was still pending.',
      })
      const recipients = [pending.fromStaffId, ...(pending.toStaffId ? [pending.toStaffId] : [])]
      for (const userId of recipients) {
        pendingNotifications.push({
          userId,
          type: 'swap_resolved',
          title: 'Swap request cancelled',
          body: 'Your pending request was cancelled because the manager changed this shift.',
          locationId: existing.locationId,
          shiftId,
        })
      }
    }
    return { updated: result, notifications: pendingNotifications }
  })

  await Promise.all(notifications.map((n) => notify(prisma, n)))

  // Outside the transaction, after it committed: presence timers are an in-memory
  // convenience layer (see presenceScheduler.ts), not something that needs to be atomic
  // with the shift edit, and rescheduling them can never roll back or slow this response.
  if (timeChanged) {
    for (const a of assignmentsForResponse) {
      if (a.status !== 'active') continue
      schedulePresenceForAssignment({
        assignmentId: a.id,
        staffId: a.staffId,
        shiftId,
        locationId: existing.locationId,
        startsAt: nextStartsAt,
        endsAt: nextEndsAt,
      })
    }
  }
  emitToLocation(existing.locationId, 'schedule.updated', {
    title: 'Schedule updated',
    body: 'A shift was edited.',
    locationId: existing.locationId,
    shiftId,
  })

  res.json(explodeShiftToSeats(updated, assignmentsForResponse, location.timezone))
})

shiftsRouter.delete('/shifts/:id', requireAuth, requireRole('manager', 'admin'), async (req, res) => {
  const shiftId = String(req.params.id)
  const existing = await prisma.shift.findUnique({ where: { id: shiftId } })
  if (!existing) throw new ApiError(404, 'not_found', 'Shift not found')
  await assertManagerLocationAccess(req.user!, existing.locationId)

  // Assignment rows are never deleted (kept historically, even once cancelled — see the
  // schema comment on the model), so any shift that was ever assigned to anyone has a
  // hard FK pointing at it (`Assignment_shiftId_fkey`, no cascade). Hard-deleting such a
  // shift is a data-integrity violation, not just a Prisma error to swallow — caught here
  // with a clear 409 instead of letting the FK violation surface as a raw 500.
  const everAssignedCount = await prisma.assignment.count({ where: { shiftId } })
  if (everAssignedCount > 0) {
    throw new ApiError(
      409,
      'has_assignment_history',
      'This shift has assignment history (active or past) and cannot be deleted — audit/assignment records are never removed. Unassign and leave it as an empty draft instead.',
    )
  }
  // SwapRequest.shiftId is also a hard FK (no cascade) — same reasoning as Assignment
  // above, checked separately since a shift can gain swap requests without ever having
  // had an Assignment (e.g. a claim request against a still-open seat).
  const swapCount = await prisma.swapRequest.count({ where: { shiftId } })
  if (swapCount > 0) {
    throw new ApiError(409, 'has_swap_history', 'This shift has swap/drop/claim requests on record and cannot be deleted.')
  }

  await prisma.$transaction(async (tx) => {
    await writeAudit(tx, {
      actorId: req.user!.id,
      entityType: 'shift',
      entityId: shiftId,
      locationId: existing.locationId,
      action: 'deleted_shift',
      before: existing,
    })
    await tx.shift.delete({ where: { id: shiftId } })
  })
  emitToLocation(existing.locationId, 'schedule.updated', {
    title: 'Schedule updated',
    body: 'A shift was deleted.',
    locationId: existing.locationId,
  })
  res.status(204).send()
})
