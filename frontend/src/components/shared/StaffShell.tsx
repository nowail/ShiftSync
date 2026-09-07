import { NavLink, Outlet } from 'react-router-dom'
import { Bell, CalendarDays, Repeat2, UserRound } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useSessionStore } from '../../store/session'
import { useUiStore } from '../../store/ui'
import { NotificationCenter } from './NotificationCenter'
import { getUnreadCount } from '../../services/notifications'
import logo from '../../assets/shiftsync-logo.svg'

const TABS = [
  { to: '/staff', label: 'Schedule', icon: CalendarDays, end: true },
  { to: '/staff/swaps', label: 'Swaps', icon: Repeat2, end: false },
  { to: '/staff/profile', label: 'Profile', icon: UserRound, end: false },
]

export function StaffShell() {
  const staffName = useSessionStore((s) => s.staffName)
  const notificationCenterOpen = useUiStore((s) => s.notificationCenterOpen)
  const openNotificationCenter = useUiStore((s) => s.openNotificationCenter)
  const closeNotificationCenter = useUiStore((s) => s.closeNotificationCenter)

  const { data: unread } = useQuery({ queryKey: ['notifications', 'unread'], queryFn: getUnreadCount })

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-paper">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <p className="text-body-xs text-slate-500">Hi {staffName?.split(' ')[0]}</p>
          <div className="flex items-center gap-1.5">
            <img src={logo} alt="" className="h-6 w-auto" />
            <p className="font-display text-display-sm text-ink">ShiftSync</p>
          </div>
        </div>
        <button
          onClick={openNotificationCenter}
          aria-label="Open notifications"
          className="relative rounded-sm p-2 text-slate-600 hover:bg-slate-100 hover:text-ink"
        >
          <Bell size={20} />
          {!!unread && unread > 0 && (
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber" aria-hidden="true" />
          )}
        </button>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>

      <nav
        className="fixed bottom-0 left-1/2 flex w-full max-w-md -translate-x-1/2 border-t border-slate-200 bg-paper"
        aria-label="Primary"
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-body-xs ${
                isActive ? 'text-ink font-medium' : 'text-slate-500'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <tab.icon size={20} className={isActive ? 'text-amber-dark' : ''} aria-hidden="true" />
                {tab.label}
              </>
            )}
          </NavLink>
        ))}
        <button
          onClick={openNotificationCenter}
          className="relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-body-xs text-slate-500"
        >
          <Bell size={20} aria-hidden="true" />
          Notifs
          {!!unread && unread > 0 && (
            <span className="absolute right-1/3 top-1.5 h-2 w-2 rounded-full bg-amber" aria-hidden="true" />
          )}
        </button>
      </nav>

      <NotificationCenter open={notificationCenterOpen} onClose={closeNotificationCenter} />
    </div>
  )
}
