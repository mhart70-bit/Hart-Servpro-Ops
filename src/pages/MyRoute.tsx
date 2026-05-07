import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { fullName, cn } from '@/lib/utils'
import { MapPin, Phone, CheckCircle2, AlertCircle, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Contact } from '@/types'

interface RouteContact extends Contact {
  days_overdue: number
  urgency_score: number
}

export default function MyRoute() {
  const { profile, isOwner, isGM } = useAuth()
  const navigate = useNavigate()

  const { data: route, isLoading } = useQuery({
    queryKey: ['my-route', profile?.id],
    queryFn: async () => {
      const now = new Date().toISOString()

      let q = supabase
        .from('contacts')
        .select('*, category:coi_categories(*), location:locations(*)')
        .eq('is_active', true)
        .lte('next_visit_due_at', now)
        .order('next_visit_due_at', { ascending: true })
        .limit(20)

      if (!isOwner && !isGM && profile?.id) {
        q = q.eq('assigned_rep_id', profile.id)
      } else if (profile?.location_id) {
        q = q.eq('location_id', profile.location_id)
      }

      const { data, error } = await q
      if (error) throw error

      return (data ?? []).map((c) => {
        const due = new Date(c.next_visit_due_at ?? now)
        const daysOverdue = Math.floor((Date.now() - due.getTime()) / (1000 * 60 * 60 * 24))
        return { ...c, days_overdue: daysOverdue, urgency_score: daysOverdue + (c.priority === 'high' ? 10 : 0) } as RouteContact
      }).sort((a, b) => b.urgency_score - a.urgency_score)
    },
    enabled: !!profile,
  })


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
    <div className="p-4 lg:p-6 max-w-2xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-foreground">My Route</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {route?.length ?? 0} contacts due for a visit — sorted by urgency
        </p>
      </div>

      {(route ?? []).length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-foreground">You're all caught up!</h3>
          <p className="text-sm text-muted-foreground mt-1">No overdue visits. Check back tomorrow.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {route!.map((contact) => (
            <div
              key={contact.id}
              className={cn(
                'bg-card border rounded-xl p-4 flex items-start gap-3 cursor-pointer hover:border-primary/30 transition-colors group',
                contact.priority === 'high' ? 'border-red-400/30' : 'border-border'
              )}
              onClick={() => navigate(`/log?contact_id=${contact.id}`)}
            >
              {/* Priority indicator */}
              <div className="mt-0.5">
                {contact.priority === 'high' || contact.days_overdue > 7 ? (
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                ) : (
                  <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
              </div>

              {/* Contact info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground truncate">
                    {fullName(contact)}
                  </span>
                  <span className={cn(
                    'text-xs flex-shrink-0 font-medium',
                    contact.days_overdue > 7 ? 'text-red-400' : contact.days_overdue > 3 ? 'text-amber-400' : 'text-muted-foreground'
                  )}>
                    {contact.days_overdue === 0 ? 'Due today' : `${contact.days_overdue}d overdue`}
                  </span>
                </div>

                {contact.company && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{contact.company}</p>
                )}

                <div className="flex items-center gap-3 mt-1.5">
                  {contact.category && (
                    <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                      {contact.category.name}
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
                  <p className="text-[10px] text-muted-foreground/60 mt-1">{contact.city}</p>
                )}
              </div>

              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5 group-hover:text-primary transition-colors" />
            </div>
          ))}
        </div>
      )}

      {(route?.length ?? 0) > 0 && (
        <p className="text-center text-xs text-muted-foreground mt-4">
          Tap any contact to log a visit or call
        </p>
      )}
    </div>
  )
}
