import { PayOS } from '@payos/node'
import { createClient } from '@supabase/supabase-js'

const payos = new PayOS({ clientId: process.env.PAYOS_CLIENT_ID, apiKey: process.env.PAYOS_API_KEY, checksumKey: process.env.PAYOS_CHECKSUM_KEY })
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const auth = String(req.headers.authorization || '')
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (!token) return res.status(401).json({ error: 'Missing authorization' })
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return res.status(401).json({ error: 'Invalid session' })
    const { amount, type = 'deposit' } = req.body || {}
    if (!Number.isInteger(amount) || amount < 10000 || amount > 50000000) return res.status(400).json({ error: 'Invalid amount' })
    if (!['deposit', 'vip_purchase'].includes(type)) return res.status(400).json({ error: 'Invalid payment type' })
    const orderCode = Number(`${Date.now()}`.slice(-9))
    const { error: insertError } = await admin.from('wallet_transactions').insert({ user_id: user.id, order_code: orderCode, amount, type, status: 'pending' })
    if (insertError) return res.status(500).json({ error: insertError.message })
    const origin = process.env.APP_URL || `https://${req.headers.host}`
    const payment = await payos.paymentRequests.create({ orderCode, amount, description: type === 'vip_purchase' ? `D VIP ${orderCode}` : `D nap ${orderCode}`, returnUrl: `${origin}/?payment=success&order=${orderCode}`, cancelUrl: `${origin}/?payment=cancel&order=${orderCode}` })
    return res.status(200).json({ checkoutUrl: payment.checkoutUrl, orderCode })
  } catch (error) { return res.status(500).json({ error: error?.message || 'Payment creation failed' }) }
}
