import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { computeOvertimeRows } from '../lib/analytics'
import { paginationQuerySchema, paginateArray } from '../lib/pagination'

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
  const pagination = paginationQuerySchema.parse(req.query)
  const staff = await prisma.user.findMany({
    where: { role: 'staff', certifications: { some: { locationId, revokedAt: null } } },
    select: { id: true },
  })
  const unsorted = await computeOvertimeRows(locationId, weekStart, staff.map((s) => s.id))
  // The cost projection is a location-wide total — computed from every row, not just the
  // page being returned, then attached alongside the paginated envelope.
  const projectedWeeklyCost = unsorted.reduce((sum, r) => sum + r.overtimeCost, 0)
  // Sorted here, before pagination, matching the dashboard's original fixed
  // highest-hours-first order — sorting after paginating would only reorder whichever 10
  // rows happen to be on the current page, not the whole roster.
  const rows = unsorted.sort((a, b) => b.totalHours - a.totalHours)
  res.json({ ...paginateArray(rows, pagination), projectedWeeklyCost })
})
