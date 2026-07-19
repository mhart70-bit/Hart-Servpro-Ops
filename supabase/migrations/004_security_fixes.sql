-- ============================================================
-- Hart SERVPRO CRM — Security fixes
-- 1. Stop users from changing their own role/org/location
--    (profiles_update_own had no column restrictions — any rep
--    could PATCH role='owner' via the REST API).
-- 2. Stop signup metadata from selecting a privileged role
--    (handle_new_user trusted raw_user_meta_data->>'role').
-- 3. Stop reps from inserting activities/deals as another rep.
-- ============================================================

-- 1a. Replace the self-update policy: users may edit their own profile
--     but the WITH CHECK re-reads the CURRENT role/org/location via
--     security-definer helpers, so privileged columns cannot change.
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_update_own" on public.profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = public.my_role()
    and org_id = public.my_org_id()
    and coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(public.my_location_id(), '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- 1b. Owners (and GMs for their market) manage team profiles.
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles for update
  using (
    org_id = public.my_org_id()
    and id <> auth.uid()
    and (
      public.my_role() = 'owner'
      or (public.my_role() = 'gm' and location_id = public.my_location_id())
    )
  );

-- 2. New signups are ALWAYS reps; role upgrades are done by an owner in Team.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, org_id, full_name, role)
  values (
    new.id,
    '00000000-0000-0000-0000-000000000001',
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'rep'
  );
  return new;
end;
$$;

-- 3. Activities/deals must be inserted as yourself (managers may backfill
--    for reps in their scope).
drop policy if exists "activities_insert" on public.activities;
create policy "activities_insert" on public.activities for insert
  with check (
    org_id = public.my_org_id()
    and (rep_id = auth.uid() or public.my_role() in ('owner', 'gm'))
  );

drop policy if exists "deals_insert" on public.deals;
create policy "deals_insert" on public.deals for insert
  with check (
    org_id = public.my_org_id()
    and (rep_id = auth.uid() or public.my_role() in ('owner', 'gm'))
  );
