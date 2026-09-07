// Dev-only toggle so error states (§6 of the spec) are reachable on demand
// instead of relying on random flakiness. Flip via the "Simulate error" control
// in the shell footer.
let chaosEnabled = false
const listeners = new Set<() => void>()

export function isChaosEnabled() {
  return chaosEnabled
}

export function setChaosEnabled(value: boolean) {
  chaosEnabled = value
  listeners.forEach((l) => l())
}

export function subscribeChaos(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
