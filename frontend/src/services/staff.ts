import { apiRequest } from '../lib/apiClient'
import type { Role, SkillTag, StaffCertification, StaffMember } from '../types'

export async function getStaff(): Promise<StaffMember[]> {
  return apiRequest<StaffMember[]>('/staff')
}

export async function getStaffByLocation(locationId: string): Promise<StaffMember[]> {
  return apiRequest<StaffMember[]>(`/staff?locationId=${encodeURIComponent(locationId)}`)
}

export async function getStaffMember(id: string): Promise<StaffMember | undefined> {
  return apiRequest<StaffMember>(`/staff/${id}`)
}

export interface CreateStaffInput {
  name: string
  role: Role
  homeLocationId: string
  certifications: StaffCertification[]
  desiredWeeklyHours: number
}

// actor is unused now — the backend derives the actor from the JWT and requires admin
// role for both of these. Kept in the signature so call sites don't need to change.
export async function createStaffMember(input: CreateStaffInput, _actor: { id: string; name: string }): Promise<StaffMember> {
  return apiRequest<StaffMember>('/staff', { method: 'POST', body: input })
}

export async function updateStaffMember(
  id: string,
  patch: Partial<CreateStaffInput>,
  _actor: { id: string; name: string },
): Promise<StaffMember> {
  return apiRequest<StaffMember>(`/staff/${id}`, { method: 'PATCH', body: patch })
}

export async function updateAvailabilityPreferences(staffId: string, desiredWeeklyHours: number): Promise<StaffMember> {
  return apiRequest<StaffMember>(`/staff/${staffId}/preferences`, { method: 'PATCH', body: { desiredWeeklyHours } })
}

export function skillOptions(): SkillTag[] {
  return ['line', 'grill', 'prep', 'expo', 'bar', 'host', 'dish']
}
