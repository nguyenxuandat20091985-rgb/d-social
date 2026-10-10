-- Process a PayOS webhook atomically so payment state and VIP entitlement cannot diverge.
-- The function is callable only by the server-side service role.
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
  tx public.wallet_transactions%rowtype;
  expires_at timestamptz;
begin
  select *
    into tx
    from public.wallet_transactions
   where order_code = p_order_code
   for update;

  if not found then
    return jsonb_build_object('received', false, 'not_found', true);
  end if;

  if tx.status <> 'pending' then
    return jsonb_build_object('received', true, 'duplicate', true);
  end if;

  update public.wallet_transactions
     set status = case when p_success then 'paid' else 'failed' end,
         provider_reference = p_provider_reference,
         paid_at = case when p_success then now() else null end
   where id = tx.id;

  if p_success and tx.type = 'vip_purchase' then
    select vip_expires_at
      into expires_at
      from public.profiles
     where id = tx.user_id
     for update;

    if not found then
      raise exception 'Profile not found for VIP purchase';
    end if;

    update public.profiles
       set is_vip = true,
           vip_expires_at = greatest(coalesce(expires_at, now()), now()) + interval '30 days'
     where id = tx.user_id;
  end if;

  return jsonb_build_object('received', true, 'duplicate', false);
end;
$$;

revoke all on function public.process_payos_webhook(bigint, boolean, text) from public;
revoke all on function public.process_payos_webhook(bigint, boolean, text) from anon, authenticated;
grant execute on function public.process_payos_webhook(bigint, boolean, text) to service_role;
