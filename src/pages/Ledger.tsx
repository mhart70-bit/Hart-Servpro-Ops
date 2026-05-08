import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatRelative } from '@/lib/utils'
import { BookOpen, Search, AlertTriangle, Flag } from 'lucide-react'

interface LedgerEntry {
  id: string
  notes: string | null
  raw_transcript: string | null
  outcome: string | null
  confidence_score: number | null
  flagged: boolean
  flagged_reason: string | null
  occurred_at: string
  type: string | null
  follow_up_date: string | null
  contact: { first_name: string | null; last_name: string | null; company: string | null } | null
  rep: { full_name: string | null } | null
  location: { name: string | null } | null
}

const MARKETS = ['Amarillo', 'Abilene', 'Sugar Land', 'San Angelo', 'Victoria']

export default function Ledger() {
  const { isOwner, isGM, profile } = useAuth()
  const [search, setSearch] = useState('')
  const [marketFilter, setMarketFilter] = useState('all')

  const { data: entries, isLoading } = useQuery({
    queryKey: ['ledger', profile?.id, isOwner, isGM],
    queryFn: async () => {
      let q = supabase
        .from('activities')
        .select('*, contact:contacts(first_name, last_name, company), rep:profiles(full_name), location:locations(name)')
        .order('occurred_at', { ascending: false })
        .limit(200)

      if (!isOwner && !isGM && profile?.id) q = q.eq('rep_id', profile.id)
      else if (isGM && profile?.location_id) q = q.eq('location_id', profile.location_id)

      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as LedgerEntry[]
    },
    enabled: !!profile,
  })

  const filtered = (entries ?? []).filter(e => {
    const s = search.toLowerCase()
    const matchSearch = !s || [
      e.notes, e.raw_transcript, e.outcome,
      e.contact?.first_name, e.contact?.last_name, e.contact?.company,
      e.rep?.full_name,
    ].some(v => v?.toLowerCase().includes(s))
    const matchMarket = marketFilter === 'all' || e.location?.name === marketFilter
    return matchSearch && matchMarket
  })

  const confidence = (score: number | null) => {
    if (score == null) return { label: '—', cls: 'text-muted-foreground' }
    const pct = Math.round(score * 100)
    if (pct >= 80) return { label: `High · ${pct}%`, cls: 'text-primary' }
    if (pct >= 60) return { label: `Mid · ${pct}%`, cls: 'text-amber-400' }
    return { label: `Low · ${pct}%`, cls: 'text-destructive' }
  }

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="w-4 h-4 text-primary" />
          <span className="text-[10px] text-primary uppercase tracking-widest font-medium">Master Sales Ledger</span>
        </div>
        <h1 className="text-3xl font-serif font-semibold text-foreground">Every note. Forever.</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-lg">
          A permanent, append-only archive of every submission — so you can see where the AI was sure, and where a human needs to look.
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by contact, company, stage, or transcript…"
            className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        {(isOwner || isGM) && (
          <select
            value={marketFilter}
            onChange={e => setMarketFilter(e.target.value)}
            className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">All markets</option>
            {MARKETS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
      </div>

      {/* Entry count */}
      <p className="text-xs text-muted-foreground mb-4">{filtered.length} entr{filtered.length === 1 ? 'y' : 'ies'}</p>

      {/* Entries */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <h3 className="text-base font-serif text-foreground mb-1">No notes yet</h3>
          <p className="text-sm text-muted-foreground">
            Once your team begins submitting field notes, every entry will appear here — and stay here — permanently.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(entry => {
            const conf = confidence(entry.confidence_score)
            const contactName = [entry.contact?.first_name, entry.contact?.last_name].filter(Boolean).join(' ')
            const headline = entry.contact?.company || contactName || 'Untitled lead'
            const subline = entry.contact?.company ? contactName : null

            return (
              <div key={entry.id} className="bg-card border border-border rounded-xl p-4">
                {/* Top row */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
                        {entry.location?.name ?? 'Unknown'} · {entry.rep?.full_name ?? 'Unknown rep'}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatRelative(entry.occurred_at)}
                      </span>
                    </div>
                    {entry.flagged && (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded mr-2 mb-1">
                        <Flag className="w-2.5 h-2.5" /> Flagged
                      </span>
                    )}
                    <h3 className="text-base font-serif font-medium text-foreground">{headline}</h3>
                    {subline && <p className="text-xs text-muted-foreground">{subline}</p>}
                  </div>
                  <span className={`text-xs font-medium flex-shrink-0 ${conf.cls}`}>{conf.label}</span>
                </div>

                {/* Note text */}
                {entry.notes && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{entry.notes}</p>
                )}

                {/* Metadata */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                  {entry.type && (
                    <span className="text-[10px] text-muted-foreground">
                      <span className="text-foreground/50">Type</span> {entry.type}
                    </span>
                  )}
                  {entry.outcome && (
                    <span className="text-[10px] text-muted-foreground">
                      <span className="text-foreground/50">Outcome</span> {entry.outcome}
                    </span>
                  )}
                  {entry.follow_up_date && (
                    <span className="text-[10px] text-muted-foreground">
                      <span className="text-foreground/50">Follow-up</span> {entry.follow_up_date}
                    </span>
                  )}
                </div>

                {/* Flagged reason */}
                {entry.flagged && entry.flagged_reason && (
                  <div className="mt-2 flex items-start gap-1.5 p-2 bg-primary/5 border border-primary/15 rounded-lg">
                    <AlertTriangle className="w-3 h-3 text-primary flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-primary">{entry.flagged_reason}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
