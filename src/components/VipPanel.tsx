import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

export function VipPanel() {
  const [amount, setAmount] = useState(99000)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const buy = async () => {
    setLoading(true); setError('')
    try {
      if (!supabase) throw new Error('Supabase chưa cấu hình')
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Vui lòng đăng nhập lại')
      const res = await fetch('/api/payos/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount, type: 'vip_purchase' }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Không thể tạo thanh toán')
      if (!body?.checkoutUrl) throw new Error('Không nhận được liên kết thanh toán')
      window.location.assign(body.checkoutUrl)
    } catch (e: any) {
      setError(e.message || 'Thanh toán thất bại')
    } finally {
      setLoading(false)
    }
  }
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="text-xl font-black">D VIP — Tùy chọn</h2>
      <p className="mt-2 text-sm text-slate-400">D Social miễn phí 100% cho các tính năng cốt lõi. VIP chỉ mở thêm đặc quyền, không bắt buộc.</p>
      <ul className="mt-4 list-disc pl-5 text-sm text-slate-300 space-y-1">
        <li>Huy hiệu VIP</li><li>Tùy biến hồ sơ nâng cao</li><li>Tiện ích mở rộng trong tương lai</li>
      </ul>
      <div className="mt-5 flex flex-wrap gap-2">
        <select value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="rounded-xl bg-slate-800 p-3">
          <option value={99000}>99.000đ / 30 ngày</option>
          <option value={199000}>199.000đ / 90 ngày</option>
        </select>
        <button disabled={loading} onClick={buy} className="rounded-xl bg-indigo-500 px-4 font-bold disabled:opacity-50">
          {loading ? 'Đang tạo...' : 'Nâng cấp VIP'}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </section>
  )
}
