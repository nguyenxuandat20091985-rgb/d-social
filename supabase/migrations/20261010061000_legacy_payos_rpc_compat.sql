-- Temporary compatibility for the currently deployed PayOS webhook handler.
-- Removed by 20261010071000_remove_legacy_payos_rpc_compat.sql after the
-- four-argument amount-verifying webhook was deployed.
-- The wrapper uses the stored order amount because the legacy handler does not pass it.
create or replace function public.process_payos_webhook(
  p_order_code bigint,
  p_success boolean,
  p_provider_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_amount bigint;
begin
  select amount into expected_amount
    from public.wallet_transactions
   where order_code = p_order_code;
  if not found then
    return jsonb_build_object('received', false, 'not_found', true);
  end if;
  return public.process_payos_webhook(
    p_order_code,
    p_success,
    p_provider_reference,
    expected_amount
  );
end;
$$;

revoke all on function public.process_payos_webhook(bigint, boolean, text) from public;
revoke all on function public.process_payos_webhook(bigint, boolean, text) from anon, authenticated;
grant execute on function public.process_payos_webhook(bigint, boolean, text) to service_role;
