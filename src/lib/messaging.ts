/**
 * Hart SERVPRO CRM — Messaging Placeholder Architecture
 * ======================================================
 * SMS (Twilio) and WhatsApp Business API integration.
 *
 * STATUS: PLACEHOLDER — not yet wired to live APIs.
 *
 * TO ACTIVATE:
 *   1. Add to .env:
 *        VITE_TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *        VITE_TWILIO_AUTH_TOKEN=your_auth_token
 *        VITE_TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
 *        VITE_WHATSAPP_PHONE_NUMBER=+1xxxxxxxxxx   (WhatsApp Business number)
 *
 *   2. Deploy the Edge Function at /supabase/functions/inbound-message/index.ts
 *      (see template below). Configure as a Twilio webhook for both SMS
 *      and WhatsApp incoming messages.
 *
 *   3. Register each rep's mobile number in the rep_phones table.
 *
 * HOW IT WORKS (end-to-end):
 *   Rep texts/WhatsApps the CRM number
 *   → Twilio webhook fires → Supabase Edge Function
 *   → writes row to inbound_messages with status='pending'
 *   → processInboundMessage() identifies rep by from_number
 *   → calls Claude to parse the note (same parseNote() used in the app)
 *   → creates activity record, updates contact's last_contacted_at
 *   → sends confirmation reply back to rep via Twilio
 */

import { supabase } from '@/lib/supabase'
import type { InboundMessage, MessageChannel } from '@/types'

// ── Config ────────────────────────────────────────────────────
const TWILIO_PHONE     = import.meta.env.VITE_TWILIO_PHONE_NUMBER     ?? null
const WHATSAPP_PHONE   = import.meta.env.VITE_WHATSAPP_PHONE_NUMBER   ?? null
const MESSAGING_ACTIVE = !!(TWILIO_PHONE || WHATSAPP_PHONE)

export { MESSAGING_ACTIVE, TWILIO_PHONE, WHATSAPP_PHONE }

// ── Types ─────────────────────────────────────────────────────
export interface InboundPayload {
  channel: MessageChannel
  fromNumber: string       // E.164 format, e.g. +19155551234
  rawBody: string
  receivedAt?: string
}

export interface ProcessResult {
  success: boolean
  activityId?: string
  contactId?: string
  repId?: string
  errorMessage?: string
  confirmationText?: string
}

// ── Rep identification ────────────────────────────────────────
/**
 * Look up which rep sent this message by matching their phone number
 * in the rep_phones table. Returns null if no match found.
 */
export async function identifyRepByPhone(
  phone: string,
  channel: MessageChannel
): Promise<{ repId: string; orgId: string } | null> {
  const { data } = await supabase
    .from('rep_phones')
    .select('rep_id, org_id')
    .eq('phone', phone)
    .or(`channel.eq.${channel},channel.eq.both`)
    .single()

  if (!data) return null
  return { repId: data.rep_id, orgId: data.org_id }
}

// ── Inbound message handler ───────────────────────────────────
/**
 * Main entry point called by the Edge Function webhook.
 * Writes the raw message, identifies the rep, parses the note,
 * creates the activity, and queues a confirmation reply.
 *
 * PLACEHOLDER: In production this runs server-side in the Edge Function.
 * The client-side code only reads inbound_messages for the admin UI.
 */
export async function processInboundMessage(
  payload: InboundPayload
): Promise<ProcessResult> {
  if (!MESSAGING_ACTIVE) {
    return {
      success: false,
      errorMessage: 'Messaging not configured. Add Twilio credentials to .env to activate.',
    }
  }

  // 1. Write raw message to DB
  const { data: msg, error: msgError } = await supabase
    .from('inbound_messages')
    .insert({
      channel: payload.channel,
      from_number: payload.fromNumber,
      raw_body: payload.rawBody,
      status: 'processing',
      received_at: payload.receivedAt ?? new Date().toISOString(),
    })
    .select()
    .single()

  if (msgError || !msg) {
    return { success: false, errorMessage: msgError?.message ?? 'Failed to write message' }
  }

  // 2. Identify rep
  const repMatch = await identifyRepByPhone(payload.fromNumber, payload.channel)
  if (!repMatch) {
    await supabase
      .from('inbound_messages')
      .update({ status: 'failed', error_message: 'Phone number not registered to any rep' })
      .eq('id', msg.id)
    return {
      success: false,
      errorMessage: `No rep found for ${payload.fromNumber}. Register this number in Settings → Team.`,
    }
  }

  // 3. Parse note via Claude (same function used in LogActivity)
  // PLACEHOLDER: import { parseNote } from '@/lib/claude'
  // const parsed = await parseNote(payload.rawBody)

  // 4. Create activity record
  // PLACEHOLDER: const { data: activity } = await supabase.from('activities').insert({ ... })

  // 5. Update inbound_messages with linked IDs
  await supabase
    .from('inbound_messages')
    .update({
      status: 'linked',
      rep_id: repMatch.repId,
      processed_at: new Date().toISOString(),
    })
    .eq('id', msg.id)

  // 6. Build confirmation reply
  const confirmation = buildConfirmationReply(payload.rawBody, payload.channel)

  return {
    success: true,
    repId: repMatch.repId,
    confirmationText: confirmation,
  }
}

// ── Confirmation reply builder ────────────────────────────────
function buildConfirmationReply(rawBody: string, channel: MessageChannel): string {
  const preview = rawBody.length > 60 ? rawBody.slice(0, 57) + '…' : rawBody
  const emoji = channel === 'whatsapp' ? '✅ ' : ''
  return `${emoji}Logged: "${preview}"\n\nFollow-up date set. View in CRM → hartservpro.app`
}

// ── Send outbound message (confirmation) ─────────────────────
/**
 * Sends a reply back to the rep confirming their note was logged.
 * PLACEHOLDER: Replace stub with real Twilio REST API call.
 *
 * Production implementation (runs in Edge Function):
 *   const client = twilio(accountSid, authToken)
 *   await client.messages.create({
 *     body: text,
 *     from: channel === 'whatsapp' ? `whatsapp:${WHATSAPP_PHONE}` : TWILIO_PHONE,
 *     to:   channel === 'whatsapp' ? `whatsapp:${toNumber}` : toNumber,
 *   })
 */
export async function sendReply(
  toNumber: string,
  text: string,
  channel: MessageChannel
): Promise<{ sent: boolean; error?: string }> {
  if (!MESSAGING_ACTIVE) {
    console.log(`[MESSAGING STUB] Would send to ${toNumber} via ${channel}:\n${text}`)
    return { sent: false, error: 'Messaging not configured' }
  }

  // TODO: Replace with Twilio SDK call when credentials are available
  console.log(`[MESSAGING STUB] Sending via ${channel} to ${toNumber}:\n${text}`)
  return { sent: true }
}

// ── Admin: fetch pending/failed messages ──────────────────────
export async function fetchInboundMessages(
  limit = 50
): Promise<InboundMessage[]> {
  const { data } = await supabase
    .from('inbound_messages')
    .select('*')
    .order('received_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as InboundMessage[]
}

// ── Edge Function template ────────────────────────────────────
/**
 * DEPLOY THIS TO: supabase/functions/inbound-message/index.ts
 *
 * import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
 * import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
 *
 * serve(async (req) => {
 *   const formData = await req.formData()
 *   const from    = formData.get('From')?.toString() ?? ''
 *   const body    = formData.get('Body')?.toString() ?? ''
 *   const channel = from.startsWith('whatsapp:') ? 'whatsapp' : 'sms'
 *   const phone   = from.replace('whatsapp:', '')
 *
 *   const supabase = createClient(
 *     Deno.env.get('SUPABASE_URL')!,
 *     Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
 *   )
 *
 *   // Write to inbound_messages + trigger processing
 *   await supabase.from('inbound_messages').insert({
 *     channel, from_number: phone, raw_body: body, status: 'pending'
 *   })
 *
 *   // Return TwiML empty response (Twilio requires this)
 *   return new Response('<Response></Response>', {
 *     headers: { 'Content-Type': 'text/xml' }
 *   })
 * })
 */
