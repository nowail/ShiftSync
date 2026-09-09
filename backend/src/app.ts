import express from 'express'
import cors from 'cors'
import pinoHttp from 'pino-http'
import { corsOrigins } from './lib/env'
import { logger } from './lib/logger'
import { healthRouter } from './routes/health'
import { authRouter } from './routes/auth'
import { locationsRouter } from './routes/locations'
import { staffRouter } from './routes/staff'
import { shiftsRouter } from './routes/shifts'
import { swapsRouter } from './routes/swaps'
import { notificationsRouter } from './routes/notifications'
import { auditRouter } from './routes/audit'
import { availabilityRouter } from './routes/availability'
import { errorHandler, notFoundHandler } from './middleware/errorHandler'

export function createApp() {
  const app = express()

  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    }),
  )
  app.use(express.json())
  app.use(pinoHttp({ logger }))

  app.use(healthRouter)
  app.use(authRouter)
  app.use(locationsRouter)
  app.use(staffRouter)
  app.use(shiftsRouter)
  app.use(swapsRouter)
  app.use(notificationsRouter)
  app.use(auditRouter)
  app.use(availabilityRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
