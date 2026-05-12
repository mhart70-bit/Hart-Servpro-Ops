export type Role = 'owner' | 'gm' | 'rep'

export type DamageType = 'water' | 'fire' | 'mold' | 'storm' | 'biohazard' | 'other'

export type DealStage =
  | 'emergency_call'
  | 'assessment'
  | 'estimate'
  | 'approved'
  | 'job_start'
  | 'completion'
  | 'invoiced'
  | 'paid'
  | 'lost'

export type ActivityType = 'visit' | 'call' | 'email' | 'note' | 'voice_note'

export type OutcomeType =
  | 'first_intro'
  | 'relationship_dev'
  | 'erp_conversation'
  | 'client_maintenance'

export type ERPStatus =
  | 'not_introduced'
  | 'walk_scheduled'
  | 'verbal_commitment'
  | 'signed'

export type Priority = 'high' | 'medium' | 'low'

export type MessageChannel = 'sms' | 'whatsapp'
export type MessageStatus = 'pending' | 'processing' | 'linked' | 'failed'

export interface Organization {
  id: string
  name: string
  slug: string
  created_at: string
}

export interface Location {
  id: string
  org_id: string
  name: string
  city: string | null
  state: string
  created_at: string
}

export interface Profile {
  id: string
  org_id: string
  location_id: string | null
  full_name: string | null
  role: Role
  phone: string | null
  avatar_url: string | null
  created_at: string
  location?: Location
}

export interface COICategory {
  id: string
  org_id: string
  name: string
  default_visit_frequency_days: number
  color: string | null
  created_at: string
}

export interface Contact {
  id: string
  org_id: string
  location_id: string | null
  category_id: string | null
  first_name: string | null
  last_name: string | null
  company: string | null
  title: string | null
  email: string | null
  phone: string | null
  phone_mobile: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  assigned_rep_id: string | null
  visit_frequency_days: number | null
  last_contacted_at: string | null
  next_visit_due_at: string | null
  priority: Priority
  erp_status: ERPStatus
  erp_signed_at: string | null
  lat: number | null
  lng: number | null
  tags: string[]
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  category?: COICategory
  location?: Location
  assigned_rep?: Profile
}

export interface Activity {
  id: string
  org_id: string
  contact_id: string | null
  rep_id: string | null
  location_id: string | null
  type: ActivityType
  outcome_type: OutcomeType | null
  outcome: string | null
  notes: string | null
  raw_transcript: string | null
  follow_up_date: string | null
  follow_up_action: string | null
  audio_url: string | null
  photo_urls: string[]
  confidence_score: number | null
  flagged: boolean
  flagged_reason: string | null
  occurred_at: string
  created_at: string
  contact?: Contact
  rep?: Profile
}

export interface Deal {
  id: string
  org_id: string
  location_id: string | null
  contact_id: string | null
  rep_id: string | null
  title: string | null
  stage: DealStage
  deal_value: number | null
  invoice_amount: number | null
  paid_amount: number | null
  damage_type: DamageType | null
  insurance_claim_number: string | null
  insurance_carrier: string | null
  adjuster_name: string | null
  property_address: string | null
  property_type: 'residential' | 'commercial' | 'industrial' | null
  emergency_priority: boolean
  expected_close_date: string | null
  actual_close_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
  contact?: Contact
  rep?: Profile
  location?: Location
}

export interface Quota {
  id: string
  rep_id: string
  org_id: string
  location_id: string | null
  period_type: 'monthly' | 'annual'
  period_year: number
  period_month: number | null
  target_amount: number
  target_activities: number | null
  created_at: string
}

export interface ParsedNote {
  contact_name: string | null
  company: string | null
  activity_type: ActivityType
  outcome_type: OutcomeType | null
  outcome: string | null
  notes: string
  follow_up_date: string | null
  follow_up_action: string | null
  deal_value: number | null
  damage_type: DamageType | null
  urgency: 'high' | 'normal' | null
  confidence_score: number
}

export interface DashboardStats {
  visits_today: number
  visits_this_week: number
  visits_this_month: number
  calls_this_month: number
  sales_mtd: number
  sales_ytd: number
  open_deals: number
  pipeline_value: number
  flagged_count: number
}

export interface LocationStats extends DashboardStats {
  location: Location
  top_rep: string | null
}

// ── Messaging (SMS / WhatsApp placeholder) ──────────────────
export interface InboundMessage {
  id: string
  org_id: string
  channel: MessageChannel
  from_number: string
  raw_body: string
  status: MessageStatus
  rep_id: string | null
  contact_id: string | null
  activity_id: string | null
  error_message: string | null
  received_at: string
  processed_at: string | null
}

export interface RepPhone {
  id: string
  rep_id: string
  org_id: string
  phone: string
  channel: 'sms' | 'whatsapp' | 'both'
  is_primary: boolean
  created_at: string
}

// ── Geo ─────────────────────────────────────────────────────
export interface LatLng {
  lat: number
  lng: number
}

// ── ERP / Outcome label maps ─────────────────────────────────
export const ERP_STATUS_LABELS: Record<ERPStatus, string> = {
  not_introduced:   'Not Introduced',
  walk_scheduled:   'Walk Scheduled',
  verbal_commitment:'Verbal Commitment',
  signed:           'ERP Signed',
}

export const ERP_STATUS_COLORS: Record<ERPStatus, string> = {
  not_introduced:   'text-muted-foreground border-border',
  walk_scheduled:   'text-blue-400 border-blue-400/30 bg-blue-400/10',
  verbal_commitment:'text-amber-400 border-amber-400/30 bg-amber-400/10',
  signed:           'text-green-400 border-green-400/30 bg-green-400/10',
}

export const OUTCOME_TYPE_LABELS: Record<OutcomeType, string> = {
  first_intro:        'First Introduction',
  relationship_dev:   'Relationship Development',
  erp_conversation:   'ERP Conversation',
  client_maintenance: 'Client Maintenance',
}
