import type { NotificationKind } from '../types'

export interface RealtimeEvent {
  id: string
  kind: NotificationKind
  title: string
  body: string
  locationId?: string
  shiftId?: string
  at: string
}

type Listener = (event: RealtimeEvent) => void

class RealtimeBus {
  private listeners = new Set<Listener>()
  private seq = 0

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(event: Omit<RealtimeEvent, 'id' | 'at'>) {
    this.seq += 1
    const full: RealtimeEvent = { ...event, id: `rt-${this.seq}`, at: new Date().toISOString() }
    this.listeners.forEach((l) => l(full))
  }
}

export const realtimeBus = new RealtimeBus()

export function emitRealtimeEvent(event: Omit<RealtimeEvent, 'id' | 'at'>) {
  realtimeBus.emit(event)
}
