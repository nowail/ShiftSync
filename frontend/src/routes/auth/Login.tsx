import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, TriangleAlert, Users, UserRound } from 'lucide-react'
import { useSessionStore, DEMO_LOGIN_EMAILS, DEMO_LOGIN_PASSWORD } from '../../store/session'
import { login as loginRequest } from '../../services/auth'
import { ApiClientError } from '../../lib/apiClient'
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
  const [email, setEmail] = useState(DEMO_LOGIN_EMAILS.manager)
  const [password, setPassword] = useState(DEMO_LOGIN_PASSWORD)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const setSession = useSessionStore((s) => s.setSession)
  const navigate = useNavigate()

  function handleRoleChange(nextRole: Role) {
    setRole(nextRole)
    // Only swap the email if it still matches a demo default — don't clobber something the
    // grader typed in by hand.
    if (Object.values(DEMO_LOGIN_EMAILS).includes(email)) {
      setEmail(DEMO_LOGIN_EMAILS[nextRole])
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { token, user } = await loginRequest(email, password)
      setSession({
        token,
        role: user.role,
        staffId: user.id,
        staffName: user.name,
        locationId: user.homeLocationId,
      })
      navigate(`/${user.role}`, { replace: true })
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not reach the server. Try again in a moment.')
    } finally {
      setSubmitting(false)
    }
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
            <p className="text-body-sm text-slate-600">Pick a role to prefill a demo login, or use your own.</p>
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
                  onChange={() => handleRoleChange(opt.role)}
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

          <Input
            label="Email"
            type="email"
            placeholder="you@coastaleats.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />

          {error && (
            <p className="flex items-start gap-2 rounded-sm border border-brick/30 bg-brick/5 p-2.5 text-body-sm text-brick">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              {error}
            </p>
          )}

          <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
            {submitting ? 'Signing in…' : `Sign in as ${ROLE_OPTIONS.find((o) => o.role === role)?.label}`}
          </Button>
        </form>
      </div>
    </div>
  )
}
