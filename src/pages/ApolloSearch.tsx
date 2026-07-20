import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Search, Sparkles, Loader2, Check, Building2 } from 'lucide-react'

const TITLES = [
  'Insurance Agent', 'Property Manager', 'HOA Manager', 'Community Manager',
  'Facility Manager', 'Real Estate Agent', 'General Manager', 'Plumber',
]
const MARKETS: { name: string; apollo: string }[] = [
  { name: 'Amarillo', apollo: 'Amarillo, Texas, US' },
  { name: 'Abilene', apollo: 'Abilene, Texas, US' },
  { name: 'San Angelo', apollo: 'San Angelo, Texas, US' },
  { name: 'Victoria', apollo: 'Victoria, Texas, US' },
  { name: 'Sugar Land', apollo: 'Sugar Land, Texas, US' },
]

interface Result { first_name: string | null; title: string; company: string }

export default function ApolloSearch() {
  const { isOwner } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [title, setTitle] = useState('Insurance Agent')
  const [market, setMarket] = useState('Amarillo')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<Result[] | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [importing, setImporting] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  if (!isOwner) return <Navigate to="/dashboard" replace />

  async function runSearch() {
    setSearching(true); setErr(null); setResults(null); setSelected(new Set()); setSummary(null)
    const apollo = MARKETS.find(m => m.name === market)?.apollo ?? `${market}, Texas, US`
    const { data, error } = await supabase.functions.invoke('apollo-search', { body: { title, apolloLocation: apollo } })
    setSearching(false)
    if (error || data?.error) { setErr(data?.error ?? 'Search failed. Try again.'); return }
    setResults(data.results as Result[])
    setSelected(new Set((data.results as Result[]).map((_, i) => i))) // pre-select all
  }

  function toggle(i: number) {
    setSelected(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })
  }

  async function runImport() {
    if (!results || selected.size === 0) return
    setImporting(true); setErr(null); setSummary(null)
    const picks = [...selected].map(i => results[i])
    const { data, error } = await supabase.functions.invoke('apollo-import', { body: { market, selections: picks } })
    setImporting(false)
    if (error || data?.error) { setErr(data?.error ?? 'Import failed.'); return }
    setSummary(`Added ${data.imported} contact${data.imported !== 1 ? 's' : ''} to your ${market} book${data.skipped ? ` · ${data.skipped} were already in it` : ''}${data.failed ? ` · ${data.failed} couldn't be added` : ''}.`)
    setResults(null); setSelected(new Set())
    queryClient.invalidateQueries({ queryKey: ['contacts'] })
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-[10px] uppercase tracking-widest text-primary font-medium">Find Contacts · Apollo</span>
        </div>
        <h1 className="text-3xl font-serif font-semibold text-foreground">Find new COIs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Prospect Apollo's database for new referral partners and <strong className="text-foreground">copy the ones you want into your CRM</strong>. Apollo is just the source — importing adds them to the chosen market's contact list (with address and phone filled in), where your rep can work them. Nothing is added until you review and confirm.
        </p>
      </div>

      {/* Search form */}
      <div className="bg-card border border-border rounded-2xl p-5 mb-5">
        <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Type</label>
            <select value={title} onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
              {TITLES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Market</label>
            <select value={market} onChange={e => setMarket(e.target.value)}
              className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
              {MARKETS.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
          </div>
          <button onClick={runSearch} disabled={searching}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-medium rounded-lg transition-colors">
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Search
          </button>
        </div>
      </div>

      {err && <div className="mb-4 px-3 py-2 bg-red-400/10 border border-red-400/20 rounded-lg text-sm text-red-400">{err}</div>}
      {summary && (
        <div className="mb-4 px-4 py-3 bg-primary/10 border border-primary/25 rounded-xl text-sm text-foreground flex items-center justify-between gap-3 flex-wrap">
          <span className="flex items-center gap-2"><Check className="w-4 h-4 text-primary flex-shrink-0" /> {summary}</span>
          <button
            onClick={() => navigate('/contacts')}
            className="text-xs font-medium text-primary hover:underline flex-shrink-0"
          >
            View in All Contacts →
          </button>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <button onClick={() => setSelected(selected.size === results.length ? new Set() : new Set(results.map((_, i) => i)))}
                className="text-xs text-muted-foreground hover:text-foreground">
                {selected.size === results.length ? 'Clear all' : 'Select all'}
              </button>
              <span className="text-xs text-muted-foreground">{selected.size} of {results.length} selected</span>
            </div>
            <button onClick={runImport} disabled={importing || selected.size === 0}
              className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground text-xs font-medium rounded-full transition-colors">
              {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Import {selected.size} to {market}
            </button>
          </div>
          {results.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">No results — try a different type or market.</p>
          ) : (
            <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
              {results.map((r, i) => (
                <label key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40 cursor-pointer">
                  <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)}
                    className="w-4 h-4 accent-primary flex-shrink-0" />
                  <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{r.company}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.first_name ? `${r.first_name} · ` : ''}{r.title}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {results === null && !summary && !err && (
        <p className="text-center text-xs text-muted-foreground mt-8">
          Pick a type and market, then Search. Nothing is added until you review and import.
        </p>
      )}
    </div>
  )
}
