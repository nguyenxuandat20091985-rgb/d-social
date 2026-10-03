// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Send, Search, MessageSquare, MessageCircle, Image as ImageIcon,
  X, ArrowLeft, Smile, Video, RefreshCw, Check, CheckCheck, Paperclip
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { moderateText } from '../lib/moderation'
import { messageRateLimit } from '../lib/ratelimit'

const MAX_IMAGE = 8 * 1024 * 1024
const MAX_VIDEO = 30 * 1024 * 1024
const EMOJIS = ['😀','😂','🥰','😍','👍','❤️','🔥','🎉','😮','😢','🙏','💯','✨','🤝','👏','😎']

function Avatar({ src, name, size = 40, online = false }) {
  const letter = (name || 'D').trim().charAt(0).toUpperCase()
  const img = src ? (
    <img src={src} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size, background: 'var(--d-surface-2)' }} />
  ) : (
    <div className="rounded-full font-black grid place-items-center shrink-0 text-white" style={{ width: size, height: size, fontSize: size * 0.42, background: 'var(--d-primary)' }}>{letter}</div>
  )
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {img}
      {online && (
        <span
          className="absolute bottom-0 right-0 rounded-full border-2"
          style={{ width: Math.max(10, size * 0.28), height: Math.max(10, size * 0.28), background: 'var(--d-success)', borderColor: 'var(--d-surface)' }}
        />
      )}
    </div>
  )
}

function timeAgo(iso) {
  if (!iso) return ''
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'vừa xong'
  if (s < 3600) return `${Math.floor(s / 60)} phút`
  if (s < 86400) return `${Math.floor(s / 3600)} giờ`
  if (s < 604800) return `${Math.floor(s / 86400)} ngày`
  return new Date(iso).toLocaleDateString('vi-VN')
}

function formatClock(iso) {
  try {
    return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

function previewText(m) {
  if (!m) return 'Chưa có tin nhắn'
  if (m.deleted_at) return 'Tin nhắn đã thu hồi'
  if (m.media_type === 'image') return '📷 Ảnh'
  if (m.media_type === 'video') return '🎬 Video'
  return (m.content || '').trim() || '...'
}

export function Chat({ userId }) {
  const [users, setUsers] = useState([])
  const [lastMap, setLastMap] = useState({})
  const [unreadMap, setUnreadMap] = useState({})
  const [onlineIds, setOnlineIds] = useState(() => new Set())
  const [q, setQ] = useState('')
  const [active, setActive] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [threadLoading, setThreadLoading] = useState(false)
  const [threadError, setThreadError] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [replyTo, setReplyTo] = useState(null)
  const [peerTyping, setPeerTyping] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [pendingFile, setPendingFile] = useState(null)

  const bottomRef = useRef(null)
  const textRef = useRef(null)
  const typingTimer = useRef(null)
  const channelRef = useRef(null)
  const fileRef = useRef(null)

  const refreshUnread = useCallback(async () => {
    if (!supabase || !userId) return
    const { data } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('recipient_id', userId)
      .is('read_at', null)
      .is('deleted_at', null)
      .limit(300)
    const map = {}
    for (const m of data || []) map[m.sender_id] = (map[m.sender_id] || 0) + 1
    setUnreadMap(map)
    const total = Object.values(map).reduce((a, b) => a + b, 0)
    window.dispatchEvent(new CustomEvent('d-chat-unread', { detail: total }))
  }, [userId])

  const loadPeople = useCallback(async () => {
    if (!supabase || !userId) return
    setListLoading(true)
    setListError('')
    try {
      const [{ data: profiles, error: pErr }, { data: blocks }] = await Promise.all([
        supabase.from('profiles').select('id,username,full_name,avatar_url').neq('id', userId).limit(80),
        supabase.from('blocks').select('blocked_id').eq('blocker_id', userId),
      ])
      if (pErr) throw pErr
      const blocked = new Set((blocks || []).map(b => b.blocked_id))
      let allowed = (profiles || []).filter(p => !blocked.has(p.id))

      const { data: recent } = await supabase
        .from('messages')
        .select('id,sender_id,recipient_id,content,created_at,read_at,media_type,deleted_at')
        .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(200)

      const latest = {}
      for (const m of recent || []) {
        const other = m.sender_id === userId ? m.recipient_id : m.sender_id
        if (!latest[other]) latest[other] = m
      }

      allowed.sort((a, b) => {
        const at = new Date(latest[a.id]?.created_at || 0).getTime()
        const bt = new Date(latest[b.id]?.created_at || 0).getTime()
        return bt - at
      })

      setUsers(allowed)
      setLastMap(latest)
    } catch (e) {
      setListError(e.message || 'Không tải được danh sách chat')
    } finally {
      setListLoading(false)
    }
  }, [userId])

  useEffect(() => {
    loadPeople()
    refreshUnread()
  }, [loadPeople, refreshUnread])

  useEffect(() => {
    if (!supabase || !userId) return
    const presence = supabase.channel('d-presence', { config: { presence: { key: userId } } })
    presence
      .on('presence', { event: 'sync' }, () => {
        const state = presence.presenceState() || {}
        setOnlineIds(new Set(Object.keys(state)))
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          try { await presence.track({ user_id: userId, at: Date.now() }) } catch {}
        }
      })
    return () => { supabase.removeChannel(presence) }
  }, [userId])

  useEffect(() => {
    if (!supabase || !active || !userId) return
    let alive = true
    setThreadLoading(true)
    setThreadError('')
    setMessages([])
    setPeerTyping(false)
    setReplyTo(null)
    setShowEmoji(false)

    const loadThread = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id,sender_id,recipient_id,content,media_url,media_type,created_at,read_at,deleted_at,reply_to_id')
        .or(`and(sender_id.eq.${userId},recipient_id.eq.${active.id}),and(sender_id.eq.${active.id},recipient_id.eq.${userId})`)
        .order('created_at', { ascending: true })
        .limit(250)
      if (!alive) return
      if (error) {
        setThreadError(error.message || 'Không tải được tin nhắn')
        setThreadLoading(false)
        return
      }
      setMessages(data || [])
      setThreadLoading(false)
      const unread = (data || []).filter(m => m.recipient_id === userId && !m.read_at && !m.deleted_at).map(m => m.id)
      if (unread.length) {
        await supabase.from('messages').update({ read_at: new Date().toISOString() }).in('id', unread)
        refreshUnread()
      }
    }
    loadThread()

    const ch = supabase.channel(`chat-${userId}-${active.id}`, { config: { broadcast: { self: false } } })
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
      const m = payload.new
      const inThread =
        (m.sender_id === userId && m.recipient_id === active.id) ||
        (m.sender_id === active.id && m.recipient_id === userId)
      if (!inThread) return
      setMessages(x => (x.some(y => y.id === m.id) ? x : [...x, m]))
      if (m.recipient_id === userId && !m.read_at) {
        supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('id', m.id).then(() => refreshUnread())
      }
      loadPeople()
    })
    ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, payload => {
      const m = payload.new
      setMessages(x => x.map(y => (y.id === m.id ? { ...y, ...m } : y)))
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
      clearTimeout(typingTimer.current)
    }
  }, [active, userId, refreshUnread, loadPeople])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, peerTyping, threadLoading])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return users
    return users.filter(u =>
      (u.full_name || '').toLowerCase().includes(s) ||
      (u.username || '').toLowerCase().includes(s)
    )
  }, [users, q])

  const notifyTyping = () => {
    if (!channelRef.current || !active) return
    try {
      channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { user_id: userId } })
    } catch {}
  }

  const pickFile = (file) => {
    if (!file) return
    const isImg = file.type.startsWith('image/')
    const isVid = file.type.startsWith('video/')
    if (!isImg && !isVid) return setSendError('Chỉ hỗ trợ ảnh hoặc video')
    if (isImg && file.size > MAX_IMAGE) return setSendError('Ảnh tối đa 8MB')
    if (isVid && file.size > MAX_VIDEO) return setSendError('Video tối đa 30MB')
    setSendError('')
    setPendingFile(file)
  }

  const send = async () => {
    if (!supabase || !active || sending) return
    const body = text.trim()
    if (!body && !pendingFile) return
    if (!messageRateLimit(userId)) return setSendError('Gửi quá nhanh, thử lại sau.')
    if (body) {
      const mod = moderateText(body)
      if (!mod.allowed) return setSendError(mod.reason || 'Nội dung không phù hợp.')
    }
    setSending(true)
    setSendError('')
    try {
      let media_url = null
      let media_type = null
      if (pendingFile) {
        const ext = pendingFile.name.split('.').pop()?.toLowerCase() || 'bin'
        const path = `chat/${userId}/${crypto.randomUUID()}.${ext}`
        const up = await supabase.storage.from('social-media').upload(path, pendingFile, {
          contentType: pendingFile.type,
          upsert: false,
        })
        if (up.error) throw up.error
        media_url = supabase.storage.from('social-media').getPublicUrl(path).data.publicUrl
        media_type = pendingFile.type.startsWith('video/') ? 'video' : 'image'
      }
      const row = {
        sender_id: userId,
        recipient_id: active.id,
        content: body || (media_type === 'video' ? '[Video]' : media_type === 'image' ? '[Ảnh]' : '.'),
        media_url,
        media_type,
        reply_to_id: replyTo?.id || null,
      }
      const { error } = await supabase.from('messages').insert(row)
      if (error) throw error
      try {
        await supabase.rpc('create_notification', {
          p_user_id: active.id,
          p_actor_id: userId,
          p_type: 'message',
          p_title: 'Tin nhắn mới',
          p_body: body ? body.slice(0, 120) : (media_type === 'video' ? 'Đã gửi một video' : 'Đã gửi một ảnh'),
        })
      } catch {}
      setText('')
      setPendingFile(null)
      setReplyTo(null)
      setShowEmoji(false)
      loadPeople()
    } catch (e) {
      setSendError(e.message || 'Không gửi được tin nhắn')
    } finally {
      setSending(false)
    }
  }

  const recall = async (msgId) => {
    if (!supabase || !confirm('Thu hồi tin nhắn này?')) return
    const { error } = await supabase
      .from('messages')
      .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
      .eq('id', msgId)
      .eq('sender_id', userId)
    if (error) setSendError(error.message)
    else setMessages(x => x.map(m => m.id === msgId ? { ...m, deleted_at: new Date().toISOString() } : m))
  }

  const openChat = (u) => {
    setActive(u)
    setMobileOpen(true)
    setReplyTo(null)
    setSendError('')
  }

  const closeChat = () => {
    setMobileOpen(false)
    setActive(null)
    setReplyTo(null)
  }

  const replyLookup = useMemo(() => {
    const map = {}
    for (const m of messages) map[m.id] = m
    return map
  }, [messages])

  return (
    <section className="chat-shell max-w-4xl mx-auto px-2 sm:px-3 pb-24 pt-2">
      <div className="chat-layout">
        <aside className={`chat-inbox d-card ${mobileOpen ? 'chat-inbox-hide' : ''}`}>
          <div className="chat-inbox-head">
            <div>
              <h2 className="font-black text-base leading-tight">Tin nhắn</h2>
              <p className="text-[11px] d-muted">Realtime · Ảnh/Video · Đã xem</p>
            </div>
            <button type="button" className="d-icon-btn" onClick={() => { loadPeople(); refreshUnread() }} title="Làm mới">
              <RefreshCw size={16} />
            </button>
          </div>

          <div className="px-2 pb-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 d-muted" />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Tìm cuộc trò chuyện..."
                className="d-input pl-8 py-2 text-sm"
              />
            </div>
          </div>

          <div className="chat-inbox-list">
            {listLoading && (
              <div className="chat-state">
                <div className="chat-skeleton" />
                <div className="chat-skeleton" />
                <div className="chat-skeleton" />
              </div>
            )}
            {!listLoading && listError && (
              <div className="chat-state">
                <p className="text-sm" style={{ color: 'var(--d-danger)' }}>{listError}</p>
                <button type="button" className="d-btn-primary text-xs mt-2" onClick={loadPeople}>Thử lại</button>
              </div>
            )}
            {!listLoading && !listError && filtered.length === 0 && (
              <div className="chat-state">
                <MessageSquare size={28} className="opacity-40 mb-2" />
                <p className="text-sm d-muted">{q ? 'Không tìm thấy ai' : 'Chưa có thành viên để chat'}</p>
              </div>
            )}
            {!listLoading && !listError && filtered.map(u => {
              const last = lastMap[u.id]
              const unread = unreadMap[u.id] || 0
              const online = onlineIds.has(u.id)
              const activeRow = active?.id === u.id
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => openChat(u)}
                  className={`chat-row ${activeRow ? 'active' : ''}`}
                >
                  <Avatar src={u.avatar_url} name={u.full_name || u.username} size={46} online={online} />
                  <div className="min-w-0 flex-1 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{u.full_name || u.username || 'User'}</span>
                      {last && <span className="text-[10px] d-muted shrink-0">{timeAgo(last.created_at)}</span>}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className={`truncate text-xs ${unread ? 'font-semibold' : 'd-muted'}`} style={unread ? { color: 'var(--d-text)' } : undefined}>
                        {previewText(last)}
                      </span>
                      {unread > 0 && (
                        <span className="chat-badge">{unread > 9 ? '9+' : unread}</span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </aside>

        <section className={`chat-thread d-card ${mobileOpen ? 'chat-thread-show' : 'chat-thread-hide'}`}>
          {!active ? (
            <div className="chat-state h-full">
              <MessageSquare size={40} className="opacity-30 mb-2" />
              <p className="text-sm font-semibold">Chọn một cuộc trò chuyện</p>
              <p className="text-xs d-muted mt-1 px-6 text-center">Tin nhắn được bảo vệ bằng RLS — chỉ người gửi và nhận mới đọc được.</p>
            </div>
          ) : (
            <>
              <header className="chat-thread-head">
                <button type="button" className="d-icon-btn chat-back" onClick={closeChat} aria-label="Quay lại">
                  <ArrowLeft size={18} />
                </button>
                <Avatar src={active.avatar_url} name={active.full_name || active.username} size={40} online={onlineIds.has(active.id)} />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm truncate">{active.full_name || active.username}</div>
                  <div className="text-[11px] d-muted">
                    {onlineIds.has(active.id) ? 'Đang hoạt động' : 'Ngoại tuyến'}
                    {peerTyping ? ' · đang nhập...' : ''}
                  </div>
                </div>
              </header>

              <div className="chat-messages">
                {threadLoading && (
                  <div className="chat-state py-10">
                    <div className="chat-skeleton w-2/3" />
                    <div className="chat-skeleton w-1/2 ml-auto" />
                    <div className="chat-skeleton w-3/5" />
                  </div>
                )}
                {!threadLoading && threadError && (
                  <div className="chat-state py-10">
                    <p className="text-sm" style={{ color: 'var(--d-danger)' }}>{threadError}</p>
                  </div>
                )}
                {!threadLoading && !threadError && messages.length === 0 && (
                  <div className="chat-state py-10">
                    <MessageCircle size={28} className="opacity-40 mb-2" />
                    <p className="text-sm d-muted">Hãy gửi lời chào đầu tiên 👋</p>
                  </div>
                )}
                {messages.map(m => {
                  const mine = m.sender_id === userId
                  const deleted = !!m.deleted_at
                  const replied = m.reply_to_id ? replyLookup[m.reply_to_id] : null
                  return (
                    <div key={m.id} className={`chat-bubble-row ${mine ? 'mine' : 'theirs'}`}>
                      <div className={`chat-bubble ${mine ? 'mine' : 'theirs'} ${deleted ? 'deleted' : ''}`}>
                        {replied && !deleted && (
                          <div className="chat-reply-ref">
                            {replied.deleted_at ? 'Tin đã thu hồi' : (replied.media_type === 'image' ? '📷 Ảnh' : replied.media_type === 'video' ? '🎬 Video' : (replied.content || '').slice(0, 80))}
                          </div>
                        )}
                        {deleted ? (
                          <span className="italic opacity-80 text-[13px]">Tin nhắn đã thu hồi</span>
                        ) : (
                          <>
                            {m.media_url && m.media_type === 'image' && (
                              <a href={m.media_url} target="_blank" rel="noreferrer">
                                <img src={m.media_url} alt="" className="chat-media mb-1" />
                              </a>
                            )}
                            {m.media_url && m.media_type === 'video' && (
                              <video src={m.media_url} controls playsInline className="chat-media-video mb-1" />
                            )}
                            {m.content && m.content !== '[Ảnh]' && m.content !== '[Video]' && (
                              <div className="whitespace-pre-wrap break-words">{m.content}</div>
                            )}
                          </>
                        )}
                        <div className={`chat-meta ${mine ? 'mine' : ''}`}>
                          <span>{formatClock(m.created_at)}</span>
                          {mine && !deleted && (
                            m.read_at
                              ? <CheckCheck size={12} style={{ opacity: 0.95 }} />
                              : <Check size={12} style={{ opacity: 0.8 }} />
                          )}
                        </div>
                      </div>
                      {!deleted && (
                        <div className={`chat-actions ${mine ? 'mine' : ''}`}>
                          {!mine && (
                            <button type="button" onClick={() => { setReplyTo(m); textRef.current?.focus() }}>Trả lời</button>
                          )}
                          {mine && (
                            <button type="button" onClick={() => recall(m.id)}>Thu hồi</button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                {peerTyping && <div className="chat-typing">Đang nhập...</div>}
                <div ref={bottomRef} />
              </div>

              {replyTo && (
                <div className="chat-reply-bar">
                  <MessageCircle size={14} style={{ color: 'var(--d-primary)' }} />
                  <span className="flex-1 truncate">Trả lời: {replyTo.content || (replyTo.media_type === 'image' ? '[Ảnh]' : replyTo.media_type === 'video' ? '[Video]' : '...')}</span>
                  <button type="button" onClick={() => setReplyTo(null)} className="d-muted" aria-label="Hủy"><X size={14} /></button>
                </div>
              )}
              {pendingFile && (
                <div className="chat-pending">
                  <Paperclip size={14} />
                  <span className="flex-1 truncate">{pendingFile.name}</span>
                  <button type="button" onClick={() => setPendingFile(null)} className="d-muted"><X size={14} /></button>
                </div>
              )}
              {sendError && (
                <div className="px-3 py-1.5 text-xs" style={{ color: 'var(--d-danger)', background: 'color-mix(in srgb, var(--d-danger) 10%, transparent)' }}>{sendError}</div>
              )}
              {showEmoji && (
                <div className="chat-emoji-bar">
                  {EMOJIS.map(e => (
                    <button key={e} type="button" className="chat-emoji-btn" onClick={() => { setText(t => t + e); textRef.current?.focus() }}>{e}</button>
                  ))}
                </div>
              )}
              <div className="chat-composer">
                <button type="button" className="d-icon-btn shrink-0" onClick={() => setShowEmoji(v => !v)} aria-label="Emoji">
                  <Smile size={20} />
                </button>
                <label className="d-icon-btn shrink-0 cursor-pointer" title="Gửi ảnh/video">
                  <ImageIcon size={20} />
                  <input ref={fileRef} hidden type="file" accept="image/*,video/*" onChange={e => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
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
                <button
                  type="button"
                  onClick={send}
                  disabled={sending || (!text.trim() && !pendingFile)}
                  className="d-btn-primary px-3 shrink-0"
                  aria-label="Gửi"
                >
                  <Send size={16} />
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  )
}
