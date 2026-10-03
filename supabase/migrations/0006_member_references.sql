create type public.member_reference_status as enum ('pending', 'accepted', 'declined');

create table public.member_references (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  requester_id uuid not null,
  recipient_id uuid not null,
  status public.member_reference_status not null default 'pending',
  relationship text,
  years_known int check (years_known between 0 and 80),
  statement text check (length(statement) <= 600),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> recipient_id),
  foreign key (requester_id, community_id) references public.profiles(id, community_id) on delete cascade,
  foreign key (recipient_id, community_id) references public.profiles(id, community_id) on delete cascade
);

create unique index member_references_one_pending_request
  on public.member_references (requester_id, recipient_id)
  where status = 'pending';
create index member_references_requester_status
  on public.member_references (requester_id, status, responded_at desc);
create index member_references_recipient_status
  on public.member_references (recipient_id, status, created_at desc);

alter table public.member_references enable row level security;
revoke all on public.member_references from anon, authenticated;
grant select on public.member_references to authenticated;
create policy member_references_participant_read on public.member_references
  for select to authenticated
  using (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()));

create or replace function private.shares_verified_group(first_member uuid, second_member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.unit_id = mine.unit_id
      and theirs.community_id = mine.community_id
    where mine.profile_id = first_member
      and theirs.profile_id = second_member
      and mine.status = 'verified'
      and theirs.status = 'verified'
  )
$$;
grant execute on function private.shares_verified_group(uuid, uuid) to authenticated;

create or replace view public.community_reference_candidates with (security_invoker = false) as
select p.id, p.full_name,
       array_agg(distinct u.name order by u.name) as shared_groups
from public.profiles p
join public.memberships theirs on theirs.profile_id = p.id and theirs.status = 'verified'
join public.units u on u.id = theirs.unit_id
where p.community_id = private.my_community_id()
  and p.role = 'member'
  and p.id <> (select auth.uid())
  and private.shares_verified_group((select auth.uid()), p.id)
group by p.id, p.full_name
order by p.full_name;
grant select on public.community_reference_candidates to authenticated;

create or replace view public.my_member_references with (security_invoker = false) as
select r.id, r.community_id, r.requester_id, r.recipient_id, r.status,
       r.relationship, r.years_known, r.statement, r.created_at, r.responded_at,
       requester.full_name as requester_name,
       recipient.full_name as recipient_name
from public.member_references r
join public.profiles requester on requester.id = r.requester_id
join public.profiles recipient on recipient.id = r.recipient_id
where (select auth.uid()) in (r.requester_id, r.recipient_id);
grant select on public.my_member_references to authenticated;

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
  case when p.visibility->>'photo' = 'public' then p.photo_url end as photo_url,
  case when p.visibility->>'trust' = 'public' then
    (select coalesce(jsonb_agg(jsonb_build_object(
       'member_name', endorser.full_name,
       'relationship', r.relationship,
       'years_known', r.years_known,
       'statement', r.statement,
       'responded_at', r.responded_at
     ) order by r.responded_at desc), '[]'::jsonb)
     from public.member_references r
     join public.profiles endorser on endorser.id = r.recipient_id
     where r.requester_id = p.id and r.status = 'accepted')
  end as community_references
from public.profiles p
join public.communities c on c.id = p.community_id
where p.public_listing = true and p.role = 'member';
grant select on public.public_directory_profiles to anon, authenticated;

alter publication supabase_realtime add table public.member_references;