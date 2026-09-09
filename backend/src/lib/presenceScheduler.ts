import { prisma } from './prisma'
import { emitPresence } from './socket'
import { logger } from './logger'

// Node's setTimeout silently overflows (fires immediately) past ~24.8 days
// (2^31-1 ms). This app has no cron/queue layer (a deliberate Phase 4 decision — see
// swaps.ts's expiry comment), so a shift assigned further out than this window simply
// doesn't get a scheduled push; the on-duty-now dashboard's own 15s poll (GET /presence,
// computed live from Assignment+Shift rows, same as this scheduler's source of truth)
// still shows the correct state once that time actually arrives — this timer layer is a
// live-push convenience on top of an already-correct read model, not the source of truth
// for it. 20 days leaves comfortable headroom under the 24.8-day ceiling.
const MAX_TIMER_MS = 20 * 24 * 3600 * 1000

interface ScheduleInput {
  assignmentId: string
  staffId: string
  shiftId: string
  locationId: string
  startsAt: Date
  endsAt: Date
}

const timers = new Map<string, NodeJS.Timeout>()

function clearAssignmentTimers(assignmentId: string) {
  for (const suffix of ['in', 'out']) {
    const key = `${assignmentId}:${suffix}`
    const t = timers.get(key)
    if (t) {
      clearTimeout(t)
      timers.delete(key)
    }
  }
}

/**
 * (Re)schedules the clock-in/clock-out push for one active assignment, replacing any
 * previous timers for it. Called after an assignment is created or its shift's time
 * changes — always after the write that changed it has committed, never from inside a
 * transaction (an in-memory timer can't be rolled back if the transaction that scheduled
 * it fails afterward).
 */
export function schedulePresenceForAssignment(input: ScheduleInput) {
  clearAssignmentTimers(input.assignmentId)

  const now = Date.now()
  if (input.endsAt.getTime() <= now) return // already over — nothing to schedule

  const msUntilStart = input.startsAt.getTime() - now
  const msUntilEnd = input.endsAt.getTime() - now

  if (msUntilStart <= 0) {
    // Assigned (or edited into) a shift that's already in progress — on duty right now.
    emitPresence('presence.clockIn', {
      staffId: input.staffId,
      shiftId: input.shiftId,
      locationId: input.locationId,
      clockedInAt: input.startsAt.toISOString(),
    })
  } else if (msUntilStart <= MAX_TIMER_MS) {
    const t = setTimeout(() => {
      emitPresence('presence.clockIn', {
        staffId: input.staffId,
        shiftId: input.shiftId,
        locationId: input.locationId,
        clockedInAt: input.startsAt.toISOString(),
      })
    }, msUntilStart)
    timers.set(`${input.assignmentId}:in`, t)
  }

  if (msUntilEnd <= MAX_TIMER_MS) {
    const t = setTimeout(() => {
      emitPresence('presence.clockOut', { staffId: input.staffId, shiftId: input.shiftId, locationId: input.locationId })
    }, Math.max(msUntilEnd, 0))
    timers.set(`${input.assignmentId}:out`, t)
  }
}

/**
 * Called when an assignment is cancelled (unassigned, swapped away, drop approved) before
 * its shift ended. Clears any pending timers and, if the person was actually on duty at
 * the moment of cancellation, fires an immediate clock-out rather than waiting for the
 * (now-cleared) scheduled one.
 */
export function cancelPresenceForAssignment(input: ScheduleInput) {
  clearAssignmentTimers(input.assignmentId)
  const now = Date.now()
  if (input.startsAt.getTime() <= now && now < input.endsAt.getTime()) {
    emitPresence('presence.clockOut', { staffId: input.staffId, shiftId: input.shiftId, locationId: input.locationId })
  }
}

/**
 * One-time startup catch-up, not a recurring poll: on process boot, timers from the
 * previous process are gone (they lived in memory), so every currently-active assignment
 * whose shift hasn't ended yet needs its timer re-registered exactly once. Bounded to the
 * same window future scheduling uses, for the same reason.
 */
export async function reconcilePresenceSchedules(): Promise<void> {
  const now = new Date()
  const horizon = new Date(now.getTime() + MAX_TIMER_MS)
  const assignments = await prisma.assignment.findMany({
    where: { status: 'active', shift: { endsAt: { gt: now }, startsAt: { lt: horizon } } },
    include: { shift: { select: { id: true, locationId: true, startsAt: true, endsAt: true } } },
  })
  for (const a of assignments) {
    schedulePresenceForAssignment({
      assignmentId: a.id,
      staffId: a.staffId,
      shiftId: a.shift.id,
      locationId: a.shift.locationId,
      startsAt: a.shift.startsAt,
      endsAt: a.shift.endsAt,
    })
  }
  logger.info({ count: assignments.length }, 'Reconciled presence schedules on startup')
}
