create or replace view public.unit_member_roster with (security_invoker = false) as
select m.profile_id, m.unit_id, u.name as unit_name, p.full_name, p.phone,
       p.headline, m.since, m.unit_role
from public.memberships m
join public.units u on u.id = m.unit_id
join public.profiles p on p.id = m.profile_id
where m.status = 'verified'
  and u.kind = 'unit'
  and private.can_manage_unit(m.unit_id);

grant select on public.unit_member_roster to authenticated;