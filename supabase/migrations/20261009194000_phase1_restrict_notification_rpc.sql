begin;

-- Notifications are emitted internally by the guarded friend-request RPCs.
-- Do not let clients call this SECURITY DEFINER function directly, which would
-- let a signed-in user fabricate notifications for arbitrary recipients.
revoke all on function public.create_notification(uuid, uuid, text, text, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_notification(uuid, uuid, text, text, uuid, text, text, jsonb) to service_role;

commit;
