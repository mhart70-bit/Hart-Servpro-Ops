import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCurrency, fullName, DEAL_STAGE_LABELS, DEAL_STAGE_ORDER } from '@/lib/utils'
import { Plus, TrendingUp, DollarSign, Target, ChevronRight } from 'lucide-react'
import type { Deal, DealStage, DamageType } from '@/types'

const STAGE_COLORS: Record<DealStage, string> = {
  emergency_call: 'bg-red-400/10 text-red-400 border-red-400/20',
  assessment: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
  estimate: 'bg-blue-400/10 text-blue-400 border-blue-400/20',
  approved: 'bg-purple-400/10 text-purple-400 border-purple-400/20',
  job_start: 'bg-cyan-400/10 text-cyan-400 border-cyan-400/20',
  completion: 'bg-teal-400/10 text-teal-400 border-teal-400/20',
  invoiced: 'bg-orange-400/10 text-orange-400 border-orange-400/20',
  paid: 'bg-secondary text-muted-foreground border-border',
  lost: 'bg-slate-400/10 text-slate-400 border-slate-400/20',
}

export default function Sales() {
  const { profile, isOwner, isGM } = useAuth()
  const queryClient = useQueryClient()
  const [stageFilter, setStageFilter] = useState<DealStage | 'all'>('all')
  const [showForm, setShowForm] = useState(false)
  const [dealError, setDealError] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '', deal_value: '', damage_type: '' as DamageType | '',
    stage: 'emergency_call' as DealStage, insurance_claim_number: '',
    insurance_carrier: '', property_address: '',
    property_type: 'residential' as 'residential' | 'commercial' | 'industrial',
    emergency_priority: false, notes: '',
  })

  const { data: deals, isLoading } = useQuery({
    queryKey: ['deals', profile?.id, isOwner, stageFilter],
    queryFn: async () => {
      let q = supabase
        .from('deals')
        .select('*, contact:contacts(first_name, last_name, company), rep:profiles(full_name), location:locations(name)')
        .order('created_at', { ascending: false })
      if (!isOwner && !isGM && profile?.id) q = q.eq('rep_id', profile.id)
      if (stageFilter !== 'all') q = q.eq('stage', stageFilter)
      const { data } = await q
      return (data ?? []) as Deal[]
    },
    enabled: !!profile,
  })

  // MTD stats
  const { data: stats } = useQuery({
    queryKey: ['sales-stats', profile?.id, isOwner],
    queryFn: async () => {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      let q = supabase.from('deals').select('deal_value, stage').gte('created_at', monthStart)
      if (!isOwner && !isGM && profile?.id) q = q.eq('rep_id', profile.id)
      const { data } = await q
      const all = data ?? []
      return {
        mtd: all.filter(d => d.stage === 'paid').reduce((s, d) => s + (d.deal_value ?? 0), 0),
        pipeline: all.filter(d => !['paid','lost'].includes(d.stage)).reduce((s, d) => s + (d.deal_value ?? 0), 0),
        open: all.filter(d => !['paid','lost'].includes(d.stage)).length,
      }
    },
    enabled: !!profile,
  })

  const advanceStageMutation = useMutation({
    mutationFn: async ({ id, currentStage }: { id: string; currentStage: DealStage }) => {
      const idx = DEAL_STAGE_ORDER.indexOf(currentStage)
      if (idx === -1 || idx >= DEAL_STAGE_ORDER.length - 1) return
      const nextStage = DEAL_STAGE_ORDER[idx + 1]
      const { error } = await supabase.from('deals').update({ stage: nextStage, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deals'] }),
  })

  async function handleSaveDeal() {
    setDealError(null)
    const { error } = await supabase.from('deals').insert({
      org_id: profile?.org_id,
      location_id: profile?.location_id,
      rep_id: profile?.id,
      title: form.title || null,
      deal_value: form.deal_value ? parseFloat(form.deal_value) : null,
      damage_type: form.damage_type || null,
      stage: form.stage,
      insurance_claim_number: form.insurance_claim_number || null,
      insurance_carrier: form.insurance_carrier || null,
      property_address: form.property_address || null,
      property_type: form.property_type,
      emergency_priority: form.emergency_priority,
      notes: form.notes || null,
    })
    if (error) {
      setDealError(error.message)
      return
    }
    queryClient.invalidateQueries({ queryKey: ['deals'] })
    setShowForm(false)
  }

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sales</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Pipeline & closed deals</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New deal
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-card border border-border rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Sales MTD</span>
          </div>
          <div className="text-xl font-bold text-foreground">{formatCurrency(stats?.mtd ?? 0)}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Pipeline</span>
          </div>
          <div className="text-xl font-bold text-foreground">{formatCurrency(stats?.pipeline ?? 0)}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Target className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Open</span>
          </div>
          <div className="text-xl font-bold text-foreground">{stats?.open ?? 0}</div>
        </div>
      </div>

      {/* Stage filter */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 scrollbar-none">
        {(['all', ...DEAL_STAGE_ORDER] as const).map(s => (
          <button
            key={s}
            onClick={() => setStageFilter(s as DealStage | 'all')}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              stageFilter === s ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {s === 'all' ? 'All' : DEAL_STAGE_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Deal list */}
      <div className="space-y-2">
        {isLoading ? (
          [1,2,3].map(i => <div key={i} className="h-20 bg-card rounded-xl border border-border animate-pulse" />)
        ) : (deals ?? []).length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
            No deals yet. Log an activity with a deal value, or add one manually.
          </div>
        ) : (
          (deals ?? []).map(deal => {
            const stageIdx = DEAL_STAGE_ORDER.indexOf(deal.stage)
            const canAdvance = stageIdx >= 0 && stageIdx < DEAL_STAGE_ORDER.length - 1
            const contactLabel = deal.contact ? fullName(deal.contact) : null

            return (
              <div key={deal.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">
                        {deal.title ?? (deal.damage_type ? `${deal.damage_type.charAt(0).toUpperCase() + deal.damage_type.slice(1)} damage` : 'Untitled deal')}
                      </span>
                      {deal.emergency_priority && (
                        <span className="text-[10px] bg-red-400/10 text-red-400 border border-red-400/20 px-1.5 py-0.5 rounded">EMERGENCY</span>
                      )}
                    </div>
                    {contactLabel && <p className="text-xs text-muted-foreground mt-0.5">{contactLabel}</p>}
                    {(isOwner || isGM) && deal.rep?.full_name && (
                      <p className="text-xs text-muted-foreground/60">{deal.rep.full_name} · {deal.location?.name}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-base font-bold text-foreground">{formatCurrency(deal.deal_value)}</div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STAGE_COLORS[deal.stage]}`}>
                      {DEAL_STAGE_LABELS[deal.stage]}
                    </span>
                  </div>
                </div>

                {/* Stage progress bar */}
                <div className="mt-3 flex gap-0.5">
                  {DEAL_STAGE_ORDER.map((s, i) => (
                    <div key={s} className={`flex-1 h-1 rounded-full transition-colors ${
                      i <= stageIdx ? 'bg-primary' : 'bg-muted'
                    }`} />
                  ))}
                </div>

                {canAdvance && (
                  <button
                    onClick={() => advanceStageMutation.mutate({ id: deal.id, currentStage: deal.stage })}
                    className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                    Advance to {DEAL_STAGE_LABELS[DEAL_STAGE_ORDER[stageIdx + 1]]}
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* New Deal Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70">
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-card">
              <h2 className="text-base font-semibold text-foreground">New Deal</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground text-lg">×</button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Title / Description</label>
                <input value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))}
                  placeholder="e.g. Water damage — Smith residence"
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Deal value ($)</label>
                  <input type="number" value={form.deal_value} onChange={e => setForm(f => ({...f, deal_value: e.target.value}))}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Damage type</label>
                  <select value={form.damage_type} onChange={e => setForm(f => ({...f, damage_type: e.target.value as DamageType | ''}))}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                    <option value="">Select…</option>
                    {['water','fire','mold','storm','biohazard','other'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Stage</label>
                <select value={form.stage} onChange={e => setForm(f => ({...f, stage: e.target.value as DealStage}))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                  {DEAL_STAGE_ORDER.map(s => <option key={s} value={s}>{DEAL_STAGE_LABELS[s]}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Insurance claim #</label>
                  <input value={form.insurance_claim_number} onChange={e => setForm(f => ({...f, insurance_claim_number: e.target.value}))}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Carrier</label>
                  <input value={form.insurance_carrier} onChange={e => setForm(f => ({...f, insurance_carrier: e.target.value}))}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Property address</label>
                <input value={form.property_address} onChange={e => setForm(f => ({...f, property_address: e.target.value}))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.emergency_priority} onChange={e => setForm(f => ({...f, emergency_priority: e.target.checked}))}
                  className="rounded" />
                <span className="text-sm text-foreground">Emergency priority</span>
              </label>
            </div>
            {dealError && (
              <div className="px-5 pb-3">
                <div className="px-3 py-2 bg-red-400/10 border border-red-400/20 rounded-lg">
                  <p className="text-xs text-red-400">{dealError}</p>
                </div>
              </div>
            )}
            <div className="px-5 py-4 border-t border-border flex gap-2 sticky bottom-0 bg-card">
              <button onClick={() => { setShowForm(false); setDealError(null) }} className="flex-1 py-2 text-sm text-muted-foreground bg-muted rounded-lg">Cancel</button>
              <button onClick={handleSaveDeal} className="flex-1 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors">Save deal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
