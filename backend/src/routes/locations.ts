import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth, requireRole } from '../middleware/auth'
import { ApiError } from '../middleware/errorHandler'
import { writeAudit } from '../lib/auditLog'

export const locationsRouter = Router()

function toLocation(l: { id: string; name: string; city: string; timezone: string }) {
  return { id: l.id, name: l.name, city: l.city, timezone: l.timezone }
}

locationsRouter.get('/locations', requireAuth, async (_req, res) => {
  const locations = await prisma.location.findMany({ orderBy: { name: 'asc' } })
  res.json(locations.map(toLocation))
})

locationsRouter.get('/locations/:id', requireAuth, async (req, res) => {
  const l = await prisma.location.findUnique({ where: { id: String(req.params.id) } })
  if (!l) throw new ApiError(404, 'not_found', 'Location not found')
  res.json(toLocation(l))
})

const locationInputSchema = z.object({ name: z.string().min(1), city: z.string().min(1), timezone: z.string().min(1) })

// Standard CRUD, admin-only, no constraint-engine interaction — this is corporate
// structure (where locations exist), not scheduling logic.
locationsRouter.post('/locations', requireAuth, requireRole('admin'), async (req, res) => {
  const body = locationInputSchema.parse(req.body)
  const location = await prisma.$transaction(async (tx) => {
    const created = await tx.location.create({ data: body })
    await writeAudit(tx, {
      actorId: req.user!.id,
      entityType: 'location',
      entityId: created.id,
      locationId: created.id,
      action: 'created_location',
      details: `Added location "${created.name}" (${created.timezone}).`,
      after: created,
    })
    return created
  })
  res.status(201).json(toLocation(location))
})

const locationPatchSchema = locationInputSchema.partial()

locationsRouter.patch('/locations/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const id = String(req.params.id)
  const patch = locationPatchSchema.parse(req.body)
  const existing = await prisma.location.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'not_found', 'Location not found')

  const location = await prisma.$transaction(async (tx) => {
    const updated = await tx.location.update({ where: { id }, data: patch })
    await writeAudit(tx, {
      actorId: req.user!.id,
      entityType: 'location',
      entityId: id,
      locationId: id,
      action: 'updated_location',
      details: `Updated location "${updated.name}".`,
      before: existing,
      after: updated,
    })
    return updated
  })
  res.json(toLocation(location))
})
