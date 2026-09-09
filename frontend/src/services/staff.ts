import { apiRequest, fetchAllPages } from '../lib/apiClient'
import type { Paginated, Role, SkillTag, StaffCertification, StaffMember } from '../types'

// /staff is genuinely paginated server-side (getStaffPage below, used by the Locations &
// Users list). Every other screen that calls getStaff()/getStaffByLocation() uses it as a
// full-roster lookup (names/avatars by id, the assign panel's candidate list source, swap
// pickers) — truncating those to one page would silently make some staff members
// unreachable through the UI. fetchAllPages keeps the pre-pagination "give me everyone"
// contract for those call sites; only Locations & Users gets a real page-at-a-time fetch.
export async function getStaff(): Promise<StaffMember[]> {
  return fetchAllPages((page) => apiRequest<Paginated<StaffMember>>(`/staff?page=${page}`))
}

export async function getStaffByLocation(locationId: string): Promise<StaffMember[]> {
  return fetchAllPages((page) => apiRequest<Paginated<StaffMember>>(`/staff?locationId=${encodeURIComponent(locationId)}&page=${page}`))
}

export async function getStaffPage(page: number, pageSize = 10): Promise<Paginated<StaffMember>> {
  return apiRequest<Paginated<StaffMember>>(`/staff?page=${page}&pageSize=${pageSize}`)
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

// POST /staff generates a real login (firstname.lastname@coastaleats.com, the standard
// demo password — see backend/src/routes/staff.ts) and includes the email in its response
// specifically so the admin who just created the account has something to hand the new
// hire; StaffMember itself has no email field (staff never see each other's), hence the
// wider return type here instead of just StaffMember.
export interface CreatedStaffMember extends StaffMember {
  email: string
}

// actor is unused now — the backend derives the actor from the JWT and requires admin
// role for both of these. Kept in the signature so call sites don't need to change.
export async function createStaffMember(input: CreateStaffInput, _actor: { id: string; name: string }): Promise<CreatedStaffMember> {
  return apiRequest<CreatedStaffMember>('/staff', { method: 'POST', body: input })
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
