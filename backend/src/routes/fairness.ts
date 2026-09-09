import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { computeFairnessRows, computeLocationFairnessRows } from '../lib/analytics'
import { paginationQuerySchema, paginateArray } from '../lib/pagination'

export const fairnessRouter = Router()

const SORT_KEYS = ['totalHours', 'premiumShiftCount', 'totalShiftCount', 'fairnessScore'] as const
const querySchema = z.object({
  weekStart: z.string(),
  locationId: z.string().optional(),
  sortKey: z.enum(SORT_KEYS).default('fairnessScore'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
})
const locationsQuerySchema = z.object({ weekStart: z.string() })

// One row per staff-role user who actually has a shift that week — zero-shift staff are
// filtered out here (server-side) rather than by the frontend after the fact, so
// totalItems/totalPages reflect what's actually meaningful to page through, not the full
// unfiltered roster. See analytics.ts for the fairnessScore formula itself.
//
// Sorted here, before pagination, rather than left to the frontend: the table's
// column-sort has to reorder the *whole* result, not just whichever 10 rows happen to be
// on the current page — sorting after paginating would silently only reorder one page at
// a time. Infinity (a staff member with premium shifts and zero pool hours share) sorts
// as if it were 999, matching the frontend's pre-pagination sort behavior exactly.
fairnessRouter.get('/fairness', requireAuth, async (req, res) => {
  const { weekStart, locationId, sortKey, sortDir } = querySchema.parse(req.query)
  const pagination = paginationQuerySchema.parse(req.query)
  const staff = await prisma.user.findMany({ where: { role: 'staff' }, select: { id: true } })
  const allRows = await computeFairnessRows(
    weekStart,
    staff.map((s) => s.id),
    locationId,
  )
  const rows = allRows
    .filter((r) => r.totalShiftCount > 0)
    .sort((a, b) => {
      const av = a[sortKey] === Infinity ? 999 : a[sortKey]
      const bv = b[sortKey] === Infinity ? 999 : b[sortKey]
      const diff = av - bv
      return sortDir === 'asc' ? diff : -diff
    })
  res.json(paginateArray(rows, pagination))
})

// One row per location, always company-wide — feeds the Fairness screen's KPI strip
// (Lowest/Highest/Company average), a structurally different metric from the per-staff
// row above (pool-share ÷ pool-share, not personal-ratio ÷ pool-share — see analytics.ts).
fairnessRouter.get('/fairness/locations', requireAuth, async (req, res) => {
  const { weekStart } = locationsQuerySchema.parse(req.query)
  const rows = await computeLocationFairnessRows(weekStart)
  res.json(rows)
})
