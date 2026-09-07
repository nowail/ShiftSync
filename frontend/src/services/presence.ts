import { db } from '../lib/db'
import { withMockLatency } from '../lib/delay'

export interface PresenceEntry {
  staffId: string
  locationId: string
  clockedInAt: string
  shiftId: string
}

// Seed presence from whichever published shifts are currently in-progress.
function computeInitialPresence(): PresenceEntry[] {
  const now = Date.now()
  return db.shifts
    .filter(
      (s) =>
        s.status === 'published' &&
        s.assignedStaffId &&
        new Date(s.startUtc).getTime() <= now &&
        new Date(s.endUtc).getTime() > now,
    )
    .map((s) => ({
      staffId: s.assignedStaffId as string,
      locationId: s.locationId,
      clockedInAt: s.startUtc,
      shiftId: s.id,
    }))
}

let presence: PresenceEntry[] = computeInitialPresence()

export async function getOnDutyNow(locationId?: string): Promise<PresenceEntry[]> {
  return withMockLatency(() => presence.filter((p) => (locationId ? p.locationId === locationId : true)))
}

export function clockIn(entry: PresenceEntry) {
  presence = [...presence.filter((p) => p.staffId !== entry.staffId), entry]
}

export function clockOut(staffId: string) {
  presence = presence.filter((p) => p.staffId !== staffId)
}
