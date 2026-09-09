import { io, type Socket } from 'socket.io-client'
import { emitRealtimeEvent } from './realtime'
import type { NotificationKind } from '../types'

// Same base URL apiClient.ts uses — one env var switches both HTTP and socket traffic
// between dev and deployed environments.
const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000'

interface RealtimeSocketPayload {
  title: string
  body: string
  locationId?: string | null
  shiftId?: string | null
}

export interface PresenceSocketPayload {
  staffId: string
  shiftId: string
  locationId: string
  clockedInAt?: string
}

// Every server event that's toast-worthy (§6's "targeted to the specific users involved"
// list plus schedule.published) funnels into the existing realtimeBus with the same
// {kind, title, body, locationId, shiftId} shape the old scripted mock used — every
// existing bus consumer (RealtimeProvider's toast/invalidate logic) needed zero changes.
const TOAST_EVENT_KIND: Record<string, NotificationKind> = {
  'schedule.published': 'schedule_published',
  'swap.requested': 'swap_requested',
  'swap.resolved': 'swap_resolved',
  'assignment.conflict': 'conflict',
}

type ScheduleUpdatedListener = (payload: RealtimeSocketPayload) => void
type PresenceListener = (kind: 'clockIn' | 'clockOut', payload: PresenceSocketPayload) => void

const scheduleUpdatedListeners = new Set<ScheduleUpdatedListener>()
const presenceListeners = new Set<PresenceListener>()

let socket: Socket | null = null

/**
 * `schedule.updated` isn't toast-worthy (a stream of "a shift was edited" toasts for
 * every micro-edit on a busy board would be noise, not signal) — it's a silent
 * "your shifts query is stale, refetch" signal, so it gets its own subscription instead
 * of going through the toast-driving realtimeBus.
 */
export function subscribeScheduleUpdated(listener: ScheduleUpdatedListener): () => void {
  scheduleUpdatedListeners.add(listener)
  return () => scheduleUpdatedListeners.delete(listener)
}

/** Same reasoning as schedule.updated — presence changes refresh the on-duty-now
 * dashboard's data, they don't need their own toast on top of the dashboard already
 * being a live, glanceable view. */
export function subscribePresence(listener: PresenceListener): () => void {
  presenceListeners.add(listener)
  return () => presenceListeners.delete(listener)
}

/** Connects (or reconnects, if already connected) with the given JWT — the same token
 * issued by POST /auth/login and already used for every REST call via apiClient.ts. */
export function connectRealtimeSocket(token: string): Socket {
  socket?.disconnect()
  socket = io(API_BASE_URL, { auth: { token }, transports: ['websocket'] })

  for (const [event, kind] of Object.entries(TOAST_EVENT_KIND)) {
    socket.on(event, (payload: RealtimeSocketPayload) => {
      emitRealtimeEvent({ kind, title: payload.title, body: payload.body, locationId: payload.locationId ?? undefined, shiftId: payload.shiftId ?? undefined })
    })
  }
  socket.on('schedule.updated', (payload: RealtimeSocketPayload) => {
    scheduleUpdatedListeners.forEach((listener) => listener(payload))
  })
  socket.on('presence.clockIn', (payload: PresenceSocketPayload) => {
    presenceListeners.forEach((listener) => listener('clockIn', payload))
  })
  socket.on('presence.clockOut', (payload: PresenceSocketPayload) => {
    presenceListeners.forEach((listener) => listener('clockOut', payload))
  })

  return socket
}

export function disconnectRealtimeSocket() {
  socket?.disconnect()
  socket = null
}

/** Admin (no fixed location scope server-side) or anyone viewing a location the server
 * didn't auto-join them to needs to ask explicitly — see socket.ts's join:location
 * handler on the backend for the authorization check this goes through. */
export function joinLocationRoom(locationId: string) {
  socket?.emit('join:location', locationId)
}
