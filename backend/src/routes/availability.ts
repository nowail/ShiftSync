import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { ApiError } from '../middleware/errorHandler'
import { notify } from '../lib/notify'

export const availabilityRouter = Router()

function assertSelf(req: { user?: { id: string } }, staffId: string) {
  if (req.user!.id !== staffId) {
    throw new ApiError(403, 'forbidden', 'You can only view or edit your own availability')
  }
}

async function loadAvailability(staffId: string) {
  const [recurring, exceptions] = await Promise.all([
    prisma.availabilityRule.findMany({ where: { staffId }, orderBy: { dayOfWeek: 'asc' } }),
    prisma.availabilityException.findMany({ where: { staffId }, orderBy: { date: 'asc' } }),
  ])
  return {
    staffId,
    recurring: recurring.map((r) => ({ id: r.id, dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime })),
    exceptions: exceptions.map((e) => ({
      id: e.id,
      date: e.date.toISOString().slice(0, 10),
      available: e.available,
      note: e.note ?? undefined,
    })),
  }
}

// Notifies the staff member's home-location manager(s) that availability changed —
// the simplest defensible reading of "notify the manager" for someone potentially
// certified at more than one location.
async function notifyHomeLocationManagers(staffId: string, staffName: string) {
  const staff = await prisma.user.findUnique({ where: { id: staffId } })
  if (!staff?.homeLocationId) return
  const managers = await prisma.managerLocation.findMany({ where: { locationId: staff.homeLocationId }, include: { user: true } })
  await Promise.all(
    managers.map((m) =>
      notify(prisma, {
        userId: m.userId,
        type: 'availability_changed',
        title: 'Availability updated',
        body: `${staffName} updated their availability.`,
        locationId: staff.homeLocationId,
      }),
    ),
  )
}

availabilityRouter.get('/staff/:staffId/availability', requireAuth, async (req, res) => {
  const staffId = String(req.params.staffId)
  assertSelf(req, staffId)
  res.json(await loadAvailability(staffId))
})

const recurringSchema = z.object({
  windows: z.array(z.object({ dayOfWeek: z.number().int().min(0).max(6), startTime: z.string(), endTime: z.string() })),
})

availabilityRouter.put('/staff/:staffId/availability/recurring', requireAuth, async (req, res) => {
  const staffId = String(req.params.staffId)
  assertSelf(req, staffId)
  const { windows } = recurringSchema.parse(req.body)

  const staff = await prisma.user.findUniqueOrThrow({ where: { id: staffId } })
  await prisma.$transaction([
    prisma.availabilityRule.deleteMany({ where: { staffId } }),
    prisma.availabilityRule.createMany({ data: windows.map((w) => ({ staffId, ...w })) }),
  ])
  await notifyHomeLocationManagers(staffId, staff.name)
  res.json(await loadAvailability(staffId))
})

const exceptionSchema = z.object({ date: z.string(), available: z.boolean(), note: z.string().optional() })

availabilityRouter.post('/staff/:staffId/availability/exceptions', requireAuth, async (req, res) => {
  const staffId = String(req.params.staffId)
  assertSelf(req, staffId)
  const body = exceptionSchema.parse(req.body)

  const staff = await prisma.user.findUniqueOrThrow({ where: { id: staffId } })
  await prisma.availabilityException.upsert({
    where: { staffId_date: { staffId, date: new Date(body.date) } },
    create: { staffId, date: new Date(body.date), available: body.available, note: body.note },
    update: { available: body.available, note: body.note },
  })
  await notifyHomeLocationManagers(staffId, staff.name)
  res.json(await loadAvailability(staffId))
})

availabilityRouter.delete('/staff/:staffId/availability/exceptions/:exceptionId', requireAuth, async (req, res) => {
  const staffId = String(req.params.staffId)
  assertSelf(req, staffId)
  const exceptionId = String(req.params.exceptionId)

  const existing = await prisma.availabilityException.findUnique({ where: { id: exceptionId } })
  if (!existing || existing.staffId !== staffId) throw new ApiError(404, 'not_found', 'Exception not found')

  await prisma.availabilityException.delete({ where: { id: exceptionId } })
  res.json(await loadAvailability(staffId))
})
