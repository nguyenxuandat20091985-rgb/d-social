-- The production webhook now passes the signed PayOS amount to the
-- four-argument RPC, so remove the temporary compatibility overload.
drop function if exists public.process_payos_webhook(bigint, boolean, text);
