import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Role } from '../types'

export const DEMO_ACCOUNTS: Record<Role, { staffId: string; name: string; locationId: string }> = {
  admin: { staffId: 'usr-admin', name: 'Jordan Rivera', locationId: 'loc-sf' },
  manager: { staffId: 'usr-mgr-sf', name: 'Casey Nolan', locationId: 'loc-sf' },
  staff: { staffId: 'usr-4', name: 'Kayla Lee', locationId: 'loc-sf' },
}

interface SessionState {
  isAuthenticated: boolean
  role: Role | null
  staffId: string | null
  staffName: string | null
  activeLocationId: string | null
  login: (role: Role) => void
  logout: () => void
  setActiveLocation: (locationId: string) => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      role: null,
      staffId: null,
      staffName: null,
      activeLocationId: null,
      login: (role) => {
        const account = DEMO_ACCOUNTS[role]
        set({
          isAuthenticated: true,
          role,
          staffId: account.staffId,
          staffName: account.name,
          activeLocationId: account.locationId,
        })
      },
      logout: () => set({ isAuthenticated: false, role: null, staffId: null, staffName: null, activeLocationId: null }),
      setActiveLocation: (locationId) => set({ activeLocationId: locationId }),
    }),
    { name: 'shiftsync-session' },
  ),
)
