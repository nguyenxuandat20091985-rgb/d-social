// @ts-nocheck
import React, { useEffect, useRef, useState } from 'react'
import { VideoTimelineEditor } from './VideoTimelineEditor'
import { Music2, Search, Play, Pause, SlidersHorizontal, ShieldCheck, MapPin, AtSign, Type, Sticker, Scissors, Palette, Volume2 } from 'lucide-react'

const FILTERS = [
  { id: 'none', label: 'Gốc', css: 'none' },
  { id: 'warm', label: 'Ấm', css: 'saturate(1.15) sepia(.18)' },
  { id: 'mono', label: 'Đen trắng', css: 'grayscale(1)' },
  { id: 'vivid', label: 'Rực rỡ', css: 'saturate(1.45) contrast(1.05)' },
  { id: 'cool', label: 'Lạnh', css: 'saturate(.9) hue-rotate(12deg)' },
]
const STICKER_GROUPS = [
  { label: 'Cảm xúc', items: ['❤️','😍','🥰','😂','🤣','😭','🥹','😎','🥳','😘','🤗','😴','🤔','🙌','👏','💖','💔','💕','💯','✨'] },
  { label: 'Biểu tượng', items: ['🔥','⭐','🌟','⚡','💫','☀️','🌈','☁️','🌙','☘️','🍀','🌸','🌷','🌻','🌹','💐','🎉','🎊','🎈','🎁','🏆','👑','💎','📌','💡','🎵','🎶','✅','❗','💬'] },
  { label: 'Động vật', items: ['🐶','🐱','🐼','🐻','🐨','🦊','🐸','🐵','🐰','🦋','🐝','🐢','🐬','🦄','🐣','🦁','🐯','🐧','🦉','🐾'] },
  { label: 'Đồ ăn', items: ['🍎','🍓','🍒','🍉','🍍','🥑','🍕','🍔','🍟','🌮','🍜','🍣','🍰','🧁','🍩','🍪','🍦','☕','🧋','🥤'] },
  { label: 'Du lịch & hoạt động', items: ['✈️','🚗','🚲','🏖️','🏝️','⛰️','🏕️','🏙️','⚽','🏀','🎮','🎧','📷','🎬','🎨','🛍️','💻','📱','💌','🫶'] },
]

export function CreatorMediaTools({ file, files, settings, onChange, mode = 'post', storyMode = false, videoRef, isPlaying = false, onTogglePlayback, onPublishStory, onContinuePost, onCloseEditor }) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState([])
  const [loading, setLoading] = useState(false)
  const [audioError, setAudioError] = useState('')
  const [playingId, setPlayingId] = useState('')
  const [activeTool, setActiveTool] = useState('')
  const [duration, setDuration] = useState(0)
  const [durationError, setDurationError] = useState(false)
  const selected = settings || {}
  const update = patch => onChange?.({ ...selected, ...patch })
  const isVideo = file?.type?.startsWith('video/')
  const zoomPointersRef = useRef(new Map())
  const zoomGestureRef = useRef(null)
  const clampZoom = value => Math.max(1, Math.min(3, Number(value) || 1))
  const finishZoomPointer = event => {
    const pointers = zoomPointersRef.current
    pointers.delete(event.pointerId)
    const remaining = [...pointers.values()]
    if (remaining.length === 1) {
      const point = remaining[0]
      const bounds = event.currentTarget.getBoundingClientRect()
      zoomGestureRef.current = {
        mode: 'pan',
        startX: point.x,
        startY: point.y,
        basePanX: Number(selected.panX ?? 0),
        basePanY: Number(selected.panY ?? 0),
        width: bounds.width || 1,
        height: bounds.height || 1,
      }
    } else if (!remaining.length) {
      zoomGestureRef.current = null
    }
  }
  const handleZoomPointerDown = event => {
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const pointers = zoomPointersRef.current
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const points = [...pointers.values()]
    const bounds = event.currentTarget.getBoundingClientRect()
    if (points.length >= 2) {
      const [a, b] = points
      zoomGestureRef.current = {
        mode: 'pinch',
        startDistance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        startZoom: clampZoom(selected.zoom ?? 1),
      }
    } else {
      zoomGestureRef.current = {
        mode: 'pan',
        startX: event.clientX,
        startY: event.clientY,
        basePanX: Number(selected.panX ?? 0),
        basePanY: Number(selected.panY ?? 0),
        width: bounds.width || 1,
        height: bounds.height || 1,
      }
    }
  }
  const handleZoomPointerMove = event => {
    const pointers = zoomPointersRef.current
    if (!pointers.has(event.pointerId)) return
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const points = [...pointers.values()]
    const gesture = zoomGestureRef.current
    if (!gesture) return
    if (points.length >= 2 && gesture.mode === 'pinch') {
      const [a, b] = points
      const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))
      update({ zoom: Math.round(clampZoom(gesture.startZoom * distance / gesture.startDistance) * 10) / 10 })
      return
    }
    if (points.length === 1 && gesture.mode === 'pan') {
      const point = points[0]
      const zoom = clampZoom(selected.zoom ?? 1)
      const maxPan = Math.min(50, Math.max(0, (zoom - 1) * 25))
      const panX = Math.max(-maxPan, Math.min(maxPan, gesture.basePanX + (point.x - gesture.startX) / gesture.width * 100))
      const panY = Math.max(-maxPan, Math.min(maxPan, gesture.basePanY + (point.y - gesture.startY) / gesture.height * 100))
      update({ panX: Math.round(panX), panY: Math.round(panY) })
    }
  }



  const searchAudio = async (event) => {
    event?.preventDefault?.()
    setLoading(true)
    setAudioError('')
    try {
      const params = new URLSearchParams({ q: query.trim(), order: query.trim() ? 'popular' : 'latest' })
      const response = await fetch('/api/pixabay/audio?' + params.toString())
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Không tìm được thư viện âm thanh.')
      setHits(Array.isArray(data.hits) ? data.hits : [])
      if (!data.hits?.length) setAudioError('Không có bản nhạc phù hợp. Hãy thử từ khóa khác.')
    } catch (error) {
      setHits([])
      setAudioError(error?.message || 'Không thể kết nối thư viện nhạc.')
    } finally { setLoading(false) }
  }

  const toggleTrackPreview = track => {
    const audio = document.getElementById('pixabay-preview-' + track.id)
    if (!audio) return
    if (playingId === track.id) {
      audio.pause()
      setPlayingId('')
      return
    }
    document.querySelectorAll('[data-pixabay-preview]').forEach(element => {
      element.pause()
    })
    audio.play()
      .then(() => setPlayingId(track.id))
      .catch(() => setAudioError('Không phát được bản xem trước này.'))
  }

  const selectTrack = track => {
    if (!track || !track.id || !track.previewUrl) {
      setAudioError('Bài nhạc này chưa có đường dẫn phát hợp lệ. Hãy chọn bài khác.')
      return
    }
    update({
      audioSource: 'pixabay',
      audioTrackId: track.id,
      audioTrackTitle: track.title,
      audioTrackArtist: track.artist,
      audioTrackUrl: track.previewUrl,
      audioTrackPageUrl: track.pageUrl,
      isMuted: false,
    })
    document.querySelectorAll('[data-pixabay-preview]').forEach(element => element.pause())
    setPlayingId('')
    setActiveTool('')
  }

  if (mode === 'fullscreen') return <div className="absolute inset-0 z-20 pointer-events-none">
    {activeTool === 'adjust' && <div
      aria-label="Kéo một ngón để di chuyển khung hình; chụm hoặc tách hai ngón để phóng to, thu nhỏ"
      className="absolute left-0 top-0 z-10 h-[52dvh] w-full touch-none pointer-events-auto"
      style={{ touchAction: 'none' }}
      onPointerDown={handleZoomPointerDown}
      onPointerMove={handleZoomPointerMove}
      onPointerUp={finishZoomPointer}
      onPointerCancel={finishZoomPointer}
      onLostPointerCapture={finishZoomPointer}
      onContextMenu={event => event.preventDefault()}
    >
      <span className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/65 px-3 py-1.5 text-[11px] font-medium text-white/90 shadow">
        Kéo để di chuyển · Chụm 2 ngón để zoom
      </span>
    </div>}
    {activeTool === 'music' && <div className="pointer-events-auto absolute bottom-[calc(190px+env(safe-area-inset-bottom))] left-3 right-3 z-30 mx-auto max-h-[min(28dvh,calc(100dvh-250px))] max-w-md overflow-y-auto rounded-2xl border border-white/15 bg-[#101116]/95 p-3 text-white shadow-2xl backdrop-blur-xl">
      <div className="mb-2 flex items-center justify-between gap-2"><strong className="text-sm">Thư viện âm thanh</strong><button type="button" onClick={() => setActiveTool('')} className="rounded-full bg-white/10 px-3 py-1 text-xs">Đóng</button></div>
      <div className="flex gap-2"><input className="min-w-0 flex-1 rounded-lg bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50" value={query} maxLength={100} onChange={e => setQuery(e.target.value)} placeholder="Tìm nhạc: chill, piano…" /><button type="button" disabled={loading} onClick={searchAudio} className="rounded-lg bg-white px-3 text-black disabled:opacity-50"><Search size={16}/></button></div>
      <button type="button" onClick={() => { update({audioSource:'original',audioTrackId:null,audioTrackTitle:null,audioTrackUrl:null,isMuted:false}); setActiveTool('') }} className="mt-2 rounded-lg border border-white/20 px-3 py-2 text-xs">Dùng âm thanh gốc</button>
      {loading && <p className="mt-2 text-xs text-white/65">Đang tìm nhạc…</p>}
      {audioError && <p role="status" className="mt-2 text-xs text-amber-300">{audioError}</p>}
      <div className="mt-2 space-y-2">
        {hits.map(track => <div key={track.id} className="flex items-center gap-2 rounded-xl bg-white/[0.07] p-2">
          <button type="button" onClick={() => toggleTrackPreview(track)} className="rounded-full bg-white/10 p-2" aria-label={playingId === track.id ? 'Dừng nghe thử' : 'Nghe thử'}>{playingId === track.id ? <Pause size={14}/> : <Play size={14}/>}</button>
          <audio id={'pixabay-preview-' + track.id} data-pixabay-preview src={track.previewUrl} preload="none" className="hidden"/>
          <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{track.title}</div><div className="truncate text-[10px] text-white/55">{track.artist}</div></div>
          <button type="button" onClick={() => selectTrack(track)} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-black">Chọn</button>
        </div>)}
      </div>
      {selected.audioTrackTitle && <p className="mt-2 text-xs text-emerald-300">Đã chọn: {selected.audioTrackTitle}</p>}
    </div>}
    {(file?.type?.startsWith('image/') || file?.type?.startsWith('video/') || (files || []).some(f => f && f.type && (f.type.startsWith('image/') || f.type.startsWith('video/')))) && <VideoTimelineEditor file={file} files={files} storyMode={storyMode} onPublishStory={onPublishStory} onContinuePost={onContinuePost} onCloseEditor={onCloseEditor} settings={selected} onChange={onChange} videoRef={videoRef} isPlaying={isPlaying} onTogglePlayback={onTogglePlayback} trimModeActive={activeTool === 'trim'} onOpenTool={tool => { if (tool === 'trim') { setActiveTool('trim'); return } if (tool === 'music' && !hits.length && !loading) searchAudio(); if (tool === 'adjust') setActiveTool(current => current === tool ? '' : tool) }} />}
  </div>

  return <div className="mt-4 rounded-2xl border p-3 space-y-4" style={{ borderColor: 'var(--d-border)', background: 'var(--d-surface-2)' }}>
    <div className="flex items-center gap-2 font-bold"><SlidersHorizontal size={17}/> Công cụ chỉnh sửa</div>

    {isVideo && <p className="text-xs d-muted">Dùng dải Timeline trong trình chỉnh sửa toàn màn hình để chọn đoạn video.</p>}

    <section className="space-y-2">
      <div className="text-sm font-semibold">Âm thanh</div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => update({ audioSource: 'original', audioTrackId: null, audioTrackTitle: null, audioTrackUrl: null, isMuted: false })} className="rounded-xl border px-3 py-2 text-sm font-semibold" style={{ borderColor: selected.audioSource !== 'pixabay' ? 'var(--d-primary)' : 'var(--d-border)', background: selected.audioSource !== 'pixabay' ? 'var(--d-primary-soft)' : 'var(--d-surface)' }}>Âm thanh gốc</button>
        <button type="button" onClick={() => { update({ audioSource: 'pixabay' }); searchAudio() }} className="rounded-xl border px-3 py-2 text-sm font-semibold" style={{ borderColor: selected.audioSource === 'pixabay' ? 'var(--d-primary)' : 'var(--d-border)', background: selected.audioSource === 'pixabay' ? 'var(--d-primary-soft)' : 'var(--d-surface)' }}><Music2 size={15} className="inline mr-1"/>Thư viện nhạc</button>
      </div>
      <label className="block text-xs d-muted">Âm lượng tiếng gốc: {selected.originalVolume ?? 100}%
        <input className="w-full mt-1" type="range" min="0" max="100" value={selected.originalVolume ?? 100} onChange={e => update({ originalVolume: Number(e.target.value) })}/>
      </label>
      <label className="block text-xs d-muted">Âm lượng nhạc nền: {selected.musicVolume ?? 30}%
        <input className="w-full mt-1" type="range" min="0" max="100" value={selected.musicVolume ?? 30} onChange={e => update({ musicVolume: Number(e.target.value) })}/>
      </label>
      {selected.audioTrackTitle && <div className="rounded-xl p-2 text-sm" style={{ background: 'var(--d-surface)' }}><div className="font-semibold">{selected.audioTrackTitle}</div><div className="text-xs d-muted">{selected.audioTrackArtist || 'Pixabay'}</div><a className="text-xs underline" href={selected.audioTrackPageUrl || 'https://pixabay.com/'} target="_blank" rel="noreferrer">Xem nguồn / giấy phép</a></div>}
      {selected.audioSource === 'pixabay' && <form onSubmit={searchAudio} className="space-y-2">
        <div className="flex gap-2"><input className="d-input min-w-0 flex-1" value={query} maxLength={100} onChange={e => setQuery(e.target.value)} placeholder="Tìm nhạc: piano, chill, vui tươi…"/><button type="submit" disabled={loading} className="d-btn-primary px-3" aria-label="Tìm nhạc"><Search size={17}/></button></div>
        {loading && <p className="text-xs d-muted">Đang tìm nhạc…</p>}
        {audioError && <p role="status" className="text-xs" style={{ color: 'var(--d-warning)' }}>{audioError}</p>}
        {hits.map(track => <div key={track.id} className="flex items-center gap-2 rounded-xl p-2" style={{ background: 'var(--d-surface)' }}>
          <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: 'var(--d-primary-soft)', color: 'var(--d-primary)' }} onClick={() => { const audio = document.getElementById('pixabay-preview-' + track.id); if (!audio) return; if (playingId === track.id) { audio.pause(); setPlayingId('') } else { document.querySelectorAll('[data-pixabay-preview]').forEach(el => el.pause()); audio.play().then(() => setPlayingId(track.id)).catch(() => setAudioError('Không phát được bản xem trước này.')) } }} aria-label="Nghe thử"><Play size={16}/></button>
          <audio id={'pixabay-preview-' + track.id} data-pixabay-preview src={track.previewUrl} preload="none" onEnded={() => setPlayingId('')} className="hidden"/>
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{track.title}</div><div className="truncate text-xs d-muted">{track.artist}</div></div>
          <button type="button" className="rounded-lg px-3 py-2 text-xs font-bold" style={{ background: 'var(--d-primary-soft)', color: 'var(--d-primary)' }} onClick={() => selectTrack(track)}>Chọn</button>
        </div>)}
        <p className="text-[11px] d-muted">Kết quả phải hiển thị nguồn Pixabay. Kiểm tra điều khoản và quyền sử dụng từng bản nhạc trước khi đăng.</p>
      </form>}
    </section>

    <section className="space-y-2">
      <div className="text-sm font-semibold">Bộ lọc màu</div>
      <div className="flex flex-wrap gap-2">{FILTERS.map(filter => <button key={filter.id} type="button" onClick={() => update({ colorFilter: filter.id })} className="rounded-lg border px-3 py-2 text-xs font-semibold" style={{ borderColor: (selected.colorFilter || 'none') === filter.id ? 'var(--d-primary)' : 'var(--d-border)', background: (selected.colorFilter || 'none') === filter.id ? 'var(--d-primary-soft)' : 'var(--d-surface)' }}>{filter.label}</button>)}</div>
      <p className="text-xs d-muted">Bộ lọc được lưu cùng tùy chọn sáng tạo; cần bước xuất media để áp dụng vĩnh viễn lên tệp.</p>
    </section>

    <section className="space-y-2">
      <div className="text-sm font-semibold flex items-center gap-2"><Type size={16}/> Chữ và sticker</div>
      <input className="d-input w-full" maxLength={120} value={selected.overlayText || ''} onChange={e => update({ overlayText: e.target.value })} placeholder="Nhập chữ muốn chèn lên ảnh/video"/>
      <div className="flex flex-wrap gap-2">{STICKERS.map(sticker => <button key={sticker} type="button" onClick={() => update({ sticker: selected.sticker === sticker ? '' : sticker })} className="rounded-lg border px-3 py-2 text-xl" style={{ borderColor: selected.sticker === sticker ? 'var(--d-primary)' : 'var(--d-border)', background: selected.sticker === sticker ? 'var(--d-primary-soft)' : 'var(--d-surface)' }} aria-label={'Sticker ' + sticker}>{sticker}</button>)}</div>
    </section>

    <section className="space-y-2">
      <div className="text-sm font-semibold">Đối tượng và thông tin bài đăng</div>
      <label className="block text-xs d-muted">Quyền riêng tư
        <select className="d-input mt-1 w-full" value={selected.privacy || 'public'} onChange={e => update({ privacy: e.target.value })}><option value="public">Công khai</option><option value="friends">Bạn bè</option><option value="private">Chỉ mình tôi</option></select>
      </label>
      <label className="block text-xs d-muted"><AtSign size={13} className="inline mr-1"/>Gắn thẻ bạn bè
        <input className="d-input mt-1 w-full" maxLength={300} value={selected.taggedUsers || ''} onChange={e => update({ taggedUsers: e.target.value })} placeholder="@tên tài khoản, cách nhau bằng dấu phẩy"/>
      </label>
      <label className="block text-xs d-muted"><MapPin size={13} className="inline mr-1"/>Vị trí / Check-in
        <input className="d-input mt-1 w-full" maxLength={160} value={selected.location || ''} onChange={e => update({ location: e.target.value })} placeholder="Thêm địa điểm"/>
      </label>
    </section>

    <label className="flex items-start gap-2 text-xs leading-5"><input className="mt-1" type="checkbox" checked={!!selected.rightsConfirmed} onChange={e => update({ rightsConfirmed: e.target.checked })}/><span><ShieldCheck size={14} className="inline mr-1"/>Tôi có quyền đăng ảnh/video và âm thanh này, và có quyền sử dụng các tài nguyên đã chọn.</span></label>
    <p className="text-[11px] d-muted">Lưu ý: các tùy chọn cắt, bộ lọc, chữ/sticker và trộn âm thanh chỉ được áp dụng vào tệp xuất khi dịch vụ xử lý media hỗ trợ tương ứng. Không khẳng định nội dung đã được làm sạch bản quyền chỉ dựa vào việc chọn nhạc.</p>
  </div>
}
