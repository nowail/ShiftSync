import { db } from '../lib/db'
import { approveSwap } from './swaps'
import { emitRealtimeEvent } from './realtime'

// A small scripted timeline so the toast/notification/on-duty-now UI can be seen
// working end-to-end without a real backend, per the spec's mock-realtime-layer note.
let started = false

export function startScriptedRealtimeEvents() {
  if (started) return
  started = true

  // A pending swap resolves on its own, so the manager's approval queue visibly updates.
  const timers: ReturnType<typeof setTimeout>[] = []
  timers.push(
    setTimeout(() => {
      const swap = db.swaps.find((s) => s.id === 'swap-1')
      const manager = db.staff.find((s) => s.id === 'usr-mgr-sf')
      if (swap && swap.stage === 'awaiting_manager' && manager) {
        approveSwap(swap.id, { id: manager.id, name: manager.name })
      }
    }, 9000),
  )

  // Two managers collide on the same open shift — the board flashes the affected cell.
  timers.push(
    setTimeout(() => {
      const shift = db.shifts.find((s) => s.id === 'sh-unfilled-soon')
      if (shift) {
        emitRealtimeEvent({
          kind: 'conflict',
          title: 'Assignment conflict',
          body: 'Another manager just made a change to this shift while you were viewing it.',
          locationId: shift.locationId,
          shiftId: shift.id,
        })
      }
    }, 18000),
  )

  return () => timers.forEach(clearTimeout)
}
