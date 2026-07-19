import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { fullName, formatDate, isOverdue, cn } from '@/lib/utils'
import { Search, Plus, AlertCircle, CheckCircle, ChevronRight, Download, Zap } from 'lucide-react'
import type { Contact, COICategory, Priority, ERPStatus } from '@/types'
import { ERP_STATUS_LABELS, ERP_STATUS_COLORS } from '@/types'
import QuickLogModal from '@/components/QuickLogModal'

function exportContactsCSV(contacts: Contact[]) {
  const headers = [
    'First Name', 'Last Name', 'Company', 'Phone', 'Email',
    'City', 'State', 'Category', 'Priority', 'ERP Status',
    'Last Contacted', 'Next Visit Due', 'Assigned Rep',
  ]
  const rows = contacts.map(c => [
    c.first_name ?? '',
    c.last_name ?? '',
    c.company ?? '',
    c.phone ?? '',
    c.email ?? '',
    c.city ?? '',
    c.state ?? '',
    (c.category as COICategory | null)?.name ?? '',
    c.priority ?? '',
    c.erp_status ?? '',
    c.last_contacted_at ? new Date(c.last_contacted_at).toLocaleDateString() : '',
    c.next_visit_due_at ? new Date(c.next_visit_due_at).toLocaleDateString() : '',
    (c.assigned_rep as { full_name?: string | null } | null)?.full_name ?? '',
  ])
  const csv = [headers, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

interface ContactFormData {
  first_name: string
  last_name: string
  company: string
  phone: string
  city: string
  category_id: string
  location_id: string
}

const EMPTY_FORM: ContactFormData = {
  first_name: '', last_name: '', company: '',
  phone: '', city: '', category_id: '', location_id: '',
}

export default function Contacts() {
  const { profile, isOwner, isGM } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  type StatusFilter = 'all' | 'overdue' | 'due-week' | 'high-priority'
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [erpFilter, setErpFilter] = useState<ERPStatus | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<ContactFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [quickLogContactId, setQuickLogContactId] = useState<string | undefined>()

  const { data: categories } = useQuery({
    queryKey: ['coi-categories'],
    queryFn: async () => {
      const { data } = await supabase.from('coi_categories').select('*').order('name')
      return (data ?? []) as COICategory[]
    },
  })

  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const { data } = await supabase.from('locations').select('*').order('name')
      return data ?? []
    },
  })

  const { data: contacts, isLoading } = useQuery({
    queryKey: ['contacts', profile?.id, isOwner, isGM],
    queryFn: async () => {
      let q = supabase
        .from('contacts')
        .select('*, category:coi_categories(*), location:locations(*)')
        .eq('is_active', true)
        .order('last_name', { ascending: true })

      if (!isOwner && !isGM && profile?.id) q = q.eq('assigned_rep_id', profile.id)
      else if (isGM && profile?.location_id) q = q.eq('location_id', profile.location_id)

      const { data } = await q
      return (data ?? []) as Contact[]
    },
    enabled: !!profile,
  })

  const filtered = (contacts ?? []).filter((c) => {
    const s = search.toLowerCase()
    const matchesSearch = !s || [c.first_name, c.last_name, c.company, c.city].some(
      (v) => v?.toLowerCase().includes(s)
    )
    const matchesCategory = categoryFilter === 'all' || c.category_id === categoryFilter
    const matchesErp = erpFilter === 'all' || (c.erp_status ?? 'not_introduced') === erpFilter
    const now = new Date()
    const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7)
    const matchesStatus = (() => {
      if (statusFilter === 'all') return true
      if (statusFilter === 'overdue') return c.next_visit_due_at != null && new Date(c.next_visit_due_at) < now
      if (statusFilter === 'due-week') return c.next_visit_due_at != null && new Date(c.next_visit_due_at) <= weekEnd
      if (statusFilter === 'high-priority') return c.priority === 'high'
      return true
    })()
    return matchesSearch && matchesCategory && matchesErp && matchesStatus
  })

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    const categoryObj = categories?.find(c => c.id === form.category_id)
    const freqDays = categoryObj?.default_visit_frequency_days ?? 30
    const nextVisit = new Date()
    nextVisit.setDate(nextVisit.getDate() + freqDays)

    const payload = {
      org_id: profile?.org_id,
      location_id: form.location_id || profile?.location_id || null,
      category_id: form.category_id || null,
      first_name: form.first_name || null,
      last_name: form.last_name || null,
      company: form.company || null,
      phone: form.phone || null,
      city: form.city || null,
      state: 'TX',
      assigned_rep_id: profile?.id,
      visit_frequency_days: freqDays,
      next_visit_due_at: nextVisit.toISOString(),
      priority: 'medium' as Priority,
      erp_status: 'not_introduced' as ERPStatus,
      tags: [],
    }

    const { error } = await supabase.from('contacts').insert(payload)
    if (error) {
      setSaveError(error.message)
      setSaving(false)
      return
    }
    queryClient.invalidateQueries({ queryKey: ['contacts'] })
    setForm(EMPTY_FORM)
    setShowForm(false)
    setSaving(false)
  }

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contacts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{(contacts ?? []).length} COIs in your market</p>
        </div>
        <div className="flex items-center gap-2">
          {(isOwner || isGM) && contacts && contacts.length > 0 && (
            <button
              onClick={() => exportContactsCSV(filtered)}
              className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border hover:border-foreground/20 text-muted-foreground hover:text-foreground text-sm font-medium rounded-lg transition-colors"
              title="Export filtered contacts to CSV"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          )}
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors"
            data-tour="add-contact"
          >
            <Plus className="w-4 h-4" />
            Add contact
          </button>
        </div>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative flex-1 min-w-44">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, company, city…"
            className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="all">All types</option>
          {(categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={erpFilter}
          onChange={(e) => setErpFilter(e.target.value as ERPStatus | 'all')}
          className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="all">All ERP</option>
          {(Object.keys(ERP_STATUS_LABELS) as ERPStatus[]).map(s => (
            <option key={s} value={s}>{ERP_STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {([
          { value: 'all',           label: 'All' },
          { value: 'overdue',       label: 'Overdue' },
          { value: 'due-week',      label: 'Due This Week' },
          { value: 'high-priority', label: 'High Priority' },
        ] as { value: StatusFilter; label: string }[]).map(chip => (
          <button
            key={chip.value}
            onClick={() => setStatusFilter(chip.value as StatusFilter)}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${
              statusFilter === chip.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'text-muted-foreground border-border hover:border-foreground/30'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Contact list */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="animate-pulse space-y-2">
            {[1,2,3,4].map(i => <div key={i} className="h-16 bg-card rounded-xl border border-border" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
            {search ? `No results for "${search}"` : 'No contacts yet. Add your first COI.'}
          </div>
        ) : (
          filtered.map((contact) => {
            const overdue = isOverdue(contact.next_visit_due_at)
            const erpStatus = contact.erp_status ?? 'not_introduced'
            return (
              <div
                key={contact.id}
                className={cn(
                  'bg-card border rounded-xl p-4 flex items-start gap-3 group transition-colors hover:border-foreground/20',
                  overdue ? 'border-amber-400/20' : 'border-border'
                )}
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-xs font-semibold text-muted-foreground mt-0.5">
                  {(contact.first_name?.[0] ?? contact.company?.[0] ?? '?').toUpperCase()}
                </div>

                <button
                  className="flex-1 min-w-0 text-left"
                  onClick={() => navigate(`/contacts/${contact.id}`)}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{fullName(contact)}</span>
                    {erpStatus !== 'not_introduced' && (
                      <span className={cn(
                        'text-[9px] px-1.5 py-0.5 rounded border leading-none flex-shrink-0',
                        ERP_STATUS_COLORS[erpStatus]
                      )}>
                        {ERP_STATUS_LABELS[erpStatus]}
                      </span>
                    )}
                  </div>

                  {contact.company && (
                    <p className="text-xs text-muted-foreground truncate">{contact.company}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                    {contact.category && (
                      <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                        {(contact.category as COICategory | null)?.name}
                      </span>
                    )}
                    <span className={cn(
                      'text-[10px] flex items-center gap-1',
                      overdue ? 'text-amber-400' : 'text-muted-foreground'
                    )}>
                      {overdue ? <AlertCircle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                      Next: {formatDate(contact.next_visit_due_at)}
                    </span>
                  </div>
                </button>

                <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
                  <button
                    onClick={() => setQuickLogContactId(contact.id)}
                    className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[10px] text-primary border border-primary/30 px-2 py-1 rounded-full transition-opacity hover:bg-primary/10"
                    title="Log visit"
                  >
                    <Zap className="w-3 h-3" />
                    Log
                  </button>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Add Contact Modal — slim 5-field form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">New Contact</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
            </div>

            <div className="p-5 space-y-3">
              {/* Name row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">First name</label>
                  <input
                    autoFocus
                    value={form.first_name}
                    onChange={e => setForm(f => ({...f, first_name: e.target.value}))}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Last name</label>
                  <input
                    value={form.last_name}
                    onChange={e => setForm(f => ({...f, last_name: e.target.value}))}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Company</label>
                <input
                  value={form.company}
                  onChange={e => setForm(f => ({...f, company: e.target.value}))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Phone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm(f => ({...f, phone: e.target.value}))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">City</label>
                  <input
                    value={form.city}
                    onChange={e => setForm(f => ({...f, city: e.target.value}))}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">COI Type</label>
                  <select
                    value={form.category_id}
                    onChange={e => setForm(f => ({...f, category_id: e.target.value}))}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Select…</option>
                    {(categories ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              {(isOwner || isGM) && (
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Market</label>
                  <select
                    value={form.location_id}
                    onChange={e => setForm(f => ({...f, location_id: e.target.value}))}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Select market…</option>
                    {(locations ?? []).map((l: {id: string; name: string}) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {saveError && (
              <div className="px-5 pb-3">
                <div className="px-3 py-2 bg-red-400/10 border border-red-400/20 rounded-lg">
                  <p className="text-xs text-red-400">{saveError}</p>
                </div>
              </div>
            )}

            <div className="px-5 py-4 border-t border-border flex gap-2">
              <button
                onClick={() => { setShowForm(false); setSaveError(null) }}
                className="flex-1 py-2.5 text-sm text-muted-foreground hover:text-foreground bg-muted rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || (!form.first_name && !form.last_name && !form.company)}
                className="flex-1 py-2.5 text-sm font-medium text-white bg-primary hover:bg-primary/90 disabled:opacity-50 rounded-lg transition-colors"
              >
                {saving ? 'Saving…' : 'Save contact'}
              </button>
            </div>
          </div>
        </div>
      )}

      <QuickLogModal
        open={quickLogContactId != null}
        onClose={() => setQuickLogContactId(undefined)}
        defaultContactId={quickLogContactId}
      />
    </div>
  )
}
