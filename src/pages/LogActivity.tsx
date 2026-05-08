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
  Edit3, Search, ChevronDown
} from 'lucide-react'
import type { Contact, ParsedNote } from '@/types'

type Step = 'input' | 'parsing' | 'preview' | 'saved'

export default function LogActivity() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const presetContactId = searchParams.get('contact_id')

  const [step, setStep] = useState<Step>('input')
  const [mode, setMode] = useState<'voice' | 'text'>('voice')
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

  async function handleTextSubmit() {
    if (!manualText.trim()) return
    await handleProcess(manualText.trim())
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!parsed || !profile) throw new Error('Missing required data — please try again.')

      // Save activity
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

      // Agentic: update contact's last_contacted + next_visit_due
      if (selectedContactId) {
        const { data: contactData } = await supabase
          .from('contacts')
          .select('visit_frequency_days')
          .eq('id', selectedContactId)
          .single()

        const days = contactData?.visit_frequency_days ?? 30
        const nextVisit = new Date()
        nextVisit.setDate(nextVisit.getDate() + days)

        await supabase.from('contacts').update({
          last_contacted_at: new Date().toISOString(),
          next_visit_due_at: nextVisit.toISOString(),
        }).eq('id', selectedContactId)
      }

      // Agentic: if deal value mentioned, create/update a deal
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

  if (step === 'parsing') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Claude is reading your note…</p>
        </div>
      </div>
    )
  }

  if (step === 'saved') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-foreground">Logged!</h2>
          <p className="text-sm text-muted-foreground mt-1">Activity saved and schedule updated.</p>
        </div>
      </div>
    )
  }

  if (step === 'preview' && parsed) {
    return (
      <div className="p-4 lg:p-6 max-w-lg mx-auto">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-foreground">Looks right?</h1>
          <p className="text-sm text-muted-foreground mt-1">Review what Claude extracted — confirm or go back to edit.</p>
        </div>

        {parsed.confidence_score < 0.7 && (
          <div className="flex items-start gap-2 p-3 bg-amber-400/10 border border-amber-400/20 rounded-xl mb-4">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-400">Confidence is {Math.round(parsed.confidence_score * 100)}% — double-check the details below.</p>
          </div>
        )}

        <div className="bg-card border border-border rounded-xl divide-y divide-border mb-4">
          {[
            { label: 'Contact', value: parsed.contact_name },
            { label: 'Company', value: parsed.company },
            { label: 'Type', value: parsed.activity_type },
            { label: 'Outcome', value: parsed.outcome },
            { label: 'Notes', value: parsed.notes },
            { label: 'Follow-up', value: parsed.follow_up_date ? `${formatDate(parsed.follow_up_date)}${parsed.follow_up_action ? ' — ' + parsed.follow_up_action : ''}` : null },
            { label: 'Deal value', value: parsed.deal_value ? `$${parsed.deal_value.toLocaleString()}` : null },
            { label: 'Damage type', value: parsed.damage_type },
            { label: 'Urgency', value: parsed.urgency },
          ].filter(r => r.value).map(row => (
            <div key={row.label} className="px-4 py-2.5 flex gap-3">
              <span className="text-xs text-muted-foreground w-20 flex-shrink-0 pt-0.5">{row.label}</span>
              <span className="text-sm text-foreground">{row.value}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => { setStep('input'); voiceRecorder.reset() }}
            className="flex-1 py-2.5 text-sm text-muted-foreground hover:text-foreground bg-muted rounded-xl transition-colors"
          >
            ← Re-record
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex-1 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-red-700 disabled:opacity-50 rounded-xl transition-colors"
          >
            {saveMutation.isPending ? 'Saving…' : '✓ Confirm & save'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-lg mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-foreground">Log Activity</h1>
        <p className="text-sm text-muted-foreground mt-1">Speak or type — Claude handles the rest.</p>
      </div>

      {/* Contact picker */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Contact (optional)</label>
        <div className="relative">
          <button
            onClick={() => setShowContactPicker(!showContactPicker)}
            className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-left flex items-center justify-between hover:border-primary/50 transition-colors"
          >
            <span className={selectedContact ? 'text-foreground' : 'text-muted-foreground'}>
              {selectedContact ? `${fullName(selectedContact)}${selectedContact.company ? ' · ' + selectedContact.company : ''}` : 'Select or skip…'}
            </span>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>

          {showContactPicker && (
            <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-card border border-border rounded-xl shadow-xl max-h-60 overflow-hidden">
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
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg mb-5">
        <button
          onClick={() => setMode('voice')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'voice' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Mic className="w-4 h-4" />
          Voice
        </button>
        <button
          onClick={() => setMode('text')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'text' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Edit3 className="w-4 h-4" />
          Type
        </button>
      </div>

      {/* Voice mode */}
      {mode === 'voice' && (
        <div className="flex flex-col items-center gap-4">
          {!voiceRecorder.isSupported && (
            <div className="w-full p-3 bg-amber-400/10 border border-amber-400/20 rounded-xl text-xs text-amber-400 text-center">
              Voice not supported in this browser. Switch to Chrome on Android, or use text mode.
            </div>
          )}

          {voiceRecorder.state === 'idle' && (
            <button
              onClick={voiceRecorder.startRecording}
              disabled={!voiceRecorder.isSupported}
              className="w-28 h-28 rounded-full bg-primary hover:bg-red-700 disabled:opacity-40 flex flex-col items-center justify-center gap-1 transition-colors shadow-lg shadow-primary/20"
            >
              <Mic className="w-8 h-8 text-white" />
              <span className="text-xs text-white/80">Tap to speak</span>
            </button>
          )}

          {voiceRecorder.state === 'recording' && (
            <>
              <button
                onClick={voiceRecorder.stopRecording}
                className="w-28 h-28 rounded-full bg-red-600 hover:bg-red-700 flex flex-col items-center justify-center gap-1 animate-pulse shadow-lg shadow-red-600/30"
              >
                <Square className="w-7 h-7 text-white" />
                <span className="text-xs text-white/80">{voiceRecorder.duration}s</span>
              </button>
              {voiceRecorder.transcript && (
                <div className="w-full p-3 bg-muted rounded-xl text-sm text-foreground leading-relaxed">
                  {voiceRecorder.transcript}
                </div>
              )}
            </>
          )}

          {voiceRecorder.error && (
            <div className="w-full p-3 bg-red-400/10 border border-red-400/20 rounded-xl text-xs text-red-400">
              {voiceRecorder.error}
            </div>
          )}

          {parseError && (
            <div className="w-full p-3 bg-red-400/10 border border-red-400/20 rounded-xl text-xs text-red-400">
              {parseError}
            </div>
          )}
        </div>
      )}

      {/* Text mode */}
      {mode === 'text' && (
        <div className="space-y-3">
          <textarea
            value={manualText}
            onChange={e => setManualText(e.target.value)}
            rows={6}
            placeholder="Just visited Sarah Chen at Westside Property Management. She's interested in quarterly inspections. Deal value around $2,000. Follow up Tuesday morning…"
            className="w-full px-3 py-3 bg-card border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed"
          />
          <button
            onClick={handleTextSubmit}
            disabled={!manualText.trim()}
            className="w-full py-3 text-sm font-semibold text-white bg-primary hover:bg-red-700 disabled:opacity-40 rounded-xl transition-colors"
          >
            Process note →
          </button>
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground mt-5">
        Claude will extract contact, outcome, follow-up date, and deal value automatically.
      </p>
    </div>
  )
}
