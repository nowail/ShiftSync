import { createServer } from 'http'
import { env } from './lib/env'
import { logger } from './lib/logger'
import { createApp } from './app'
import { initSocket } from './lib/socket'
import { reconcilePresenceSchedules } from './lib/presenceScheduler'

const app = createApp()
const httpServer = createServer(app)
initSocket(httpServer)

httpServer.listen(env.PORT, () => {
  logger.info(`ShiftSync backend listening on http://localhost:${env.PORT}`)
  // One-time catch-up, not a recurring poll — see presenceScheduler.ts. Timers from any
  // previous process are gone; this re-registers them for whatever's already active.
  reconcilePresenceSchedules().catch((err) => logger.error({ err }, 'Failed to reconcile presence schedules on startup'))
})
