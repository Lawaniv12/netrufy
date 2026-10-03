-- 0002_rls.sql — helpers, RLS policies, column grants, directory view, RPC, storage

-- ---------- helpers (SECURITY DEFINER so they can read profiles without recursing into RLS)
create or replace function private.my_community_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select community_id from public.profiles where id = (select auth.uid())
$$;

create or replace function private.my_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid())
$$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.my_role() in ('community_admin','platform_admin'), false)
$$;

-- level: 'private' | 'community' | 'viewers'   (null => 'community')
create or replace function private.can_see(level text, owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select owner = (select auth.uid())
      or (coalesce(level,'community') = 'viewers'
          and private.my_role() is not null)
      or (coalesce(level,'community') = 'community'
          and private.my_role() in ('member','community_admin','platform_admin'))
$$;

-- same community + profile is listed + field visible to the caller
create or replace function private.can_see_field(pid uuid, field text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = pid
      and p.community_id = private.my_community_id()
      and private.can_see(coalesce(p.visibility->>'listed','community'), p.id)
      and private.can_see(p.visibility->>field, p.id)
  )
$$;

grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

-- ---------- default-deny, then explicit grants
revoke all on all tables in schema public from anon, authenticated;

alter table public.communities    enable row level security;
alter table public.units          enable row level security;
alter table public.profiles       enable row level security;
alter table public.memberships    enable row level security;
alter table public.profile_links  enable row level security;
alter table public.documents      enable row level security;
alter table public.attestations   enable row level security;
alter table public.testimonials   enable row level security;
alter table public.invites        enable row level security;
alter table public.contact_logs   enable row level security;
alter table public.audit_log      enable row level security;

-- communities / units
grant select on public.communities, public.units to authenticated;
create policy communities_read on public.communities for select to authenticated
  using (id = private.my_community_id());
create policy units_read on public.units for select to authenticated
  using (community_id = private.my_community_id());
grant insert, update, delete on public.units to authenticated;
create policy units_admin_write on public.units for all to authenticated
  using (private.is_admin() and community_id = private.my_community_id())
  with check (private.is_admin() and community_id = private.my_community_id());

-- profiles: base table = owner + admins only. Everyone else reads the masked view below.
grant select on public.profiles to authenticated;
create policy profiles_self_or_admin_read on public.profiles for select to authenticated
  using (id = (select auth.uid())
         or (private.is_admin() and community_id = private.my_community_id()));
grant update (full_name, headline, bio, skills, location, open_to_work, visibility)
  on public.profiles to authenticated;                   -- role / community_id / phone NOT updatable
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- memberships
grant select on public.memberships to authenticated;
create policy memberships_read on public.memberships for select to authenticated
  using (profile_id = (select auth.uid())
         or (private.is_admin() and community_id = private.my_community_id()));
grant insert, update, delete on public.memberships to authenticated;
create policy memberships_admin_write on public.memberships for all to authenticated
  using (private.is_admin() and community_id = private.my_community_id())
  with check (private.is_admin() and community_id = private.my_community_id());

-- profile_links
grant select, insert, update, delete on public.profile_links to authenticated;
create policy links_read on public.profile_links for select to authenticated
  using (profile_id = (select auth.uid()) or private.can_see_field(profile_id, 'links'));
create policy links_owner_write on public.profile_links for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()) and community_id = private.my_community_id());

-- documents (RLS decides who may get a signed URL; the bytes stay private in storage)
grant select, insert, delete on public.documents to authenticated;
create policy docs_read on public.documents for select to authenticated
  using (profile_id = (select auth.uid()) or (kind = 'cv' and private.can_see_field(profile_id, 'cv')));
create policy docs_owner_write on public.documents for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()) and community_id = private.my_community_id());

-- attestations: read-only for clients, and NEVER token/otp/phone columns.
-- Creation and verification happen server-side with the service role.
grant select (id, profile_id, community_id, guarantor_name, relationship, years_known,
              statement, status, verified_at, created_at)
  on public.attestations to authenticated;
create policy attest_read on public.attestations for select to authenticated
  using (profile_id = (select auth.uid())
         or (private.is_admin() and community_id = private.my_community_id())
         or (status = 'verified' and private.can_see_field(profile_id, 'trust')));

-- testimonials
grant select on public.testimonials to authenticated;
grant insert (profile_id, community_id, author_id, body, image_path) on public.testimonials to authenticated;
grant update (status) on public.testimonials to authenticated;
create policy testi_read on public.testimonials for select to authenticated
  using (profile_id = (select auth.uid()) or author_id = (select auth.uid())
         or (private.is_admin() and community_id = private.my_community_id())
         or (status = 'approved' and private.can_see_field(profile_id, 'trust')));
create policy testi_insert on public.testimonials for insert to authenticated
  with check (author_id = (select auth.uid())
              and community_id = private.my_community_id()
              and profile_id <> (select auth.uid())
              and private.my_role() in ('member','community_admin'));   -- verified members only
create policy testi_moderate on public.testimonials for update to authenticated
  using (profile_id = (select auth.uid()) or (private.is_admin() and community_id = private.my_community_id()))
  with check (profile_id = (select auth.uid()) or (private.is_admin() and community_id = private.my_community_id()));

-- invites / contact_logs / audit_log: admins read; writes are server-side
grant select on public.invites, public.contact_logs, public.audit_log to authenticated;
create policy invites_admin_read on public.invites for select to authenticated
  using (private.is_admin() and community_id = private.my_community_id());
create policy contact_admin_read on public.contact_logs for select to authenticated
  using (viewer_id = (select auth.uid())
         or (private.is_admin() and community_id = private.my_community_id()));
create policy audit_admin_read on public.audit_log for select to authenticated
  using (private.is_admin() and community_id = private.my_community_id());

-- ---------- masked directory view (what members and viewers actually browse)
-- Runs as owner on purpose; the WHERE clause and can_see() enforce tenant + visibility.
-- Phone is never exposed here.
create or replace view public.directory_profiles with (security_invoker = false) as
select
  p.id, p.community_id, p.full_name,
  case when private.can_see(p.visibility->>'headline', p.id) then p.headline end as headline,
  case when private.can_see(p.visibility->>'bio', p.id)      then p.bio end      as bio,
  case when private.can_see(p.visibility->>'skills', p.id)   then p.skills end   as skills,
  case when private.can_see(p.visibility->>'location', p.id) then p.location end as location,
  p.open_to_work,
  case when private.can_see(p.visibility->>'units', p.id) then
    (select coalesce(array_agg(u.name order by u.name), '{}')
       from public.memberships m join public.units u on u.id = m.unit_id
      where m.profile_id = p.id) end as units,
  case when private.can_see(p.visibility->>'trust', p.id) then
    (select count(*) from public.attestations a where a.profile_id = p.id and a.status = 'verified') end as verified_guarantors,
  case when private.can_see(p.visibility->>'trust', p.id) then
    (select count(*) from public.testimonials t where t.profile_id = p.id and t.status = 'approved') end as testimonial_count
from public.profiles p
where p.community_id = private.my_community_id()
  and p.role in ('member','community_admin')          -- employers/viewers are never listed as talent
  and private.can_see(coalesce(p.visibility->>'listed','community'), p.id);
grant select on public.directory_profiles to authenticated;

-- ---------- contact: phone is revealed only through this logged RPC
create or replace function public.reveal_contact(p_profile uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_phone text;
begin
  if (select auth.uid()) is null or not private.can_see_field(p_profile, 'contact') then
    return null;
  end if;
  select phone into v_phone from public.profiles where id = p_profile;
  insert into public.contact_logs (community_id, viewer_id, profile_id)
  values (private.my_community_id(), (select auth.uid()), p_profile);
  return v_phone;
end $$;
revoke execute on function public.reveal_contact(uuid) from public, anon;
grant execute on function public.reveal_contact(uuid) to authenticated;

-- ---------- storage: private bucket, path = {community_id}/{profile_id}/{file}
insert into storage.buckets (id, name, public) values ('documents','documents', false)
on conflict (id) do nothing;
create policy docs_owner_objects on storage.objects for all to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[2] = (select auth.uid())::text)
  with check (bucket_id = 'documents' and (storage.foldername(name))[2] = (select auth.uid())::text);
-- viewers/members get CV access via short-lived signed URLs minted server-side
-- AFTER a `documents` row is visible to them under RLS.
