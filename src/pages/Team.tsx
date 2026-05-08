import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Users } from 'lucide-react'
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

  if (!isOwner && !isGM) return <Navigate to="/dashboard" replace />

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Users className="w-4 h-4 text-primary" />
          <span className="text-[10px] text-primary uppercase tracking-widest font-medium">Owner · Team</span>
        </div>
        <h1 className="text-3xl font-serif font-semibold text-foreground">Your team</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-lg">
          Assign each rep to one of your five Texas markets. Reps only see their own submissions and their own market's data.
        </p>
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
    </div>
  )
}
