import { env } from './lib/env'
import { logger } from './lib/logger'
import { createApp } from './app'

const app = createApp()

app.listen(env.PORT, () => {
  logger.info(`ShiftSync backend listening on http://localhost:${env.PORT}`)
})
