import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { ApiError } from '../middleware/errorHandler'

export const notificationsRouter = Router()

// The mock's getNotifications()/getUnreadCount() take no arguments at all — the mock db
// is a single global list, implicitly "whoever's logged in." The real backend can (and
// should) do better: scope to the authenticated user from the JWT. Same return shape,
// no frontend change needed.
notificationsRouter.get('/notifications', requireAuth, async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
  })
  res.json(
    notifications.map((n) => ({
      id: n.id,
      kind: n.type,
      title: n.title,
      body: n.body,
      createdAt: n.createdAt.toISOString(),
      read: n.readAt !== null,
      locationId: n.locationId ?? undefined,
    })),
  )
})

notificationsRouter.get('/notifications/unread-count', requireAuth, async (req, res) => {
  const count = await prisma.notification.count({ where: { userId: req.user!.id, readAt: null } })
  res.json(count)
})

notificationsRouter.post('/notifications/:id/read', requireAuth, async (req, res) => {
  const notification = await prisma.notification.findUnique({ where: { id: String(req.params.id) } })
  if (!notification || notification.userId !== req.user!.id) throw new ApiError(404, 'not_found', 'Notification not found')
  await prisma.notification.update({ where: { id: notification.id }, data: { readAt: new Date() } })
  res.status(204).send()
})

notificationsRouter.post('/notifications/read-all', requireAuth, async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user!.id, readAt: null }, data: { readAt: new Date() } })
  res.status(204).send()
})

notificationsRouter.get('/notifications/preference', requireAuth, async (req, res) => {
  const pref = await prisma.notificationPreference.findUnique({ where: { userId: req.user!.id } })
  res.json({ channel: pref?.channel ?? 'in_app' })
})

const preferenceSchema = z.object({ channel: z.enum(['in_app', 'in_app_plus_email']) })

notificationsRouter.put('/notifications/preference', requireAuth, async (req, res) => {
  const { channel } = preferenceSchema.parse(req.body)
  await prisma.notificationPreference.upsert({
    where: { userId: req.user!.id },
    create: { userId: req.user!.id, channel },
    update: { channel },
  })
  res.json({ channel })
})
