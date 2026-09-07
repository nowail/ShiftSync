import { db, nextDbId } from '../lib/db'
import { withMockLatency } from '../lib/delay'
import { pushAudit } from './audit'
import { emitRealtimeEvent } from './realtime'
import type { SwapRequest, SwapStage } from '../types'

export const PENDING_STAGES: SwapStage[] = ['requested', 'peer_accepted', 'awaiting_manager']
export const MAX_PENDING_REQUESTS = 3

export async function getSwaps(filters: { locationId?: string; staffId?: string } = {}): Promise<SwapRequest[]> {
  return withMockLatency(() => {
    return db.swaps
      .filter((s) => {
        if (!filters.locationId) return true
        const shift = db.shifts.find((sh) => sh.id === s.shiftId)
        return shift?.locationId === filters.locationId
      })
      .filter((s) => (filters.staffId ? s.requestingStaffId === filters.staffId || s.targetStaffId === filters.staffId : true))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  })
}

export async function getPendingSwapCount(staffId: string): Promise<number> {
  return withMockLatency(
    () => db.swaps.filter((s) => s.requestingStaffId === staffId && PENDING_STAGES.includes(s.stage)).length,
  )
}

export interface CreateSwapInput {
  type: SwapRequest['type']
  requestingStaffId: string
  shiftId: string
  targetStaffId?: string | null
}

export async function createSwapRequest(input: CreateSwapInput): Promise<SwapRequest> {
  return withMockLatency(() => {
    const pendingCount = db.swaps.filter(
      (s) => s.requestingStaffId === input.requestingStaffId && PENDING_STAGES.includes(s.stage),
    ).length
    if (pendingCount >= MAX_PENDING_REQUESTS) {
      throw new Error(`You're at the ${MAX_PENDING_REQUESTS}-request limit. Resolve an existing request first.`)
    }
    const now = new Date().toISOString()
    const swap: SwapRequest = {
      id: nextDbId('swap'),
      type: input.type,
      requestingStaffId: input.requestingStaffId,
      shiftId: input.shiftId,
      targetStaffId: input.targetStaffId ?? null,
      stage: input.type === 'claim' ? 'awaiting_manager' : 'requested',
      createdAt: now,
      history: [{ stage: input.type === 'claim' ? 'awaiting_manager' : 'requested', at: now }],
    }
    db.swaps.unshift(swap)
    const staff = db.staff.find((s) => s.id === input.requestingStaffId)
    const shift = db.shifts.find((s) => s.id === input.shiftId)
    emitRealtimeEvent({
      kind: 'swap_requested',
      title: input.type === 'claim' ? 'Open shift claimed' : input.type === 'drop' ? 'Drop requested' : 'New swap request',
      body: `${staff?.name ?? 'Someone'} ${
        input.type === 'claim' ? 'claimed an open' : input.type === 'drop' ? 'requested to drop a' : 'requested a swap for a'
      } ${shift?.role ?? ''} shift.`,
      locationId: shift?.locationId,
    })
    return swap
  })
}

function advance(swap: SwapRequest, stage: SwapStage, note?: string) {
  swap.stage = stage
  swap.history.push({ stage, at: new Date().toISOString(), note })
}

export async function respondAsPeer(
  swapId: string,
  accept: boolean,
): Promise<SwapRequest> {
  return withMockLatency(() => {
    const swap = db.swaps.find((s) => s.id === swapId)
    if (!swap) throw new Error('Swap request not found.')
    advance(swap, accept ? 'peer_accepted' : 'rejected', accept ? undefined : 'Declined by peer.')
    return swap
  })
}

export async function approveSwap(swapId: string, actor: { id: string; name: string }): Promise<SwapRequest> {
  return withMockLatency(() => {
    const swap = db.swaps.find((s) => s.id === swapId)
    if (!swap) throw new Error('Swap request not found.')

    const shift = db.shifts.find((s) => s.id === swap.shiftId)
    if (shift) {
      if (swap.type === 'swap' && swap.targetStaffId) shift.assignedStaffId = swap.targetStaffId
      if (swap.type === 'drop') shift.assignedStaffId = null
      if (swap.type === 'claim') shift.assignedStaffId = swap.requestingStaffId
    }

    advance(swap, 'approved', `Approved by ${actor.name}.`)
    pushAudit({
      actorId: actor.id,
      actorName: actor.name,
      action: 'approved_swap',
      entity: 'swap',
      entityId: swap.id,
      locationId: shift?.locationId ?? 'unknown',
      details: `Approved a ${swap.type} request.`,
    })
    emitRealtimeEvent({
      kind: 'swap_resolved',
      title: 'Swap approved',
      body: `Your ${swap.type} request was approved.`,
      locationId: shift?.locationId,
    })
    return swap
  })
}

export async function rejectSwap(
  swapId: string,
  actor: { id: string; name: string },
  reason?: string,
): Promise<SwapRequest> {
  return withMockLatency(() => {
    const swap = db.swaps.find((s) => s.id === swapId)
    if (!swap) throw new Error('Swap request not found.')
    const shift = db.shifts.find((s) => s.id === swap.shiftId)
    advance(swap, 'rejected', reason ?? `Rejected by ${actor.name}.`)
    pushAudit({
      actorId: actor.id,
      actorName: actor.name,
      action: 'rejected_swap',
      entity: 'swap',
      entityId: swap.id,
      locationId: shift?.locationId ?? 'unknown',
      details: reason ?? `Rejected a ${swap.type} request.`,
    })
    emitRealtimeEvent({
      kind: 'swap_resolved',
      title: 'Swap rejected',
      body: `Your ${swap.type} request was rejected.`,
      locationId: shift?.locationId,
    })
    return swap
  })
}

export async function submitForManagerApproval(swapId: string): Promise<SwapRequest> {
  return withMockLatency(() => {
    const swap = db.swaps.find((s) => s.id === swapId)
    if (!swap) throw new Error('Swap request not found.')
    advance(swap, 'awaiting_manager')
    return swap
  })
}
