import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { Prisma } from '@prisma/client'
import { logger } from '../lib/logger'

export class ApiError extends Error {
  status: number
  code: string
  details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` } })
}

// Centralized error shape: { error: { code, message, details? } }. Every handler in this
// app should throw rather than format its own error response, so this is the one place
// that decides status codes and JSON shape.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } })
    return
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'validation_error', message: 'Request validation failed', details: err.flatten() },
    })
    return
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002 = unique constraint, P2025 = record not found, P2003 = FK violation.
    if (err.code === 'P2025') {
      res.status(404).json({ error: { code: 'not_found', message: 'Record not found' } })
      return
    }
    if (err.code === 'P2002') {
      res.status(409).json({ error: { code: 'conflict', message: 'A record with that value already exists' } })
      return
    }
  }

  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error')
  res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong' } })
}
