import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCurrency, formatRelative } from '@/lib/utils'
import {
  Activity,
  TrendingUp,
  AlertTriangle,
  Phone,
  MapPin,
  DollarSign,
  Flag,
  Calendar,
} from 'lucide-react'
import { format, startOfMonth, startOfWeek, startOfDay } from 'date-fns'

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  accent?: boolean
}) {
  return (
    <div className={`bg-card border rounded-xl p-4 flex items-start gap-3 ${accent ? 'border-primary/30' : 'border-border'}`}>
      <div className={`p-2 rounded-lg flex-shrink-0 ${accent ? 'bg-primary/10' : 'bg-muted'}`}>
        <Icon className={`w-4 h-4 ${accent ? 'text-primary' : 'text-muted-foreground'}`} />
      </div>
      <div className="min-w-0">
        <div className={`text-2xl font-bold ${accent ? 'text-primary' : 'text-foreground'}`}>{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
        {sub && <div className="text-xs text-muted-foreground/70 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

interface RecentActivity {
  id: string
  type: string
  notes: string | null
  occurred_at: string
  contact: { first_name: string | null; last_name: string | null; company: string | null } | null
  rep: { full_name: string | null } | null
}

export default function Dashboard() {
  const { profile, isOwner, isGM } = useAuth()
  const now = new Date()
  const monthStart = startOfMonth(now).toISOString()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }).toISOString()
  const dayStart = startOfDay(now).toISOString()

  const baseFilter = isOwner || isGM ? {} : { rep_id: profile?.id }

  // Activity counts
  const { data: activityStats } = useQuery({
    queryKey: ['dashboard-activity', profile?.id, isOwner],
    queryFn: async () => {
      let q = supabase.from('activities').select('id, occurred_at, type', { count: 'exact' })
      if (!isOwner && !isGM && profile?.id) q = q.eq('rep_id', profile.id)

      const [today, week, month] = await Promise.all([
        q.gte('occurred_at', dayStart),
        q.gte('occurred_at', weekStart),
        q.gte('occurred_at', monthStart),
      ])
      return {
        today: today.count ?? 0,
        week: week.count ?? 0,
        month: month.count ?? 0,
      }
    },
    enabled: !!profile,
  })

  // Sales MTD
  const { data: salesStats } = useQuery({
    queryKey: ['dashboard-sales', profile?.id, isOwner],
    queryFn: async () => {
      let q = supabase.from('deals').select('deal_value, stage')
      if (!isOwner && !isGM && profile?.id) q = q.eq('rep_id', profile.id)

      const { data } = await q.gte('created_at', monthStart)
      const paid = (data ?? []).filter((d) => d.stage === 'paid').reduce((s, d) => s + (d.deal_value ?? 0), 0)
      const pipeline = (data ?? []).filter((d) => d.stage !== 'lost').reduce((s, d) => s + (d.deal_value ?? 0), 0)
      return { paid, pipeline }
    },
    enabled: !!profile,
  })

  // Flagged count
  const { data: flaggedCount } = useQuery({
    queryKey: ['dashboard-flagged', profile?.id, isOwner],
    queryFn: async () => {
      let q = supabase.from('activities').select('id', { count: 'exact' }).eq('flagged', true)
      if (!isOwner && !isGM && profile?.id) q = q.eq('rep_id', profile.id)
      const { count } = await q
      return count ?? 0
    },
    enabled: !!profile,
  })

  // Recent activity feed
  const { data: recentActivity } = useQuery({
    queryKey: ['dashboard-recent', profile?.id, isOwner],
    queryFn: async () => {
      let q = supabase
        .from('activities')
        .select('id, type, notes, occurred_at, contact:contacts(first_name, last_name, company), rep:profiles(full_name)')
        .order('occurred_at', { ascending: false })
        .limit(8)
      if (!isOwner && !isGM && profile?.id) q = q.eq('rep_id', profile.id)
      const { data } = await q
      return (data ?? []) as RecentActivity[]
    },
    enabled: !!profile,
  })

  // Overdue follow-ups
  const { data: overdueCount } = useQuery({
    queryKey: ['dashboard-overdue', profile?.id],
    queryFn: async () => {
      let q = supabase
        .from('contacts')
        .select('id', { count: 'exact' })
        .lt('next_visit_due_at', now.toISOString())
        .eq('is_active', true)
      if (!isOwner && !isGM && profile?.id) q = q.eq('assigned_rep_id', profile.id)
      const { count } = await q
      return count ?? 0
    },
    enabled: !!profile,
  })

  const greeting = (() => {
    const h = now.getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">
          {greeting}{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {format(now, 'EEEE, MMMM d')} · {isOwner ? 'All markets' : profile?.location?.name ?? 'Your market'}
        </p>
      </div>

      {/* Activity stats */}
      <div className="mb-2">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Activity</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Touches today" value={activityStats?.today ?? 0} icon={Activity} accent={true} />
          <StatCard label="This week" value={activityStats?.week ?? 0} icon={Calendar} />
          <StatCard label="This month" value={activityStats?.month ?? 0} icon={Phone} />
          <StatCard
            label="Overdue visits"
            value={overdueCount ?? 0}
            icon={AlertTriangle}
            accent={(overdueCount ?? 0) > 0}
          />
        </div>
      </div>

      {/* Sales stats */}
      <div className="mt-4 mb-2">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Sales</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Sales MTD"
            value={formatCurrency(salesStats?.paid ?? 0)}
            icon={DollarSign}
            accent={(salesStats?.paid ?? 0) > 0}
          />
          <StatCard
            label="Pipeline value"
            value={formatCurrency(salesStats?.pipeline ?? 0)}
            icon={TrendingUp}
          />
        </div>
      </div>

      {/* Bottom row */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <StatCard label="Flagged notes" value={flaggedCount ?? 0} icon={Flag} accent={(flaggedCount ?? 0) > 0} />
        <StatCard label="Active market" value={isOwner ? '5 markets' : (profile?.location?.name ?? '—')} icon={MapPin} />
      </div>

      {/* Recent activity feed */}
      <div className="mt-6">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Recent activity</h2>
        <div className="bg-card border border-border rounded-xl divide-y divide-border">
          {(recentActivity ?? []).length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No activity yet. Log your first contact using the <strong>Log Activity</strong> tab.
            </div>
          ) : (
            (recentActivity ?? []).map((a) => {
              const name = a.contact
                ? [a.contact.first_name, a.contact.last_name].filter(Boolean).join(' ') || a.contact.company || 'Unknown contact'
                : 'No contact'
              return (
                <div key={a.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                    {a.type === 'visit' ? <MapPin className="w-3.5 h-3.5 text-muted-foreground" /> : <Phone className="w-3.5 h-3.5 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{name}</span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">{formatRelative(a.occurred_at)}</span>
                    </div>
                    {a.notes && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{a.notes}</p>}
                    {(isOwner || isGM) && a.rep?.full_name && (
                      <p className="text-xs text-muted-foreground/60 mt-0.5">{a.rep.full_name}</p>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
