// Real from Phase 1 on — unlike every other service file (still mock through Phase 1),
// this one already talks to the real backend, since wiring auth first is this phase's
// whole point.
import { apiRequest } from '../lib/apiClient'
import type { Role } from '../types'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: Role
  homeLocationId: string | null
  desiredWeeklyHours: number
  avatarColor: string
}

export interface LoginResult {
  token: string
  user: AuthUser
}

export async function login(email: string, password: string): Promise<LoginResult> {
  return apiRequest<LoginResult>('/auth/login', {
    method: 'POST',
    body: { email, password },
    skipAuth: true,
  })
}

export async function getCurrentUser(): Promise<AuthUser> {
  const { user } = await apiRequest<{ user: AuthUser }>('/auth/me')
  return user
}
