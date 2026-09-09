import type { NextFunction, Request, Response } from 'express'
import type { Role } from '@prisma/client'
import { verifyAuthToken } from '../utils/jwt'
import { prisma } from '../lib/prisma'
import { ApiError } from './errorHandler'

export interface AuthedUser {
  id: string
  role: Role
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    throw new ApiError(401, 'unauthorized', 'Missing or malformed Authorization header')
  }
  try {
    const payload = verifyAuthToken(header.slice('Bearer '.length))
    req.user = { id: payload.sub, role: payload.role }
    next()
  } catch {
    throw new ApiError(401, 'unauthorized', 'Invalid or expired token')
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new ApiError(401, 'unauthorized', 'Missing or malformed Authorization header')
    if (!roles.includes(req.user.role)) {
      throw new ApiError(403, 'forbidden', `Requires one of: ${roles.join(', ')}`)
    }
    next()
  }
}

/**
 * §1: "managers can only see/manage locations they're assigned to." Admins bypass this
 * check entirely (corporate-wide oversight is the point of that role); staff never hit
 * routes this guards. `getLocationId` pulls the target location out of whatever shape the
 * specific route uses (route param, query string, or request body) — deliberately a
 * callback rather than a fixed convention, since Phase 2+ routes take the location id in
 * different places (e.g. a route param on `/locations/:locationId/shifts` vs a query
 * param on `/shifts?locationId=...`).
 */
export function scopeToManagerLocations(getLocationId: (req: Request) => string | undefined) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new ApiError(401, 'unauthorized', 'Missing or malformed Authorization header')
    if (req.user.role === 'admin') return next()
    if (req.user.role !== 'manager') throw new ApiError(403, 'forbidden', 'Requires manager or admin role')

    const locationId = getLocationId(req)
    if (!locationId) throw new ApiError(400, 'bad_request', 'Request does not specify a location')

    const scoped = await prisma.managerLocation.findUnique({
      where: { userId_locationId: { userId: req.user.id, locationId } },
    })
    if (!scoped) throw new ApiError(403, 'forbidden', 'You are not assigned to this location')
    next()
  }
}
