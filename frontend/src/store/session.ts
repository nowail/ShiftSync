import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Role } from '../types'

// Prefills the Login screen's email field per role for grader convenience — the actual
// auth is real now (POST /auth/login), this is just a UI shortcut, not a bypass. Every
// seeded demo account shares the same password (see backend/prisma/seed.ts).
export const DEMO_LOGIN_EMAILS: Record<Role, string> = {
  admin: 'admin@coastaleats.com',
  manager: 'casey.manager@coastaleats.com',
  staff: 'kayla.lee@coastaleats.com',
}
export const DEMO_LOGIN_PASSWORD = 'password123'

interface SessionState {
  isAuthenticated: boolean
  token: string | null
  role: Role | null
  staffId: string | null
  staffName: string | null
  activeLocationId: string | null
  setSession: (session: { token: string; role: Role; staffId: string; staffName: string; locationId: string | null }) => void
  logout: () => void
  setActiveLocation: (locationId: string) => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      token: null,
      role: null,
      staffId: null,
      staffName: null,
      activeLocationId: null,
      setSession: ({ token, role, staffId, staffName, locationId }) => {
        set({
          isAuthenticated: true,
          token,
          role,
          staffId,
          staffName,
          activeLocationId: locationId,
        })
      },
      logout: () =>
        set({
          isAuthenticated: false,
          token: null,
          role: null,
          staffId: null,
          staffName: null,
          activeLocationId: null,
        }),
      setActiveLocation: (locationId) => set({ activeLocationId: locationId }),
    }),
    { name: 'shiftsync-session' },
  ),
)
