import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth, requireRole } from '../middleware/auth'
import { ApiError } from '../middleware/errorHandler'
import { writeAudit } from '../lib/auditLog'
import { notify, type NotifyInput } from '../lib/notify'
import { assertManagerLocationAccess } from '../lib/managerScope'
import { loadShiftAndLocation, buildEvaluationInputForStaff } from '../lib/assignmentContext'
import { resolveShiftIdFromSeatOrShiftId } from '../lib/shiftSeats'
import { decideAssignment, toWireViolations } from '../lib/candidates'
import { isBlocking, isOverridableBlocking, evaluateAssignment } from '../engine'
import { performAssignment } from '../lib/performAssignment'
import { emitToLocation } from '../lib/socket'
import { cancelPresenceForAssignment } from '../lib/presenceScheduler'

export const swapsRouter = Router()

// Terminal states end a swap's active life; everything else is still "pending" for the
// purposes of the 3-request cap, the withdraw window, and the auto-cancel-on-edit rule.
// Exported for PATCH /shifts/:id, which needs the same definition of "pending" to
// auto-cancel in-flight requests when the manager edits their shift out from under them.
export const PENDING_SWAP_STAGES = ['requested', 'peer_accepted', 'awaiting_manager'] as const
const PENDING_STAGES = PENDING_SWAP_STAGES
const MAX_PENDING_REQUESTS = 3

// Every mutation below returns its notifications as plain data instead of sending them
// from inside `prisma.$transaction(...)` — see notify.ts and the Phase 4 incident this
// fixed: notify() was running on the transaction's `tx` client, and a chain of several
// sequential notification writes (each a real Neon round trip) routinely pushed a
// transaction like PATCH /shifts/:id's auto-cancel path past Prisma's 5000ms interactive
// transaction timeout — which doesn't fail cleanly, it kills the transaction and the
// *next* `tx.*` call throws P2028 ("Transaction not found"), surfacing as a raw 500 long
// after the real deadline passed. Notifications also have no correctness reason to be
// atomic with the mutation they describe: a shift edit or swap decision that already
// committed shouldn't be undone by a slow or failed notification, and nothing here reads
// its own notifications back inside the same transaction. Audit writes stay on `tx` —
// unlike notifications, the audit trail describes the mutation itself and should never
// exist without it (or vice versa).
async function sendNotifications(notifications: NotifyInput[]) {
  await Promise.all(notifications.map((n) => notify(prisma, n)))
}

type RawSwap = {
  id: string
  type: string
  fromStaffId: string
  shiftId: string
  toStaffId: string | null
  stage: string
  createdAt: Date
  resolvedAt: Date | null
  expiresAt: Date | null
}

// Drop requests are computed-expired at read time from `expiresAt` (set at creation to
// shift.startsAt - 24h) — a "hint column, not a source of truth," per the schema comment
// and the documented no-cron decision. The persisted `stage` never changes just because
// time passed; only the *displayed* stage does.
function isExpiredDrop(swap: RawSwap, now: Date = new Date()): boolean {
  return swap.type === 'drop' && (PENDING_STAGES as readonly string[]).includes(swap.stage) && swap.expiresAt !== null && now > swap.expiresAt
}

function toHistory(swap: RawSwap) {
  const history: { stage: string; at: string; note?: string }[] = [{ stage: 'requested', at: swap.createdAt.toISOString() }]
  if (swap.resolvedAt && swap.stage !== 'requested') {
    history.push({ stage: swap.stage, at: swap.resolvedAt.toISOString() })
  }
  return history
}

function toSwapRequest(swap: RawSwap) {
  return {
    id: swap.id,
    type: swap.type,
    requestingStaffId: swap.fromStaffId,
    shiftId: swap.shiftId,
    targetStaffId: swap.toStaffId,
    stage: isExpiredDrop(swap) ? 'expired' : swap.stage,
    createdAt: swap.createdAt.toISOString(),
    history: toHistory(swap),
  }
}

swapsRouter.get('/swaps', requireAuth, async (req, res) => {
  const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : undefined
  const staffId = typeof req.query.staffId === 'string' ? req.query.staffId : undefined

  const swaps = await prisma.swapRequest.findMany({
    where: {
      ...(locationId ? { shift: { locationId } } : {}),
      ...(staffId ? { OR: [{ fromStaffId: staffId }, { toStaffId: staffId }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })
  res.json(swaps.map(toSwapRequest))
})

swapsRouter.get('/staff/:staffId/swaps/pending-count', requireAuth, async (req, res) => {
  const count = await prisma.swapRequest.count({
    where: { fromStaffId: String(req.params.staffId), stage: { in: [...PENDING_STAGES] } },
  })
  res.json(count)
})

async function findActiveAssignment(shiftId: string, staffId: string) {
  return prisma.assignment.findFirst({ where: { shiftId, staffId, status: 'active' } })
}

const createSwapSchema = z.object({
  type: z.enum(['swap', 'drop', 'claim']),
  shiftId: z.string(),
  targetStaffId: z.string().optional(),
})

swapsRouter.post('/swaps', requireAuth, async (req, res) => {
  const body = createSwapSchema.parse(req.body)
  const requesterId = req.user!.id

  // Neither depends on the other's result — the pending-cap count only needs
  // requesterId, resolving the shift id only needs the raw body.shiftId.
  const [pendingCount, shiftId] = await Promise.all([
    prisma.swapRequest.count({ where: { fromStaffId: requesterId, stage: { in: [...PENDING_STAGES] } } }),
    resolveShiftIdFromSeatOrShiftId(body.shiftId),
  ])
  if (pendingCount >= MAX_PENDING_REQUESTS) {
    throw new ApiError(422, 'pending_cap_reached', `You're at the ${MAX_PENDING_REQUESTS}-request limit. Resolve an existing request first.`)
  }
  if (!shiftId) throw new ApiError(404, 'not_found', 'Shift not found')

  // All three depend only on the now-known shiftId / body fields, not on each other's
  // results: loading the shift, checking whether the requester currently holds it, and
  // (swap only) looking up the named target. `target` is skipped entirely for drop/claim,
  // which don't name one.
  const [loaded, myAssignment, target] = await Promise.all([
    loadShiftAndLocation(shiftId),
    findActiveAssignment(shiftId, requesterId),
    body.type === 'swap' && body.targetStaffId ? prisma.user.findUnique({ where: { id: body.targetStaffId } }) : Promise.resolve(null),
  ])
  if (!loaded) throw new ApiError(404, 'not_found', 'Shift not found')

  if (body.type === 'swap' || body.type === 'drop') {
    if (!myAssignment) throw new ApiError(400, 'bad_request', "You aren't currently assigned to this shift")
    if (body.type === 'swap' && !body.targetStaffId) throw new ApiError(400, 'bad_request', 'targetStaffId is required for a swap')
    if (body.type === 'swap' && !target) throw new ApiError(404, 'not_found', 'Target staff member not found')
  } else {
    // claim: must not already be on this shift, and — "runs through the same Phase 3
    // engine before confirming" — must actually be eligible right now, not just
    // theoretically qualified. Re-checked again at manager-approval time too, since real
    // time passes between a claim request and its approval.
    if (myAssignment) throw new ApiError(400, 'bad_request', 'You are already assigned to this shift')
    const input = await buildEvaluationInputForStaff(requesterId, loaded.engineShift, loaded.engineLocation)
    if (!input) throw new ApiError(404, 'not_found', 'Staff member not found')
    const violations = evaluateAssignment(input)
    if (isBlocking(violations) || isOverridableBlocking(violations)) {
      throw new ApiError(422, 'assignment_blocked', violations[0]?.message ?? 'You are not eligible for this shift', {
        violations: toWireViolations(violations),
      })
    }
  }

  const expiresAt = body.type === 'drop' ? new Date(loaded.engineShift.startsAt.getTime() - 24 * 3600 * 1000) : null

  const { swap, notifications } = await prisma.$transaction(async (tx) => {
    const created = await tx.swapRequest.create({
      data: {
        type: body.type,
        shiftId,
        fromStaffId: requesterId,
        toStaffId: body.type === 'swap' ? body.targetStaffId : null,
        stage: body.type === 'claim' ? 'awaiting_manager' : 'requested',
        expiresAt,
      },
    })
    const requester = await tx.user.findUniqueOrThrow({ where: { id: requesterId } })
    await writeAudit(tx, {
      actorId: requesterId,
      entityType: 'swap',
      entityId: created.id,
      locationId: loaded.engineLocation.id,
      action: `requested_${body.type}`,
      details: `${requester.name} requested a ${body.type} for the ${loaded.engineShift.skillRequired} shift.`,
    })

    const pendingNotifications: NotifyInput[] = []
    if (body.type === 'swap' && body.targetStaffId) {
      pendingNotifications.push({
        userId: body.targetStaffId,
        type: 'swap_requested',
        title: 'New swap request',
        body: `${requester.name} wants to swap a shift with you.`,
        locationId: loaded.engineLocation.id,
        shiftId,
      })
    } else {
      // drop/claim need a manager's sign-off, not a peer's — notify the location's managers.
      const managers = await tx.managerLocation.findMany({ where: { locationId: loaded.engineLocation.id } })
      for (const m of managers) {
        pendingNotifications.push({
          userId: m.userId,
          type: 'swap_requested',
          title: `${body.type === 'drop' ? 'Drop' : 'Claim'} needs approval`,
          body: `${requester.name} requested to ${body.type === 'drop' ? 'drop' : 'claim'} a ${loaded.engineShift.skillRequired} shift.`,
          locationId: loaded.engineLocation.id,
          shiftId,
        })
      }
    }

    return { swap: created, notifications: pendingNotifications }
  })

  await sendNotifications(notifications)
  res.status(201).json(toSwapRequest(swap))
})

swapsRouter.post('/swaps/:id/respond', requireAuth, async (req, res) => {
  const { accept } = z.object({ accept: z.boolean() }).parse(req.body)
  const swap = await prisma.swapRequest.findUnique({ where: { id: String(req.params.id) } })
  if (!swap) throw new ApiError(404, 'not_found', 'Swap request not found')
  if (swap.type !== 'swap' || swap.toStaffId !== req.user!.id) {
    throw new ApiError(403, 'forbidden', 'Only the requested swap partner can respond to this')
  }
  if (swap.stage !== 'requested') throw new ApiError(409, 'invalid_stage', 'This request has already moved past the peer-response stage')

  // None of these three depends on either of the others — shift only needs
  // swap.shiftId, requester only needs swap.fromStaffId, responder only needs
  // req.user.id — all already known.
  const [shift, requester, responder] = await Promise.all([
    prisma.shift.findUniqueOrThrow({ where: { id: swap.shiftId } }),
    prisma.user.findUniqueOrThrow({ where: { id: swap.fromStaffId } }),
    prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } }),
  ])

  const nextStage = accept ? 'awaiting_manager' : 'rejected'
  const { updated, notifications } = await prisma.$transaction(async (tx) => {
    const result = await tx.swapRequest.update({
      where: { id: swap.id },
      data: { stage: nextStage, resolvedAt: accept ? undefined : new Date() },
    })
    await writeAudit(tx, {
      actorId: req.user!.id,
      entityType: 'swap',
      entityId: swap.id,
      locationId: shift.locationId,
      action: accept ? 'peer_accepted_swap' : 'peer_declined_swap',
      details: `${responder.name} ${accept ? 'accepted' : 'declined'} the swap request from ${requester.name}.`,
    })

    const pendingNotifications: NotifyInput[] = []
    if (accept) {
      const managers = await tx.managerLocation.findMany({ where: { locationId: shift.locationId } })
      for (const m of managers) {
        pendingNotifications.push({
          userId: m.userId,
          type: 'swap_requested',
          title: 'Swap ready for approval',
          body: `${responder.name} accepted a swap with ${requester.name} — awaiting your approval.`,
          locationId: shift.locationId,
          shiftId: shift.id,
        })
      }
    } else {
      pendingNotifications.push({
        userId: requester.id,
        type: 'swap_resolved',
        title: 'Swap declined',
        body: `${responder.name} declined your swap request.`,
        locationId: shift.locationId,
        shiftId: shift.id,
      })
    }
    return { updated: result, notifications: pendingNotifications }
  })

  await sendNotifications(notifications)
  res.json(toSwapRequest(updated))
})

swapsRouter.post('/swaps/:id/withdraw', requireAuth, async (req, res) => {
  const swap = await prisma.swapRequest.findUnique({ where: { id: String(req.params.id) } })
  if (!swap) throw new ApiError(404, 'not_found', 'Swap request not found')
  if (swap.fromStaffId !== req.user!.id) throw new ApiError(403, 'forbidden', 'Only the requester can withdraw this')
  if (!(PENDING_STAGES as readonly string[]).includes(swap.stage)) {
    throw new ApiError(409, 'invalid_stage', 'This request has already been resolved and can no longer be withdrawn')
  }

  // Neither depends on the other — shift only needs swap.shiftId, requester only needs
  // req.user.id (== swap.fromStaffId here, but fetched fresh for an up-to-date name).
  const [shift, requester] = await Promise.all([
    prisma.shift.findUniqueOrThrow({ where: { id: swap.shiftId } }),
    prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } }),
  ])

  // Regret Swap, implemented exactly as documented: withdrawing before manager approval
  // simply cancels the request. The original assignment was never touched while the
  // request was pending, so there is nothing to revert here.
  const { updated, notifications } = await prisma.$transaction(async (tx) => {
    const result = await tx.swapRequest.update({ where: { id: swap.id }, data: { stage: 'cancelled', resolvedAt: new Date() } })
    await writeAudit(tx, {
      actorId: req.user!.id,
      entityType: 'swap',
      entityId: swap.id,
      locationId: shift.locationId,
      action: 'withdrew_swap',
      details: `${requester.name} withdrew their ${swap.type} request.`,
    })
    const pendingNotifications: NotifyInput[] = swap.toStaffId
      ? [{ userId: swap.toStaffId, type: 'swap_resolved', title: 'Swap withdrawn', body: `${requester.name} withdrew their swap request.`, locationId: shift.locationId, shiftId: shift.id }]
      : []
    return { updated: result, notifications: pendingNotifications }
  })

  await sendNotifications(notifications)
  res.json(toSwapRequest(updated))
})

// Pure — no DB. Shared by approve/reject; each fetches what it individually needs
// itself now (their needs diverged too much for one shared fetch-and-validate helper to
// stay simple), but the terminal/stage/expiry rules are identical.
function assertSwapActionable(swap: RawSwap) {
  if (swap.stage === 'approved' || swap.stage === 'rejected' || swap.stage === 'cancelled') {
    throw new ApiError(409, 'invalid_stage', 'This request has already been resolved')
  }
  if (swap.type === 'swap' && swap.stage !== 'awaiting_manager') {
    throw new ApiError(409, 'invalid_stage', 'This swap is still waiting on the peer to accept')
  }
  if (isExpiredDrop(swap)) {
    throw new ApiError(409, 'expired', 'This drop request expired — the shift starts within 24 hours')
  }
}

swapsRouter.post('/swaps/:id/approve', requireAuth, requireRole('manager', 'admin'), async (req, res) => {
  const swap = await prisma.swapRequest.findUnique({ where: { id: String(req.params.id) } })
  if (!swap) throw new ApiError(404, 'not_found', 'Swap request not found')
  assertSwapActionable(swap)

  // Five lookups, all keyed off swap.shiftId / swap.fromStaffId / req.user.id — already
  // known, none depending on any other's result:
  //  - shift and the two user profiles
  //  - myAssignment (used by the drop/swap branches only, harmless to always fetch)
  //  - target, WITH active certifications included so the swap branch below can hand it
  //    straight to buildEvaluationInputForStaff instead of that function re-fetching the
  //    exact same user a second time (the duplicate this pass specifically fixes) —
  //    fetched only for `swap` type, since drop/claim have no target
  const [shift, requester, manager, myAssignment, target] = await Promise.all([
    prisma.shift.findUniqueOrThrow({ where: { id: swap.shiftId } }),
    prisma.user.findUniqueOrThrow({ where: { id: swap.fromStaffId } }),
    prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } }),
    findActiveAssignment(swap.shiftId, swap.fromStaffId),
    swap.type === 'swap' && swap.toStaffId
      ? prisma.user.findUnique({
          where: { id: swap.toStaffId },
          include: { certifications: { where: { revokedAt: null }, include: { skill: true } } },
        })
      : Promise.resolve(null),
  ])

  // Both only need shift.locationId (just resolved above) and don't depend on each other.
  const [, engineLocation] = await Promise.all([
    assertManagerLocationAccess(req.user!, shift.locationId),
    prisma.location.findUniqueOrThrow({ where: { id: shift.locationId } }),
  ])

  const engineShift = { id: shift.id, locationId: shift.locationId, startsAt: shift.startsAt, endsAt: shift.endsAt, skillRequired: shift.skillRequired }
  const engineLocationInput = { id: engineLocation.id, name: engineLocation.name, timezone: engineLocation.timezone }

  let notifications: NotifyInput[] = []

  if (swap.type === 'drop') {
    if (!myAssignment) throw new ApiError(409, 'invalid_stage', `${requester.name} is no longer assigned to this shift`)
    await prisma.$transaction(async (tx) => {
      await tx.assignment.update({ where: { id: myAssignment.id }, data: { status: 'cancelled', cancelledAt: new Date() } })
      await tx.swapRequest.update({ where: { id: swap.id }, data: { stage: 'approved', resolvedAt: new Date() } })
      await writeAudit(tx, {
        actorId: req.user!.id,
        entityType: 'swap',
        entityId: swap.id,
        locationId: shift.locationId,
        action: 'approved_drop',
        details: `${manager.name} approved ${requester.name}'s drop request.`,
      })
    })
    cancelPresenceForAssignment({
      assignmentId: myAssignment.id,
      staffId: myAssignment.staffId,
      shiftId: shift.id,
      locationId: shift.locationId,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
    })
    notifications = [
      {
        userId: requester.id,
        type: 'swap_resolved',
        title: 'Drop approved',
        body: `Your drop request was approved — you're no longer on that shift.`,
        locationId: shift.locationId,
        shiftId: shift.id,
      },
    ]
  } else if (swap.type === 'claim') {
    // Re-run the engine now, not just at request time — real time has passed.
    const decision = await decideAssignment(engineShift, engineLocationInput, swap.fromStaffId)
    if (!decision) throw new ApiError(404, 'not_found', 'Staff member not found')
    if (decision.ok === false && (isBlocking(decision.violations) || isOverridableBlocking(decision.violations))) {
      throw new ApiError(422, 'assignment_blocked', decision.violations[0]?.message ?? 'No longer eligible for this shift', {
        violations: toWireViolations(decision.violations),
      })
    }
    await performAssignment({
      shiftId: swap.shiftId,
      staffId: swap.fromStaffId,
      staffName: requester.name,
      assignedById: req.user!.id,
      isOverride: false,
      overrideReason: null,
      rangeStart: shift.startsAt,
      rangeEnd: shift.endsAt,
      locationId: shift.locationId,
      auditAction: 'approved_claim',
      auditDetails: `${manager.name} approved ${requester.name}'s claim on the shift.`,
    })
    await prisma.swapRequest.update({ where: { id: swap.id }, data: { stage: 'approved', resolvedAt: new Date() } })
    notifications = [
      {
        userId: requester.id,
        type: 'swap_resolved',
        title: 'Claim approved',
        body: `Your claim was approved — you're now on that shift.`,
        locationId: shift.locationId,
        shiftId: shift.id,
      },
    ]
  } else {
    // swap: re-check the incoming person too, not just at the moment they accepted.
    if (!target) throw new ApiError(404, 'not_found', 'Staff member not found')
    if (!myAssignment) throw new ApiError(409, 'invalid_stage', `${requester.name} is no longer assigned to this shift`)

    const input = await buildEvaluationInputForStaff(target.id, engineShift, engineLocationInput, swap.shiftId, target)
    if (!input) throw new ApiError(404, 'not_found', 'Staff member not found')
    const violations = evaluateAssignment(input)
    if (isBlocking(violations) || isOverridableBlocking(violations)) {
      throw new ApiError(422, 'assignment_blocked', violations[0]?.message ?? `${target.name} is no longer eligible for this shift`, {
        violations: toWireViolations(violations),
      })
    }

    await performAssignment({
      shiftId: swap.shiftId,
      staffId: target.id,
      staffName: target.name,
      existingAssignmentId: myAssignment.id,
      assignedById: req.user!.id,
      isOverride: false,
      overrideReason: null,
      rangeStart: shift.startsAt,
      rangeEnd: shift.endsAt,
      locationId: shift.locationId,
      auditAction: 'approved_swap',
      auditDetails: `${manager.name} approved the swap: ${requester.name} -> ${target.name}.`,
    })
    await prisma.swapRequest.update({ where: { id: swap.id }, data: { stage: 'approved', resolvedAt: new Date() } })
    notifications = [
      {
        userId: requester.id,
        type: 'swap_resolved',
        title: 'Swap approved',
        body: `Your swap with ${target.name} was approved.`,
        locationId: shift.locationId,
        shiftId: shift.id,
      },
      {
        userId: target.id,
        type: 'swap_resolved',
        title: 'Swap approved',
        body: `You've been given a shift from ${requester.name}.`,
        locationId: shift.locationId,
        shiftId: shift.id,
      },
    ]
  }

  // The refreshed swap row doesn't depend on the notifications having gone out — both
  // just need the mutation above to have already committed, so they run together.
  const [updated] = await Promise.all([prisma.swapRequest.findUniqueOrThrow({ where: { id: swap.id } }), sendNotifications(notifications)])
  emitToLocation(shift.locationId, 'schedule.updated', {
    title: 'Schedule updated',
    body: `A ${swap.type} request was approved.`,
    locationId: shift.locationId,
    shiftId: shift.id,
  })
  res.json(toSwapRequest(updated))
})

const rejectSchema = z.object({ reason: z.string().optional() })

swapsRouter.post('/swaps/:id/reject', requireAuth, requireRole('manager', 'admin'), async (req, res) => {
  const { reason } = rejectSchema.parse(req.body)
  const swap = await prisma.swapRequest.findUnique({ where: { id: String(req.params.id) } })
  if (!swap) throw new ApiError(404, 'not_found', 'Swap request not found')
  assertSwapActionable(swap)

  const [shift, requester, manager] = await Promise.all([
    prisma.shift.findUniqueOrThrow({ where: { id: swap.shiftId } }),
    prisma.user.findUniqueOrThrow({ where: { id: swap.fromStaffId } }),
    prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } }),
  ])
  await assertManagerLocationAccess(req.user!, shift.locationId)

  const { updated, notifications } = await prisma.$transaction(async (tx) => {
    const result = await tx.swapRequest.update({ where: { id: swap.id }, data: { stage: 'rejected', resolvedAt: new Date() } })
    await writeAudit(tx, {
      actorId: req.user!.id,
      entityType: 'swap',
      entityId: swap.id,
      locationId: shift.locationId,
      action: 'rejected_swap',
      details: reason ?? `${manager.name} rejected ${requester.name}'s ${swap.type} request.`,
    })
    const pendingNotifications: NotifyInput[] = [
      {
        userId: requester.id,
        type: 'swap_resolved',
        title: `${swap.type === 'drop' ? 'Drop' : swap.type === 'claim' ? 'Claim' : 'Swap'} rejected`,
        body: reason ?? `Your ${swap.type} request was rejected.`,
        locationId: shift.locationId,
        shiftId: shift.id,
      },
    ]
    if (swap.toStaffId) {
      pendingNotifications.push({
        userId: swap.toStaffId,
        type: 'swap_resolved',
        title: 'Swap rejected',
        body: `The swap with ${requester.name} was rejected by the manager.`,
        locationId: shift.locationId,
        shiftId: shift.id,
      })
    }
    return { updated: result, notifications: pendingNotifications }
  })

  await sendNotifications(notifications)
  res.json(toSwapRequest(updated))
})
