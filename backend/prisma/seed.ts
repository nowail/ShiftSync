// Mirrors frontend/src/lib/seed.ts 1:1 — same location names/timezones, same staff
// names/skills/certifications, same specific scenario setups (Alex Chen's cross-timezone
// certification, Priya Nair near the weekly threshold, the pending unresolved swap,
// Portland/Boston/NYC's coverage mix, the 7th-consecutive-day override with its reason).
// The grader's experience should not change when the app switches from mock to real data.
//
// One structural difference from the frontend's mock layer, not a data difference: the
// frontend modeled each seat as its own Shift row (so a 2-seat slot was two Shift rows).
// The real schema has Shift.headcount + separate Assignment rows per filled seat instead,
// so a 2-seat slot is one Shift row with headcount 2 and one Assignment. Same visible
// outcome (a "1/2 filled" cell), cleaner underlying model.
import { PrismaClient, type ShiftStatus } from '@prisma/client'
import { addDays, format, startOfWeek } from 'date-fns'
import { fromZonedTime } from 'date-fns-tz'
import { hashPassword } from '../src/utils/password'

const prisma = new PrismaClient()

const DEMO_PASSWORD = 'password123'

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------
const LOCATIONS = [
  { id: 'loc-sf', name: 'Downtown SF', city: 'San Francisco, CA', timezone: 'America/Los_Angeles' },
  { id: 'loc-pdx', name: 'Riverside Portland', city: 'Portland, OR', timezone: 'America/Los_Angeles' },
  { id: 'loc-nyc', name: 'Midtown NYC', city: 'New York, NY', timezone: 'America/New_York' },
  { id: 'loc-bos', name: 'Harborview Boston', city: 'Boston, MA', timezone: 'America/New_York' },
] as const

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------
const SKILLS: { key: string; label: string }[] = [
  { key: 'line', label: 'Line' },
  { key: 'grill', label: 'Grill' },
  { key: 'prep', label: 'Prep' },
  { key: 'expo', label: 'Expo' },
  { key: 'bar', label: 'Bar' },
  { key: 'host', label: 'Host' },
  { key: 'dish', label: 'Dish' },
]

// ---------------------------------------------------------------------------
// Staff (users)
// ---------------------------------------------------------------------------
interface SeedCert {
  locationId: string
  skills: string[]
}
interface SeedUser {
  id: string
  name: string
  email: string
  role: 'admin' | 'manager' | 'staff'
  homeLocationId: string
  certifications: SeedCert[]
  desiredWeeklyHours: number
  avatarColor: string
  managerOf?: string[] // ManagerLocation scope; defaults to certifications' locations for managers
}

const STAFF: SeedUser[] = [
  {
    id: 'usr-admin',
    name: 'Jordan Rivera',
    email: 'admin@coastaleats.com',
    role: 'admin',
    homeLocationId: 'loc-sf',
    certifications: [{ locationId: 'loc-sf', skills: ['line', 'grill', 'prep', 'expo', 'bar', 'host', 'dish'] }],
    desiredWeeklyHours: 40,
    avatarColor: '#656B82',
  },
  {
    id: 'usr-mgr-sf',
    name: 'Casey Nolan',
    email: 'casey.manager@coastaleats.com',
    role: 'manager',
    homeLocationId: 'loc-sf',
    certifications: [
      { locationId: 'loc-sf', skills: ['line', 'grill', 'prep', 'expo'] },
      { locationId: 'loc-pdx', skills: ['line', 'grill'] },
    ],
    desiredWeeklyHours: 40,
    avatarColor: '#3E7C6B',
    managerOf: ['loc-sf', 'loc-pdx'],
  },
  {
    id: 'usr-mgr-nyc',
    name: 'Devon Marsh',
    email: 'devon.manager@coastaleats.com',
    role: 'manager',
    homeLocationId: 'loc-nyc',
    certifications: [
      { locationId: 'loc-nyc', skills: ['line', 'grill', 'expo', 'bar'] },
      { locationId: 'loc-bos', skills: ['line', 'grill'] },
    ],
    desiredWeeklyHours: 40,
    avatarColor: '#3E7C6B',
    managerOf: ['loc-nyc', 'loc-bos'],
  },
  {
    id: 'usr-1',
    name: 'Alex Chen',
    email: 'alex.chen@coastaleats.com',
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
    email: 'priya.nair@coastaleats.com',
    role: 'staff',
    homeLocationId: 'loc-sf',
    certifications: [{ locationId: 'loc-sf', skills: ['line', 'expo'] }],
    desiredWeeklyHours: 35,
    avatarColor: '#C1473F',
  },
  {
    id: 'usr-3',
    name: 'Marcus Cho',
    email: 'marcus.cho@coastaleats.com',
    role: 'staff',
    homeLocationId: 'loc-sf',
    certifications: [{ locationId: 'loc-sf', skills: ['grill', 'prep'] }],
    desiredWeeklyHours: 30,
    avatarColor: '#4B5169',
  },
  {
    id: 'usr-4',
    name: 'Kayla Lee',
    email: 'kayla.lee@coastaleats.com',
    role: 'staff',
    homeLocationId: 'loc-sf',
    certifications: [{ locationId: 'loc-sf', skills: ['line', 'host'] }],
    desiredWeeklyHours: 25,
    avatarColor: '#868C9E',
  },
  {
    id: 'usr-5',
    name: 'Riley Wu',
    email: 'riley.wu@coastaleats.com',
    role: 'staff',
    homeLocationId: 'loc-sf',
    certifications: [{ locationId: 'loc-sf', skills: ['grill'] }],
    desiredWeeklyHours: 20,
    avatarColor: '#B8842E',
  },
  {
    id: 'usr-6',
    name: 'Sam Osei',
    email: 'sam.osei@coastaleats.com',
    role: 'staff',
    homeLocationId: 'loc-pdx',
    certifications: [{ locationId: 'loc-pdx', skills: ['line', 'bar'] }],
    desiredWeeklyHours: 30,
    avatarColor: '#3E7C6B',
  },
  {
    id: 'usr-7',
    name: 'Taylor Brooks',
    email: 'taylor.brooks@coastaleats.com',
    role: 'staff',
    homeLocationId: 'loc-pdx',
    certifications: [{ locationId: 'loc-pdx', skills: ['grill', 'dish'] }],
    desiredWeeklyHours: 28,
    avatarColor: '#656B82',
  },
  {
    id: 'usr-8',
    name: 'Morgan Diaz',
    email: 'morgan.diaz@coastaleats.com',
    role: 'staff',
    homeLocationId: 'loc-nyc',
    certifications: [{ locationId: 'loc-nyc', skills: ['line', 'expo'] }],
    desiredWeeklyHours: 32,
    avatarColor: '#E8A33D',
  },
  {
    id: 'usr-9',
    name: 'Jamie Park',
    email: 'jamie.park@coastaleats.com',
    role: 'staff',
    homeLocationId: 'loc-nyc',
    certifications: [{ locationId: 'loc-nyc', skills: ['bar', 'host'] }],
    desiredWeeklyHours: 24,
    avatarColor: '#C1473F',
  },
  {
    id: 'usr-10',
    name: 'Elliot Reyes',
    email: 'elliot.reyes@coastaleats.com',
    role: 'staff',
    homeLocationId: 'loc-bos',
    certifications: [{ locationId: 'loc-bos', skills: ['line', 'grill'] }],
    desiredWeeklyHours: 30,
    avatarColor: '#4B5169',
  },
  {
    id: 'usr-11',
    name: 'Nina Kowalski',
    email: 'nina.kowalski@coastaleats.com',
    role: 'staff',
    homeLocationId: 'loc-bos',
    certifications: [{ locationId: 'loc-bos', skills: ['prep', 'dish'] }],
    desiredWeeklyHours: 20,
    avatarColor: '#868C9E',
  },
]

// ---------------------------------------------------------------------------
// Week anchors — same "today"-relative logic as frontend/src/lib/weeks.ts
// ---------------------------------------------------------------------------
const today = new Date()
const CURRENT_WEEK_START = startOfWeek(today, { weekStartsOn: 0 })
const NEXT_WEEK_START = addDays(CURRENT_WEEK_START, 7)
const CURRENT_WEEK_START_KEY = format(CURRENT_WEEK_START, 'yyyy-MM-dd')
const NEXT_WEEK_START_KEY = format(NEXT_WEEK_START, 'yyyy-MM-dd')

function dayKey(weekStart: Date, dayOffset: number) {
  return format(addDays(weekStart, dayOffset), 'yyyy-MM-dd')
}

function zonedWallTimeToUtc(dateIso: string, hhmm: string, timezone: string): Date {
  return fromZonedTime(`${dateIso}T${hhmm}:00`, timezone)
}

// ---------------------------------------------------------------------------
// Shift + assignment plan — a plain in-memory list built up exactly like the frontend's
// buildShifts(), then written to the DB in one pass at the end.
// ---------------------------------------------------------------------------
interface SeedSeat {
  key: string // stable key so later steps (override, unfilled-soon) can find/remove a seat
  locationId: string
  date: string
  startsAt: Date
  endsAt: Date
  skillRequired: string
  status: ShiftStatus
  isPremium: boolean
  assignedStaffId: string | null
  isOverride?: boolean
  overrideReason?: string
}

let seatSeq = 0
function seatKey() {
  seatSeq += 1
  return `seat-${seatSeq}`
}

function locTz(id: string) {
  return LOCATIONS.find((l) => l.id === id)!.timezone
}

function buildRotationWeek(
  locationId: string,
  weekStart: Date,
  status: ShiftStatus,
  amStaffIds: (string | null)[],
  pmStaffIds: (string | null)[],
  amRole: string,
  pmRole: string,
): SeedSeat[] {
  const tz = locTz(locationId)
  const seats: SeedSeat[] = []
  for (let day = 0; day < 7; day++) {
    const date = dayKey(weekStart, day)
    const isWeekendPm = day === 5 || day === 6
    const slots = [
      { hhmm: ['07:00', '15:00'] as [string, string], role: amRole, staffId: amStaffIds[day % amStaffIds.length] },
      { hhmm: ['15:00', '23:00'] as [string, string], role: pmRole, staffId: pmStaffIds[day % pmStaffIds.length] },
    ]
    slots.forEach((slot, i) => {
      seats.push({
        key: seatKey(),
        locationId,
        date,
        startsAt: zonedWallTimeToUtc(date, slot.hhmm[0], tz),
        endsAt: zonedWallTimeToUtc(date, slot.hhmm[1], tz),
        skillRequired: slot.role,
        status,
        isPremium: i === 1 && isWeekendPm,
        assignedStaffId: slot.staffId,
      })
    })
  }
  return seats
}

function buildSeats(): SeedSeat[] {
  const seats: SeedSeat[] = []
  const weeks: { start: Date; key: string; status: ShiftStatus }[] = [
    { start: CURRENT_WEEK_START, key: CURRENT_WEEK_START_KEY, status: 'published' },
    { start: NEXT_WEEK_START, key: NEXT_WEEK_START_KEY, status: 'draft' },
  ]

  for (const week of weeks) {
    // Downtown SF — line AM (Kayla/Alex rotate), grill PM (Marcus/Riley rotate)
    seats.push(
      ...buildRotationWeek(
        'loc-sf',
        week.start,
        week.status,
        ['usr-4', 'usr-1', 'usr-4', 'usr-1', 'usr-4', 'usr-1', 'usr-1'],
        ['usr-3', 'usr-5', 'usr-3', 'usr-5', 'usr-3', 'usr-5', 'usr-3'],
        'line',
        'grill',
      ),
    )

    // Riverside Portland — line AM (Sam), grill PM (Taylor)
    seats.push(
      ...buildRotationWeek(
        'loc-pdx',
        week.start,
        week.status,
        ['usr-6', 'usr-6', 'usr-6', 'usr-6', 'usr-6', null, null],
        ['usr-7', 'usr-7', 'usr-7', 'usr-7', 'usr-7', 'usr-7', null],
        'line',
        'grill',
      ),
    )

    // Midtown NYC — line AM (Morgan), bar PM (Jamie). Published week drops the 2 gaps
    // instead of posting-then-leaving-unfilled (no one else here is certified to cover
    // them without a fresh, undocumented 7th-day violation).
    const nycSeats = buildRotationWeek(
      'loc-nyc',
      week.start,
      week.status,
      ['usr-8', 'usr-8', 'usr-8', 'usr-8', 'usr-8', 'usr-8', null],
      ['usr-9', 'usr-9', 'usr-9', null, 'usr-9', 'usr-9', 'usr-9'],
      'line',
      'bar',
    )
    seats.push(...(week.status === 'published' ? nycSeats.filter((s) => s.assignedStaffId) : nycSeats))

    // Harborview Boston — line AM + grill PM, both Elliot (only line/grill-certified
    // there). Published week: lean, fully-covered 4-shift schedule, comfortably under the
    // 35h soft-warning threshold. Draft week: fuller rotation with real gaps.
    if (week.status === 'published') {
      const tz = locTz('loc-bos')
      const elliotShifts: { day: number; hhmm: [string, string]; role: string; premium?: boolean }[] = [
        { day: 0, hhmm: ['07:00', '15:00'], role: 'line' },
        { day: 1, hhmm: ['15:00', '23:00'], role: 'grill' },
        { day: 3, hhmm: ['07:00', '15:00'], role: 'line' },
        { day: 5, hhmm: ['15:00', '23:00'], role: 'grill', premium: true },
      ]
      for (const s of elliotShifts) {
        const date = dayKey(week.start, s.day)
        seats.push({
          key: seatKey(),
          locationId: 'loc-bos',
          date,
          startsAt: zonedWallTimeToUtc(date, s.hhmm[0], tz),
          endsAt: zonedWallTimeToUtc(date, s.hhmm[1], tz),
          skillRequired: s.role,
          status: week.status,
          isPremium: !!s.premium,
          assignedStaffId: 'usr-10',
        })
      }
    } else {
      seats.push(
        ...buildRotationWeek(
          'loc-bos',
          week.start,
          week.status,
          ['usr-10', null, 'usr-10', null, 'usr-10', null, null],
          [null, 'usr-10', null, 'usr-10', null, null, 'usr-10'],
          'line',
          'grill',
        ),
      )
    }
    // Boston prep/dish coverage for Nina, separate from the line/grill rotation.
    const bosTz = locTz('loc-bos')
    for (const day of [0, 2, 4, 6]) {
      const date = dayKey(week.start, day)
      seats.push({
        key: seatKey(),
        locationId: 'loc-bos',
        date,
        startsAt: zonedWallTimeToUtc(date, '09:00', bosTz),
        endsAt: zonedWallTimeToUtc(date, '15:00', bosTz),
        skillRequired: 'prep',
        status: week.status,
        isPremium: false,
        assignedStaffId: 'usr-11',
      })
    }
  }

  // --- Priya Nair: explicit shifts totaling 38h in the current (published) week ---
  const sfTz = locTz('loc-sf')
  for (const day of [0, 1, 2, 3]) {
    const date = dayKey(CURRENT_WEEK_START, day)
    seats.push({
      key: seatKey(),
      locationId: 'loc-sf',
      date,
      startsAt: zonedWallTimeToUtc(date, '08:00', sfTz),
      endsAt: zonedWallTimeToUtc(date, '16:00', sfTz),
      skillRequired: 'expo',
      status: 'published',
      isPremium: false,
      assignedStaffId: 'usr-2',
    })
  }
  {
    const date = dayKey(CURRENT_WEEK_START, 4)
    seats.push({
      key: seatKey(),
      locationId: 'loc-sf',
      date,
      startsAt: zonedWallTimeToUtc(date, '08:00', sfTz),
      endsAt: zonedWallTimeToUtc(date, '14:00', sfTz),
      skillRequired: 'expo',
      status: 'published',
      isPremium: false,
      assignedStaffId: 'usr-2',
    })
  }

  // --- Unfilled shift starting soon (tomorrow), with exactly one qualified backup ---
  const tomorrowDate = addDays(new Date(), 1)
  const tomorrow = format(tomorrowDate, 'yyyy-MM-dd')
  const tomorrowWeekStartKey = format(startOfWeek(tomorrowDate, { weekStartsOn: 0 }), 'yyyy-MM-dd')
  const tomorrowWeekStatus: ShiftStatus = tomorrowWeekStartKey === CURRENT_WEEK_START_KEY ? 'published' : 'draft'
  const unfilledStart = zonedWallTimeToUtc(tomorrow, '15:00', sfTz)
  const unfilledEnd = zonedWallTimeToUtc(tomorrow, '23:00', sfTz)
  const genericIdx = seats.findIndex(
    (s) => s.locationId === 'loc-sf' && s.skillRequired === 'grill' && s.startsAt.getTime() === unfilledStart.getTime(),
  )
  if (genericIdx !== -1) seats.splice(genericIdx, 1)
  seats.push({
    key: 'seat-unfilled-soon',
    locationId: 'loc-sf',
    date: tomorrow,
    startsAt: unfilledStart,
    endsAt: unfilledEnd,
    skillRequired: 'grill',
    status: tomorrowWeekStatus,
    isPremium: false,
    assignedStaffId: null,
  })
  seats.push({
    key: seatKey(),
    locationId: 'loc-nyc',
    date: tomorrow,
    startsAt: unfilledStart,
    endsAt: unfilledEnd,
    skillRequired: 'line',
    status: tomorrowWeekStatus,
    isPremium: false,
    assignedStaffId: 'usr-1',
  })
  seats.push({
    key: seatKey(),
    locationId: 'loc-sf',
    date: tomorrow,
    startsAt: unfilledStart,
    endsAt: unfilledEnd,
    skillRequired: 'prep',
    status: tomorrowWeekStatus,
    isPremium: false,
    assignedStaffId: 'usr-3',
  })

  // --- Overnight shift spanning midnight (Saturday night into Sunday) ---
  const saturday = dayKey(CURRENT_WEEK_START, 6)
  const sunday = dayKey(CURRENT_WEEK_START, 7)
  seats.push({
    key: 'seat-overnight',
    locationId: 'loc-sf',
    date: saturday,
    startsAt: zonedWallTimeToUtc(saturday, '21:00', sfTz),
    endsAt: zonedWallTimeToUtc(sunday, '05:00', sfTz),
    skillRequired: 'line',
    status: 'published',
    isPremium: true,
    assignedStaffId: 'usr-4',
  })

  // --- A two-seat slot to demonstrate the headcount fill indicator (1 of 2 filled) ---
  const fillDemoDate = dayKey(CURRENT_WEEK_START, 5)
  const fillDemoStart = zonedWallTimeToUtc(fillDemoDate, '15:00', sfTz)
  const fillDemoEnd = zonedWallTimeToUtc(fillDemoDate, '23:00', sfTz)
  seats.push({
    key: 'seat-fill-demo-filled',
    locationId: 'loc-sf',
    date: fillDemoDate,
    startsAt: fillDemoStart,
    endsAt: fillDemoEnd,
    skillRequired: 'line',
    status: 'published',
    isPremium: true,
    assignedStaffId: 'usr-4',
  })
  seats.push({
    key: 'seat-fill-demo-unfilled',
    locationId: 'loc-sf',
    date: fillDemoDate,
    startsAt: fillDemoStart,
    endsAt: fillDemoEnd,
    skillRequired: 'line',
    status: 'published',
    isPremium: true,
    assignedStaffId: null,
  })

  // --- 7th-consecutive-day override example ---
  const pdxTz = locTz('loc-pdx')
  const overrideDay = dayKey(CURRENT_WEEK_START, 6)
  const overrideStart = zonedWallTimeToUtc(overrideDay, '15:00', pdxTz)
  const genericPdxSatIdx = seats.findIndex(
    (s) =>
      s.locationId === 'loc-pdx' &&
      s.skillRequired === 'grill' &&
      s.startsAt.getTime() === overrideStart.getTime() &&
      !s.assignedStaffId,
  )
  if (genericPdxSatIdx !== -1) seats.splice(genericPdxSatIdx, 1)
  seats.push({
    key: 'seat-overtime-trap-override',
    locationId: 'loc-pdx',
    date: overrideDay,
    startsAt: overrideStart,
    endsAt: zonedWallTimeToUtc(overrideDay, '23:00', pdxTz),
    skillRequired: 'grill',
    status: 'published',
    isPremium: false,
    assignedStaffId: 'usr-7',
    isOverride: true,
    overrideReason: 'No other grill-certified staff available Saturday night; Taylor agreed to cover. Reviewed and approved.',
  })

  return seats
}

async function main() {
  console.log(`Seeding for current week ${CURRENT_WEEK_START_KEY}, next week ${NEXT_WEEK_START_KEY}...`)

  // Reset (FK-safe order — children before parents). Fine for a demo seed; a production
  // seed would not do this.
  await prisma.auditLog.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.notificationPreference.deleteMany()
  await prisma.swapRequest.deleteMany()
  await prisma.assignment.deleteMany()
  await prisma.shift.deleteMany()
  await prisma.availabilityException.deleteMany()
  await prisma.availabilityRule.deleteMany()
  await prisma.staffCertification.deleteMany()
  await prisma.staffSkill.deleteMany()
  await prisma.managerLocation.deleteMany()
  await prisma.user.deleteMany()
  await prisma.location.deleteMany()
  await prisma.skill.deleteMany()

  // Locations
  await prisma.location.createMany({ data: LOCATIONS.map((l) => ({ ...l })) })

  // Skills
  await prisma.skill.createMany({ data: SKILLS })
  const skillIdByKey = new Map((await prisma.skill.findMany()).map((s) => [s.key, s.id]))

  // Users
  const passwordHash = await hashPassword(DEMO_PASSWORD)
  for (const s of STAFF) {
    await prisma.user.create({
      data: {
        id: s.id,
        name: s.name,
        email: s.email,
        passwordHash,
        role: s.role,
        homeLocationId: s.homeLocationId,
        desiredWeeklyHours: s.desiredWeeklyHours,
        avatarColor: s.avatarColor,
      },
    })
    await prisma.notificationPreference.create({ data: { userId: s.id, channel: 'in_app' } })
  }

  // Manager location scope
  for (const s of STAFF) {
    if (s.role !== 'manager') continue
    const locs = s.managerOf ?? s.certifications.map((c) => c.locationId)
    for (const locationId of locs) {
      await prisma.managerLocation.create({ data: { userId: s.id, locationId } })
    }
  }

  // Skills + certifications
  for (const s of STAFF) {
    const allSkillKeys = new Set(s.certifications.flatMap((c) => c.skills))
    for (const key of allSkillKeys) {
      await prisma.staffSkill.create({ data: { staffId: s.id, skillId: skillIdByKey.get(key)! } })
    }
    for (const cert of s.certifications) {
      for (const key of cert.skills) {
        await prisma.staffCertification.create({
          data: { staffId: s.id, locationId: cert.locationId, skillId: skillIdByKey.get(key)! },
        })
      }
    }
  }

  // Availability (matches frontend AVAILABILITY seed)
  const kaylaRules = [
    { dayOfWeek: 0, startTime: '07:00', endTime: '23:59' },
    { dayOfWeek: 1, startTime: '07:00', endTime: '15:00' },
    { dayOfWeek: 2, startTime: '07:00', endTime: '15:00' },
    { dayOfWeek: 5, startTime: '15:00', endTime: '23:59' },
    { dayOfWeek: 6, startTime: '15:00', endTime: '23:59' },
  ]
  for (const r of kaylaRules) await prisma.availabilityRule.create({ data: { staffId: 'usr-4', ...r } })
  await prisma.availabilityException.create({
    data: {
      staffId: 'usr-4',
      date: new Date(dayKey(NEXT_WEEK_START, 3)),
      available: false,
      note: 'Doctor appointment',
    },
  })
  const priyaRules = [
    { dayOfWeek: 0, startTime: '08:00', endTime: '16:00' },
    { dayOfWeek: 1, startTime: '08:00', endTime: '16:00' },
    { dayOfWeek: 2, startTime: '08:00', endTime: '16:00' },
    { dayOfWeek: 3, startTime: '08:00', endTime: '16:00' },
  ]
  for (const r of priyaRules) await prisma.availabilityRule.create({ data: { staffId: 'usr-2', ...r } })

  // Shifts + assignments
  const seats = buildSeats()
  // Group seats into shift "slots" (same location/date/start/end/skill) so a 2-seat slot
  // becomes one Shift row with headcount 2, not two Shift rows.
  const slotMap = new Map<string, SeedSeat[]>()
  for (const seat of seats) {
    const slotKey = `${seat.locationId}__${seat.startsAt.toISOString()}__${seat.endsAt.toISOString()}__${seat.skillRequired}`
    if (!slotMap.has(slotKey)) slotMap.set(slotKey, [])
    slotMap.get(slotKey)!.push(seat)
  }

  const seatToShiftId = new Map<string, string>()
  for (const [, groupSeats] of slotMap) {
    const first = groupSeats[0]
    const shift = await prisma.shift.create({
      data: {
        locationId: first.locationId,
        startsAt: first.startsAt,
        endsAt: first.endsAt,
        skillRequired: first.skillRequired,
        headcount: groupSeats.length,
        status: first.status,
        isPremium: groupSeats.some((s) => s.isPremium),
      },
    })
    for (const seat of groupSeats) {
      seatToShiftId.set(seat.key, shift.id)
      if (!seat.assignedStaffId) continue
      const assignerId = STAFF.find((s) => s.role === 'manager' && s.certifications.some((c) => c.locationId === seat.locationId))?.id ?? 'usr-admin'
      await prisma.assignment.create({
        data: {
          shiftId: shift.id,
          staffId: seat.assignedStaffId,
          assignedById: assignerId,
          status: 'active',
          isOverride: !!seat.isOverride,
          overrideReason: seat.overrideReason,
          rangeStart: seat.startsAt,
          rangeEnd: seat.endsAt,
        },
      })
    }
  }

  // Swap requests (matches frontend SWAPS seed)
  const marcusGrillShiftId = await findAssignedShiftId('usr-3', CURRENT_WEEK_START_KEY, 'grill')
  await prisma.swapRequest.create({
    data: {
      type: 'swap',
      fromStaffId: 'usr-3',
      toStaffId: 'usr-5',
      shiftId: marcusGrillShiftId,
      stage: 'awaiting_manager',
      createdAt: hoursAgo(20),
    },
  })
  const jamieNextWeekShiftId = await findAssignedShiftId('usr-9', NEXT_WEEK_START_KEY)
  await prisma.swapRequest.create({
    data: {
      type: 'drop',
      fromStaffId: 'usr-9',
      shiftId: jamieNextWeekShiftId,
      stage: 'requested',
      createdAt: hoursAgo(3),
    },
  })
  const taylorShiftId = await findAssignedShiftId('usr-7', CURRENT_WEEK_START_KEY)
  await prisma.swapRequest.create({
    data: {
      type: 'swap',
      fromStaffId: 'usr-7',
      toStaffId: 'usr-6',
      shiftId: taylorShiftId,
      stage: 'approved',
      createdAt: hoursAgo(96),
      resolvedAt: hoursAgo(72),
    },
  })

  // Notifications (matches frontend NOTIFICATIONS seed)
  await prisma.notification.create({
    data: {
      userId: 'usr-mgr-sf',
      type: 'schedule_published',
      title: 'Schedule published',
      body: `Downtown SF week of ${CURRENT_WEEK_START_KEY} is now live for staff.`,
      locationId: 'loc-sf',
      readAt: hoursAgo(48),
      createdAt: hoursAgo(48),
    },
  })
  await prisma.notification.create({
    data: {
      userId: 'usr-mgr-sf',
      type: 'swap_requested',
      title: 'New swap request',
      body: 'Marcus Cho requested a swap with Riley Wu for a grill shift.',
      locationId: 'loc-sf',
      createdAt: hoursAgo(20),
    },
  })
  await prisma.notification.create({
    data: {
      userId: 'usr-3',
      type: 'shift_reminder',
      title: 'Shift tomorrow',
      body: 'You have a grill shift starting tomorrow at 3:00pm.',
      locationId: 'loc-sf',
      createdAt: hoursAgo(2),
    },
  })

  // Audit log (matches frontend AUDIT_LOG seed)
  await prisma.auditLog.create({
    data: {
      actorId: 'usr-mgr-sf',
      action: 'published_schedule',
      entityType: 'week',
      entityId: CURRENT_WEEK_START_KEY,
      locationId: 'loc-sf',
      at: hoursAgo(48),
      details: `Published Downtown SF week of ${CURRENT_WEEK_START_KEY}`,
    },
  })
  await prisma.auditLog.create({
    data: {
      actorId: 'usr-mgr-sf',
      action: 'assigned_shift',
      entityType: 'shift',
      entityId: seatToShiftId.get('seat-overnight')!,
      locationId: 'loc-sf',
      at: hoursAgo(72),
      details: 'Assigned Kayla Lee to the Saturday overnight line shift.',
    },
  })
  await prisma.auditLog.create({
    data: {
      actorId: 'usr-mgr-nyc',
      action: 'approved_swap',
      entityType: 'swap',
      entityId: taylorShiftId,
      locationId: 'loc-pdx',
      at: hoursAgo(72),
      details: 'Approved swap between Taylor Brooks and Sam Osei.',
    },
  })
  await prisma.auditLog.create({
    data: {
      actorId: 'usr-admin',
      action: 'added_staff',
      entityType: 'staff',
      entityId: 'usr-11',
      locationId: 'loc-bos',
      at: hoursAgo(240),
      details: 'Added Nina Kowalski (prep, dish) at Harborview Boston.',
    },
  })
  await prisma.auditLog.create({
    data: {
      actorId: 'usr-mgr-sf',
      action: 'edited_shift',
      entityType: 'shift',
      entityId: seatToShiftId.get('seat-unfilled-soon')!,
      locationId: 'loc-sf',
      at: hoursAgo(5),
      details: 'Removed Priya Nair from the grill shift after an availability conflict.',
    },
  })
  await prisma.auditLog.create({
    data: {
      actorId: 'usr-mgr-sf',
      action: 'assigned_shift_override',
      entityType: 'shift',
      entityId: seatToShiftId.get('seat-overtime-trap-override')!,
      locationId: 'loc-pdx',
      at: hoursAgo(30),
      details:
        'Assigned Taylor Brooks to Saturday grill via manager override — 7th consecutive day worked. Reason: "No other grill-certified staff available Saturday night; Taylor agreed to cover. Reviewed and approved."',
    },
  })

  console.log('Seed complete.')
  console.log(`Demo password for every seeded account: ${DEMO_PASSWORD}`)

  async function findAssignedShiftId(staffId: string, weekStartKey: string, skillRequired?: string) {
    const weekStart = weekStartKey === CURRENT_WEEK_START_KEY ? CURRENT_WEEK_START : NEXT_WEEK_START
    const weekEnd = addDays(weekStart, 7)
    const assignment = await prisma.assignment.findFirst({
      where: {
        staffId,
        status: 'active',
        shift: {
          startsAt: { gte: weekStart, lt: weekEnd },
          ...(skillRequired ? { skillRequired } : {}),
        },
      },
      include: { shift: true },
    })
    return assignment!.shiftId
  }
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
