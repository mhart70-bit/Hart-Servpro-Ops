import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCurrency, formatRelative, fullName } from '@/lib/utils'
import { startOfMonth, startOfWeek } from 'date-fns'
import { FileText, TrendingUp, Flag, AlertTriangle, ChevronRight, MapPin, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Contact } from '@/types'

const MARKETS = ['Amarillo', 'Abilene', 'Sugar Land', 'San Angelo', 'Victoria']

interface MarketActivity {
  location_id: string | null
  flagged: boolean
  location: { name: string | null } | null
}

interface MarketDeal {
  location_id: string | null
  deal_value: number | null
  stage: string
  location: { name: string | null } | null
}

interface RecentActivity {
  id: string
  notes: string | null
  occurred_at: string
  contact: { first_name: string | null; last_name: string | null; company: string | null } | null
  rep: { full_name: string | null } | null
  location: { name: string | null } | null
}

export default function Dashboard() {
  const { profile, isOwner, isGM } = useAuth()
  const navigate = useNavigate()
  const monthStart = startOfMonth(new Date()).toISOString()
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString()

  const firstName = profile?.full_name?.split(' ')[0] ?? null

  // Total notes
  const { data: notesCount } = useQuery({
    queryKey: ['dash-notes', profile?.id, isOwner],
    queryFn: async () => {
      let q = supabase.from('activities').select('id', { count: 'exact' })
      if (!isOwner && !isGM && profile?.id) q = q.eq('rep_id', profile.id)
      else if (isGM && profile?.location_id) q = q.eq('location_id', profile.location_id)
      const { count } = await q
      return count ?? 0
    },
    enabled: !!profile,
  })

  // Pipeline value (open deals)
  const { data: pipeline } = useQuery({
    queryKey: ['dash-pipeline', profile?.id, isOwner],
    queryFn: async () => {
      let q = supabase.from('deals').select('deal_value, stage')
      if (!isOwner && !isGM && profile?.id) q = q.eq('rep_id', profile.id)
      else if (isGM && profile?.location_id) q = q.eq('location_id', profile.location_id)
      const { data } = await q
      return (data ?? [])
        .filter(d => !['paid', 'lost'].includes(d.stage))
        .reduce((s, d) => s + (d.deal_value ?? 0), 0)
    },
    enabled: !!profile,
  })

  // Flagged count
  const { data: flaggedCount } = useQuery({
    queryKey: ['dash-flagged', profile?.id, isOwner],
    queryFn: async () => {
      let q = supabase.from('activities').select('id', { count: 'exact' }).eq('flagged', true)
      if (!isOwner && !isGM && profile?.id) q = q.eq('rep_id', profile.id)
      else if (isGM && profile?.location_id) q = q.eq('location_id', profile.location_id)
      const { count } = await q
      return count ?? 0
    },
    enabled: !!profile,
  })

  // Overdue contacts (high-urgency proxy)
  const { data: overdueCount } = useQuery({
    queryKey: ['dash-overdue', profile?.id, isOwner],
    queryFn: async () => {
      let q = supabase
        .from('contacts')
        .select('id', { count: 'exact' })
        .lt('next_visit_due_at', new Date().toISOString())
        .eq('is_active', true)
      if (!isOwner && !isGM && profile?.id) q = q.eq('assigned_rep_id', profile.id)
      else if (isGM && profile?.location_id) q = q.eq('location_id', profile.location_id)
      const { count } = await q
      return count ?? 0
    },
    enabled: !!profile,
  })

  // Admin: market activity + deals snapshot
  const { data: marketActivities } = useQuery({
    queryKey: ['dash-market-acts', monthStart],
    queryFn: async () => {
      const { data } = await supabase
        .from('activities')
        .select('location_id, flagged, location:locations(name)')
        .gte('occurred_at', weekStart)
      return (data ?? []) as unknown as MarketActivity[]
    },
    enabled: !!(isOwner || isGM),
  })

  const { data: marketDeals } = useQuery({
    queryKey: ['dash-market-deals', monthStart],
    queryFn: async () => {
      const { data } = await supabase
        .from('deals')
        .select('location_id, deal_value, stage, location:locations(name)')
        .gte('created_at', monthStart)
      return (data ?? []) as unknown as MarketDeal[]
    },
    enabled: !!(isOwner || isGM),
  })

  // Today's hit list (rep view only)
  const { data: hitList } = useQuery({
    queryKey: ['dash-hitlist', profile?.id],
    queryFn: async () => {
      const todayEnd = new Date()
      todayEnd.setHours(23, 59, 59, 999)
      const { data } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, company, phone, next_visit_due_at, priority, category:coi_categories(name)')
        .eq('is_active', true)
        .eq('assigned_rep_id', profile!.id)
        .lte('next_visit_due_at', todayEnd.toISOString())
        .order('next_visit_due_at', { ascending: true })
        .limit(5)
      return (data ?? []) as unknown as Contact[]
    },
    enabled: !!profile && !isOwner && !isGM,
  })

  // Recent feed for reps
  const { data: recentFeed } = useQuery({
    queryKey: ['dash-recent', profile?.id],
    queryFn: async () => {
      let q = supabase
        .from('activities')
        .select('id, notes, occurred_at, contact:contacts(first_name, last_name, company), rep:profiles(full_name), location:locations(name)')
        .order('occurred_at', { ascending: false })
        .limit(6)
      if (!isOwner && !isGM && profile?.id) q = q.eq('rep_id', profile.id)
      const { data } = await q
      return (data ?? []) as unknown as RecentActivity[]
    },
    enabled: !!profile,
  })

  const STATS = [
    {
      label: 'Notes logged',
      value: notesCount ?? 0,
      icon: FileText,
      accent: false,
    },
    {
      label: 'Pipeline value',
      value: formatCurrency(pipeline ?? 0),
      icon: TrendingUp,
      accent: (pipeline ?? 0) > 0,
    },
    {
      label: 'Flagged for review',
      value: flaggedCount ?? 0,
      icon: Flag,
      accent: (flaggedCount ?? 0) > 0,
    },
    {
      label: 'Overdue visits',
      value: overdueCount ?? 0,
      icon: AlertTriangle,
      accent: (overdueCount ?? 0) > 0,
    },
  ]

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-10">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            {isOwner ? 'Owner view' : isGM ? 'GM view' : 'Field rep view'}
          </p>
          <h1 className="text-4xl font-serif font-semibold text-foreground">
            {isOwner ? `Good day${firstName ? `, ${firstName}` : ''}.` : `Welcome${firstName ? `, ${firstName}` : ''}.`}
          </h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-lg">
            {isOwner
              ? 'A unified view of every market, every rep, every dollar of pipeline logged this period.'
              : 'Your submitted notes, your pipeline, your next follow-ups.'}
          </p>
        </div>
        <button
          onClick={() => navigate('/log')}
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-full transition-colors"
        >
          Log Activity <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 4 stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
        {STATS.map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest">{label}</span>
              <Icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-3xl font-serif font-semibold text-foreground">{value}</div>
          </div>
        ))}
      </div>

      {/* Admin: Markets at a glance */}
      {(isOwner || isGM) && (
        <div className="mb-8">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-xl font-serif font-semibold text-foreground">Markets at a glance</h2>
            <button
              onClick={() => navigate('/markets')}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Full breakdown ↗
            </button>
          </div>
          <p className="text-sm text-muted-foreground mb-5">Pipeline and activity across all five Texas franchises.</p>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {MARKETS.map(market => {
              const acts = (marketActivities ?? []).filter(a => a.location?.name === market)
              const deals = (marketDeals ?? []).filter(d => d.location?.name === market)
              const value = deals
                .filter(d => !['paid', 'lost'].includes(d.stage))
                .reduce((s, d) => s + (d.deal_value ?? 0), 0)
              const flagged = acts.filter(a => a.flagged).length

              return (
                <div key={market} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-1 mb-3">
                    <span className="text-xs font-medium text-foreground leading-tight">{market}</span>
                    {flagged > 0 && (
                      <span className="text-[9px] text-muted-foreground border border-border px-1.5 py-0.5 rounded-full flex-shrink-0">
                        {flagged} flagged
                      </span>
                    )}
                  </div>
                  <div className="text-2xl font-serif font-semibold text-foreground">{formatCurrency(value)}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {acts.length} note{acts.length !== 1 ? 's' : ''}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Rep: Your market */}
      {!isOwner && !isGM && (
        <div className="mb-10 bg-card border border-border rounded-xl p-6">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-3">Your market</h2>
          <p className="text-3xl font-serif font-semibold text-foreground">
            {profile?.location?.name ?? 'Unassigned'}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            {profile?.location?.name
              ? "All your submitted notes stay within this market's ledger."
              : "Mark will assign you to one of the five Texas markets shortly."}
          </p>
        </div>
      )}

      {/* Today's Hit List — rep view */}
      {!isOwner && !isGM && (hitList ?? []).length > 0 && (
        <div className="mb-8">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-xl font-serif font-semibold text-foreground">Today's hit list</h2>
            <button
              onClick={() => navigate('/route')}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Full route ↗
            </button>
          </div>
          <div className="bg-card border border-border rounded-xl divide-y divide-border">
            {(hitList ?? []).map(contact => {
              const overdue = new Date(contact.next_visit_due_at ?? '') < new Date()
              return (
                <button
                  key={contact.id}
                  onClick={() => navigate(`/contacts/${contact.id}`)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-shrink-0">
                    {overdue
                      ? <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                      : <MapPin className="w-3.5 h-3.5 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {fullName(contact) || contact.company || 'Unnamed'}
                    </div>
                    {contact.company && fullName(contact) && (
                      <div className="text-xs text-muted-foreground truncate">{contact.company}</div>
                    )}
                  </div>
                  {contact.priority === 'high' && (
                    <span className="text-[9px] text-red-400 border border-red-400/30 px-1.5 py-0.5 rounded-full flex-shrink-0">
                      High
                    </span>
                  )}
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent notes feed */}
      <div>
        <h2 className="text-xl font-serif font-semibold text-foreground mb-4">Recent notes</h2>
        <div className="bg-card border border-border rounded-xl divide-y divide-border">
          {(recentFeed ?? []).length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              No notes yet. Hit <strong className="text-foreground">Log Activity</strong> to record your first touch.
            </div>
          ) : (
            (recentFeed ?? []).map(a => {
              const name = a.contact
                ? [a.contact.first_name, a.contact.last_name].filter(Boolean).join(' ') || a.contact.company
                : null
              return (
                <div key={a.id} className="px-5 py-4">
                  <div className="flex items-baseline justify-between gap-2 mb-0.5">
                    <span className="text-sm font-medium text-foreground truncate">
                      {name ?? 'Untitled note'}
                    </span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {formatRelative(a.occurred_at)}
                    </span>
                  </div>
                  {a.notes && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{a.notes}</p>
                  )}
                  {(isOwner || isGM) && (a.rep?.full_name || a.location?.name) && (
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      {a.rep?.full_name}{a.location?.name ? ` · ${a.location.name}` : ''}
                    </p>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
