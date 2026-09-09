import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeftRight, Check, LogOut, PlusCircle, X, XCircle } from 'lucide-react'
import {
  getSwaps,
  createSwapRequest,
  getPendingSwapCount,
  respondAsPeer,
  withdrawSwapRequest,
  PENDING_STAGES,
  MAX_PENDING_REQUESTS,
} from '../../services/swaps'
import { getUpcomingShiftsForStaff, getClaimableShiftsForStaff, getEligibleCandidates } from '../../services/shifts'
import { getStaff } from '../../services/staff'
import { getLocations } from '../../services/locations'
import { useSessionStore } from '../../store/session'
import { useUiStore } from '../../store/ui'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { Avatar } from '../../components/shared/Avatar'
import { LoadingState, EmptyState } from '../../components/shared/States'
import { roleLabel } from '../../lib/format'
import { formatDateInZone, formatTimeInZone } from '../../lib/timezone'
import type { Shift, SwapStage } from '../../types'

const STAGE_LABELS: Record<SwapStage, { label: string; tone: 'slate' | 'amber' | 'moss' | 'brick' }> = {
  requested: { label: 'Requested', tone: 'slate' },
  peer_accepted: { label: 'Peer accepted', tone: 'amber' },
  awaiting_manager: { label: 'Awaiting manager', tone: 'amber' },
  approved: { label: 'Approved', tone: 'moss' },
  rejected: { label: 'Rejected', tone: 'brick' },
  cancelled: { label: 'Cancelled', tone: 'slate' },
  expired: { label: 'Expired', tone: 'slate' },
}

export function StaffSwaps() {
  const staffId = useSessionStore((s) => s.staffId)!
  const pushToast = useUiStore((s) => s.pushToast)
  const queryClient = useQueryClient()
  const [swapTargetShift, setSwapTargetShift] = useState<Shift | null>(null)

  const myShiftsQuery = useQuery({ queryKey: ['shifts', 'staff', staffId], queryFn: () => getUpcomingShiftsForStaff(staffId) })
  const claimableQuery = useQuery({ queryKey: ['shifts', 'claimable', staffId], queryFn: () => getClaimableShiftsForStaff(staffId) })
  const myRequestsQuery = useQuery({ queryKey: ['swaps', 'staff', staffId], queryFn: () => getSwaps({ staffId }) })
  const pendingCountQuery = useQuery({ queryKey: ['swaps', 'pending-count', staffId], queryFn: () => getPendingSwapCount(staffId) })
  const locationsQuery = useQuery({ queryKey: ['locations'], queryFn: getLocations })

  const locationById = useMemo(() => new Map((locationsQuery.data ?? []).map((l) => [l.id, l])), [locationsQuery.data])
  const shiftById = useMemo(() => new Map((myShiftsQuery.data ?? []).map((s) => [s.id, s])), [myShiftsQuery.data])

  const atCap = (pendingCountQuery.data ?? 0) >= MAX_PENDING_REQUESTS

  const invalidateAfterRequest = () => {
    queryClient.invalidateQueries({ queryKey: ['swaps'] })
  }

  const dropMutation = useMutation({
    mutationFn: (shiftId: string) => createSwapRequest({ type: 'drop', requestingStaffId: staffId, shiftId }),
    onSuccess: () => {
      invalidateAfterRequest()
      pushToast({ title: 'Drop requested', body: 'Your manager will review it.', tone: 'info' })
    },
    onError: (err: Error) => pushToast({ title: 'Could not request drop', body: err.message, tone: 'danger' }),
  })

  const claimMutation = useMutation({
    mutationFn: (shiftId: string) => createSwapRequest({ type: 'claim', requestingStaffId: staffId, shiftId }),
    onSuccess: () => {
      invalidateAfterRequest()
      queryClient.invalidateQueries({ queryKey: ['shifts', 'claimable', staffId] })
      pushToast({ title: 'Shift claimed', body: 'Awaiting manager approval.', tone: 'success' })
    },
    onError: (err: Error) => pushToast({ title: 'Could not claim shift', body: err.message, tone: 'danger' }),
  })

  const respondMutation = useMutation({
    mutationFn: (vars: { swapId: string; accept: boolean }) => respondAsPeer(vars.swapId, vars.accept),
    onSuccess: (_result, vars) => {
      invalidateAfterRequest()
      pushToast({
        title: vars.accept ? 'Swap accepted' : 'Swap declined',
        body: vars.accept ? "Sent to your manager for final approval." : undefined,
        tone: vars.accept ? 'success' : 'info',
      })
    },
    onError: (err: Error) => pushToast({ title: 'Could not respond to swap', body: err.message, tone: 'danger' }),
  })

  const withdrawMutation = useMutation({
    mutationFn: (swapId: string) => withdrawSwapRequest(swapId),
    onSuccess: () => {
      invalidateAfterRequest()
      pushToast({ title: 'Request withdrawn', tone: 'info' })
    },
    onError: (err: Error) => pushToast({ title: 'Could not withdraw request', body: err.message, tone: 'danger' }),
  })

  const myOutgoingRequests = (myRequestsQuery.data ?? []).filter((r) => r.requestingStaffId === staffId)
  const incomingRequests = (myRequestsQuery.data ?? []).filter((r) => r.targetStaffId === staffId && r.stage === 'requested')

  return (
    <div className="flex flex-col gap-6 p-4">
      <div>
        <h1 className="font-display text-display-lg text-ink">Swaps</h1>
        <p className="text-body-sm text-slate-600">Request a swap, drop a shift, or claim an open one.</p>
      </div>

      <div
        className={`flex items-center gap-2 rounded-sm border p-3 text-body-sm ${
          atCap ? 'border-brick/30 bg-brick/5 text-brick' : 'border-slate-200 text-slate-600'
        }`}
      >
        <AlertTriangle size={16} className={atCap ? 'text-brick' : 'text-slate-400'} />
        {pendingCountQuery.data ?? 0} of {MAX_PENDING_REQUESTS} pending requests used
        {atCap && ' — resolve one before requesting another.'}
      </div>

      {incomingRequests.length > 0 && (
        <section>
          <h2 className="mb-2 text-body-xs font-semibold uppercase tracking-normal text-slate-500">Waiting on you</h2>
          <div className="flex flex-col gap-2">
            {incomingRequests.map((req) => {
              const shift = shiftById.get(req.shiftId)
              return (
                <div key={req.id} className="flex items-center justify-between rounded-md border border-amber/40 bg-flag-light/40 p-3">
                  <span className="text-body-sm text-ink">
                    Swap request
                    {shift && ` · ${roleLabel(shift.role)} ${formatDateInZone(shift.startUtc, locationById.get(shift.locationId)?.timezone ?? 'UTC')}`}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={respondMutation.isPending}
                      onClick={() => respondMutation.mutate({ swapId: req.id, accept: true })}
                    >
                      <Check size={14} /> Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={respondMutation.isPending}
                      onClick={() => respondMutation.mutate({ swapId: req.id, accept: false })}
                    >
                      <X size={14} /> Decline
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-body-xs font-semibold uppercase tracking-normal text-slate-500">My requests</h2>
        {myRequestsQuery.isLoading && <LoadingState label="Loading requests…" />}
        {myOutgoingRequests.length === 0 && !myRequestsQuery.isLoading && (
          <EmptyState title="No swap requests yet" body="Requests you make will appear here with their status." />
        )}
        <div className="flex flex-col gap-2">
          {myOutgoingRequests.map((req) => {
            const shift = shiftById.get(req.shiftId)
            const stage = STAGE_LABELS[req.stage]
            const canWithdraw = PENDING_STAGES.includes(req.stage)
            return (
              <div key={req.id} className="flex items-center justify-between rounded-sm border border-slate-200 p-3">
                <span className="text-body-sm text-ink">
                  {req.type === 'swap' ? 'Swap' : req.type === 'drop' ? 'Drop' : 'Claim'}
                  {shift && ` · ${roleLabel(shift.role)} ${formatDateInZone(shift.startUtc, locationById.get(shift.locationId)?.timezone ?? 'UTC')}`}
                </span>
                <div className="flex items-center gap-2">
                  <Badge tone={stage.tone}>{stage.label}</Badge>
                  {canWithdraw && (
                    <button
                      onClick={() => withdrawMutation.mutate(req.id)}
                      disabled={withdrawMutation.isPending}
                      aria-label="Withdraw request"
                      className="text-slate-400 hover:text-brick"
                    >
                      <XCircle size={16} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-body-xs font-semibold uppercase tracking-normal text-slate-500">My upcoming shifts</h2>
        {myShiftsQuery.isLoading && <LoadingState label="Loading your shifts…" />}
        <div className="flex flex-col gap-2">
          {myShiftsQuery.data?.map((shift) => {
            const location = locationById.get(shift.locationId)
            if (!location) return null
            return (
              <div key={shift.id} className="flex flex-col gap-2 rounded-md border border-slate-200 p-3">
                <p className="text-body-sm font-medium text-ink">
                  {roleLabel(shift.role)} · {formatDateInZone(shift.startUtc, location.timezone)} ·{' '}
                  {formatTimeInZone(shift.startUtc, location.timezone)}–{formatTimeInZone(shift.endUtc, location.timezone)}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" disabled={atCap} onClick={() => setSwapTargetShift(shift)}>
                    <ArrowLeftRight size={14} /> Request swap
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={atCap || dropMutation.isPending}
                    onClick={() => dropMutation.mutate(shift.id)}
                  >
                    <LogOut size={14} /> Drop
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-body-xs font-semibold uppercase tracking-normal text-slate-500">Open shifts you can claim</h2>
        {claimableQuery.data?.length === 0 && (
          <EmptyState title="No open shifts right now" body="Open shifts you're qualified for will show up here." />
        )}
        <div className="flex flex-col gap-2">
          {claimableQuery.data?.map((shift) => {
            const location = locationById.get(shift.locationId)
            if (!location) return null
            return (
              <div key={shift.id} className="flex items-center justify-between rounded-md border border-brick/30 bg-brick/5 p-3">
                <div>
                  <p className="text-body-sm font-medium text-ink">
                    {roleLabel(shift.role)} · {formatDateInZone(shift.startUtc, location.timezone)}
                  </p>
                  <p className="text-body-xs text-slate-600">
                    {formatTimeInZone(shift.startUtc, location.timezone)}–{formatTimeInZone(shift.endUtc, location.timezone)} ·{' '}
                    {location.name}
                  </p>
                </div>
                <Button size="sm" variant="primary" disabled={atCap || claimMutation.isPending} onClick={() => claimMutation.mutate(shift.id)}>
                  <PlusCircle size={14} /> Claim
                </Button>
              </div>
            )
          })}
        </div>
      </section>

      {swapTargetShift && (
        <RequestSwapModal
          shift={swapTargetShift}
          staffId={staffId}
          onClose={() => setSwapTargetShift(null)}
          onSuccess={() => {
            invalidateAfterRequest()
            setSwapTargetShift(null)
          }}
        />
      )}
    </div>
  )
}

function RequestSwapModal({
  shift,
  staffId,
  onClose,
  onSuccess,
}: {
  shift: Shift
  staffId: string
  onClose: () => void
  onSuccess: () => void
}) {
  const pushToast = useUiStore((s) => s.pushToast)
  const candidatesQuery = useQuery({ queryKey: ['shifts', shift.id, 'candidates'], queryFn: () => getEligibleCandidates(shift.id) })
  const staffQuery = useQuery({ queryKey: ['staff'], queryFn: getStaff })
  const staffById = new Map((staffQuery.data ?? []).map((s) => [s.id, s]))

  const requestMutation = useMutation({
    mutationFn: (targetStaffId: string) =>
      createSwapRequest({ type: 'swap', requestingStaffId: staffId, shiftId: shift.id, targetStaffId }),
    onSuccess: () => {
      pushToast({ title: 'Swap requested', body: "We'll notify you once they respond.", tone: 'success' })
      onSuccess()
    },
    onError: (err: Error) => pushToast({ title: 'Could not request swap', body: err.message, tone: 'danger' }),
  })

  const options = (candidatesQuery.data ?? []).filter((c) => c.qualifies && c.staffId !== staffId)

  return (
    <Modal open onClose={onClose} title="Request a swap" size="sm">
      <div className="flex flex-col gap-3">
        <p className="text-body-sm text-slate-600">Who would you like to swap {roleLabel(shift.role)} with?</p>
        {candidatesQuery.isLoading && <LoadingState label="Finding qualified coworkers…" />}
        {options.length === 0 && !candidatesQuery.isLoading && (
          <EmptyState title="No one else qualifies" body="Try dropping the shift instead so another qualified teammate can claim it." />
        )}
        <ul className="flex flex-col gap-2">
          {options.map((candidate) => {
            const staff = staffById.get(candidate.staffId)
            if (!staff) return null
            return (
              <li key={staff.id} className="flex items-center gap-3 rounded-sm border border-slate-200 p-2.5">
                <Avatar name={staff.name} color={staff.avatarColor} size={24} />
                <span className="flex-1 text-body-sm">{staff.name}</span>
                <Button size="sm" variant="primary" disabled={requestMutation.isPending} onClick={() => requestMutation.mutate(staff.id)}>
                  Request
                </Button>
              </li>
            )
          })}
        </ul>
      </div>
    </Modal>
  )
}
