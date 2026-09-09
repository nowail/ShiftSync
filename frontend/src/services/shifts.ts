import { apiRequest, ApiClientError, fetchAllPages } from '../lib/apiClient'
import { getAuditLog } from './audit'
import type { EligibleCandidate, Paginated, Shift, ShiftStatus, SkillTag, Violation } from '../types'

export async function getShiftsForWeek(locationId: string, weekStart: string): Promise<Shift[]> {
  return apiRequest<Shift[]>(`/shifts?locationId=${encodeURIComponent(locationId)}&weekStart=${weekStart}`)
}

export async function getShiftsForWeekAllLocations(weekStart: string): Promise<Shift[]> {
  return apiRequest<Shift[]>(`/shifts?allLocations=true&weekStart=${weekStart}`)
}

export async function getShift(shiftId: string): Promise<Shift | undefined> {
  return apiRequest<Shift>(`/shifts/${shiftId}`)
}

// Paginated (single consumer: StaffSwaps.tsx's "Open shifts you can claim" list) — a real
// pagination control there, since no other screen needs the complete list.
export async function getClaimableShiftsForStaffPage(staffId: string, page: number, pageSize = 10): Promise<Paginated<Shift>> {
  return apiRequest<Paginated<Shift>>(`/staff/${staffId}/shifts/claimable?page=${page}&pageSize=${pageSize}`)
}

export async function getUpcomingShiftsForStaff(staffId: string): Promise<Shift[]> {
  return apiRequest<Shift[]>(`/staff/${staffId}/shifts/upcoming`)
}

// entityId filters server-side now (Phase 7) — previously fetched every shift-entity
// audit entry system-wide and filtered to this one shift's id client-side, which broke
// once /audit paginated (a shift's own edits could land on any page of the unfiltered,
// company-wide feed). One shift's history is expected to be short; if it ever exceeds
// one page (10 entries), only the most recent 10 show here.
export async function getShiftHistory(shiftId: string) {
  const result = await getAuditLog({ entity: 'shift', entityId: shiftId })
  return result.items
}

// Full roster's eligibility for one shift, unpaginated — used by the swap-request modal's
// "who can I swap with" picker (StaffSwaps.tsx), which needs everyone who qualifies, not
// just the first page. See getEligibleCandidatesPage for the Assign panel's paginated view
// of the same underlying data.
export async function getEligibleCandidates(shiftId: string): Promise<EligibleCandidate[]> {
  return fetchAllPages((page) => apiRequest<Paginated<EligibleCandidate>>(`/shifts/${shiftId}/candidates?page=${page}`))
}

export async function getEligibleCandidatesPage(shiftId: string, page: number, pageSize = 10): Promise<Paginated<EligibleCandidate>> {
  return apiRequest<Paginated<EligibleCandidate>>(`/shifts/${shiftId}/candidates?page=${page}&pageSize=${pageSize}`)
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

export type UpdateShiftResult =
  | { ok: true; shifts: Shift[]; cancelledSwapCount: number }
  | { ok: false; violations: Violation[] }

// Accepts any of the three id shapes a seat can carry (filled-seat assignment id,
// synthetic `${shiftId}:unfilled:N` id, or a bare shift id) — PATCH /shifts/:id resolves
// it server-side the same way the candidates/preview routes already do. A 409 here is a
// normal, structured outcome (the shift has an approved swap whose assignee no longer
// qualifies for the edited time/skill) — the caller (EditShiftModal) branches on
// `result.ok`, matching assignStaffToShift's 422-unpacking pattern above.
export async function updateShift(
  shiftIdOrSeatId: string,
  patch: { startUtc: string; endUtc: string; role: SkillTag; headcount: number },
  _actor: { id: string; name: string },
): Promise<UpdateShiftResult> {
  try {
    const result = await apiRequest<{ shifts: Shift[]; cancelledSwapCount: number }>(`/shifts/${shiftIdOrSeatId}`, {
      method: 'PATCH',
      body: {
        startsAt: patch.startUtc,
        endsAt: patch.endUtc,
        skillRequired: patch.role,
        headcount: patch.headcount,
      },
    })
    return { ok: true, ...result }
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 409 && err.details && typeof err.details === 'object' && 'violations' in err.details) {
      return { ok: false, violations: (err.details as { violations: Violation[] }).violations }
    }
    throw err
  }
}

// The Create Shift form (ScheduleBoard.tsx / CreateShiftModal.tsx) is the only caller.
// `status` lets a manager creating a shift on an already-published week choose between a
// live addition and a draft one — see the form for that explicit choice, and POST /shifts
// for why it defaults to 'draft' server-side when omitted.
export async function createOpenShift(input: {
  locationId: string
  startUtc: string
  endUtc: string
  role: SkillTag
  headcount: number
  status?: ShiftStatus
}): Promise<Shift> {
  return apiRequest<Shift>('/shifts', {
    method: 'POST',
    body: {
      locationId: input.locationId,
      startsAt: input.startUtc,
      endsAt: input.endUtc,
      skillRequired: input.role,
      headcount: input.headcount,
      status: input.status,
    },
  })
}

export async function publishWeek(locationId: string, weekStart: string, _actor: { id: string; name: string }): Promise<void> {
  await apiRequest<void>('/shifts/publish', { method: 'POST', body: { locationId, weekStart } })
}

export async function unpublishWeek(locationId: string, weekStart: string, _actor: { id: string; name: string }): Promise<void> {
  await apiRequest<void>('/shifts/unpublish', { method: 'POST', body: { locationId, weekStart } })
}
