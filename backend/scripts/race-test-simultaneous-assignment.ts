// Phase 7 evidence for the Simultaneous Assignment eval scenario: fires two
// near-simultaneous POST /shifts/:id/assign requests for the SAME staff member against
// two DIFFERENT, overlapping-time shifts. The app-level engine pre-check alone has a
// TOCTOU window — both requests can read "no conflict yet" before either commits — so
// this is the actual evidence that the DB-level exclusion constraint, not just the app
// check, is what stops a real race: exactly one request should succeed, and the other
// should come back as a structured 422 caught by Postgres, not a raw 500.
//
// This supersedes scripts/race-test.ts, which picked a fully random day-of-week/time for
// the test shifts without checking the target staff member's actual availability rules —
// Riley Wu (the hardcoded target) is only available Mon/Tue 09:00-17:00, so a uniformly
// random day had roughly a 1-in-10 chance of landing inside that window. The other 9 times
// out of 10, BOTH requests were rejected by the app-level availability check before either
// reached the database at all — a real, correct rejection that proves nothing about the
// DB-level race protection this script exists to demonstrate (confirmed directly: three
// fresh runs during Phase 7, all three landed on a day Riley isn't available and both
// requests failed with "hasn't marked themselves available", not the race). This version
// fetches the target's real availability from the API first and only ever generates a
// candidate window inside a real recurring rule, so it can't repeat that failure mode.
//
// Usage: npx tsx scripts/race-test-simultaneous-assignment.ts

import { fromZonedTime } from 'date-fns-tz'

const BASE = process.env.API_URL ?? 'http://localhost:4000'
const LOCATION_ID = 'loc-sf'
const LOCATION_TIMEZONE = 'America/Los_Angeles'
const SKILL = 'grill'
const TARGET_EMAIL = 'riley.wu@coastaleats.com'
const MANAGER_EMAIL = 'casey.manager@coastaleats.com'
const PASSWORD = 'password123'

interface AvailabilityWindow {
  dayOfWeek: number // 0=Sunday, matching every other day-of-week value in this app
  startTime: string // 'HH:mm', location-local
  endTime: string
}

async function login(email: string): Promise<{ token: string; userId: string }> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  if (!res.ok) throw new Error(`login failed for ${email}: ${res.status}`)
  const body = (await res.json()) as { token: string; user: { id: string } }
  return { token: body.token, userId: body.user.id }
}

async function getRecurringAvailability(token: string, staffId: string): Promise<AvailabilityWindow[]> {
  const res = await fetch(`${BASE}/staff/${staffId}/availability`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`fetch availability failed: ${res.status}`)
  const body = (await res.json()) as { recurring: AvailabilityWindow[] }
  return body.recurring
}

async function createShift(token: string, startsAt: string, endsAt: string) {
  const res = await fetch(`${BASE}/shifts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ locationId: LOCATION_ID, startsAt, endsAt, skillRequired: SKILL, headcount: 1 }),
  })
  if (!res.ok) throw new Error(`create shift failed: ${res.status} ${await res.text()}`)
  const seat = (await res.json()) as { id: string }
  return seat.id // synthetic "<shiftId>:unfilled:0" — fine, /assign resolves it
}

async function assign(token: string, seatId: string, staffId: string) {
  const res = await fetch(`${BASE}/shifts/${seatId}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ staffId }),
  })
  const body = await res.json()
  return { status: res.status, body }
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * Picks a real recurring availability window with room for at least a 1-hour shift, and a
 * random Date (wide range, so back-to-back runs don't collide with a real booking a prior
 * run left behind) whose LOCATION-LOCAL day-of-week matches that window.
 */
function pickWindowAndDate(windows: AvailabilityWindow[]): { window: AvailabilityWindow; localDate: string; durationHours: number } {
  const usable = windows.filter((w) => minutesOf(w.endTime) - minutesOf(w.startTime) >= 60)
  if (usable.length === 0) {
    throw new Error(`Target staff member has no recurring availability window long enough for a 1-hour test shift: ${JSON.stringify(windows)}`)
  }
  const window = usable[Math.floor(Math.random() * usable.length)]

  // A wide spread of candidate calendar dates (~840 weeks, so ~16 years), independent of
  // when this script actually runs — the same reasoning as the original script: a fixed
  // or narrow-range date collides with whatever a previous run booked there.
  const anchor = Date.UTC(2030, 0, 1)
  const candidateWeeks = Math.floor(Math.random() * 840)
  const daysToAdd = candidateWeeks * 7 + window.dayOfWeek // 0=Sunday, matching anchor (2030-01-01 is a Tuesday, so this is approximate — corrected below)
  const anchorDate = new Date(anchor)
  const anchorDow = anchorDate.getUTCDay()
  const dayOffset = (window.dayOfWeek - anchorDow + 7) % 7
  const finalDate = new Date(anchor + (candidateWeeks * 7 + dayOffset) * 24 * 3600 * 1000)
  const localDate = finalDate.toISOString().slice(0, 10)

  const windowDurationMinutes = minutesOf(window.endTime) - minutesOf(window.startTime)
  const durationHours = Math.min(2, Math.floor(windowDurationMinutes / 60))
  return { window, localDate, durationHours }
}

async function main() {
  const manager = await login(MANAGER_EMAIL)
  const target = await login(TARGET_EMAIL)

  console.log(`Fetching ${TARGET_EMAIL}'s real availability (not assuming a fixed day/time)...`)
  const recurring = await getRecurringAvailability(target.token, target.userId)
  console.log('Recurring windows:', JSON.stringify(recurring))

  const { window, localDate, durationHours } = pickWindowAndDate(recurring)

  // Start somewhere in the window that leaves room for the full shift duration, not
  // always at the window's opening minute — still inside the real availability window.
  const latestStartMinutes = minutesOf(window.endTime) - durationHours * 60
  const earliestStartMinutes = minutesOf(window.startTime)
  const startMinutes = earliestStartMinutes + Math.floor(Math.random() * Math.max(1, latestStartMinutes - earliestStartMinutes))
  const startHH = String(Math.floor(startMinutes / 60)).padStart(2, '0')
  const startMM = String(startMinutes % 60).padStart(2, '0')

  const startLocal = `${localDate}T${startHH}:${startMM}:00`
  const startUtc = fromZonedTime(startLocal, LOCATION_TIMEZONE)
  const endUtc = new Date(startUtc.getTime() + durationHours * 3600 * 1000)

  console.log(`Chosen window: dayOfWeek=${window.dayOfWeek} (${window.startTime}-${window.endTime} local) -> ${startLocal} ${LOCATION_TIMEZONE} for ${durationHours}h`)

  const [seatA, seatB] = await Promise.all([
    createShift(manager.token, startUtc.toISOString(), endUtc.toISOString()),
    createShift(manager.token, startUtc.toISOString(), endUtc.toISOString()),
  ])
  console.log('Created two overlapping shifts:', seatA, seatB)

  console.log('Firing both assign requests concurrently for the same staff member...')
  const [resultA, resultB] = await Promise.all([
    assign(manager.token, seatA, target.userId),
    assign(manager.token, seatB, target.userId),
  ])

  console.log('Result A:', resultA.status, JSON.stringify(resultA.body))
  console.log('Result B:', resultB.status, JSON.stringify(resultB.body))

  const successes = [resultA, resultB].filter((r) => r.status === 200)
  const conflicts = [resultA, resultB].filter((r) => r.status === 422)

  // Both the app-level pre-check and the DB-level exclusion-constraint catch use the same
  // `assignment_blocked` error code, so status codes alone don't say which one fired —
  // the message text is the only thing that differs (routes/shifts.ts / performAssignment.ts:
  // the DB-level catch's message always says "refresh and try again"; the app-level
  // pre-check's says "is already on the schedule").
  const conflictMessages = conflicts.map((r) => (r.body as { error?: { message?: string } })?.error?.message ?? '')
  const dbLevel = conflictMessages.filter((m) => m.includes('refresh and try again'))
  const appLevel = conflictMessages.filter((m) => m.includes('already on the schedule'))

  console.log('\n' + '='.repeat(72))
  if (successes.length === 1 && conflicts.length === 1 && dbLevel.length === 1) {
    console.log('PASS — Simultaneous Assignment scenario')
    console.log('Exactly one request succeeded (200); the other was rejected by the')
    console.log('Postgres exclusion constraint (422, "refresh and try again"), not the')
    console.log('app-level pre-check. No raw 500, no double-booking committed.')
  } else if (successes.length === 1 && conflicts.length === 1 && appLevel.length === 1) {
    console.log('INCONCLUSIVE — one succeeded, one rejected, but by the APP-LEVEL check,')
    console.log('not the DB constraint. This proves nothing about the DB-level race')
    console.log('protection. Likely stale data from a previous run. Re-run this script;')
    console.log('it generates a fresh, never-before-used window every run.')
    process.exitCode = 1
  } else {
    console.log(`UNEXPECTED — ${successes.length} succeeded, ${conflicts.length} conflicts (expected 1 and 1).`)
    process.exitCode = 1
  }
  console.log('='.repeat(72))
}

main().catch((err) => {
  console.error('FATAL', err)
  process.exit(1)
})
