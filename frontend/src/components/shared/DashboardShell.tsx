import { Outlet } from 'react-router-dom'
import { NavRail } from './NavRail'
import type { NavItem } from './NavRail'
import { TopBar } from './TopBar'
import { NotificationCenter } from './NotificationCenter'
import { useUiStore } from '../../store/ui'

export function DashboardShell({
  navItems,
  roleLabel,
  showLocationSwitcher = true,
}: {
  navItems: NavItem[]
  roleLabel: string
  showLocationSwitcher?: boolean
}) {
  const notificationCenterOpen = useUiStore((s) => s.notificationCenterOpen)
  const closeNotificationCenter = useUiStore((s) => s.closeNotificationCenter)

  return (
    <div className="flex h-screen bg-paper">
      <NavRail items={navItems} roleLabel={roleLabel} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar showLocationSwitcher={showLocationSwitcher} />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-0 py-6">
            <Outlet />
          </div>
        </main>
      </div>
      <NotificationCenter open={notificationCenterOpen} onClose={closeNotificationCenter} />
    </div>
  )
}
