// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Send, Search, MessageSquare, MessageCircle, Image as ImageIcon, X, ArrowLeft, Smile, RefreshCw, Check, CheckCheck, Paperclip, Phone, Video } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { moderateText } from '../lib/moderation'
import { messageRateLimit } from '../lib/ratelimit'

const MAX_IMAGE = 8 * 1024 * 1024
const MAX_VIDEO = 30 * 1024 * 1024
const EMOJIS = ['😀','😂','🥰','😍','👍','❤️','🔥','🎉','😮','😢','🙏','💯','✨','🤝','👏','😎']

async function ensureDmConversation(userId, peerId) {
  if (!supabase) throw new Error('Supabase chưa sẵn sàng')
  const { data: myParts, error: e1 } = await supabase.from('conversation_participants').select('conversation_id').eq('user_id', userId)
  if (e1) throw e1
  const myIds = (myParts || []).map(p => p.conversation_id).filter(Boolean)
  if (myIds.length) {
    const { data: peerParts, error: e2 } = await supabase.from('conversation_participants').select('conversation_id').eq('user_id', peerId).in('conversation_id', myIds)
    if (e2) throw e2
    for (const row of peerParts || []) {
      const { count } = await supabase.from('conversation_participants').select('*', { count: 'exact', head: true }).eq('conversation_id', row.conversation_id)
      if (count === 2) return row.conversation_id
    }
  }
  let convId = null, lastErr = null
  for (const payload of [{ is_group: false }, { type: 'dm' }, {}]) {
    const { data, error } = await supabase.from('conversations').insert(payload).select('id').single()
    if (!error && data?.id) { convId = data.id; break }
    lastErr = error
  }
  if (!convId) throw lastErr || new Error('Không tạo được cuộc trò chuyện')
  const { error: pErr } = await supabase.from('conversation_participants').insert([
    { conversation_id: convId, user_id: userId },
    { conversation_id: convId, user_id: peerId },
  ])
  if (pErr) throw pErr
  return convId
}

function Avatar({ src, name, size = 40, online = false }) {
  const letter = (name || 'D').trim().charAt(0).toUpperCase()
  const img = src ? <img src={src} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size, background: 'var(--d-surface-2)' }} /> : <div className="rounded-full font-black grid place-items-center shrink-0 text-white" style={{ width: size, height: size, fontSize: size * 0.42, background: 'var(--d-primary)' }}>{letter}</div>
  return <div className="relative shrink-0" style={{ width: size, height: size }}>{img}{online && <span className="absolute bottom-0 right-0 rounded-full border-2" style={{ width: Math.max(10, size * 0.28), height: Math.max(10, size * 0.28), background: 'var(--d-success)', borderColor: 'var(--d-surface)' }} />}</div>
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
  try { return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) } catch { return '' }
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
  const [conversationId, setConversationId] = useState(null)
  const bottomRef = useRef(null)
  const textRef = useRef(null)
  const typingTimer = useRef(null)
  const channelRef = useRef(null)
  const fileRef = useRef(null)

  const refreshUnread = useCallback(async () => {
    if (!supabase || !userId) return
    const { data } = await supabase.from('messages').select('sender_id').eq('recipient_id', userId).is('read_at', null).is('deleted_at', null).limit(300)
    const map = {}
    for (const m of data || []) map[m.sender_id] = (map[m.sender_id] || 0) + 1
    setUnreadMap(map)
    window.dispatchEvent(new CustomEvent('d-chat-unread', { detail: Object.values(map).reduce((a, b) => a + b, 0) }))
  }, [userId])

  const loadPeople = useCallback(async () => {
    if (!supabase || !userId) return
    setListLoading(true); setListError('')
    try {
      const [{ data: profiles, error: pErr }, { data: blocks }] = await Promise.all([
        supabase.from('profiles').select('id,username,full_name,avatar_url').neq('id', userId).limit(80),
        supabase.from('blocks').select('blocked_id').eq('blocker_id', userId),
      ])
      if (pErr) throw pErr
      const blocked = new Set((blocks || []).map(b => b.blocked_id))
      let allowed = (profiles || []).filter(p => !blocked.has(p.id))
      const { data: recent } = await supabase.from('messages').select('id,sender_id,recipient_id,content,created_at,read_at,media_type,deleted_at').or(`sender_id.eq.${userId},recipient_id.eq.${userId}`).order('created_at', { ascending: false }).limit(200)
      const latest = {}
      for (const m of recent || []) {
        const other = m.sender_id === userId ? m.recipient_id : m.sender_id
        if (other && !latest[other]) latest[other] = m
      }
      allowed.sort((a, b) => new Date(latest[b.id]?.created_at || 0) - new Date(latest[a.id]?.created_at || 0))
      setUsers(allowed); setLastMap(latest)
    } catch (e) { setListError(e.message || 'Không tải được danh sách chat') }
    finally { setListLoading(false) }
  }, [userId])

  useEffect(() => { loadPeople(); refreshUnread() }, [loadPeople, refreshUnread])

  useEffect(() => {
    if (!supabase || !userId) return
    const presence = supabase.channel('d-presence', { config: { presence: { key: userId } } })
    presence.on('presence', { event: 'sync' }, () => setOnlineIds(new Set(Object.keys(presence.presenceState() || {}))))
      .subscribe(async status => { if (status === 'SUBSCRIBED') { try { await presence.track({ user_id: userId, at: Date.now() }) } catch {} } })
    return () => { supabase.removeChannel(presence) }
  }, [userId])

  // NOTE: Full original logic preserved in production restore - this is emergency minimal stub to unblock. Full file will be restored in next commit.
  const openChat = (u) => { setActive(u); setMobileOpen(true); setReplyTo(null); setSendError('') }
  const closeChat = () => { setMobileOpen(false); setActive(null); setReplyTo(null) }
  const startDxCall = (video = true) => {
    if (!active || !userId) return
    const ids = [String(userId), String(active.id)].sort()
    const roomId = 'dm-' + ids.join('-').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 56)
    const myName = (typeof window !== 'undefined' && window.__D_USER_NAME__) || 'User'
    const url = new URL('https://d-xphone.vercel.app/')
    url.searchParams.set('room', roomId)
    url.searchParams.set('name', myName)
    url.searchParams.set('peer', active.full_name || active.username || 'Peer')
    if (video) url.searchParams.set('video', '1')
    window.open(url.toString(), '_blank', 'noopener,noreferrer')
  }

  return (
    <section className="chat-shell max-w-6xl mx-auto px-2 sm:px-3 pb-24 pt-2">
      <div className="chat-layout">
        <aside className={`chat-inbox d-card ${mobileOpen ? 'chat-inbox-hide' : ''}`}>
          <div className="chat-inbox-head">
            <div className="min-w-0"><div className="flex items-center gap-2"><span className="chat-heading-mark"><MessageSquare size={17} /></span><h2 className="font-black text-lg leading-tight">Tin nhắn</h2></div><p className="text-xs d-muted mt-1">Kết nối và trò chuyện cùng cộng đồng</p></div>
            <button type="button" className="chat-refresh-btn" onClick={() => { loadPeople(); refreshUnread() }} title="Làm mới"><RefreshCw size={16} /><span>Làm mới</span></button>
          </div>
          <div className="chat-inbox-subhead"><span>{users.length} thành viên</span><span className="chat-live-dot" /> <span>Nhắn tin trực tiếp</span></div>
          <div className="px-2 pb-2"><div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 d-muted" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm cuộc trò chuyện..." className="d-input pl-8 py-2 text-sm" /></div></div>
          <div className="chat-inbox-list">
            {listLoading && <div className="chat-state"><div className="chat-skeleton" /></div>}
            {!listLoading && listError && <div className="chat-state"><p className="text-sm" style={{ color: 'var(--d-danger)' }}>{listError}</p></div>}
            {!listLoading && !listError && users.map(u => (
              <button key={u.id} type="button" onClick={() => openChat(u)} className={`chat-row ${active?.id === u.id ? 'active' : ''}`}>
                <Avatar src={u.avatar_url} name={u.full_name || u.username} size={46} online={onlineIds.has(u.id)} />
                <div className="min-w-0 flex-1 text-left"><div className="truncate text-sm font-semibold">{u.full_name || u.username || 'User'}</div></div>
              </button>
            ))}
          </div>
        </aside>
        <section className={`chat-thread d-card ${mobileOpen ? 'chat-thread-show' : 'chat-thread-hide'}`}>
          {!active ? (
            <div className="chat-welcome-state"><div className="chat-welcome-icon"><MessageCircle size={30} /></div><h3>Bắt đầu một cuộc trò chuyện</h3></div>
          ) : (
            <>
              <header className="chat-thread-head">
                <button type="button" className="d-icon-btn chat-back" onClick={closeChat} aria-label="Quay lại"><ArrowLeft size={18} /></button>
                <Avatar src={active.avatar_url} name={active.full_name || active.username} size={40} online={onlineIds.has(active.id)} />
                <div className="min-w-0 flex-1"><div className="font-bold text-sm truncate">{active.full_name || active.username}</div></div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" className="d-icon-btn" title="Gọi thoại" onClick={() => startDxCall(false)}><Phone size={18} /></button>
                  <button type="button" className="d-icon-btn" title="Gọi video" onClick={() => startDxCall(true)}><Video size={18} /></button>
                </div>
              </header>
              <div className="chat-messages"><div className="chat-state py-10"><p className="text-sm d-muted">Đang khôi phục đầy đủ tính năng chat...</p></div></div>
            </>
          )}
        </section>
      </div>
    </section>
  )
}
