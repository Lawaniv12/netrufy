create type public.application_status as enum ('pending', 'approved', 'rejected');

alter table public.profiles
  add column public_listing boolean not null default false,
  add column photo_url text;
grant update (public_listing, photo_url) on public.profiles to authenticated;

alter table public.invites
  add column invitee_email text,
  add column invitee_name text,
  add column invitee_phone text,
  add column invitee_photo_url text,
  add column invitee_public_listing boolean not null default false,
  add column application_id uuid;

create table public.membership_applications (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  unit_id uuid not null,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  email text not null check (length(email) <= 320),
  phone text not null check (length(phone) between 10 and 20),
  headline text,
  bio text,
  skills text[] not null default '{}',
  services text[] not null default '{}',
  wants_public_listing boolean not null default false,
  photo_path text not null,
  status public.application_status not null default 'pending',
  review_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (unit_id, community_id) references public.units(id, community_id) on delete cascade
);

alter table public.invites
  add constraint invites_application_id_fkey
    foreign key (application_id) references public.membership_applications(id) on delete set null;

create unique index membership_applications_one_open_per_email_unit
  on public.membership_applications (lower(email), unit_id)
  where status in ('pending', 'approved');
create unique index invites_one_per_application
  on public.invites (application_id) where application_id is not null;
create index membership_applications_unit_queue
  on public.membership_applications (unit_id, status, created_at desc);

alter table public.membership_applications enable row level security;
revoke all on public.membership_applications from anon, authenticated;
grant select on public.membership_applications to authenticated;
create policy membership_applications_unit_manager_read on public.membership_applications
  for select to authenticated using (private.can_manage_unit(unit_id));

create or replace function private.can_see(level text, owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select owner = (select auth.uid())
      or coalesce(level, 'community') = 'public'
      or (coalesce(level, 'community') = 'viewers' and private.my_role() is not null)
      or (coalesce(level, 'community') = 'community'
          and private.my_role() in ('member','community_admin','platform_admin'))
$$;

create or replace view public.public_application_units with (security_invoker = false) as
select u.id, u.community_id, c.name as community_name, u.name
from public.units u join public.communities c on c.id = u.community_id
where u.kind = 'unit';
grant select on public.public_application_units to anon, authenticated;

create or replace view public.public_directory_profiles with (security_invoker = false) as
select
  p.id, p.community_id, c.name as community_name, p.full_name,
  case when p.visibility->>'headline' = 'public' then p.headline end as headline,
  case when p.visibility->>'bio' = 'public' then p.bio end as bio,
  case when p.visibility->>'skills' = 'public' then p.skills end as skills,
  case when p.visibility->>'services' = 'public' then p.services end as services,
  case when p.visibility->>'location' = 'public' then p.location end as location,
  case when p.visibility->>'units' = 'public' then
    (select coalesce(array_agg(u.name order by u.name), '{}')
       from public.memberships m join public.units u on u.id = m.unit_id
      where m.profile_id = p.id and m.status = 'verified' and u.kind = 'unit') end as units,
  case when p.visibility->>'units' = 'public' then
    (select coalesce(array_agg(u.name order by u.name), '{}')
       from public.memberships m join public.units u on u.id = m.unit_id
      where m.profile_id = p.id and m.status = 'verified' and u.kind = 'home_cell') end as home_cells,
  case when p.visibility->>'photo' = 'public' then p.photo_url end as photo_url
from public.profiles p join public.communities c on c.id = p.community_id
where p.public_listing = true and p.role = 'member';
grant select on public.public_directory_profiles to anon, authenticated;

create or replace view public.public_profile_links with (security_invoker = false) as
select l.id, l.profile_id, l.kind, l.url
from public.profile_links l join public.profiles p on p.id = l.profile_id
where p.public_listing = true and p.role = 'member' and p.visibility->>'links' = 'public';
grant select on public.public_profile_links to anon, authenticated;

create or replace view public.unit_application_queue with (security_invoker = false) as
select a.id, a.community_id, a.unit_id, u.name as unit_name, a.full_name, a.email, a.phone,
       a.headline, a.bio, a.skills, a.services, a.photo_path, a.created_at
from public.membership_applications a join public.units u on u.id = a.unit_id
where a.status = 'pending' and private.can_manage_unit(a.unit_id);
grant select on public.unit_application_queue to authenticated;

create or replace view public.unit_member_roster with (security_invoker = false) as
select m.profile_id, m.unit_id, u.name as unit_name, p.full_name, p.phone, p.headline, m.since
from public.memberships m
join public.units u on u.id = m.unit_id
join public.profiles p on p.id = m.profile_id
where m.status = 'verified' and u.kind = 'unit' and private.can_manage_unit(m.unit_id);
grant select on public.unit_member_roster to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('applications', 'applications', false, 102400, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('member-photos', 'member-photos', true, 102400, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy application_photo_upload on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'applications' and storage.filename(name) = 'photo'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
create policy application_photo_unit_manager_read on storage.objects for select to authenticated
  using (bucket_id = 'applications' and exists (
    select 1 from public.membership_applications a
    where a.photo_path = storage.objects.name and private.can_manage_unit(a.unit_id)
  ));

create policy member_photo_owner_manage on storage.objects for all to authenticated
  using (bucket_id = 'member-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'member-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

alter publication supabase_realtime add table public.membership_applications;