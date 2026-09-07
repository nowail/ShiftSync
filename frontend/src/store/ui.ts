import { create } from 'zustand'

export type ToastTone = 'info' | 'success' | 'warning' | 'danger'

export interface Toast {
  id: string
  title: string
  body?: string
  tone: ToastTone
}

interface UiState {
  notificationCenterOpen: boolean
  openNotificationCenter: () => void
  closeNotificationCenter: () => void
  navCollapsed: boolean
  toggleNav: () => void
  toasts: Toast[]
  pushToast: (toast: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
  flashedShiftId: string | null
  flashShift: (shiftId: string) => void
}

let toastSeq = 0

export const useUiStore = create<UiState>()((set) => ({
  notificationCenterOpen: false,
  openNotificationCenter: () => set({ notificationCenterOpen: true }),
  closeNotificationCenter: () => set({ notificationCenterOpen: false }),
  navCollapsed: false,
  toggleNav: () => set((s) => ({ navCollapsed: !s.navCollapsed })),
  toasts: [],
  pushToast: (toast) => {
    toastSeq += 1
    const id = `toast-${toastSeq}`
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 6000)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  flashedShiftId: null,
  flashShift: (shiftId) => {
    set({ flashedShiftId: shiftId })
    setTimeout(() => set((s) => (s.flashedShiftId === shiftId ? { flashedShiftId: null } : {})), 2200)
  },
}))
