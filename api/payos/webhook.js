import PayOS from '@payos/node'
import { createClient } from '@supabase/supabase-js'

const payos = new PayOS(process.env.PAYOS_CLIENT_ID, process.env.PAYOS_API_KEY, process.env.PAYOS_CHECKSUM_KEY)
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const verified = await payos.webhooks.verify(req.body)
    const orderCode = Number(verified.orderCode)
    const success = verified.code === '00' || verified.success === true
    const { data: tx, error: findError } = await admin.from('wallet_transactions').select('id,user_id,amount,type,status').eq('order_code', orderCode).maybeSingle()
    if (findError) throw findError
    if (!tx) return res.status(404).json({ error: 'Order not found' })
    if (tx.status === 'paid') return res.status(200).json({ received: true, duplicate: true })

    const nextStatus = success ? 'paid' : 'failed'
    const { error: updateError } = await admin.from('wallet_transactions').update({ status: nextStatus, provider_reference: String(verified.reference || verified.transactionDateTime || orderCode), paid_at: success ? new Date().toISOString() : null }).eq('id', tx.id).eq('status', 'pending')
    if (updateError) throw updateError

    if (success && tx.type === 'vip_purchase') {
      const days = 30
      const { data: profile } = await admin.from('profiles').select('vip_expires_at').eq('id', tx.user_id).single()
      const base = profile?.vip_expires_at && new Date(profile.vip_expires_at) > new Date() ? new Date(profile.vip_expires_at) : new Date()
      base.setUTCDate(base.getUTCDate() + days)
      const { error: vipError } = await admin.from('profiles').update({ is_vip: true, vip_expires_at: base.toISOString() }).eq('id', tx.user_id)
      if (vipError) throw vipError
    }
    return res.status(200).json({ received: true })
  } catch (error) {
    return res.status(400).json({ error: error?.message || 'Invalid webhook' })
  }
}
