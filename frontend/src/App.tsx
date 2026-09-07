import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { LayoutDashboard, Building2, Scale, ScrollText, CalendarRange, BarChart3, Repeat2, Users, History } from 'lucide-react'
import { queryClient } from './lib/queryClient'
import { useSessionStore } from './store/session'
import { RealtimeProvider } from './components/shared/RealtimeProvider'
import { ToastViewport } from './components/ui/ToastViewport'
import { DashboardShell } from './components/shared/DashboardShell'
import { StaffShell } from './components/shared/StaffShell'
import { Login } from './routes/auth/Login'
import { CorporateOverview } from './routes/admin/CorporateOverview'
import { LocationsUsers } from './routes/admin/LocationsUsers'
import { FairnessReport } from './routes/admin/FairnessReport'
import { AuditLog } from './routes/admin/AuditLog'
import { ScheduleBoard } from './routes/manager/ScheduleBoard'
import { OvertimeDashboard } from './routes/manager/OvertimeDashboard'
import { SwapApprovals } from './routes/manager/SwapApprovals'
import { OnDutyNow } from './routes/manager/OnDutyNow'
import { ShiftHistory } from './routes/manager/ShiftHistory'
import { MySchedule } from './routes/staff/MySchedule'
import { Availability } from './routes/staff/Availability'
import { StaffSwaps } from './routes/staff/StaffSwaps'
import { Profile } from './routes/staff/Profile'
import type { Role } from './types'
import type { ReactNode } from 'react'

const ADMIN_NAV = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard },
  { to: '/admin/locations', label: 'Locations & Users', icon: Building2 },
  { to: '/admin/fairness', label: 'Fairness', icon: Scale },
  { to: '/admin/audit', label: 'Audit Log', icon: ScrollText },
]

const MANAGER_NAV = [
  { to: '/manager', label: 'Schedule Board', icon: CalendarRange },
  { to: '/manager/overtime', label: 'Overtime', icon: BarChart3 },
  { to: '/manager/swaps', label: 'Swaps & Drops', icon: Repeat2 },
  { to: '/manager/on-duty', label: 'On Duty Now', icon: Users },
  { to: '/manager/history', label: 'Shift History', icon: History },
]

function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated)
  const sessionRole = useSessionStore((s) => s.role)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (sessionRole !== role) return <Navigate to={`/${sessionRole}`} replace />
  return <>{children}</>
}

function RootRedirect() {
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated)
  const role = useSessionStore((s) => s.role)
  if (!isAuthenticated || !role) return <Navigate to="/login" replace />
  return <Navigate to={`/${role}`} replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<Login />} />

            <Route
              path="/admin"
              element={
                <RequireRole role="admin">
                  <DashboardShell navItems={ADMIN_NAV} roleLabel="Admin" showLocationSwitcher={false} />
                </RequireRole>
              }
            >
              <Route index element={<CorporateOverview />} />
              <Route path="locations" element={<LocationsUsers />} />
              <Route path="fairness" element={<FairnessReport />} />
              <Route path="audit" element={<AuditLog />} />
            </Route>

            <Route
              path="/manager"
              element={
                <RequireRole role="manager">
                  <DashboardShell navItems={MANAGER_NAV} roleLabel="Manager" />
                </RequireRole>
              }
            >
              <Route index element={<ScheduleBoard />} />
              <Route path="overtime" element={<OvertimeDashboard />} />
              <Route path="swaps" element={<SwapApprovals />} />
              <Route path="on-duty" element={<OnDutyNow />} />
              <Route path="history" element={<ShiftHistory />} />
            </Route>

            <Route
              path="/staff"
              element={
                <RequireRole role="staff">
                  <StaffShell />
                </RequireRole>
              }
            >
              <Route index element={<MySchedule />} />
              <Route path="availability" element={<Availability />} />
              <Route path="swaps" element={<StaffSwaps />} />
              <Route path="profile" element={<Profile />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <ToastViewport />
      </RealtimeProvider>
    </QueryClientProvider>
  )
}
