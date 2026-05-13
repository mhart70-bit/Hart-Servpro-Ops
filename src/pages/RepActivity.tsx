import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatRelative, cn } from '@/lib/utils'
import { Users, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { startOfDay, startOfWeek, startOfMonth } from 'date-fns'
import { useState } from 'react'

interface RepRow {
  id: string
  full_name: string | null
  location: string
  today: number
  thisWeek: number
  thisMonth: number
  contactsTouched: number
  overdueTasks: number
  lastActive: string | null
}

export default function RepActivity() {
  const { profile, isOwner, isGM } = useAuth()
  const [expandedRep, setExpandedRep] = useState<string | null>(null)

  const now = new Date()
  const todayStart = startOfDay(now).toISOString()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }).toISOString()
  const monthStart = startOfMonth(now).toISOString()

  // All reps in scope
  const { data: reps, isLoading: loadingReps } = useQuery({
    queryKey: ['rep-activity-reps', profile?.location_id, isOwner],
    queryFn: async () => {
      let q = supabase
        .from('profiles')
        .select('id, full_name, location_id, location:locations(name)')
        .eq('role', 'rep')
      if (isGM && profile?.location_id) q = q.eq('location_id', profile.location_id)
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
    enabled: !!(isOwner || isGM),
  })

  // All activities this month in scope
  const { data: activities, isLoading: loadingActivities } = useQuery({
    queryKey: ['rep-activity-acts', monthStart, profile?.location_id, isOwner],
    queryFn: async () => {
      let q = supabase
        .from('activities')
        .select('rep_id, contact_id, occurred_at')
        .gte('occurred_at', monthStart)
      if (isGM && profile?.location_id) q = q.eq('location_id', profile.location_id)
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
    enabled: !!(isOwner || isGM),
  })

  // All-time last activity per rep (for reps with no activity this month)
  const { data: lastActivities } = useQuery({
    queryKey: ['rep-activity-last', (reps ?? []).map(r => r.id).join(',')],
    queryFn: async () => {
      if (!reps || reps.length === 0) return []
      const results = await Promise.all(
        reps.map(async (rep) => {
          const { data } = await supabase
            .from('activities')
            .select('occurred_at')
            .eq('rep_id', rep.id)
            .order('occurred_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          return { repId: rep.id, lastActivity: data?.occurred_at ?? null }
        })
      )
      return results
    },
    enabled: !!(reps && reps.length > 0),
  })

  // Overdue contacts per rep
  const { data: overdueByRep } = useQuery({
    queryKey: ['rep-activity-overdue', profile?.location_id, isOwner],
    queryFn: async () => {
      let q = supabase
        .from('contacts')
        .select('assigned_rep_id')
        .eq('is_active', true)
        .lt('next_visit_due_at', new Date().toISOString())
      if (isGM && profile?.location_id) q = q.eq('location_id', profile.location_id)
      const { data, error } = await q
      if (error) throw error
      const map = new Map<string, number>()
      for (const c of data ?? []) {
        if (!c.assigned_rep_id) continue
        map.set(c.assigned_rep_id, (map.get(c.assigned_rep_id) ?? 0) + 1)
      }
      return map
    },
    enabled: !!(isOwner || isGM),
  })

  const isLoading = loadingReps || loadingActivities

  // Build rep rows
  const lastActMap = new Map((lastActivities ?? []).map(l => [l.repId, l.lastActivity]))

  const rows: RepRow[] = (reps ?? []).map(rep => {
    const loc = rep.location
    const locationName = Array.isArray(loc)
      ? (loc[0] as { name: string | null } | null)?.name ?? '—'
      : (loc as { name: string | null } | null)?.name ?? '—'

    const repActs = (activities ?? []).filter(a => a.rep_id === rep.id)
    const today = repActs.filter(a => a.occurred_at >= todayStart).length
    const thisWeek = repActs.filter(a => a.occurred_at >= weekStart).length
    const thisMonth = repActs.length

    // Unique contacts touched this week
    const weekActs = repActs.filter(a => a.occurred_at >= weekStart)
    const contactsTouched = new Set(weekActs.map(a => a.contact_id).filter(Boolean)).size

    const overdueTasks = overdueByRep?.get(rep.id) ?? 0

    // Last activity: from monthly data or fallback to all-time
    const lastInMonth = repActs.length > 0
      ? repActs.reduce((latest, a) => a.occurred_at > latest ? a.occurred_at : latest, repActs[0].occurred_at)
      : null
    const lastActive = lastInMonth ?? lastActMap.get(rep.id) ?? null

    return {
      id: rep.id,
      full_name: rep.full_name,
      location: locationName,
      today,
      thisWeek,
      thisMonth,
      contactsTouched,
      overdueTasks,
      lastActive,
    }
  }).sort((a, b) => a.thisWeek - b.thisWeek) // least active first

  // Expanded rep last 10 activities
  const { data: expandedActs } = useQuery({
    queryKey: ['rep-expanded-acts', expandedRep],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activities')
        .select('id, type, outcome, notes, occurred_at, contact:contacts(first_name, last_name, company)')
        .eq('rep_id', expandedRep!)
        .order('occurred_at', { ascending: false })
        .limit(10)
      if (error) throw error
      return data ?? []
    },
    enabled: !!expandedRep,
  })

  if (!isOwner && !isGM) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-sm text-muted-foreground">Access restricted to managers.</p>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Users className="w-4 h-4 text-primary" />
          <span className="text-[10px] text-primary uppercase tracking-widest font-medium">Accountability</span>
        </div>
        <h1 className="text-3xl font-serif font-semibold text-foreground">Rep Activity</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sorted by least active this week first
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-card border border-border rounded-xl animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
          No reps found.
        </div>
      ) : (
        <>
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-3 px-4 py-2 text-[10px] text-muted-foreground uppercase tracking-widest">
            <span>Rep / Location</span>
            <span className="text-right w-14">Today</span>
            <span className="text-right w-16">This Wk</span>
            <span className="text-right w-16">This Mo</span>
            <span className="text-right w-20">Contacts</span>
            <span className="text-right w-16">Overdue</span>
            <span className="text-right w-24">Last Active</span>
          </div>

          <div className="space-y-1.5">
            {rows.map(rep => {
              const isInactive = !rep.lastActive || new Date(rep.lastActive) < new Date(Date.now() - 3 * 86400000)
              const isExpanded = expandedRep === rep.id

              return (
                <div key={rep.id} className="bg-card border border-border rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedRep(isExpanded ? null : rep.id)}
                    className={cn(
                      'w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors',
                      isInactive && 'border-l-2 border-l-destructive'
                    )}
                  >
                    {/* Mobile layout */}
                    <div className="md:hidden">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">{rep.full_name ?? 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{rep.location}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Last active</p>
                          <p className={cn(
                            'text-xs font-medium',
                            isInactive ? 'text-destructive' : 'text-foreground'
                          )}>
                            {rep.lastActive ? formatRelative(rep.lastActive) : 'Never'}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div>
                          <p className="text-[9px] text-muted-foreground uppercase">Today</p>
                          <p className="text-sm font-semibold text-foreground">{rep.today}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground uppercase">Week</p>
                          <p className="text-sm font-semibold text-foreground">{rep.thisWeek}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground uppercase">Month</p>
                          <p className="text-sm font-semibold text-foreground">{rep.thisMonth}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground uppercase">Overdue</p>
                          <p className={cn(
                            'text-sm font-semibold',
                            rep.overdueTasks > 0 ? 'text-amber-400' : 'text-muted-foreground'
                          )}>{rep.overdueTasks}</p>
                        </div>
                      </div>
                    </div>

                    {/* Desktop layout */}
                    <div className="hidden md:grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-3 items-center">
                      <div>
                        <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                          {rep.full_name ?? 'Unknown'}
                          {isInactive && <AlertCircle className="w-3.5 h-3.5 text-destructive" />}
                        </p>
                        <p className="text-xs text-muted-foreground">{rep.location}</p>
                      </div>
                      <p className="text-sm text-center w-14 font-semibold text-foreground">{rep.today}</p>
                      <p className={cn(
                        'text-sm text-center w-16 font-semibold',
                        rep.thisWeek === 0 ? 'text-destructive' : 'text-foreground'
                      )}>{rep.thisWeek}</p>
                      <p className="text-sm text-center w-16 font-semibold text-foreground">{rep.thisMonth}</p>
                      <p className="text-sm text-center w-20 text-muted-foreground">{rep.contactsTouched}</p>
                      <p className={cn(
                        'text-sm text-center w-16 font-semibold',
                        rep.overdueTasks > 0 ? 'text-amber-400' : 'text-muted-foreground'
                      )}>{rep.overdueTasks}</p>
                      <div className="w-24 text-right">
                        <p className={cn(
                          'text-xs font-medium',
                          isInactive ? 'text-destructive' : 'text-muted-foreground'
                        )}>
                          {rep.lastActive ? formatRelative(rep.lastActive) : 'Never'}
                        </p>
                      </div>
                      <div className="flex items-center justify-end text-muted-foreground">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </button>

                  {/* Expanded: last 10 activities */}
                  {isExpanded && (
                    <div className="border-t border-border px-4 py-3 bg-muted/20">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">Last 10 activities</p>
                      {!expandedActs || expandedActs.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No activities logged.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {expandedActs.map((act) => {
                            type ContactRow = { first_name: string | null; last_name: string | null; company: string | null }
                            const rawContact = act.contact as ContactRow | ContactRow[] | null
                            const contactRow: ContactRow | null = Array.isArray(rawContact) ? (rawContact[0] ?? null) : rawContact
                            const contactName = contactRow
                              ? ([contactRow.first_name, contactRow.last_name].filter(Boolean).join(' ') || contactRow.company || '—')
                              : '—'
                            return (
                              <div key={act.id} className="flex items-start justify-between gap-2 text-xs">
                                <div className="flex-1 min-w-0">
                                  <span className="capitalize text-foreground font-medium">{act.type.replace('_', ' ')}</span>
                                  {' · '}
                                  <span className="text-muted-foreground">{contactName}</span>
                                  {act.outcome && (
                                    <span className="text-muted-foreground"> — {act.outcome}</span>
                                  )}
                                </div>
                                <span className="text-muted-foreground flex-shrink-0">
                                  {formatRelative(act.occurred_at)}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
