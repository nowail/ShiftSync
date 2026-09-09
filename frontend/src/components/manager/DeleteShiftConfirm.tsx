import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { deleteShift } from '../../services/shifts'
import { roleLabel } from '../../lib/format'
import { formatDateInZone, formatTimeInZone } from '../../lib/timezone'
import type { Location, Shift } from '../../types'

export function DeleteShiftConfirm({
  shift,
  location,
  onClose,
  onDeleted,
}: {
  shift: Shift
  location: Location
  onClose: () => void
  onDeleted: () => void
}) {
  const queryClient = useQueryClient()
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null)

  const deleteMutation = useMutation({
    mutationFn: () => deleteShift(shift.id),
    onSuccess: (result) => {
      if (result.ok) {
        queryClient.invalidateQueries({ queryKey: ['shifts'] })
        onDeleted()
        onClose()
      } else {
        setBlockedMessage(result.message)
      }
    },
  })

  return (
    <Modal open onClose={onClose} title="Delete shift" size="sm">
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-slate-600">
          Delete this unfilled {roleLabel(shift.role)} shift at {location.name} on{' '}
          {formatDateInZone(shift.startUtc, location.timezone)} ({formatTimeInZone(shift.startUtc, location.timezone)}–
          {formatTimeInZone(shift.endUtc, location.timezone)})? This removes the slot entirely — it can't be undone.
        </p>

        {blockedMessage && (
          <p className="flex items-start gap-2 rounded-sm border border-brick/30 bg-brick/5 p-2.5 text-body-sm text-brick">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            {blockedMessage}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? 'Deleting…' : 'Delete shift'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
