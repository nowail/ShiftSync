import { apiRequest } from '../lib/apiClient'
import type { AvailabilityException, AvailabilityWindow, StaffAvailability } from '../types'

export async function getAvailability(staffId: string): Promise<StaffAvailability> {
  return apiRequest<StaffAvailability>(`/staff/${staffId}/availability`)
}

export async function setRecurringWindows(
  staffId: string,
  windows: Omit<AvailabilityWindow, 'id'>[],
): Promise<StaffAvailability> {
  return apiRequest<StaffAvailability>(`/staff/${staffId}/availability/recurring`, {
    method: 'PUT',
    body: { windows },
  })
}

export async function addException(
  staffId: string,
  exception: Omit<AvailabilityException, 'id'>,
): Promise<StaffAvailability> {
  return apiRequest<StaffAvailability>(`/staff/${staffId}/availability/exceptions`, {
    method: 'POST',
    body: exception,
  })
}

export async function removeException(staffId: string, exceptionId: string): Promise<StaffAvailability> {
  return apiRequest<StaffAvailability>(`/staff/${staffId}/availability/exceptions/${exceptionId}`, {
    method: 'DELETE',
  })
}
