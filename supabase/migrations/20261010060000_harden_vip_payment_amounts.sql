-- Harden PayOS webhook reconciliation: match provider amount to the stored order
-- and grant VIP duration based on the exact server-validated plan price.
begin;

drop function if exists public.process_payos_webhook(bigint, boolean, text);

create function public.process_payos_webhook(
  p_order_code bigint,
  p_success boolean,
  p_provider_reference text,
  p_amount bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tx public.wallet_transactions%rowtype;
  expires_at timestamptz;
  vip_duration interval;
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

  -- Do not settle an order or grant entitlement when the signed provider payload
  -- does not match the amount stored when checkout was created.
  if p_success and p_amount is distinct from tx.amount then
    return jsonb_build_object('received', false, 'amount_mismatch', true);
  end if;

  if p_success and tx.type = 'vip_purchase' then
    vip_duration := case tx.amount
      when 99000 then interval '30 days'
      when 199000 then interval '90 days'
      else null
    end;
    if vip_duration is null then
      return jsonb_build_object('received', false, 'invalid_vip_amount', true);
    end if;
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
           vip_expires_at = greatest(coalesce(expires_at, now()), now()) + vip_duration
     where id = tx.user_id;
  end if;

  return jsonb_build_object('received', true, 'duplicate', false);
end;
$$;

revoke all on function public.process_payos_webhook(bigint, boolean, text, bigint) from public;
revoke all on function public.process_payos_webhook(bigint, boolean, text, bigint) from anon, authenticated;
grant execute on function public.process_payos_webhook(bigint, boolean, text, bigint) to service_role;

commit;
