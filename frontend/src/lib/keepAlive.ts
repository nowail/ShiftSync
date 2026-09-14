// Render's free tier spins down the backend after a period of inactivity, making the
// first request after a lull slow. Pinging /health periodically keeps it warm.
// Deliberately bypasses apiRequest: no auth header, no JSON parsing, no react-query —
// this must never throw, retry, or touch any app state.
const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000'
const KEEP_ALIVE_INTERVAL_MS = 30_000

export function startKeepAlive() {
  const ping = () => {
    fetch(`${API_BASE_URL}/health`).catch(() => {
      // Backend unreachable or still cold-starting — ignore, next tick will retry.
    })
  }

  ping()
  return setInterval(ping, KEEP_ALIVE_INTERVAL_MS)
}
