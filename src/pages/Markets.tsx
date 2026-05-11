import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCurrency } from '@/lib/utils'
import { BarChart2, Activity, DollarSign, AlertTriangle, Flag, Users } from 'lucide-react'
import { startOfMonth } from 'date-fns'

interface MarketStat {
  location_id: string
  location_name: string
  activities_mtd: number
  sales_mtd: number
  pipeline: number
  high_urgency: number
  flagged: number
  rep_count: number
}

export default function Markets() {
  const { isOwner, isGM } = useAuth()
  const monthStart = startOfMonth(new Date()).toISOString()

  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const { data } = await supabase.from('locations').select('*').order('name')
      return data ?? []
    },
  })

  const { data: activityByLocation } = useQuery({
    queryKey: ['markets-activity', monthStart],
    queryFn: async () => {
      const { data } = await supabase
        .from('activities')
        .select('location_id')
        .gte('occurred_at', monthStart)
      return data ?? []
    },
    enabled: isOwner || isGM,
  })

  const { data: dealsByLocation } = useQuery({
    queryKey: ['markets-deals', monthStart],
    queryFn: async () => {
      const { data } = await supabase
        .from('deals')
        .select('location_id, deal_value, stage')
        .gte('created_at', monthStart)
      return data ?? []
    },
    enabled: isOwner || isGM,
  })

  const { data: flaggedByLocation } = useQuery({
    queryKey: ['markets-flagged'],
    queryFn: async () => {
      const { data } = await supabase
        .from('activities')
        .select('location_id')
        .eq('flagged', true)
      return data ?? []
    },
    enabled: isOwner || isGM,
  })

  const { data: repsByLocation } = useQuery({
    queryKey: ['markets-reps'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('location_id')
        .eq('role', 'rep')
      return data ?? []
    },
    enabled: isOwner || isGM,
  })

  if (!isOwner && !isGM) {
    return (
      <div className="p-4 lg:p-6 flex items-center justify-center min-h-64">
        <p className="text-sm text-muted-foreground">Markets view is available to managers only.</p>
      </div>
    )
  }

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
      pipeline: deals.filter(d => !['paid','lost'].includes(d.stage)).reduce((s, d) => s + (d.deal_value ?? 0), 0),
      high_urgency: 0,
      flagged: flagged.length,
      rep_count: reps.length,
    }
  })

  const totals = marketStats.reduce((acc, m) => ({
    activities_mtd: acc.activities_mtd + m.activities_mtd,
    sales_mtd: acc.sales_mtd + m.sales_mtd,
    pipeline: acc.pipeline + m.pipeline,
    flagged: acc.flagged + m.flagged,
  }), { activities_mtd: 0, sales_mtd: 0, pipeline: 0, flagged: 0 })

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-foreground">Markets</h1>
        <p className="text-sm text-muted-foreground mt-0.5">All five Texas franchises — month to date</p>
      </div>

      {/* Totals bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total activity', value: totals.activities_mtd, icon: Activity, accent: false },
          { label: 'Total sales MTD', value: formatCurrency(totals.sales_mtd), icon: DollarSign, accent: true },
          { label: 'Total pipeline', value: formatCurrency(totals.pipeline), icon: BarChart2, accent: false },
          { label: 'Flagged notes', value: totals.flagged, icon: Flag, accent: totals.flagged > 0 },
        ].map(({ label, value, icon: Icon, accent }) => (
          <div key={label} className={`bg-card border rounded-xl p-3 ${accent ? 'border-primary/30' : 'border-border'}`}>
            <div className="flex items-center gap-1.5 mb-1">
              <Icon className={`w-3.5 h-3.5 ${accent ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest">{label}</span>
            </div>
            <div className={`text-xl font-bold ${accent ? 'text-primary' : 'text-foreground'}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Per-market cards */}
      <div className="space-y-3">
        {marketStats.map((m) => (
          <div key={m.location_id} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">{m.location_name}</h2>
                <div className="flex items-center gap-1 mt-0.5">
                  <Users className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{m.rep_count} rep{m.rep_count !== 1 ? 's' : ''}</span>
                </div>
              </div>
              {m.flagged > 0 && (
                <span className="text-xs bg-amber-400/10 text-amber-400 border border-amber-400/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {m.flagged} flagged
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Activity MTD</div>
                <div className="text-lg font-bold text-foreground">{m.activities_mtd}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Sales MTD</div>
                <div className="text-lg font-bold text-foreground">{formatCurrency(m.sales_mtd)}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Pipeline</div>
                <div className="text-lg font-bold text-foreground">{formatCurrency(m.pipeline)}</div>
              </div>
            </div>

            {/* Activity bar */}
            {totals.activities_mtd > 0 && (
              <div className="mt-3">
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${Math.round((m.activities_mtd / Math.max(totals.activities_mtd, 1)) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {totals.activities_mtd > 0 ? Math.round((m.activities_mtd / totals.activities_mtd) * 100) : 0}% of total activity
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
