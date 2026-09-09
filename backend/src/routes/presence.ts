import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'

export const presenceRouter = Router()

// On-duty-now, computed live at read time from Assignment+Shift rows — mirrors the
// frontend mock's `computeInitialPresence` rule exactly (published, currently in
// progress). This is the source of truth the on-duty-now dashboard's 15s poll always
// falls back to; presenceScheduler.ts's socket pushes are a live-update convenience on
// top of it, not a replacement for it, so this endpoint alone is already correct even if
// the process just restarted and no timers have fired yet.
presenceRouter.get('/presence', requireAuth, async (req, res) => {
  const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : undefined
  const now = new Date()

  const assignments = await prisma.assignment.findMany({
    where: {
      status: 'active',
      shift: {
        status: 'published',
        startsAt: { lte: now },
        endsAt: { gt: now },
        ...(locationId ? { locationId } : {}),
      },
    },
    include: { shift: { select: { id: true, locationId: true, startsAt: true } } },
  })

  res.json(
    assignments.map((a) => ({
      staffId: a.staffId,
      locationId: a.shift.locationId,
      clockedInAt: a.shift.startsAt.toISOString(),
      shiftId: a.shift.id,
    })),
  )
})
