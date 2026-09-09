// Fires two near-simultaneous POST /shifts/:id/assign requests for the LAST open seat of
// a headcount=2 shift (one seat already filled), each for a different, otherwise-eligible
// staff member. This is a different race than race-test.ts: that one is the exclusion
// constraint's job (same staff, two shifts); this one is the app-level capacity guard's
// job (different staff, one shift) — the exclusion constraint keys on staffId, so it does
// nothing to stop two different people from both landing in the same last seat. Evidence
// for the `SELECT ... FOR UPDATE` row lock added to POST /shifts/:id/assign.
//
// Both the time window AND the staff members are picked fresh every run — see
// race-test.ts's history for why a fixed fixture breaks on re-run: an earlier hardcoded
// version of this exact script left real, permanent assignments for the hardcoded staff
// at the hardcoded time, and a later run's setup step then failed before the race logic
// ever ran, because those staff genuinely already had a conflicting booking there.
//
// Usage: npx tsx scripts/race-test-headcount.ts

const BASE = process.env.API_URL ?? 'http://localhost:4000'

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`login failed: ${res.status}`)
  const body = (await res.json()) as { token: string }
  return body.token
}

async function createShift(token: string, locationId: string, startsAt: string, endsAt: string, skillRequired: string, headcount: number) {
  const res = await fetch(`${BASE}/shifts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ locationId, startsAt, endsAt, skillRequired, headcount }),
  })
  if (!res.ok) throw new Error(`create shift failed: ${res.status} ${await res.text()}`)
  const seat = (await res.json()) as { id: string }
  return seat.id // a synthetic "<shiftId>:unfilled:0" seat id
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

interface CandidateDto {
  staffId: string
  staffName: string
  qualifies: boolean
  violations: unknown[]
}

async function getQualifyingCandidates(token: string, seatOrShiftId: string): Promise<CandidateDto[]> {
  const res = await fetch(`${BASE}/shifts/${seatOrShiftId}/candidates`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`fetching candidates failed: ${res.status} ${await res.text()}`)
  const all = (await res.json()) as CandidateDto[]
  // `qualifies` already means "the real constraint engine found nothing blocking this
  // person for this exact shift" — cert, double-booking, rest gap, availability, hours,
  // consecutive days, all checked against real current data. That's the actual, live
  // "does this person have a conflicting assignment in this window" check; hand-picking
  // three names and hoping is exactly what broke last time.
  return all.filter((c) => c.qualifies)
}

async function main() {
  const token = await login('casey.manager@coastaleats.com', 'password123')

  // A time-based offset alone isn't enough (two runs seconds apart would still land in
  // overlapping windows given a fixed shift duration) — see race-test.ts. Draw the day
  // from a wide random range instead, independent of when the script actually runs.
  const randomDayOffset = Math.floor(Math.random() * 100_000) // ~274 years of spread
  const dayStartMs = Date.UTC(2030, 0, 1) + randomDayOffset * 24 * 3600 * 1000
  const randomMinuteOfDay = Math.floor(Math.random() * (24 * 60 - 480)) // room for two 4h shifts back-to-back if ever needed
  const start = new Date(dayStartMs + randomMinuteOfDay * 60 * 1000).toISOString()
  const end = new Date(dayStartMs + randomMinuteOfDay * 60 * 1000 + 4 * 3600 * 1000).toISOString()

  const openSeatId = await createShift(token, 'loc-sf', start, end, 'grill', 2)
  console.log(`Created a headcount=2 grill shift at ${start}, first open seat id:`, openSeatId)

  // Ask the real engine who can actually take this shift right now, rather than assuming
  // three hardcoded names are still free.
  const candidates = await getQualifyingCandidates(token, openSeatId)
  console.log(
    'Qualifying candidates for this shift:',
    candidates.map((c) => c.staffName),
  )
  if (candidates.length < 3) {
    throw new Error(
      `Need at least 3 qualifying staff for a clean test (found ${candidates.length}: ${candidates.map((c) => c.staffName).join(', ')}) — re-run, or widen the day range.`,
    )
  }
  const [first, second, third] = candidates

  // Fill the first seat normally so exactly one open seat remains.
  const firstFill = await assign(token, openSeatId, first.staffId)
  console.log(`Filled seat 1 (${first.staffName}):`, firstFill.status, JSON.stringify(firstFill.body))
  if (firstFill.status !== 200) throw new Error('setup failed: could not fill the first seat')

  console.log(`Firing two concurrent requests for the last open seat: ${second.staffName} vs ${third.staffName}...`)
  const [resultA, resultB] = await Promise.all([assign(token, openSeatId, second.staffId), assign(token, openSeatId, third.staffId)])

  console.log(`Result A (${second.staffName}):`, resultA.status, JSON.stringify(resultA.body))
  console.log(`Result B (${third.staffName}):`, resultB.status, JSON.stringify(resultB.body))

  const successes = [resultA, resultB].filter((r) => r.status === 200)
  const conflicts = [resultA, resultB].filter((r) => r.status === 422)
  const conflictCodes = conflicts.map((r) => (r.body as { error?: { code?: string } })?.error?.code ?? '')
  const capacityConflicts = conflictCodes.filter((c) => c === 'fully_staffed')

  if (successes.length === 1 && conflicts.length === 1 && capacityConflicts.length === 1) {
    console.log('\nPASS: exactly one request filled the last seat, the other was caught by the row-locked capacity check (fully_staffed) — no overbooking, no raw 500.')
  } else {
    console.log(`\nFAIL: ${successes.length} succeeded, ${conflicts.length} conflicted (expected 1 and 1, with the conflict coded fully_staffed) — possible overbooking or an unrelated rejection.`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('FATAL', err)
  process.exit(1)
})
