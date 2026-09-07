import { useMemo } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { X, Bell, CalendarClock, RefreshCw, TriangleAlert, MessageSquare } from 'lucide-react'
import { createPortal } from 'react-dom'
import { format, isToday, isYesterday, parseISO } from 'date-fns'
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '../../services/notifications'
import { LoadingState, ErrorState, EmptyState } from './States'
import { Button } from '../ui/Button'
import type { AppNotification, NotificationKind } from '../../types'

const ICONS: Record<NotificationKind, React.ReactNode> = {
  schedule_published: <CalendarClock size={16} className="text-moss" />,
  swap_resolved: <RefreshCw size={16} className="text-moss" />,
  conflict: <TriangleAlert size={16} className="text-brick" />,
  swap_requested: <MessageSquare size={16} className="text-amber-dark" />,
  shift_reminder: <Bell size={16} className="text-amber-dark" />,
}

function dayGroupLabel(iso: string): string {
  const date = parseISO(iso)
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'EEEE, MMM d')
}

export function NotificationCenter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: getNotifications,
    enabled: open,
  })

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })
  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const groups = useMemo(() => {
    if (!data) return []
    const map = new Map<string, AppNotification[]>()
    for (const n of data) {
      const label = dayGroupLabel(n.createdAt)
      if (!map.has(label)) map.set(label, [])
      map.get(label)!.push(n)
    }
    return Array.from(map.entries())
  }, [data])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        className="relative flex h-full w-full max-w-sm flex-col bg-paper shadow-board"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-display-sm font-display text-ink">Notifications</h2>
          <button onClick={onClose} aria-label="Close notifications" className="text-slate-500 hover:text-ink">
            <X size={18} />
          </button>
        </div>

        {data && data.length > 0 && (
          <div className="flex justify-end border-b border-slate-100 px-5 py-2">
            <Button size="sm" variant="ghost" onClick={() => markAllReadMutation.mutate()}>
              Mark all read
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading && <LoadingState label="Loading notifications…" />}
          {isError && <ErrorState message="Couldn't load notifications." onRetry={() => refetch()} />}
          {!isLoading && !isError && data?.length === 0 && (
            <EmptyState
              icon={<Bell size={20} className="text-slate-400" />}
              title="You're all caught up"
              body="New schedule and swap updates will show up here."
            />
          )}
          {!isLoading &&
            !isError &&
            groups.map(([label, items]) => (
              <div key={label} className="mb-5">
                <p className="mb-2 text-body-xs font-semibold uppercase tracking-normal text-slate-500">{label}</p>
                <ul className="flex flex-col gap-2">
                  {items.map((n) => (
                    <li
                      key={n.id}
                      className={`flex cursor-pointer items-start gap-2 rounded-sm border p-3 text-body-sm ${
                        n.read ? 'border-slate-100 bg-transparent' : 'border-slate-200 bg-slate-100/50'
                      }`}
                      onClick={() => !n.read && markReadMutation.mutate(n.id)}
                    >
                      <div className="mt-0.5">{ICONS[n.kind]}</div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink">{n.title}</p>
                        <p className="text-body-xs text-slate-600">{n.body}</p>
                      </div>
                      {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber" aria-hidden="true" />}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
