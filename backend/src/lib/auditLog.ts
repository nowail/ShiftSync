import type { Prisma, PrismaClient } from '@prisma/client'

export interface WriteAuditInput {
  actorId: string
  entityType: string
  entityId: string
  action: string
  locationId?: string | null
  details?: string
  before?: unknown
  after?: unknown
}

// The single funnel every Phase 3 mutation writes through, per BACKEND_PROMPT item 7
// ("don't scatter manual AuditLog.create calls"). Takes a Prisma client or transaction
// client so callers inside a `$transaction` keep the audit row atomic with the mutation
// it's describing.
export async function writeAudit(db: PrismaClient | Prisma.TransactionClient, input: WriteAuditInput) {
  return db.auditLog.create({
    data: {
      actorId: input.actorId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      locationId: input.locationId ?? null,
      details: input.details,
      beforeJson: input.before === undefined ? undefined : (input.before as Prisma.InputJsonValue),
      afterJson: input.after === undefined ? undefined : (input.after as Prisma.InputJsonValue),
    },
  })
}
