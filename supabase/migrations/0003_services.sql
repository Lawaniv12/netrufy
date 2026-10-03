-- Service listings are distinct from skills and use the existing profile visibility controls.
alter table public.profiles
  add column services text[] not null default '{}';

update public.profiles
set visibility = visibility || '{"services":"community"}'::jsonb
where not (visibility ? 'services');

grant update (services) on public.profiles to authenticated;

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
    (select count(*) from public.testimonials t where t.profile_id = p.id and t.status = 'approved') end as testimonial_count,
  case when private.can_see(p.visibility->>'services', p.id) then p.services end as services
from public.profiles p
where p.community_id = private.my_community_id()
  and p.role in ('member','community_admin')
  and private.can_see(coalesce(p.visibility->>'listed','community'), p.id);

grant select on public.directory_profiles to authenticated;