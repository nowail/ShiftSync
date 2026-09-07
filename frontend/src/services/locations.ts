import { db, nextDbId } from '../lib/db'
import { withMockLatency } from '../lib/delay'
import { pushAudit } from './audit'
import type { Location } from '../types'

export async function getLocations(): Promise<Location[]> {
  return withMockLatency(() => [...db.locations])
}

export async function getLocation(id: string): Promise<Location | undefined> {
  return withMockLatency(() => db.locations.find((l) => l.id === id))
}

export interface CreateLocationInput {
  name: string
  city: string
  timezone: string
}

export async function createLocation(
  input: CreateLocationInput,
  actor: { id: string; name: string },
): Promise<Location> {
  return withMockLatency(() => {
    const location: Location = { id: nextDbId('loc'), ...input }
    db.locations.push(location)
    pushAudit({
      actorId: actor.id,
      actorName: actor.name,
      action: 'created_location',
      entity: 'location',
      entityId: location.id,
      locationId: location.id,
      details: `Added location "${location.name}" (${location.timezone}).`,
    })
    return location
  })
}

export async function updateLocation(
  id: string,
  patch: Partial<CreateLocationInput>,
  actor: { id: string; name: string },
): Promise<Location> {
  return withMockLatency(() => {
    const location = db.locations.find((l) => l.id === id)
    if (!location) throw new Error('Location not found.')
    Object.assign(location, patch)
    pushAudit({
      actorId: actor.id,
      actorName: actor.name,
      action: 'updated_location',
      entity: 'location',
      entityId: location.id,
      locationId: location.id,
      details: `Updated location "${location.name}".`,
    })
    return location
  })
}
