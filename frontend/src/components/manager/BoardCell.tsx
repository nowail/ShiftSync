import { motion } from 'framer-motion'
import { Lock, Pencil, Plus, ShieldAlert, Star } from 'lucide-react'
import { Avatar } from '../shared/Avatar'
import { isWithinPublishCutoff } from '../../lib/rules'
import type { Shift, StaffMember } from '../../types'

export function BoardCell({
  seats,
  staffById,
  flashedShiftId,
  onSelectSeat,
  onEditSeat,
}: {
  seats: Shift[]
  staffById: Map<string, StaffMember>
  flashedShiftId: string | null
  onSelectSeat: (shift: Shift) => void
  onEditSeat: (shift: Shift) => void
}) {
  if (seats.length === 0) {
    return <div className="min-h-[64px] rounded-sm border border-dashed border-slate-200" />
  }

  const filled = seats.filter((s) => s.assignedStaffId).length

  return (
    <div className="flex min-h-[64px] flex-col gap-1">
      {seats.length > 1 && (
        <p className={`text-body-xs font-medium ${filled < seats.length ? 'text-brick' : 'text-slate-500'}`}>
          {filled}/{seats.length} filled
        </p>
      )}
      {seats.map((shift) => {
        const staff = shift.assignedStaffId ? staffById.get(shift.assignedStaffId) : undefined
        const locked = shift.status === 'published' && isWithinPublishCutoff(shift)
        const isFlashing = flashedShiftId === shift.id

        return (
          <div key={shift.id} className="flex items-stretch gap-1">
            <motion.button
              onClick={() => onSelectSeat(shift)}
              animate={
                isFlashing
                  ? { backgroundColor: ['#F6F4EE', '#C1473F33', '#F6F4EE', '#C1473F33', '#F6F4EE'] }
                  : {}
              }
              transition={{ duration: 1.8 }}
              className={`flex flex-1 items-center gap-1.5 rounded-sm border px-2 py-1.5 text-left transition-colors duration-100 ${
                staff
                  ? 'border-slate-200 bg-paper hover:border-ink'
                  : 'border-brick/40 bg-brick/5 hover:border-brick'
              }`}
            >
              {staff ? (
                <>
                  <Avatar name={staff.name} color={staff.avatarColor} size={20} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-display-xs text-ink">{staff.name}</span>
                  </span>
                </>
              ) : (
                <span className="flex flex-1 items-center gap-1 text-body-xs font-medium text-brick">
                  <Plus size={12} /> Unfilled
                </span>
              )}
              {shift.isPremium && <Star size={12} className="shrink-0 text-amber-dark" aria-hidden="true" />}
              {shift.overrideReason && (
                <span title={`Assigned via manager override: ${shift.overrideReason}`}>
                  <ShieldAlert size={12} className="shrink-0 text-brick" aria-hidden="true" />
                </span>
              )}
              {locked && <Lock size={12} className="shrink-0 text-slate-400" aria-hidden="true" />}
            </motion.button>
            <button
              onClick={() => onEditSeat(shift)}
              aria-label="Edit shift"
              title="Edit shift"
              className="flex shrink-0 items-center justify-center rounded-sm border border-slate-200 px-1.5 text-slate-500 hover:border-ink hover:text-ink"
            >
              <Pencil size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
