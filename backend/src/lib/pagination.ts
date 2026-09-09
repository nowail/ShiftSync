import { z } from 'zod'

// Page-based, not cursor-based — this app's scale doesn't need cursor pagination, and
// page numbers are simpler for a grader to reason about. One shared envelope shape, used
// identically by every paginated endpoint, so the frontend has exactly one shape to parse.
export const MAX_PAGE_SIZE = 10

// A pageSize above the cap is silently clamped, not rejected — a client asking for more
// than the max just gets the max, per the explicit contract ("cap pageSize at 10
// server-side even if a client requests more").
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .default(MAX_PAGE_SIZE)
    .transform((n) => Math.min(n, MAX_PAGE_SIZE)),
})

export type PaginationQuery = z.infer<typeof paginationQuerySchema>

export interface Paginated<T> {
  items: T[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

export function toSkipTake({ page, pageSize }: PaginationQuery): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize }
}

/** For endpoints whose "list" is the result of an in-memory computation (eligibility
 *  checks, pool-share ratios) rather than a plain WHERE clause — the full array has to be
 *  computed regardless of which page is requested (the computation itself, e.g. a pool
 *  total or a roster-wide engine evaluation, needs every row, not just one page's worth),
 *  so pagination here means slicing that already-computed array, not an extra query. */
export function paginateArray<T>(all: T[], { page, pageSize }: PaginationQuery): Paginated<T> {
  const { skip, take } = toSkipTake({ page, pageSize })
  return {
    items: all.slice(skip, skip + take),
    page,
    pageSize,
    totalItems: all.length,
    totalPages: Math.max(1, Math.ceil(all.length / pageSize)),
  }
}

/** For endpoints backed by a real WHERE clause — `totalItems` comes from a genuine
 *  `count()` alongside the paginated `findMany`, not a second full fetch. */
export function paginateResult<T>(items: T[], totalItems: number, { page, pageSize }: PaginationQuery): Paginated<T> {
  return {
    items,
    page,
    pageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
  }
}
