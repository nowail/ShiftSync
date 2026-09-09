import { describe, expect, it } from 'vitest'
import { canOverride, evaluateAssignment, isBlocking, isOverridableBlocking } from './index'
import type { EvaluateAssignmentInput } from './types'

const UTC_LOCATION = { id: 'loc-1', name: 'Test Location', timezone: 'UTC' }
const PT_LOCATION = { id: 'loc-pt', name: 'Pacific Location', timezone: 'America/Los_Angeles' }

function baseStaff(overrides: Partial<EvaluateAssignmentInput['staff']> = {}) {
  return {
    id: 'staff-1',
    name: 'Jamie Rivera',
    role: 'staff' as const,
    certifications: [{ locationId: 'loc-1', skillKey: 'grill' }],
    ...overrides,
  }
}

function baseInput(overrides: Partial<EvaluateAssignmentInput> = {}): EvaluateAssignmentInput {
  return {
    shift: {
      id: 'shift-under-test',
      locationId: 'loc-1',
      startsAt: new Date('2026-06-01T12:00:00.000Z'), // Mon, noon UTC
      endsAt: new Date('2026-06-01T20:00:00.000Z'), // 8h shift
      skillRequired: 'grill',
    },
    staff: baseStaff(),
    location: UTC_LOCATION,
    existingBookings: [],
    // Mon 2026-06-01 is a Monday; give a wide-open rule so tests not about availability pass it by default.
    availabilityRules: [{ dayOfWeek: 1, startTime: '00:00', endTime: '23:59' }],
    availabilityExceptions: [],
    weeklyHoursExcludingThisShift: 0,
    ...overrides,
  }
}

describe('checkCertification', () => {
  it('blocks and short-circuits when the staff member lacks the cert', () => {
    const input = baseInput({ staff: baseStaff({ certifications: [] }) })
    const violations = evaluateAssignment(input)
    expect(violations).toHaveLength(1)
    expect(violations[0].rule).toBe('not_certified')
    expect(violations[0].severity).toBe('block')
    expect(violations[0].message).toContain('Jamie Rivera')
  })

  it('does not block a correctly certified staff member', () => {
    const violations = evaluateAssignment(baseInput())
    expect(violations.find((v) => v.rule === 'not_certified')).toBeUndefined()
  })

  it('short-circuits: a decertified staff member gets only the cert violation, even if also double-booked', () => {
    const input = baseInput({
      staff: baseStaff({ certifications: [] }),
      existingBookings: [
        { staffId: 'staff-1', shiftId: 'other', startsAt: new Date('2026-06-01T12:00:00.000Z'), endsAt: new Date('2026-06-01T20:00:00.000Z') },
      ],
    })
    expect(evaluateAssignment(input)).toHaveLength(1)
  })
})

describe('checkDoubleBooking', () => {
  it('blocks on a plain overlapping booking', () => {
    const input = baseInput({
      existingBookings: [
        { staffId: 'staff-1', shiftId: 'other', startsAt: new Date('2026-06-01T14:00:00.000Z'), endsAt: new Date('2026-06-01T22:00:00.000Z') },
      ],
    })
    const violations = evaluateAssignment(input)
    expect(violations.some((v) => v.rule === 'double_booking' && v.severity === 'block')).toBe(true)
  })

  it('handles the overnight 11pm-3am shift as one continuous range — overlaps a booking spanning midnight', () => {
    // Existing booking: 11pm - 3am (spans midnight). New shift: 1am - 5am same night — overlaps.
    const input = baseInput({
      shift: {
        id: 'shift-under-test',
        locationId: 'loc-1',
        startsAt: new Date('2026-06-02T01:00:00.000Z'),
        endsAt: new Date('2026-06-02T05:00:00.000Z'),
        skillRequired: 'grill',
      },
      existingBookings: [
        { staffId: 'staff-1', shiftId: 'overnight', startsAt: new Date('2026-06-01T23:00:00.000Z'), endsAt: new Date('2026-06-02T03:00:00.000Z') },
      ],
    })
    const violations = evaluateAssignment(input)
    expect(violations.some((v) => v.rule === 'double_booking')).toBe(true)
  })

  it('does not flag an overnight shift against a booking that ends exactly when it starts (back-to-back)', () => {
    const input = baseInput({
      shift: {
        id: 'shift-under-test',
        locationId: 'loc-1',
        startsAt: new Date('2026-06-02T03:00:00.000Z'),
        endsAt: new Date('2026-06-02T11:00:00.000Z'),
        skillRequired: 'grill',
      },
      existingBookings: [
        { staffId: 'staff-1', shiftId: 'overnight', startsAt: new Date('2026-06-01T23:00:00.000Z'), endsAt: new Date('2026-06-02T03:00:00.000Z') },
      ],
    })
    const violations = evaluateAssignment(input)
    expect(violations.some((v) => v.rule === 'double_booking')).toBe(false)
  })
})

describe('checkRestGap', () => {
  it('blocks when fewer than 10 hours separate this shift from the next one', () => {
    // Existing booking starts 6 hours after this shift ends.
    const input = baseInput({
      existingBookings: [
        { staffId: 'staff-1', shiftId: 'next-day', startsAt: new Date('2026-06-02T02:00:00.000Z'), endsAt: new Date('2026-06-02T10:00:00.000Z') },
      ],
    })
    const violations = evaluateAssignment(input)
    const restViolation = violations.find((v) => v.rule === 'rest_gap')
    expect(restViolation).toBeDefined()
    expect(restViolation!.severity).toBe('block')
    expect(restViolation!.message).toContain('6.0h')
  })

  it('does not block when the gap is exactly 10 hours or more', () => {
    const input = baseInput({
      existingBookings: [
        { staffId: 'staff-1', shiftId: 'next-day', startsAt: new Date('2026-06-02T06:00:00.000Z'), endsAt: new Date('2026-06-02T14:00:00.000Z') },
      ],
    })
    const violations = evaluateAssignment(input)
    expect(violations.find((v) => v.rule === 'rest_gap')).toBeUndefined()
  })

  it('checks the gap before the shift too, not just after', () => {
    const input = baseInput({
      existingBookings: [
        { staffId: 'staff-1', shiftId: 'earlier-same-day', startsAt: new Date('2026-06-01T02:00:00.000Z'), endsAt: new Date('2026-06-01T08:00:00.000Z') },
      ],
    })
    // Gap: 08:00 -> shift starts 12:00 = 4h, under the 10h minimum.
    const violations = evaluateAssignment(input)
    expect(violations.find((v) => v.rule === 'rest_gap')).toBeDefined()
  })

  it('does not double-flag a booking that already overlaps (that is double_booking\'s job)', () => {
    const input = baseInput({
      existingBookings: [
        { staffId: 'staff-1', shiftId: 'overlap', startsAt: new Date('2026-06-01T14:00:00.000Z'), endsAt: new Date('2026-06-01T22:00:00.000Z') },
      ],
    })
    const violations = evaluateAssignment(input)
    expect(violations.find((v) => v.rule === 'rest_gap')).toBeUndefined()
    expect(violations.find((v) => v.rule === 'double_booking')).toBeDefined()
  })
})

describe('checkAvailability', () => {
  it('does not block a staff member with zero availability rules at all — no stated preference, not a refusal', () => {
    const input = baseInput({ availabilityRules: [] })
    const violations = evaluateAssignment(input)
    expect(violations.find((x) => x.rule === 'not_available')).toBeUndefined()
  })

  it('blocks a day that is conspicuously missing once the staff member has configured other days', () => {
    // Rules exist for Tuesday/Wednesday (2/3) but not Monday (1), which is what the base
    // shift falls on — a considered gap, unlike having zero rules at all.
    const input = baseInput({
      availabilityRules: [
        { dayOfWeek: 2, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 3, startTime: '09:00', endTime: '17:00' },
      ],
    })
    const violations = evaluateAssignment(input)
    const v = violations.find((x) => x.rule === 'not_available')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('block')
  })

  it('blocks when the shift falls outside the declared window', () => {
    const input = baseInput({ availabilityRules: [{ dayOfWeek: 1, startTime: '13:00', endTime: '17:00' }] })
    // shift is 12:00-20:00 UTC, window is 13:00-17:00 -> does not fully cover it
    const violations = evaluateAssignment(input)
    expect(violations.find((v) => v.rule === 'not_available')).toBeDefined()
  })

  it('passes when the shift fits inside the declared window', () => {
    const input = baseInput({ availabilityRules: [{ dayOfWeek: 1, startTime: '09:00', endTime: '21:00' }] })
    const violations = evaluateAssignment(input)
    expect(violations.find((v) => v.rule === 'not_available')).toBeUndefined()
  })

  it('an available:false exception blocks even though the recurring rule would have covered it', () => {
    const input = baseInput({
      availabilityRules: [{ dayOfWeek: 1, startTime: '00:00', endTime: '23:59' }],
      availabilityExceptions: [{ date: '2026-06-01', available: false }],
    })
    const violations = evaluateAssignment(input)
    expect(violations.find((v) => v.rule === 'not_available')).toBeDefined()
  })

  it('an available:true exception clears the block even with no covering recurring rule', () => {
    const input = baseInput({
      availabilityRules: [],
      availabilityExceptions: [{ date: '2026-06-01', available: true }],
    })
    const violations = evaluateAssignment(input)
    expect(violations.find((v) => v.rule === 'not_available')).toBeUndefined()
  })

  it('resolves the day-of-week and time window in the shift\'s own location-local timezone, not UTC', () => {
    // 2026-06-01T12:00:00Z is 5:00am PDT (UTC-7) the same calendar day — still Monday.
    // Give a PT-local window of 04:00-13:00 that only fits if the engine converts to PT.
    const input = baseInput({
      location: PT_LOCATION,
      shift: {
        id: 'shift-under-test',
        locationId: 'loc-pt',
        startsAt: new Date('2026-06-01T12:00:00.000Z'), // 05:00 PDT
        endsAt: new Date('2026-06-01T15:00:00.000Z'), // 08:00 PDT
        skillRequired: 'grill',
      },
      availabilityRules: [{ dayOfWeek: 1, startTime: '04:00', endTime: '13:00' }],
    })
    const violations = evaluateAssignment(input)
    expect(violations.find((v) => v.rule === 'not_available')).toBeUndefined()
  })
})

describe('checkDailyHours', () => {
  it('does not warn at or under 8 hours', () => {
    const violations = evaluateAssignment(baseInput())
    expect(violations.find((v) => v.rule === 'daily_overtime')).toBeUndefined()
  })

  it('warns (soft) between 8 and 12 hours', () => {
    const input = baseInput({
      existingBookings: [
        { staffId: 'staff-1', shiftId: 'earlier', startsAt: new Date('2026-06-01T08:00:00.000Z'), endsAt: new Date('2026-06-01T10:00:00.000Z') },
      ],
    })
    // 8h shift + 2h earlier same day = 10h total
    const violations = evaluateAssignment(input)
    const v = violations.find((x) => x.rule === 'daily_overtime')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('warning')
  })

  it('blocks (hard) over 12 hours in the same local day', () => {
    const input = baseInput({
      existingBookings: [
        { staffId: 'staff-1', shiftId: 'earlier', startsAt: new Date('2026-06-01T06:00:00.000Z'), endsAt: new Date('2026-06-01T12:00:00.000Z') },
      ],
    })
    // 8h shift + 6h earlier same day = 14h total
    const violations = evaluateAssignment(input)
    const v = violations.find((x) => x.rule === 'daily_overtime')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('block')
  })
})

describe('checkWeeklyHours', () => {
  it('does not warn under 35h projected', () => {
    const input = baseInput({ weeklyHoursExcludingThisShift: 20 })
    expect(evaluateAssignment(input).find((v) => v.rule === 'weekly_overtime')).toBeUndefined()
  })

  it('warns (soft, never blocks) at or over 35h, with "approaching" phrasing under 40h', () => {
    const input = baseInput({ weeklyHoursExcludingThisShift: 28 }) // + 8h shift = 36h
    const v = evaluateAssignment(input).find((x) => x.rule === 'weekly_overtime')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('warning')
    expect(v!.message).toContain('approaching')
  })

  it('warns with "over the 40h mark" phrasing above 40h, still soft', () => {
    const input = baseInput({ weeklyHoursExcludingThisShift: 35 }) // + 8h shift = 43h
    const v = evaluateAssignment(input).find((x) => x.rule === 'weekly_overtime')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('warning')
    expect(v!.message).toContain('over the 40h mark')
  })
})

describe('checkConsecutiveDays', () => {
  function bookingOnDay(dateIso: string) {
    return { staffId: 'staff-1', shiftId: `d-${dateIso}`, startsAt: new Date(`${dateIso}T12:00:00.000Z`), endsAt: new Date(`${dateIso}T20:00:00.000Z`) }
  }

  it('no violation under 6 consecutive days', () => {
    const bookings = ['2026-05-28', '2026-05-29', '2026-05-30', '2026-05-31'].map(bookingOnDay)
    const input = baseInput({ existingBookings: bookings }) // + today (06-01) = 5th day
    expect(evaluateAssignment(input).find((v) => v.rule === 'consecutive_days')).toBeUndefined()
  })

  it('warns (soft) on the 6th consecutive day', () => {
    const bookings = ['2026-05-27', '2026-05-28', '2026-05-29', '2026-05-30', '2026-05-31'].map(bookingOnDay)
    const input = baseInput({ existingBookings: bookings }) // + today = 6th day
    const v = evaluateAssignment(input).find((x) => x.rule === 'consecutive_days')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('warning')
    expect(v!.message).toContain('6th')
  })

  it('hard-blocks but marks overridable on the 7th consecutive day', () => {
    const bookings = ['2026-05-26', '2026-05-27', '2026-05-28', '2026-05-29', '2026-05-30', '2026-05-31'].map(bookingOnDay)
    const input = baseInput({ existingBookings: bookings }) // + today = 7th day
    const violations = evaluateAssignment(input)
    const v = violations.find((x) => x.rule === 'consecutive_days')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('overridable')
    expect(v!.message).toContain('7th')
    expect(isBlocking(violations)).toBe(false)
    expect(isOverridableBlocking(violations)).toBe(true)
    expect(canOverride(violations)).toBe(true)
  })

  it('a plain block (e.g. double-booking) alongside the 7th-day rule means no override is offered', () => {
    const bookings = ['2026-05-26', '2026-05-27', '2026-05-28', '2026-05-29', '2026-05-30', '2026-05-31'].map(bookingOnDay)
    bookings.push({ staffId: 'staff-1', shiftId: 'overlap', startsAt: new Date('2026-06-01T14:00:00.000Z'), endsAt: new Date('2026-06-01T22:00:00.000Z') })
    const input = baseInput({ existingBookings: bookings })
    const violations = evaluateAssignment(input)
    expect(isBlocking(violations)).toBe(true)
    expect(canOverride(violations)).toBe(false)
  })
})
