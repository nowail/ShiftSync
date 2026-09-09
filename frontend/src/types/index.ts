export type Role = 'admin' | 'manager' | 'staff'

export type SkillTag = 'line' | 'grill' | 'prep' | 'expo' | 'bar' | 'host' | 'dish'

export interface Location {
  id: string
  name: string
  city: string
  timezone: string // IANA tz name, e.g. 'America/Los_Angeles'
}

export interface StaffCertification {
  locationId: string
  skills: SkillTag[]
}

export interface StaffMember {
  id: string
  name: string
  role: Role
  homeLocationId: string
  certifications: StaffCertification[] // locations + skills this person may work
  desiredWeeklyHours: number
  avatarColor: string
}

export type ShiftStatus = 'draft' | 'published'

export interface Shift {
  id: string
  locationId: string
  weekStart: string // ISO date (Monday) for the week this shift belongs to
  date: string // ISO date, in location-local calendar day
  startUtc: string // ISO datetime UTC
  endUtc: string // ISO datetime UTC
  role: SkillTag
  assignedStaffId: string | null
  status: ShiftStatus
  isPremium: boolean
  overrideReason?: string | null // set when the current assignment bypassed an overridable hard violation
}

export type ViolationType =
  | 'daily_overtime' // warns >8h, blocks >12h in a day — hard block only above 12h
  | 'double_booking' // overlapping shifts — hard, not overridable
  | 'not_certified' // missing skill/location certification — hard, not overridable
  | 'weekly_overtime' // approaching/over 40h in a week — soft
  | 'consecutive_days' // 6th day is a soft warning; 7th+ is hard but overridable
  | 'rest_gap' // fewer than 10h between shifts — hard, not overridable (backend Phase 3)
  | 'not_available' // outside staff's declared availability window — hard, not overridable (backend Phase 3)

export interface Violation {
  type: ViolationType
  severity: 'hard' | 'soft'
  message: string
  overridable?: boolean // hard violations only — true means a manager can override with a documented reason
}

export interface EligibleCandidate {
  staffId: string
  qualifies: boolean
  reasons: string[] // why they qualify, or why they're a good alternative
  projectedWeeklyHours: number
  violations: Violation[]
}

export type SwapStage = 'requested' | 'peer_accepted' | 'awaiting_manager' | 'approved' | 'rejected'

export interface SwapRequest {
  id: string
  type: 'swap' | 'drop' | 'claim'
  requestingStaffId: string
  shiftId: string
  targetStaffId?: string | null // for direct swaps
  stage: SwapStage
  createdAt: string
  history: { stage: SwapStage; at: string; note?: string }[]
}

export type NotificationKind =
  | 'schedule_published'
  | 'swap_resolved'
  | 'conflict'
  | 'swap_requested'
  | 'shift_reminder'

export interface AppNotification {
  id: string
  kind: NotificationKind
  title: string
  body: string
  createdAt: string
  read: boolean
  locationId?: string
}

export interface AuditEntry {
  id: string
  actorId: string
  actorName: string
  action: string
  entity: string
  entityId: string
  locationId: string
  at: string
  details?: string
}

export interface AvailabilityWindow {
  id: string
  dayOfWeek: number // 0 = Sunday
  startTime: string // 'HH:mm'
  endTime: string // 'HH:mm'
}

export interface AvailabilityException {
  id: string
  date: string // ISO date
  available: boolean
  note?: string
}

export interface StaffAvailability {
  staffId: string
  recurring: AvailabilityWindow[]
  exceptions: AvailabilityException[]
}

export interface FairnessRow {
  staffId: string
  totalHours: number
  premiumShiftCount: number
  totalShiftCount: number
  fairnessScore: number // premium share relative to hours share
}
