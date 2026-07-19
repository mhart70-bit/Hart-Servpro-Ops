import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resetMode, setResetMode] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) {
      setError('Invalid email or password. Contact your manager if you need access.')
      setLoading(false)
    } else {
      navigate('/dashboard')
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email) {
      setError('Enter your email above first.')
      return
    }
    setResetLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setResetLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setResetSent(true)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mb-3">
            <span className="text-primary-foreground text-xl font-bold">H</span>
          </div>
          <h1 className="text-2xl font-serif font-semibold text-foreground">Hart SERVPRO</h1>
          <p className="text-sm text-muted-foreground mt-1">Sales CRM</p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-serif font-semibold text-foreground mb-4">Sign in</h2>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                placeholder="you@hartservpro.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>

            <div className="pt-1 text-right">
              {!resetMode ? (
                <button
                  type="button"
                  onClick={() => { setResetMode(true); setError(null) }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Forgot password?
                </button>
              ) : resetSent ? (
                <p className="text-xs text-emerald-700">
                  Check {email} for a reset link.
                </p>
              ) : (
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={resetLoading}
                    className="text-xs text-primary hover:underline disabled:opacity-50"
                  >
                    {resetLoading ? 'Sending…' : `Send reset link to ${email || 'your email'}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetMode(false)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    cancel
                  </button>
                </div>
              )}
            </div>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Need access? Contact Mark Hart.
        </p>
      </div>
    </div>
  )
}
