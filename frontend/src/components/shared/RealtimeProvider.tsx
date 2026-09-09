import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { realtimeBus } from '../../services/realtime'
import { connectRealtimeSocket, disconnectRealtimeSocket, joinLocationRoom, subscribePresence, subscribeScheduleUpdated } from '../../services/socket'
import { useSessionStore } from '../../store/session'
import { useUiStore } from '../../store/ui'
import type { ToastTone } from '../../store/ui'
import type { NotificationKind } from '../../types'

const TONE_BY_KIND: Record<NotificationKind, ToastTone> = {
  schedule_published: 'success',
  swap_resolved: 'success',
  conflict: 'danger',
  swap_requested: 'info',
  shift_reminder: 'info',
  overtime_warning: 'danger',
  availability_changed: 'info',
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const pushToast = useUiStore((s) => s.pushToast)
  const flashShift = useUiStore((s) => s.flashShift)
  const token = useSessionStore((s) => s.token)
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated)
  const activeLocationId = useSessionStore((s) => s.activeLocationId)

  // Toast-worthy events (schedule.published, swap.requested/resolved, assignment.conflict)
  // arrive over the socket in services/socket.ts and are re-emitted onto this same bus the
  // old scripted mock used, so this consumer needed no changes at all.
  useEffect(() => {
    const unsubscribe = realtimeBus.subscribe((event) => {
      pushToast({ title: event.title, body: event.body, tone: TONE_BY_KIND[event.kind] })
      if (event.shiftId) flashShift(event.shiftId)
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['swaps'] })
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
      queryClient.invalidateQueries({ queryKey: ['presence'] })
      queryClient.invalidateQueries({ queryKey: ['audit'] })
    })
    return unsubscribe
  }, [pushToast, flashShift, queryClient])

  // The actual socket connection — one per logged-in session, authed with the same JWT
  // every REST call already uses. Silent signals (schedule.updated, presence.clockIn/Out)
  // are handled here directly instead of through the toast bus (see socket.ts).
  useEffect(() => {
    if (!isAuthenticated || !token) return
    connectRealtimeSocket(token)

    const unsubSchedule = subscribeScheduleUpdated((payload) => {
      if (payload.shiftId) flashShift(payload.shiftId)
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
    })
    const unsubPresence = subscribePresence(() => {
      queryClient.invalidateQueries({ queryKey: ['presence'] })
    })

    return () => {
      unsubSchedule()
      unsubPresence()
      disconnectRealtimeSocket()
    }
  }, [isAuthenticated, token, flashShift, queryClient])

  // Auto-join covers staff (home location) and managers (their ManagerLocation rows)
  // server-side already — this explicit join is for admin, who has no fixed location
  // scope, and for whichever location a manager/admin is currently looking at.
  useEffect(() => {
    if (!isAuthenticated || !activeLocationId) return
    joinLocationRoom(activeLocationId)
  }, [isAuthenticated, activeLocationId])

  return <>{children}</>
}
