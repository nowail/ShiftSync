import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import { getStaffMember, updateAvailabilityPreferences } from '../../services/staff'
import { getLocations } from '../../services/locations'
import { getNotificationPreference, setNotificationPreference } from '../../services/notifications'
import { useSessionStore } from '../../store/session'
import { useUiStore } from '../../store/ui'
import { Avatar } from '../../components/shared/Avatar'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { LoadingState, ErrorState } from '../../components/shared/States'
import { roleLabel } from '../../lib/format'
import type { NotificationChannel } from '../../types'

export function Profile() {
  const staffId = useSessionStore((s) => s.staffId)!
  const logout = useSessionStore((s) => s.logout)
  const pushToast = useUiStore((s) => s.pushToast)
  const queryClient = useQueryClient()

  const staffQuery = useQuery({ queryKey: ['staff', staffId], queryFn: () => getStaffMember(staffId) })
  const locationsQuery = useQuery({ queryKey: ['locations'], queryFn: getLocations })
  const [desiredHours, setDesiredHours] = useState<number | ''>('')

  const saveMutation = useMutation({
    mutationFn: (hours: number) => updateAvailabilityPreferences(staffId, hours),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', staffId] })
      pushToast({ title: 'Preferences saved', tone: 'success' })
    },
  })

  const notificationPrefQuery = useQuery({ queryKey: ['notification-preference'], queryFn: getNotificationPreference })
  const notificationPrefMutation = useMutation({
    mutationFn: (channel: NotificationChannel) => setNotificationPreference(channel),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preference'] })
      pushToast({ title: 'Notification preference saved', tone: 'success' })
    },
  })

  if (staffQuery.isLoading) return <LoadingState label="Loading your profile…" />
  if (staffQuery.isError || !staffQuery.data) return <ErrorState message="Couldn't load your profile." onRetry={() => staffQuery.refetch()} />

  const staff = staffQuery.data
  const locationById = new Map((locationsQuery.data ?? []).map((l) => [l.id, l]))

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex items-center gap-3">
        <Avatar name={staff.name} color={staff.avatarColor} size={48} />
        <div>
          <h1 className="font-display text-display-lg text-ink">{staff.name}</h1>
          <p className="text-body-sm text-slate-600">{locationById.get(staff.homeLocationId)?.name} · Staff</p>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-body-xs font-semibold uppercase tracking-normal text-slate-500">
          Skills & certifications
        </h2>
        <div className="flex flex-col gap-2">
          {staff.certifications.map((cert) => (
            <div key={cert.locationId} className="rounded-md border border-slate-200 p-3">
              <p className="mb-1.5 text-body-sm font-medium text-ink">{locationById.get(cert.locationId)?.name}</p>
              <div className="flex flex-wrap gap-1.5">
                {cert.skills.map((skill) => (
                  <Badge key={skill} tone="slate">
                    {roleLabel(skill)}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-body-xs font-semibold uppercase tracking-normal text-slate-500">
          Desired weekly hours
        </h2>
        <div className="flex items-end gap-2">
          <Input
            type="number"
            min={0}
            max={60}
            placeholder={String(staff.desiredWeeklyHours)}
            value={desiredHours}
            onChange={(e) => setDesiredHours(e.target.value === '' ? '' : Number(e.target.value))}
            className="max-w-[8rem]"
          />
          <Button
            variant="primary"
            disabled={desiredHours === '' || saveMutation.isPending}
            onClick={() => typeof desiredHours === 'number' && saveMutation.mutate(desiredHours)}
          >
            Save
          </Button>
        </div>
        <p className="mt-1 text-body-xs text-slate-500">Currently set to {staff.desiredWeeklyHours}h/week.</p>
      </section>

      <section>
        <h2 className="mb-2 text-body-xs font-semibold uppercase tracking-normal text-slate-500">
          Notifications
        </h2>
        <label className="flex items-center gap-2 text-body-sm text-ink">
          <input
            type="checkbox"
            checked={notificationPrefQuery.data === 'in_app_plus_email'}
            disabled={notificationPrefQuery.isLoading || notificationPrefMutation.isPending}
            onChange={(e) => notificationPrefMutation.mutate(e.target.checked ? 'in_app_plus_email' : 'in_app')}
          />
          Also send email notifications
        </label>
        <p className="mt-1 text-body-xs text-slate-500">Email is simulated for this demo — nothing is actually sent.</p>
      </section>

      <section>
        <h2 className="mb-2 text-body-xs font-semibold uppercase tracking-normal text-slate-500">Account</h2>
        <Button variant="secondary" onClick={logout}>
          <LogOut size={16} /> Sign out
        </Button>
      </section>
    </div>
  )
}
