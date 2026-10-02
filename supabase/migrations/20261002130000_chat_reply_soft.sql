-- Chat upgrade: reply_to + soft-delete by sender + media_type video allowance
-- Safe to re-run.

alter table public.messages
  add column if not exists reply_to_id uuid references public.messages(id) on delete set null;

-- media columns already exist from p2; ensure video allowed via app (no hard check on media_type in DB)

create index if not exists idx_messages_reply_to
  on public.messages (reply_to_id)
  where reply_to_id is not null;

-- Allow sender soft-delete (deleted_at/deleted_by/content) and recipient mark read
drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages
  for update to authenticated
  using (
    (select auth.uid()) = sender_id
    or (select auth.uid()) = recipient_id
  )
  with check (
    (select auth.uid()) = sender_id
    or (select auth.uid()) = recipient_id
  );

-- Helpful partial index for unread lists
create index if not exists idx_messages_unread_recipient
  on public.messages (recipient_id, created_at desc)
  where read_at is null and deleted_at is null;
