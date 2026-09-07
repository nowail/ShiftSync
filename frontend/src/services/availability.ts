import { db, nextDbId } from '../lib/db'
import { withMockLatency } from '../lib/delay'
import type { AvailabilityException, AvailabilityWindow, StaffAvailability } from '../types'

function ensureRecord(staffId: string): StaffAvailability {
  let record = db.availability.find((a) => a.staffId === staffId)
  if (!record) {
    record = { staffId, recurring: [], exceptions: [] }
    db.availability.push(record)
  }
  return record
}

export async function getAvailability(staffId: string): Promise<StaffAvailability> {
  return withMockLatency(() => ({ ...ensureRecord(staffId) }))
}

export async function setRecurringWindows(
  staffId: string,
  windows: Omit<AvailabilityWindow, 'id'>[],
): Promise<StaffAvailability> {
  return withMockLatency(() => {
    const record = ensureRecord(staffId)
    record.recurring = windows.map((w) => ({ id: nextDbId('av'), ...w }))
    return { ...record }
  })
}

export async function addException(
  staffId: string,
  exception: Omit<AvailabilityException, 'id'>,
): Promise<StaffAvailability> {
  return withMockLatency(() => {
    const record = ensureRecord(staffId)
    record.exceptions.push({ id: nextDbId('exc'), ...exception })
    return { ...record }
  })
}

export async function removeException(staffId: string, exceptionId: string): Promise<StaffAvailability> {
  return withMockLatency(() => {
    const record = ensureRecord(staffId)
    record.exceptions = record.exceptions.filter((e) => e.id !== exceptionId)
    return { ...record }
  })
}
