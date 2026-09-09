import { apiRequest } from '../lib/apiClient'
import type { Location } from '../types'

export async function getLocations(): Promise<Location[]> {
  return apiRequest<Location[]>('/locations')
}

export async function getLocation(id: string): Promise<Location | undefined> {
  return apiRequest<Location>(`/locations/${id}`)
}

export interface CreateLocationInput {
  name: string
  city: string
  timezone: string
}

// actor is unused now — the backend derives the actor from the JWT and requires admin
// role for both of these. Kept in the signature so call sites don't need to change.
export async function createLocation(input: CreateLocationInput, _actor: { id: string; name: string }): Promise<Location> {
  return apiRequest<Location>('/locations', { method: 'POST', body: input })
}

export async function updateLocation(
  id: string,
  patch: Partial<CreateLocationInput>,
  _actor: { id: string; name: string },
): Promise<Location> {
  return apiRequest<Location>(`/locations/${id}`, { method: 'PATCH', body: patch })
}
