import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'

export const auditRouter = Router()

const filtersSchema = z.object({
  actorId: z.string().optional(),
  entity: z.string().optional(),
  locationId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  query: z.string().optional(),
})

auditRouter.get('/audit', requireAuth, async (req, res) => {
  const filters = filtersSchema.parse(req.query)

  const entries = await prisma.auditLog.findMany({
    where: {
      ...(filters.actorId ? { actorId: filters.actorId } : {}),
      ...(filters.entity ? { entityType: filters.entity } : {}),
      ...(filters.locationId ? { locationId: filters.locationId } : {}),
      ...(filters.from || filters.to
        ? { at: { ...(filters.from ? { gte: new Date(filters.from) } : {}), ...(filters.to ? { lte: new Date(filters.to) } : {}) } }
        : {}),
      ...(filters.query
        ? {
            OR: [
              { actor: { name: { contains: filters.query, mode: 'insensitive' } } },
              { action: { contains: filters.query, mode: 'insensitive' } },
              { entityType: { contains: filters.query, mode: 'insensitive' } },
              { details: { contains: filters.query, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: { actor: true },
    orderBy: { at: 'desc' },
  })

  res.json(
    entries.map((e) => ({
      id: e.id,
      actorId: e.actorId,
      actorName: e.actor.name,
      action: e.action,
      entity: e.entityType,
      entityId: e.entityId,
      locationId: e.locationId ?? '',
      at: e.at.toISOString(),
      details: e.details ?? undefined,
    })),
  )
})
