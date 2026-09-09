// Shared client for real backend calls. Base URL from an env var so it's the same build
// artifact in every environment — only VITE_API_URL changes between dev and deployed.
// Every phase's "swap from mock to real" routes through this, never a bare fetch().
import { useSessionStore } from '../store/session'
import type { Paginated } from '../types'

const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000'

export class ApiClientError extends Error {
  status: number
  code?: string
  details?: unknown

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = code
    this.details = details
  }
}

interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  /** Skip attaching the session's Bearer token (e.g. for /auth/login itself). */
  skipAuth?: boolean
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, skipAuth, headers, ...rest } = options

  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string> | undefined),
  }
  if (!skipAuth) {
    const token = useSessionStore.getState().token
    if (token) finalHeaders.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!response.ok) {
    let parsed: { error?: { message?: string; code?: string; details?: unknown } } | null = null
    try {
      parsed = await response.json()
    } catch {
      // Non-JSON error body (e.g. the backend is down and a proxy returned HTML) — fall
      // through to the generic message below.
    }
    throw new ApiClientError(
      response.status,
      parsed?.error?.message ?? `Request failed with status ${response.status}`,
      parsed?.error?.code,
      parsed?.error?.details,
    )
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/**
 * For the handful of screens that genuinely need a *complete* list from a now-paginated
 * endpoint — a lookup-by-id map (staff names/avatars), an assign/swap-target picker, a
 * manager's pending-approvals queue — where truncating to one page would silently hide
 * real people or real pending work. Fetches every page and concatenates, so those callers
 * keep their pre-pagination "give me everything" contract unchanged. Not used for the
 * screens that actually display pagination controls (Audit Log, Fairness, Overtime,
 * Notifications, Locations & Users, the Assign panel, claimable shifts) — those consume
 * one page at a time on purpose.
 */
export async function fetchAllPages<T>(fetchPage: (page: number) => Promise<Paginated<T>>): Promise<T[]> {
  const first = await fetchPage(1)
  if (first.totalPages <= 1) return first.items
  const rest = await Promise.all(
    Array.from({ length: first.totalPages - 1 }, (_, i) => fetchPage(i + 2)),
  )
  return [first.items, ...rest.map((p) => p.items)].flat()
}

/** Same request/auth/error handling as apiRequest, for the one endpoint (CSV export)
 *  that returns a non-JSON body — apiRequest's unconditional `response.json()` would
 *  throw trying to parse a CSV file as JSON. */
export async function apiRequestText(path: string, options: ApiRequestOptions = {}): Promise<string> {
  const { body, skipAuth, headers, ...rest } = options

  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string> | undefined),
  }
  if (!skipAuth) {
    const token = useSessionStore.getState().token
    if (token) finalHeaders.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!response.ok) {
    let parsed: { error?: { message?: string; code?: string; details?: unknown } } | null = null
    try {
      parsed = await response.json()
    } catch {
      // Non-JSON error body — fall through to the generic message below.
    }
    throw new ApiClientError(
      response.status,
      parsed?.error?.message ?? `Request failed with status ${response.status}`,
      parsed?.error?.code,
      parsed?.error?.details,
    )
  }

  return response.text()
}
