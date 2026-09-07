import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { useUiStore } from '../../store/ui'
import type { ToastTone } from '../../store/ui'

const TONE_STYLES: Record<ToastTone, { border: string; icon: React.ReactNode }> = {
  success: { border: 'border-l-moss', icon: <CheckCircle2 size={18} className="text-moss" /> },
  info: { border: 'border-l-amber', icon: <Info size={18} className="text-amber-dark" /> },
  warning: { border: 'border-l-flag', icon: <TriangleAlert size={18} className="text-flag" /> },
  danger: { border: 'border-l-brick', icon: <TriangleAlert size={18} className="text-brick" /> },
}

export function ToastViewport() {
  const toasts = useUiStore((s) => s.toasts)
  const dismissToast = useUiStore((s) => s.dismissToast)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`flex items-start gap-2 rounded-sm border border-slate-200 border-l-4 bg-paper p-3 shadow-board ${TONE_STYLES[toast.tone].border}`}
        >
          <div className="pt-0.5">{TONE_STYLES[toast.tone].icon}</div>
          <div className="min-w-0 flex-1">
            <p className="text-body-sm font-medium text-ink">{toast.title}</p>
            {toast.body && <p className="text-body-xs text-slate-600">{toast.body}</p>}
          </div>
          <button
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss notification"
            className="text-slate-400 hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}
