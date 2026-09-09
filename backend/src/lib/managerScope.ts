import type { Role } from '@prisma/client'
import { prisma } from './prisma'
import { ApiError } from '../middleware/errorHandler'

// The `scopeToManagerLocations` Express middleware (built in Phase 1, unused until now)
// only works when the target location id is available synchronously off the request
// (a route param or body field). Several Phase 3 mutations take a *seat* id and only
// know the location after an async lookup (resolve seat -> shift -> location), which a
// synchronous middleware callback can't do — this is the same check, callable after that
// lookup happens, inside the handler.
export async function assertManagerLocationAccess(user: { id: string; role: Role }, locationId: string) {
  if (user.role === 'admin') return
  if (user.role !== 'manager') throw new ApiError(403, 'forbidden', 'Requires manager or admin role')
  const scoped = await prisma.managerLocation.findUnique({
    where: { userId_locationId: { userId: user.id, locationId } },
  })
  if (!scoped) throw new ApiError(403, 'forbidden', 'You are not assigned to this location')
}
