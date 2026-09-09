import { Prisma } from '@prisma/client'

// Postgres SQLSTATE 23P01 ("exclusion_violation") is what `assignment_no_double_booking`
// raises. It isn't a constraint Prisma's schema knows about (it was added by hand-written
// raw SQL, not `@@unique`), so Prisma can't map it to its own P2002 the way it does for a
// declared unique index — it surfaces as an unrecognized database error instead. This is
// the app-level backstop for BACKEND_PROMPT item 4: the engine's pre-check closes almost
// every window, but two requests racing between "pre-check passed" and "row committed"
// can both pass the pre-check — the DB constraint is what actually stops the second one,
// and this is what turns that raw error into the same structured violation shape instead
// of a raw 500.
export function isExclusionViolation(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError || err instanceof Prisma.PrismaClientUnknownRequestError) {
    const message = 'message' in err ? String(err.message) : ''
    return message.includes('assignment_no_double_booking') || message.includes('23P01') || message.includes('exclusion_violation')
  }
  return false
}
