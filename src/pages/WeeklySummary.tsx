import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCurrency } from '@/lib/utils'
import { startOfWeek, endOfWeek, format } from 'date-fns'
import { CalendarDays, TrendingUp, Flag } from 'lucide-react'

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
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Pipeline logged</p>
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
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <h3 className="text-base font-serif text-foreground mb-1">Nothing logged yet this week</h3>
          <p className="text-sm text-muted-foreground">
            Once the team submits notes, you'll see activity by market and by rep here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
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
    </div>
  )
}
