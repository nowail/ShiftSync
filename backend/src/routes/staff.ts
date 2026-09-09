import { Router } from 'express'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { requireAuth, requireRole } from '../middleware/auth'
import { ApiError } from '../middleware/errorHandler'
import { writeAudit } from '../lib/auditLog'
import { hashPassword } from '../utils/password'
import { paginationQuerySchema, paginateResult, toSkipTake } from '../lib/pagination'

export const staffRouter = Router()

// Every seeded account shares one password and an email derived from the name
// (firstname.lastname@coastaleats.com) — see backend/README.md. The Admin "Add staff"
// form never collected an email or password at all (the mock didn't need real logins),
// so a newly created real account is given a login the same predictable way, rather than
// growing that form. Reported back to the admin in the response/audit so there's
// something to hand the new hire.
const DEMO_PASSWORD = 'password123'

async function generateUniqueEmail(name: string): Promise<string> {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .join('.')
  let candidate = `${base}@coastaleats.com`
  let suffix = 2
  while (await prisma.user.findUnique({ where: { email: candidate } })) {
    candidate = `${base}${suffix}@coastaleats.com`
    suffix++
  }
  return candidate
}

const staffInclude = {
  certifications: {
    where: { revokedAt: null },
    include: { skill: true },
  },
} as const

// Frontend `StaffCertification` has no revocation concept — it's just "what this person
// can currently work." Revoked certs stay in the DB per the de-certification decision
// (never deleted) but are deliberately excluded from this read shape.
function toStaffMember(user: {
  id: string
  name: string
  role: string
  homeLocationId: string | null
  desiredWeeklyHours: number
  avatarColor: string
  certifications: { locationId: string; skill: { key: string } }[]
}) {
  const byLocation = new Map<string, string[]>()
  for (const cert of user.certifications) {
    const skills = byLocation.get(cert.locationId) ?? []
    skills.push(cert.skill.key)
    byLocation.set(cert.locationId, skills)
  }
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    homeLocationId: user.homeLocationId,
    certifications: Array.from(byLocation.entries()).map(([locationId, skills]) => ({ locationId, skills })),
    desiredWeeklyHours: user.desiredWeeklyHours,
    avatarColor: user.avatarColor,
  }
}

staffRouter.get('/staff', requireAuth, async (req, res) => {
  const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : undefined
  const pagination = paginationQuerySchema.parse(req.query)
  const where = locationId ? { certifications: { some: { locationId, revokedAt: null } } } : undefined

  const [totalItems, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, include: staffInclude, orderBy: { name: 'asc' }, ...toSkipTake(pagination) }),
  ])
  res.json(paginateResult(users.map(toStaffMember), totalItems, pagination))
})

staffRouter.get('/staff/:id', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: String(req.params.id) }, include: staffInclude })
  if (!user) throw new ApiError(404, 'not_found', 'Staff member not found')
  res.json(toStaffMember(user))
})

const AVATAR_PALETTE = ['#E8A33D', '#3E7C6B', '#C1473F', '#4B5169', '#868C9E', '#B8842E', '#656B82']

const certificationsSchema = z.array(z.object({ locationId: z.string(), skills: z.array(z.string()) }))

// Certifications are diffed against the desired set, never bulk-replaced: a pair being
// dropped gets `revokedAt` set (never deleted, per the de-certification decision — see
// StaffCertification's own schema comment), and a pair being re-added un-revokes an
// existing row for that exact (staff, location, skill) rather than creating a duplicate,
// which would collide with the @@unique constraint the first time someone was
// decertified and later re-certified for the same thing.
async function syncCertifications(tx: Prisma.TransactionClient, staffId: string, desired: { locationId: string; skills: string[] }[]) {
  const skillRows = await tx.skill.findMany()
  const skillIdByKey = new Map(skillRows.map((s) => [s.key, s.id]))

  const desiredPairs = new Set<string>()
  for (const group of desired) {
    for (const skillKey of group.skills) {
      const skillId = skillIdByKey.get(skillKey)
      if (!skillId) throw new ApiError(400, 'bad_request', `Unknown skill "${skillKey}"`)
      desiredPairs.add(`${group.locationId}::${skillId}`)
    }
  }

  const existing = await tx.staffCertification.findMany({ where: { staffId } })
  for (const cert of existing) {
    const pairKey = `${cert.locationId}::${cert.skillId}`
    const isDesired = desiredPairs.has(pairKey)
    if (isDesired && cert.revokedAt) {
      await tx.staffCertification.update({ where: { id: cert.id }, data: { revokedAt: null } })
    } else if (!isDesired && !cert.revokedAt) {
      await tx.staffCertification.update({ where: { id: cert.id }, data: { revokedAt: new Date() } })
    }
    if (isDesired) desiredPairs.delete(pairKey)
  }
  // Whatever's left in desiredPairs has no existing row at all yet.
  for (const pairKey of desiredPairs) {
    const [locationId, skillId] = pairKey.split('::')
    await tx.staffCertification.create({ data: { staffId, locationId, skillId } })
  }
}

const createStaffSchema = z.object({
  name: z.string().min(1),
  role: z.enum(['admin', 'manager', 'staff']),
  homeLocationId: z.string(),
  certifications: certificationsSchema,
  desiredWeeklyHours: z.number().int().min(0).max(80),
})

// Standard CRUD, admin-only, no constraint-engine interaction.
staffRouter.post('/staff', requireAuth, requireRole('admin'), async (req, res) => {
  const body = createStaffSchema.parse(req.body)
  const email = await generateUniqueEmail(body.name)
  const passwordHash = await hashPassword(DEMO_PASSWORD)
  const staffCount = await prisma.user.count()

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: body.name,
        email,
        passwordHash,
        role: body.role,
        homeLocationId: body.homeLocationId,
        desiredWeeklyHours: body.desiredWeeklyHours,
        avatarColor: AVATAR_PALETTE[staffCount % AVATAR_PALETTE.length],
      },
    })
    await syncCertifications(tx, created.id, body.certifications)
    await writeAudit(tx, {
      actorId: req.user!.id,
      entityType: 'staff',
      entityId: created.id,
      locationId: body.homeLocationId,
      action: 'added_staff',
      details: `Added ${created.name} (${created.role}). Login: ${email} / ${DEMO_PASSWORD}.`,
      after: { name: created.name, role: created.role, email },
    })
    return created
  })

  const full = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: staffInclude })
  res.status(201).json({ ...toStaffMember(full), email })
})

const updateStaffSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['admin', 'manager', 'staff']).optional(),
  homeLocationId: z.string().optional(),
  certifications: certificationsSchema.optional(),
  desiredWeeklyHours: z.number().int().min(0).max(80).optional(),
})

staffRouter.patch('/staff/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const staffId = String(req.params.id)
  const patch = updateStaffSchema.parse(req.body)
  const existing = await prisma.user.findUnique({ where: { id: staffId } })
  if (!existing) throw new ApiError(404, 'not_found', 'Staff member not found')

  await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: staffId },
      data: {
        name: patch.name,
        role: patch.role,
        homeLocationId: patch.homeLocationId,
        desiredWeeklyHours: patch.desiredWeeklyHours,
      },
    })
    if (patch.certifications) await syncCertifications(tx, staffId, patch.certifications)
    await writeAudit(tx, {
      actorId: req.user!.id,
      entityType: 'staff',
      entityId: staffId,
      locationId: updated.homeLocationId,
      action: 'updated_staff',
      details: `Updated ${updated.name}.`,
      before: existing,
      after: updated,
    })
  })

  const full = await prisma.user.findUniqueOrThrow({ where: { id: staffId }, include: staffInclude })
  res.json(toStaffMember(full))
})

// Self-service only — Profile.tsx's own "save desired hours" (a Phase 2-flagged gap:
// this used to be the mock function whose write silently vanished once the read side
// went real). Deliberately separate from the admin PATCH above, which requires admin.
staffRouter.patch('/staff/:id/preferences', requireAuth, async (req, res) => {
  const staffId = String(req.params.id)
  if (req.user!.id !== staffId) throw new ApiError(403, 'forbidden', 'You can only update your own preferences')
  const { desiredWeeklyHours } = z.object({ desiredWeeklyHours: z.number().int().min(0).max(80) }).parse(req.body)

  await prisma.user.update({ where: { id: staffId }, data: { desiredWeeklyHours } })
  const full = await prisma.user.findUniqueOrThrow({ where: { id: staffId }, include: staffInclude })
  res.json(toStaffMember(full))
})
