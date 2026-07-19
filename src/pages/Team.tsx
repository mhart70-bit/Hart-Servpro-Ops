import { useState, type FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Users, UserPlus, X } from 'lucide-react'
import { Navigate } from 'react-router-dom'

interface TeamMember {
  id: string
  full_name: string | null
  email: string | null
  role: string
  location_id: string | null
  location: { name: string | null } | null
}

interface Location {
  id: string
  name: string
}

export default function Team() {
  const { isOwner, isGM, profile } = useAuth()
  const queryClient = useQueryClient()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<'rep' | 'gm' | 'owner'>('rep')
  const [inviteLocation, setInviteLocation] = useState<string>('')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteResult, setInviteResult] = useState<string | null>(null)

  function resetInviteForm() {
    setInviteEmail(''); setInviteName(''); setInviteRole('rep')
    setInviteLocation(''); setInviteError(null); setInviteResult(null)
  }

  function genRandomPassword() {
    const bytes = new Uint8Array(18)
    crypto.getRandomValues(bytes)
    return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '').slice(0, 20) + 'A1!'
  }

  const { data: members, isLoading } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      let q = supabase
        .from('profiles')
        .select('*, location:locations(name)')
        .order('full_name')
      // GMs only see their own location's reps
      if (isGM && !isOwner && profile?.location_id) {
        q = q.or(`location_id.eq.${profile.location_id},id.eq.${profile.id}`)
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as TeamMember[]
    },
    enabled: isOwner || isGM,
  })

  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const { data } = await supabase.from('locations').select('*').order('name')
      return (data ?? []) as Location[]
    },
  })

  const assignMarket = useMutation({
    mutationFn: async ({ memberId, locationId }: { memberId: string; locationId: string | null }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ location_id: locationId || null })
        .eq('id', memberId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team-members'] }),
  })

  const setRole = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ role })
        .eq('id', memberId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team-members'] }),
  })

  const inviteRep = useMutation({
    mutationFn: async () => {
      const email = inviteEmail.trim().toLowerCase()
      const fullName = inviteName.trim()
      if (!email || !fullName) throw new Error('Email and name are required.')
      if (isGM && !isOwner && inviteRole !== 'rep') {
        throw new Error('GMs can only invite reps.')
      }

      const tempPassword = genRandomPassword()
      const { data, error: signUpErr } = await supabase.auth.signUp({
        email,
        password: tempPassword,
        options: {
          data: { full_name: fullName, role: inviteRole },
          emailRedirectTo: `${window.location.origin}/reset-password`,
        },
      })
      if (signUpErr) throw signUpErr
      const newUserId = data.user?.id
      if (!newUserId) throw new Error('Sign-up did not return a user id.')

      // Set the location (the auto-trigger doesn't know about it).
      // The trigger sets role from metadata, but we patch it too to be safe in case it was disabled.
      const locId = inviteLocation || (isGM && !isOwner ? profile?.location_id ?? null : null)
      const { error: patchErr } = await supabase
        .from('profiles')
        .update({ location_id: locId, role: inviteRole, full_name: fullName })
        .eq('id', newUserId)
      if (patchErr) throw patchErr

      // Send a password-reset email so the new rep picks their own password.
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (resetErr) throw resetErr

      return email
    },
    onSuccess: (email) => {
      setInviteResult(`Invite sent to ${email}. They'll receive an email to set their password.`)
      setInviteError(null)
      queryClient.invalidateQueries({ queryKey: ['team-members'] })
    },
    onError: (err: Error) => {
      setInviteResult(null)
      setInviteError(err.message || 'Could not send invite.')
    },
  })

  function submitInvite(e: FormEvent) {
    e.preventDefault()
    inviteRep.mutate()
  }

  if (!isOwner && !isGM) return <Navigate to="/dashboard" replace />

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-primary" />
            <span className="text-[10px] text-primary uppercase tracking-widest font-medium">Owner · Team</span>
          </div>
          <h1 className="text-3xl font-serif font-semibold text-foreground">Your team</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-lg">
            Assign each rep to one of your five Texas markets. Reps only see their own submissions and their own market's data.
          </p>
        </div>
        <button
          onClick={() => { resetInviteForm(); setInviteOpen(true) }}
          className="inline-flex items-center gap-2 px-3 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-lg transition-colors flex-shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          Invite rep
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-card border border-border rounded-xl animate-pulse" />)}
        </div>
      ) : (members ?? []).length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <p className="text-sm text-muted-foreground">No team members yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(members ?? []).map(member => {
            const isOwnerMember = member.role === 'owner'
            const canEdit = !isOwnerMember || isOwner

            return (
              <div key={member.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-base font-serif font-medium text-foreground">
                        {member.full_name ?? member.email ?? `User #${member.id.slice(0, 6)}`}
                      </span>
                      {isOwnerMember && (
                        <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded">Owner</span>
                      )}
                    </div>
                    {member.email && (
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Market selector */}
                    <select
                      value={member.location_id ?? ''}
                      disabled={!canEdit || assignMarket.isPending}
                      onChange={e => assignMarket.mutate({ memberId: member.id, locationId: e.target.value || null })}
                      className="px-2 py-1.5 bg-muted border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 w-36"
                    >
                      <option value="">Unassigned</option>
                      {(locations ?? []).map(loc => (
                        <option key={loc.id} value={loc.id}>{loc.name}</option>
                      ))}
                    </select>

                    {/* Role selector */}
                    {isOwner && (
                      <select
                        value={member.role}
                        disabled={setRole.isPending}
                        onChange={e => setRole.mutate({ memberId: member.id, role: e.target.value })}
                        className="px-2 py-1.5 bg-muted border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 w-28"
                      >
                        <option value="rep">Rep</option>
                        <option value="gm">GM</option>
                        <option value="owner">Owner</option>
                      </select>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Invite modal */}
      {inviteOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4" onClick={() => setInviteOpen(false)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-serif font-semibold text-foreground">Invite a new team member</h2>
              <button onClick={() => setInviteOpen(false)} className="p-1 rounded-md hover:bg-muted transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {inviteResult ? (
              <div className="space-y-3">
                <div className="px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  <p className="text-xs text-emerald-700">{inviteResult}</p>
                </div>
                <button
                  onClick={() => { resetInviteForm() }}
                  className="w-full py-2 bg-muted hover:bg-muted/80 text-foreground text-sm font-medium rounded-lg transition-colors"
                >
                  Invite another
                </button>
              </div>
            ) : (
              <form onSubmit={submitInvite} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Full name</label>
                  <input
                    type="text"
                    value={inviteName}
                    onChange={e => setInviteName(e.target.value)}
                    required
                    placeholder="Jane Doe"
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Email</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    required
                    placeholder="jane@hartservpro.com"
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Role</label>
                    <select
                      value={inviteRole}
                      onChange={e => setInviteRole(e.target.value as 'rep' | 'gm' | 'owner')}
                      className="w-full px-2 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="rep">Rep</option>
                      {isOwner && <option value="gm">GM</option>}
                      {isOwner && <option value="owner">Owner</option>}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Market</label>
                    <select
                      value={inviteLocation}
                      onChange={e => setInviteLocation(e.target.value)}
                      className="w-full px-2 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="">Unassigned</option>
                      {(locations ?? []).map(loc => (
                        <option key={loc.id} value={loc.id}>{loc.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  We'll email them a link to set their own password and sign in.
                </p>

                {inviteError && (
                  <div className="px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <p className="text-xs text-destructive">{inviteError}</p>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setInviteOpen(false)}
                    className="flex-1 py-2 bg-muted hover:bg-muted/80 text-foreground text-sm font-medium rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviteRep.isPending}
                    className="flex-1 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-medium rounded-lg transition-colors"
                  >
                    {inviteRep.isPending ? 'Sending…' : 'Send invite'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
