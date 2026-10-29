create or replace function public.request_direct_message(target_profile uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  actor_community uuid;
  target_community uuid;
  target_is_listed boolean;
  target_role public.app_role;
  existing_id uuid;
  conversation_id uuid;
begin
  if actor is null then raise exception 'Sign in to send a message request.'; end if;
  if actor = target_profile then raise exception 'You cannot message yourself.'; end if;

  select community_id into actor_community from public.profiles
  where id = actor and role = 'member';
  select community_id, public_listing, role
    into target_community, target_is_listed, target_role
  from public.profiles
  where id = target_profile and role in ('member', 'community_admin');
  if actor_community is null or target_community is null or actor_community <> target_community then
    raise exception 'Chat requests are only available to eligible people in the same organization.';
  end if;
  if target_is_listed is distinct from true then
    raise exception 'This member is not accepting new chats.';
  end if;
  if target_role = 'member' and not private.shares_verified_group(actor, target_profile) then
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
grant execute on function public.request_direct_message(uuid) to authenticated;

create or replace function public.respond_direct_message_request(target_conversation uuid, accept_request boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  request_row public.direct_conversations%rowtype;
  requester_role public.app_role;
  recipient_role public.app_role;
begin
  select * into request_row from public.direct_conversations c
  where c.id = target_conversation and c.recipient_id = (select auth.uid()) and c.status = 'pending';
  if not found then raise exception 'This message request is no longer available.'; end if;

  if accept_request then
    select role into requester_role from public.profiles where id = request_row.requester_id;
    select role into recipient_role from public.profiles where id = request_row.recipient_id;
    if requester_role = 'member' and recipient_role = 'member'
      and not private.shares_verified_group(request_row.requester_id, request_row.recipient_id) then
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
grant execute on function public.respond_direct_message_request(uuid, boolean) to authenticated;