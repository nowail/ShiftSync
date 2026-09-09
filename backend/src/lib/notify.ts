import type { NotificationType, Prisma, PrismaClient } from '@prisma/client'
import { emitToUser, type RealtimeEventName } from './socket'

export interface NotifyInput {
  userId: string
  type: NotificationType
  title: string
  body: string
  locationId?: string | null
  shiftId?: string | null
}

// Only these two notification types also go out live, per BACKEND_PROMPT §6's explicit
// list — shift_reminder/overtime_warning/availability_changed/schedule_published are
// DB-only here (schedule_published gets its own location-wide broadcast at the call site
// in shifts.ts instead, since that one isn't "targeted to specific users involved").
const LIVE_EVENT_BY_TYPE: Partial<Record<NotificationType, RealtimeEventName>> = {
  swap_requested: 'swap.requested',
  swap_resolved: 'swap.resolved',
}

/**
 * The single funnel every notification write goes through — mirrors the Phase 3
 * audit-log wrapper. Always writes the real in-app Notification; additionally writes a
 * MockEmailOutbox row when the recipient's preference is in_app_plus_email, simulating
 * "also sent an email" without attempting to actually send one, per BACKEND_PROMPT.
 *
 * Every call site in this app invokes notify() with the bare `prisma` client, after
 * whatever transaction produced this event has already committed (see the Phase 4
 * incident this fixed, documented on swaps.ts's sendNotifications) — so it's always safe
 * to also push the live socket event from here: the write it describes is already
 * durable, never still-in-flight or liable to roll back.
 */
export async function notify(db: PrismaClient | Prisma.TransactionClient, input: NotifyInput) {
  const [notification, preference] = await Promise.all([
    db.notification.create({
      data: { userId: input.userId, type: input.type, title: input.title, body: input.body, locationId: input.locationId ?? null },
    }),
    db.notificationPreference.findUnique({ where: { userId: input.userId } }),
  ])

  if (preference?.channel === 'in_app_plus_email') {
    await db.mockEmailOutbox.create({
      data: { userId: input.userId, subject: input.title, body: input.body },
    })
  }

  const liveEvent = LIVE_EVENT_BY_TYPE[input.type]
  if (liveEvent) {
    emitToUser(input.userId, liveEvent, { title: input.title, body: input.body, locationId: input.locationId, shiftId: input.shiftId })
  }

  return notification
}
