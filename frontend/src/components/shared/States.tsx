import type { ReactNode } from 'react'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { Button } from '../ui/Button'

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-body-sm text-slate-500" role="status">
      <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
      {label}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-sm border border-brick/30 bg-brick/5 p-5">
      <div className="flex items-center gap-2 text-brick">
        <TriangleAlert size={18} />
        <p className="text-body-sm font-medium">Something went wrong</p>
      </div>
      <p className="text-body-sm text-slate-600">{message}</p>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string
  body?: string
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-sm border border-dashed border-slate-300 p-8">
      {icon}
      <p className="text-body-md font-medium text-ink">{title}</p>
      {body && <p className="text-body-sm text-slate-600">{body}</p>}
      {action}
    </div>
  )
}
