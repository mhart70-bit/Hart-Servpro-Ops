-- Daily AI briefing cache — one briefing per user per day.
create table if not exists public.daily_briefings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  briefing_date date not null default current_date,
  content text not null,
  created_at timestamptz default now(),
  unique (user_id, briefing_date)
);

alter table public.daily_briefings enable row level security;

drop policy if exists "briefings_select_own" on public.daily_briefings;
create policy "briefings_select_own" on public.daily_briefings for select
  using (user_id = auth.uid());

grant select, insert, update, delete on public.daily_briefings to authenticated, service_role;
