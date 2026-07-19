import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCurrency } from '@/lib/utils'
import { startOfWeek, endOfWeek, format, subDays } from 'date-fns'
import { CalendarDays, TrendingUp, Flag, AlertTriangle, Users, Clock } from 'lucide-react'

interface WeeklyActivity {
  rep_id: string | null
  location_id: string | null
  confidence_score: number | null
  flagged: boolean
  rep: { full_name: string | null } | null
  location: { name: string | null } | null
}

interface RepStat {
  repName: string
  locationName: string
  notes: number
  flagged: number
}

export default function WeeklySummary() {
  const { profile, isOwner, isGM } = useAuth()

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 })
  const weekLabel = `${format(weekStart, 'MMM d, yyyy')} – ${format(weekEnd, 'MMM d, yyyy')}`

  const { data: activities, isLoading } = useQuery({
    queryKey: ['weekly', weekStart.toISOString(), profile?.id, isOwner],
    queryFn: async () => {
      let q = supabase
        .from('activities')
        .select('rep_id, location_id, confidence_score, flagged, rep:profiles(full_name), location:locations(name)')
        .gte('occurred_at', weekStart.toISOString())
        .lte('occurred_at', weekEnd.toISOString())

      if (!isOwner && !isGM && profile?.id) q = q.eq('rep_id', profile.id)
      else if (isGM && profile?.location_id) q = q.eq('location_id', profile.location_id)

      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as WeeklyActivity[]
    },
    enabled: !!profile,
  })

  const deals = useQuery({
    queryKey: ['weekly-deals', weekStart.toISOString(), profile?.id],
    queryFn: async () => {
      let q = supabase
        .from('deals')
        .select('deal_value, stage, rep_id, location_id, location:locations(name), rep:profiles(full_name)')
        .gte('created_at', weekStart.toISOString())
      if (!isOwner && !isGM && profile?.id) q = q.eq('rep_id', profile.id)
      else if (isGM && profile?.location_id) q = q.eq('location_id', profile.location_id)
      const { data } = await q
      return data ?? []
    },
    enabled: !!profile,
  })

  // Accountability: all reps in scope
  const { data: allReps } = useQuery({
    queryKey: ['weekly-reps', profile?.location_id, isOwner, isGM],
    queryFn: async () => {
      let q = supabase.from('profiles').select('id, full_name, location_id, location:locations(name)').eq('role', 'rep')
      if (isGM && profile?.location_id) q = q.eq('location_id', profile.location_id)
      const { data } = await q
      return data ?? []
    },
    enabled: !!(isOwner || isGM),
  })

  // Accountability: contacts with no follow-up date set, due this week or overdue
  const { data: missingFollowUps } = useQuery({
    queryKey: ['weekly-missing-followups', weekEnd.toISOString()],
    queryFn: async () => {
      let q = supabase
        .from('contacts')
        .select('id, first_name, last_name, company, assigned_rep:profiles(full_name)')
        .eq('is_active', true)
        .is('follow_up_date', null)
        .lte('next_visit_due_at', weekEnd.toISOString())
      if (isGM && profile?.location_id) q = q.eq('location_id', profile.location_id)
      const { data } = await q
      return (data ?? []).map((r: { id: unknown; first_name: unknown; last_name: unknown; company: unknown; assigned_rep: unknown }) => ({
        ...r,
        assigned_rep: Array.isArray(r.assigned_rep) ? (r.assigned_rep[0] ?? null) : r.assigned_rep,
      })) as { id: string; first_name: string | null; last_name: string | null; company: string | null; assigned_rep: { full_name: string | null } | null }[]
    },
    enabled: !!(isOwner || isGM),
  })

  // Accountability: ERPs stuck at verbal_commitment for 30+ days
  // (stable per mount — a per-render value in the query key refetches forever)
  const staleErpDate = useMemo(() => subDays(new Date(), 30).toISOString(), [])
  const { data: staleErps } = useQuery({
    queryKey: ['weekly-stale-erps', staleErpDate],
    queryFn: async () => {
      let q = supabase
        .from('contacts')
        .select('id, first_name, last_name, company, updated_at, assigned_rep:profiles(full_name)')
        .eq('is_active', true)
        .eq('erp_status', 'verbal_commitment')
        .lte('updated_at', staleErpDate)
      if (isGM && profile?.location_id) q = q.eq('location_id', profile.location_id)
      const { data } = await q
      return (data ?? []).map((r: { id: unknown; first_name: unknown; last_name: unknown; company: unknown; updated_at: unknown; assigned_rep: unknown }) => ({
        ...r,
        assigned_rep: Array.isArray(r.assigned_rep) ? (r.assigned_rep[0] ?? null) : r.assigned_rep,
      })) as { id: string; first_name: string | null; last_name: string | null; company: string | null; updated_at: string; assigned_rep: { full_name: string | null } | null }[]
    },
    enabled: !!(isOwner || isGM),
  })

  const totalNotes = (activities ?? []).length
  const totalFlagged = (activities ?? []).filter(a => a.flagged).length
  const totalPipeline = (deals.data ?? [])
    .filter(d => !['paid', 'lost'].includes(d.stage))
    .reduce((s, d) => s + (d.deal_value ?? 0), 0)

  // Group by rep
  const repMap = new Map<string, RepStat>()
  for (const a of activities ?? []) {
    const key = a.rep_id ?? 'unassigned'
    if (!repMap.has(key)) {
      repMap.set(key, {
        repName: a.rep?.full_name ?? 'Unassigned',
        locationName: a.location?.name ?? '—',
        notes: 0,
        flagged: 0,
      })
    }
    const stat = repMap.get(key)!
    stat.notes++
    if (a.flagged) stat.flagged++
  }
  const repStats = Array.from(repMap.values()).sort((a, b) => b.notes - a.notes)

  // Zero-note reps: reps in scope with no activity this week
  const activeRepIds = new Set((activities ?? []).map(a => a.rep_id).filter(Boolean))
  const zeroNoteReps = (allReps ?? []).filter(r => !activeRepIds.has(r.id))

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <CalendarDays className="w-4 h-4 text-primary" />
          <span className="text-[10px] text-primary uppercase tracking-widest font-medium">This week</span>
        </div>
        <h1 className="text-3xl font-serif font-semibold text-foreground">Weekly summary</h1>
        <p className="text-sm text-muted-foreground mt-1">{weekLabel}</p>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">Notes this week</p>
          <p className="text-2xl font-serif font-semibold text-foreground">{totalNotes}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp className="w-3.5 h-3.5 text-primary" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Pipeline</p>
          </div>
          <p className="text-2xl font-serif font-semibold text-primary">{formatCurrency(totalPipeline)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Flag className={`w-3.5 h-3.5 ${totalFlagged > 0 ? 'text-primary' : 'text-muted-foreground'}`} />
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Flagged</p>
          </div>
          <p className={`text-2xl font-serif font-semibold ${totalFlagged > 0 ? 'text-primary' : 'text-foreground'}`}>
            {totalFlagged}
          </p>
        </div>
      </div>

      {/* Per-rep breakdown */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-card border border-border rounded-xl animate-pulse" />)}
        </div>
      ) : repStats.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center mb-6">
          <h3 className="text-base font-serif text-foreground mb-1">Nothing logged yet this week</h3>
          <p className="text-sm text-muted-foreground">
            Once the team submits notes, you'll see activity by market and rep here.
          </p>
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {repStats.map((stat, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">
                    {stat.locationName}
                  </p>
                  <h3 className="text-lg font-serif font-medium text-foreground">{stat.repName}</h3>
                </div>
                {stat.flagged > 0 && (
                  <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">
                    {stat.flagged} flagged
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Notes</p>
                  <p className="text-xl font-serif font-semibold text-foreground">{stat.notes}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Flagged</p>
                  <p className={`text-xl font-serif font-semibold ${stat.flagged > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                    {stat.flagged}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Accountability section (owner/GM only) ─────────── */}
      {(isOwner || isGM) && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-medium text-foreground uppercase tracking-widest">Accountability</h2>
          </div>

          {/* Zero-note reps */}
          {zeroNoteReps.length > 0 && (
            <div className="bg-card border border-amber-400/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-3.5 h-3.5 text-amber-400" />
                <p className="text-xs font-medium text-amber-400 uppercase tracking-widest">
                  {zeroNoteReps.length} rep{zeroNoteReps.length !== 1 ? 's' : ''} — zero notes this week
                </p>
              </div>
              <div className="space-y-1.5">
                {zeroNoteReps.map((rep) => {
                  const loc = rep.location
                  const locName = Array.isArray(loc) ? (loc[0]?.name ?? '—') : (loc as { name: string | null } | null)?.name ?? '—'
                  return (
                  <div key={rep.id} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{rep.full_name ?? 'Unknown'}</span>
                    <span className="text-xs text-muted-foreground">
                      {locName}
                    </span>
                  </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Stale ERPs — verbal 30+ days */}
          {(staleErps ?? []).length > 0 && (
            <div className="bg-card border border-amber-400/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <p className="text-xs font-medium text-amber-400 uppercase tracking-widest">
                  {staleErps!.length} ERP{staleErps!.length !== 1 ? 's' : ''} stuck at verbal 30+ days
                </p>
              </div>
              <div className="space-y-1.5">
                {staleErps!.map(c => (
                  <div key={c.id} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">
                      {[c.first_name, c.last_name].filter(Boolean).join(' ') || c.company || 'Unknown'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {c.assigned_rep?.full_name ?? '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contacts missing follow-up dates */}
          {(missingFollowUps ?? []).length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Flag className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                  {missingFollowUps!.length} overdue contacts with no follow-up set
                </p>
              </div>
              <div className="space-y-1.5">
                {missingFollowUps!.slice(0, 5).map(c => (
                  <div key={c.id} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {[c.first_name, c.last_name].filter(Boolean).join(' ') || c.company || 'Unknown'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {c.assigned_rep?.full_name ?? '—'}
                    </span>
                  </div>
                ))}
                {missingFollowUps!.length > 5 && (
                  <p className="text-xs text-muted-foreground">
                    +{missingFollowUps!.length - 5} more
                  </p>
                )}
              </div>
            </div>
          )}

          {/* All clear */}
          {zeroNoteReps.length === 0 && (staleErps ?? []).length === 0 && (missingFollowUps ?? []).length === 0 && (
            <div className="bg-card border border-border rounded-xl p-6 text-center">
              <p className="text-sm text-muted-foreground">No accountability flags this week.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
