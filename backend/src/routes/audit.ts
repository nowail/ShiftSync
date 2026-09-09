import { Router } from 'express'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
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

type AuditFilters = z.infer<typeof filtersSchema>

// Shared by GET /audit and GET /audit/export — one place to keep the filter semantics in
// sync instead of two copies of the same where-clause drifting apart.
function buildAuditWhere(filters: AuditFilters): Prisma.AuditLogWhereInput {
  return {
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
  }
}

function toAuditEntry(e: { id: string; actorId: string; actor: { name: string }; action: string; entityType: string; entityId: string; locationId: string | null; at: Date; details: string | null }) {
  return {
    id: e.id,
    actorId: e.actorId,
    actorName: e.actor.name,
    action: e.action,
    entity: e.entityType,
    entityId: e.entityId,
    locationId: e.locationId ?? '',
    at: e.at.toISOString(),
    details: e.details ?? undefined,
  }
}

auditRouter.get('/audit', requireAuth, async (req, res) => {
  const filters = filtersSchema.parse(req.query)
  const entries = await prisma.auditLog.findMany({
    where: buildAuditWhere(filters),
    include: { actor: true },
    orderBy: { at: 'desc' },
  })
  res.json(entries.map(toAuditEntry))
})

function csvCell(value: unknown): string {
  return `"${String(value).replace(/"/g, '""')}"`
}

// Same column layout the frontend's client-side CSV generation already used (id, actor,
// action, entity, entityId, locationId, at, details) — moving the generation here doesn't
// change the downloaded file's shape, just where it's built.
auditRouter.get('/audit/export', requireAuth, async (req, res) => {
  const filters = filtersSchema.parse(req.query)
  const entries = await prisma.auditLog.findMany({
    where: buildAuditWhere(filters),
    include: { actor: true },
    orderBy: { at: 'desc' },
  })

  const header = 'id,actor,action,entity,entityId,locationId,at,details'
  const rows = entries.map(toAuditEntry).map((r) =>
    [r.id, r.actorName, r.action, r.entity, r.entityId, r.locationId, r.at, r.details ?? ''].map(csvCell).join(','),
  )
  const csv = [header, ...rows].join('\n')

  res.setHeader('Content-Type', 'text/csv')
  res.send(csv)
})
