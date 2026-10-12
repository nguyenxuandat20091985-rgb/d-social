// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, Heart, MessageCircle, Share2, Plus, Check, Play, Pause,
  Volume2, VolumeX, Music2, Send, X, LoaderCircle
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { moderateText } from '../lib/moderation'
import { commentRateLimit } from '../lib/ratelimit'

const compactCount = value => {
  const n = Number(value || 0)
  if (n >= 1000000) return (n / 1000000).toFixed(n >= 10000000 ? 0 : 1).replace(/\.0$/, '') + 'M'
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K'
  return String(n)
}

function MiniAvatar({ src, name = 'D', size = 42 }) {
  const letter = String(name || 'D').trim().charAt(0).toUpperCase()
  return src
    ? <img src={src} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
    : <span className="grid place-items-center rounded-full bg-blue-600 text-white font-bold shrink-0" style={{ width: size, height: size, fontSize: size * .42 }}>{letter}</span>
}

export function ShortVideoFeed({ posts = [], userId, onBack, onRemoved, hasMore = false, pageLoading = false, loadMore }) {
  const scrollerRef = useRef(null)
  const videoRefs = useRef(new Map())
  const cardRefs = useRef(new Map())
  const lastLoadRequestedCount = useRef(0)
  const [activeId, setActiveId] = useState(posts[0]?.id || null)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [likedById, setLikedById] = useState({})
  const [likeCounts, setLikeCounts] = useState({})
  const [commentCounts, setCommentCounts] = useState({})
  const [followedIds, setFollowedIds] = useState(new Set())
  const [busyFollowId, setBusyFollowId] = useState(null)
  const [commentPost, setCommentPost] = useState(null)
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentBusy, setCommentBusy] = useState(false)
  const [commentError, setCommentError] = useState('')
  const [shareNotice, setShareNotice] = useState('')

  const videos = useMemo(() => posts.filter(post => !!post?.media_url), [posts])

  useEffect(() => {
    setActiveId(current => videos.some(post => post.id === current) ? current : (videos[0]?.id || null))
    setPaused(false)
  }, [videos.map(post => post.id).join('|')])

  useEffect(() => {
    if (!videos.length || !scrollerRef.current || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      const visible = entries
        .filter(entry => entry.isIntersecting && entry.intersectionRatio >= 0.65)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (visible?.target?.dataset?.postId) {
        const postId = visible.target.dataset.postId
        setActiveId(postId)
        setPaused(false)
        const isLastVideo = videos[videos.length - 1]?.id === postId
        if (isLastVideo && hasMore && !pageLoading && lastLoadRequestedCount.current !== videos.length) {
          lastLoadRequestedCount.current = videos.length
          loadMore?.()
        }
      }
    }, { root: scrollerRef.current, threshold: [0.25, 0.65, 0.9] })
    videos.forEach(post => {
      const node = cardRefs.current.get(post.id)
      if (node) observer.observe(node)
    })
    return () => observer.disconnect()
  }, [videos, hasMore, pageLoading, loadMore])

  useEffect(() => {
    if (!pageLoading) return
    // A newly appended page can trigger the next request once its last video becomes active.
  }, [pageLoading, videos.length])

  useEffect(() => {
    videos.forEach(post => {
      const video = videoRefs.current.get(post.id)
      if (!video) return
      const active = post.id === activeId
      video.muted = muted
      if (active && !paused) {
        const attempt = video.play()
        if (attempt?.catch) attempt.catch(() => {
          // Some mobile browsers block autoplay with sound. Fall back to muted playback
          // rather than leaving the feed stuck; the viewer can enable sound explicitly.
          video.muted = true
          setMuted(true)
          const fallbackAttempt = video.play()
          if (fallbackAttempt?.catch) fallbackAttempt.catch(() => setPaused(true))
        })
      } else {
        video.pause()
      }
    })
  }, [activeId, paused, muted, videos])

  const seekActiveVideo = useCallback((nextTime) => {
    const video = videoRefs.current.get(activeId)
    if (!video || !Number.isFinite(nextTime)) return
    video.currentTime = Math.max(0, Math.min(nextTime, video.duration || nextTime))
    setCurrentTime(video.currentTime)
  }, [activeId])

  useEffect(() => {
    let cancelled = false
    const loadEngagement = async () => {
      const likeState = {}
      const likeTotals = {}
      const commentTotals = {}
      for (const post of videos) {
        const likes = Array.isArray(post.likes) ? post.likes : []
        likeState[post.id] = !!userId && likes.some(item => item.user_id === userId)
        likeTotals[post.id] = likes.length
      }
      if (!supabase || !videos.length) {
        if (!cancelled) { setLikedById(likeState); setLikeCounts(likeTotals) }
        return
      }
      const results = await Promise.all(videos.map(async post => {
        const { count, error } = await supabase.from('comments').select('id', { count: 'exact', head: true }).eq('post_id', post.id).is('deleted_at', null)
        return [post.id, error ? 0 : (count || 0)]
      }))
      results.forEach(([id, count]) => { commentTotals[id] = count })
      let followed = new Set()
      if (userId) {
        const { data } = await supabase.from('follows').select('following_id').eq('follower_id', userId)
        followed = new Set((data || []).map(row => row.following_id))
      }
      if (!cancelled) {
        setLikedById(likeState)
        setLikeCounts(likeTotals)
        setCommentCounts(commentTotals)
        setFollowedIds(followed)
      }
    }
    loadEngagement().catch(error => console.error('Không tải được tương tác video:', error))
    return () => { cancelled = true }
  }, [videos, userId])

  const togglePlay = useCallback((postId) => {
    if (postId !== activeId) {
      setActiveId(postId)
      setPaused(false)
      return
    }
    setPaused(current => !current)
  }, [activeId])

  const toggleLike = async post => {
    if (!supabase || !userId) {
      setShareNotice('Anh cần đăng nhập để thả tim.')
      return
    }
    const alreadyLiked = !!likedById[post.id]
    setLikedById(current => ({ ...current, [post.id]: !alreadyLiked }))
    setLikeCounts(current => ({ ...current, [post.id]: Math.max(0, (current[post.id] || 0) + (alreadyLiked ? -1 : 1)) }))
    const result = alreadyLiked
      ? await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', userId)
      : await supabase.from('likes').insert({ post_id: post.id, user_id: userId })
    if (result.error) {
      setLikedById(current => ({ ...current, [post.id]: alreadyLiked }))
      setLikeCounts(current => ({ ...current, [post.id]: Math.max(0, (current[post.id] || 0) + (alreadyLiked ? 1 : -1)) }))
    }
  }

  const toggleFollow = async post => {
    const authorId = post.author_id || post.user_id
    if (!authorId || authorId === userId || !userId || !supabase || busyFollowId) return
    const isFollowing = followedIds.has(authorId)
    setBusyFollowId(authorId)
    try {
      const result = isFollowing
        ? await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', authorId)
        : await supabase.from('follows').insert({ follower_id: userId, following_id: authorId })
      if (!result.error) {
        setFollowedIds(current => {
          const next = new Set(current)
          if (isFollowing) next.delete(authorId)
          else next.add(authorId)
          return next
        })
      }
    } finally {
      setBusyFollowId(null)
    }
  }

  const loadComments = async post => {
    setCommentPost(post)
    setCommentText('')
    setCommentError('')
    setCommentsLoading(true)
    if (!supabase) { setComments([]); setCommentsLoading(false); return }
    const { data, error } = await supabase.from('comments')
      .select('id,content,created_at,author_id,profiles(full_name,username,avatar_url)')
      .eq('post_id', post.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(100)
    if (error) setCommentError('Chưa tải được bình luận. Vui lòng thử lại.')
    setComments(data || [])
    setCommentsLoading(false)
  }

  const sendComment = async () => {
    const body = commentText.trim()
    setCommentError('')
    if (!userId || !supabase) return setCommentError('Anh cần đăng nhập để bình luận.')
    if (!body) return setCommentError('Nhập nội dung bình luận trước khi gửi.')
    if (!commentRateLimit(userId)) return setCommentError('Anh bình luận quá nhanh. Vui lòng chờ rồi thử lại.')
    const moderation = moderateText(body)
    if (!moderation.allowed) return setCommentError(moderation.reason || 'Bình luận chưa được chấp nhận.')
    setCommentBusy(true)
    const { data, error } = await supabase.from('comments')
      .insert({ post_id: commentPost.id, author_id: userId, content: body })
      .select('id,content,created_at,author_id,profiles(full_name,username,avatar_url)')
      .single()
    if (error) {
      setCommentError(error.message || 'Không gửi được bình luận.')
    } else {
      setComments(current => [...current, data])
      setCommentText('')
      setCommentCounts(current => ({ ...current, [commentPost.id]: (current[commentPost.id] || 0) + 1 }))
    }
    setCommentBusy(false)
  }

  const sharePost = async post => {
    const url = `${window.location.origin}/p/${post.id}`
    try {
      if (navigator.share) await navigator.share({ title: 'Video Nổi bật trên D-Social', text: post.content || 'Xem video này trên D-Social', url })
      else {
        await navigator.clipboard.writeText(url)
        setShareNotice('Đã sao chép liên kết video')
        window.setTimeout(() => setShareNotice(''), 2200)
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        try {
          await navigator.clipboard.writeText(url)
          setShareNotice('Đã sao chép liên kết video')
          window.setTimeout(() => setShareNotice(''), 2200)
        } catch { setShareNotice('Không thể chia sẻ trên thiết bị này.') }
      }
    }
  }

  if (!videos.length) {
    return (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-black text-white px-6" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <button type="button" onClick={onBack} className="absolute left-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/10" aria-label="Quay lại"><ArrowLeft size={22}/></button>
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-white/10"><Music2 size={28}/></div>
          <h2 className="text-xl font-bold">Chưa có video ngắn nổi bật</h2>
          <p className="mt-2 text-sm leading-6 text-white/65">Video mới của cộng đồng sẽ xuất hiện tại đây.</p>
          <button type="button" onClick={onBack} className="mt-5 rounded-full bg-white px-5 py-3 text-sm font-bold text-black">Về Trang chủ</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white" style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div ref={scrollerRef} className="h-full w-full overflow-y-auto snap-y snap-mandatory overscroll-contain" style={{ scrollbarWidth: 'none' }} aria-label="Video ngắn nổi bật">
        {videos.map(post => {
          const profile = Array.isArray(post.profiles) ? post.profiles[0] : post.profiles
          const authorName = profile?.full_name || profile?.username || 'Thành viên D'
          const authorId = post.author_id || post.user_id
          const isFollowing = followedIds.has(authorId)
          const isLiked = !!likedById[post.id]
          const isActive = post.id === activeId
          return (
            <section
              key={post.id}
              ref={node => { if (node) cardRefs.current.set(post.id, node); else cardRefs.current.delete(post.id) }}
              data-post-id={post.id}
              className="relative h-full min-h-full w-full snap-start snap-always overflow-hidden bg-neutral-950"
              style={{ height: '100dvh' }}
            >
              <video
                ref={node => { if (node) videoRefs.current.set(post.id, node); else videoRefs.current.delete(post.id) }}
                src={post.media_url}
                poster={post.thumbnail_url || undefined}
                className="absolute inset-0 h-full w-full object-cover"
                style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#050505' }}
                playsInline
                loop
                muted={muted}
                preload={isActive ? 'auto' : 'metadata'}
                onClick={() => togglePlay(post.id)}
                onLoadedMetadata={event => { if (isActive) { setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0); setCurrentTime(event.currentTarget.currentTime || 0) } }}
                onDurationChange={event => { if (isActive) setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0) }}
                onTimeUpdate={event => { if (isActive) { setCurrentTime(event.currentTarget.currentTime || 0); setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0) } }}
                onPlay={() => { if (isActive) setPaused(false) }}
                onPause={() => { if (isActive) setPaused(true) }}
                aria-label={`Video của ${authorName}`}
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/75" />
              <button type="button" onClick={onBack} className="absolute left-3 top-3 z-20 grid h-11 w-11 place-items-center rounded-full bg-black/35 backdrop-blur-sm" aria-label="Quay lại Trang chủ"><ArrowLeft size={23}/></button>
              <div className="absolute right-3 bottom-[calc(84px+env(safe-area-inset-bottom))] z-20 flex w-14 flex-col items-center gap-3">
                <div className="relative mb-1">
                  <MiniAvatar src={profile?.avatar_url} name={authorName} size={46}/>
                  {userId && authorId !== userId && <button type="button" onClick={() => toggleFollow(post)} disabled={busyFollowId === authorId} className="absolute -bottom-2 left-1/2 grid h-6 w-6 -translate-x-1/2 place-items-center rounded-full bg-rose-500 text-white ring-2 ring-black disabled:opacity-60" aria-label={isFollowing ? 'Bỏ theo dõi' : 'Theo dõi tác giả'}>{isFollowing ? <Check size={14}/> : <Plus size={15} strokeWidth={3}/>}</button>}
                </div>
                <button type="button" onClick={() => toggleLike(post)} className="flex min-h-10 flex-col items-center gap-0.5 text-white drop-shadow" aria-label={isLiked ? 'Bỏ thả tim' : 'Thả tim'}>
                  <Heart size={31} fill={isLiked ? '#fb7185' : 'rgba(0,0,0,.15)'} color={isLiked ? '#fb7185' : 'white'} strokeWidth={2.3}/>
                  <span className="text-xs font-semibold">{compactCount(likeCounts[post.id])}</span>
                </button>
                <button type="button" onClick={() => loadComments(post)} className="flex min-h-10 flex-col items-center gap-0.5 text-white drop-shadow" aria-label="Mở bình luận">
                  <MessageCircle size={30} fill="rgba(0,0,0,.12)" strokeWidth={2.3}/>
                  <span className="text-xs font-semibold">{compactCount(commentCounts[post.id])}</span>
                </button>
                <button type="button" onClick={() => sharePost(post)} className="flex min-h-10 flex-col items-center gap-0.5 text-white drop-shadow" aria-label="Chia sẻ video">
                  <Share2 size={29} strokeWidth={2.3}/><span className="text-xs font-semibold">Chia sẻ</span>
                </button>
                <button type="button" onClick={() => setMuted(value => !value)} className="grid h-10 w-10 place-items-center rounded-full bg-black/35" aria-label={muted ? 'Bật tiếng' : 'Tắt tiếng'}>{muted ? <VolumeX size={19}/> : <Volume2 size={19}/>}</button>
              </div>
              {isActive && paused && <button type="button" onClick={() => setPaused(false)} className="absolute left-1/2 top-1/2 z-10 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/40 backdrop-blur-sm" aria-label="Phát video"><Play size={32} fill="white"/></button>}
              <button type="button" onClick={() => togglePlay(post.id)} className="absolute inset-x-20 top-1/4 bottom-1/4 z-[1]" aria-label={paused ? 'Phát video' : 'Tạm dừng video'} />
              <div className="absolute bottom-5 left-4 z-20 max-w-[calc(100%-112px)]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                <div className="mb-2 flex items-center gap-2">
                  <MiniAvatar src={profile?.avatar_url} name={authorName} size={29}/>
                  <span className="max-w-[220px] truncate text-sm font-bold drop-shadow">{authorName}</span>
                  {profile?.username && <span className="max-w-[120px] truncate text-xs text-white/75">@{profile.username}</span>}
                </div>
                {post.content && <p className="mb-3 max-w-[min(78vw,520px)] whitespace-pre-wrap break-words text-sm leading-5 drop-shadow [text-shadow:0_1px_3px_rgba(0,0,0,.65)]">{post.content}</p>}
                <div className="flex max-w-full items-center gap-2 text-xs text-white/90">
                  <Music2 size={15} className={`music-disc-icon shrink-0 ${isActive && !paused ? 'is-spinning' : 'is-paused'}`} aria-hidden="true"/><span className="truncate">{authorName} · Âm thanh gốc</span>
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 z-20 h-[3px] bg-white/30" aria-label="Tiến trình video">
                <div className="h-full bg-white" style={{ width: `${isActive && duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0}%` }} />
              </div>
              <input
                type="range"
                min={0}
                max={duration || 1}
                step="0.1"
                value={isActive ? Math.min(currentTime, duration || 0) : 0}
                onChange={event => { if (isActive) seekActiveVideo(Number(event.target.value)) }}
                className="absolute bottom-[-6px] left-0 z-30 h-4 w-full cursor-pointer opacity-0"
                aria-label="Tua video"
                tabIndex={isActive ? 0 : -1}
              />
            </section>
          )
        })}
      </div>
      {pageLoading && <div role="status" className="absolute bottom-6 left-1/2 z-[120] flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-xs text-white backdrop-blur"><LoaderCircle size={16} className="animate-spin"/> Đang tải video tiếp theo…</div>}
      {shareNotice && <div role="status" className="absolute left-1/2 top-16 z-[120] -translate-x-1/2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black shadow-xl">{shareNotice}</div>}
      {commentPost && (
        <div className="absolute inset-0 z-[130] flex items-end bg-black/55" onClick={() => setCommentPost(null)}>
          <section role="dialog" aria-modal="true" aria-label="Bình luận video" className="flex max-h-[78dvh] w-full flex-col rounded-t-3xl bg-white text-slate-900 shadow-2xl" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }} onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="w-8"/><h3 className="text-sm font-bold">Bình luận · {compactCount(commentCounts[commentPost.id])}</h3>
              <button type="button" onClick={() => setCommentPost(null)} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100" aria-label="Đóng bình luận"><X size={18}/></button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
              {commentsLoading && <div className="flex justify-center py-8 text-slate-500"><LoaderCircle size={22} className="animate-spin"/></div>}
              {!commentsLoading && comments.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Chưa có bình luận. Hãy là người đầu tiên!</p>}
              {comments.map(comment => {
                const profile = Array.isArray(comment.profiles) ? comment.profiles[0] : comment.profiles
                const name = profile?.full_name || profile?.username || 'Thành viên'
                return <div key={comment.id} className="flex items-start gap-3">
                  <MiniAvatar src={profile?.avatar_url} name={name} size={34}/>
                  <div className="min-w-0 flex-1 rounded-2xl bg-slate-100 px-3 py-2">
                    <div className="text-xs font-bold">{name}</div><p className="mt-1 whitespace-pre-wrap break-words text-sm">{comment.content}</p>
                  </div>
                </div>
              })}
              {commentError && <p role="alert" className="text-xs text-rose-600">{commentError}</p>}
            </div>
            <form className="flex items-center gap-2 border-t border-slate-200 px-3 py-3" onSubmit={event => { event.preventDefault(); sendComment() }}>
              <input value={commentText} onChange={event => { setCommentText(event.target.value); if (commentError) setCommentError('') }} maxLength={2000} placeholder="Viết bình luận..." className="h-11 min-w-0 flex-1 rounded-full bg-slate-100 px-4 text-sm outline-none focus:ring-2 focus:ring-blue-500" aria-label="Nội dung bình luận"/>
              <button type="submit" disabled={commentBusy || !commentText.trim()} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-blue-600 text-white disabled:opacity-50" aria-label="Gửi bình luận">{commentBusy ? <LoaderCircle size={18} className="animate-spin"/> : <Send size={18}/>}</button>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
