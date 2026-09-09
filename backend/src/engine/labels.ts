// Mirrors frontend/src/lib/format.ts's ROLE_LABELS exactly, so engine messages read the
// same way the frontend's own mock-era violation text always has ("Grill", not "grill").
const ROLE_LABELS: Record<string, string> = {
  line: 'Line',
  grill: 'Grill',
  prep: 'Prep',
  expo: 'Expo',
  bar: 'Bar',
  host: 'Host',
  dish: 'Dish',
}

export function roleLabel(skillKey: string): string {
  return ROLE_LABELS[skillKey] ?? skillKey
}
