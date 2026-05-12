-- ============================================================
-- Hart SERVPRO CRM — Gap Fixes Migration
-- Run this in Supabase → SQL Editor after 001_initial_schema.sql
-- ============================================================

-- 1. CONTACTS — add ERP status, geo coordinates
alter table public.contacts
  add column if not exists erp_status text not null default 'not_introduced'
    check (erp_status in ('not_introduced', 'walk_scheduled', 'verbal_commitment', 'signed')),
  add column if not exists lat numeric(10, 7),
  add column if not exists lng numeric(10, 7),
  add column if not exists erp_signed_at timestamptz;

-- 2. ACTIVITIES — add outcome type and photo URLs
alter table public.activities
  add column if not exists outcome_type text
    check (outcome_type in ('first_intro', 'relationship_dev', 'erp_conversation', 'client_maintenance')),
  add column if not exists photo_urls text[] default '{}';

-- 3. INBOUND MESSAGES — SMS / WhatsApp placeholder
--    When real Twilio / WhatsApp Business API is wired in,
--    the webhook handler writes rows here. The AI parser
--    picks them up, identifies the rep by phone number,
--    and creates an activity record.
create table if not exists public.inbound_messages (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid references public.organizations(id) on delete cascade,
  channel      text not null check (channel in ('sms', 'whatsapp')),
  from_number  text not null,
  raw_body     text not null,
  status       text not null default 'pending'
                check (status in ('pending', 'processing', 'linked', 'failed')),
  rep_id       uuid references public.profiles(id) on delete set null,
  contact_id   uuid references public.contacts(id) on delete set null,
  activity_id  uuid references public.activities(id) on delete set null,
  error_message text,
  received_at  timestamptz default now(),
  processed_at timestamptz
);

-- RLS for inbound_messages
alter table public.inbound_messages enable row level security;

create policy "inbound_messages_select" on public.inbound_messages for select
  using (org_id = public.my_org_id() and public.my_role() in ('owner', 'gm'));

-- 4. REP PHONE REGISTRY — maps phone numbers to rep profiles
--    Required for SMS/WhatsApp rep identification
create table if not exists public.rep_phones (
  id         uuid primary key default gen_random_uuid(),
  rep_id     uuid references public.profiles(id) on delete cascade,
  org_id     uuid references public.organizations(id) on delete cascade,
  phone      text not null,
  channel    text not null default 'both' check (channel in ('sms', 'whatsapp', 'both')),
  is_primary boolean default true,
  created_at timestamptz default now(),
  unique (phone, channel)
);

alter table public.rep_phones enable row level security;

create policy "rep_phones_select" on public.rep_phones for select
  using (org_id = public.my_org_id());
create policy "rep_phones_insert" on public.rep_phones for insert
  with check (org_id = public.my_org_id() and public.my_role() in ('owner', 'gm'));

-- 5. INDEXES for new columns
create index if not exists idx_contacts_erp_status
  on public.contacts(erp_status) where is_active = true;

create index if not exists idx_contacts_geo
  on public.contacts(lat, lng) where lat is not null and lng is not null;

create index if not exists idx_activities_outcome_type
  on public.activities(outcome_type);

create index if not exists idx_inbound_messages_status
  on public.inbound_messages(status, received_at desc);

create index if not exists idx_inbound_messages_from
  on public.inbound_messages(from_number);

create index if not exists idx_rep_phones_phone
  on public.rep_phones(phone);
