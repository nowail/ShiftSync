import { db, nextDbId } from '../lib/db'
import { withMockLatency } from '../lib/delay'
import { realtimeBus } from './realtime'
import type { AppNotification } from '../types'

// Persist every live event that arrives on the realtime bus into the notification list.
realtimeBus.subscribe((event) => {
  const notification: AppNotification = {
    id: nextDbId('notif'),
    kind: event.kind,
    title: event.title,
    body: event.body,
    createdAt: event.at,
    read: false,
    locationId: event.locationId,
  }
  db.notifications.unshift(notification)
})

export async function getNotifications(): Promise<AppNotification[]> {
  return withMockLatency(() =>
    [...db.notifications].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
  )
}

export async function getUnreadCount(): Promise<number> {
  return withMockLatency(() => db.notifications.filter((n) => !n.read).length)
}

export async function markNotificationRead(id: string): Promise<void> {
  return withMockLatency(() => {
    const n = db.notifications.find((n) => n.id === id)
    if (n) n.read = true
  })
}

export async function markAllNotificationsRead(): Promise<void> {
  return withMockLatency(() => {
    db.notifications.forEach((n) => (n.read = true))
  })
}
