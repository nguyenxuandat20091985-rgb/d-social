-- D-Social security hardening: limit privileged RPC execution.
-- Non-destructive; preserves authenticated workflows and the scheduled moderation job.

begin;

-- Direct conversation creation requires a real authenticated user.
revoke all on function public.ensure_direct_conversation(uuid) from public, anon;
grant execute on function public.ensure_direct_conversation(uuid) to authenticated, service_role;

-- Friend-request RPCs already validate auth.uid() in their bodies.
-- Explicitly revoke stale anon grants left by earlier migrations.
revoke all on function public.friend_request_send(uuid) from public, anon;
grant execute on function public.friend_request_send(uuid) to authenticated, service_role;

revoke all on function public.friend_request_respond(uuid, text) from public, anon;
grant execute on function public.friend_request_respond(uuid, text) to authenticated, service_role;

-- This worker is invoked by pg_cron as its database owner, not by browser clients.
-- Lock down RPC execution and pin the function search_path.
alter function public.run_background_ai_moderation() set search_path = public;
revoke all on function public.run_background_ai_moderation() from public, anon, authenticated;
grant execute on function public.run_background_ai_moderation() to service_role;

commit;
