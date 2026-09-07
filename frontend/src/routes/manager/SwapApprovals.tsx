import { useMemo } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Clock, X } from 'lucide-react'
import { getSwaps, approveSwap, rejectSwap } from '../../services/swaps'
import { getShift } from '../../services/shifts'
import { getStaff } from '../../services/staff'
import { useSessionStore } from '../../store/session'
import { useUiStore } from '../../store/ui'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Avatar } from '../../components/shared/Avatar'
import { LoadingState, ErrorState, EmptyState } from '../../components/shared/States'
import { roleLabel } from '../../lib/format'
import { formatDateInZone, formatTimeInZone } from '../../lib/timezone'
import { getLocations } from '../../services/locations'
import type { Shift, SwapRequest, SwapStage } from '../../types'

const STAGE_LABELS: Record<SwapStage, string> = {
  requested: 'Requested',
  peer_accepted: 'Peer accepted',
  awaiting_manager: 'Awaiting your approval',
  approved: 'Approved',
  rejected: 'Rejected',
}

const STAGE_ORDER: SwapStage[] = ['requested', 'peer_accepted', 'awaiting_manager']

function StageStepper({ stage }: { stage: SwapStage }) {
  if (stage === 'approved') return <Badge tone="moss">Approved</Badge>
  if (stage === 'rejected') return <Badge tone="brick">Rejected</Badge>
  const currentIdx = STAGE_ORDER.indexOf(stage)
  return (
    <div className="flex items-center gap-1.5">
      {STAGE_ORDER.map((s, i) => (
        <div key={s} className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${i <= currentIdx ? 'bg-amber' : 'bg-slate-200'}`}
            aria-hidden="true"
          />
          <span className={`text-body-xs ${i === currentIdx ? 'font-medium text-ink' : 'text-slate-500'}`}>
            {STAGE_LABELS[s]}
          </span>
          {i < STAGE_ORDER.length - 1 && <span className="h-px w-3 bg-slate-200" />}
        </div>
      ))}
    </div>
  )
}

export function SwapApprovals() {
  const activeLocationId = useSessionStore((s) => s.activeLocationId)
  const actor = useSessionStore((s) => ({ id: s.staffId!, name: s.staffName! }))
  const pushToast = useUiStore((s) => s.pushToast)
  const queryClient = useQueryClient()

  const swapsQuery = useQuery({
    queryKey: ['swaps', activeLocationId],
    queryFn: () => getSwaps({ locationId: activeLocationId ?? undefined }),
  })
  const staffQuery = useQuery({ queryKey: ['staff'], queryFn: getStaff })
  const locationsQuery = useQuery({ queryKey: ['locations'], queryFn: getLocations })

  const shiftIds = useMemo(() => Array.from(new Set((swapsQuery.data ?? []).map((s) => s.shiftId))), [swapsQuery.data])
  const shiftQueries = useQueries({
    queries: shiftIds.map((id) => ({ queryKey: ['shifts', 'byId', id], queryFn: () => getShift(id) })),
  })
  const shiftById = useMemo(() => {
    const map = new Map<string, Shift | undefined>()
    shiftIds.forEach((id, i) => map.set(id, shiftQueries[i]?.data))
    return map
  }, [shiftIds, shiftQueries])

  const staffById = useMemo(() => new Map((staffQuery.data ?? []).map((s) => [s.id, s])), [staffQuery.data])

  const approveMutation = useMutation({
    mutationFn: (swapId: string) => approveSwap(swapId, actor),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['swaps'] })
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
      pushToast({ title: 'Swap approved', tone: 'success' })
    },
  })
  const rejectMutation = useMutation({
    mutationFn: (swapId: string) => rejectSwap(swapId, actor),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['swaps'] })
      pushToast({ title: 'Request rejected', tone: 'info' })
    },
  })

  const pending = (swapsQuery.data ?? []).filter((s) => s.stage !== 'approved' && s.stage !== 'rejected')
  const resolved = (swapsQuery.data ?? []).filter((s) => s.stage === 'approved' || s.stage === 'rejected')

  return (
    <div className="flex flex-col gap-6 px-4 sm:px-6">
      <div>
        <h1 className="font-display text-display-lg text-ink">Swap & drop approvals</h1>
        <p className="text-body-sm text-slate-600">Pending requests for your location.</p>
      </div>

      {swapsQuery.isLoading && <LoadingState label="Loading requests…" />}
      {swapsQuery.isError && <ErrorState message="Couldn't load swap requests." onRetry={() => swapsQuery.refetch()} />}
      {swapsQuery.data && pending.length === 0 && (
        <EmptyState title="No pending requests" body="Swap and drop requests from staff will show up here." />
      )}

      {pending.length > 0 && (
        <div className="flex flex-col gap-3">
          {pending.map((swap) => {
            const shift = shiftById.get(swap.shiftId)
            const requester = staffById.get(swap.requestingStaffId)
            const target = swap.targetStaffId ? staffById.get(swap.targetStaffId) : undefined
            const location = shift ? locationsQuery.data?.find((l) => l.id === shift.locationId) : undefined
            const canAct = swap.stage === 'awaiting_manager' || swap.type !== 'swap'
            return (
              <div key={swap.id} className="flex flex-col gap-3 rounded-md border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    {requester && <Avatar name={requester.name} color={requester.avatarColor} size={24} />}
                    <span className="text-body-sm font-medium text-ink">
                      {requester?.name} · {swap.type === 'swap' ? 'Swap' : swap.type === 'drop' ? 'Drop' : 'Claim'}
                      {target && <> with {target.name}</>}
                    </span>
                  </span>
                  <StageStepper stage={swap.stage} />
                </div>
                {shift && location && (
                  <p className="text-body-sm text-slate-600">
                    {roleLabel(shift.role)} shift · {formatDateInZone(shift.startUtc, location.timezone)} ·{' '}
                    {formatTimeInZone(shift.startUtc, location.timezone)}–
                    {formatTimeInZone(shift.endUtc, location.timezone)} · {location.name}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!canAct || approveMutation.isPending}
                    onClick={() => approveMutation.mutate(swap.id)}
                  >
                    <Check size={14} /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={rejectMutation.isPending}
                    onClick={() => rejectMutation.mutate(swap.id)}
                  >
                    <X size={14} /> Reject
                  </Button>
                  {!canAct && (
                    <span className="flex items-center gap-1 text-body-xs text-slate-500">
                      <Clock size={12} /> Waiting on peer acceptance
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <h2 className="mb-2 text-body-xs font-semibold uppercase tracking-normal text-slate-500">
            Recently resolved
          </h2>
          <div className="flex flex-col gap-2">
            {resolved.slice(0, 5).map((swap: SwapRequest) => {
              const requester = staffById.get(swap.requestingStaffId)
              return (
                <div key={swap.id} className="flex items-center justify-between rounded-sm border border-slate-100 p-2.5">
                  <span className="text-body-sm text-slate-600">
                    {requester?.name} · {swap.type}
                  </span>
                  <StageStepper stage={swap.stage} />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
