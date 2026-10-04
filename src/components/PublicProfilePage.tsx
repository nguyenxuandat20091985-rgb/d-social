// @ts-nocheck
import React, { useEffect, useState } from 'react'
import { ArrowLeft, BadgeCheck, UserPlus, UserCheck, UserX, Clock3, MessageCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'

function Avatar({ src, name, size = 84 }) {
  const letter = (name || 'D').trim().charAt(0).toUpperCase()
  return src
    ? <img src={src} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
    : <div className="rounded-full grid place-items-center shrink-0 font-black text-white" style={{ width: size, height: size, background: 'var(--d-primary)', fontSize: size * .42 }}>{letter}</div>
}

export function PublicProfilePage({ userId, profileId, onBack }) {
  const [profile, setProfile] = useState(null)
  const [posts, setPosts] = useState([])
  const [status, setStatus] = useState('none')
  const [requestId, setRequestId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [friends, setFriends] = useState(0)

  const load = async () => {
    if (!supabase || !profileId || profileId === userId) return
    const [{ data: p }, { data: ps }, { data: reqs }, { count }] = await Promise.all([
      supabase.from('profiles').select('id,full_name,username,avatar_url,bio,is_verified').eq('id', profileId).single(),
      supabase.from('posts').select('id,content,media_url,media_type,created_at').eq('author_id', profileId).eq('is_published', true).is('deleted_at', null).order('created_at', { ascending: false }).limit(30),
      supabase.from('friend_requests').select('id,requester_id,addressee_id,status,created_at').or(`and(requester_id.eq.${userId},addressee_id.eq.${profileId}),and(requester_id.eq.${profileId},addressee_id.eq.${userId})`).order('created_at', { ascending: false }).limit(5),
      supabase.from('friend_requests').select('id', { count: 'exact', head: true }).eq('status', 'accepted').or(`requester_id.eq.${profileId},addressee_id.eq.${profileId}`)
    ])
    setProfile(p || null)
    setPosts(ps || [])
    setFriends(count || 0)
    const r = reqs?.[0]
    if (!r) { setStatus('none'); setRequestId(null) }
    else if (r.status === 'accepted') { setStatus('friends'); setRequestId(r.id) }
    else if (r.status === 'pending' && r.requester_id === userId) { setStatus('sent'); setRequestId(r.id) }
    else if (r.status === 'pending') { setStatus('received'); setRequestId(r.id) }
    else { setStatus('none'); setRequestId(r.id) }
  }

  useEffect(() => { load() }, [userId, profileId])

  const sendRequest = async () => {
    if (!supabase || busy || !profileId) return
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('friend_request_send', { p_addressee_id: profileId })
      if (error) throw error
      if (!data) throw new Error('Không thể gửi lời mời. Có thể hai người đã có lời mời đang chờ.')
      setStatus('sent'); setRequestId(data)
    } catch (e) { alert(e.message || 'Không thể gửi lời mời kết bạn') }
    finally { setBusy(false) }
  }

  const cancelRequest = async () => {
    if (!supabase || !requestId || busy) return
    setBusy(true)
    try {
      const { error } = await supabase.from('friend_requests').delete().eq('id', requestId).eq('requester_id', userId)
      if (error) throw error
      setStatus('none'); setRequestId(null)
    } catch (e) { alert(e.message || 'Không thể hủy lời mời') }
    finally { setBusy(false) }
  }

  const respond = async (nextStatus) => {
    if (!supabase || !requestId || busy) return
    setBusy(true)
    try {
      const { error } = await supabase.from('friend_requests').update({ status: nextStatus, responded_at: new Date().toISOString() }).eq('id', requestId).eq('addressee_id', userId)
      if (error) throw error
      if (nextStatus === 'accepted') {
        try { await supabase.rpc('create_notification', { p_user_id: profileId, p_actor_id: userId, p_type: 'system', p_target_type: 'friend_request', p_target_id: requestId, p_title: 'Lời mời kết bạn được chấp nhận', p_body: 'đã chấp nhận lời mời kết bạn của bạn', p_meta: { action: 'friend_accepted', friend_request_id: requestId } }) } catch {}
        setStatus('friends')
        setFriends(x => x + 1)
      } else { setStatus('none'); setRequestId(null) }
    } catch (e) { alert(e.message || 'Không thể xử lý lời mời') }
    finally { setBusy(false) }
  }

  if (!profile) return <div className="max-w-3xl mx-auto px-3 py-6"><button onClick={onBack} className="d-btn-ghost">← Quay lại</button><div className="d-card p-8 mt-3 text-center d-muted">Không tìm thấy trang cá nhân.</div></div>

  const name = profile.full_name || profile.username || 'Thành viên D'
  return <div className="max-w-3xl mx-auto px-3 pb-28 pt-3 space-y-3">
    <button type="button" onClick={onBack} className="d-btn-ghost inline-flex items-center gap-2"><ArrowLeft size={17}/> Khám phá</button>
    <section className="d-card overflow-hidden">
      <div className="h-32 sm:h-40" style={{ background:'linear-gradient(135deg, color-mix(in srgb, var(--d-primary) 55%, transparent), color-mix(in srgb, #8b5cf6 45%, transparent), color-mix(in srgb, #ec4899 30%, transparent))' }} />
      <div className="px-4 pb-5 -mt-10 relative">
        <div className="flex items-end gap-3">
          <Avatar src={profile.avatar_url} name={name} size={82} />
          <div className="pb-1 min-w-0 flex-1">
            <div className="flex items-center gap-1.5"><h1 className="font-black text-xl truncate">{name}</h1>{profile.is_verified && <BadgeCheck size={19} style={{ color:'var(--d-primary)' }} />}</div>
            <div className="text-sm d-muted truncate">@{profile.username || 'username'}</div>
          </div>
        </div>
        {profile.bio && <p className="mt-3 text-sm d-muted whitespace-pre-wrap">{profile.bio}</p>}
        <div className="flex gap-2 mt-4">
          {status === 'none' && <button type="button" onClick={sendRequest} disabled={busy} className="d-btn-primary flex-1 inline-flex items-center justify-center gap-2"><UserPlus size={17}/> {busy ? 'Đang gửi…' : 'Kết bạn'}</button>}
          {status === 'sent' && <button type="button" onClick={cancelRequest} disabled={busy} className="d-btn-ghost flex-1 inline-flex items-center justify-center gap-2"><Clock3 size={17}/> Đã gửi · Hủy</button>}
          {status === 'received' && <><button type="button" onClick={() => respond('accepted')} disabled={busy} className="d-btn-primary flex-1 inline-flex items-center justify-center gap-2"><UserCheck size={17}/> Chấp nhận</button><button type="button" onClick={() => respond('rejected')} disabled={busy} className="d-btn-ghost flex-1 inline-flex items-center justify-center gap-2"><UserX size={17}/> Từ chối</button></>}
          {status === 'friends' && <span className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-center inline-flex items-center justify-center gap-2" style={{ background:'var(--d-primary-soft)', color:'var(--d-primary)' }}><UserCheck size={17}/> Bạn bè</span>}
        </div>
        <div className="grid grid-cols-1 mt-4"><div className="rounded-xl py-3 text-center border" style={{ borderColor:'var(--d-border)' }}><div className="font-black text-lg">{friends}</div><div className="text-[10px] d-muted">Bạn bè</div></div></div>
      </div>
    </section>
    <section className="space-y-3">
      <h2 className="font-black">Bài viết</h2>
      {!posts.length && <div className="d-card p-8 text-center d-muted text-sm">Chưa có bài viết công khai.</div>}
      {posts.map(p => <article key={p.id} className="d-card overflow-hidden p-4">
        <div className="text-sm d-muted mb-2">{new Date(p.created_at).toLocaleDateString('vi-VN')}</div>
        {p.content && <p className="whitespace-pre-wrap leading-relaxed">{p.content}</p>}
        {p.media_url && (p.media_type === 'video' ? <video src={p.media_url} controls playsInline className="mt-3 rounded-xl w-full max-h-[500px] bg-black" /> : <img src={p.media_url} alt="" loading="lazy" className="mt-3 rounded-xl w-full max-h-[500px] object-cover" />)}
      </article>)}
    </section>
  </div>
}
