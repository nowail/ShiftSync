import { Ban, TriangleAlert, UserCheck } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Avatar } from './Avatar'
import { formatDateInZone, formatTimeInZone } from '../../lib/timezone'
import { roleLabel } from '../../lib/format'
import type { EligibleCandidate, Location, Shift, StaffMember, Violation } from '../../types'

interface ViolationPanelProps {
  open: boolean
  onClose: () => void
  shift: Shift
  location: Location
  attemptedStaff: StaffMember
  violations: Violation[]
  alternatives: EligibleCandidate[]
  staffById: Map<string, StaffMember>
  onAssignAlternative: (staffId: string) => void
  assigningStaffId?: string | null
}

export function ViolationPanel({
  open,
  onClose,
  shift,
  location,
  attemptedStaff,
  violations,
  alternatives,
  staffById,
  onAssignAlternative,
  assigningStaffId,
}: ViolationPanelProps) {
  const topAlternatives = alternatives.filter((a) => a.qualifies).slice(0, 3)

  return (
    <Modal open={open} onClose={onClose} title="Assignment blocked" size="lg">
      <div className="flex flex-col gap-6">
        <div className="flex items-start gap-3 rounded-sm border border-brick/30 bg-brick/5 p-4">
          <Ban size={20} className="mt-0.5 shrink-0 text-brick" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="text-body-md font-medium text-ink">
              Can't assign {attemptedStaff.name} to this shift
            </p>
            <p className="text-body-sm text-slate-600">
              {roleLabel(shift.role)} · {location.name} · {formatDateInZone(shift.startUtc, location.timezone)},{' '}
              {formatTimeInZone(shift.startUtc, location.timezone)}–{formatTimeInZone(shift.endUtc, location.timezone)}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-body-xs font-semibold uppercase tracking-normal text-slate-500">
            What's blocking this
          </h3>
          <ul className="flex flex-col gap-2">
            {violations.map((v, i) => (
              <li
                key={i}
                className={`flex items-start gap-2 rounded-sm border p-3 text-body-sm ${
                  v.severity === 'hard' ? 'border-brick/30 bg-brick/5 text-ink' : 'border-flag/40 bg-flag-light/60 text-ink'
                }`}
              >
                {v.severity === 'hard' ? (
                  <Ban size={16} className="mt-0.5 shrink-0 text-brick" aria-hidden="true" />
                ) : (
                  <TriangleAlert size={16} className="mt-0.5 shrink-0 text-flag" aria-hidden="true" />
                )}
                <span>{v.message}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-body-xs font-semibold uppercase tracking-normal text-slate-500">
            Suggested alternatives
          </h3>
          {topAlternatives.length === 0 ? (
            <p className="rounded-sm border border-dashed border-slate-300 p-4 text-body-sm text-slate-600">
              No one else is certified and available for this shift right now. Try adjusting the shift time or
              posting it as an open shift for staff to claim.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {topAlternatives.map((candidate) => {
                const staff = staffById.get(candidate.staffId)
                if (!staff) return null
                return (
                  <li
                    key={candidate.staffId}
                    className="flex items-center gap-3 rounded-sm border border-slate-200 p-3"
                  >
                    <Avatar name={staff.name} color={staff.avatarColor} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-body-sm font-medium text-ink">{staff.name}</p>
                        {candidate.violations.some((v) => v.severity === 'soft') && (
                          <Badge tone="flag">
                            <TriangleAlert size={11} /> heads up
                          </Badge>
                        )}
                      </div>
                      <ul className="mt-0.5 flex flex-wrap gap-x-3 text-body-xs text-slate-600">
                        {candidate.reasons.map((reason, i) => (
                          <li key={i} className="flex items-center gap-1">
                            <UserCheck size={11} className="text-moss" aria-hidden="true" />
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => onAssignAlternative(candidate.staffId)}
                      disabled={assigningStaffId === candidate.staffId}
                    >
                      {assigningStaffId === candidate.staffId ? 'Assigning…' : 'Assign'}
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-200 pt-4">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}
