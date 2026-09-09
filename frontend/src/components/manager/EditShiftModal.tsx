import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { formatInTimeZone } from 'date-fns-tz'
import { TriangleAlert } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { updateShift } from '../../services/shifts'
import { skillOptions } from '../../services/staff'
import { roleLabel } from '../../lib/format'
import { resolveShiftWallTimes } from '../../lib/timezone'
import type { Location, Shift, SkillTag } from '../../types'

export function EditShiftModal({
  shift,
  location,
  weekDays,
  headcount: initialHeadcount,
  onClose,
  onSaved,
}: {
  shift: Shift
  location: Location
  weekDays: string[]
  headcount: number
  onClose: () => void
  onSaved: (cancelledSwapCount: number) => void
}) {
  const queryClient = useQueryClient()
  const [date, setDate] = useState(shift.date)
  const [startTime, setStartTime] = useState(() => formatInTimeZone(new Date(shift.startUtc), location.timezone, 'HH:mm'))
  const [endTime, setEndTime] = useState(() => formatInTimeZone(new Date(shift.endUtc), location.timezone, 'HH:mm'))
  const [role, setRole] = useState<SkillTag>(shift.role)
  const [headcount, setHeadcount] = useState(initialHeadcount)
  const [formError, setFormError] = useState<string | null>(null)
  const [swapConflict, setSwapConflict] = useState<string[] | null>(null)

  const overnight = resolveShiftWallTimes(date, startTime, endTime, location.timezone).overnight

  function validate(): string | null {
    if (!date || !startTime || !endTime) return 'Date, start time, and end time are all required.'
    if (!weekDays.includes(date)) {
      return `Date must fall within the currently viewed week (${weekDays[0]} to ${weekDays[6]}).`
    }
    if (startTime === endTime) return 'End time must be different from the start time.'
    if (!Number.isInteger(headcount) || headcount < 1) return 'Headcount must be a whole number of at least 1.'
    return null
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const { startUtc, endUtc } = resolveShiftWallTimes(date, startTime, endTime, location.timezone)
      return updateShift(shift.id, { startUtc, endUtc, role, headcount }, { id: '', name: '' })
    },
    onSuccess: (result) => {
      if (result.ok) {
        queryClient.invalidateQueries({ queryKey: ['shifts'] })
        onSaved(result.cancelledSwapCount)
        onClose()
      } else {
        setSwapConflict(result.violations.map((v) => v.message))
      }
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : 'Could not save this shift.')
    },
  })

  function handleSubmit() {
    const validationError = validate()
    if (validationError) {
      setFormError(validationError)
      return
    }
    setFormError(null)
    setSwapConflict(null)
    saveMutation.mutate()
  }

  return (
    <Modal open onClose={onClose} title="Edit shift" size="sm">
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-slate-600">
          {location.name} · {roleLabel(shift.role)}
        </p>

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

        {swapConflict && (
          <div className="flex flex-col gap-1.5 rounded-sm border border-brick/30 bg-brick/5 p-2.5 text-body-xs text-brick">
            <p className="flex items-start gap-2 font-medium">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              This edit conflicts with an approved swap already on this shift:
            </p>
            <ul className="ml-6 list-disc">
              {swapConflict.map((message, i) => (
                <li key={i}>{message}</li>
              ))}
            </ul>
          </div>
        )}

        {formError && <p className="text-body-sm text-brick">{formError}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
