-- ============================================================
-- Hart SERVPRO CRM — Initial Schema
-- Run this in your Supabase project → SQL Editor
-- ============================================================

-- 1. ORGANIZATIONS (tenant root — future multi-org support)
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_at timestamptz default now()
);

-- 2. LOCATIONS (franchise markets)
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  city text,
  state text not null default 'TX',
  created_at timestamptz default now()
);

-- 3. COI CATEGORIES
create table if not exists public.coi_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  default_visit_frequency_days integer not null default 30,
  color text,
  created_at timestamptz default now()
);

-- 4. USER PROFILES (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id),
  full_name text,
  role text not null default 'rep' check (role in ('owner', 'gm', 'rep')),
  phone text,
  avatar_url text,
  created_at timestamptz default now()
);

-- 5. CONTACTS (COIs + customers)
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id),
  category_id uuid references public.coi_categories(id),
  first_name text,
  last_name text,
  company text,
  title text,
  email text,
  phone text,
  phone_mobile text,
  address text,
  city text,
  state text default 'TX',
  zip text,
  assigned_rep_id uuid references public.profiles(id),
  visit_frequency_days integer default 30,
  last_contacted_at timestamptz,
  next_visit_due_at timestamptz,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  tags text[] default '{}',
  notes text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 6. ACTIVITIES (visits, calls, voice notes, emails)
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  rep_id uuid references public.profiles(id) on delete set null,
  location_id uuid references public.locations(id),
  type text not null default 'visit' check (type in ('visit', 'call', 'email', 'note', 'voice_note')),
  outcome text,
  notes text,
  raw_transcript text,
  follow_up_date date,
  follow_up_action text,
  audio_url text,
  confidence_score numeric(3,2),
  flagged boolean default false,
  flagged_reason text,
  occurred_at timestamptz default now(),
  created_at timestamptz default now()
);

-- 7. DEALS (restoration jobs / sales pipeline)
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id),
  contact_id uuid references public.contacts(id) on delete set null,
  rep_id uuid references public.profiles(id) on delete set null,
  title text,
  stage text not null default 'emergency_call' check (stage in (
    'emergency_call', 'assessment', 'estimate', 'approved',
    'job_start', 'completion', 'invoiced', 'paid', 'lost'
  )),
  deal_value numeric(12,2),
  invoice_amount numeric(12,2),
  paid_amount numeric(12,2),
  damage_type text check (damage_type in ('water','fire','mold','storm','biohazard','other')),
  insurance_claim_number text,
  insurance_carrier text,
  adjuster_name text,
  property_address text,
  property_type text default 'residential' check (property_type in ('residential','commercial','industrial')),
  emergency_priority boolean default false,
  expected_close_date date,
  actual_close_date date,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 8. QUOTAS
create table if not exists public.quotas (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid references public.profiles(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id),
  period_type text not null check (period_type in ('monthly', 'annual')),
  period_year integer not null,
  period_month integer,
  target_amount numeric(12,2) not null,
  target_activities integer,
  created_at timestamptz default now(),
  unique(rep_id, period_type, period_year, period_month)
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_contacts_org on public.contacts(org_id);
create index if not exists idx_contacts_rep on public.contacts(assigned_rep_id);
create index if not exists idx_contacts_next_visit on public.contacts(next_visit_due_at) where is_active = true;
create index if not exists idx_activities_org on public.activities(org_id);
create index if not exists idx_activities_rep on public.activities(rep_id);
create index if not exists idx_activities_occurred on public.activities(occurred_at desc);
create index if not exists idx_deals_org on public.deals(org_id);
create index if not exists idx_deals_rep on public.deals(rep_id);
create index if not exists idx_deals_stage on public.deals(stage);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.organizations enable row level security;
alter table public.locations enable row level security;
alter table public.coi_categories enable row level security;
alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.activities enable row level security;
alter table public.deals enable row level security;
alter table public.quotas enable row level security;

-- Helper: get current user's org_id
create or replace function public.my_org_id()
returns uuid language sql security definer stable as $$
  select org_id from public.profiles where id = auth.uid()
$$;

-- Helper: get current user's role
create or replace function public.my_role()
returns text language sql security definer stable as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Helper: get current user's location_id
create or replace function public.my_location_id()
returns uuid language sql security definer stable as $$
  select location_id from public.profiles where id = auth.uid()
$$;

-- Organizations: users see only their org
create policy "org_select" on public.organizations for select
  using (id = public.my_org_id());

-- Locations: users see their org's locations
create policy "locations_select" on public.locations for select
  using (org_id = public.my_org_id());

-- COI Categories: see their org's categories
create policy "categories_select" on public.coi_categories for select
  using (org_id = public.my_org_id());
create policy "categories_insert" on public.coi_categories for insert
  with check (org_id = public.my_org_id() and public.my_role() in ('owner', 'gm'));

-- Profiles: see teammates in same org
create policy "profiles_select" on public.profiles for select
  using (org_id = public.my_org_id());
create policy "profiles_update_own" on public.profiles for update
  using (id = auth.uid());

-- Contacts: reps see only their assigned contacts; owner/GM see all in org
create policy "contacts_select" on public.contacts for select
  using (
    org_id = public.my_org_id()
    and (
      public.my_role() in ('owner', 'gm')
      or assigned_rep_id = auth.uid()
    )
  );
create policy "contacts_insert" on public.contacts for insert
  with check (org_id = public.my_org_id());
create policy "contacts_update" on public.contacts for update
  using (
    org_id = public.my_org_id()
    and (public.my_role() in ('owner', 'gm') or assigned_rep_id = auth.uid())
  );

-- Activities: reps see own; owner/GM see all in org
create policy "activities_select" on public.activities for select
  using (
    org_id = public.my_org_id()
    and (public.my_role() in ('owner', 'gm') or rep_id = auth.uid())
  );
create policy "activities_insert" on public.activities for insert
  with check (org_id = public.my_org_id());
create policy "activities_update" on public.activities for update
  using (org_id = public.my_org_id() and (public.my_role() in ('owner', 'gm') or rep_id = auth.uid()));

-- Deals: same pattern as activities
create policy "deals_select" on public.deals for select
  using (org_id = public.my_org_id() and (public.my_role() in ('owner', 'gm') or rep_id = auth.uid()));
create policy "deals_insert" on public.deals for insert
  with check (org_id = public.my_org_id());
create policy "deals_update" on public.deals for update
  using (org_id = public.my_org_id() and (public.my_role() in ('owner', 'gm') or rep_id = auth.uid()));

-- Quotas: owner/GM manage; reps see own
create policy "quotas_select" on public.quotas for select
  using (org_id = public.my_org_id() and (public.my_role() in ('owner', 'gm') or rep_id = auth.uid()));
create policy "quotas_insert" on public.quotas for insert
  with check (org_id = public.my_org_id() and public.my_role() in ('owner', 'gm'));

-- ============================================================
-- SEED DATA — Hart SERVPRO Organization
-- ============================================================

-- Insert org
insert into public.organizations (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'Hart SERVPRO', 'hart-servpro')
on conflict do nothing;

-- Insert 5 franchise locations
insert into public.locations (id, org_id, name, city, state) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Amarillo', 'Amarillo', 'TX'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Abilene', 'Abilene', 'TX'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'San Angelo', 'San Angelo', 'TX'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Victoria', 'Victoria', 'TX'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Sugar Land', 'Sugar Land', 'TX')
on conflict do nothing;

-- Insert COI categories with visit frequencies
insert into public.coi_categories (org_id, name, default_visit_frequency_days, color) values
  ('00000000-0000-0000-0000-000000000001', 'Insurance Agent', 14, '#f59e0b'),
  ('00000000-0000-0000-0000-000000000001', 'Insurance Adjuster', 30, '#f97316'),
  ('00000000-0000-0000-0000-000000000001', 'Property Manager', 30, '#3b82f6'),
  ('00000000-0000-0000-0000-000000000001', 'Real Estate Agent', 14, '#8b5cf6'),
  ('00000000-0000-0000-0000-000000000001', 'Facility Manager', 30, '#06b6d4'),
  ('00000000-0000-0000-0000-000000000001', 'HOA Manager', 90, '#10b981'),
  ('00000000-0000-0000-0000-000000000001', 'Commercial Property Owner', 30, '#6366f1'),
  ('00000000-0000-0000-0000-000000000001', 'Plumber / Contractor', 30, '#ec4899'),
  ('00000000-0000-0000-0000-000000000001', 'Hotel / Hospitality', 30, '#14b8a6'),
  ('00000000-0000-0000-0000-000000000001', 'Healthcare Facility', 30, '#ef4444'),
  ('00000000-0000-0000-0000-000000000001', 'Church / Non-profit', 90, '#a78bfa'),
  ('00000000-0000-0000-0000-000000000001', 'Government / Municipal', 60, '#64748b'),
  ('00000000-0000-0000-0000-000000000001', 'Large Employer / Corporate', 30, '#0ea5e9'),
  ('00000000-0000-0000-0000-000000000001', 'Other Referral Partner', 30, '#94a3b8')
on conflict do nothing;

-- ============================================================
-- AUTO-UPDATE updated_at trigger
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger contacts_updated_at
  before update on public.contacts
  for each row execute function public.handle_updated_at();

create or replace trigger deals_updated_at
  before update on public.deals
  for each row execute function public.handle_updated_at();

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- Paste this in Supabase Dashboard → Authentication → Hooks
-- OR run as a trigger:
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, org_id, full_name, role)
  values (
    new.id,
    '00000000-0000-0000-0000-000000000001',  -- Hart SERVPRO org
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'rep')
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
