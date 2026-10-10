import { PayOS } from '@payos/node'
import { createClient } from '@supabase/supabase-js'

const payos = new PayOS({ clientId: process.env.PAYOS_CLIENT_ID, apiKey: process.env.PAYOS_API_KEY, checksumKey: process.env.PAYOS_CHECKSUM_KEY })
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let verified
  try {
    verified = await payos.webhooks.verify(req.body)
  } catch {
    return res.status(400).json({ error: 'Invalid webhook signature or payload' })
  }

  const data = verified.data || verified
  const orderCode = Number(data.orderCode)
  if (!Number.isSafeInteger(orderCode) || orderCode <= 0) {
    return res.status(400).json({ error: 'Invalid order code' })
  }

  const success = verified.code === '00' || verified.success === true || data.code === '00'
  const providerAmount = Number(data.amount)
  const amount = Number.isSafeInteger(providerAmount) && providerAmount > 0 ? providerAmount : null
  const providerReference = String(data.reference || data.transactionDateTime || orderCode)

  try {
    const { data: result, error } = await admin.rpc('process_payos_webhook', {
      p_order_code: orderCode,
      p_success: success,
      p_provider_reference: providerReference,
      p_amount: amount,
    })
    if (error) throw error
    if (result?.not_found) return res.status(404).json({ error: 'Order not found' })
    if (result?.amount_mismatch || result?.invalid_vip_amount) {
      return res.status(409).json({ error: 'Payment amount does not match the order; manual reconciliation required' })
    }
    return res.status(200).json({
      received: result?.received === true,
      ...(result?.duplicate ? { duplicate: true } : {}),
    })
  } catch (error) {
    // Return a retryable status for transient database failures; the RPC is idempotent.
    return res.status(500).json({ error: error?.message || 'Webhook processing failed' })
  }
}
