import { apiRequest } from '../lib/apiClient'

export interface PresenceEntry {
  staffId: string
  locationId: string
  clockedInAt: string
  shiftId: string
}

// Computed live at read time on the backend (published + currently in-progress
// assignments) — this poll is the source of truth; the presence.clockIn/clockOut socket
// events (see services/socket.ts) just prompt an early refetch instead of waiting for the
// next interval.
export async function getOnDutyNow(locationId?: string): Promise<PresenceEntry[]> {
  const query = locationId ? `?locationId=${encodeURIComponent(locationId)}` : ''
  return apiRequest<PresenceEntry[]>(`/presence${query}`)
}
