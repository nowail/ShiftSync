// Fires two near-simultaneous POST /shifts/:id/assign requests for the SAME staff member
// against two DIFFERENT, overlapping-time shifts. The app-level engine pre-check alone
// has a TOCTOU window — both requests can read "no conflict yet" before either commits —
// so this is the actual evidence for BACKEND_PROMPT item 4: exactly one request should
// succeed, and the other should come back as a structured 422 (not a raw 500), caught by
// the Postgres exclusion constraint rather than the app-level check.
//
// Usage: npx tsx scripts/race-test.ts

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

async function createShift(token: string, locationId: string, startsAt: string, endsAt: string, skillRequired: string) {
  const res = await fetch(`${BASE}/shifts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ locationId, startsAt, endsAt, skillRequired, headcount: 1 }),
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

async function main() {
  const token = await login('casey.manager@coastaleats.com', 'password123')
  const staffId = 'usr-5' // Riley Wu — grill-certified at loc-sf

  // Two different Shift rows, identical overlapping time window. The window must be
  // unique to *this run*, not a fixed date — a previous run's successful assignment is
  // never cleaned up (it's real, intentional data showing the constraint worked), so a
  // fixed date would leave Riley Wu with a real pre-existing booking there on every
  // subsequent run. That pre-existing booking would then make BOTH of this run's fresh
  // requests fail the app-level pre-check independently (a real, correct rejection
  // against real data) without either ever reaching the DB-level race this script exists
  // to prove — exactly what happened the first time this was re-run.
  //
  // A time-based offset (e.g. Date.now()) is NOT enough on its own: two runs seconds
  // apart differ by only seconds, which is far smaller than the shift's own duration, so
  // they still land in overlapping windows (this was tried and confirmed broken the same
  // way). Drawing the day from a wide random range, independent of when the script
  // actually runs, is what actually avoids collisions between quick, repeated re-runs.
  const randomDayOffset = Math.floor(Math.random() * 100_000) // ~274 years of spread
  const dayStartMs = Date.UTC(2030, 0, 1) + randomDayOffset * 24 * 3600 * 1000
  const randomMinuteOfDay = Math.floor(Math.random() * (24 * 60 - 240)) // leaves room for a 4h shift
  const start = new Date(dayStartMs + randomMinuteOfDay * 60 * 1000).toISOString()
  const end = new Date(dayStartMs + randomMinuteOfDay * 60 * 1000 + 4 * 3600 * 1000).toISOString()
  const [seatA, seatB] = await Promise.all([
    createShift(token, 'loc-sf', start, end, 'grill'),
    createShift(token, 'loc-sf', start, end, 'grill'),
  ])
  console.log('Created two overlapping shifts:', seatA, seatB)

  console.log('Firing both assign requests concurrently for the same staff member...')
  const [resultA, resultB] = await Promise.all([assign(token, seatA, staffId), assign(token, seatB, staffId)])

  console.log('Result A:', resultA.status, JSON.stringify(resultA.body))
  console.log('Result B:', resultB.status, JSON.stringify(resultB.body))

  const successes = [resultA, resultB].filter((r) => r.status === 200)
  const conflicts = [resultA, resultB].filter((r) => r.status === 422)

  // Both the app-level pre-check and the DB-level exclusion-constraint catch use the same
  // `assignment_blocked` error code, so a passing status-code count alone doesn't say
  // which one actually fired — check the message text too, since that's the only thing
  // that differs between them (see routes/shifts.ts: the DB-level catch's message always
  // says "refresh and try again"; the app-level pre-check's says "is already on the
  // schedule"). A real DB-level catch is only possible here because both requests target
  // *different* Shift rows for the same instant — the app-level pre-check for either one,
  // read before the other has committed, has nothing to see yet.
  const conflictMessages = conflicts.map((r) => (r.body as { error?: { message?: string } })?.error?.message ?? '')
  const dbLevel = conflictMessages.filter((m) => m.includes('refresh and try again'))
  const appLevel = conflictMessages.filter((m) => m.includes('already on the schedule'))

  if (successes.length === 1 && conflicts.length === 1 && dbLevel.length === 1) {
    console.log('\nPASS: exactly one request succeeded, the other was caught by the DB-level exclusion constraint (not the app pre-check) — no raw 500, no double-booking committed.')
  } else if (successes.length === 1 && conflicts.length === 1 && appLevel.length === 1) {
    console.log(
      '\nINCONCLUSIVE: one succeeded and one was rejected, but by the APP-LEVEL pre-check, not the DB constraint — this proves nothing about the DB-level race protection. Likely stale data from a previous run left a real conflicting booking in place before this run even started. Re-run this script; it generates a fresh, never-before-used time window every run, so this should not recur.',
    )
    process.exitCode = 1
  } else {
    console.log(`\nUNEXPECTED: ${successes.length} succeeded, ${conflicts.length} came back as conflicts (expected 1 and 1).`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('FATAL', err)
  process.exit(1)
})
