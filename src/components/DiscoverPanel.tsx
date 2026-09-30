// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Send, Search, MessageSquare, Users, Bell } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { moderateText } from '../lib/moderation'
import { messageRateLimit } from '../lib/ratelimit'

function Avatar({ src, name, size = 40, ring = false }) {
  const letter = (name || 'D').trim().charAt(0).toUpperCase()
  const img = src ? (
    <img src={src} alt="" className="rounded-full object-cover bg-slate-700 shrink-0" style={{ width: size, height: size }} />
  ) : (
    <div className="rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 text-slate-950 font-black grid place-items-center shrink-0" style={{ width: size, height: size, fontSize: size * 0.42 }}>{letter}</div>
  )
  if (!ring) return img
  return (
    <div className="rounded-full p-[2px] bg-gradient-to-br from-cyan-400 via-violet-400 to-fuchsia-400" style={{ width: size + 6, height: size + 6 }}>
      <div className="rounded-full bg-slate-950 p-[2px] h-full w-full grid place-items-center">{img}</div>
    </div>
  )
}
function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'vừa xong'
  if (s < 3600) return `${Math.floor(s / 60)} phút`
  if (s < 86400) return `${Math.floor(s / 3600)} giờ`
  if (s < 604800) return `${Math.floor(s / 86400)} ngày`
  return new Date(iso).toLocaleDateString('vi-VN')
}

export function Discover({ userId }) {
  const [q, setQ] = useState('')
  const [people, setPeople] = useState([])
  const [following, setFollowing] = useState({})
  const [busyId, setBusyId] = useState(null)
  useEffect(() => {
    if (!supabase) return
    ;(async () => {
      const { data } = await supabase.from('profiles').select('id,username,full_name,avatar_url,bio').neq('id', userId).limit(60)
      setPeople(data || [])
      const { data: fol } = await supabase.from('follows').select('following_id').eq('follower_id', userId)
      const map = {}
      ;(fol || []).forEach(f => { map[f.following_id] = true })
      setFollowing(map)
    })()
  }, [userId])
  const toggleFollow = async (targetId) => {
    if (!supabase || busyId) return
    setBusyId(targetId)
    try {
      if (following[targetId]) {
        await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', targetId)
        setFollowing(x => { const n = { ...x }; delete n[targetId]; return n })
      } else {
        const { error } = await supabase.from('follows').insert({ follower_id: userId, following_id: targetId })
        if (!error) setFollowing(x => ({ ...x, [targetId]: true }))
      }
    } finally { setBusyId(null) }
  }
  const blockUser = async (targetId) => {
    if (!supabase || !confirm('Chặn người này? Họ sẽ không nhắn tin / hiện trong gợi ý dễ dàng.')) return
    await supabase.from('blocks').upsert({ blocker_id: userId, blocked_id: targetId })
    setPeople(x => x.filter(p => p.id !== targetId))
  }
  const filtered = people.filter(p => !q.trim() || (p.full_name || '').toLowerCase().includes(q.toLowerCase()) || (p.username || '').toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="space-y-3">
      <div className="d-card p-4">
        <h2 className="font-black text-lg flex items-center gap-2"><Users size={18} className="text-cyan-300" /> Khám phá & Theo dõi</h2>
        <p className="text-xs text-slate-500 mt-1">Theo dõi một chiều — xem thêm nội dung từ người bạn quan tâm.</p>
        <div className="relative mt-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm tên hoặc @username..." className="d-input pl-9 py-2.5 text-sm" />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {filtered.map(p => (
          <div key={p.id} className="d-card p-4 flex gap-3 items-start">
            <Avatar src={p.avatar_url} name={p.full_name || p.username} size={48} ring />
            <div className="min-w-0 flex-1">
              <div className="font-bold truncate">{p.full_name || p.username || 'User'}</div>
              {p.username && <div className="text-xs text-slate-500">@{p.username}</div>}
              {p.bio && <p className="text-sm text-slate-400 mt-1 line-clamp-2">{p.bio}</p>}
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  disabled={busyId === p.id}
                  onClick={() => toggleFollow(p.id)}
                  className={`text-xs px-3 py-1.5 rounded-xl font-semibold border transition ${
                    following[p.id]
                      ? 'border-slate-600 text-slate-300 hover:border-rose-400/50 hover:text-rose-300'
                      : 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25'
                  }`}
                >
                  {busyId === p.id ? '...' : following[p.id] ? 'Đang theo dõi' : 'Theo dõi'}
                </button>
                <button type="button" onClick={() => blockUser(p.id)} className="text-xs px-2 py-1.5 rounded-xl text-slate-500 hover:text-amber-400 border border-transparent hover:border-slate-700">
                  Chặn
                </button>
              </div>
            </div>
          </div>
        ))}
        {!filtered.length && <div className="text-slate-500 text-sm p-6">Không tìm thấy thành viên.</div>}
      </div>
    </div>
  )
}
