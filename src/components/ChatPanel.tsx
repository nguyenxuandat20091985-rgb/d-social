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

export function Chat({ userId }) {
  const [users, setUsers] = useState([])
  const [q, setQ] = useState('')
  const [active, setActive] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const bottom = useRef(null)
  useEffect(() => {
    if (!supabase) return
    supabase.from('profiles').select('id,username,full_name,avatar_url').neq('id', userId).limit(80).then(({ data }) => setUsers(data || []))
  }, [userId])
  useEffect(() => {
    if (!supabase || !active) return
    const load = async () => {
      const { data } = await supabase!.from('messages').select('*').or(`and(sender_id.eq.${userId},recipient_id.eq.${active.id}),and(sender_id.eq.${active.id},recipient_id.eq.${userId})`).order('created_at', { ascending: true }).limit(200)
      if (data) {
        setMessages(data)
        const unread = data.filter(m => m.recipient_id === userId && !m.read_at).map(m => m.id)
        if (unread.length) {
          await supabase!.from('messages').update({ read_at: new Date().toISOString() }).in('id', unread)
        }
      }
    }
    load()
    const ch = supabase.channel(`chat-${userId}-${active.id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
      const m = payload.new
      if ((m.sender_id === userId && m.recipient_id === active.id) || (m.sender_id === active.id && m.recipient_id === userId))
        setMessages(x => (x.some(y => y.id === m.id) ? x : [...x, m]))
    }).subscribe()
    return () => { supabase!.removeChannel(ch) }
  }, [active, userId])
  useEffect(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), [messages])
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return users
    return users.filter(u => (u.full_name || '').toLowerCase().includes(s) || (u.username || '').toLowerCase().includes(s))
  }, [users, q])
  const send = async () => {
    if (!supabase || !active || !text.trim()) return
    if (!messageRateLimit(userId)) return
    const mod = moderateText(text)
    if (!mod.allowed) return
    const { error } = await supabase.from('messages').insert({ sender_id: userId, recipient_id: active.id, content: text.trim() })
    if (!error) setText('')
  }
  return (
    <div className="grid md:grid-cols-[240px_1fr] gap-3 min-h-[70vh]">
      <aside className="d-card p-2 flex flex-col">
        <div className="relative mb-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm bạn bè..." className="d-input pl-8 py-2 text-sm" />
        </div>
        <div className="overflow-auto max-h-[60vh] space-y-1">
          {filtered.map(u => (
            <button key={u.id} onClick={() => setActive(u)} className={`w-full text-left p-2.5 rounded-xl flex items-center gap-2 ${active?.id === u.id ? 'bg-slate-800' : 'hover:bg-slate-800/50'}`}>
              <Avatar src={u.avatar_url} name={u.full_name || u.username} size={36} />
              <span className="truncate text-sm font-medium">{u.full_name || u.username || 'User'}</span>
            </button>
          ))}
        </div>
      </aside>
      <section className="d-card flex flex-col min-h-[50vh]">
        {!active ? (
          <div className="m-auto text-slate-500 text-sm flex flex-col items-center gap-2 p-8"><MessageSquare size={32} className="opacity-40" />Chọn người để nhắn tin</div>
        ) : (
          <>
            <header className="p-3 border-b border-slate-800 font-bold flex items-center gap-2">
              <Avatar src={active.avatar_url} name={active.full_name || active.username} size={32} />
              {active.full_name || active.username}
            </header>
            <div className="flex-1 p-3 space-y-2 overflow-auto max-h-[55vh]">
              {messages.map(m => (
                <div key={m.id} className={`flex ${m.sender_id === userId ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${m.sender_id === userId ? 'bg-gradient-to-r from-cyan-500/90 to-violet-500/90 text-white' : 'bg-slate-800'}`}>
                    <div>{m.content}</div>
                    <div className={`text-[10px] mt-1 opacity-70 ${m.sender_id === userId ? 'text-right' : ''}`}>
                      {timeAgo(m.created_at)}{m.sender_id === userId ? (m.read_at ? ' · Đã xem' : ' · Đã gửi') : ''}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottom} />
            </div>
            <div className="p-3 border-t border-slate-800 flex gap-2">
              <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send() }} placeholder="Nhắn tin..." className="d-input flex-1 py-2.5 text-sm" />
              <button onClick={send} className="d-btn-primary px-3"><Send size={16} /></button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
