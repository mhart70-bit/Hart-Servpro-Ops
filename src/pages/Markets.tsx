import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCurrency } from '@/lib/utils'
import { BarChart2, Activity, DollarSign, Flag, Users, AlertTriangle } from 'lucide-react'
import { startOfMonth } from 'date-fns'

interface MarketStat {
  location_id: string
  location_name: string
  activities_mtd: number
  sales_mtd: number
  pipeline: number
  flagged: number
  rep_count: number
}

export default function Markets() {
  const { isOwner, isGM } = useAuth()
  const monthStart = startOfMonth(new Date()).toISOString()

  const { data: locations, isLoading: locLoading } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const { data, error } = await supabase.from('locations').select('*').order('name')
      if (error) throw error
      return data ?? []
    },
  })

  const { data: activityByLocation, isLoading: actLoading } = useQuery({
    queryKey: ['markets-activity', monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activities')
        .select('location_id')
        .gte('occurred_at', monthStart)
      if (error) throw error
      return data ?? []
    },
    enabled: isOwner || isGM,
  })

  const { data: dealsByLocation, isLoading: dealsLoading } = useQuery({
    queryKey: ['markets-deals', monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('location_id, deal_value, stage')
        .gte('created_at', monthStart)
      if (error) throw error
      return data ?? []
    },
    enabled: isOwner || isGM,
  })

  const { data: flaggedByLocation } = useQuery({
    queryKey: ['markets-flagged'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activities')
        .select('location_id')
        .eq('flagged', true)
      if (error) throw error
      return data ?? []
    },
    enabled: isOwner || isGM,
  })

  const { data: repsByLocation } = useQuery({
    queryKey: ['markets-reps'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('location_id')
        .eq('role', 'rep')
      if (error) throw error
      return data ?? []
    },
    enabled: isOwner || isGM,
  })

  if (!isOwner && !isGM) {
    return (
      <div className="p-6 lg:p-10 max-w-5xl mx-auto flex items-center justify-center min-h-64">
        <p className="text-sm text-muted-foreground">Markets view is available to managers only.</p>
      </div>
    )
  }

  const isLoading = locLoading || actLoading || dealsLoading

  const marketStats: MarketStat[] = (locations ?? []).map((loc: { id: string; name: string }) => {
    const acts = (activityByLocation ?? []).filter(a => a.location_id === loc.id)
    const deals = (dealsByLocation ?? []).filter(d => d.location_id === loc.id)
    const flagged = (flaggedByLocation ?? []).filter(f => f.location_id === loc.id)
    const reps = (repsByLocation ?? []).filter(r => r.location_id === loc.id)

    return {
      location_id: loc.id,
      location_name: loc.name,
      activities_mtd: acts.length,
      sales_mtd: deals.filter(d => d.stage === 'paid').reduce((s, d) => s + (d.deal_value ?? 0), 0),
      pipeline: deals.filter(d => !['paid', 'lost'].includes(d.stage)).reduce((s, d) => s + (d.deal_value ?? 0), 0),
      flagged: flagged.length,
      rep_count: reps.length,
    }
  })

  const totals = marketStats.reduce(
    (acc, m) => ({
      activities_mtd: acc.activities_mtd + m.activities_mtd,
      sales_mtd: acc.sales_mtd + m.sales_mtd,
      pipeline: acc.pipeline + m.pipeline,
      flagged: acc.flagged + m.flagged,
    }),
    { activities_mtd: 0, sales_mtd: 0, pipeline: 0, flagged: 0 }
  )

  const summaryTiles = [
    { label: 'Activity MTD', value: totals.activities_mtd, icon: Activity },
    { label: 'Sales MTD', value: formatCurrency(totals.sales_mtd), icon: DollarSign },
    { label: 'Pipeline', value: formatCurrency(totals.pipeline), icon: BarChart2 },
    { label: 'Flagged', value: totals.flagged, icon: Flag },
  ]

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="mb-10">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
          {isOwner ? 'OWNER VIEW' : 'GM VIEW'}
        </p>
        <h1 className="text-4xl font-serif font-semibold text-foreground">Markets</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-lg">
          All five Texas franchises — activity, pipeline, and field notes month to date.
        </p>
      </div>

      {/* Summary stat tiles */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {summaryTiles.map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest">{label}</span>
                <Icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="text-3xl font-serif font-semibold text-foreground">{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Per-market cards — 2-column grid */}
      {isLoading ? (
        <div className="grid lg:grid-cols-2 gap-5">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-48 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-5">
          {marketStats.map((m) => {
            const isActive = m.activities_mtd > 0
            const activityPct = totals.activities_mtd > 0
              ? Math.round((m.activities_mtd / totals.activities_mtd) * 100)
              : 0

            return (
              <div key={m.location_id} className="bg-card border border-border rounded-2xl p-6">
                {/* Card header */}
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <h2 className="text-xl font-serif font-semibold text-foreground">{m.location_name}</h2>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Users className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {m.rep_count} rep{m.rep_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {m.flagged > 0 && (
                      <span className="text-[10px] bg-destructive/10 text-destructive border border-destructive/20 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {m.flagged} flagged
                      </span>
                    )}
                    <span className={`text-[10px] border px-1.5 py-0.5 rounded-full ${
                      isActive
                        ? 'text-accent border-accent/40'
                        : 'text-muted-foreground border-border'
                    }`}>
                      {isActive ? 'Active' : 'Quiet'}
                    </span>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-4 mb-5">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Activity MTD</p>
                    <p className="text-2xl font-serif font-semibold text-foreground">{m.activities_mtd}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Sales MTD</p>
                    <p className="text-2xl font-serif font-semibold text-foreground">{formatCurrency(m.sales_mtd)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Pipeline</p>
                    <p className="text-2xl font-serif font-semibold text-foreground">{formatCurrency(m.pipeline)}</p>
                  </div>
                </div>

                {/* Activity share bar */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Share of activity</span>
                    <span className="text-[10px] text-muted-foreground">{activityPct}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-foreground/20 rounded-full transition-all duration-500"
                      style={{ width: `${activityPct}%` }}
                    />
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
