import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './Button'

interface PaginationControlProps {
  page: number
  totalPages: number
  totalItems: number
  onPageChange: (page: number) => void
}

/** One reusable prev/next + page-number control for every paginated list screen —
 *  page-based (not cursor-based) to match the backend's ?page=&pageSize= contract.
 *  Renders nothing when there's only one page, so screens with few rows don't show a
 *  pointless disabled control. */
export function PaginationControl({ page, totalPages, totalItems, onPageChange }: PaginationControlProps) {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3 text-body-sm text-slate-600">
      <span>
        Page {page} of {totalPages} &middot; {totalItems} total
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft size={14} /> Prev
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          Next <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  )
}
