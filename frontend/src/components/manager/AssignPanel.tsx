import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, CircleCheck, TriangleAlert, UserX } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Avatar } from '../shared/Avatar'
import { LoadingState } from '../shared/States'
import { ViolationPanel } from '../shared/ViolationPanel'
import { getEligibleCandidates, assignStaffToShift, unassignShift } from '../../services/shifts'
import { getStaff } from '../../services/staff'
import { useSessionStore } from '../../store/session'
import { useUiStore } from '../../store/ui'
import { roleLabel } from '../../lib/format'
import { formatDateInZone, formatTimeInZone } from '../../lib/timezone'
import type { Location, Shift } from '../../types'

export function AssignPanel({
  shift,
  location,
  onClose,
}: {
  shift: Shift
  location: Location
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const staffId = useSessionStore((s) => s.staffId)!
  const staffName = useSessionStore((s) => s.staffName)!
  const actor = { id: staffId, name: staffName }
  const pushToast = useUiStore((s) => s.pushToast)

  const [blockedStaffId, setBlockedStaffId] = useState<string | null>(null)
  const [assigningId, setAssigningId] = useState<string | null>(null)

  const staffQuery = useQuery({ queryKey: ['staff'], queryFn: getStaff })
  const candidatesQuery = useQuery({
    queryKey: ['shifts', shift.id, 'candidates'],
    queryFn: () => getEligibleCandidates(shift.id),
  })

  const staffById = useMemo(() => new Map((staffQuery.data ?? []).map((s) => [s.id, s])), [staffQuery.data])
  const currentAssignee = shift.assignedStaffId ? staffById.get(shift.assignedStaffId) : undefined

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['shifts'] })
    queryClient.invalidateQueries({ queryKey: ['shifts', shift.id, 'candidates'] })
  }

  const assignMutation = useMutation({
    mutationFn: (vars: { staffId: string; override?: boolean; overrideReason?: string }) =>
      assignStaffToShift(shift.id, vars.staffId, actor, {
        override: vars.override,
        overrideReason: vars.overrideReason,
      }),
    onMutate: (vars) => setAssigningId(vars.staffId),
    onSuccess: (result, vars) => {
      setAssigningId(null)
      if (result.ok) {
        invalidate()
        pushToast({ title: `${staffById.get(vars.staffId)?.name} assigned`, tone: 'success' })
        onClose()
      } else {
        setBlockedStaffId(vars.staffId)
      }
    },
    onError: () => setAssigningId(null),
  })

  const unassignMutation = useMutation({
    mutationFn: () => unassignShift(shift.id, actor),
    onSuccess: () => {
      invalidate()
      pushToast({ title: 'Assignment cleared', tone: 'info' })
    },
  })

  const blockedResult = blockedStaffId
    ? candidatesQuery.data?.find((c) => c.staffId === blockedStaffId)
    : undefined

  if (blockedStaffId && blockedResult && staffById.get(blockedStaffId)) {
    return (
      <ViolationPanel
        open
        onClose={() => setBlockedStaffId(null)}
        shift={shift}
        location={location}
        attemptedStaff={staffById.get(blockedStaffId)!}
        violations={blockedResult.violations}
        alternatives={(candidatesQuery.data ?? []).filter((c) => c.staffId !== blockedStaffId)}
        staffById={staffById}
        assigningStaffId={assigningId}
        onAssignAlternative={(staffId) => assignMutation.mutate({ staffId })}
        onOverrideAssign={(reason) => assignMutation.mutate({ staffId: blockedStaffId, override: true, overrideReason: reason })}
      />
    )
  }

  return (
    <Modal open onClose={onClose} title="Assign staff" size="md">
      <div className="flex flex-col gap-4">
        <div className="rounded-sm border border-slate-200 bg-slate-100/50 p-3">
          <p className="font-display text-display-sm text-ink">{roleLabel(shift.role)}</p>
          <p className="text-body-sm text-slate-600">
            {location.name} · {formatDateInZone(shift.startUtc, location.timezone)} ·{' '}
            {formatTimeInZone(shift.startUtc, location.timezone)}–{formatTimeInZone(shift.endUtc, location.timezone)}
          </p>
        </div>

        {currentAssignee && (
          <div className="flex items-center justify-between rounded-sm border border-moss/30 bg-moss/5 p-3">
            <span className="flex items-center gap-2 text-body-sm">
              <Avatar name={currentAssignee.name} color={currentAssignee.avatarColor} size={24} />
              Currently assigned to <strong className="font-medium">{currentAssignee.name}</strong>
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => unassignMutation.mutate()}
              disabled={unassignMutation.isPending}
            >
              <UserX size={14} /> Unassign
            </Button>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-body-xs font-semibold uppercase tracking-normal text-slate-500">
            Eligible staff
          </h3>
          {(candidatesQuery.isLoading || staffQuery.isLoading) && <LoadingState label="Checking eligibility…" />}
          {candidatesQuery.data && (
            <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
              {candidatesQuery.data.map((candidate) => {
                const staff = staffById.get(candidate.staffId)
                if (!staff || staff.id === shift.assignedStaffId) return null
                const hasSoft = candidate.violations.some((v) => v.severity === 'soft')
                return (
                  <li
                    key={candidate.staffId}
                    className={`flex items-center gap-3 rounded-sm border p-3 ${
                      candidate.qualifies ? 'border-slate-200' : 'border-slate-200 opacity-60'
                    }`}
                  >
                    <Avatar name={staff.name} color={staff.avatarColor} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-body-sm font-medium text-ink">{staff.name}</p>
                        {candidate.qualifies && !hasSoft && (
                          <Badge tone="moss">
                            <CircleCheck size={11} /> Eligible
                          </Badge>
                        )}
                        {candidate.qualifies && hasSoft && (
                          <Badge tone="flag">
                            <TriangleAlert size={11} /> Heads up
                          </Badge>
                        )}
                        {!candidate.qualifies && (
                          <Badge tone="brick">
                            <Ban size={11} /> Blocked
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-body-xs text-slate-600">
                        {candidate.qualifies
                          ? candidate.reasons.join(' · ')
                          : candidate.violations[0]?.message}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={candidate.qualifies ? 'primary' : 'secondary'}
                      onClick={() => assignMutation.mutate({ staffId: candidate.staffId })}
                      disabled={assigningId === candidate.staffId}
                    >
                      {assigningId === candidate.staffId ? 'Assigning…' : candidate.qualifies ? 'Assign' : 'Try anyway'}
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}
