-- Explicit role grants for all public schema tables.
-- Required by Supabase Data API changes effective October 30, 2026 for existing projects.
-- RLS policies still enforce row-level access; these grants allow the roles to see the tables at all.

grant select, insert, update, delete on public.organizations      to authenticated, service_role;
grant select, insert, update, delete on public.locations          to authenticated, service_role;
grant select, insert, update, delete on public.coi_categories     to authenticated, service_role;
grant select, insert, update, delete on public.profiles           to authenticated, service_role;
grant select, insert, update, delete on public.contacts           to authenticated, service_role;
grant select, insert, update, delete on public.activities         to authenticated, service_role;
grant select, insert, update, delete on public.deals              to authenticated, service_role;
grant select, insert, update, delete on public.quotas             to authenticated, service_role;
grant select, insert, update, delete on public.inbound_messages   to authenticated, service_role;
grant select, insert, update, delete on public.rep_phones         to authenticated, service_role;
