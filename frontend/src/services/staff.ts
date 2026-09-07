import { db, nextDbId } from '../lib/db'
import { withMockLatency } from '../lib/delay'
import { pushAudit } from './audit'
import type { Role, SkillTag, StaffCertification, StaffMember } from '../types'

export async function getStaff(): Promise<StaffMember[]> {
  return withMockLatency(() => [...db.staff])
}

export async function getStaffByLocation(locationId: string): Promise<StaffMember[]> {
  return withMockLatency(() => db.staff.filter((s) => s.certifications.some((c) => c.locationId === locationId)))
}

export async function getStaffMember(id: string): Promise<StaffMember | undefined> {
  return withMockLatency(() => db.staff.find((s) => s.id === id))
}

export interface CreateStaffInput {
  name: string
  role: Role
  homeLocationId: string
  certifications: StaffCertification[]
  desiredWeeklyHours: number
}

const AVATAR_PALETTE = ['#E8A33D', '#3E7C6B', '#C1473F', '#4B5169', '#868C9E', '#B8842E', '#656B82']

export async function createStaffMember(
  input: CreateStaffInput,
  actor: { id: string; name: string },
): Promise<StaffMember> {
  return withMockLatency(() => {
    const member: StaffMember = {
      id: nextDbId('usr'),
      avatarColor: AVATAR_PALETTE[db.staff.length % AVATAR_PALETTE.length],
      ...input,
    }
    db.staff.push(member)
    pushAudit({
      actorId: actor.id,
      actorName: actor.name,
      action: 'added_staff',
      entity: 'staff',
      entityId: member.id,
      locationId: member.homeLocationId,
      details: `Added ${member.name} (${member.role}).`,
    })
    return member
  })
}

export async function updateStaffMember(
  id: string,
  patch: Partial<CreateStaffInput>,
  actor: { id: string; name: string },
): Promise<StaffMember> {
  return withMockLatency(() => {
    const member = db.staff.find((s) => s.id === id)
    if (!member) throw new Error('Staff member not found.')
    Object.assign(member, patch)
    pushAudit({
      actorId: actor.id,
      actorName: actor.name,
      action: 'updated_staff',
      entity: 'staff',
      entityId: member.id,
      locationId: member.homeLocationId,
      details: `Updated ${member.name}.`,
    })
    return member
  })
}

export async function updateAvailabilityPreferences(
  staffId: string,
  desiredWeeklyHours: number,
): Promise<StaffMember> {
  return withMockLatency(() => {
    const member = db.staff.find((s) => s.id === staffId)
    if (!member) throw new Error('Staff member not found.')
    member.desiredWeeklyHours = desiredWeeklyHours
    return member
  })
}

export function skillOptions(): SkillTag[] {
  return ['line', 'grill', 'prep', 'expo', 'bar', 'host', 'dish']
}
