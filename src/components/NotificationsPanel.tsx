// @ts-nocheck
import React, { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { supabase } from '../lib/supabase'

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

export function Notifications({ userId }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!supabase) return
    ;(async () => {
      setLoading(true)
      const { data: myPosts } = await supabase.from('posts').select('id').eq('author_id', userId).limit(40)
      const ids = (myPosts || []).map(p => p.id)
      let notifs = []
      if (ids.length) {
        const { data: comments } = await supabase.from('comments').select('id,content,created_at,author_id,post_id,profiles(full_name,username,avatar_url)').in('post_id', ids).neq('author_id', userId).order('created_at', { ascending: false }).limit(25)
        notifs = (comments || []).map(c => ({
          id: 'c-' + c.id, type: 'comment',
          text: `${c.profiles?.full_name || c.profiles?.username || 'Ai đó'} đã bình luận: ${c.content}`,
          at: c.created_at, avatar: c.profiles?.avatar_url, name: c.profiles?.full_name || c.profiles?.username,
        }))
        const { data: likes } = await supabase.from('likes').select('post_id,user_id,created_at,profiles:user_id(full_name,username,avatar_url)').in('post_id', ids).neq('user_id', userId).order('created_at', { ascending: false }).limit(25)
        for (const l of likes || []) {
          notifs.push({
            id: 'l-' + l.post_id + '-' + l.user_id, type: 'like',
            text: `${l.profiles?.full_name || l.profiles?.username || 'Ai đó'} đã thích bài viết của bạn`,
            at: l.created_at, avatar: l.profiles?.avatar_url, name: l.profiles?.full_name || l.profiles?.username,
          })
        }
      }
      const { data: follows } = await supabase.from('follows').select('follower_id,created_at,profiles:follower_id(full_name,username,avatar_url)').eq('following_id', userId).order('created_at', { ascending: false }).limit(20)
      for (const f of follows || []) {
        notifs.push({
          id: 'f-' + f.follower_id, type: 'follow',
          text: `${f.profiles?.full_name || f.profiles?.username || 'Ai đó'} đã theo dõi bạn`,
          at: f.created_at, avatar: f.profiles?.avatar_url, name: f.profiles?.full_name || f.profiles?.username,
        })
      }
      const { data: msgs } = await supabase.from('messages').select('id,content,created_at,sender_id,profiles:sender_id(full_name,username,avatar_url)').eq('recipient_id', userId).order('created_at', { ascending: false }).limit(15)
      for (const m of msgs || []) {
        notifs.push({
          id: 'm-' + m.id, type: 'message',
          text: `Tin nhắn mới từ ${m.profiles?.full_name || m.profiles?.username || 'ai đó'}: ${m.content}`,
          at: m.created_at, avatar: m.profiles?.avatar_url, name: m.profiles?.full_name || m.profiles?.username,
        })
      }
      notifs.sort((a, b) => new Date(b.at) - new Date(a.at))
      setItems(notifs.slice(0, 50))
      setLoading(false)
    })()
  }, [userId])
  return (
    <div className="space-y-3">
      <div className="d-card p-4">
        <h2 className="font-black text-lg flex items-center gap-2"><Bell size={18} className="text-violet-300" /> Thông báo</h2>
        <p className="text-xs text-slate-500 mt-1">Like, bình luận, theo dõi và tin nhắn mới.</p>
      </div>
      {loading && <div className="text-center text-slate-500 py-8 text-sm">Đang tải...</div>}
      {!loading && !items.length && <div className="d-card p-10 text-center text-slate-500 text-sm">Chưa có thông báo.</div>}
      <div className="space-y-2">
        {items.map(n => (
          <div key={n.id} className="d-card p-3 flex gap-3 items-start">
            <Avatar src={n.avatar} name={n.name || 'D'} size={40} />
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-relaxed">{n.text}</p>
              <div className="text-[11px] text-slate-500 mt-1">{timeAgo(n.at)} · {n.type === 'like' ? 'Thích' : n.type === 'follow' ? 'Theo dõi' : n.type === 'comment' ? 'Bình luận' : 'Tin nhắn'}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
