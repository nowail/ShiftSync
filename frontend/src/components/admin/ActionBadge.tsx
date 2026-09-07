import { Badge } from '../ui/Badge'

// Generic by design so it can be reused anywhere an audit `action` string is rendered —
// this pass only wires it into the Admin audit log.
const TONE_BY_ACTION: Record<string, 'moss' | 'brick' | 'amber' | 'slate'> = {
  published_schedule: 'moss',
  approved_swap: 'moss',
  assigned_shift: 'amber',
  reassigned_shift: 'amber',
  assigned_shift_override: 'brick',
  rejected_swap: 'brick',
  unassigned_shift: 'slate',
  unpublished_schedule: 'slate',
  edited_shift: 'slate',
  created_location: 'slate',
  updated_location: 'slate',
  added_staff: 'slate',
  updated_staff: 'slate',
}

export function actionLabel(action: string): string {
  const label = action.replaceAll('_', ' ')
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function ActionBadge({ action }: { action: string }) {
  return <Badge tone={TONE_BY_ACTION[action] ?? 'slate'}>{actionLabel(action)}</Badge>
}
