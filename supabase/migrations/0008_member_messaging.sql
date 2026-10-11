create table public.direct_conversations (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  requester_id uuid not null,
  recipient_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> recipient_id),
  foreign key (requester_id, community_id) references public.profiles(id, community_id) on delete cascade,
  foreign key (recipient_id, community_id) references public.profiles(id, community_id) on delete cascade
);

create unique index direct_conversations_pair
  on public.direct_conversations (community_id, least(requester_id, recipient_id), greatest(requester_id, recipient_id));
create index direct_conversations_requester_inbox
  on public.direct_conversations (requester_id, updated_at desc);
create index direct_conversations_recipient_inbox
  on public.direct_conversations (recipient_id, updated_at desc);

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index direct_messages_conversation_created
  on public.direct_messages (conversation_id, created_at desc);

create or replace function private.touch_direct_conversation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.direct_conversations set updated_at = now() where id = new.conversation_id;
  return new;
end
$$;
create trigger direct_messages_touch_conversation
  after insert on public.direct_messages
  for each row execute function private.touch_direct_conversation();

create table public.direct_conversation_reads (
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

create table public.direct_message_blocks (
  community_id uuid not null references public.communities(id) on delete cascade,
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (community_id, blocker_id, blocked_id),
  check (blocker_id <> blocked_id),
  foreign key (blocker_id, community_id) references public.profiles(id, community_id) on delete cascade,
  foreign key (blocked_id, community_id) references public.profiles(id, community_id) on delete cascade
);

create table public.direct_message_reports (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid references public.direct_messages(id) on delete set null,
  reason text not null check (reason in ('spam', 'harassment', 'unsafe', 'other')),
  details text check (length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewed', 'actioned', 'dismissed')),
  created_at timestamptz not null default now()
);
create index direct_message_reports_status_created
  on public.direct_message_reports (status, created_at desc);

alter table public.direct_conversations enable row level security;
alter table public.direct_messages enable row level security;
alter table public.direct_conversation_reads enable row level security;
alter table public.direct_message_blocks enable row level security;
alter table public.direct_message_reports enable row level security;

revoke all on public.direct_conversations, public.direct_messages, public.direct_conversation_reads,
  public.direct_message_blocks, public.direct_message_reports from anon, authenticated;
grant select on public.direct_conversations to authenticated;
grant select, insert on public.direct_messages to authenticated;
grant select on public.direct_conversation_reads, public.direct_message_reports to authenticated;
grant insert on public.direct_message_reports to authenticated;
grant update (status) on public.direct_message_reports to authenticated;

create or replace function private.can_review_direct_message_report(target_conversation uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.direct_conversations c
    join public.profiles moderator on moderator.id = (select auth.uid())
    where c.id = target_conversation
      and (moderator.role = 'platform_admin'
        or (moderator.role = 'community_admin' and moderator.community_id = c.community_id))
  )
$$;
grant execute on function private.can_review_direct_message_report(uuid) to authenticated;

create or replace function private.direct_pair_is_blocked(first_member uuid, second_member uuid, target_community uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.direct_message_blocks b
    where b.community_id = target_community
      and ((b.blocker_id = first_member and b.blocked_id = second_member)
        or (b.blocker_id = second_member and b.blocked_id = first_member))
  )
$$;
grant execute on function private.direct_pair_is_blocked(uuid, uuid, uuid) to authenticated;

create policy direct_conversations_participant_read on public.direct_conversations
  for select to authenticated
  using ((select auth.uid()) in (requester_id, recipient_id));

create policy direct_messages_participant_read on public.direct_messages
  for select to authenticated using (
    exists (
      select 1 from public.direct_conversations c
      where c.id = conversation_id
        and c.status = 'accepted'
        and (select auth.uid()) in (c.requester_id, c.recipient_id)
        and not private.direct_pair_is_blocked(c.requester_id, c.recipient_id, c.community_id)
    )
  );
create policy direct_messages_participant_send on public.direct_messages
  for insert to authenticated with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.direct_conversations c
      where c.id = conversation_id
        and c.status = 'accepted'
        and (select auth.uid()) in (c.requester_id, c.recipient_id)
        and not private.direct_pair_is_blocked(c.requester_id, c.recipient_id, c.community_id)
    )
  );

create policy direct_conversation_reads_owner_read on public.direct_conversation_reads
  for select to authenticated using (profile_id = (select auth.uid()));

create policy direct_message_reports_participant_read on public.direct_message_reports
  for select to authenticated using (
    reporter_id = (select auth.uid()) or private.can_review_direct_message_report(conversation_id)
  );
create policy direct_message_reports_participant_insert on public.direct_message_reports
  for insert to authenticated with check (
    reporter_id = (select auth.uid())
    and exists (
      select 1 from public.direct_conversations c
      where c.id = conversation_id
        and (select auth.uid()) in (c.requester_id, c.recipient_id)
        and (message_id is null or exists (
          select 1 from public.direct_messages m
          where m.id = message_id and m.conversation_id = c.id
        ))
    )
  );
create policy direct_message_reports_admin_update on public.direct_message_reports
  for update to authenticated
  using (private.can_review_direct_message_report(conversation_id))
  with check (private.can_review_direct_message_report(conversation_id));

grant usage on schema private to authenticated;

create or replace function public.request_direct_message(target_profile uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  actor_community uuid;
  target_community uuid;
  target_is_listed boolean;
  existing_id uuid;
  conversation_id uuid;
begin
  if actor is null then raise exception 'Sign in to send a message request.'; end if;
  if actor = target_profile then raise exception 'You cannot message yourself.'; end if;

  select community_id into actor_community from public.profiles
  where id = actor and role = 'member';
  select community_id, public_listing into target_community, target_is_listed from public.profiles
  where id = target_profile and role = 'member';
  if actor_community is null or target_community is null or actor_community <> target_community then
    raise exception 'Chat requests are available between members of the same community.';
  end if;
  if target_is_listed is distinct from true then
    raise exception 'This member is not accepting new chats.';
  end if;
  if not private.shares_verified_group(actor, target_profile) then
    raise exception 'You both need verified membership in a shared Unit or Home Cell before starting a chat.';
  end if;
  if private.direct_pair_is_blocked(actor, target_profile, actor_community) then
    raise exception 'A chat request cannot be sent because one of you has blocked the other.';
  end if;

  select id into existing_id from public.direct_conversations c
  where c.community_id = actor_community
    and least(c.requester_id, c.recipient_id) = least(actor, target_profile)
    and greatest(c.requester_id, c.recipient_id) = greatest(actor, target_profile);
  if existing_id is not null then
    if exists (select 1 from public.direct_conversations c where c.id = existing_id and c.status in ('declined', 'cancelled')) then
      if exists (select 1 from public.direct_conversations c where c.id = existing_id and c.status = 'declined' and c.recipient_id <> actor) then
        raise exception 'This member declined the request. They must start a new request if they want to reconnect.';
      end if;
      if (select count(*) from public.direct_conversations c where c.requester_id = actor and c.status = 'pending') >= 10 then
        raise exception 'You have reached the limit of 10 outstanding message requests.';
      end if;
      update public.direct_conversations
      set requester_id = actor, recipient_id = target_profile, status = 'pending',
          created_at = now(), updated_at = now()
      where id = existing_id;
    end if;
    return existing_id;
  end if;

  if (select count(*) from public.direct_conversations c where c.requester_id = actor and c.status = 'pending') >= 10 then
    raise exception 'You have reached the limit of 10 outstanding message requests.';
  end if;

  insert into public.direct_conversations (community_id, requester_id, recipient_id)
  values (actor_community, actor, target_profile)
  on conflict do nothing returning id into conversation_id;

  if conversation_id is null then
    select id into conversation_id from public.direct_conversations c
    where c.community_id = actor_community
      and least(c.requester_id, c.recipient_id) = least(actor, target_profile)
      and greatest(c.requester_id, c.recipient_id) = greatest(actor, target_profile);
  end if;
  return conversation_id;
end
$$;

create or replace function public.cancel_direct_message_request(target_conversation uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.direct_conversations
  set status = 'cancelled', updated_at = now()
  where id = target_conversation
    and requester_id = (select auth.uid())
    and status = 'pending';
  if not found then raise exception 'This message request can no longer be cancelled.'; end if;
end
$$;

create or replace function public.respond_direct_message_request(target_conversation uuid, accept_request boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  request_row public.direct_conversations%rowtype;
begin
  select * into request_row from public.direct_conversations c
  where c.id = target_conversation and c.recipient_id = (select auth.uid()) and c.status = 'pending';
  if not found then raise exception 'This message request is no longer available.'; end if;

  if accept_request then
    if not private.shares_verified_group(request_row.requester_id, request_row.recipient_id) then
      raise exception 'You no longer share a verified Unit or Home Cell.';
    end if;
    if private.direct_pair_is_blocked(request_row.requester_id, request_row.recipient_id, request_row.community_id) then
      raise exception 'This message request cannot be accepted while either member has blocked the other.';
    end if;
  end if;

  update public.direct_conversations
  set status = case when accept_request then 'accepted' else 'declined' end,
      updated_at = now()
  where id = target_conversation;
end
$$;

create or replace function public.mark_direct_conversation_read(target_conversation uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.direct_conversations c
    where c.id = target_conversation and (select auth.uid()) in (c.requester_id, c.recipient_id)
  ) then raise exception 'Conversation not found.'; end if;

  insert into public.direct_conversation_reads (conversation_id, profile_id, last_read_at)
  values (target_conversation, (select auth.uid()), now())
  on conflict (conversation_id, profile_id) do update set last_read_at = excluded.last_read_at;
end
$$;

create or replace function public.set_direct_message_block(target_conversation uuid, should_block boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  conversation public.direct_conversations%rowtype;
  actor uuid := (select auth.uid());
  other_member uuid;
begin
  select * into conversation from public.direct_conversations c
  where c.id = target_conversation and actor in (c.requester_id, c.recipient_id);
  if not found then raise exception 'Conversation not found.'; end if;
  other_member := case when conversation.requester_id = actor then conversation.recipient_id else conversation.requester_id end;

  if should_block then
    insert into public.direct_message_blocks (community_id, blocker_id, blocked_id)
    values (conversation.community_id, actor, other_member) on conflict do nothing;
  else
    delete from public.direct_message_blocks
    where community_id = conversation.community_id and blocker_id = actor and blocked_id = other_member;
  end if;

  update public.direct_conversations set updated_at = now() where id = target_conversation;
end
$$;

create or replace function public.my_direct_conversations()
returns table (
  id uuid, community_id uuid, requester_id uuid, recipient_id uuid, status text,
  counterpart_id uuid, counterpart_name text, counterpart_photo_url text,
  last_message text, last_message_at timestamptz, unread_count bigint,
  blocked_by_me boolean, blocked_by_them boolean
) language sql stable security definer set search_path = '' as $$
  select c.id, c.community_id, c.requester_id, c.recipient_id, c.status,
    peer.id, peer.full_name,
    case when peer.public_listing and peer.visibility->>'photo' = 'public' then peer.photo_url else null end,
    case when private.direct_pair_is_blocked((select auth.uid()), peer.id, c.community_id) then null else latest.body end,
    case when private.direct_pair_is_blocked((select auth.uid()), peer.id, c.community_id) then null else latest.created_at end,
    case when private.direct_pair_is_blocked((select auth.uid()), peer.id, c.community_id) then 0::bigint else
    (select count(*) from public.direct_messages unread
      left join public.direct_conversation_reads own_read
        on own_read.conversation_id = c.id and own_read.profile_id = (select auth.uid())
      where unread.conversation_id = c.id
        and unread.sender_id <> (select auth.uid())
        and unread.created_at > coalesce(own_read.last_read_at, '-infinity'::timestamptz)) end,
    exists (select 1 from public.direct_message_blocks b
      where b.community_id = c.community_id and b.blocker_id = (select auth.uid())
        and b.blocked_id = peer.id),
    exists (select 1 from public.direct_message_blocks b
      where b.community_id = c.community_id and b.blocker_id = peer.id
        and b.blocked_id = (select auth.uid()))
  from public.direct_conversations c
  join public.profiles peer on peer.id = case
    when c.requester_id = (select auth.uid()) then c.recipient_id else c.requester_id end
  left join lateral (
    select m.body, m.created_at from public.direct_messages m
    where m.conversation_id = c.id order by m.created_at desc limit 1
  ) latest on true
  where (select auth.uid()) in (c.requester_id, c.recipient_id)
  order by case when private.direct_pair_is_blocked((select auth.uid()), peer.id, c.community_id)
    then null else coalesce(latest.created_at, c.created_at) end desc nulls last
$$;
grant execute on function public.my_direct_conversations() to authenticated;

create or replace function public.community_direct_message_reports()
returns table (
  id uuid, conversation_id uuid, reporter_id uuid, reporter_name text,
  reported_member_name text, message_body text, reason text, details text,
  status text, created_at timestamptz
) language sql stable security definer set search_path = '' as $$
  select r.id, r.conversation_id, r.reporter_id, reporter.full_name,
    case when r.reporter_id = c.requester_id then recipient.full_name else requester.full_name end,
    m.body, r.reason, r.details, r.status, r.created_at
  from public.direct_message_reports r
  join public.direct_conversations c on c.id = r.conversation_id
  join public.profiles requester on requester.id = c.requester_id
  join public.profiles recipient on recipient.id = c.recipient_id
  join public.profiles reporter on reporter.id = r.reporter_id
  left join public.direct_messages m on m.id = r.message_id
  where exists (
    select 1 from public.profiles moderator
    where moderator.id = (select auth.uid())
      and (moderator.role = 'platform_admin'
        or (moderator.role = 'community_admin' and moderator.community_id = c.community_id))
  )
  order by r.created_at desc
$$;
grant execute on function public.community_direct_message_reports() to authenticated;

revoke execute on function public.request_direct_message(uuid) from public, anon;
revoke execute on function public.respond_direct_message_request(uuid, boolean) from public, anon;
revoke execute on function public.cancel_direct_message_request(uuid) from public, anon;
revoke execute on function public.mark_direct_conversation_read(uuid) from public, anon;
revoke execute on function public.set_direct_message_block(uuid, boolean) from public, anon;
revoke execute on function public.my_direct_conversations() from public, anon;
revoke execute on function public.community_direct_message_reports() from public, anon;
grant execute on function public.request_direct_message(uuid) to authenticated;
grant execute on function public.respond_direct_message_request(uuid, boolean) to authenticated;
grant execute on function public.cancel_direct_message_request(uuid) to authenticated;
grant execute on function public.mark_direct_conversation_read(uuid) to authenticated;
grant execute on function public.set_direct_message_block(uuid, boolean) to authenticated;

alter publication supabase_realtime add table public.direct_conversations;
alter publication supabase_realtime add table public.direct_messages;
