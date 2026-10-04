-- Chat-only RLS repair: restore direct 1-to-1 message access.
-- Non-destructive; no message data is deleted or changed.

begin;

drop policy if exists messages_select on public.messages;
drop policy if exists "Users can view messages in their conversations" on public.messages;

create policy messages_select on public.messages
for select to authenticated
using (
  (select auth.uid()) = sender_id
  or (select auth.uid()) = recipient_id
  or exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = messages.conversation_id
      and cp.user_id = (select auth.uid())
  )
);

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
for insert to authenticated
with check (
  (select auth.uid()) = sender_id
  and recipient_id is not null
  and recipient_id <> (select auth.uid())
);

commit;
