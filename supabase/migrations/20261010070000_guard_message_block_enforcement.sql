-- Enforce block relationships and 1:1 conversation membership at the database
-- boundary, so direct PostgREST writes cannot bypass client-side chat filtering.
begin;

create or replace function public.guard_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or new.sender_id is distinct from v_uid then
    raise exception 'Message sender must be the authenticated user'
      using errcode = '42501';
  end if;

  if new.recipient_id is null or new.recipient_id = v_uid then
    raise exception 'Invalid message recipient'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.blocks b
    where (b.blocker_id = v_uid and b.blocked_id = new.recipient_id)
       or (b.blocker_id = new.recipient_id and b.blocked_id = v_uid)
  ) then
    raise exception 'Messaging is unavailable because one user has blocked the other'
      using errcode = '42501';
  end if;

  if new.conversation_id is not null and not exists (
    select 1
    from public.conversation_participants me
    join public.conversation_participants peer
      on peer.conversation_id = me.conversation_id
    where me.conversation_id = new.conversation_id
      and me.user_id = v_uid
      and peer.user_id = new.recipient_id
  ) then
    raise exception 'Both users must belong to the target conversation'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_message_insert() from public;
revoke all on function public.guard_message_insert() from anon, authenticated;

drop trigger if exists messages_guard_insert on public.messages;
create trigger messages_guard_insert
before insert on public.messages
for each row execute function public.guard_message_insert();

create or replace function public.ensure_direct_conversation(p_peer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_conv uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_peer_id is null or p_peer_id = v_me then raise exception 'invalid peer' using errcode = '22023'; end if;

  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = v_me and b.blocked_id = p_peer_id)
       or (b.blocker_id = p_peer_id and b.blocked_id = v_me)
  ) then
    raise exception 'Cannot open a conversation because one user has blocked the other'
      using errcode = '42501';
  end if;

  select cp1.conversation_id into v_conv
  from public.conversation_participants cp1
  join public.conversation_participants cp2 on cp2.conversation_id = cp1.conversation_id
  where cp1.user_id = v_me and cp2.user_id = p_peer_id
  limit 1;

  if v_conv is not null then return v_conv; end if;

  insert into public.conversations default values returning id into v_conv;
  insert into public.conversation_participants (conversation_id, user_id)
  values (v_conv, v_me), (v_conv, p_peer_id);
  return v_conv;
end;
$$;

create or replace function public.friend_request_send(p_addressee_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null or p_addressee_id is null or v_uid = p_addressee_id then return null; end if;

  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = v_uid and b.blocked_id = p_addressee_id)
       or (b.blocker_id = p_addressee_id and b.blocked_id = v_uid)
  ) then
    return null;
  end if;

  if exists(select 1 from public.friend_requests where requester_id=p_addressee_id and addressee_id=v_uid and status='pending') then return null; end if;
  if exists(select 1 from public.friend_requests where requester_id=v_uid and addressee_id=p_addressee_id and status='accepted') then return null; end if;
  if exists(select 1 from public.friend_requests where requester_id=p_addressee_id and addressee_id=v_uid and status='accepted') then return null; end if;

  insert into public.friend_requests(requester_id,addressee_id,status)
  values(v_uid,p_addressee_id,'pending')
  on conflict(requester_id,addressee_id) do update set status='pending',responded_at=null,created_at=now()
  returning id into v_id;

  perform public.create_notification(p_addressee_id,v_uid,'system','friend_request',v_id,'Lời mời kết bạn mới','đã gửi lời mời kết bạn cho bạn',jsonb_build_object('friend_request_id',v_id,'action','friend_request'));
  return v_id;
end;
$$;

create or replace function public.friend_request_respond(p_request_id uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_requester uuid;
  v_addressee uuid;
begin
  if v_uid is null or p_status not in ('accepted','rejected') then return false; end if;

  select requester_id, addressee_id into v_requester, v_addressee
  from public.friend_requests
  where id = p_request_id and status = 'pending'
  for update;

  if v_addressee is null or v_addressee <> v_uid then return false; end if;

  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = v_requester and b.blocked_id = v_addressee)
       or (b.blocker_id = v_addressee and b.blocked_id = v_requester)
  ) then
    return false;
  end if;

  update public.friend_requests set status=p_status, responded_at=now() where id=p_request_id;

  if p_status='accepted' then
    perform public.create_notification(v_requester,v_uid,'system','friend_request',p_request_id,'Kết bạn thành công','đã chấp nhận lời mời kết bạn của bạn',jsonb_build_object('friend_request_id',p_request_id,'action','friend_accepted'));
  end if;
  return true;
end;
$$;

commit;
