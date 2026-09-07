import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { realtimeBus } from '../../services/realtime'
import { startScriptedRealtimeEvents } from '../../services/realtimeScript'
import { useUiStore } from '../../store/ui'
import type { ToastTone } from '../../store/ui'
import type { NotificationKind } from '../../types'

const TONE_BY_KIND: Record<NotificationKind, ToastTone> = {
  schedule_published: 'success',
  swap_resolved: 'success',
  conflict: 'danger',
  swap_requested: 'info',
  shift_reminder: 'info',
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const pushToast = useUiStore((s) => s.pushToast)
  const flashShift = useUiStore((s) => s.flashShift)

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
    const stop = startScriptedRealtimeEvents()
    return () => {
      unsubscribe()
      stop?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <>{children}</>
}
