import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { fullName, cn } from '@/lib/utils'
import { MapPin, Phone, CheckCircle2, AlertCircle, Clock, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Contact } from '@/types'
import { ERP_STATUS_LABELS, ERP_STATUS_COLORS } from '@/types'

interface RouteContact extends Contact {
  days_overdue: number
  due_today: boolean
  urgency_score: number
  last_note: string | null
}

// Color coding:
//   Red    — overdue > 7 days or high priority
//   Amber  — overdue 1–7 days
//   Yellow — due today (within today's date window)
//   Green  — coming up (0–3 days away, not yet due)
//   Muted  — on track (> 3 days away)

type UrgencyLevel = 'critical' | 'overdue' | 'today' | 'upcoming' | 'on_track'

function getUrgency(daysOverdue: number, dueToday: boolean, priority: string): UrgencyLevel {
  if (dueToday && priority !== 'high') return 'today'
  if (daysOverdue > 7 || priority === 'high') return 'critical'
  if (daysOverdue > 0) return 'overdue'
  if (dueToday) return 'today'
  return 'upcoming'
}

const URGENCY_STYLES: Record<UrgencyLevel, { card: string; icon: React.ReactNode; badge: string }> = {
  critical: {
    card: 'border-red-400/40 bg-red-400/5',
    icon: <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />,
    badge: 'text-red-400',
  },
  overdue: {
    card: 'border-amber-400/30',
    icon: <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />,
    badge: 'text-amber-400',
  },
  today: {
    card: 'border-yellow-400/30 bg-yellow-400/5',
    icon: <Clock className="w-4 h-4 text-yellow-400 flex-shrink-0" />,
    badge: 'text-yellow-400',
  },
  upcoming: {
    card: 'border-border',
    icon: <MapPin className="w-4 h-4 text-primary flex-shrink-0" />,
    badge: 'text-primary',
  },
  on_track: {
    card: 'border-border',
    icon: <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />,
    badge: 'text-muted-foreground',
  },
}

export default function MyRoute() {
  const { profile, isOwner, isGM } = useAuth()
  const navigate = useNavigate()

  const { data: route, isLoading } = useQuery({
    queryKey: ['my-route', profile?.id],
    queryFn: async () => {
      // Fetch contacts due today + overdue + up to 3 days ahead
      const todayEnd = new Date()
      todayEnd.setHours(23, 59, 59, 999)

      const lookahead = new Date()
      lookahead.setDate(lookahead.getDate() + 3)

      let q = supabase
        .from('contacts')
        .select('*, category:coi_categories(*), location:locations(*)')
        .eq('is_active', true)
        .lte('next_visit_due_at', lookahead.toISOString())
        .order('next_visit_due_at', { ascending: true })
        .limit(30)

      if (!isOwner && !isGM && profile?.id) {
        q = q.eq('assigned_rep_id', profile.id)
      } else if (profile?.location_id) {
        q = q.eq('location_id', profile.location_id)
      }

      const { data, error } = await q
      if (error) throw error

      // Also fetch last activity note for each contact
      const contactIds = (data ?? []).map(c => c.id)
      let recentActivity: Record<string, string> = {}

      if (contactIds.length > 0) {
        const { data: acts } = await supabase
          .from('activities')
          .select('contact_id, notes, outcome, occurred_at')
          .in('contact_id', contactIds)
          .order('occurred_at', { ascending: false })
          .limit(contactIds.length * 2)

        const seen = new Set<string>()
        for (const a of acts ?? []) {
          if (a.contact_id && !seen.has(a.contact_id)) {
            seen.add(a.contact_id)
            recentActivity[a.contact_id] = a.outcome ?? a.notes ?? ''
          }
        }
      }

      const now = Date.now()
      const todayEndMs = todayEnd.getTime()

      return (data ?? []).map((c) => {
        const due = new Date(c.next_visit_due_at ?? new Date())
        const dueMs = due.getTime()
        const daysOverdue = Math.max(0, Math.floor((now - dueMs) / (1000 * 60 * 60 * 24)))
        const dueToday = dueMs <= todayEndMs && dueMs >= new Date().setHours(0, 0, 0, 0)

        return {
          ...c,
          days_overdue: daysOverdue,
          due_today: dueToday,
          urgency_score: daysOverdue * 2 + (c.priority === 'high' ? 20 : c.priority === 'medium' ? 5 : 0),
          last_note: recentActivity[c.id] ?? null,
        } as RouteContact
      }).sort((a, b) => b.urgency_score - a.urgency_score)
    },
    enabled: !!profile,
    refetchInterval: 5 * 60 * 1000, // refresh every 5 min
  })

  const overdueCount = (route ?? []).filter(c => c.days_overdue > 0).length
  const dueTodayCount = (route ?? []).filter(c => c.due_today && c.days_overdue === 0).length
  const upcomingCount = (route ?? []).filter(c => !c.due_today && c.days_overdue === 0).length

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6">
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-card rounded-xl border border-border" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-10 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">FIELD OPS</p>
        <h1 className="text-4xl font-serif font-semibold text-foreground">My Route</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Today's hit list — sorted by urgency
        </p>
      </div>

      {/* Summary pills */}
      {(route ?? []).length > 0 && (
        <div className="flex gap-2 mb-5 flex-wrap">
          {overdueCount > 0 && (
            <span className="text-[10px] px-2.5 py-1 rounded-full bg-red-400/10 text-red-400 border border-red-400/20">
              {overdueCount} overdue
            </span>
          )}
          {dueTodayCount > 0 && (
            <span className="text-[10px] px-2.5 py-1 rounded-full bg-yellow-400/10 text-yellow-400 border border-yellow-400/20">
              {dueTodayCount} due today
            </span>
          )}
          {upcomingCount > 0 && (
            <span className="text-[10px] px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border">
              {upcomingCount} upcoming
            </span>
          )}
        </div>
      )}

      {(route ?? []).length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <CheckCircle2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-serif font-semibold text-foreground">All caught up!</h3>
          <p className="text-sm text-muted-foreground mt-1">No visits due in the next 3 days.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {route!.map((contact) => {
            const urgency = getUrgency(contact.days_overdue, contact.due_today, contact.priority)
            const styles = URGENCY_STYLES[urgency]
            const erpStatus = contact.erp_status ?? 'not_introduced'

            return (
              <div
                key={contact.id}
                className={cn(
                  'bg-card border rounded-xl p-4 flex items-start gap-3 cursor-pointer hover:border-primary/30 transition-colors group',
                  styles.card
                )}
                onClick={() => navigate(`/contacts/${contact.id}`)}
              >
                {/* Urgency icon */}
                <div className="mt-0.5">{styles.icon}</div>

                {/* Contact info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {fullName(contact)}
                    </span>
                    <span className={cn('text-xs flex-shrink-0 font-medium', styles.badge)}>
                      {contact.days_overdue > 0
                        ? `${contact.days_overdue}d overdue`
                        : contact.due_today
                        ? 'Due today'
                        : 'Upcoming'}
                    </span>
                  </div>

                  {contact.company && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{contact.company}</p>
                  )}

                  {/* Last note snippet */}
                  {contact.last_note && (
                    <p className="text-[10px] text-muted-foreground/70 mt-1 truncate italic">
                      "{contact.last_note}"
                    </p>
                  )}

                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {contact.category && (
                      <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                        {contact.category.name}
                      </span>
                    )}
                    {erpStatus !== 'not_introduced' && (
                      <span className={cn(
                        'text-[9px] px-1.5 py-0.5 rounded border leading-none',
                        ERP_STATUS_COLORS[erpStatus]
                      )}>
                        {ERP_STATUS_LABELS[erpStatus]}
                      </span>
                    )}
                    {contact.phone && (
                      <a
                        href={`tel:${contact.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Phone className="w-3 h-3" />
                        {contact.phone}
                      </a>
                    )}
                  </div>

                  {contact.city && (
                    <p className="text-[10px] text-muted-foreground/50 mt-1">{contact.city}</p>
                  )}
                </div>

                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5 group-hover:text-primary transition-colors" />
              </div>
            )
          })}
        </div>
      )}

      {(route?.length ?? 0) > 0 && (
        <p className="text-center text-xs text-muted-foreground mt-4">
          Tap to view contact · Log a visit from the contact profile
        </p>
      )}
    </div>
  )
}
