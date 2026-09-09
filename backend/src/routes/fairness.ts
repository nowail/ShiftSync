import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { computeFairnessRows, computeLocationFairnessRows } from '../lib/analytics'

export const fairnessRouter = Router()

const querySchema = z.object({ weekStart: z.string(), locationId: z.string().optional() })
const locationsQuerySchema = z.object({ weekStart: z.string() })

// One row per staff-role user (zero-shift staff included, matching the frontend's
// existing behavior of computing rows for every staff member and filtering zero-shift
// ones out client-side) — see analytics.ts for the fairnessScore formula itself.
fairnessRouter.get('/fairness', requireAuth, async (req, res) => {
  const { weekStart, locationId } = querySchema.parse(req.query)
  const staff = await prisma.user.findMany({ where: { role: 'staff' }, select: { id: true } })
  const rows = await computeFairnessRows(
    weekStart,
    staff.map((s) => s.id),
    locationId,
  )
  res.json(rows)
})

// One row per location, always company-wide — feeds the Fairness screen's KPI strip
// (Lowest/Highest/Company average), a structurally different metric from the per-staff
// row above (pool-share ÷ pool-share, not personal-ratio ÷ pool-share — see analytics.ts).
fairnessRouter.get('/fairness/locations', requireAuth, async (req, res) => {
  const { weekStart } = locationsQuerySchema.parse(req.query)
  const rows = await computeLocationFairnessRows(weekStart)
  res.json(rows)
})
