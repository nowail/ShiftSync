import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Plus, Trash2 } from 'lucide-react'
import { getAvailability, setRecurringWindows, addException, removeException } from '../../services/availability'
import { useSessionStore } from '../../store/session'
import { useUiStore } from '../../store/ui'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Badge } from '../../components/ui/Badge'
import { LoadingState, ErrorState } from '../../components/shared/States'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface DayRow {
  enabled: boolean
  startTime: string
  endTime: string
}

export function Availability() {
  const staffId = useSessionStore((s) => s.staffId)!
  const pushToast = useUiStore((s) => s.pushToast)
  const queryClient = useQueryClient()

  const availabilityQuery = useQuery({ queryKey: ['availability', staffId], queryFn: () => getAvailability(staffId) })

  const [days, setDays] = useState<DayRow[]>(
    DAYS.map(() => ({ enabled: false, startTime: '09:00', endTime: '17:00' })),
  )
  const [exceptionDate, setExceptionDate] = useState('')
  const [exceptionNote, setExceptionNote] = useState('')

  useEffect(() => {
    if (!availabilityQuery.data) return
    setDays((prev) =>
      prev.map((row, i) => {
        const match = availabilityQuery.data!.recurring.find((w) => w.dayOfWeek === i)
        return match ? { enabled: true, startTime: match.startTime, endTime: match.endTime } : row
      }),
    )
  }, [availabilityQuery.data])

  const saveMutation = useMutation({
    mutationFn: () =>
      setRecurringWindows(
        staffId,
        days
          .map((row, i) => ({ ...row, dayOfWeek: i }))
          .filter((row) => row.enabled)
          .map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek, startTime, endTime })),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability', staffId] })
      pushToast({ title: 'Availability saved', tone: 'success' })
    },
  })

  const addExceptionMutation = useMutation({
    mutationFn: () => addException(staffId, { date: exceptionDate, available: false, note: exceptionNote || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability', staffId] })
      setExceptionDate('')
      setExceptionNote('')
      pushToast({ title: 'Exception added', tone: 'success' })
    },
  })

  const removeExceptionMutation = useMutation({
    mutationFn: (id: string) => removeException(staffId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['availability', staffId] }),
  })

  if (availabilityQuery.isLoading) return <LoadingState label="Loading your availability…" />
  if (availabilityQuery.isError) return <ErrorState message="Couldn't load your availability." onRetry={() => availabilityQuery.refetch()} />

  return (
    <div className="flex flex-col gap-6 p-4">
      <div>
        <h1 className="font-display text-display-lg text-ink">Availability</h1>
        <p className="text-body-sm text-slate-600">Set your regular weekly windows and one-off exceptions.</p>
      </div>

      <div className="flex flex-col gap-2">
        {DAYS.map((label, i) => (
          <div key={label} className="flex items-center gap-2 rounded-sm border border-slate-200 p-2.5">
            <label className="flex w-28 items-center gap-2 text-body-sm font-medium text-ink">
              <input
                type="checkbox"
                checked={days[i].enabled}
                onChange={(e) =>
                  setDays((prev) => prev.map((r, idx) => (idx === i ? { ...r, enabled: e.target.checked } : r)))
                }
              />
              {label}
            </label>
            {days[i].enabled ? (
              <div className="flex flex-1 items-center gap-2">
                <input
                  type="time"
                  value={days[i].startTime}
                  onChange={(e) =>
                    setDays((prev) => prev.map((r, idx) => (idx === i ? { ...r, startTime: e.target.value } : r)))
                  }
                  className="h-8 rounded-sm border border-slate-200 px-2 text-body-sm"
                />
                <span className="text-slate-400">to</span>
                <input
                  type="time"
                  value={days[i].endTime}
                  onChange={(e) =>
                    setDays((prev) => prev.map((r, idx) => (idx === i ? { ...r, endTime: e.target.value } : r)))
                  }
                  className="h-8 rounded-sm border border-slate-200 px-2 text-body-sm"
                />
              </div>
            ) : (
              <span className="flex-1 text-body-sm text-slate-400">Unavailable</span>
            )}
          </div>
        ))}
      </div>

      <Button variant="primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? 'Saving…' : 'Save weekly availability'}
      </Button>

      <div>
        <h2 className="mb-2 text-body-xs font-semibold uppercase tracking-normal text-slate-500">
          One-off exceptions
        </h2>
        <div className="flex flex-col gap-2">
          {availabilityQuery.data?.exceptions.map((exc) => (
            <div key={exc.id} className="flex items-center justify-between rounded-sm border border-slate-200 p-2.5">
              <span className="flex items-center gap-2 text-body-sm">
                {format(parseISO(exc.date), 'EEE MMM d')}
                <Badge tone={exc.available ? 'moss' : 'brick'}>{exc.available ? 'Available' : 'Unavailable'}</Badge>
                {exc.note && <span className="text-slate-500">{exc.note}</span>}
              </span>
              <button
                onClick={() => removeExceptionMutation.mutate(exc.id)}
                className="text-slate-400 hover:text-brick"
                aria-label="Remove exception"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {availabilityQuery.data?.exceptions.length === 0 && (
            <p className="text-body-sm text-slate-500">No exceptions set.</p>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-2 rounded-sm border border-dashed border-slate-300 p-3">
          <Input type="date" label="Mark a date unavailable" value={exceptionDate} onChange={(e) => setExceptionDate(e.target.value)} />
          <Input placeholder="Note (optional)" value={exceptionNote} onChange={(e) => setExceptionNote(e.target.value)} />
          <Button
            variant="secondary"
            size="sm"
            disabled={!exceptionDate || addExceptionMutation.isPending}
            onClick={() => addExceptionMutation.mutate()}
          >
            <Plus size={14} /> Add exception
          </Button>
        </div>
      </div>
    </div>
  )
}
