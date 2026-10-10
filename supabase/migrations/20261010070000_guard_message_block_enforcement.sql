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

commit;
