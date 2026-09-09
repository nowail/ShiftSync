import { Fragment, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { formatInTimeZone } from 'date-fns-tz'
import { addDays, format, parseISO } from 'date-fns'
import { CheckCircle2, Lock, Plus, ShieldAlert, Star } from 'lucide-react'
import { getShiftsForWeek } from '../../services/shifts'
import { getLocations } from '../../services/locations'
import { getStaff } from '../../services/staff'
import { publishWeek, unpublishWeek } from '../../services/shifts'
import { useSessionStore } from '../../store/session'
import { useUiStore } from '../../store/ui'
import { CURRENT_WEEK_START_KEY, NEXT_WEEK_START_KEY } from '../../lib/weeks'
import { isWithinPublishCutoff } from '../../lib/rules'
import { roleLabel } from '../../lib/format'
import { BoardCell } from '../../components/manager/BoardCell'
import { AssignPanel } from '../../components/manager/AssignPanel'
import { CreateShiftModal } from '../../components/manager/CreateShiftModal'
import { EditShiftModal } from '../../components/manager/EditShiftModal'
import { DeleteShiftConfirm } from '../../components/manager/DeleteShiftConfirm'
import { Tabs } from '../../components/ui/Tabs'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { LoadingState, ErrorState, EmptyState } from '../../components/shared/States'
import type { Shift } from '../../types'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface RowGroup {
  key: string
  role: Shift['role']
  startLocal: string
  endLocal: string
}

export function ScheduleBoard() {
  const activeLocationId = useSessionStore((s) => s.activeLocationId)
  const staffId = useSessionStore((s) => s.staffId)!
  const staffName = useSessionStore((s) => s.staffName)!
  const actor = { id: staffId, name: staffName }
  const pushToast = useUiStore((s) => s.pushToast)
  const flashedShiftId = useUiStore((s) => s.flashedShiftId)

  const [weekStart, setWeekStart] = useState<string>(CURRENT_WEEK_START_KEY)
  const [selectedDay, setSelectedDay] = useState(0)
  const [activeSeat, setActiveSeat] = useState<Shift | null>(null)
  const [justPublished, setJustPublished] = useState(false)
  const [createShiftOpen, setCreateShiftOpen] = useState(false)
  const [editingSeat, setEditingSeat] = useState<Shift | null>(null)
  const [deletingSeat, setDeletingSeat] = useState<Shift | null>(null)

  const queryClient = useQueryClient()
  const locationsQuery = useQuery({ queryKey: ['locations'], queryFn: getLocations })
  const staffQuery = useQuery({ queryKey: ['staff'], queryFn: getStaff })
  const shiftsQuery = useQuery({
    queryKey: ['shifts', activeLocationId, weekStart],
    queryFn: () => getShiftsForWeek(activeLocationId!, weekStart),
    enabled: !!activeLocationId,
  })

  const location = locationsQuery.data?.find((l) => l.id === activeLocationId)
  const staffById = useMemo(() => new Map((staffQuery.data ?? []).map((s) => [s.id, s])), [staffQuery.data])

  const weekDays = useMemo(() => {
    const start = parseISO(weekStart)
    return Array.from({ length: 7 }, (_, i) => format(addDays(start, i), 'yyyy-MM-dd'))
  }, [weekStart])

  const rowGroups = useMemo<RowGroup[]>(() => {
    if (!shiftsQuery.data || !location) return []
    const map = new Map<string, RowGroup>()
    for (const shift of shiftsQuery.data) {
      const startLocal = formatInTimeZone(new Date(shift.startUtc), location.timezone, 'HH:mm')
      const endLocal = formatInTimeZone(new Date(shift.endUtc), location.timezone, 'HH:mm')
      const key = `${shift.role}__${startLocal}__${endLocal}`
      if (!map.has(key)) map.set(key, { key, role: shift.role, startLocal, endLocal })
    }
    return Array.from(map.values()).sort((a, b) => a.startLocal.localeCompare(b.startLocal))
  }, [shiftsQuery.data, location])

  function seatsFor(row: RowGroup, date: string): Shift[] {
    if (!shiftsQuery.data || !location) return []
    return shiftsQuery.data.filter((s) => {
      if (s.date !== date) return false
      const startLocal = formatInTimeZone(new Date(s.startUtc), location.timezone, 'HH:mm')
      const endLocal = formatInTimeZone(new Date(s.endUtc), location.timezone, 'HH:mm')
      return `${s.role}__${startLocal}__${endLocal}` === row.key
    })
  }

  // The wire Shift/seat DTO has no headcount field (seats are already exploded
  // one-per-assignment-or-open-slot) — the same role/time/date grouping seatsFor uses
  // already IS the headcount, so derive it the same way rather than adding a field.
  function headcountFor(shift: Shift): number {
    if (!shiftsQuery.data || !location) return 1
    const startLocal = formatInTimeZone(new Date(shift.startUtc), location.timezone, 'HH:mm')
    const endLocal = formatInTimeZone(new Date(shift.endUtc), location.timezone, 'HH:mm')
    return shiftsQuery.data.filter(
      (s) =>
        s.date === shift.date &&
        s.role === shift.role &&
        formatInTimeZone(new Date(s.startUtc), location.timezone, 'HH:mm') === startLocal &&
        formatInTimeZone(new Date(s.endUtc), location.timezone, 'HH:mm') === endLocal,
    ).length
  }

  const status = shiftsQuery.data?.[0]?.status ?? (weekStart === CURRENT_WEEK_START_KEY ? 'published' : 'draft')
  const anyLocked = shiftsQuery.data?.some((s) => s.status === 'published' && isWithinPublishCutoff(s)) ?? false

  const publishMutation = useMutation({
    mutationFn: () => publishWeek(activeLocationId!, weekStart, actor),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
      setJustPublished(true)
      setTimeout(() => setJustPublished(false), 1600)
    },
  })
  const unpublishMutation = useMutation({
    mutationFn: () => unpublishWeek(activeLocationId!, weekStart, actor),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
      pushToast({ title: 'Week moved back to draft', tone: 'info' })
    },
  })

  if (!activeLocationId) return <LoadingState label="Loading your location…" />

  return (
    <div className="flex flex-col gap-5 px-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-display-lg text-ink">Schedule board</h1>
          <p className="text-body-sm text-slate-600">{location?.name ?? 'Loading location…'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            value={weekStart}
            onChange={setWeekStart}
            options={[
              { value: CURRENT_WEEK_START_KEY, label: 'This week' },
              { value: NEXT_WEEK_START_KEY, label: 'Next week' },
            ]}
          />
          <Badge tone={status === 'published' ? 'moss' : 'slate'}>{status === 'published' ? 'Published' : 'Draft'}</Badge>
          {anyLocked && (
            <span className="hidden items-center gap-1 text-body-xs text-slate-500 sm:flex">
              <Lock size={12} /> inside 48h cutoff
            </span>
          )}
          <Button variant="secondary" onClick={() => setCreateShiftOpen(true)} disabled={!location}>
            <Plus size={16} /> Create shift
          </Button>
          <div className="relative">
            {status === 'published' ? (
              <Button variant="secondary" onClick={() => unpublishMutation.mutate()} disabled={unpublishMutation.isPending}>
                Unpublish
              </Button>
            ) : (
              <Button variant="primary" onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}>
                {publishMutation.isPending ? 'Publishing…' : 'Publish week'}
              </Button>
            )}
            <AnimatePresence>
              {justPublished && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.6, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                  className="absolute right-0 top-11 z-10 flex items-center gap-1.5 whitespace-nowrap rounded-sm bg-moss px-3 py-1.5 text-body-sm font-medium text-paper shadow-board"
                >
                  <CheckCircle2 size={15} /> Week published to staff
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {shiftsQuery.isLoading && <LoadingState label="Loading the schedule…" />}
      {shiftsQuery.isError && <ErrorState message="Couldn't load the schedule board." onRetry={() => shiftsQuery.refetch()} />}
      {shiftsQuery.data && rowGroups.length === 0 && (
        <EmptyState
          title="No shifts yet for this week"
          body="Create the first shift for this location to start building the schedule."
        />
      )}

      {shiftsQuery.data && rowGroups.length > 0 && location && (
        <>
          {/* Mobile: single-day agenda with day tabs */}
          <div className="sm:hidden">
            <Tabs
              className="mb-3"
              value={String(selectedDay)}
              onChange={(v) => setSelectedDay(Number(v))}
              options={weekDays.map((d, i) => ({
                value: String(i),
                label: `${DAY_LABELS[i]} ${format(parseISO(d), 'd')}`,
              }))}
            />
            <div className="flex flex-col gap-3">
              {rowGroups.map((row) => {
                const seats = seatsFor(row, weekDays[selectedDay])
                if (seats.length === 0) return null
                return (
                  <div key={row.key} className="rounded-md border border-slate-200 p-3">
                    <p className="mb-2 text-body-xs font-semibold text-slate-500">
                      {roleLabel(row.role)} · {row.startLocal}–{row.endLocal}
                    </p>
                    <BoardCell
                      seats={seats}
                      staffById={staffById}
                      flashedShiftId={flashedShiftId}
                      onSelectSeat={setActiveSeat}
                      onEditSeat={setEditingSeat}
                      onDeleteSeat={setDeletingSeat}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          {/* Tablet/desktop: week grid */}
          <div className="hidden overflow-x-auto rounded-md border border-slate-200 sm:block">
            <div
              className="grid min-w-[900px]"
              style={{ gridTemplateColumns: '110px repeat(7, minmax(130px, 1fr))' }}
            >
              <div className="sticky left-0 border-b border-r border-slate-200 bg-slate-100/60" />
              {weekDays.map((d, i) => (
                <div
                  key={d}
                  className="border-b border-r border-slate-200 bg-slate-100/60 px-2 py-2 text-center last:border-r-0"
                >
                  <p className="text-body-xs text-slate-500">{DAY_LABELS[i]}</p>
                  <p className="font-display text-display-sm text-ink">{format(parseISO(d), 'd')}</p>
                </div>
              ))}

              {rowGroups.map((row) => (
                <Fragment key={row.key}>
                  <div className="sticky left-0 flex flex-col justify-center gap-0.5 border-b border-r border-slate-200 bg-paper px-3 py-2">
                    <p className="text-body-xs font-semibold text-ink">{roleLabel(row.role)}</p>
                    <p className="text-body-xs text-slate-500">
                      {row.startLocal}–{row.endLocal}
                    </p>
                  </div>
                  {weekDays.map((d) => (
                    <div key={`${row.key}-${d}`} className="border-b border-r border-slate-100 p-1.5 last:border-r-0">
                      <BoardCell
                        seats={seatsFor(row, d)}
                        staffById={staffById}
                        flashedShiftId={flashedShiftId}
                        onSelectSeat={setActiveSeat}
                        onEditSeat={setEditingSeat}
                        onDeleteSeat={setDeletingSeat}
                      />
                    </div>
                  ))}
                </Fragment>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-body-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Plus size={12} className="text-brick" /> unfilled
            </span>
            <span className="flex items-center gap-1">
              <Lock size={12} /> inside 48h publish cutoff
            </span>
            <span className="flex items-center gap-1">
              <Star size={12} className="text-amber-dark" /> premium shift
            </span>
            <span className="flex items-center gap-1">
              <ShieldAlert size={12} className="text-brick" /> assigned via override
            </span>
          </div>
        </>
      )}

      {activeSeat && location && (
        <AssignPanel shift={activeSeat} location={location} onClose={() => setActiveSeat(null)} />
      )}

      {editingSeat && location && (
        <EditShiftModal
          shift={editingSeat}
          location={location}
          weekDays={weekDays}
          headcount={headcountFor(editingSeat)}
          onClose={() => setEditingSeat(null)}
          onSaved={(cancelledSwapCount) =>
            pushToast({
              title:
                cancelledSwapCount > 0
                  ? `Shift updated — ${cancelledSwapCount} pending swap request${cancelledSwapCount > 1 ? 's' : ''} cancelled`
                  : 'Shift updated',
              tone: 'success',
            })
          }
        />
      )}

      {deletingSeat && location && (
        <DeleteShiftConfirm
          shift={deletingSeat}
          location={location}
          onClose={() => setDeletingSeat(null)}
          onDeleted={() => pushToast({ title: 'Shift deleted', tone: 'info' })}
        />
      )}

      {createShiftOpen && location && (
        <CreateShiftModal
          location={location}
          weekDays={weekDays}
          defaultDate={weekDays[selectedDay]}
          weekIsPublished={status === 'published'}
          onClose={() => setCreateShiftOpen(false)}
          onCreated={(_shift, createdStatus) =>
            pushToast({
              title: createdStatus === 'published' ? 'Shift created and published' : 'Shift created as draft',
              tone: 'success',
            })
          }
        />
      )}
    </div>
  )
}
