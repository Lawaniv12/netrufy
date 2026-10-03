-- 0001_schema.sql — tables, enums, tenant-integrity constraints
create extension if not exists pgcrypto;
create schema if not exists private;

create type public.app_role as enum ('platform_admin','community_admin','member','viewer');
create type public.unit_role as enum ('member','leader');
create type public.attestation_status as enum ('pending','verified','revoked','expired');
create type public.review_status as enum ('pending','approved','rejected');

create table public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'church',
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  name text not null,
  unique (community_id, name),
  unique (id, community_id)                       -- target for composite FKs
);

-- Profiles are created ONLY server-side (service role) after invite redemption.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  community_id uuid not null references public.communities(id),
  role public.app_role not null default 'member',
  full_name text not null,
  phone text not null unique,                     -- E.164 without '+', e.g. 2348012345678
  headline text,
  bio text,
  skills text[] not null default '{}',
  location text,
  open_to_work boolean not null default false,
  -- who may see each field: 'private' | 'community' | 'viewers'
  visibility jsonb not null default '{
    "listed":"community","headline":"community","bio":"community","skills":"community",
    "location":"community","units":"community","links":"community","cv":"private",
    "trust":"viewers","contact":"community"
  }',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, community_id)
);

create table public.memberships (
  profile_id uuid not null,
  unit_id uuid not null,
  community_id uuid not null,
  unit_role public.unit_role not null default 'member',
  since date,
  primary key (profile_id, unit_id),
  foreign key (profile_id, community_id) references public.profiles(id, community_id) on delete cascade,
  foreign key (unit_id, community_id) references public.units(id, community_id) on delete cascade
);

create table public.profile_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  community_id uuid not null,
  kind text not null check (kind in ('portfolio','linkedin','github','website','other')),
  url text not null check (url ~* '^https?://' and length(url) <= 500),
  created_at timestamptz not null default now(),
  foreign key (profile_id, community_id) references public.profiles(id, community_id) on delete cascade
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  community_id uuid not null,
  kind text not null check (kind in ('cv','certificate','other')),
  storage_path text not null,                     -- {community_id}/{profile_id}/{file}
  file_name text not null,
  size_bytes int,
  created_at timestamptz not null default now(),
  foreign key (profile_id, community_id) references public.profiles(id, community_id) on delete cascade
);

-- Guarantors have NO account. They act through a single-use link + phone OTP.
create table public.attestations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  community_id uuid not null,
  guarantor_name text not null,
  guarantor_phone text not null,
  guarantor_user_id uuid references public.profiles(id),   -- set when phone matches a registered leader
  relationship text,
  years_known int check (years_known between 0 and 80),
  statement text check (length(statement) <= 600),
  status public.attestation_status not null default 'pending',
  token_hash text unique,                          -- sha256(link token); nulled once used
  token_expires_at timestamptz not null,
  otp_hash text,
  otp_sent_at timestamptz,
  otp_expires_at timestamptz,
  otp_attempts int not null default 0,
  otp_send_count int not null default 0,
  verified_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (profile_id, community_id) references public.profiles(id, community_id) on delete cascade
);

create table public.testimonials (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  community_id uuid not null,
  author_id uuid not null references public.profiles(id),
  body text check (length(body) between 10 and 800),
  image_path text,
  status public.review_status not null default 'pending',
  created_at timestamptz not null default now(),
  check (body is not null or image_path is not null),
  foreign key (profile_id, community_id) references public.profiles(id, community_id) on delete cascade
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  unit_id uuid references public.units(id),
  role public.app_role not null check (role in ('member','viewer')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.contact_logs (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null,
  viewer_id uuid not null references public.profiles(id),
  profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  community_id uuid,
  actor text,
  action text not null,
  entity text,
  entity_id uuid,
  at timestamptz not null default now()
);

create index on public.profiles (community_id);
create index on public.memberships (community_id, unit_id);
create index on public.attestations (profile_id, status);
create index on public.testimonials (profile_id, status);
create index on public.contact_logs (community_id, profile_id);

create or replace function private.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();
