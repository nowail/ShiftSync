import { PrismaClient } from '@prisma/client'

// Single shared client — Prisma manages its own connection pool internally, so a module
// singleton (not one-per-request) is the standard pattern.
export const prisma = new PrismaClient()
