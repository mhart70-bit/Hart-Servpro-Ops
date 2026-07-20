import { useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { fullName, formatDate, formatCurrency, isOverdue, cn } from '@/lib/utils'
import {
  ChevronLeft, Phone, Mail, MapPin, Plus,
  AlertCircle, CheckCircle, Clock, TrendingUp,
  FileText, Mic, PhoneCall, AtSign, Star, ArrowRight, Edit2,
} from 'lucide-react'
import type { Contact, Activity, Deal, ERPStatus, Priority } from '@/types'
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
  const [nextStepSaving, setNextStepSaving] = useState(false)
  const nextStepRef = useRef<HTMLTextAreaElement>(null)

  // Edit contact state
  const [showEdit, setShowEdit] = useState(false)
  const [editContact, setEditContact] = useState<{
    first_name: string; last_name: string; company: string; title: string;
    phone: string; phone_mobile: string; email: string; address: string;
    city: string; state: string; priority: Priority; visit_frequency_days: string;
    category_id: string;
  }>({
    first_name: '', last_name: '', company: '', title: '',
    phone: '', phone_mobile: '', email: '', address: '',
    city: '', state: 'TX', priority: 'medium', visit_frequency_days: '30',
    category_id: '',
  })
  const [editContactError, setEditContactError] = useState<string | null>(null)

  // Re-link activity state
  const [relinkActivityId, setRelinkActivityId] = useState<string | null>(null)
  const [relinkSearch, setRelinkSearch] = useState('')

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

  // ── COI Categories (for edit form) ───────────────────────
  const { data: categories } = useQuery({
    queryKey: ['coi-categories'],
    queryFn: async () => {
      const { data } = await supabase.from('coi_categories').select('*').order('name')
      return data ?? []
    },
  })

  // ── All contacts (for re-link picker) ────────────────────
  const { data: allContacts } = useQuery({
    queryKey: ['contacts-for-relink'],
    queryFn: async () => {
      let q = supabase.from('contacts').select('id, first_name, last_name, company').eq('is_active', true).order('last_name').limit(200)
      if (profile?.role === 'rep' && profile.location_id) q = q.eq('location_id', profile.location_id)
      const { data } = await q
      return data ?? []
    },
    enabled: relinkActivityId != null,
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

  // ── Open edit form ────────────────────────────────────────
  function openEdit() {
    if (!contact) return
    setEditContact({
      first_name: contact.first_name ?? '',
      last_name: contact.last_name ?? '',
      company: contact.company ?? '',
      title: contact.title ?? '',
      phone: contact.phone ?? '',
      phone_mobile: contact.phone_mobile ?? '',
      email: contact.email ?? '',
      address: contact.address ?? '',
      city: contact.city ?? '',
      state: contact.state ?? 'TX',
      priority: contact.priority ?? 'medium',
      visit_frequency_days: (contact.visit_frequency_days ?? 30).toString(),
      category_id: contact.category_id ?? '',
    })
    setEditContactError(null)
    setShowEdit(true)
  }

  // ── Update contact mutation ───────────────────────────────
  const updateContactMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('contacts').update({
        first_name: editContact.first_name || null,
        last_name: editContact.last_name || null,
        company: editContact.company || null,
        title: editContact.title || null,
        phone: editContact.phone || null,
        phone_mobile: editContact.phone_mobile || null,
        email: editContact.email || null,
        address: editContact.address || null,
        city: editContact.city || null,
        state: editContact.state || null,
        priority: editContact.priority,
        visit_frequency_days: parseInt(editContact.visit_frequency_days) || 30,
        category_id: editContact.category_id || null,
        updated_at: new Date().toISOString(),
      }).eq('id', id!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact', id] })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      setShowEdit(false)
    },
    onError: (err) => setEditContactError(err instanceof Error ? err.message : 'Failed to save'),
  })

  // ── Re-link activity mutation ─────────────────────────────
  const relinkMutation = useMutation({
    mutationFn: async ({ activityId, contactId }: { activityId: string; contactId: string }) => {
      const { error } = await supabase.from('activities').update({ contact_id: contactId }).eq('id', activityId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-activities', id] })
      setRelinkActivityId(null)
      setRelinkSearch('')
    },
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

  // ── Next Step save ───────────────────────────────────────
  const [nextStepError, setNextStepError] = useState<string | null>(null)
  async function handleNextStepBlur() {
    const value = nextStepRef.current?.value ?? ''
    const current = contact?.notes ?? ''
    if (value === current) return
    setNextStepSaving(true)
    setNextStepError(null)
    const { error } = await supabase.from('contacts').update({ notes: value || null }).eq('id', id!)
    if (error) {
      setNextStepError('Could not save — check your connection and click into the field to retry.')
    } else {
      queryClient.invalidateQueries({ queryKey: ['contact', id] })
    }
    setNextStepSaving(false)
  }

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

          <div className="flex items-center gap-2 flex-shrink-0">
            {canEdit && (
              <button
                onClick={openEdit}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20 px-2.5 py-1.5 rounded-lg transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Edit
              </button>
            )}

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

      {/* Next Step — always visible, auto-saves on blur */}
      <div className="bg-card border border-primary/30 rounded-2xl p-5 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <ArrowRight className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <p className="text-[10px] text-primary uppercase tracking-widest font-semibold">Next Step</p>
          {nextStepSaving && (
            <span className="ml-auto text-[10px] text-muted-foreground">Saving…</span>
          )}
        </div>
        {nextStepError && (
          <p className="text-[11px] text-red-400 mb-1">{nextStepError}</p>
        )}
        <textarea
          ref={nextStepRef}
          key={contact.id}
          defaultValue={contact.notes ?? ''}
          onBlur={handleNextStepBlur}
          rows={2}
          placeholder="What's the next action for this contact?"
          className="w-full bg-transparent text-sm text-foreground placeholder-muted-foreground resize-none focus:outline-none leading-relaxed"
        />
      </div>

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
                  <button
                    onClick={() => { setRelinkActivityId(activity.id); setRelinkSearch('') }}
                    className="text-[10px] text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20 px-1.5 py-0.5 rounded transition-colors mt-1"
                  >
                    Re-link contact
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Contact Edit Modal */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70">
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-card z-10">
              <h2 className="text-base font-semibold text-foreground">Edit Contact</h2>
              <button onClick={() => setShowEdit(false)} className="text-muted-foreground hover:text-foreground text-lg">×</button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">First name</label>
                  <input value={editContact.first_name} onChange={e => setEditContact(f => ({...f, first_name: e.target.value}))}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Last name</label>
                  <input value={editContact.last_name} onChange={e => setEditContact(f => ({...f, last_name: e.target.value}))}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Company</label>
                <input value={editContact.company} onChange={e => setEditContact(f => ({...f, company: e.target.value}))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Title</label>
                <input value={editContact.title} onChange={e => setEditContact(f => ({...f, title: e.target.value}))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Phone</label>
                  <input type="tel" value={editContact.phone} onChange={e => setEditContact(f => ({...f, phone: e.target.value}))}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Mobile phone</label>
                  <input type="tel" value={editContact.phone_mobile} onChange={e => setEditContact(f => ({...f, phone_mobile: e.target.value}))}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Email</label>
                <input type="email" value={editContact.email} onChange={e => setEditContact(f => ({...f, email: e.target.value}))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Address</label>
                <input value={editContact.address} onChange={e => setEditContact(f => ({...f, address: e.target.value}))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">City</label>
                  <input value={editContact.city} onChange={e => setEditContact(f => ({...f, city: e.target.value}))}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">State</label>
                  <input value={editContact.state} onChange={e => setEditContact(f => ({...f, state: e.target.value}))}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Category</label>
                <select value={editContact.category_id} onChange={e => setEditContact(f => ({...f, category_id: e.target.value}))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="">None</option>
                  {(categories ?? []).map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Priority</label>
                <select value={editContact.priority} onChange={e => setEditContact(f => ({...f, priority: e.target.value as Priority}))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Visit frequency (days)</label>
                <input type="number" value={editContact.visit_frequency_days} onChange={e => setEditContact(f => ({...f, visit_frequency_days: e.target.value}))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            </div>
            {editContactError && (
              <div className="px-5 pb-3">
                <p className="text-xs text-red-400 px-3 py-2 bg-red-400/10 border border-red-400/20 rounded-lg">{editContactError}</p>
              </div>
            )}
            <div className="px-5 py-4 border-t border-border flex gap-2 sticky bottom-0 bg-card">
              <button onClick={() => setShowEdit(false)} className="flex-1 py-2 text-sm text-muted-foreground bg-muted rounded-lg">Cancel</button>
              <button onClick={() => updateContactMutation.mutate()} disabled={updateContactMutation.isPending}
                className="flex-1 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 disabled:opacity-50 rounded-lg">
                {updateContactMutation.isPending ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Re-link activity modal */}
      {relinkActivityId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-serif font-semibold text-foreground">Re-link activity</h3>
              <button onClick={() => setRelinkActivityId(null)} className="text-muted-foreground hover:text-foreground">×</button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Search for the correct contact to link this activity to.</p>
            <input
              autoFocus
              value={relinkSearch}
              onChange={e => setRelinkSearch(e.target.value)}
              placeholder="Search contacts…"
              className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20 mb-2"
            />
            <div className="max-h-48 overflow-y-auto space-y-1">
              {(allContacts ?? [])
                .filter(c => {
                  const s = relinkSearch.toLowerCase()
                  return !s || [c.first_name, c.last_name, c.company].some(v => v?.toLowerCase().includes(s))
                })
                .slice(0, 10)
                .map(c => (
                  <button
                    key={c.id}
                    onClick={() => relinkMutation.mutate({ activityId: relinkActivityId, contactId: c.id })}
                    className="w-full text-left px-3 py-2 hover:bg-muted rounded-lg transition-colors"
                  >
                    <p className="text-sm font-medium text-foreground">{[c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed'}</p>
                    {c.company && <p className="text-xs text-muted-foreground">{c.company}</p>}
                  </button>
                ))}
              {relinkSearch.length > 0 && (allContacts ?? []).filter(c => {
                const s = relinkSearch.toLowerCase()
                return [c.first_name, c.last_name, c.company].some(v => v?.toLowerCase().includes(s))
              }).length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No contacts found</p>
              )}
            </div>
          </div>
        </div>
      )}

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
