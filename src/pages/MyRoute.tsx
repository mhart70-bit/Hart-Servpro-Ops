import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { fullName, cn } from '@/lib/utils'
import { sortByRoute, distanceLabel, haversineDistance, getRepLocation, MARKET_CENTERS } from '@/lib/geo'
import type { LatLng } from '@/types'
import { MapPin, Phone, CheckCircle2, AlertCircle, Clock, ChevronRight, Navigation, ListOrdered } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Contact } from '@/types'
import { ERP_STATUS_LABELS, ERP_STATUS_COLORS } from '@/types'

interface RouteContact extends Contact {
  days_overdue: number
  due_today: boolean
  urgency_score: number
  last_note: string | null
}

type UrgencyLevel = 'critical' | 'overdue' | 'today' | 'upcoming' | 'on_track'

function getUrgency(daysOverdue: number, dueToday: boolean, priority: string): UrgencyLevel {
  if (dueToday && priority !== 'high') return 'today'
  if (daysOverdue > 7 || priority === 'high') return 'critical'
  if (daysOverdue > 0) return 'overdue'
  if (dueToday) return 'today'
  return 'upcoming'
}

const URGENCY_STYLES: Record<UrgencyLevel, { card: string; icon: React.ReactNode; badge: string }> = {
  critical: { card: 'border-red-400/40 bg-red-400/5', icon: <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />, badge: 'text-red-400' },
  overdue:  { card: 'border-amber-400/30', icon: <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />, badge: 'text-amber-400' },
  today:    { card: 'border-yellow-400/30 bg-yellow-400/5', icon: <Clock className="w-4 h-4 text-yellow-400 flex-shrink-0" />, badge: 'text-yellow-400' },
  upcoming: { card: 'border-border', icon: <MapPin className="w-4 h-4 text-primary flex-shrink-0" />, badge: 'text-primary' },
  on_track: { card: 'border-border', icon: <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />, badge: 'text-muted-foreground' },
}

const hasCoords = (c: Contact) => c.lat != null && c.lng != null

// Build a Google Maps turn-by-turn URL through the ordered stops (cap ~10).
function mapsUrl(origin: LatLng, stops: Contact[]): string {
  const pts = stops.filter(hasCoords).slice(0, 10)
  if (pts.length === 0) return ''
  const dest = pts[pts.length - 1]
  const waypoints = pts.slice(0, -1).map(c => `${c.lat},${c.lng}`).join('|')
  const p = new URLSearchParams({
    api: '1',
    origin: `${origin.lat},${origin.lng}`,
    destination: `${dest.lat},${dest.lng}`,
    travelmode: 'driving',
  })
  if (waypoints) p.set('waypoints', waypoints)
  return `https://www.google.com/maps/dir/?${p.toString()}`
}

export default function MyRoute() {
  const { profile, isOwner, isGM } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'priority' | 'route'>('priority')
  const [origin, setOrigin] = useState<LatLng | null>(null)
  const [locating, setLocating] = useState(false)

  const { data: contacts, isLoading } = useQuery({
    queryKey: ['my-route', profile?.id, isOwner, isGM],
    queryFn: async () => {
      let q = supabase
        .from('contacts')
        .select('*, category:coi_categories(*), location:locations(*)')
        .eq('is_active', true)
        .order('next_visit_due_at', { ascending: true, nullsFirst: false })
        .limit(60)
      if (!isOwner && !isGM && profile?.id) q = q.eq('assigned_rep_id', profile.id)
      else if (profile?.location_id) q = q.eq('location_id', profile.location_id)
      const { data, error } = await q
      if (error) throw error

      const ids = (data ?? []).map(c => c.id)
      const recent: Record<string, string> = {}
      if (ids.length > 0) {
        const { data: acts } = await supabase
          .from('activities').select('contact_id, notes, outcome, occurred_at')
          .in('contact_id', ids).order('occurred_at', { ascending: false }).limit(ids.length * 2)
        const seen = new Set<string>()
        for (const a of acts ?? []) {
          if (a.contact_id && !seen.has(a.contact_id)) { seen.add(a.contact_id); recent[a.contact_id] = a.outcome ?? a.notes ?? '' }
        }
      }
      const now = Date.now()
      const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999)
      const todayStart = new Date().setHours(0, 0, 0, 0)
      return (data ?? []).map((c) => {
        const dueMs = c.next_visit_due_at ? new Date(c.next_visit_due_at).getTime() : now
        const daysOverdue = Math.max(0, Math.floor((now - dueMs) / 86400000))
        const dueToday = dueMs <= todayEnd.getTime() && dueMs >= todayStart
        return {
          ...c, days_overdue: daysOverdue, due_today: dueToday,
          urgency_score: daysOverdue * 2 + (c.priority === 'high' ? 20 : c.priority === 'medium' ? 5 : 0),
          last_note: recent[c.id] ?? null,
        } as RouteContact
      })
    },
    enabled: !!profile,
    refetchInterval: 5 * 60 * 1000,
  })

  const marketName = (profile?.location as { name?: string } | null | undefined)?.name

  // Determine a route origin when entering route mode: GPS → market center → first stop.
  useEffect(() => {
    if (mode !== 'route' || origin) return
    let cancelled = false
    setLocating(true)
    getRepLocation().then((gps) => {
      if (cancelled) return
      if (gps) { setOrigin(gps) }
      else if (marketName && MARKET_CENTERS[marketName]) setOrigin(MARKET_CENTERS[marketName])
      else {
        const first = (contacts ?? []).find(hasCoords)
        if (first) setOrigin({ lat: first.lat!, lng: first.lng! })
      }
      setLocating(false)
    })
    return () => { cancelled = true }
  }, [mode, origin, marketName, contacts])

  const withCoords = (contacts ?? []).filter(hasCoords)
  const withoutCoords = (contacts ?? []).filter(c => !hasCoords(c))

  // Ordered list for the current mode
  const ordered = useMemo<RouteContact[]>(() => {
    if (mode === 'route' && origin) {
      return sortByRoute(withCoords, origin) as RouteContact[]
    }
    return [...(contacts ?? [])].sort((a, b) => b.urgency_score - a.urgency_score)
  }, [mode, origin, contacts, withCoords])

  // Leg distances between consecutive stops in route mode
  const legs = useMemo<(string | null)[]>(() => {
    if (mode !== 'route' || !origin) return []
    let prev = origin
    return ordered.map((c) => {
      if (!hasCoords(c)) return null
      const here = { lat: c.lat!, lng: c.lng! }
      const d = distanceLabel(prev, here)
      prev = here
      return d
    })
  }, [mode, origin, ordered])

  const totalMiles = useMemo(() => {
    if (mode !== 'route' || !origin) return null
    let prev = origin, sum = 0
    for (const c of ordered) { if (hasCoords(c)) { const h = { lat: c.lat!, lng: c.lng! }; sum += haversineDistance(prev, h); prev = h } }
    return sum
  }, [mode, origin, ordered])

  const overdueCount = (contacts ?? []).filter(c => c.days_overdue > 0).length
  const dueTodayCount = (contacts ?? []).filter(c => c.due_today && c.days_overdue === 0).length

  if (isLoading) {
    return <div className="p-4 lg:p-6"><div className="animate-pulse space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-card rounded-xl border border-border" />)}</div></div>
  }

  const routeUrl = mode === 'route' && origin ? mapsUrl(origin, ordered) : ''

  return (
    <div className="p-6 lg:p-10 max-w-2xl mx-auto">
      <div className="mb-5">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">FIELD OPS</p>
        <h1 className="text-4xl font-serif font-semibold text-foreground">My Route</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {mode === 'route'
            ? 'Your stops in driving order — work a loop, not a zig-zag.'
            : "Today's hit list — sorted by urgency."}
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex items-center gap-1 mb-4 bg-muted rounded-full p-1 w-fit">
        <button onClick={() => setMode('priority')}
          className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full transition-colors',
            mode === 'priority' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
          <ListOrdered className="w-3.5 h-3.5" /> Priority
        </button>
        <button onClick={() => setMode('route')}
          className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full transition-colors',
            mode === 'route' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
          <Navigation className="w-3.5 h-3.5" /> Route
        </button>
      </div>

      {/* Priority pills */}
      {mode === 'priority' && (contacts ?? []).length > 0 && (
        <div className="flex gap-2 mb-5 flex-wrap">
          {overdueCount > 0 && <span className="text-[10px] px-2.5 py-1 rounded-full bg-red-400/10 text-red-400 border border-red-400/20">{overdueCount} overdue</span>}
          {dueTodayCount > 0 && <span className="text-[10px] px-2.5 py-1 rounded-full bg-yellow-400/10 text-yellow-400 border border-yellow-400/20">{dueTodayCount} due today</span>}
        </div>
      )}

      {/* Route summary + open in maps */}
      {mode === 'route' && (
        <div className="mb-5">
          {locating ? (
            <p className="text-xs text-muted-foreground flex items-center gap-2"><span className="w-3 h-3 border-2 border-primary/40 border-t-primary rounded-full animate-spin" /> Finding your starting point…</p>
          ) : origin ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-muted-foreground">
                {withCoords.length} mapped stops{totalMiles != null ? ` · ~${totalMiles.toFixed(0)} mi loop` : ''}
              </p>
              {routeUrl && (
                <a href={routeUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors">
                  <Navigation className="w-3.5 h-3.5" /> Open route in Google Maps
                </a>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No mapped locations to route yet.</p>
          )}
        </div>
      )}

      {(contacts ?? []).length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <CheckCircle2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-serif font-semibold text-foreground">Nothing here yet</h3>
          <p className="text-sm text-muted-foreground mt-1">No contacts assigned to you yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ordered.map((contact, i) => {
            const urgency = getUrgency(contact.days_overdue, contact.due_today, contact.priority)
            const styles = URGENCY_STYLES[urgency]
            const erpStatus = contact.erp_status ?? 'not_introduced'
            return (
              <div key={contact.id}
                className={cn('bg-card border rounded-xl p-4 flex items-start gap-3 cursor-pointer hover:border-primary/30 transition-colors group', styles.card)}
                onClick={() => navigate(`/contacts/${contact.id}`)}>
                {mode === 'route' ? (
                  <div className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</div>
                ) : (
                  <div className="mt-0.5">{styles.icon}</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">{fullName(contact) || contact.company || 'Unnamed'}</span>
                    <span className={cn('text-xs flex-shrink-0 font-medium', mode === 'route' ? 'text-muted-foreground' : styles.badge)}>
                      {mode === 'route'
                        ? (legs[i] ?? '')
                        : contact.days_overdue > 0 ? `${contact.days_overdue}d overdue` : contact.due_today ? 'Due today' : 'Upcoming'}
                    </span>
                  </div>
                  {contact.company && fullName(contact) && <p className="text-xs text-muted-foreground mt-0.5 truncate">{contact.company}</p>}
                  {contact.address && <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{contact.address}</p>}
                  {mode === 'priority' && contact.last_note && <p className="text-[10px] text-muted-foreground/70 mt-1 truncate italic">"{contact.last_note}"</p>}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {contact.category && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">{contact.category.name}</span>}
                    {erpStatus !== 'not_introduced' && <span className={cn('text-[9px] px-1.5 py-0.5 rounded border leading-none', ERP_STATUS_COLORS[erpStatus])}>{ERP_STATUS_LABELS[erpStatus]}</span>}
                    {contact.phone && <a href={`tel:${contact.phone}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"><Phone className="w-3 h-3" />{contact.phone}</a>}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5 group-hover:text-primary transition-colors" />
              </div>
            )
          })}

          {mode === 'route' && withoutCoords.length > 0 && (
            <p className="text-center text-[11px] text-muted-foreground pt-2">
              {withoutCoords.length} contact{withoutCoords.length !== 1 ? 's' : ''} without a mapped address — not in the route yet.
            </p>
          )}
        </div>
      )}

      {(contacts?.length ?? 0) > 0 && (
        <p className="text-center text-xs text-muted-foreground mt-4">Tap a stop to open the contact · Log the visit from their profile</p>
      )}
    </div>
  )
}
