import { AUDIT_LOG, AVAILABILITY, LOCATIONS, NOTIFICATIONS, STAFF, SHIFTS, SWAPS } from './seed'
import type {
  AppNotification,
  AuditEntry,
  Location,
  Shift,
  StaffAvailability,
  StaffMember,
  SwapRequest,
} from '../types'

/**
 * Single in-memory "database" for the mock layer. A page reload resets it —
 * that's expected for a take-home demo, not a bug to work around.
 */
export const db: {
  locations: Location[]
  staff: StaffMember[]
  shifts: Shift[]
  swaps: SwapRequest[]
  notifications: AppNotification[]
  audit: AuditEntry[]
  availability: StaffAvailability[]
} = {
  locations: [...LOCATIONS],
  staff: [...STAFF],
  shifts: [...SHIFTS],
  swaps: [...SWAPS],
  notifications: [...NOTIFICATIONS],
  audit: [...AUDIT_LOG],
  availability: [...AVAILABILITY],
}

let idSeq = 1000
export function nextDbId(prefix: string): string {
  idSeq += 1
  return `${prefix}-${idSeq}`
}
