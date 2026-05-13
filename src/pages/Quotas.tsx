import { useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCurrency } from '@/lib/utils'
import { Target, TrendingUp, CheckCircle2 } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import type { Quota } from '@/types'

interface RepRow {
  id: string
  full_name: string | null
  location_id: string | null
  location?: { name: string }[] | { name: string } | null
}

export default function Quotas() {
  const { profile, isOwner, isGM } = useAuth()
  const queryClient = useQueryClient()

  if (!isOwner && !isGM) {
    return <Navigate to="/dashboard" replace />
  }

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const monthStart = startOfMonth(now).toISOString()
  const monthEnd = endOfMonth(now).toISOString()

  // All reps
  const { data: reps } = useQuery({
    queryKey: ['reps-for-quotas', profile?.org_id, profile?.location_id],
    queryFn: async () => {
      let q = supabase
        .from('profiles')
        .select('id, full_name, location_id, location:locations(name)')
        .eq('role', 'rep')
        .order('full_name')
      if (isGM && profile?.location_id) q = q.eq('location_id', profile.location_id)
      const { data } = await q
      return (data ?? []) as RepRow[]
    },
    enabled: !!profile,
  })

  // Current month quotas
  const { data: quotas } = useQuery({
    queryKey: ['quotas', year, month, profile?.org_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('quotas')
        .select('*')
        .eq('period_type', 'monthly')
        .eq('period_year', year)
        .eq('period_month', month)
      return (data ?? []) as Quota[]
    },
    enabled: !!profile,
  })

  // Activities this month per rep
  const { data: activitiesThisMonth } = useQuery({
    queryKey: ['activities-month', year, month],
    queryFn: async () => {
      const { data } = await supabase
        .from('activities')
        .select('rep_id')
        .gte('occurred_at', monthStart)
        .lte('occurred_at', monthEnd)
      return data ?? []
    },
    enabled: !!profile,
  })

  // Paid deals this month per rep
  const { data: dealsThisMonth } = useQuery({
    queryKey: ['deals-paid-month', year, month],
    queryFn: async () => {
      const { data } = await supabase
        .from('deals')
        .select('rep_id, deal_value')
        .eq('stage', 'paid')
        .gte('updated_at', monthStart)
        .lte('updated_at', monthEnd)
      return data ?? []
    },
    enabled: !!profile,
  })

  // Save quota mutation
  const saveQuota = useMutation({
    mutationFn: async ({ repId, field, value }: { repId: string; field: 'target_activities' | 'target_amount'; value: number }) => {
      const existing = (quotas ?? []).find(q => q.rep_id === repId)
      if (existing) {
        await supabase.from('quotas').update({ [field]: value }).eq('id', existing.id)
      } else {
        await supabase.from('quotas').insert({
          rep_id: repId,
          org_id: profile?.org_id,
          location_id: (reps ?? []).find(r => r.id === repId)?.location_id ?? null,
          period_type: 'monthly',
          period_year: year,
          period_month: month,
          [field]: value,
          target_amount: field === 'target_amount' ? value : 0,
          target_activities: field === 'target_activities' ? value : 0,
        })
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quotas'] }),
  })

  // Compute actuals per rep
  function getActualActivities(repId: string) {
    return (activitiesThisMonth ?? []).filter(a => a.rep_id === repId).length
  }

  function getActualRevenue(repId: string) {
    return (dealsThisMonth ?? [])
      .filter(d => d.rep_id === repId)
      .reduce((s, d) => s + (d.deal_value ?? 0), 0)
  }

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">
          {isOwner ? 'OWNER' : 'GM'} · QUOTAS
        </p>
        <h1 className="text-2xl font-bold text-foreground">
          Quotas — {format(now, 'MMMM yyyy')}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Set monthly activity and revenue targets for each rep. Actuals update in real time.
        </p>
      </div>

      {/* Rep cards */}
      {(reps ?? []).length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center">
          <Target className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No reps assigned yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(reps ?? []).map(rep => {
            const quota = (quotas ?? []).find(q => q.rep_id === rep.id)
            const targetActivities = quota?.target_activities ?? 0
            const targetAmount = quota?.target_amount ?? 0
            const actualActivities = getActualActivities(rep.id)
            const actualRevenue = getActualRevenue(rep.id)
            const activityPct = targetActivities > 0 ? Math.min(100, (actualActivities / targetActivities) * 100) : 0
            const revenuePct = targetAmount > 0 ? Math.min(100, (actualRevenue / targetAmount) * 100) : 0
            const locationName = Array.isArray(rep.location) ? rep.location[0]?.name : rep.location?.name

            return (
              <RepCard
                key={rep.id}
                rep={rep}
                locationName={locationName ?? null}
                targetActivities={targetActivities}
                targetAmount={targetAmount}
                actualActivities={actualActivities}
                actualRevenue={actualRevenue}
                activityPct={activityPct}
                revenuePct={revenuePct}
                onSave={(field, value) => saveQuota.mutate({ repId: rep.id, field, value })}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

interface RepCardProps {
  rep: RepRow
  locationName: string | null
  targetActivities: number
  targetAmount: number
  actualActivities: number
  actualRevenue: number
  activityPct: number
  revenuePct: number
  onSave: (field: 'target_activities' | 'target_amount', value: number) => void
}

function RepCard({
  rep, locationName, targetActivities, targetAmount,
  actualActivities, actualRevenue, activityPct, revenuePct, onSave,
}: RepCardProps) {
  const activityInputRef = useRef<HTMLInputElement>(null)
  const revenueInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      {/* Rep header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="font-serif font-semibold text-foreground">{rep.full_name ?? 'Unnamed Rep'}</p>
          {locationName && (
            <p className="text-xs text-muted-foreground">{locationName}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {activityPct >= 100 && revenuePct >= 100 && (
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          )}
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>

      {/* Quota grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Activity target */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Activity Target</p>
          <div className="flex items-center gap-1 mb-2">
            <input
              ref={activityInputRef}
              type="number"
              key={`act-${rep.id}-${targetActivities}`}
              defaultValue={targetActivities}
              onBlur={e => {
                const val = parseInt(e.target.value)
                if (!isNaN(val) && val !== targetActivities) {
                  onSave('target_activities', val)
                }
              }}
              className="w-16 px-2 py-1 bg-transparent border-b border-border text-sm font-semibold text-foreground focus:outline-none focus:border-primary"
              min={0}
            />
            <span className="text-xs text-muted-foreground">visits</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-1">
            <div
              className="h-full bg-primary/40 rounded-full transition-all"
              style={{ width: `${activityPct}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            {actualActivities} of {targetActivities} visits
          </p>
        </div>

        {/* Revenue target */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Revenue Target</p>
          <div className="flex items-center gap-1 mb-2">
            <span className="text-xs text-muted-foreground">$</span>
            <input
              ref={revenueInputRef}
              type="number"
              key={`rev-${rep.id}-${targetAmount}`}
              defaultValue={targetAmount}
              onBlur={e => {
                const val = parseFloat(e.target.value)
                if (!isNaN(val) && val !== targetAmount) {
                  onSave('target_amount', val)
                }
              }}
              className="w-24 px-2 py-1 bg-transparent border-b border-border text-sm font-semibold text-foreground focus:outline-none focus:border-primary"
              min={0}
            />
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-1">
            <div
              className="h-full bg-primary/40 rounded-full transition-all"
              style={{ width: `${revenuePct}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            {formatCurrency(actualRevenue)} of {formatCurrency(targetAmount)}
          </p>
        </div>
      </div>
    </div>
  )
}
