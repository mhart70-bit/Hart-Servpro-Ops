-- One rep per city: a rep owns their whole MARKET, not just individually
-- assigned contacts. Reps can see/work every contact, activity, and deal in
-- their location — so imported/market-level records show up in their book.

drop policy if exists "contacts_select" on public.contacts;
create policy "contacts_select" on public.contacts for select using (
  org_id = public.my_org_id() and (
    public.my_role() in ('owner', 'gm')
    or assigned_rep_id = auth.uid()
    or location_id = public.my_location_id()
  )
);

drop policy if exists "contacts_update" on public.contacts;
create policy "contacts_update" on public.contacts for update using (
  org_id = public.my_org_id() and (
    public.my_role() in ('owner', 'gm')
    or assigned_rep_id = auth.uid()
    or location_id = public.my_location_id()
  )
);

drop policy if exists "activities_select" on public.activities;
create policy "activities_select" on public.activities for select using (
  org_id = public.my_org_id() and (
    public.my_role() in ('owner', 'gm')
    or rep_id = auth.uid()
    or location_id = public.my_location_id()
  )
);

drop policy if exists "deals_select" on public.deals;
create policy "deals_select" on public.deals for select using (
  org_id = public.my_org_id() and (
    public.my_role() in ('owner', 'gm')
    or rep_id = auth.uid()
    or location_id = public.my_location_id()
  )
);
