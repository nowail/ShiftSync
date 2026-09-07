import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, Users, UserRound } from 'lucide-react'
import { useSessionStore } from '../../store/session'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import logo from '../../assets/shiftsync-logo.svg'
import type { Role } from '../../types'

const ROLE_OPTIONS: { role: Role; label: string; description: string; icon: typeof ShieldCheck }[] = [
  { role: 'admin', label: 'Admin', description: 'Corporate oversight across all locations', icon: ShieldCheck },
  { role: 'manager', label: 'Manager', description: 'Build the schedule, approve swaps', icon: Users },
  { role: 'staff', label: 'Staff', description: 'View shifts, request swaps', icon: UserRound },
]

export function Login() {
  const [role, setRole] = useState<Role>('manager')
  const login = useSessionStore((s) => s.login)
  const navigate = useNavigate()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    login(role)
    navigate(`/${role}`, { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center bg-ink px-6 py-12">
      <div className="mx-auto grid w-full max-w-4xl gap-10 md:grid-cols-2">
        <div className="flex flex-col justify-center gap-4 text-paper">
          {/* Paper chip behind the mark: its two dark bars are ink-colored, so they need a
              light backdrop for contrast against this dark panel. */}
          <span className="flex h-12 w-12 items-center justify-center rounded-sm bg-paper" aria-hidden="true">
            <img src={logo} alt="" className="h-8 w-auto" />
          </span>
          <h1 className="font-display text-display-xl leading-none">ShiftSync</h1>
          <p className="max-w-sm text-body-md text-slate-300">
            Scheduling for teams that run under real pressure — find coverage, resolve swaps, and see who's on now,
            in one glance.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-5 rounded-md bg-paper p-6 shadow-board"
          aria-label="Sign in"
        >
          <div>
            <h2 className="text-display-md font-display text-ink">Sign in</h2>
            <p className="text-body-sm text-slate-600">Pick a role to explore the demo as that user.</p>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-body-xs font-medium text-slate-600">Role</legend>
            {ROLE_OPTIONS.map((opt) => (
              <label
                key={opt.role}
                className={`flex cursor-pointer items-center gap-3 rounded-sm border p-3 transition-colors duration-100 ${
                  role === opt.role ? 'border-ink bg-slate-100' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value={opt.role}
                  checked={role === opt.role}
                  onChange={() => setRole(opt.role)}
                  className="sr-only"
                />
                <opt.icon size={18} className="shrink-0 text-ink" aria-hidden="true" />
                <span className="flex-1">
                  <span className="block text-body-sm font-medium text-ink">{opt.label}</span>
                  <span className="block text-body-xs text-slate-600">{opt.description}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <Input label="Email" type="email" placeholder="you@coastaleats.com" defaultValue="demo@coastaleats.com" />
          <Input label="Password" type="password" placeholder="••••••••" defaultValue="password" />

          <Button type="submit" variant="primary" className="w-full">
            Sign in as {ROLE_OPTIONS.find((o) => o.role === role)?.label}
          </Button>
          <p className="text-center text-body-xs text-slate-500">
            Demo only — authentication isn't wired up to anything real.
          </p>
        </form>
      </div>
    </div>
  )
}
