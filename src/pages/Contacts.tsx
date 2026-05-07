import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { fullName, formatDate, isOverdue, cn, PRIORITY_COLORS } from '@/lib/utils'
import { Search, Plus, Phone, Mail, AlertCircle, CheckCircle } from 'lucide-react'
import type { Contact, COICategory, Priority } from '@/types'

interface ContactFormData {
  first_name: string
  last_name: string
  company: string
  title: string
  email: string
  phone: string
  phone_mobile: string
  address: string
  city: string
  state: string
  category_id: string
  location_id: string
  priority: Priority
  visit_frequency_days: string
  notes: string
}

const EMPTY_FORM: ContactFormData = {
  first_name: '', last_name: '', company: '', title: '',
  email: '', phone: '', phone_mobile: '',
  address: '', city: '', state: 'TX',
  category_id: '', location_id: '',
  priority: 'medium', visit_frequency_days: '',
  notes: '',
}

export default function Contacts() {
  const { profile, isOwner, isGM } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<ContactFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

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
      else if ((isGM) && profile?.location_id) q = q.eq('location_id', profile.location_id)

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
    return matchesSearch && matchesCategory
  })

  async function handleSave() {
    setSaving(true)
    const categoryObj = categories?.find(c => c.id === form.category_id)
    const freqDays = form.visit_frequency_days
      ? parseInt(form.visit_frequency_days)
      : categoryObj?.default_visit_frequency_days ?? 30

    const nextVisit = new Date()
    nextVisit.setDate(nextVisit.getDate() + freqDays)

    const payload = {
      org_id: profile?.org_id,
      location_id: form.location_id || profile?.location_id || null,
      category_id: form.category_id || null,
      first_name: form.first_name || null,
      last_name: form.last_name || null,
      company: form.company || null,
      title: form.title || null,
      email: form.email || null,
      phone: form.phone || null,
      phone_mobile: form.phone_mobile || null,
      address: form.address || null,
      city: form.city || null,
      state: form.state || 'TX',
      assigned_rep_id: profile?.id,
      visit_frequency_days: freqDays,
      next_visit_due_at: nextVisit.toISOString(),
      priority: form.priority,
      notes: form.notes || null,
      tags: [],
    }

    await supabase.from('contacts').insert(payload)
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
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add contact
        </button>
      </div>

      {/* Search + filter */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
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
            return (
              <div key={contact.id} className={cn(
                'bg-card border rounded-xl p-4 flex items-start gap-3',
                overdue ? 'border-amber-400/20' : 'border-border'
              )}>
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-xs font-semibold text-muted-foreground">
                  {(contact.first_name?.[0] ?? contact.company?.[0] ?? '?').toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{fullName(contact)}</span>
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded border',
                      PRIORITY_COLORS[contact.priority]
                    )}>{contact.priority}</span>
                  </div>

                  {contact.company && (
                    <p className="text-xs text-muted-foreground truncate">{contact.company}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                    {contact.category && (
                      <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                        {contact.category.name}
                      </span>
                    )}
                    <span className={cn(
                      'text-[10px] flex items-center gap-1',
                      overdue ? 'text-amber-400' : 'text-muted-foreground'
                    )}>
                      {overdue ? <AlertCircle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                      Next: {formatDate(contact.next_visit_due_at)}
                    </span>
                    {contact.phone && (
                      <a href={`tel:${contact.phone}`} className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {contact.phone}
                      </a>
                    )}
                    {contact.email && (
                      <a href={`mailto:${contact.email}`} className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 truncate">
                        <Mail className="w-3 h-3" />
                        {contact.email}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Add Contact Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70">
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-card">
              <h2 className="text-base font-semibold text-foreground">New Contact</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
            </div>

            <div className="p-5 space-y-3">
              {/* Name row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">First name</label>
                  <input value={form.first_name} onChange={e => setForm(f => ({...f, first_name: e.target.value}))}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Last name</label>
                  <input value={form.last_name} onChange={e => setForm(f => ({...f, last_name: e.target.value}))}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Company</label>
                <input value={form.company} onChange={e => setForm(f => ({...f, company: e.target.value}))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Title</label>
                <input value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Phone</label>
                  <input type="tel" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Mobile</label>
                  <input type="tel" value={form.phone_mobile} onChange={e => setForm(f => ({...f, phone_mobile: e.target.value}))}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">City</label>
                  <input value={form.city} onChange={e => setForm(f => ({...f, city: e.target.value}))}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">COI Type</label>
                  <select value={form.category_id} onChange={e => setForm(f => ({...f, category_id: e.target.value}))}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                    <option value="">Select type…</option>
                    {(categories ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              {(isOwner || isGM) && (
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Market</label>
                  <select value={form.location_id} onChange={e => setForm(f => ({...f, location_id: e.target.value}))}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                    <option value="">Select market…</option>
                    {(locations ?? []).map((l: {id: string; name: string}) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Priority</label>
                  <select value={form.priority} onChange={e => setForm(f => ({...f, priority: e.target.value as Priority}))}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Visit every (days)</label>
                  <input type="number" placeholder="e.g. 14" value={form.visit_frequency_days}
                    onChange={e => setForm(f => ({...f, visit_frequency_days: e.target.value}))}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Notes</label>
                <textarea rows={3} value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))}
                  placeholder="Key details about this contact…"
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-border flex gap-2 sticky bottom-0 bg-card">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-2 text-sm text-muted-foreground hover:text-foreground bg-muted rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2 text-sm font-medium text-white bg-primary hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors">
                {saving ? 'Saving…' : 'Save contact'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
