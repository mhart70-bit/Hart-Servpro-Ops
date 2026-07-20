import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { fullName } from '@/lib/utils'
import { X, Search } from 'lucide-react'
import type { Contact, ActivityType } from '@/types'

const TYPES: { value: ActivityType; label: string }[] = [
  { value: 'visit', label: 'Visit' },
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'note', label: 'Note' },
]

interface Props {
  open: boolean
  onClose: () => void
  defaultContactId?: string
}

export default function QuickLogModal({ open, onClose, defaultContactId }: Props) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const [type, setType] = useState<ActivityType>('visit')
  const [notes, setNotes] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [contactId, setContactId] = useState(defaultContactId ?? '')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (open) {
      setType('visit')
      setNotes('')
      setContactId(defaultContactId ?? '')
      setSearch('')
      const d = new Date()
      d.setDate(d.getDate() + 7)
      // Local calendar date — toISOString() is UTC and rolls to tomorrow
      // during evening hours, silently shifting the default by a day
      const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      setFollowUpDate(local)
    }
  }, [open, defaultContactId])

  const { data: contacts } = useQuery({
    queryKey: ['contacts-picker-quick', profile?.id],
    queryFn: async () => {
      let q = supabase
        .from('contacts')
        .select('id, first_name, last_name, company, visit_frequency_days')
        .eq('is_active', true)
        .order('last_name')
      if (profile?.role === 'rep' && profile.location_id) q = q.eq('location_id', profile.location_id)
      const { data } = await q
      return (data ?? []) as (Pick<Contact, 'id' | 'first_name' | 'last_name' | 'company'> & { visit_frequency_days: number | null })[]
    },
    enabled: !!profile && open,
  })

  const selectedContact = contacts?.find(c => c.id === contactId)
  const filteredContacts = (contacts ?? []).filter(c => {
    const s = search.toLowerCase()
    return s.length > 0 && [c.first_name, c.last_name, c.company].some(v => v?.toLowerCase().includes(s))
  })

  const save = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Not authenticated')
      const now = new Date().toISOString()

      const { error } = await supabase.from('activities').insert({
        org_id: profile.org_id,
        contact_id: contactId || null,
        rep_id: profile.id,
        location_id: profile.location_id,
        type,
        notes: notes.trim() || null,
        follow_up_date: followUpDate || null,
        occurred_at: now,
        flagged: false,
        confidence_score: 1.0,
      })
      if (error) throw error

      if (contactId && selectedContact) {
        // The follow-up date the rep picked drives the next visit; the
        // visit-frequency default is only a fallback when the field is cleared.
        let next: Date
        if (followUpDate) {
          next = new Date(`${followUpDate}T12:00:00`)
        } else {
          const freqDays = selectedContact.visit_frequency_days ?? 30
          next = new Date()
          next.setDate(next.getDate() + freqDays)
        }
        await supabase.from('contacts').update({
          last_contacted_at: now,
          next_visit_due_at: next.toISOString(),
        }).eq('id', contactId)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      queryClient.invalidateQueries({ queryKey: ['dash-hitlist'] })
      queryClient.invalidateQueries({ queryKey: ['dash-recent'] })
      queryClient.invalidateQueries({ queryKey: ['dash-overdue'] })
      queryClient.invalidateQueries({ queryKey: ['activities'] })
      onClose()
    },
  })

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 z-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-serif font-semibold text-foreground">Quick log</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contact */}
        <div className="mb-4">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 block">Contact</label>
          {selectedContact ? (
            <div className="flex items-center justify-between px-3 py-2.5 bg-muted rounded-lg">
              <div>
                <p className="text-sm font-medium text-foreground">{fullName(selectedContact)}</p>
                {selectedContact.company && (
                  <p className="text-xs text-muted-foreground">{selectedContact.company}</p>
                )}
              </div>
              {!defaultContactId && (
                <button
                  onClick={() => { setContactId(''); setSearch('') }}
                  className="text-xs text-muted-foreground hover:text-foreground ml-3"
                >
                  Change
                </button>
              )}
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search contacts…"
                className="w-full pl-9 pr-3 py-2.5 bg-muted border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
              />
              {filteredContacts.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl max-h-48 overflow-y-auto z-20">
                  {filteredContacts.slice(0, 8).map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setContactId(c.id); setSearch('') }}
                      className="w-full px-3 py-2 text-left hover:bg-muted transition-colors"
                    >
                      <p className="text-sm font-medium text-foreground">{fullName(c)}</p>
                      {c.company && <p className="text-xs text-muted-foreground">{c.company}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Type */}
        <div className="mb-4">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 block">Type</label>
          <div className="flex gap-2">
            {TYPES.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setType(value)}
                className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                  type === value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'text-muted-foreground border-border hover:border-foreground/30'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="mb-4">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 block">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="What happened?"
            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20 resize-none"
          />
        </div>

        {/* Follow-up date */}
        <div className="mb-5">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 block">
            Follow-up date
          </label>
          <input
            type="date"
            value={followUpDate}
            onChange={e => setFollowUpDate(e.target.value)}
            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
          />
        </div>

        {save.error && (
          <p className="text-xs text-red-500 mb-3">{String(save.error)}</p>
        )}

        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="w-full py-3 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-medium rounded-xl transition-colors"
        >
          {save.isPending ? 'Logging…' : 'Log It'}
        </button>
      </div>
    </div>
  )
}
