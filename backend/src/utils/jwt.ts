import jwt from 'jsonwebtoken'
import { env } from '../lib/env'
import type { Role } from '@prisma/client'

export interface AuthTokenPayload {
  sub: string // user id
  role: Role
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] })
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload
}
