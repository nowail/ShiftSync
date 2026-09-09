// Pure data shapes for the constraint engine. Deliberately not Prisma types — the engine
// takes plain objects so it can be unit-tested with hand-built fixtures, with zero
// dependency on Express or the database (per BACKEND_PROMPT: "a pure, isolated,
// unit-tested module ... independent of Express").

export interface EngineLocation {
  id: string
  name: string
  timezone: string
}

export interface EngineCertification {
  locationId: string
  skillKey: string
}

export interface EngineStaff {
  id: string
  name: string
  role: 'admin' | 'manager' | 'staff'
  certifications: EngineCertification[]
}

export interface EngineAvailabilityRule {
  dayOfWeek: number // 0 = Sunday .. 6 = Saturday, location-local
  startTime: string // 'HH:mm'
  endTime: string // 'HH:mm'
}

export interface EngineAvailabilityException {
  date: string // 'yyyy-MM-dd', location-local
  available: boolean
}

export interface EngineShift {
  id: string
  locationId: string
  startsAt: Date
  endsAt: Date
  skillRequired: string
}

// An existing booking to check the candidate shift against — one entry per active
// Assignment, carrying its own shift's time range (so overlap/rest-gap/hours math never
// needs a second lookup back to the parent Shift).
export interface EngineExistingBooking {
  staffId: string
  shiftId: string
  startsAt: Date
  endsAt: Date
}

// BACKEND_PROMPT's own vocabulary for the engine's public contract: 'block' never yields
// (short of a different staff member), 'overridable' is a block a manager can knowingly
// bypass with a reason (7th consecutive day only), 'warning' never blocks anything.
export type ViolationSeverity = 'block' | 'overridable' | 'warning'

export interface EngineViolation {
  rule: string
  message: string
  severity: ViolationSeverity
}

export interface StaffSuggestion {
  staffId: string
  name: string
  reasons: string[]
  projectedWeeklyHours: number
}

export type EngineResult =
  | { ok: true }
  | { ok: false; violations: EngineViolation[]; suggestions: StaffSuggestion[] }

export interface EvaluateAssignmentInput {
  shift: EngineShift
  staff: EngineStaff
  location: EngineLocation
  /** This staff member's other active bookings (should exclude the shift being evaluated). */
  existingBookings: EngineExistingBooking[]
  availabilityRules: EngineAvailabilityRule[]
  availabilityExceptions: EngineAvailabilityException[]
  /** This staff member's total scheduled hours this week, excluding the shift being evaluated. */
  weeklyHoursExcludingThisShift: number
}
