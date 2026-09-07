import { db, nextDbId } from '../lib/db'
import { withMockLatency } from '../lib/delay'
import { evaluateAssignment, getEligibleCandidates as computeEligibleCandidates, shiftsOverlap } from '../lib/rules'
import { getAuditLog, pushAudit } from './audit'
import { emitRealtimeEvent } from './realtime'
import type { EligibleCandidate, Shift, SkillTag, Violation } from '../types'

export async function getShiftsForWeek(locationId: string, weekStart: string): Promise<Shift[]> {
  return withMockLatency(() =>
    db.shifts
      .filter((s) => s.locationId === locationId && s.weekStart === weekStart)
      .sort((a, b) => a.startUtc.localeCompare(b.startUtc)),
  )
}

export async function getShiftsForWeekAllLocations(weekStart: string): Promise<Shift[]> {
  return withMockLatency(() =>
    db.shifts.filter((s) => s.weekStart === weekStart).sort((a, b) => a.startUtc.localeCompare(b.startUtc)),
  )
}

export async function getShift(shiftId: string): Promise<Shift | undefined> {
  return withMockLatency(() => db.shifts.find((s) => s.id === shiftId))
}

export async function getClaimableShiftsForStaff(staffId: string): Promise<Shift[]> {
  return withMockLatency(() => {
    const staff = db.staff.find((s) => s.id === staffId)
    if (!staff) return []
    const myShifts = db.shifts.filter((s) => s.assignedStaffId === staffId)
    return db.shifts
      .filter((s) => s.status === 'published' && !s.assignedStaffId && new Date(s.startUtc) > new Date())
      .filter((s) => staff.certifications.some((c) => c.locationId === s.locationId && c.skills.includes(s.role)))
      .filter((s) => !myShifts.some((mine) => shiftsOverlap(mine, s)))
      .sort((a, b) => a.startUtc.localeCompare(b.startUtc))
  })
}

export async function getUpcomingShiftsForStaff(staffId: string): Promise<Shift[]> {
  return withMockLatency(() =>
    db.shifts
      .filter((s) => s.assignedStaffId === staffId && s.status === 'published' && new Date(s.endUtc) > new Date())
      .sort((a, b) => a.startUtc.localeCompare(b.startUtc)),
  )
}

export async function getShiftHistory(shiftId: string) {
  const rows = await getAuditLog({ entity: 'shift' })
  return rows.filter((r) => r.entityId === shiftId)
}

export async function getEligibleCandidates(shiftId: string): Promise<EligibleCandidate[]> {
  return withMockLatency(() => {
    const shift = db.shifts.find((s) => s.id === shiftId)
    if (!shift) return []
    const location = db.locations.find((l) => l.id === shift.locationId)
    if (!location) return []
    return computeEligibleCandidates(shift, db.staff, db.shifts, location)
  })
}

export async function previewAssignment(shiftId: string, staffId: string): Promise<Violation[]> {
  return withMockLatency(() => {
    const shift = db.shifts.find((s) => s.id === shiftId)
    const staff = db.staff.find((s) => s.id === staffId)
    const location = shift ? db.locations.find((l) => l.id === shift.locationId) : undefined
    if (!shift || !staff || !location) return []
    return evaluateAssignment(shift, staff, db.shifts, location)
  })
}

export type AssignResult = { ok: true; shift: Shift } | { ok: false; violations: Violation[] }

export async function assignStaffToShift(
  shiftId: string,
  staffId: string,
  actor: { id: string; name: string },
  opts: { override?: boolean; overrideReason?: string } = {},
): Promise<AssignResult> {
  return withMockLatency(() => {
    const shift = db.shifts.find((s) => s.id === shiftId)
    if (!shift) throw new Error('Shift not found.')
    const staff = db.staff.find((s) => s.id === staffId)
    if (!staff) throw new Error('Staff member not found.')
    const location = db.locations.find((l) => l.id === shift.locationId)!

    const violations = evaluateAssignment(shift, staff, db.shifts, location)
    const hardViolations = violations.filter((v) => v.severity === 'hard')
    const blocking = hardViolations.filter((v) => !v.overridable)

    // Non-overridable hard violations (double-booking, skill/cert mismatch, 12h daily cap)
    // can never be forced through, override flag or not.
    if (blocking.length > 0) {
      return { ok: false, violations }
    }
    // Overridable hard violations (currently only the 7th-consecutive-day rule) still
    // require the caller to have explicitly confirmed the override.
    if (hardViolations.length > 0 && !opts.override) {
      return { ok: false, violations }
    }

    const isOverride = hardViolations.length > 0 && opts.override
    const previousStaffId = shift.assignedStaffId
    shift.assignedStaffId = staffId
    shift.overrideReason = isOverride ? (opts.overrideReason ?? null) : null

    pushAudit({
      actorId: actor.id,
      actorName: actor.name,
      action: isOverride ? 'assigned_shift_override' : previousStaffId ? 'reassigned_shift' : 'assigned_shift',
      entity: 'shift',
      entityId: shift.id,
      locationId: shift.locationId,
      details: isOverride
        ? `Assigned ${staff.name} to ${shift.role} on ${shift.date} via manager override (${hardViolations[0].message}). Reason: "${shift.overrideReason}"`
        : `Assigned ${staff.name} to ${shift.role} on ${shift.date}${
            previousStaffId ? ' (was previously assigned to someone else)' : ''
          }.`,
    })
    return { ok: true, shift }
  })
}

export async function unassignShift(shiftId: string, actor: { id: string; name: string }): Promise<Shift> {
  return withMockLatency(() => {
    const shift = db.shifts.find((s) => s.id === shiftId)
    if (!shift) throw new Error('Shift not found.')
    shift.assignedStaffId = null
    pushAudit({
      actorId: actor.id,
      actorName: actor.name,
      action: 'unassigned_shift',
      entity: 'shift',
      entityId: shift.id,
      locationId: shift.locationId,
      details: `Cleared the assignment for ${shift.role} on ${shift.date}.`,
    })
    return shift
  })
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
  return withMockLatency(() => {
    const shift: Shift = {
      id: nextDbId('sh'),
      assignedStaffId: null,
      status: 'draft',
      isPremium: false,
      ...input,
    }
    db.shifts.push(shift)
    return shift
  })
}

export async function publishWeek(
  locationId: string,
  weekStart: string,
  actor: { id: string; name: string },
): Promise<void> {
  return withMockLatency(() => {
    const weekShifts = db.shifts.filter((s) => s.locationId === locationId && s.weekStart === weekStart)
    weekShifts.forEach((s) => (s.status = 'published'))
    const location = db.locations.find((l) => l.id === locationId)
    pushAudit({
      actorId: actor.id,
      actorName: actor.name,
      action: 'published_schedule',
      entity: 'week',
      entityId: weekStart,
      locationId,
      details: `Published ${location?.name ?? locationId} week of ${weekStart}.`,
    })
    emitRealtimeEvent({
      kind: 'schedule_published',
      title: 'Schedule published',
      body: `${location?.name ?? 'A location'}'s week of ${weekStart} is now live for staff.`,
      locationId,
    })
  })
}

export async function unpublishWeek(
  locationId: string,
  weekStart: string,
  actor: { id: string; name: string },
): Promise<void> {
  return withMockLatency(() => {
    const weekShifts = db.shifts.filter((s) => s.locationId === locationId && s.weekStart === weekStart)
    weekShifts.forEach((s) => (s.status = 'draft'))
    const location = db.locations.find((l) => l.id === locationId)
    pushAudit({
      actorId: actor.id,
      actorName: actor.name,
      action: 'unpublished_schedule',
      entity: 'week',
      entityId: weekStart,
      locationId,
      details: `Moved ${location?.name ?? locationId} week of ${weekStart} back to draft.`,
    })
  })
}
