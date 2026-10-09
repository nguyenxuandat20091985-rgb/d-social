begin;

-- Users must not be able to add themselves to an arbitrary existing conversation.
-- The SECURITY DEFINER RPC ensure_direct_conversation remains the supported path.
drop policy if exists "Users can join conversation" on public.conversation_participants;
revoke insert on table public.conversation_participants from public, anon, authenticated;

commit;
