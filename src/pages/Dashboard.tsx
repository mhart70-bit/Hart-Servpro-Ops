import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCurrency, formatRelative, fullName } from '@/lib/utils'
import { startOfMonth, startOfWeek } from 'date-fns'
import { FileText, TrendingUp, Flag, AlertTriangle, ChevronRight, MapPin, AlertCircle, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Contact } from '@/types'
import QuickLogModal from '@/components/QuickLogModal'
import { useTour, TOUR_DONE_KEY } from '@/components/Tour'
import MorningBriefing from '@/components/MorningBriefing'

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
  const [showQuickLog, setShowQuickLog] = useState(false)
  const [quickLogContactId, setQuickLogContactId] = useState<string | undefined>()
  const { startTour, tourActive } = useTour()
  const [tourDismissed, setTourDismissed] = useState(() => {
    try { return localStorage.getItem(TOUR_DONE_KEY) === '1' } catch { return true }
  })

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
    queryKey: ['dash-market-acts', weekStart],
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

  // Today's hit list (rep view only) — overdue + due today
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
        .limit(20)
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

      {/* First-visit tour invitation */}
      {!tourDismissed && !tourActive && (
        <div className="mb-6 flex items-center justify-between gap-3 bg-primary/10 border border-primary/30 rounded-xl px-4 py-3">
          <p className="text-sm text-foreground">
            New here? <span className="font-medium">Learn Hart Sales OS</span> in a 2-minute guided tour.
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => { setTourDismissed(true); startTour() }}
              className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors"
            >
              Start tour
            </button>
            <button
              onClick={() => {
                setTourDismissed(true)
                try { localStorage.setItem(TOUR_DONE_KEY, '1') } catch { /* ignore */ }
              }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              No thanks
            </button>
          </div>
        </div>
      )}

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

      {/* AI morning briefing */}
      <MorningBriefing />

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
        <div className="mb-8" data-tour="markets">
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

      {/* Rep view: Overdue + Due Today sections */}
      {!isOwner && !isGM && (() => {
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        const overdue = (hitList ?? []).filter(c => new Date(c.next_visit_due_at ?? '') < todayStart)
        const dueToday = (hitList ?? []).filter(c => new Date(c.next_visit_due_at ?? '') >= todayStart)

        const ContactRow = ({ contact, badge }: { contact: Contact; badge?: 'overdue' | 'today' }) => (
          <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors group">
            <div className="flex-shrink-0">
              {badge === 'overdue'
                ? <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                : <MapPin className="w-3.5 h-3.5 text-primary" />}
            </div>
            <button
              onClick={() => navigate(`/contacts/${contact.id}`)}
              className="flex-1 min-w-0 text-left"
            >
              <div className="text-sm font-medium text-foreground truncate">
                {fullName(contact) || contact.company || 'Unnamed'}
              </div>
              {contact.company && fullName(contact) && (
                <div className="text-xs text-muted-foreground truncate">{contact.company}</div>
              )}
            </button>
            <div className="flex items-center gap-2 flex-shrink-0">
              {contact.priority === 'high' && (
                <span className="text-[9px] text-red-400 border border-red-400/30 px-1.5 py-0.5 rounded-full">
                  High
                </span>
              )}
              <button
                onClick={() => { setQuickLogContactId(contact.id); setShowQuickLog(true) }}
                className="opacity-0 group-hover:opacity-100 text-[10px] text-primary border border-primary/30 px-2 py-0.5 rounded-full transition-opacity hover:bg-primary/10"
              >
                Log
              </button>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
          </div>
        )

        return (
          <div data-tour="hitlist">
            {overdue.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xl font-serif font-semibold text-foreground mb-3">
                  Overdue
                  <span className="ml-2 text-sm font-sans font-normal text-amber-400">{overdue.length}</span>
                </h2>
                <div className="bg-card border border-amber-400/20 rounded-xl divide-y divide-border overflow-hidden">
                  {overdue.map(c => <ContactRow key={c.id} contact={c} badge="overdue" />)}
                </div>
              </div>
            )}
            {dueToday.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-serif font-semibold text-foreground mb-3">Due today</h2>
                <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
                  {dueToday.map(c => <ContactRow key={c.id} contact={c} badge="today" />)}
                </div>
              </div>
            )}
            {overdue.length === 0 && dueToday.length === 0 && (
              <div className="mb-8 bg-card border border-border rounded-xl p-8 text-center">
                <p className="text-sm text-muted-foreground">All caught up — no visits due today.</p>
              </div>
            )}
          </div>
        )
      })()}

      {/* Recent notes feed */}
      <div className="pb-20 lg:pb-0">
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

      {/* Floating action button — rep view */}
      {!isOwner && !isGM && (
        <button
          onClick={() => { setQuickLogContactId(undefined); setShowQuickLog(true) }}
          className="fixed bottom-6 right-6 lg:bottom-8 lg:right-8 w-14 h-14 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full shadow-xl flex items-center justify-center z-10 transition-colors"
          title="Log Activity"
          data-tour="fab"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      <QuickLogModal
        open={showQuickLog}
        onClose={() => { setShowQuickLog(false); setQuickLogContactId(undefined) }}
        defaultContactId={quickLogContactId}
      />
    </div>
  )
}
