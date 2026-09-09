import { apiRequest, fetchAllPages } from '../lib/apiClient'
import type { Paginated, SwapRequest, SwapStage } from '../types'

export const PENDING_STAGES: SwapStage[] = ['requested', 'peer_accepted', 'awaiting_manager']
export const MAX_PENDING_REQUESTS = 3

function swapsQueryString(filters: { locationId?: string; staffId?: string }, page?: number): string {
  const params = new URLSearchParams()
  if (filters.locationId) params.set('locationId', filters.locationId)
  if (filters.staffId) params.set('staffId', filters.staffId)
  if (page) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

// /swaps is genuinely paginated server-side (getSwapsPage below hits it directly), but
// both existing screens that consume this function — the manager's approval queue and a
// staff member's own request list — split the result into "pending/needs action" and
// "resolved" sections client-side, and a manager must see every pending item, not just
// whichever ones land on page 1. Rather than risk hiding an unactioned request behind a
// pagination boundary, this keeps the pre-pagination "give me everything matching these
// filters" contract by merging every page. In practice this is 1-2 requests for the data
// volumes either screen deals with (a location's or a single staff member's swaps).
export async function getSwaps(filters: { locationId?: string; staffId?: string } = {}): Promise<SwapRequest[]> {
  return fetchAllPages((page) => apiRequest<Paginated<SwapRequest>>(`/swaps${swapsQueryString(filters, page)}`))
}

export async function getPendingSwapCount(staffId: string): Promise<number> {
  return apiRequest<number>(`/staff/${staffId}/swaps/pending-count`)
}

export interface CreateSwapInput {
  type: SwapRequest['type']
  requestingStaffId: string
  shiftId: string
  targetStaffId?: string | null
}

// requestingStaffId is accepted for call-site compatibility but ignored — the backend
// always uses the JWT's own subject as the requester, never a client-supplied id.
export async function createSwapRequest(input: CreateSwapInput): Promise<SwapRequest> {
  return apiRequest<SwapRequest>('/swaps', {
    method: 'POST',
    body: { type: input.type, shiftId: input.shiftId, targetStaffId: input.targetStaffId ?? undefined },
  })
}

// The peer being asked to swap accepts or declines. Accepting moves straight to
// `awaiting_manager` (the mock's separate `peer_accepted` stage and its
// `submitForManagerApproval` follow-up were never wired to any UI — collapsed into one
// real transition here; see backend/src/routes/swaps.ts for the reasoning).
export async function respondAsPeer(swapId: string, accept: boolean): Promise<SwapRequest> {
  return apiRequest<SwapRequest>(`/swaps/${swapId}/respond`, { method: 'POST', body: { accept } })
}

// Regret Swap: withdrawing before manager approval simply cancels the request and
// leaves the original assignment untouched — there was nothing to revert since a
// pending request never touches the Assignment table in the first place.
export async function withdrawSwapRequest(swapId: string): Promise<SwapRequest> {
  return apiRequest<SwapRequest>(`/swaps/${swapId}/withdraw`, { method: 'POST' })
}

// actor is unused now — the backend derives the actor from the JWT and requires
// manager/admin role for both of these. Kept in the signature so call sites don't need
// to change.
export async function approveSwap(swapId: string, _actor: { id: string; name: string }): Promise<SwapRequest> {
  return apiRequest<SwapRequest>(`/swaps/${swapId}/approve`, { method: 'POST' })
}

export async function rejectSwap(swapId: string, _actor: { id: string; name: string }, reason?: string): Promise<SwapRequest> {
  return apiRequest<SwapRequest>(`/swaps/${swapId}/reject`, { method: 'POST', body: { reason } })
}
