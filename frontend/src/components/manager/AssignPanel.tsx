import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, CircleCheck, TriangleAlert, UserX } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Avatar } from '../shared/Avatar'
import { LoadingState } from '../shared/States'
import { ViolationPanel } from '../shared/ViolationPanel'
import { getEligibleCandidates, getEligibleCandidatesPage, assignStaffToShift, unassignShift } from '../../services/shifts'
import { getStaff } from '../../services/staff'
import { useSessionStore } from '../../store/session'
import { useUiStore } from '../../store/ui'
import { roleLabel } from '../../lib/format'
import { formatDateInZone, formatTimeInZone } from '../../lib/timezone'
import { PaginationControl } from '../ui/PaginationControl'
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
  const [candidatesPage, setCandidatesPage] = useState(1)

  const staffQuery = useQuery({ queryKey: ['staff'], queryFn: getStaff })
  // The browsable, paginated list for the main modal.
  const candidatesQuery = useQuery({
    queryKey: ['shifts', shift.id, 'candidates', candidatesPage],
    queryFn: () => getEligibleCandidatesPage(shift.id, candidatesPage),
  })
  const candidates = candidatesQuery.data?.items ?? []

  // A blocked candidate's own violation, and the alternatives the ViolationPanel
  // suggests, both need the *complete* roster regardless of which page the manager was
  // browsing when they clicked "Try anyway" — the blocked person, or a good alternative,
  // could easily be on a different page than the one currently shown. Only fetched once
  // a block actually happens.
  const fullCandidatesQuery = useQuery({
    queryKey: ['shifts', shift.id, 'candidates', 'all'],
    queryFn: () => getEligibleCandidates(shift.id),
    enabled: !!blockedStaffId,
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
    ? fullCandidatesQuery.data?.find((c) => c.staffId === blockedStaffId)
    : undefined

  // While the complete-roster fetch for the violation panel is still in flight, show a
  // loading state rather than falling through to the main modal — without this, the
  // modal would flash back to the eligible-staff list for a moment before the violation
  // panel actually has data to render.
  if (blockedStaffId && fullCandidatesQuery.isLoading) {
    return (
      <Modal open onClose={() => setBlockedStaffId(null)} title="Assign staff" size="md">
        <LoadingState label="Checking eligibility…" />
      </Modal>
    )
  }

  if (blockedStaffId && blockedResult && staffById.get(blockedStaffId)) {
    return (
      <ViolationPanel
        open
        onClose={() => setBlockedStaffId(null)}
        shift={shift}
        location={location}
        attemptedStaff={staffById.get(blockedStaffId)!}
        violations={blockedResult.violations}
        alternatives={(fullCandidatesQuery.data ?? []).filter((c) => c.staffId !== blockedStaffId)}
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
              {candidates.map((candidate) => {
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
          {candidatesQuery.data && (
            <PaginationControl
              page={candidatesQuery.data.page}
              totalPages={candidatesQuery.data.totalPages}
              totalItems={candidatesQuery.data.totalItems}
              onPageChange={setCandidatesPage}
            />
          )}
        </div>
      </div>
    </Modal>
  )
}
