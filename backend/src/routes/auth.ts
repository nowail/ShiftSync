import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { verifyPassword } from '../utils/password'
import { signAuthToken } from '../utils/jwt'
import { ApiError } from '../middleware/errorHandler'
import { requireAuth } from '../middleware/auth'

export const authRouter = Router()

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

function toPublicUser(user: {
  id: string
  name: string
  email: string
  role: string
  homeLocationId: string | null
  desiredWeeklyHours: number
  avatarColor: string
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    homeLocationId: user.homeLocationId,
    desiredWeeklyHours: user.desiredWeeklyHours,
    avatarColor: user.avatarColor,
  }
}

authRouter.post('/auth/login', async (req, res) => {
  const { email, password } = loginSchema.parse(req.body)

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
  if (!user) throw new ApiError(401, 'invalid_credentials', 'Email or password is incorrect')

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) throw new ApiError(401, 'invalid_credentials', 'Email or password is incorrect')

  const token = signAuthToken({ sub: user.id, role: user.role })
  res.json({ token, user: toPublicUser(user) })
})

authRouter.get('/auth/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
  if (!user) throw new ApiError(401, 'unauthorized', 'User no longer exists')
  res.json({ user: toPublicUser(user) })
})
