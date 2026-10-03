create type public.unit_kind as enum ('unit', 'home_cell');
alter table public.units
  add column kind public.unit_kind not null default 'unit';

create type public.membership_status as enum ('pending', 'verified', 'rejected');
alter table public.memberships
  add column status public.membership_status not null default 'pending',
  add column verified_by uuid references public.profiles(id),
  add column verified_at timestamptz;

update public.memberships
set status = 'verified', verified_at = now();

create index memberships_home_cell_status_idx
  on public.memberships (unit_id, status);

create or replace function private.can_manage_unit(target_unit uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.units u
    where u.id = target_unit
      and u.community_id = private.my_community_id()
      and (
        private.is_admin()
        or exists (
          select 1 from public.memberships m
          where m.unit_id = u.id
            and m.profile_id = (select auth.uid())
            and m.unit_role = 'leader'
            and m.status = 'verified'
        )
      )
  )
$$;
grant execute on function private.can_manage_unit(uuid) to authenticated;

create policy memberships_self_home_cell_request on public.memberships
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and community_id = private.my_community_id()
    and unit_role = 'member'
    and status = 'pending'
    and exists (
      select 1 from public.units u
      where u.id = unit_id
        and u.community_id = community_id
        and u.kind = 'home_cell'
    )
  );

create policy memberships_leader_verify on public.memberships
  for update to authenticated
  using (profile_id <> (select auth.uid()) and private.can_manage_unit(unit_id))
  with check (profile_id <> (select auth.uid()) and private.can_manage_unit(unit_id));

create policy memberships_self_resubmit on public.memberships
  for update to authenticated
  using (profile_id = (select auth.uid()) and status = 'rejected')
  with check (profile_id = (select auth.uid()) and status = 'pending');

create policy memberships_manager_read on public.memberships
  for select to authenticated
  using (private.can_manage_unit(unit_id));

revoke update on public.memberships from authenticated;
grant update (unit_role, status) on public.memberships to authenticated;

create or replace function private.stamp_membership_verification() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'verified' then
      new.verified_by := (select auth.uid());
      new.verified_at := now();
    end if;
    return new;
  end if;

  if new.unit_role is distinct from old.unit_role and not private.is_admin() then
    raise exception 'Only administrators may assign group leaders';
  end if;
  if new.status = 'verified' and old.status is distinct from 'verified' then
    new.verified_by := (select auth.uid());
    new.verified_at := now();
  elsif new.status <> 'verified' then
    new.verified_by := null;
    new.verified_at := null;
  end if;
  return new;
end $$;

create trigger memberships_stamp_verification
  before insert or update on public.memberships
  for each row execute function private.stamp_membership_verification();

create or replace view public.home_cell_membership_requests with (security_invoker = false) as
select
  m.profile_id,
  m.unit_id,
  u.name as home_cell_name,
  p.full_name,
  m.status
from public.memberships m
join public.units u on u.id = m.unit_id
join public.profiles p on p.id = m.profile_id
where u.kind = 'home_cell'
  and m.status = 'pending'
  and private.can_manage_unit(m.unit_id);
grant select on public.home_cell_membership_requests to authenticated;

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
      where m.profile_id = p.id and m.status = 'verified' and u.kind = 'unit') end as units,
  case when private.can_see(p.visibility->>'trust', p.id) then
    (select count(*) from public.attestations a where a.profile_id = p.id and a.status = 'verified') end as verified_guarantors,
  case when private.can_see(p.visibility->>'trust', p.id) then
    (select count(*) from public.testimonials t where t.profile_id = p.id and t.status = 'approved') end as testimonial_count,
  case when private.can_see(p.visibility->>'services', p.id) then p.services end as services,
  case when private.can_see(p.visibility->>'trust', p.id) then
    (select coalesce(array_agg(u.name order by u.name), '{}')
       from public.memberships m join public.units u on u.id = m.unit_id
      where m.profile_id = p.id and m.status = 'verified' and u.kind = 'home_cell') end as home_cells
from public.profiles p
where p.community_id = private.my_community_id()
  and p.role in ('member','community_admin')
  and private.can_see(coalesce(p.visibility->>'listed','community'), p.id);
grant select on public.directory_profiles to authenticated;