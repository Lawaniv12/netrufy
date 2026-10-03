-- One-time seed: creates your community, a Choir unit, and your own profile
-- as community_admin. Run this in Supabase SQL Editor → New query.
--
-- BEFORE running: sign in to the app once with the email below (email OTP),
-- so a matching row already exists in auth.users. If you skip this, the
-- final insert silently matches zero rows and nothing gets created —
-- check with the verification query at the bottom either way.
--
-- Edit the four values below, then run the whole script as one query.

with new_community as (
  insert into public.communities (name, slug)
  values ('Winners Chapel', 'winners-chapel')          -- <-- your community's name / URL slug
  returning id
), new_unit as (
  insert into public.units (community_id, name)
  select id, 'Choir' from new_community            -- <-- your pilot unit's name
  returning id, community_id
), new_profile as (
  insert into public.profiles (id, community_id, role, full_name, phone)
  select au.id, nc.id, 'community_admin', 'Victor Lawani', '2347017909308'
  --                                       ^ your full name   ^ digits only, no '+', no leading 0
  from auth.users au, new_community nc
  where au.email = 'lawaniv100@gmail.com'               -- <-- the email you signed in with
  returning id, community_id
)
insert into public.memberships (profile_id, unit_id, community_id, unit_role, status, verified_at)
select np.id, nu.id, nu.community_id, 'leader', 'verified', now()
from new_profile np, new_unit nu
returning *;

-- Verify it worked:
select c.name as community, p.full_name, p.role, p.phone
from public.profiles p join public.communities c on c.id = p.community_id;
