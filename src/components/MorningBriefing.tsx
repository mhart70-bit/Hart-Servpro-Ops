import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Sunrise, RefreshCw } from 'lucide-react'

async function fetchBriefing(refresh = false): Promise<string> {
  const { data, error } = await supabase.functions.invoke('plan-day', {
    body: { refresh },
  })
  if (error) {
    if ('context' in error && error.context instanceof Response) {
      try {
        const b = await error.context.json()
        if (b?.error) throw new Error(b.error)
      } catch { /* fall through */ }
    }
    throw new Error('Could not load your briefing. Try again in a moment.')
  }
  if (data?.error) throw new Error(data.error)
  return data.content as string
}

export default function MorningBriefing() {
  const { profile } = useAuth()
  const [regenerating, setRegenerating] = useState(false)
  const [override, setOverride] = useState<string | null>(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['morning-briefing', profile?.id],
    queryFn: () => fetchBriefing(false),
    enabled: !!profile,
    staleTime: 1000 * 60 * 60, // once fetched, treat as fresh for the session
    retry: false,
  })

  async function regenerate() {
    setRegenerating(true)
    try {
      setOverride(await fetchBriefing(true))
    } catch {
      refetch()
    } finally {
      setRegenerating(false)
    }
  }

  const content = override ?? data

  return (
    <div className="mb-8 bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/25 rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Sunrise className="w-4 h-4 text-primary" />
          <span className="text-[10px] uppercase tracking-widest text-primary font-semibold">
            Your morning briefing
          </span>
        </div>
        <button
          onClick={regenerate}
          disabled={regenerating || isLoading}
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${regenerating ? 'animate-spin' : ''}`} />
          {regenerating ? 'Rewriting…' : 'Regenerate'}
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <div className="w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
          Writing your briefing from today's book…
        </div>
      ) : error ? (
        <p className="text-sm text-muted-foreground py-2">
          {error instanceof Error ? error.message : 'Briefing unavailable right now.'}
        </p>
      ) : (
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{content}</p>
      )}
    </div>
  )
}
