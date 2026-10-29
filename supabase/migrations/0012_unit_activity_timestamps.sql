alter table public.memberships add column joined_at timestamptz;

create or replace function private.set_membership_joined_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.joined_at is null then
    new.joined_at := now();
  end if;
  return new;
end
$$;

create trigger memberships_set_joined_at
  before insert on public.memberships
  for each row execute function private.set_membership_joined_at();

create or replace view public.unit_member_roster with (security_invoker = false) as
select m.profile_id, m.unit_id, u.name as unit_name, p.full_name, p.phone,
       p.headline, m.since, m.unit_role, m.joined_at
from public.memberships m
join public.units u on u.id = m.unit_id
join public.profiles p on p.id = m.profile_id
where m.status = 'verified'
  and u.kind = 'unit'
  and private.can_manage_unit(m.unit_id);

grant select on public.unit_member_roster to authenticated;
