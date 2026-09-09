import type { Server as HttpServer } from 'http'
import { Server, type Socket } from 'socket.io'
import { verifyAuthToken } from '../utils/jwt'
import { prisma } from './prisma'
import { corsOrigins } from './env'
import { logger } from './logger'

// Every real-time signal this app emits, named to match BACKEND_PROMPT §6 exactly. Kept
// as a union (not a bare string) so every emit site is checked against this list instead
// of inventing ad-hoc event names.
export type RealtimeEventName =
  | 'schedule.published'
  | 'schedule.updated'
  | 'swap.requested'
  | 'swap.resolved'
  | 'assignment.conflict'
  | 'presence.clockIn'
  | 'presence.clockOut'

let io: Server | null = null

function userRoom(userId: string) {
  return `user:${userId}`
}

function locationRoom(locationId: string) {
  return `location:${locationId}`
}

/**
 * Socket.IO auth: the same JWT issued by POST /auth/login (Phase 1), passed as
 * `socket.handshake.auth.token` — no separate socket-specific credential. A connection
 * with a missing/invalid/expired token is rejected at the handshake, before it can join
 * any room.
 */
async function authenticateSocket(socket: Socket) {
  const token = socket.handshake.auth?.token as string | undefined
  if (!token) throw new Error('Missing auth token')
  const payload = verifyAuthToken(token)
  return { id: payload.sub, role: payload.role }
}

/**
 * Rooms a connection is entitled to join without asking: `user:{id}` always, plus every
 * `location:{id}` the user is already scoped to server-side — staff via their home
 * location, managers via ManagerLocation. This covers the schedule board / on-duty-now /
 * my-schedule screens without the client having to know or declare its own location scope.
 * Admin has no fixed location (corporate-wide, and the admin screens are not per-location
 * real-time views per the frontend nav), so nothing extra to auto-join there.
 */
async function autoJoinRooms(socket: Socket, user: { id: string; role: string }) {
  socket.join(userRoom(user.id))

  if (user.role === 'staff') {
    const staff = await prisma.user.findUnique({ where: { id: user.id }, select: { homeLocationId: true } })
    if (staff?.homeLocationId) socket.join(locationRoom(staff.homeLocationId))
  } else if (user.role === 'manager') {
    const scopes = await prisma.managerLocation.findMany({ where: { userId: user.id }, select: { locationId: true } })
    for (const s of scopes) socket.join(locationRoom(s.locationId))
  }
}

/**
 * Explicit join, for a case auto-join can't cover: admin viewing a specific location's
 * live board, or a manager/staff member whose location scope changed after connecting
 * (a socket connection outlives a single page's queries). Re-validates against the same
 * rule `assertManagerLocationAccess`/staff-home-location checks use elsewhere — a socket
 * cannot join a room its JWT wouldn't be allowed to read via the REST API.
 */
async function canJoinLocation(user: { id: string; role: string }, locationId: string): Promise<boolean> {
  if (user.role === 'admin') return true
  if (user.role === 'manager') {
    const scoped = await prisma.managerLocation.findUnique({ where: { userId_locationId: { userId: user.id, locationId } } })
    return !!scoped
  }
  if (user.role === 'staff') {
    const staff = await prisma.user.findUnique({ where: { id: user.id }, select: { homeLocationId: true } })
    return staff?.homeLocationId === locationId
  }
  return false
}

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: corsOrigins, credentials: true },
  })

  io.use((socket, next) => {
    authenticateSocket(socket)
      .then((user) => {
        socket.data.user = user
        next()
      })
      .catch(() => next(new Error('unauthorized')))
  })

  io.on('connection', (socket) => {
    const user = socket.data.user as { id: string; role: string }
    autoJoinRooms(socket, user).catch((err) => logger.error({ err, userId: user.id }, 'Failed to auto-join realtime rooms'))

    socket.on('join:location', async (locationId: string, ack?: (ok: boolean) => void) => {
      try {
        const allowed = await canJoinLocation(user, String(locationId))
        if (allowed) socket.join(locationRoom(String(locationId)))
        ack?.(allowed)
      } catch (err) {
        logger.error({ err, userId: user.id, locationId }, 'join:location failed')
        ack?.(false)
      }
    })

    socket.on('leave:location', (locationId: string) => {
      socket.leave(locationRoom(String(locationId)))
    })
  })

  return io
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.IO server not initialized — call initSocket() before getIO()')
  return io
}

export interface RealtimeEventPayload {
  title: string
  body: string
  locationId?: string | null
  shiftId?: string | null
}

/**
 * Fire-and-forget by design: `Server#to().emit()` writes to the transport and returns
 * synchronously, so calling this never adds latency to the HTTP response that triggered
 * it. Every call site in this app calls this *after* its DB transaction has committed
 * (see the individual route comments) — a slow or dropped socket delivery can never roll
 * back, block, or extend the mutation it describes.
 */
export function emitToUser(userId: string, event: RealtimeEventName, payload: RealtimeEventPayload) {
  if (!io) return
  io.to(userRoom(userId)).emit(event, payload)
}

export function emitToLocation(locationId: string, event: RealtimeEventName, payload: RealtimeEventPayload) {
  if (!io) return
  io.to(locationRoom(locationId)).emit(event, payload)
}

export interface PresenceEventPayload {
  staffId: string
  shiftId: string
  locationId: string
  clockedInAt?: string
}

export function emitPresence(event: 'presence.clockIn' | 'presence.clockOut', payload: PresenceEventPayload) {
  if (!io) return
  io.to(locationRoom(payload.locationId)).emit(event, payload)
}
