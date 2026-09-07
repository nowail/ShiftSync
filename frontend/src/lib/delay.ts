import { isChaosEnabled } from './chaos'

export function randomDelay(min = 150, max = 300): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class MockApiError extends Error {}

export async function withMockLatency<T>(fn: () => T, opts?: { errorMessage?: string }): Promise<T> {
  await randomDelay()
  if (isChaosEnabled()) {
    throw new MockApiError(
      opts?.errorMessage ?? 'The server took too long to respond. Check your connection and try again.',
    )
  }
  return fn()
}
