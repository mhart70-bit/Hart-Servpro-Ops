import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatRelative, formatDate, fullName, cn } from '@/lib/utils'
import { DEAL_STAGE_LABELS } from '@/lib/utils'
import { AlertTriangle, UserX, Clock, TrendingUp, Link as LinkIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { subDays } from 'date-fns'

export default function Alerts() {
  const { profile, isOwner, isGM } = useAuth()

  const threeDaysAgo = subDays(new Date(), 3).toISOString()
  const fourteenDaysAgo = subDays(new Date(), 14).toISOString()

  // 1. Inactive reps — no activity in 3+ days
  const { data: inactiveReps, isLoading: loadingReps } = useQuery({
    queryKey: ['alerts-inactive-reps', threeDaysAgo, profile?.location_id, isOwner],
    queryFn: async () => {
      // Get all reps in scope
      let repsQ = supabase
        .from('profiles')
        .select('id, full_name, location_id, location:locations(name)')
        .eq('role', 'rep')
      if (isGM && profile?.location_id) repsQ = repsQ.eq('location_id', profile.location_id)
      const { data: reps, error: repsErr } = await repsQ
      if (repsErr) throw repsErr

      // Get reps who have activity in last 3 days
      let actQ = supabase
        .from('activities')
        .select('rep_id')
        .gte('occurred_at', threeDaysAgo)
      if (isGM && profile?.location_id) actQ = actQ.eq('location_id', profile.location_id)
      const { data: recentActs, error: actErr } = await actQ
      if (actErr) throw actErr

      const activeRepIds = new Set((recentActs ?? []).map(a => a.rep_id).filter(Boolean))

      // Get last activity date for each inactive rep
      const inactiveRepIds = (reps ?? []).filter(r => !activeRepIds.has(r.id)).map(r => r.id)

      if (inactiveRepIds.length === 0) return []

      const lastActPromises = inactiveRepIds.map(async (repId) => {
        const { data } = await supabase
          .from('activities')
          .select('occurred_at')
          .eq('rep_id', repId)
          .order('occurred_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        return { repId, lastActivity: data?.occurred_at ?? null }
      })
      const lastActs = await Promise.all(lastActPromises)
      const lastActMap = new Map(lastActs.map(l => [l.repId, l.lastActivity]))

      return (reps ?? [])
        .filter(r => !activeRepIds.has(r.id))
        .map(r => ({
          id: r.id,
          full_name: r.full_name,
          location: Array.isArray(r.location) ? (r.location[0] as { name: string | null } | null) : (r.location as { name: string | null } | null),
          lastActivity: lastActMap.get(r.id) ?? null,
        }))
    },
    enabled: !!(isOwner || isGM),
  })

  // 2. Overdue contacts grouped by rep
  const { data: overdueContacts, isLoading: loadingContacts } = useQuery({
    queryKey: ['alerts-overdue-contacts', profile?.location_id, isOwner],
    queryFn: async () => {
      let q = supabase
        .from('contacts')
        .select('id, first_name, last_name, company, next_visit_due_at, assigned_rep_id, assigned_rep:profiles(full_name, location_id)')
        .eq('is_active', true)
        .lt('next_visit_due_at', new Date().toISOString())
        .order('next_visit_due_at', { ascending: true })
      if (isGM && profile?.location_id) q = q.eq('location_id', profile.location_id)
      const { data, error } = await q
      if (error) throw error

      // Group by rep
      const repMap = new Map<string, {
        repName: string
        contacts: { id: string; name: string; nextDue: string | null }[]
      }>()

      for (const c of data ?? []) {
        const repId = c.assigned_rep_id ?? 'unassigned'
        const repArr = c.assigned_rep as { full_name: string | null } | { full_name: string | null }[] | null
        const repName = Array.isArray(repArr)
          ? (repArr[0]?.full_name ?? 'Unassigned')
          : (repArr?.full_name ?? 'Unassigned')

        if (!repMap.has(repId)) {
          repMap.set(repId, { repName, contacts: [] })
        }
        repMap.get(repId)!.contacts.push({
          id: c.id,
          name: fullName(c),
          nextDue: c.next_visit_due_at,
        })
      }

      return Array.from(repMap.entries())
        .map(([repId, data]) => ({ repId, ...data }))
        .sort((a, b) => b.contacts.length - a.contacts.length)
    },
    enabled: !!(isOwner || isGM),
  })

  // 3. Stale deals — no stage change in 14+ days (using updated_at as proxy)
  const { data: staleDeals, isLoading: loadingDeals } = useQuery({
    queryKey: ['alerts-stale-deals', fourteenDaysAgo, profile?.location_id, isOwner],
    queryFn: async () => {
      let q = supabase
        .from('deals')
        .select('id, title, stage, deal_value, updated_at, damage_type, rep:profiles(full_name), contact:contacts(first_name, last_name, company)')
        .not('stage', 'in', '("paid","lost")')
        .lt('updated_at', fourteenDaysAgo)
        .order('updated_at', { ascending: true })
      if (isGM && profile?.location_id) q = q.eq('location_id', profile.location_id)
      const { data, error } = await q
      if (error) throw error

      return (data ?? []).map(d => {
        const repArr = d.rep as { full_name: string | null } | { full_name: string | null }[] | null
        const repName = Array.isArray(repArr) ? (repArr[0]?.full_name ?? '—') : (repArr?.full_name ?? '—')
        type ContactRow = { first_name: string | null; last_name: string | null; company: string | null }
        const rawContact = d.contact as ContactRow | ContactRow[] | null
        const contactArr: ContactRow | null = Array.isArray(rawContact) ? (rawContact[0] ?? null) : rawContact
        const contactName = contactArr
          ? (fullName(contactArr) !== 'Unnamed Contact' ? fullName(contactArr) : contactArr.company ?? '—')
          : '—'
        const daysStuck = Math.floor((Date.now() - new Date(d.updated_at).getTime()) / 86400000)
        return {
          id: d.id,
          title: d.title ?? (d.damage_type ? `${d.damage_type.charAt(0).toUpperCase()}${d.damage_type.slice(1)} damage` : 'Untitled deal'),
          stage: d.stage,
          repName,
          contactName,
          daysStuck,
          updatedAt: d.updated_at,
        }
      })
    },
    enabled: !!(isOwner || isGM),
  })

  const isLoading = loadingReps || loadingContacts || loadingDeals

  if (!isOwner && !isGM) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-sm text-muted-foreground">Access restricted to managers.</p>
      </div>
    )
  }

  const totalAlerts = (inactiveReps?.length ?? 0) +
    (overdueContacts?.reduce((s, g) => s + g.contacts.length, 0) ?? 0) +
    (staleDeals?.length ?? 0)

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="w-4 h-4 text-primary" />
          <span className="text-[10px] text-primary uppercase tracking-widest font-medium">Attention required</span>
        </div>
        <h1 className="text-3xl font-serif font-semibold text-foreground">Alerts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isLoading ? 'Loading…' : `${totalAlerts} item${totalAlerts !== 1 ? 's' : ''} need attention`}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-card border border-border rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-6">

          {/* ── Bucket 1: Inactive Reps ─────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <UserX className="w-4 h-4 text-destructive" />
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-widest">
                Inactive Reps
              </h2>
              {(inactiveReps?.length ?? 0) > 0 && (
                <span className="ml-auto text-xs bg-destructive/10 text-destructive border border-destructive/20 px-2 py-0.5 rounded-full">
                  {inactiveReps!.length}
                </span>
              )}
            </div>

            {(inactiveReps?.length ?? 0) === 0 ? (
              <div className="bg-card border border-border rounded-xl p-4 text-center text-sm text-muted-foreground">
                All reps have logged activity in the last 3 days.
              </div>
            ) : (
              <div className="bg-card border border-destructive/20 rounded-xl divide-y divide-border">
                {inactiveReps!.map(rep => (
                  <div key={rep.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{rep.full_name ?? 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">{rep.location?.name ?? '—'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Last active</p>
                      <p className={cn(
                        'text-xs font-medium',
                        rep.lastActivity ? 'text-foreground' : 'text-destructive'
                      )}>
                        {rep.lastActivity ? formatRelative(rep.lastActivity) : 'Never'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Bucket 2: Overdue Contacts ──────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-widest">
                Overdue Contacts
              </h2>
              {(overdueContacts?.reduce((s, g) => s + g.contacts.length, 0) ?? 0) > 0 && (
                <span className="ml-auto text-xs bg-amber-400/10 text-amber-400 border border-amber-400/20 px-2 py-0.5 rounded-full">
                  {overdueContacts!.reduce((s, g) => s + g.contacts.length, 0)} contacts
                </span>
              )}
            </div>

            {(overdueContacts?.length ?? 0) === 0 ? (
              <div className="bg-card border border-border rounded-xl p-4 text-center text-sm text-muted-foreground">
                No contacts are overdue.
              </div>
            ) : (
              <div className="space-y-3">
                {overdueContacts!.map(group => (
                  <div key={group.repId} className="bg-card border border-amber-400/20 rounded-xl">
                    <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
                      <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
                        {group.repName}
                      </p>
                      <span className="text-xs text-amber-400">
                        {group.contacts.length} overdue
                      </span>
                    </div>
                    <div className="divide-y divide-border">
                      {group.contacts.slice(0, 8).map(c => (
                        <div key={c.id} className="flex items-center justify-between px-4 py-2.5">
                          <Link
                            to={`/contacts/${c.id}`}
                            className="text-sm text-foreground hover:text-primary transition-colors flex items-center gap-1.5"
                          >
                            {c.name}
                            <LinkIcon className="w-3 h-3 text-muted-foreground" />
                          </Link>
                          <span className="text-xs text-amber-400">
                            Due {formatDate(c.nextDue)}
                          </span>
                        </div>
                      ))}
                      {group.contacts.length > 8 && (
                        <div className="px-4 py-2 text-xs text-muted-foreground">
                          +{group.contacts.length - 8} more
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Bucket 3: Stale Deals ───────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-widest">
                Stale Deals
              </h2>
              {(staleDeals?.length ?? 0) > 0 && (
                <span className="ml-auto text-xs bg-muted text-muted-foreground border border-border px-2 py-0.5 rounded-full">
                  {staleDeals!.length}
                </span>
              )}
            </div>

            {(staleDeals?.length ?? 0) === 0 ? (
              <div className="bg-card border border-border rounded-xl p-4 text-center text-sm text-muted-foreground">
                No deals stuck for 14+ days.
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl divide-y divide-border">
                {staleDeals!.map(deal => (
                  <div key={deal.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{deal.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {deal.repName} · {DEAL_STAGE_LABELS[deal.stage as import('@/types').DealStage] ?? deal.stage}
                        </p>
                      </div>
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded border flex-shrink-0',
                        deal.daysStuck >= 30
                          ? 'bg-destructive/10 text-destructive border-destructive/20'
                          : 'bg-amber-400/10 text-amber-400 border-amber-400/20'
                      )}>
                        {deal.daysStuck}d stuck
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>
      )}
    </div>
  )
}
