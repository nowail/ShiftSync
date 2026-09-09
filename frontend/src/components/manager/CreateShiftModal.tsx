import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { addDays, format, parseISO } from 'date-fns'
import { TriangleAlert } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { createOpenShift } from '../../services/shifts'
import { skillOptions } from '../../services/staff'
import { roleLabel } from '../../lib/format'
import { zonedWallTimeToUtcIso } from '../../lib/timezone'
import { PUBLISH_CUTOFF_HOURS } from '../../lib/rules'
import type { Location, Shift, ShiftStatus, SkillTag } from '../../types'

function isStartWithinCutoff(startUtc: string): boolean {
  const msUntilStart = new Date(startUtc).getTime() - Date.now()
  return msUntilStart >= 0 && msUntilStart < PUBLISH_CUTOFF_HOURS * 3600 * 1000
}

export function CreateShiftModal({
  location,
  weekDays,
  defaultDate,
  weekIsPublished,
  onClose,
  onCreated,
}: {
  location: Location
  weekDays: string[]
  defaultDate: string
  weekIsPublished: boolean
  onClose: () => void
  onCreated: (shift: Shift, status: ShiftStatus) => void
}) {
  const queryClient = useQueryClient()
  const [date, setDate] = useState(defaultDate)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [role, setRole] = useState<SkillTag>(skillOptions()[0])
  const [headcount, setHeadcount] = useState(1)
  const [formError, setFormError] = useState<string | null>(null)

  const overnight = endTime !== '' && startTime !== '' && endTime <= startTime

  function buildTimes(): { startUtc: string; endUtc: string } {
    const endDate = overnight ? format(addDays(parseISO(date), 1), 'yyyy-MM-dd') : date
    return {
      startUtc: zonedWallTimeToUtcIso(date, startTime, location.timezone),
      endUtc: zonedWallTimeToUtcIso(endDate, endTime, location.timezone),
    }
  }

  function validate(): string | null {
    if (!date || !startTime || !endTime) return 'Date, start time, and end time are all required.'
    if (!weekDays.includes(date)) {
      return `Date must fall within the currently viewed week (${weekDays[0]} to ${weekDays[6]}).`
    }
    if (startTime === endTime) return 'End time must be different from the start time.'
    if (!Number.isInteger(headcount) || headcount < 1) return 'Headcount must be a whole number of at least 1.'
    return null
  }

  const createMutation = useMutation({
    mutationFn: (status: ShiftStatus) => {
      const { startUtc, endUtc } = buildTimes()
      return createOpenShift({ locationId: location.id, startUtc, endUtc, role, headcount, status }).then(
        (shift) => ({ shift, status }),
      )
    },
    onSuccess: ({ shift, status }) => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
      onCreated(shift, status)
      onClose()
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : 'Could not create the shift.')
    },
  })

  function handleSubmit(status: ShiftStatus) {
    const validationError = validate()
    if (validationError) {
      setFormError(validationError)
      return
    }
    setFormError(null)
    createMutation.mutate(status)
  }

  const cutoffFlag =
    weekIsPublished && date && startTime && weekDays.includes(date) && startTime !== endTime
      ? isStartWithinCutoff(buildTimes().startUtc)
      : false

  return (
    <Modal open onClose={onClose} title="Create shift" size="sm">
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-slate-600">{location.name}</p>

        <Input
          label="Date"
          type="date"
          value={date}
          min={weekDays[0]}
          max={weekDays[6]}
          onChange={(e) => setDate(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input label="Start time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <Input label="End time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
        {overnight && <p className="text-body-xs text-slate-500">Overnight shift — ends the next day.</p>}

        <Select label="Role / skill required" value={role} onChange={(e) => setRole(e.target.value as SkillTag)}>
          {skillOptions().map((s) => (
            <option key={s} value={s}>
              {roleLabel(s)}
            </option>
          ))}
        </Select>

        <Input
          label="Headcount"
          type="number"
          min={1}
          value={headcount}
          onChange={(e) => setHeadcount(Number(e.target.value))}
        />

        {cutoffFlag && (
          <p className="flex items-start gap-2 rounded-sm border border-amber/30 bg-amber/10 p-2.5 text-body-xs text-amber-dark">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            This shift starts within 48 hours. Publishing it immediately will flag it as inside the publish cutoff,
            same as any other near-cutoff change.
          </p>
        )}

        {formError && <p className="text-body-sm text-brick">{formError}</p>}

        <div className="flex justify-end gap-2">
          {weekIsPublished ? (
            <>
              <Button variant="secondary" onClick={() => handleSubmit('draft')} disabled={createMutation.isPending}>
                Save as draft
              </Button>
              <Button variant="primary" onClick={() => handleSubmit('published')} disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Publishing…' : 'Publish immediately'}
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => handleSubmit('draft')} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create shift'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
