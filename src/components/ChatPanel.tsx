// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Send, Search, MessageSquare, MessageCircle, Image as ImageIcon, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { moderateText } from '../lib/moderation'
import { messageRateLimit } from '../lib/ratelimit'

function Avatar({ src, name, size = 40, ring = false }) {
  const letter = (name || 'D').trim().charAt(0).toUpperCase()
  const img = src ? (
    <img src={src} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size, background: 'var(--d-surface-2)' }} />
  ) : (
    <div className="rounded-full font-black grid place-items-center shrink-0 text-white" style={{ width: size, height: size, fontSize: size * 0.42, background: 'var(--d-primary)' }}>{letter}</div>
  )
  if (!ring) return img
  return (
    <div className="rounded-full p-[2px]" style={{ width: size + 6, height: size + 6, background: 'var(--d-primary)' }}>
      <div className="rounded-full p-[2px] h-full w-full grid place-items-center" style={{ background: 'var(--d-surface)' }}>{img}</div>
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
  const [lastMap, setLastMap] = useState({})
  const [q, setQ] = useState('')
  const [active, setActive] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [mobileConversation, setMobileConversation] = useState(false)
  const [replyTo, setReplyTo] = useState(null)
  const [peerTyping, setPeerTyping] = useState(false)
  const [onlineIds, setOnlineIds] = useState(new Set())
  const [unreadMap, setUnreadMap] = useState({})
  const bottom = useRef(null)
  const textRef = useRef(null)
  const typingTimer = useRef(null)
  const channelRef = useRef(null)

  const loadPeople = async () => {
    if (!supabase) return
    const [{ data: profiles, error: profileError }, { data: blocks }] = await Promise.all([
      supabase.from('profiles').select('id,username,full_name,avatar_url').neq('id', userId).limit(50),
      supabase.from('blocks').select('blocked_id').eq('blocker_id', userId),
    ])
    if (profileError) { setError('Không tải được danh sách thành viên.'); return }
    const blocked = new Set((blocks || []).map(b => b.blocked_id))
    const allowed = (profiles || []).filter(p => !blocked.has(p.id))
    const { data: recent } = await supabase
      .from('messages')
      .select('sender_id,recipient_id,content,created_at,read_at,media_type,deleted_at')
      .or('sender_id.eq.' + userId + ',recipient_id.eq.' + userId)
      .order('created_at', { ascending: false })
      .limit(120)
    const latest = {}
    for (const m of recent || []) {
      if (m.deleted_at) continue
      const otherId = m.sender_id === userId ? m.recipient_id : m.sender_id
      if (!latest[otherId]) latest[otherId] = m
    }
    allowed.sort((a, b) => {
      const at = new Date(latest[a.id]?.created_at || 0).getTime()
      const bt = new Date(latest[b.id]?.created_at || 0).getTime()
      return bt - at
    })
    setUsers(allowed)
    setLastMap(latest)
  }

  const refreshUnread = async () => {
    if (!supabase) return
    const { data } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('recipient_id', userId)
      .is('read_at', null)
      .is('deleted_at', null)
      .limit(200)
    const map = {}
    for (const m of data || []) map[m.sender_id] = (map[m.sender_id] || 0) + 1
    setUnreadMap(map)
    window.dispatchEvent(new CustomEvent('d-chat-unread', { detail: Object.values(map).reduce((a, b) => a + b, 0) }))
  }

  useEffect(() => { loadPeople(); refreshUnread() }, [userId])

  // Global presence: track who is online in D Social
  useEffect(() => {
    if (!supabase || !userId) return
    const presence = supabase.channel('d-presence', { config: { presence: { key: userId } } })
    presence
      .on('presence', { event: 'sync' }, () => {
        const state = presence.presenceState()
        const ids = new Set()
        Object.keys(state || {}).forEach(k => ids.add(k))
        setOnlineIds(ids)
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          await presence.track({ user_id: userId, at: Date.now() })
        }
      })
    return () => { supabase.removeChannel(presence) }
  }, [userId])

  useEffect(() => {
    if (!supabase || !active) return
    let alive = true
    setLoading(true)
    setError('')
    setMessages([])
    setPeerTyping(false)

    const load = async () => {
      const { data, error: loadErr } = await supabase
        .from('messages')
        .select('id,sender_id,recipient_id,content,media_url,media_type,created_at,read_at,deleted_at,reply_to_id')
        .or(`and(sender_id.eq.${userId},recipient_id.eq.${active.id}),and(sender_id.eq.${active.id},recipient_id.eq.${userId})`)
        .order('created_at', { ascending: true })
        .limit(200)
      if (!alive) return
      if (loadErr) { setError('Không tải được tin nhắn.'); setLoading(false); return }
      setMessages((data || []).filter(m => !m.deleted_at || m.sender_id === userId))
      setLoading(false)
      const unread = (data || []).filter(m => m.recipient_id === userId && !m.read_at && !m.deleted_at).map(m => m.id)
      if (unread.length) {
        await supabase.from('messages').update({ read_at: new Date().toISOString() }).in('id', unread)
        refreshUnread()
      }
    }
    load()

    // Realtime messages + typing broadcast
    const ch = supabase.channel(`chat-${userId}-${active.id}`, { config: { broadcast: { self: false } } })
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
      const m = payload.new
      if ((m.sender_id === userId && m.recipient_id === active.id) || (m.sender_id === active.id && m.recipient_id === userId)) {
        setMessages(x => (x.some(y => y.id === m.id) ? x : [...x, m]))
        if (m.recipient_id === userId && !m.read_at) {
          supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('id', m.id).then(() => refreshUnread())
        }
      }
    })
    ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, payload => {
      const m = payload.new
      setMessages(x => x.map(y => y.id === m.id ? { ...y, ...m } : y))
    })
    ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (payload?.user_id === active.id) {
        setPeerTyping(true)
        clearTimeout(typingTimer.current)
        typingTimer.current = setTimeout(() => setPeerTyping(false), 2500)
      }
    })
    ch.subscribe()
    channelRef.current = ch

    return () => {
      alive = false
      supabase.removeChannel(ch)
      channelRef.current = null
    }
  }, [active, userId])

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, peerTyping])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return users
    return users.filter(u => (u.full_name || '').toLowerCase().includes(s) || (u.username || '').toLowerCase().includes(s))
  }, [users, q])

  const notifyTyping = () => {
    if (!channelRef.current || !active) return
    channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { user_id: userId } })
  }

  const send = async (mediaFile = null) => {
    if (!supabase || !active || sending) return
    const body = text.trim()
    if (!body && !mediaFile) return
    if (!messageRateLimit(userId)) return setError('Gửi quá nhanh, thử lại sau.')
    if (body) {
      const mod = moderateText(body)
      if (!mod.allowed) return setError(mod.reason || 'Nội dung không phù hợp.')
    }
    setSending(true)
    setError('')
    try {
      let media_url = null, media_type = null
      if (mediaFile) {
        if (mediaFile.size > 8 * 1024 * 1024) throw new Error('Ảnh tối đa 8MB')
        const ext = mediaFile.name.split('.').pop()?.toLowerCase() || 'jpg'
        const path = `chat/${userId}/${crypto.randomUUID()}.${ext}`
        const up = await supabase.storage.from('social-media').upload(path, mediaFile, { contentType: mediaFile.type, upsert: false })
        if (up.error) throw up.error
        media_url = supabase.storage.from('social-media').getPublicUrl(path).data.publicUrl
        media_type = 'image'
      }
      const row = {
        sender_id: userId,
        recipient_id: active.id,
        content: body || (media_url ? '[Ảnh]' : null),
        media_url,
        media_type,
        reply_to_id: replyTo?.id || null,
      }
      const { error: insErr } = await supabase.from('messages').insert(row)
      if (insErr) throw insErr
      setText('')
      setReplyTo(null)
      loadPeople()
    } catch (e) {
      setError(e.message || 'Không gửi được tin nhắn')
    } finally {
      setSending(false)
    }
  }

  const softDelete = async (msgId) => {
    if (!supabase) return
    const { error: delErr } = await supabase.from('messages').update({ deleted_at: new Date().toISOString(), content: null, media_url: null }).eq('id', msgId).eq('sender_id', userId)
    if (!delErr) setMessages(x => x.map(m => m.id === msgId ? { ...m, deleted_at: new Date().toISOString(), content: null, media_url: null } : m))
  }

  const openChat = (u) => {
    setActive(u)
    setMobileConversation(true)
    setReplyTo(null)
  }

  return (
    <section className="max-w-3xl mx-auto px-2 sm:px-3 pb-24 pt-2">
      {error && <div className="mb-2 p-2 rounded-xl text-sm" style={{ background: 'color-mix(in srgb, var(--d-danger) 12%, transparent)', color: 'var(--d-danger)' }}>{error}</div>}
      <div className="grid md:grid-cols-[280px_1fr] gap-3 min-h-[70vh]">
        {/* Conversation list */}
        <aside className={`d-card p-2 flex flex-col ${mobileConversation ? 'hidden md:flex' : 'flex'}`}>
          <div className="relative mb-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 d-muted" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm bạn bè..." className="d-input pl-8 py-2 text-sm" />
          </div>
          <div className="overflow-auto max-h-[62vh] space-y-1">
            {filtered.map(u => {
              const last = lastMap[u.id]
              const unread = unreadMap[u.id] || 0
              const online = onlineIds.has(u.id)
              return (
                <button key={u.id} type="button" onClick={() => openChat(u)} className={`w-full text-left p-2.5 rounded-xl flex items-center gap-2.5 transition ${
                  active?.id === u.id ? 'bg-[var(--d-surface-2)]' : 'hover:bg-[var(--d-surface-2)]'
                }`}>
                  <div className="relative shrink-0">
                    <Avatar src={u.avatar_url} name={u.full_name || u.username} size={42} />
                    {online && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2" style={{ background: 'var(--d-success)', borderColor: 'var(--d-surface)' }} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-sm font-semibold">{u.full_name || u.username || 'User'}</span>
                      {last && <span className="text-[10px] d-muted shrink-0">{timeAgo(last.created_at)}</span>}
                    </div>
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <span className="truncate text-xs d-muted">
                        {last ? (last.media_type === 'image' ? '📷 Ảnh' : (last.content || '...')) : 'Chưa có tin nhắn'}
                      </span>
                      {unread > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white grid place-items-center shrink-0" style={{ background: 'var(--d-danger)' }}>
                          {unread > 9 ? '9+' : unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
            {!filtered.length && <div className="text-center text-sm d-muted py-8">Không tìm thấy ai</div>}
          </div>
        </aside>

        {/* Conversation pane */}
        <section className={`d-card flex flex-col min-h-[55vh] ${!mobileConversation ? 'hidden md:flex' : 'flex'}`}>
          {!active ? (
            <div className="m-auto text-center d-muted p-8">
              <MessageSquare size={36} className="mx-auto opacity-40 mb-2" />
              <p className="text-sm">Chọn người để nhắn tin</p>
            </div>
          ) : (
            <>
              <header className="p-3 border-b d-border-c flex items-center gap-2">
                <button type="button" className="md:hidden d-btn-ghost !px-2" onClick={() => { setMobileConversation(false); setActive(null) }}>←</button>
                <div className="relative">
                  <Avatar src={active.avatar_url} name={active.full_name || active.username} size={36} />
                  {onlineIds.has(active.id) && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2" style={{ background: 'var(--d-success)', borderColor: 'var(--d-surface)' }} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm truncate">{active.full_name || active.username}</div>
                  <div className="text-[11px] d-muted">{onlineIds.has(active.id) ? 'Đang hoạt động' : 'Ngoại tuyến'}{peerTyping ? ' · đang nhập...' : ''}</div>
                </div>
              </header>

              <div className="flex-1 p-3 space-y-2 overflow-auto max-h-[52vh]">
                {loading && <div className="text-center text-sm d-muted py-6">Đang tải tin nhắn...</div>}
                {messages.map(m => {
                  const mine = m.sender_id === userId
                  const deleted = !!m.deleted_at
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'} group`}>
                      <div className={`max-w-[78%] px-3 py-2 rounded-2xl text-sm relative ${
                        mine
                          ? 'bg-[var(--d-primary)] text-white rounded-br-md'
                          : 'bg-[var(--d-surface-2)] rounded-bl-md'
                      }`}>
                        {m.reply_to_id && (
                          <div className={`text-[11px] mb-1 opacity-80 border-l-2 pl-2 ${
mine ? 'border-white/40' : 'border-[var(--d-primary)]'}`}>
                            Trả lời tin nhắn
                          </div>
                        )}
                        {deleted ? (
                          <span className="italic opacity-70">Tin nhắn đã thu hồi</span>
                        ) : (
                          <>
                            {m.media_url && m.media_type === 'image' && (
                              <img src={m.media_url} alt="" className="rounded-xl max-w-full max-h-56 mb-1 object-cover" />
                            )}
                            {m.content && m.content !== '[Ảnh]' && <div className="whitespace-pre-wrap">{m.content}</div>}
                          </>
                        )}
                        <div className={`text-[10px] mt-1 opacity-70 flex items-center gap-2 ${mine ? 'justify-end' : ''}`}>
                          <span>{timeAgo(m.created_at)}</span>
                          {mine && !deleted && <span>{m.read_at ? 'Đã xem' : 'Đã gửi'}</span>}
                        </div>
                        {mine && !deleted && (
                          <div className="absolute -left-16 top-1/2 -translate-y-1/2 hidden group-hover:flex gap-1">
                            <button type="button" className="text-[10px] px-1.5 py-0.5 rounded bg-black/40 text-white" onClick={() => softDelete(m.id)}>Thu hồi</button>
                          </div>
                        )}
                        {!mine && !deleted && (
                          <button type="button" className="absolute -right-12 top-1/2 -translate-y-1/2 hidden group-hover:block text-[10px] px-1.5 py-0.5 rounded bg-black/40 text-white" onClick={() => { setReplyTo(m); textRef.current?.focus() }}>Trả lời</button>
                        )}
                      </div>
                    </div>
                  )
                })}
                {peerTyping && (
                  <div className="text-xs d-muted italic px-1">Đang nhập...</div>
                )}
                <div ref={bottom} />
              </div>

              {replyTo && (
                <div className="px-3 py-1.5 flex items-center gap-2 border-t d-border-c text-xs" style={{ background: 'var(--d-surface-2)' }}>
                  <MessageCircle size={14} style={{ color: 'var(--d-primary)' }} />
                  <span className="flex-1 truncate">Trả lời: {replyTo.content || (replyTo.media_url ? '[Ảnh]' : '...')}</span>
                  <button type="button" onClick={() => setReplyTo(null)} className="d-muted"><X size={14} /></button>
                </div>
              )}

              <div className="p-3 border-t d-border-c flex gap-2 items-end">
                <label className="d-icon-btn shrink-0 cursor-pointer" title="Gửi ảnh">
                  <ImageIcon size={20} />
                  <input hidden type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) send(f); e.target.value = '' }} />
                </label>
                <input
                  ref={textRef}
                  value={text}
                  onChange={e => { setText(e.target.value); notifyTyping() }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                  placeholder="Nhắn tin..."
                  className="d-input flex-1 py-2.5 text-sm"
                  disabled={sending}
                />
                <button type="button" onClick={() => send()} disabled={sending || (!text.trim() && !replyTo)} className="d-btn-primary px-3 shrink-0">
                  <Send size={16} />
                </button>
              </div>
            </>
          )}
        </section>
      </div>
      <p className="text-center text-[11px] d-muted mt-3">Chat realtime · Ảnh · Thu hồi · Trả lời · Đang nhập · Online</p>
    </section>
  )
}
