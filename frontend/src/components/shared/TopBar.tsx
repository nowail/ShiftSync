import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatInTimeZone } from 'date-fns-tz'
import { Bell, Bug } from 'lucide-react'
import { getLocations } from '../../services/locations'
import { useSessionStore } from '../../store/session'
import { useUiStore } from '../../store/ui'
import { isChaosEnabled, setChaosEnabled, subscribeChaos } from '../../lib/chaos'
import { Avatar } from './Avatar'
import { Select } from '../ui/Select'

export function TopBar({ showLocationSwitcher = true }: { showLocationSwitcher?: boolean }) {
  const activeLocationId = useSessionStore((s) => s.activeLocationId)
  const setActiveLocation = useSessionStore((s) => s.setActiveLocation)
  const staffName = useSessionStore((s) => s.staffName)
  const openNotificationCenter = useUiStore((s) => s.openNotificationCenter)

  const { data: locations } = useQuery({ queryKey: ['locations'], queryFn: getLocations })
  const activeLocation = locations?.find((l) => l.id === activeLocationId) ?? locations?.[0]

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  const [chaos, setChaos] = useState(isChaosEnabled())
  useEffect(() => subscribeChaos(() => setChaos(isChaosEnabled())), [])

  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b border-slate-200 bg-paper px-5">
      <div className="flex items-center gap-3">
        {showLocationSwitcher && locations && locations.length > 0 && (
          <Select
            aria-label="Active location"
            value={activeLocationId ?? ''}
            onChange={(e) => setActiveLocation(e.target.value)}
            className="h-9 min-w-[11rem]"
          >
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </Select>
        )}
        {activeLocation && (
          <p className="hidden text-body-sm text-slate-600 sm:block">
            Local time{' '}
            <span className="font-display font-semibold text-ink">
              {formatInTimeZone(now, activeLocation.timezone, 'h:mm a')}
            </span>{' '}
            {formatInTimeZone(now, activeLocation.timezone, 'zzz')}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            setChaosEnabled(!chaos)
          }}
          className={`hidden items-center gap-1.5 rounded-sm border px-2 py-1 text-body-xs sm:flex ${
            chaos ? 'border-brick text-brick' : 'border-slate-200 text-slate-500'
          }`}
          title="Toggle a simulated network error to preview error states"
        >
          <Bug size={13} />
          {chaos ? 'Errors on' : 'Simulate error'}
        </button>
        <button
          onClick={openNotificationCenter}
          aria-label="Open notifications"
          className="relative rounded-sm p-2 text-slate-600 hover:bg-slate-100 hover:text-ink"
        >
          <Bell size={18} />
        </button>
        {staffName && <Avatar name={staffName} color="#4B5169" />}
      </div>
    </header>
  )
}
