import type { SkillTag } from '../types'

const ROLE_LABELS: Record<SkillTag, string> = {
  line: 'Line',
  grill: 'Grill',
  prep: 'Prep',
  expo: 'Expo',
  bar: 'Bar',
  host: 'Host',
  dish: 'Dish',
}

export function roleLabel(role: SkillTag): string {
  return ROLE_LABELS[role]
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

export function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function formatHours(h: number): string {
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`
}
