import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { computeOvertimeRows } from '../lib/analytics'

export const overtimeRouter = Router()

const querySchema = z.object({ locationId: z.string(), weekStart: z.string() })

// Per-staff hours-so-far, which days are pushing someone into overtime (dailyHours),
// and the location's projected weekly overtime cost (sum of each row's own
// estimateOvertimeCost — built on the engine's hour-calculation logic, not reimplemented).
// The roster (every staff member actively certified at this location, per the same rule
// GET /staff?locationId= uses) matches the frontend's previous getStaffByLocation-driven
// row list, including zero-hour staff.
overtimeRouter.get('/overtime', requireAuth, async (req, res) => {
  const { locationId, weekStart } = querySchema.parse(req.query)
  const staff = await prisma.user.findMany({
    where: { role: 'staff', certifications: { some: { locationId, revokedAt: null } } },
    select: { id: true },
  })
  const rows = await computeOvertimeRows(locationId, weekStart, staff.map((s) => s.id))
  const projectedWeeklyCost = rows.reduce((sum, r) => sum + r.overtimeCost, 0)
  res.json({ rows, projectedWeeklyCost })
})
