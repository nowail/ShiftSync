import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { getLocations, createLocation } from '../../services/locations'
import { getStaffPage, createStaffMember, skillOptions } from '../../services/staff'
import { useSessionStore } from '../../store/session'
import { useUiStore } from '../../store/ui'
import { Tabs } from '../../components/ui/Tabs'
import { Table } from '../../components/ui/Table'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Modal } from '../../components/ui/Modal'
import { PaginationControl } from '../../components/ui/PaginationControl'
import { Avatar } from '../../components/shared/Avatar'
import { LoadingState, ErrorState, EmptyState } from '../../components/shared/States'
import { roleLabel } from '../../lib/format'
import type { Role, SkillTag, StaffCertification } from '../../types'

const TIMEZONES = ['America/Los_Angeles', 'America/New_York', 'America/Chicago', 'America/Denver']

export function LocationsUsers() {
  const [tab, setTab] = useState<'locations' | 'staff'>('locations')
  const [addLocationOpen, setAddLocationOpen] = useState(false)
  const [addStaffOpen, setAddStaffOpen] = useState(false)
  const [staffPage, setStaffPage] = useState(1)

  const staffId = useSessionStore((s) => s.staffId)!
  const staffName = useSessionStore((s) => s.staffName)!
  const actor = { id: staffId, name: staffName }
  const pushToast = useUiStore((s) => s.pushToast)
  const queryClient = useQueryClient()

  const locationsQuery = useQuery({ queryKey: ['locations'], queryFn: getLocations })
  const staffQuery = useQuery({ queryKey: ['staff', staffPage], queryFn: () => getStaffPage(staffPage) })
  const staffRows = staffQuery.data?.items ?? []

  const locationById = useMemo(
    () => new Map((locationsQuery.data ?? []).map((l) => [l.id, l])),
    [locationsQuery.data],
  )

  const createLocationMutation = useMutation({
    mutationFn: (input: { name: string; city: string; timezone: string }) => createLocation(input, actor),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      pushToast({ title: 'Location added', tone: 'success' })
      setAddLocationOpen(false)
    },
  })

  const createStaffMutation = useMutation({
    mutationFn: (input: {
      name: string
      role: Role
      homeLocationId: string
      certifications: StaffCertification[]
      desiredWeeklyHours: number
    }) => createStaffMember(input, actor),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      pushToast({ title: 'Staff member added', tone: 'success' })
      setAddStaffOpen(false)
    },
  })

  return (
    <div className="flex flex-col gap-5 px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-display-lg text-ink">Locations & users</h1>
          <p className="text-body-sm text-slate-600">Manage locations, staff, and manager access.</p>
        </div>
        <Button
          variant="primary"
          onClick={() => (tab === 'locations' ? setAddLocationOpen(true) : setAddStaffOpen(true))}
        >
          <Plus size={16} /> {tab === 'locations' ? 'Add location' : 'Add staff'}
        </Button>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'locations', label: 'Locations' },
          { value: 'staff', label: 'Staff & Managers' },
        ]}
      />

      {tab === 'locations' && (
        <>
          {locationsQuery.isLoading && <LoadingState label="Loading locations…" />}
          {locationsQuery.isError && (
            <ErrorState message="Couldn't load locations." onRetry={() => locationsQuery.refetch()} />
          )}
          {locationsQuery.data && locationsQuery.data.length === 0 && (
            <EmptyState title="No locations yet" body="Add the first Coastal Eats location to get started." />
          )}
          {locationsQuery.data && locationsQuery.data.length > 0 && (
            <Table
              rowKey={(row) => row.id}
              rows={locationsQuery.data}
              columns={[
                { header: 'Name', render: (l) => <span className="font-medium">{l.name}</span> },
                { header: 'City', render: (l) => l.city },
                { header: 'Timezone', render: (l) => <span className="font-display">{l.timezone}</span> },
              ]}
            />
          )}
        </>
      )}

      {tab === 'staff' && (
        <>
          {staffQuery.isLoading && <LoadingState label="Loading staff…" />}
          {staffQuery.isError && <ErrorState message="Couldn't load staff." onRetry={() => staffQuery.refetch()} />}
          {staffQuery.data && staffRows.length === 0 && (
            <EmptyState title="No staff yet" body="Add the first staff member to get started." />
          )}
          {staffRows.length > 0 && (
            <Table
              rowKey={(row) => row.id}
              rows={staffRows}
              columns={[
                {
                  header: 'Name',
                  render: (s) => (
                    <span className="flex items-center gap-2">
                      <Avatar name={s.name} color={s.avatarColor} size={24} />
                      {s.name}
                    </span>
                  ),
                },
                { header: 'Role', render: (s) => <Badge tone={s.role === 'staff' ? 'slate' : 'ink'}>{s.role}</Badge> },
                { header: 'Home location', render: (s) => locationById.get(s.homeLocationId)?.name ?? '—' },
                {
                  header: 'Certifications',
                  render: (s) => (
                    <span className="flex flex-wrap gap-1">
                      {s.certifications.map((c) => (
                        <Badge key={c.locationId} tone="slate">
                          {locationById.get(c.locationId)?.name ?? c.locationId}:{' '}
                          {c.skills.map(roleLabel).join(', ')}
                        </Badge>
                      ))}
                    </span>
                  ),
                },
                { header: 'Desired hrs/wk', render: (s) => s.desiredWeeklyHours },
              ]}
            />
          )}
          {staffQuery.data && (
            <PaginationControl
              page={staffQuery.data.page}
              totalPages={staffQuery.data.totalPages}
              totalItems={staffQuery.data.totalItems}
              onPageChange={setStaffPage}
            />
          )}
        </>
      )}

      <Modal open={addLocationOpen} onClose={() => setAddLocationOpen(false)} title="Add location" size="sm">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            const form = new FormData(e.currentTarget)
            createLocationMutation.mutate({
              name: String(form.get('name')),
              city: String(form.get('city')),
              timezone: String(form.get('timezone')),
            })
          }}
        >
          <Input name="name" label="Location name" required placeholder="e.g. Ferry Building" />
          <Input name="city" label="City" required placeholder="e.g. San Francisco, CA" />
          <Select name="timezone" label="Timezone" defaultValue={TIMEZONES[0]}>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="primary" disabled={createLocationMutation.isPending}>
            {createLocationMutation.isPending ? 'Adding…' : 'Add location'}
          </Button>
        </form>
      </Modal>

      <Modal open={addStaffOpen} onClose={() => setAddStaffOpen(false)} title="Add staff member" size="sm">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            const form = new FormData(e.currentTarget)
            const homeLocationId = String(form.get('homeLocationId'))
            const skills = form.getAll('skills') as SkillTag[]
            createStaffMutation.mutate({
              name: String(form.get('name')),
              role: String(form.get('role')) as Role,
              homeLocationId,
              certifications: [{ locationId: homeLocationId, skills }],
              desiredWeeklyHours: Number(form.get('desiredWeeklyHours')) || 30,
            })
          }}
        >
          <Input name="name" label="Full name" required placeholder="e.g. Robin Ashby" />
          <Select name="role" label="Role" defaultValue="staff">
            <option value="staff">Staff</option>
            <option value="manager">Manager</option>
          </Select>
          <Select name="homeLocationId" label="Home location" defaultValue={locationsQuery.data?.[0]?.id}>
            {locationsQuery.data?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <fieldset className="flex flex-col gap-1">
            <legend className="text-body-xs font-medium text-slate-600">Skills at home location</legend>
            <div className="flex flex-wrap gap-3">
              {skillOptions().map((skill) => (
                <label key={skill} className="flex items-center gap-1.5 text-body-sm">
                  <input type="checkbox" name="skills" value={skill} />
                  {roleLabel(skill)}
                </label>
              ))}
            </div>
          </fieldset>
          <Input
            name="desiredWeeklyHours"
            label="Desired weekly hours"
            type="number"
            min={0}
            max={60}
            defaultValue={30}
          />
          <Button type="submit" variant="primary" disabled={createStaffMutation.isPending}>
            {createStaffMutation.isPending ? 'Adding…' : 'Add staff member'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
