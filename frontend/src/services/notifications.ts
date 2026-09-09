import { apiRequest } from '../lib/apiClient'
import type { AppNotification, NotificationChannel } from '../types'

export async function getNotifications(): Promise<AppNotification[]> {
  return apiRequest<AppNotification[]>('/notifications')
}

export async function getUnreadCount(): Promise<number> {
  return apiRequest<number>('/notifications/unread-count')
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiRequest<void>(`/notifications/${id}/read`, { method: 'POST' })
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiRequest<void>('/notifications/read-all', { method: 'POST' })
}

export async function getNotificationPreference(): Promise<NotificationChannel> {
  const { channel } = await apiRequest<{ channel: NotificationChannel }>('/notifications/preference')
  return channel
}

export async function setNotificationPreference(channel: NotificationChannel): Promise<NotificationChannel> {
  const result = await apiRequest<{ channel: NotificationChannel }>('/notifications/preference', {
    method: 'PUT',
    body: { channel },
  })
  return result.channel
}
