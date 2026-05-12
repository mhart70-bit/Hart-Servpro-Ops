import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { fullName, formatDate, formatCurrency, isOverdue, cn } from '@/lib/utils'
import {
  ChevronLeft, Phone, Mail, MapPin, Plus,
  AlertCircle, CheckCircle, Clock, TrendingUp,
  FileText, Mic, PhoneCall, AtSign, Star,
} from 'lucide-react'
import type { Contact, Activity, Deal, ERPStatus } from '@/types'
import { ERP_STATUS_LABELS, ERP_STATUS_COLORS, OUTCOME_TYPE_LABELS } from '@/types'

// ── Activity type icons ───────────────────────────────────────
const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  visit:      <MapPin className="w-3.5 h-3.5" />,
  call:       <PhoneCall className="w-3.5 h-3.5" />,
  email:      <AtSign className="w-3.5 h-3.5" />,
  note:       <FileText className="w-3.5 h-3.5" />,
  voice_note: <Mic className="w-3.5 h-3.5" />,
}

// ── ERP stage progression ────────────────────────────────────
const ERP_STAGES: ERPStatus[] = [
  'not_introduced',
  'walk_scheduled',
  'verbal_commitment',
  'signed',
]

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, isOwner, isGM } = useAuth()
  const queryClient = useQueryClient()
  const [erpUpdating, setErpUpdating] = useState(false)

  // ── Contact ──────────────────────────────────────────────
  const { data: contact, isLoading: contactLoading } = useQuery({
    queryKey: ['contact', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('*, category:coi_categories(*), location:locations(*), assigned_rep:profiles(*)')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as Contact
    },
    enabled: !!id,
  })

  // ── Activities ───────────────────────────────────────────
  const { data: activities } = useQuery({
    queryKey: ['contact-activities', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('activities')
        .select('*, rep:profiles(full_name)')
        .eq('contact_id', id!)
        .order('occurred_at', { ascending: false })
        .limit(25)
      return (data ?? []) as (Activity & { rep: { full_name: string | null } | null })[]
    },
    enabled: !!id,
  })

  // ── Deals ────────────────────────────────────────────────
  const { data: deals } = useQuery({
    queryKey: ['contact-deals', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('deals')
        .select('*')
        .eq('contact_id', id!)
        .order('created_at', { ascending: false })
      return (data ?? []) as Deal[]
    },
    enabled: !!id,
  })

  // ── ERP update ───────────────────────────────────────────
  const erpMutation = useMutation({
    mutationFn: async (newStatus: ERPStatus) => {
      setErpUpdating(true)
      const updates: Record<string, unknown> = { erp_status: newStatus }
      if (newStatus === 'signed') updates.erp_signed_at = new Date().toISOString()
      const { error } = await supabase
        .from('contacts')
        .update(updates)
        .eq('id', id!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact', id] })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      setErpUpdating(false)
    },
    onError: () => setErpUpdating(false),
  })

  // ── Loading ──────────────────────────────────────────────
  if (contactLoading || !contact) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-24 bg-muted rounded" />
          <div className="h-20 bg-card border border-border rounded-2xl" />
          <div className="h-40 bg-card border border-border rounded-2xl" />
        </div>
      </div>
    )
  }

  const overdue = isOverdue(contact.next_visit_due_at)
  const openDeals = (deals ?? []).filter(d => !['paid', 'lost'].includes(d.stage))
  const pipelineValue = openDeals.reduce((s, d) => s + (d.deal_value ?? 0), 0)
  const erpIdx = ERP_STAGES.indexOf(contact.erp_status ?? 'not_introduced')
  const canEdit = isOwner || isGM || profile?.id === contact.assigned_rep_id

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto pb-24">

      {/* Back nav */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-5 transition-colors"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        Contacts
      </button>

      {/* Hero card */}
      <div className="bg-card border border-border rounded-2xl p-5 mb-4">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-base font-semibold text-muted-foreground flex-shrink-0">
              {(contact.first_name?.[0] ?? contact.company?.[0] ?? '?').toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-serif font-semibold text-foreground leading-tight">
                {fullName(contact) || contact.company || 'Unnamed Contact'}
              </h1>
              {contact.title && (
                <p className="text-sm text-muted-foreground">{contact.title}</p>
              )}
              {contact.company && fullName(contact) && (
                <p className="text-sm text-muted-foreground">{contact.company}</p>
              )}
            </div>
          </div>

          {/* Priority badge */}
          <span className={cn(
            'text-[10px] px-2 py-1 rounded-full border uppercase tracking-wide flex-shrink-0',
            contact.priority === 'high'
              ? 'text-red-400 border-red-400/30 bg-red-400/10'
              : contact.priority === 'medium'
              ? 'text-amber-400 border-amber-400/30 bg-amber-400/10'
              : 'text-muted-foreground border-border'
          )}>
            {contact.priority}
          </span>
        </div>

        {/* Contact details row */}
        <div className="flex flex-wrap gap-x-4 gap-y-2 mb-4">
          {contact.phone && (
            <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors">
              <Phone className="w-3.5 h-3.5" />
              {contact.phone}
            </a>
          )}
          {contact.phone_mobile && contact.phone_mobile !== contact.phone && (
            <a href={`tel:${contact.phone_mobile}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors">
              <Phone className="w-3.5 h-3.5" />
              {contact.phone_mobile} <span className="text-[10px] text-muted-foreground">mobile</span>
            </a>
          )}
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors truncate max-w-full">
              <Mail className="w-3.5 h-3.5 flex-shrink-0" />
              {contact.email}
            </a>
          )}
          {(contact.city || contact.state) && (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="w-3.5 h-3.5" />
              {[contact.city, contact.state].filter(Boolean).join(', ')}
            </span>
          )}
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-2">
          {contact.category && (
            <span className="text-[10px] bg-muted text-muted-foreground px-2 py-1 rounded-full">
              {contact.category.name}
            </span>
          )}
          {contact.location && (
            <span className="text-[10px] bg-muted text-muted-foreground px-2 py-1 rounded-full">
              {contact.location.name}
            </span>
          )}
          <span className={cn(
            'text-[10px] flex items-center gap-1 px-2 py-1 rounded-full',
            overdue
              ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20'
              : 'bg-muted text-muted-foreground'
          )}>
            {overdue ? <AlertCircle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
            {overdue ? 'Overdue — ' : 'Next: '}
            {formatDate(contact.next_visit_due_at)}
          </span>
          {contact.last_contacted_at && (
            <span className="text-[10px] bg-muted text-muted-foreground px-2 py-1 rounded-full flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Last: {formatDate(contact.last_contacted_at)}
            </span>
          )}
        </div>
      </div>

      {/* ERP Status card */}
      <div className="bg-card border border-border rounded-2xl p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">ERP Status</p>
            <span className={cn(
              'text-sm font-medium px-2.5 py-1 rounded-full border',
              ERP_STATUS_COLORS[contact.erp_status ?? 'not_introduced']
            )}>
              {ERP_STATUS_LABELS[contact.erp_status ?? 'not_introduced']}
            </span>
            {contact.erp_signed_at && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Signed {formatDate(contact.erp_signed_at)}
              </p>
            )}
          </div>
          {contact.erp_status === 'signed' && (
            <Star className="w-6 h-6 text-green-400 fill-green-400/30" />
          )}
        </div>

        {/* Progress pipeline */}
        {canEdit && (
          <div className="grid grid-cols-4 gap-1.5">
            {ERP_STAGES.map((stage, i) => (
              <button
                key={stage}
                disabled={erpUpdating}
                onClick={() => erpMutation.mutate(stage)}
                className={cn(
                  'py-1.5 px-1 text-[10px] rounded-lg border transition-all text-center leading-tight',
                  i <= erpIdx
                    ? stage === 'signed'
                      ? 'bg-green-400/20 border-green-400/40 text-green-400 font-medium'
                      : 'bg-primary/20 border-primary/30 text-primary font-medium'
                    : 'bg-muted border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground',
                  erpUpdating && 'opacity-50 cursor-not-allowed'
                )}
              >
                {ERP_STATUS_LABELS[stage]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pipeline summary */}
      {openDeals.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-primary" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Open Pipeline</p>
            <span className="ml-auto text-xl font-serif font-semibold text-primary">
              {formatCurrency(pipelineValue)}
            </span>
          </div>
          <div className="space-y-2">
            {openDeals.map(deal => (
              <div key={deal.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground truncate">
                  {deal.title ?? deal.damage_type ?? 'Untitled deal'}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded capitalize">
                    {deal.stage.replace('_', ' ')}
                  </span>
                  {deal.deal_value && (
                    <span className="text-xs font-medium text-foreground">
                      {formatCurrency(deal.deal_value)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {contact.notes && (
        <div className="bg-card border border-border rounded-2xl p-5 mb-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">Notes</p>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{contact.notes}</p>
        </div>
      )}

      {/* Activity history */}
      <div className="bg-card border border-border rounded-2xl p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Activity History</p>
          <span className="text-xs text-muted-foreground">{(activities ?? []).length} entries</span>
        </div>

        {(activities ?? []).length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">No activities logged yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Tap "Log Activity" to record your first touch.</p>
          </div>
        ) : (
          <div className="space-y-0">
            {(activities ?? []).map((activity, i) => (
              <div key={activity.id} className="flex gap-3 relative">
                {/* Timeline line */}
                {i < (activities ?? []).length - 1 && (
                  <div className="absolute left-4 top-8 bottom-0 w-px bg-border" />
                )}

                {/* Icon dot */}
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 mt-1',
                  activity.flagged
                    ? 'bg-red-400/10 text-red-400 border border-red-400/20'
                    : 'bg-muted text-muted-foreground'
                )}>
                  {ACTIVITY_ICONS[activity.type] ?? <FileText className="w-3.5 h-3.5" />}
                </div>

                {/* Content */}
                <div className={cn('pb-5 flex-1', i === (activities ?? []).length - 1 && 'pb-0')}>
                  <div className="flex items-start justify-between gap-2 mb-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-medium text-foreground capitalize">
                        {activity.type.replace('_', ' ')}
                      </span>
                      {activity.outcome_type && (
                        <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-full">
                          {OUTCOME_TYPE_LABELS[activity.outcome_type]}
                        </span>
                      )}
                      {activity.flagged && (
                        <span className="text-[10px] bg-red-400/10 text-red-400 border border-red-400/20 px-1.5 py-0.5 rounded-full">
                          Flagged
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                      {formatDate(activity.occurred_at)}
                    </span>
                  </div>

                  {activity.outcome && (
                    <p className="text-sm text-foreground mb-1">{activity.outcome}</p>
                  )}
                  {activity.notes && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{activity.notes}</p>
                  )}
                  {activity.follow_up_date && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <Clock className="w-3 h-3 text-primary" />
                      <span className="text-[10px] text-primary">
                        Follow-up: {formatDate(activity.follow_up_date)}
                        {activity.follow_up_action ? ` — ${activity.follow_up_action}` : ''}
                      </span>
                    </div>
                  )}
                  {activity.rep?.full_name && (
                    <p className="text-[10px] text-muted-foreground mt-1">{activity.rep.full_name}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sticky log activity bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-sm border-t border-border md:relative md:p-0 md:border-0 md:bg-transparent md:backdrop-blur-none">
        <Link
          to={`/log?contact_id=${id}`}
          className="flex items-center justify-center gap-2 w-full py-3 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" />
          Log Activity
        </Link>
      </div>
    </div>
  )
}
