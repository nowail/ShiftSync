import { addDays, format, startOfWeek } from 'date-fns'
import { CURRENT_WEEK_START_KEY, NEXT_WEEK_START_KEY } from './weeks'
import type {
  AppNotification,
  AuditEntry,
  Location,
  Shift,
  ShiftStatus,
  StaffAvailability,
  StaffMember,
  SwapRequest,
} from '../types'
import { zonedWallTimeToUtcIso } from './timezone'

export const LOCATIONS: Location[] = [
  { id: 'loc-sf', name: 'Downtown SF', city: 'San Francisco, CA', timezone: 'America/Los_Angeles' },
  { id: 'loc-pdx', name: 'Riverside Portland', city: 'Portland, OR', timezone: 'America/Los_Angeles' },
  { id: 'loc-nyc', name: 'Midtown NYC', city: 'New York, NY', timezone: 'America/New_York' },
  { id: 'loc-bos', name: 'Harborview Boston', city: 'Boston, MA', timezone: 'America/New_York' },
]

export const STAFF: StaffMember[] = [
  {
    id: 'usr-admin',
    name: 'Jordan Rivera',
    role: 'admin',
    homeLocationId: 'loc-sf',
    certifications: [{ locationId: 'loc-sf', skills: ['line', 'grill', 'prep', 'expo', 'bar', 'host', 'dish'] }],
    desiredWeeklyHours: 40,
    avatarColor: '#656B82',
  },
  {
    id: 'usr-mgr-sf',
    name: 'Casey Nolan',
    role: 'manager',
    homeLocationId: 'loc-sf',
    certifications: [
      { locationId: 'loc-sf', skills: ['line', 'grill', 'prep', 'expo'] },
      { locationId: 'loc-pdx', skills: ['line', 'grill'] },
    ],
    desiredWeeklyHours: 40,
    avatarColor: '#3E7C6B',
  },
  {
    id: 'usr-mgr-nyc',
    name: 'Devon Marsh',
    role: 'manager',
    homeLocationId: 'loc-nyc',
    certifications: [
      { locationId: 'loc-nyc', skills: ['line', 'grill', 'expo', 'bar'] },
      { locationId: 'loc-bos', skills: ['line', 'grill'] },
    ],
    desiredWeeklyHours: 40,
    avatarColor: '#3E7C6B',
  },
  {
    id: 'usr-1',
    name: 'Alex Chen',
    role: 'staff',
    homeLocationId: 'loc-sf',
    certifications: [
      { locationId: 'loc-sf', skills: ['line', 'grill'] },
      { locationId: 'loc-nyc', skills: ['line'] },
    ],
    desiredWeeklyHours: 32,
    avatarColor: '#E8A33D',
  },
  {
    id: 'usr-2',
    name: 'Priya Nair',
    role: 'staff',
    homeLocationId: 'loc-sf',
    certifications: [{ locationId: 'loc-sf', skills: ['line', 'expo'] }],
    desiredWeeklyHours: 35,
    avatarColor: '#C1473F',
  },
  {
    id: 'usr-3',
    name: 'Marcus Cho',
    role: 'staff',
    homeLocationId: 'loc-sf',
    certifications: [{ locationId: 'loc-sf', skills: ['grill', 'prep'] }],
    desiredWeeklyHours: 30,
    avatarColor: '#4B5169',
  },
  {
    id: 'usr-4',
    name: 'Kayla Lee',
    role: 'staff',
    homeLocationId: 'loc-sf',
    certifications: [{ locationId: 'loc-sf', skills: ['line', 'host'] }],
    desiredWeeklyHours: 25,
    avatarColor: '#868C9E',
  },
  {
    id: 'usr-5',
    name: 'Riley Wu',
    role: 'staff',
    homeLocationId: 'loc-sf',
    certifications: [{ locationId: 'loc-sf', skills: ['grill'] }],
    desiredWeeklyHours: 20,
    avatarColor: '#B8842E',
  },
  {
    id: 'usr-6',
    name: 'Sam Osei',
    role: 'staff',
    homeLocationId: 'loc-pdx',
    certifications: [{ locationId: 'loc-pdx', skills: ['line', 'bar'] }],
    desiredWeeklyHours: 30,
    avatarColor: '#3E7C6B',
  },
  {
    id: 'usr-7',
    name: 'Taylor Brooks',
    role: 'staff',
    homeLocationId: 'loc-pdx',
    certifications: [{ locationId: 'loc-pdx', skills: ['grill', 'dish'] }],
    desiredWeeklyHours: 28,
    avatarColor: '#656B82',
  },
  {
    id: 'usr-8',
    name: 'Morgan Diaz',
    role: 'staff',
    homeLocationId: 'loc-nyc',
    certifications: [{ locationId: 'loc-nyc', skills: ['line', 'expo'] }],
    desiredWeeklyHours: 32,
    avatarColor: '#E8A33D',
  },
  {
    id: 'usr-9',
    name: 'Jamie Park',
    role: 'staff',
    homeLocationId: 'loc-nyc',
    certifications: [{ locationId: 'loc-nyc', skills: ['bar', 'host'] }],
    desiredWeeklyHours: 24,
    avatarColor: '#C1473F',
  },
  {
    id: 'usr-10',
    name: 'Elliot Reyes',
    role: 'staff',
    homeLocationId: 'loc-bos',
    certifications: [{ locationId: 'loc-bos', skills: ['line', 'grill'] }],
    desiredWeeklyHours: 30,
    avatarColor: '#4B5169',
  },
  {
    id: 'usr-11',
    name: 'Nina Kowalski',
    role: 'staff',
    homeLocationId: 'loc-bos',
    certifications: [{ locationId: 'loc-bos', skills: ['prep', 'dish'] }],
    desiredWeeklyHours: 20,
    avatarColor: '#868C9E',
  },
]

// Both anchored to the same "today" used by weeks.ts, parsed back to Dates for arithmetic.
const CURRENT_WEEK_START = new Date(`${CURRENT_WEEK_START_KEY}T00:00:00`)
const NEXT_WEEK_START = new Date(`${NEXT_WEEK_START_KEY}T00:00:00`)

let shiftSeq = 0
function nextId(prefix: string) {
  shiftSeq += 1
  return `${prefix}-${shiftSeq}`
}

function dayKey(weekStart: Date, dayOffset: number) {
  return format(addDays(weekStart, dayOffset), 'yyyy-MM-dd')
}

interface RotationSlot {
  hhmmStart: string
  hhmmEnd: string
  role: Shift['role']
  staffId: string | null
}

/** Two staff rotating across a week's AM/PM slots, weekend PM marked premium. */
function buildRotationWeek(
  location: Location,
  weekStart: Date,
  weekStartKey: string,
  status: ShiftStatus,
  amStaffIds: (string | null)[],
  pmStaffIds: (string | null)[],
  amRole: Shift['role'],
  pmRole: Shift['role'],
  skipDays: number[] = [],
): Shift[] {
  const shifts: Shift[] = []
  for (let day = 0; day < 7; day++) {
    if (skipDays.includes(day)) continue
    const date = dayKey(weekStart, day)
    const isWeekendPm = day === 5 || day === 6 // Fri, Sat

    const slots: RotationSlot[] = [
      { hhmmStart: '07:00', hhmmEnd: '15:00', role: amRole, staffId: amStaffIds[day % amStaffIds.length] },
      { hhmmStart: '15:00', hhmmEnd: '23:00', role: pmRole, staffId: pmStaffIds[day % pmStaffIds.length] },
    ]

    for (const slot of slots) {
      shifts.push({
        id: nextId('sh'),
        locationId: location.id,
        weekStart: weekStartKey,
        date,
        startUtc: zonedWallTimeToUtcIso(date, slot.hhmmStart, location.timezone),
        endUtc: zonedWallTimeToUtcIso(date, slot.hhmmEnd, location.timezone),
        role: slot.role,
        assignedStaffId: slot.staffId,
        status,
        isPremium: slot === slots[1] && isWeekendPm,
      })
    }
  }
  return shifts
}

function buildShifts(): Shift[] {
  const shifts: Shift[] = []
  const loc = (id: string) => LOCATIONS.find((l) => l.id === id)!

  const weeks: { start: Date; key: string; status: ShiftStatus }[] = [
    { start: CURRENT_WEEK_START, key: CURRENT_WEEK_START_KEY, status: 'published' },
    { start: NEXT_WEEK_START, key: NEXT_WEEK_START_KEY, status: 'draft' },
  ]

  for (const week of weeks) {
    // Downtown SF — line AM (Kayla/Alex rotate), grill PM (Marcus/Riley rotate)
    shifts.push(
      ...buildRotationWeek(
        loc('loc-sf'),
        week.start,
        week.key,
        week.status,
        // Kayla (index 6, Sat) is intentionally not on the AM rotation that day — she
        // already works the Saturday-night overnight shift below and this avoids stacking
        // a 16-hour day on her.
        ['usr-4', 'usr-1', 'usr-4', 'usr-1', 'usr-4', 'usr-1', 'usr-1'],
        ['usr-3', 'usr-5', 'usr-3', 'usr-5', 'usr-3', 'usr-5', 'usr-3'],
        'line',
        'grill',
      ),
    )

    // Riverside Portland — line AM (Sam), grill PM (Taylor)
    shifts.push(
      ...buildRotationWeek(
        loc('loc-pdx'),
        week.start,
        week.key,
        week.status,
        ['usr-6', 'usr-6', 'usr-6', 'usr-6', 'usr-6', null, null],
        ['usr-7', 'usr-7', 'usr-7', 'usr-7', 'usr-7', 'usr-7', null],
        'line',
        'grill',
      ),
    )

    // Midtown NYC — line AM (Morgan), bar PM (Jamie)
    shifts.push(
      ...buildRotationWeek(
        loc('loc-nyc'),
        week.start,
        week.key,
        week.status,
        ['usr-8', 'usr-8', 'usr-8', 'usr-8', 'usr-8', 'usr-8', null],
        ['usr-9', 'usr-9', 'usr-9', null, 'usr-9', 'usr-9', 'usr-9'],
        'line',
        'bar',
      ),
    )

    // Harborview Boston — line AM + grill PM, both Elliot (only line/grill-certified there).
    // He alternates AM/PM rather than ever working both in the same day, and several slots
    // are intentionally unfilled since Nina (prep/dish) can't cover them.
    shifts.push(
      ...buildRotationWeek(
        loc('loc-bos'),
        week.start,
        week.key,
        week.status,
        ['usr-10', null, 'usr-10', null, 'usr-10', null, null],
        [null, 'usr-10', null, 'usr-10', null, null, 'usr-10'],
        'line',
        'grill',
      ),
    )
    // Boston prep/dish coverage for Nina, separate from the line/grill rotation.
    for (const day of [0, 2, 4, 6]) {
      const date = dayKey(week.start, day)
      shifts.push({
        id: nextId('sh'),
        locationId: 'loc-bos',
        weekStart: week.key,
        date,
        startUtc: zonedWallTimeToUtcIso(date, '09:00', loc('loc-bos').timezone),
        endUtc: zonedWallTimeToUtcIso(date, '15:00', loc('loc-bos').timezone),
        role: 'prep',
        assignedStaffId: 'usr-11',
        status: week.status,
        isPremium: false,
      })
    }
  }

  // --- Priya Nair: explicit shifts totaling 38h in the current (published) week ---
  const sf = loc('loc-sf')
  const priyaDays = [0, 1, 2, 3]
  for (const day of priyaDays) {
    const date = dayKey(CURRENT_WEEK_START, day)
    shifts.push({
      id: nextId('sh'),
      locationId: 'loc-sf',
      weekStart: CURRENT_WEEK_START_KEY,
      date,
      startUtc: zonedWallTimeToUtcIso(date, '08:00', sf.timezone),
      endUtc: zonedWallTimeToUtcIso(date, '16:00', sf.timezone),
      role: 'expo',
      assignedStaffId: 'usr-2',
      status: 'published',
      isPremium: false,
    })
  }
  {
    const date = dayKey(CURRENT_WEEK_START, 4)
    shifts.push({
      id: nextId('sh'),
      locationId: 'loc-sf',
      weekStart: CURRENT_WEEK_START_KEY,
      date,
      startUtc: zonedWallTimeToUtcIso(date, '08:00', sf.timezone),
      endUtc: zonedWallTimeToUtcIso(date, '14:00', sf.timezone),
      role: 'expo',
      assignedStaffId: 'usr-2',
      status: 'published',
      isPremium: false,
    })
  }

  // --- Unfilled shift starting soon (tomorrow), with exactly one qualified backup ---
  // Grill-certified at loc-sf: Alex Chen, Marcus Cho, Riley Wu. Alex and Marcus are both
  // double-booked elsewhere at the same time below, leaving Riley Wu as the sole backup.
  const tomorrowDate = addDays(new Date(), 1)
  const tomorrow = format(tomorrowDate, 'yyyy-MM-dd')
  const tomorrowWeekStartKey = format(startOfWeek(tomorrowDate, { weekStartsOn: 0 }), 'yyyy-MM-dd')
  const tomorrowWeekStatus: ShiftStatus = tomorrowWeekStartKey === CURRENT_WEEK_START_KEY ? 'published' : 'draft'
  const unfilledStart = zonedWallTimeToUtcIso(tomorrow, '15:00', sf.timezone)
  const unfilledEnd = zonedWallTimeToUtcIso(tomorrow, '23:00', sf.timezone)
  // Drop the generic rotation's grill-PM seat for this slot so it doesn't sit alongside
  // (and double-book whoever it assigned against) the dedicated unfilled seat below.
  const genericIdx = shifts.findIndex(
    (s) => s.locationId === 'loc-sf' && s.role === 'grill' && s.startUtc === unfilledStart,
  )
  if (genericIdx !== -1) shifts.splice(genericIdx, 1)
  shifts.push({
    id: 'sh-unfilled-soon',
    locationId: 'loc-sf',
    weekStart: tomorrowWeekStartKey,
    date: tomorrow,
    startUtc: unfilledStart,
    endUtc: unfilledEnd,
    role: 'grill',
    assignedStaffId: null,
    status: tomorrowWeekStatus,
    isPremium: false,
  })
  // Alex Chen already working the NYC line shift at the same moment.
  shifts.push({
    id: nextId('sh'),
    locationId: 'loc-nyc',
    weekStart: tomorrowWeekStartKey,
    date: tomorrow,
    startUtc: unfilledStart,
    endUtc: unfilledEnd,
    role: 'line',
    assignedStaffId: 'usr-1',
    status: tomorrowWeekStatus,
    isPremium: false,
  })
  // Marcus Cho already covering a prep task at the same moment.
  shifts.push({
    id: nextId('sh'),
    locationId: 'loc-sf',
    weekStart: tomorrowWeekStartKey,
    date: tomorrow,
    startUtc: unfilledStart,
    endUtc: unfilledEnd,
    role: 'prep',
    assignedStaffId: 'usr-3',
    status: tomorrowWeekStatus,
    isPremium: false,
  })

  // --- Overnight shift spanning midnight (Saturday night into Sunday) ---
  const saturday = dayKey(CURRENT_WEEK_START, 6)
  const sunday = dayKey(CURRENT_WEEK_START, 7)
  shifts.push({
    id: 'sh-overnight',
    locationId: 'loc-sf',
    weekStart: CURRENT_WEEK_START_KEY,
    date: saturday,
    startUtc: zonedWallTimeToUtcIso(saturday, '21:00', sf.timezone),
    endUtc: zonedWallTimeToUtcIso(sunday, '05:00', sf.timezone),
    role: 'line',
    assignedStaffId: 'usr-4',
    status: 'published',
    isPremium: true,
  })

  // --- A two-seat slot to demonstrate the headcount fill indicator (1 of 2 filled) ---
  // Friday, not Saturday: keeps this independent of the overnight shift and of "tomorrow"
  // above, whichever day that happens to land on.
  const fillDemoDate = dayKey(CURRENT_WEEK_START, 5)
  const fillStart = zonedWallTimeToUtcIso(fillDemoDate, '15:00', sf.timezone)
  const fillEnd = zonedWallTimeToUtcIso(fillDemoDate, '23:00', sf.timezone)
  shifts.push({
    id: nextId('sh'),
    locationId: 'loc-sf',
    weekStart: CURRENT_WEEK_START_KEY,
    date: fillDemoDate,
    startUtc: fillStart,
    endUtc: fillEnd,
    role: 'line',
    assignedStaffId: 'usr-4',
    status: 'published',
    isPremium: true,
  })
  shifts.push({
    id: nextId('sh'),
    locationId: 'loc-sf',
    weekStart: CURRENT_WEEK_START_KEY,
    date: fillDemoDate,
    startUtc: fillStart,
    endUtc: fillEnd,
    role: 'line',
    assignedStaffId: null,
    status: 'published',
    isPremium: true,
  })

  // --- 7th-consecutive-day override example ---
  // Taylor Brooks already works PM grill Sun-Fri at Riverside Portland (6 consecutive
  // days, the soft warning threshold). This adds the Saturday assignment that pushed
  // past it into the hard-but-overridable 7th-day rule — already resolved via manager
  // override, so the state is visible on first load rather than only reachable by
  // clicking through the assign flow.
  const pdx = loc('loc-pdx')
  const overrideDay = dayKey(CURRENT_WEEK_START, 6)
  shifts.push({
    id: 'sh-overtime-trap-override',
    locationId: 'loc-pdx',
    weekStart: CURRENT_WEEK_START_KEY,
    date: overrideDay,
    startUtc: zonedWallTimeToUtcIso(overrideDay, '15:00', pdx.timezone),
    endUtc: zonedWallTimeToUtcIso(overrideDay, '23:00', pdx.timezone),
    role: 'grill',
    assignedStaffId: 'usr-7',
    status: 'published',
    isPremium: false,
    overrideReason: 'No other grill-certified staff available Saturday night; Taylor agreed to cover. Reviewed and approved.',
  })

  return shifts
}

export const SHIFTS: Shift[] = buildShifts()

export const SWAPS: SwapRequest[] = [
  {
    id: 'swap-1',
    type: 'swap',
    requestingStaffId: 'usr-3',
    shiftId:
      SHIFTS.find(
        (s) => s.assignedStaffId === 'usr-3' && s.weekStart === CURRENT_WEEK_START_KEY && s.role === 'grill',
      )?.id ?? SHIFTS[0].id,
    targetStaffId: 'usr-5',
    stage: 'awaiting_manager',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
    history: [
      { stage: 'requested', at: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString() },
      { stage: 'peer_accepted', at: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(), note: 'Riley Wu accepted the swap.' },
    ],
  },
  {
    id: 'swap-2',
    type: 'drop',
    requestingStaffId: 'usr-9',
    shiftId:
      SHIFTS.find((s) => s.assignedStaffId === 'usr-9' && s.weekStart === NEXT_WEEK_START_KEY)?.id ?? SHIFTS[0].id,
    targetStaffId: null,
    stage: 'requested',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    history: [{ stage: 'requested', at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString() }],
  },
  {
    id: 'swap-3',
    type: 'swap',
    requestingStaffId: 'usr-7',
    shiftId:
      SHIFTS.find((s) => s.assignedStaffId === 'usr-7' && s.weekStart === CURRENT_WEEK_START_KEY)?.id ?? SHIFTS[0].id,
    targetStaffId: 'usr-6',
    stage: 'approved',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    history: [
      { stage: 'requested', at: new Date(Date.now() - 1000 * 60 * 60 * 96).toISOString() },
      { stage: 'peer_accepted', at: new Date(Date.now() - 1000 * 60 * 60 * 84).toISOString() },
      { stage: 'awaiting_manager', at: new Date(Date.now() - 1000 * 60 * 60 * 80).toISOString() },
      { stage: 'approved', at: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(), note: 'Approved by Casey Nolan.' },
    ],
  },
]

export const NOTIFICATIONS: AppNotification[] = [
  {
    id: 'notif-1',
    kind: 'schedule_published',
    title: 'Schedule published',
    body: 'Downtown SF week of ' + CURRENT_WEEK_START_KEY + ' is now live for staff.',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    read: true,
    locationId: 'loc-sf',
  },
  {
    id: 'notif-2',
    kind: 'swap_requested',
    title: 'New swap request',
    body: 'Marcus Cho requested a swap with Riley Wu for a grill shift.',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
    read: false,
    locationId: 'loc-sf',
  },
  {
    id: 'notif-3',
    kind: 'shift_reminder',
    title: 'Shift tomorrow',
    body: 'You have a grill shift starting tomorrow at 3:00pm.',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    read: false,
    locationId: 'loc-sf',
  },
]

export const AVAILABILITY: StaffAvailability[] = [
  {
    staffId: 'usr-4',
    recurring: [
      { id: 'av-1', dayOfWeek: 0, startTime: '07:00', endTime: '23:59' },
      { id: 'av-2', dayOfWeek: 1, startTime: '07:00', endTime: '15:00' },
      { id: 'av-3', dayOfWeek: 2, startTime: '07:00', endTime: '15:00' },
      { id: 'av-4', dayOfWeek: 5, startTime: '15:00', endTime: '23:59' },
      { id: 'av-5', dayOfWeek: 6, startTime: '15:00', endTime: '23:59' },
    ],
    exceptions: [{ id: 'exc-1', date: dayKey(NEXT_WEEK_START, 3), available: false, note: 'Doctor appointment' }],
  },
  {
    staffId: 'usr-2',
    recurring: [
      { id: 'av-6', dayOfWeek: 0, startTime: '08:00', endTime: '16:00' },
      { id: 'av-7', dayOfWeek: 1, startTime: '08:00', endTime: '16:00' },
      { id: 'av-8', dayOfWeek: 2, startTime: '08:00', endTime: '16:00' },
      { id: 'av-9', dayOfWeek: 3, startTime: '08:00', endTime: '16:00' },
    ],
    exceptions: [],
  },
]

export const AUDIT_LOG: AuditEntry[] = [
  {
    id: 'audit-1',
    actorId: 'usr-mgr-sf',
    actorName: 'Casey Nolan',
    action: 'published_schedule',
    entity: 'week',
    entityId: CURRENT_WEEK_START_KEY,
    locationId: 'loc-sf',
    at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    details: 'Published Downtown SF week of ' + CURRENT_WEEK_START_KEY,
  },
  {
    id: 'audit-2',
    actorId: 'usr-mgr-sf',
    actorName: 'Casey Nolan',
    action: 'assigned_shift',
    entity: 'shift',
    entityId: 'sh-overnight',
    locationId: 'loc-sf',
    at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    details: 'Assigned Kayla Lee to the Saturday overnight line shift.',
  },
  {
    id: 'audit-3',
    actorId: 'usr-mgr-nyc',
    actorName: 'Devon Marsh',
    action: 'approved_swap',
    entity: 'swap',
    entityId: 'swap-3',
    locationId: 'loc-pdx',
    at: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    details: 'Approved swap between Taylor Brooks and Sam Osei.',
  },
  {
    id: 'audit-4',
    actorId: 'usr-admin',
    actorName: 'Jordan Rivera',
    action: 'added_staff',
    entity: 'staff',
    entityId: 'usr-11',
    locationId: 'loc-bos',
    at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
    details: 'Added Nina Kowalski (prep, dish) at Harborview Boston.',
  },
  {
    id: 'audit-5',
    actorId: 'usr-mgr-sf',
    actorName: 'Casey Nolan',
    action: 'edited_shift',
    entity: 'shift',
    entityId: 'sh-unfilled-soon',
    locationId: 'loc-sf',
    at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    details: 'Removed Priya Nair from the grill shift after an availability conflict.',
  },
  {
    id: 'audit-6',
    actorId: 'usr-mgr-sf',
    actorName: 'Casey Nolan',
    action: 'assigned_shift_override',
    entity: 'shift',
    entityId: 'sh-overtime-trap-override',
    locationId: 'loc-pdx',
    at: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
    details:
      'Assigned Taylor Brooks to Saturday grill via manager override — 7th consecutive day worked. Reason: "No other grill-certified staff available Saturday night; Taylor agreed to cover. Reviewed and approved."',
  },
]
