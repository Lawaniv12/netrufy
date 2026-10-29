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
from public.profiles p join public.communities c on c.id = p.community_id
where p.public_listing = true and p.role in ('member', 'community_admin');
grant select on public.public_directory_profiles to anon, authenticated;

create or replace view public.public_profile_links with (security_invoker = false) as
select l.id, l.profile_id, l.kind, l.url
from public.profile_links l join public.profiles p on p.id = l.profile_id
where p.public_listing = true
  and p.role in ('member', 'community_admin')
  and p.visibility->>'links' = 'public';
grant select on public.public_profile_links to anon, authenticated;
