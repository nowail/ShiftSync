import { apiRequest, ApiClientError } from '../lib/apiClient'
import { getAuditLog } from './audit'
import type { EligibleCandidate, Shift, SkillTag, Violation } from '../types'

export async function getShiftsForWeek(locationId: string, weekStart: string): Promise<Shift[]> {
  return apiRequest<Shift[]>(`/shifts?locationId=${encodeURIComponent(locationId)}&weekStart=${weekStart}`)
}

export async function getShiftsForWeekAllLocations(weekStart: string): Promise<Shift[]> {
  return apiRequest<Shift[]>(`/shifts?allLocations=true&weekStart=${weekStart}`)
}

export async function getShift(shiftId: string): Promise<Shift | undefined> {
  return apiRequest<Shift>(`/shifts/${shiftId}`)
}

export async function getClaimableShiftsForStaff(staffId: string): Promise<Shift[]> {
  return apiRequest<Shift[]>(`/staff/${staffId}/shifts/claimable`)
}

export async function getUpcomingShiftsForStaff(staffId: string): Promise<Shift[]> {
  return apiRequest<Shift[]>(`/staff/${staffId}/shifts/upcoming`)
}

export async function getShiftHistory(shiftId: string) {
  const rows = await getAuditLog({ entity: 'shift' })
  return rows.filter((r) => r.entityId === shiftId)
}

export async function getEligibleCandidates(shiftId: string): Promise<EligibleCandidate[]> {
  return apiRequest<EligibleCandidate[]>(`/shifts/${shiftId}/candidates`)
}

export async function previewAssignment(shiftId: string, staffId: string): Promise<Violation[]> {
  return apiRequest<Violation[]>(`/shifts/${shiftId}/preview?staffId=${encodeURIComponent(staffId)}`)
}

export type AssignResult = { ok: true; shift: Shift } | { ok: false; violations: Violation[] }

// actor is unused now — the backend derives the actor from the JWT, not a caller-supplied
// id/name (which could be spoofed). Kept in the signature so call sites don't need to
// change (BACKEND_PROMPT: "components/hooks should never need to change").
export async function assignStaffToShift(
  shiftId: string,
  staffId: string,
  _actor: { id: string; name: string },
  opts: { override?: boolean; overrideReason?: string } = {},
): Promise<AssignResult> {
  try {
    return await apiRequest<{ ok: true; shift: Shift }>(`/shifts/${shiftId}/assign`, {
      method: 'POST',
      body: { staffId, override: opts.override, overrideReason: opts.overrideReason },
    })
  } catch (err) {
    // A blocked assignment is a normal, structured outcome (422) — the caller (AssignPanel)
    // branches on `result.ok`, not a thrown error, so unpack it back into that shape here.
    if (err instanceof ApiClientError && err.status === 422 && err.details && typeof err.details === 'object' && 'violations' in err.details) {
      return { ok: false, violations: (err.details as { violations: Violation[] }).violations }
    }
    throw err
  }
}

export async function unassignShift(shiftId: string, _actor: { id: string; name: string }): Promise<Shift> {
  return apiRequest<Shift>(`/shifts/${shiftId}/unassign`, { method: 'POST' })
}

export async function createOpenShift(input: {
  locationId: string
  weekStart: string
  date: string
  startUtc: string
  endUtc: string
  role: SkillTag
  isPremium?: boolean
}): Promise<Shift> {
  return apiRequest<Shift>('/shifts', {
    method: 'POST',
    body: {
      locationId: input.locationId,
      startsAt: input.startUtc,
      endsAt: input.endUtc,
      skillRequired: input.role,
      isPremium: input.isPremium,
    },
  })
}

export async function publishWeek(locationId: string, weekStart: string, _actor: { id: string; name: string }): Promise<void> {
  await apiRequest<void>('/shifts/publish', { method: 'POST', body: { locationId, weekStart } })
}

export async function unpublishWeek(locationId: string, weekStart: string, _actor: { id: string; name: string }): Promise<void> {
  await apiRequest<void>('/shifts/unpublish', { method: 'POST', body: { locationId, weekStart } })
}
