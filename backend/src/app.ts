import express from 'express'
import cors from 'cors'
import pinoHttp from 'pino-http'
import { corsOrigins } from './lib/env'
import { logger } from './lib/logger'
import { healthRouter } from './routes/health'
import { authRouter } from './routes/auth'
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

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
