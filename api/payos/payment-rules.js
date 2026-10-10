export const VIP_PLANS = Object.freeze({
  99000: 30,
  199000: 90,
})

export function validatePaymentRequest(amount, type = 'deposit') {
  if (!Number.isInteger(amount) || amount < 10000 || amount > 50000000) {
    return { ok: false, error: 'Invalid amount' }
  }
  if (!['deposit', 'vip_purchase'].includes(type)) {
    return { ok: false, error: 'Invalid payment type' }
  }
  if (type === 'vip_purchase' && !Object.hasOwn(VIP_PLANS, amount)) {
    return { ok: false, error: 'Invalid VIP plan amount' }
  }
  return { ok: true, amount, type }
}
