import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder'
import { parseNote } from '@/lib/claude'
import { fullName, formatDate } from '@/lib/utils'
import {
  Mic, Square, CheckCircle2, AlertCircle,
  Search, ChevronDown, Send,
} from 'lucide-react'
import type { Contact, ParsedNote } from '@/types'

type Step = 'input' | 'parsing' | 'preview' | 'saved'

const EXAMPLE_NOTES = [
  '"Just met with Sarah Chen at Westside Property Management in Houston. Category 3 water loss in the basement. Sending $12,400 mitigation estimate. Follow up Thursday at 9am."',
  '"Inspected a fire-damaged duplex for owner Mike Rivera, 512-555-0199. Emergency call. Quoting $34k for mitigation. Proposal going out tomorrow."',
  '"Visited Oakwood Apartments, talked with Dana. No damage yet but they want a quarterly inspection contract. Deal around $800/quarter. Follow up in two weeks."',
]

export default function LogActivity() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const presetContactId = searchParams.get('contact_id')

  const [step, setStep] = useState<Step>('input')
  const [manualText, setManualText] = useState('')
  const [parsed, setParsed] = useState<ParsedNote | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [selectedContactId, setSelectedContactId] = useState<string>(presetContactId ?? '')
  const [contactSearch, setContactSearch] = useState('')
  const [showContactPicker, setShowContactPicker] = useState(false)

  const { data: contacts } = useQuery({
    queryKey: ['contacts-picker', profile?.id],
    queryFn: async () => {
      let q = supabase.from('contacts').select('id, first_name, last_name, company, category:coi_categories(name)').eq('is_active', true).order('last_name')
      if (profile?.id && profile.role === 'rep') q = q.eq('assigned_rep_id', profile.id)
      const { data } = await q
      return (data ?? []) as unknown as (Contact & { category: { name: string } | null })[]
    },
    enabled: !!profile,
  })

  const selectedContact = contacts?.find(c => c.id === selectedContactId)
  const filteredContacts = (contacts ?? []).filter(c => {
    const s = contactSearch.toLowerCase()
    return !s || [c.first_name, c.last_name, c.company].some(v => v?.toLowerCase().includes(s))
  })

  const voiceRecorder = useVoiceRecorder({
    onTranscript: (text) => handleProcess(text),
  })

  async function handleProcess(text: string) {
    setStep('parsing')
    setParseError(null)
    try {
      const result = await parseNote(text)
      setParsed(result)
      setStep('preview')
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse note. Check your API key.')
      setStep('input')
    }
  }

  async function handleSubmit() {
    const text = manualText.trim() || voiceRecorder.transcript.trim()
    if (!text) return
    await handleProcess(text)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!parsed || !profile) throw new Error('Missing required data — please try again.')

      const { error } = await supabase.from('activities').insert({
        org_id: profile.org_id,
        contact_id: selectedContactId || null,
        rep_id: profile.id,
        location_id: profile.location_id,
        type: parsed.activity_type ?? 'visit',
        outcome: parsed.outcome,
        notes: parsed.notes,
        raw_transcript: manualText || voiceRecorder.transcript,
        follow_up_date: parsed.follow_up_date,
        follow_up_action: parsed.follow_up_action,
        confidence_score: parsed.confidence_score,
        flagged: parsed.confidence_score < 0.6,
        flagged_reason: parsed.confidence_score < 0.6 ? 'Low AI confidence — please review' : null,
        occurred_at: new Date().toISOString(),
      })
      if (error) throw error

      if (selectedContactId) {
        const { data: contactData } = await supabase
          .from('contacts').select('visit_frequency_days').eq('id', selectedContactId).single()
        const days = contactData?.visit_frequency_days ?? 30
        const nextVisit = new Date()
        nextVisit.setDate(nextVisit.getDate() + days)
        await supabase.from('contacts').update({
          last_contacted_at: new Date().toISOString(),
          next_visit_due_at: nextVisit.toISOString(),
        }).eq('id', selectedContactId)
      }

      if (parsed.deal_value && selectedContactId) {
        await supabase.from('deals').insert({
          org_id: profile.org_id,
          contact_id: selectedContactId,
          rep_id: profile.id,
          location_id: profile.location_id,
          stage: 'assessment',
          deal_value: parsed.deal_value,
          damage_type: parsed.damage_type,
          emergency_priority: parsed.urgency === 'high',
          title: `${parsed.damage_type ?? 'Restoration'} — ${selectedContact ? fullName(selectedContact) : 'New Lead'}`,
        })
      }

      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-activity'] })
      queryClient.invalidateQueries({ queryKey: ['my-route'] })
    },
    onSuccess: () => {
      setStep('saved')
      setTimeout(() => navigate('/dashboard'), 2000)
    },
  })

  // ── Parsing ──
  if (step === 'parsing') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Claude is reading your note…</p>
        </div>
      </div>
    )
  }

  // ── Saved ──
  if (step === 'saved') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <CheckCircle2 className="w-12 h-12 text-foreground mx-auto mb-3" />
          <h2 className="text-3xl font-serif font-semibold text-foreground">Logged.</h2>
          <p className="text-sm text-muted-foreground mt-1">Activity saved and schedule updated.</p>
        </div>
      </div>
    )
  }

  // ── Preview ──
  if (step === 'preview' && parsed) {
    return (
      <div className="p-6 lg:p-10 max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-serif font-semibold text-foreground">Looks right?</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Review what Claude extracted — confirm or go back to edit.
          </p>
        </div>

        {parsed.confidence_score < 0.7 && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl mb-4">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              Confidence is {Math.round(parsed.confidence_score * 100)}% — double-check the details below.
            </p>
          </div>
        )}

        <div className="bg-card border border-border rounded-2xl divide-y divide-border mb-5">
          {[
            { label: 'Contact',    value: parsed.contact_name },
            { label: 'Company',    value: parsed.company },
            { label: 'Type',       value: parsed.activity_type },
            { label: 'Outcome',    value: parsed.outcome },
            { label: 'Notes',      value: parsed.notes },
            { label: 'Follow-up',  value: parsed.follow_up_date ? `${formatDate(parsed.follow_up_date)}${parsed.follow_up_action ? ' — ' + parsed.follow_up_action : ''}` : null },
            { label: 'Deal value', value: parsed.deal_value ? `$${parsed.deal_value.toLocaleString()}` : null },
            { label: 'Damage',     value: parsed.damage_type },
            { label: 'Urgency',    value: parsed.urgency },
          ].filter(r => r.value).map(row => (
            <div key={row.label} className="px-5 py-3 flex gap-4">
              <span className="text-xs text-muted-foreground w-24 flex-shrink-0 pt-0.5">{row.label}</span>
              <span className="text-sm text-foreground">{row.value}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => { setStep('input'); voiceRecorder.reset() }}
            className="flex-1 py-2.5 text-sm text-muted-foreground hover:text-foreground bg-secondary border border-border rounded-xl transition-colors"
          >
            ← Re-record
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex-1 py-2.5 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-50 rounded-xl transition-colors"
          >
            {saveMutation.isPending ? 'Saving…' : '✓ Confirm & save'}
          </button>
        </div>
      </div>
    )
  }

  // ── Input ──
  const roleLabel = profile?.role === 'owner'
    ? 'Owner'
    : profile?.role === 'gm'
    ? 'General Manager'
    : profile?.location?.name ?? 'Unassigned rep'

  const inputText = manualText || voiceRecorder.transcript
  const canSubmit = inputText.trim().length > 0 && voiceRecorder.state !== 'recording'

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{roleLabel}</p>
        <h1 className="text-4xl font-serif font-semibold text-foreground">Log a field note</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Dictate or type a short note. Remember the framework:{' '}
          <span className="font-semibold text-foreground">Who. What. When.</span>
        </p>
      </div>

      {/* Two-column */}
      <div className="grid lg:grid-cols-[1fr_300px] gap-5">
        {/* Left: input */}
        <div className="bg-card border border-border rounded-2xl p-6 flex flex-col">
          <h2 className="text-xl font-serif font-semibold text-foreground mb-5">Voice or text</h2>

          {/* Contact picker pill */}
          <div className="relative mb-4">
            <button
              onClick={() => setShowContactPicker(!showContactPicker)}
              className="inline-flex items-center gap-2 px-3 py-1.5 border border-border rounded-full text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              <Search className="w-3 h-3" />
              {selectedContact
                ? `${fullName(selectedContact)}${selectedContact.company ? ' · ' + selectedContact.company : ''}`
                : 'Link a contact (optional)'}
              <ChevronDown className="w-3 h-3" />
            </button>

            {showContactPicker && (
              <div className="absolute top-full left-0 z-20 mt-1 w-72 bg-card border border-border rounded-xl shadow-xl max-h-60 overflow-hidden">
                <div className="p-2 border-b border-border">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      autoFocus
                      value={contactSearch}
                      onChange={e => setContactSearch(e.target.value)}
                      placeholder="Search…"
                      className="w-full pl-8 pr-3 py-1.5 bg-muted rounded-md text-xs text-foreground placeholder-muted-foreground focus:outline-none"
                    />
                  </div>
                </div>
                <div className="overflow-y-auto max-h-48">
                  <button
                    onClick={() => { setSelectedContactId(''); setShowContactPicker(false) }}
                    className="w-full px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted"
                  >
                    No contact / new contact
                  </button>
                  {filteredContacts.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedContactId(c.id); setShowContactPicker(false) }}
                      className="w-full px-3 py-2 text-left hover:bg-muted transition-colors"
                    >
                      <div className="text-sm font-medium text-foreground">{fullName(c)}</div>
                      {c.company && <div className="text-xs text-muted-foreground">{c.company}</div>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Voice button */}
          {voiceRecorder.state === 'idle' && (
            <button
              onClick={voiceRecorder.startRecording}
              disabled={!voiceRecorder.isSupported}
              className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-full text-sm text-foreground hover:bg-muted disabled:opacity-40 transition-colors mb-4 self-start"
            >
              <Mic className="w-4 h-4" />
              Start voice note
            </button>
          )}

          {voiceRecorder.state === 'recording' && (
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={voiceRecorder.stopRecording}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-full text-sm transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
                Stop · {voiceRecorder.duration}s
              </button>
              <span className="text-xs text-muted-foreground animate-pulse">Listening…</span>
            </div>
          )}

          {!voiceRecorder.isSupported && (
            <p className="text-xs text-muted-foreground mb-3">
              Voice not supported in this browser. Use Chrome or type below.
            </p>
          )}

          {(voiceRecorder.error || parseError) && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 mb-3">
              {voiceRecorder.error || parseError}
            </div>
          )}

          {/* Textarea */}
          <textarea
            value={inputText}
            onChange={e => {
              setManualText(e.target.value)
              voiceRecorder.reset()
            }}
            rows={9}
            placeholder="Type what happened — Who you spoke with, What the job is, and When you're following up."
            className="flex-1 w-full px-3 py-3 bg-transparent border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20 resize-none leading-relaxed"
          />

          {/* Submit bar */}
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-muted-foreground">
              {voiceRecorder.state === 'recording'
                ? 'Recording…'
                : voiceRecorder.transcript && !manualText
                ? 'Input: Voice'
                : 'Input: Text'}
            </span>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground text-sm font-medium rounded-full transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              Submit to the Ledger
            </button>
          </div>
        </div>

        {/* Right: examples */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <h2 className="text-xl font-serif font-semibold text-foreground mb-5">Example notes</h2>
          <div className="space-y-5">
            {EXAMPLE_NOTES.map((note, i) => (
              <p key={i} className="text-sm text-muted-foreground italic leading-relaxed">{note}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
