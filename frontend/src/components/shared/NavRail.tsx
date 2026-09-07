import { NavLink } from 'react-router-dom'
import { ChevronsLeft, ChevronsRight, LogOut } from 'lucide-react'
import { useUiStore } from '../../store/ui'
import { useSessionStore } from '../../store/session'
import logo from '../../assets/shiftsync-logo.svg'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

export function NavRail({ items, roleLabel }: { items: NavItem[]; roleLabel: string }) {
  const collapsed = useUiStore((s) => s.navCollapsed)
  const toggleNav = useUiStore((s) => s.toggleNav)
  const logout = useSessionStore((s) => s.logout)

  // Below `sm` the rail is always icon-only (no drawer state to manage); the manual
  // collapse toggle only takes effect at `sm` and up.
  const labelClass = `truncate ${collapsed ? 'hidden' : 'hidden sm:inline'}`

  return (
    <nav
      className={`flex h-screen w-16 shrink-0 flex-col justify-between border-r border-slate-700/50 bg-ink text-paper transition-[width] duration-150 ${
        collapsed ? 'sm:w-16' : 'sm:w-56'
      }`}
      aria-label="Primary"
    >
      <div>
        <div className="flex h-14 items-center gap-2 px-4">
          {/* The mark's two dark bars are ink-colored, so on this ink sidebar it needs a
              light chip behind it for contrast — not a recolor, just correct presentation
              on a dark surface. */}
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] bg-paper" aria-hidden="true">
            <img src={logo} alt="" className="h-5 w-auto" />
          </span>
          <span className={`font-display text-display-sm ${labelClass}`}>ShiftSync</span>
        </div>

        <ul className="mt-2 flex flex-col gap-0.5 px-2">
          {items.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to.split('/').length <= 2}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-sm px-2.5 py-2 text-body-sm transition-colors duration-100 ${
                    isActive ? 'bg-amber text-ink font-medium' : 'text-slate-300 hover:bg-white/5 hover:text-paper'
                  }`
                }
                title={item.label}
              >
                <item.icon size={18} className="shrink-0" aria-hidden="true" />
                <span className={labelClass}>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-1 border-t border-white/10 px-2 py-3">
        <p className={`px-2.5 pb-1 text-body-xs text-slate-400 ${labelClass}`}>{roleLabel}</p>
        <button
          onClick={logout}
          className="flex items-center gap-3 rounded-sm px-2.5 py-2 text-body-sm text-slate-300 hover:bg-white/5 hover:text-paper"
          title="Sign out"
        >
          <LogOut size={18} aria-hidden="true" />
          <span className={labelClass}>Sign out</span>
        </button>
        <button
          onClick={toggleNav}
          className="hidden items-center gap-3 rounded-sm px-2.5 py-2 text-body-sm text-slate-300 hover:bg-white/5 hover:text-paper sm:flex"
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          <span className={labelClass}>Collapse</span>
        </button>
      </div>
    </nav>
  )
}
