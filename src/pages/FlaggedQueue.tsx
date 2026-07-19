import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatRelative } from '@/lib/utils'
import { ShieldAlert, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Navigate } from 'react-router-dom'

interface FlaggedEntry {
  id: string
  notes: string | null
  raw_transcript: string | null
  confidence_score: number | null
  flagged_reason: string | null
  occurred_at: string
  contact: { first_name: string | null; last_name: string | null; company: string | null } | null
  rep: { full_name: string | null } | null
  location: { name: string | null } | null
}

export default function FlaggedQueue() {
  const { isOwner, isGM } = useAuth()
  const queryClient = useQueryClient()
  const [cleared, setCleared] = useState<Set<string>>(new Set())

  const { data: entries, isLoading } = useQuery({
    queryKey: ['flagged-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activities')
        .select('*, contact:contacts(first_name, last_name, company), rep:profiles(full_name), location:locations(name)')
        .eq('flagged', true)
        .order('occurred_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as FlaggedEntry[]
    },
    enabled: isOwner || isGM,
  })

  const clearMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('activities')
        .update({ flagged: false, flagged_reason: null })
        .eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: (id) => {
      setCleared(prev => new Set([...prev, id]))
      queryClient.invalidateQueries({ queryKey: ['flagged-queue'] })
      queryClient.invalidateQueries({ queryKey: ['dash-flagged'] })
    },
  })

  if (!isOwner && !isGM) return <Navigate to="/dashboard" replace />

  const visible = (entries ?? []).filter(e => !cleared.has(e.id))

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <ShieldAlert className="w-4 h-4 text-primary" />
          <span className="text-[10px] text-primary uppercase tracking-widest font-medium">Owner · Review queue</span>
        </div>
        <h1 className="text-3xl font-serif font-semibold text-foreground">Flagged for review</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-lg">
          These are the notes where the AI's confidence landed below 70%. A quick glance from you is all they need — the record itself never leaves the ledger.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-28 bg-card border border-border rounded-xl animate-pulse" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <CheckCircle2 className="w-10 h-10 text-primary mx-auto mb-3" />
          <h3 className="text-lg font-serif font-semibold text-foreground mb-1">Queue is clear</h3>
          <p className="text-sm text-muted-foreground">
            Every note the team submitted parsed cleanly. Nothing needs your attention right now.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(entry => {
            const contactName = [entry.contact?.first_name, entry.contact?.last_name].filter(Boolean).join(' ')
            const headline = entry.contact?.company || contactName || 'Untitled lead'
            const pct = entry.confidence_score != null ? Math.round(entry.confidence_score * 100) : null

            return (
              <div key={entry.id} className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
                        {entry.location?.name ?? '—'} · {entry.rep?.full_name ?? 'Unknown rep'}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{formatRelative(entry.occurred_at)}</span>
                    </div>
                    <h3 className="text-base font-serif font-medium text-foreground">{headline}</h3>
                  </div>
                  {pct != null && (
                    <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full flex-shrink-0">
                      Confidence {pct}%
                    </span>
                  )}
                </div>

                {/* Transcript */}
                {entry.raw_transcript && (
                  <p className="text-sm text-muted-foreground italic mb-3 line-clamp-3">
                    "{entry.raw_transcript}"
                  </p>
                )}

                {/* AI note */}
                {entry.flagged_reason && (
                  <div className="flex items-start gap-2 p-3 bg-primary/5 border border-primary/15 rounded-lg mb-3">
                    <AlertTriangle className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] font-medium text-primary uppercase tracking-widest">AI note: </span>
                      <span className="text-xs text-primary">{entry.flagged_reason}</span>
                    </div>
                  </div>
                )}

                {/* Action */}
                <button
                  onClick={() => clearMutation.mutate(entry.id)}
                  disabled={clearMutation.isPending}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border hover:border-primary/30 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Mark reviewed
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
