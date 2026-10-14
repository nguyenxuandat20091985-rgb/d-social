// @ts-nocheck
import React, { useEffect, useState } from 'react'
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

export function CreatorMediaTools({ file, settings, onChange, mode = 'post' }) {
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

  useEffect(() => {
    setDuration(0)
    setDurationError(false)
    if (!file || !isVideo) return
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    let settled = false
    const settleDuration = () => {
      if (settled) return
      const actualDuration = Number(video.duration)
      if (!Number.isFinite(actualDuration) || actualDuration <= 0) return
      settled = true
      setDuration(actualDuration)
      setDurationError(false)
      const currentStart = Math.max(0, Number(settings?.trimStart) || 0)
      const currentEnd = Number(settings?.trimEnd)
      const safeEnd = Math.min(60, actualDuration)
      if (!Number.isFinite(currentEnd) || currentEnd > safeEnd || currentEnd <= currentStart) {
        onChange?.({ ...settings, trimStart: Math.min(currentStart, Math.max(0, safeEnd - 15)), trimEnd: safeEnd })
      }
    }
    video.preload = 'metadata'
    video.onloadedmetadata = settleDuration
    video.ondurationchange = settleDuration
    video.onerror = () => { setDurationError(true) }
    video.src = url
    video.load()
    return () => {
      video.onloadedmetadata = null
      video.ondurationchange = null
      video.onerror = null
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(url)
    }
  }, [file, isVideo])

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

  const start = Math.max(0, Number(selected.trimStart) || 0)
  const maxEnd = Math.min(60, duration || 60)
  const minDuration = Math.min(15, duration || 15)
  const end = Math.min(maxEnd, Math.max(start + minDuration, Number(selected.trimEnd) || maxEnd))
  const maxStart = Math.max(0, Math.min(maxEnd - minDuration, end - minDuration))
  const startPercent = duration > 0 ? (start / duration) * 100 : 0
  const endPercent = duration > 0 ? (end / duration) * 100 : 100
  const trimValid = !isVideo || (duration > 0 && end - start >= 15 && end - start <= 60 && end <= duration)
  const setTrimStart = value => {
    const next = Math.max(0, Math.min(Number(value) || 0, Math.min(maxStart, end - minDuration)))
    update({ trimStart: next, trimEnd: end })
  }
  const setTrimEnd = value => {
    const next = Math.max(start + minDuration, Math.min(maxEnd, Number(value) || maxEnd))
    update({ trimStart: start, trimEnd: next })
  }

  if (mode === 'fullscreen') return <div className="absolute inset-0 z-20 pointer-events-none">
    <div className="absolute top-[max(18px,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 pointer-events-auto">
      <button type="button" aria-expanded={activeTool === 'music'} onClick={() => { if (activeTool === 'music') setActiveTool(''); else { setActiveTool('music'); if (!hits.length && !loading) searchAudio() } }} className="flex items-center gap-1.5 rounded-full bg-black/75 px-3 py-1.5 text-xs font-semibold text-white shadow-lg border border-white/20 backdrop-blur-sm"><Music2 size={14}/> Thêm âm thanh</button>
    </div>
    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex flex-col gap-3 pointer-events-auto">
      {[
        {id:'trim', label:'Cắt', icon:<Scissors size={17}/>},
        {id:'text', label:'Chữ', icon:<Type size={17}/>},
        {id:'sticker', label:'Sticker', icon:<Sticker size={17}/>},
        {id:'filter', label:'Bộ lọc', icon:<Palette size={17}/>},
        {id:'volume', label:'Âm lượng', icon:<Volume2 size={17}/>},
      ].map(item => <button key={item.id} type="button" onClick={() => setActiveTool(activeTool === item.id ? '' : item.id)} className={`flex w-[46px] flex-col items-center gap-1 rounded-xl px-0.5 py-1.5 text-white drop-shadow-lg ${activeTool === item.id ? 'bg-white/30 ring-1 ring-white' : 'bg-black/35'}`}><span>{item.icon}</span><span className="text-[9px] font-semibold leading-tight">{item.label}</span></button>)}
    </div>
    {activeTool && <div className={`absolute ${activeTool === 'music' ? 'top-[max(62px,calc(env(safe-area-inset-top)+58px))] left-3 right-3 mx-auto w-auto max-w-md max-h-[48dvh]' : 'bottom-[max(96px,calc(env(safe-area-inset-bottom)+88px))] left-3 right-3 max-h-[42dvh]'} overflow-y-auto rounded-2xl border border-white/20 bg-black/90 p-3.5 text-white shadow-2xl backdrop-blur-md pointer-events-auto`}>
      <div className="mb-3 flex items-center justify-between"><strong>{({music:'Thêm âm thanh · Nhạc mẫu miễn phí',trim:'Cắt video (15–60 giây)',text:'Chèn chữ',sticker:'Sticker',filter:'Bộ lọc màu',volume:'Chỉnh âm lượng'})[activeTool]}</strong><button type="button" onClick={() => setActiveTool('')} className="rounded-full bg-white/15 px-3 py-1 text-sm">Đóng</button></div>
      {activeTool === 'music' && <div className="space-y-3">
        <div className="flex gap-2"><input className="min-w-0 flex-1 rounded-xl bg-white/10 px-3 py-2 text-white placeholder:text-white/55" value={query} maxLength={100} onChange={e => setQuery(e.target.value)} placeholder="Tìm nhạc: chill, piano…"/><button type="button" disabled={loading} onClick={searchAudio} className="rounded-xl bg-white px-3 text-black"><Search size={17}/></button></div>
        <button type="button" onClick={() => update({audioSource:'original',audioTrackId:null,audioTrackTitle:null,audioTrackUrl:null,isMuted:false})} className="rounded-lg border border-white/25 px-3 py-2 text-sm">Dùng âm thanh gốc</button>
        {loading && <p className="text-xs text-white/70">Đang tìm nhạc…</p>}{audioError && <p role="status" className="text-xs text-amber-300">{audioError}</p>}
        {hits.map(track => (
          <div key={track.id} className="flex items-center gap-2 rounded-xl bg-white/10 p-2">
            <button
              type="button"
              onClick={() => toggleTrackPreview(track)}
              className="rounded-full bg-white/15 p-2"
              aria-label={playingId === track.id ? 'Dừng nghe thử' : 'Nghe thử'}
            >
              {playingId === track.id ? <Pause size={15} /> : <Play size={15} />}
            </button>
            <audio id={'pixabay-preview-' + track.id} data-pixabay-preview src={track.previewUrl} preload="none" className="hidden"/>
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{track.title}</div><div className="text-xs text-white/60">{track.artist}</div></div>
            <button type="button" onClick={() => selectTrack(track)} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-black">Chọn</button>
          </div>
        ))}
        {selected.audioTrackTitle && <p className="text-xs text-emerald-300">Đã chọn: {selected.audioTrackTitle}</p>}
        <p className="text-[11px] text-white/60">Có sẵn nhạc mẫu miễn phí. Mỗi bài hiển thị tác giả và giấy phép; hãy giữ thông tin ghi công khi giấy phép yêu cầu.</p>
      </div>}
      {activeTool === 'trim' && (
        <div className="space-y-4">
          <style>{`
            .creator-trim-range{position:absolute;inset:0;width:100%;height:36px;margin:0;background:transparent;appearance:none;-webkit-appearance:none;pointer-events:none;touch-action:pan-y}
            .creator-trim-range::-webkit-slider-runnable-track{height:6px;background:transparent}
            .creator-trim-range::-moz-range-track{height:6px;background:transparent}
            .creator-trim-range::-webkit-slider-thumb{appearance:none;-webkit-appearance:none;width:22px;height:22px;margin-top:-8px;border:3px solid #fff;border-radius:999px;background:#0ea5e9;box-shadow:0 1px 5px #0009;pointer-events:auto;cursor:ew-resize}
            .creator-trim-range::-moz-range-thumb{width:16px;height:16px;border:3px solid #fff;border-radius:999px;background:#0ea5e9;box-shadow:0 1px 5px #0009;pointer-events:auto;cursor:ew-resize}
          `}</style>
          <div className="flex items-center justify-between gap-3 text-xs text-white/75">
            <span>Kéo hai đầu để chọn đoạn</span>
            <strong className="rounded-full bg-white/15 px-2.5 py-1 text-white">{Math.round(start)}s – {Math.round(end)}s</strong>
          </div>
          <div className="relative h-9 touch-pan-y" role="group" aria-label="Thanh kéo cắt video">
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/25" />
            <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-sky-400" style={{left: `${startPercent}%`, width: `${Math.max(0, endPercent - startPercent)}%`}} />
            <input aria-label="Điểm bắt đầu video" className="creator-trim-range" type="range" min="0" max={duration || 60} step="0.1" value={Math.min(start, duration || 60)} onChange={event => setTrimStart(event.target.value)} style={{zIndex: start > (duration - end) / 2 ? 4 : 3}} />
            <input aria-label="Điểm kết thúc video" className="creator-trim-range" type="range" min={Math.min(duration || 60, start + minDuration)} max={duration || 60} step="0.1" value={Math.min(end, duration || 60)} onChange={event => setTrimEnd(event.target.value)} style={{zIndex: 5}} />
          </div>
          <div className="flex items-center justify-between text-[11px] text-white/60"><span>0:00</span><span>{duration ? `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2,'0')}` : '--:--'}</span></div>
          <p className="text-xs text-white/70">{duration ? `Video dài ${duration.toFixed(1)} giây · Đã chọn ${(end - start).toFixed(1)} giây` : durationError ? 'Không đọc được thời lượng. Hãy chọn lại video hoặc thử tệp MP4/MOV khác.' : 'Đang tải thông tin thời lượng video…'}</p>
          {!trimValid && <p className="text-xs text-amber-300">Đoạn chọn cần dài 15–60 giây và nằm trong video gốc.</p>}
        </div>
      )}
      {activeTool === 'text' && <div className="space-y-3">
        <input className="w-full rounded-xl bg-white/10 px-3 py-2.5 text-white placeholder:text-white/50" maxLength={120} value={selected.overlayText||''} onChange={e=>update({overlayText:e.target.value})} placeholder="Nhập chữ hiển thị trên media"/>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-white/75">Font chữ
            <select className="mt-1 w-full rounded-lg bg-white/10 px-2 py-2 text-white" value={selected.overlayFont||'Roboto, Arial, sans-serif'} onChange={e=>update({overlayFont:e.target.value})}>
              <option className="text-black" value="Roboto, Arial, sans-serif">Roboto</option>
              <option className="text-black" value="Arial, Helvetica, sans-serif">Sans-serif</option>
              <option className="text-black" value="Georgia, serif">Playfair / Serif</option>
              <option className="text-black" value="'Trebuchet MS', sans-serif">Trebuchet</option>
              <option className="text-black" value="monospace">Monospace</option>
            </select>
          </label>
          <label className="text-xs text-white/75">Màu chữ
            <span className="mt-1 flex items-center gap-2 rounded-lg bg-white/10 p-1.5">
              <input aria-label="Chọn màu chữ" className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent" type="color" value={selected.overlayColor||'#ffffff'} onChange={e=>update({overlayColor:e.target.value})}/>
              <span className="text-xs">{(selected.overlayColor||'#ffffff').toUpperCase()}</span>
            </span>
          </label>
        </div>
        <p className="text-[11px] text-white/65">Kéo trực tiếp dòng chữ trên ảnh/video để đổi vị trí.</p>
      </div>}
      {activeTool === 'sticker' && <div className="space-y-3">
        {STICKER_GROUPS.map(group => <section key={group.label} className="space-y-1.5">
          <div className="text-xs font-semibold text-white/70">{group.label}</div>
          <div className="flex flex-wrap gap-1.5">{group.items.map(sticker=><button key={sticker} type="button" aria-label={'Sticker '+sticker} onClick={()=>update({sticker:selected.sticker===sticker?'':sticker})} className={`rounded-lg border px-2 py-1.5 text-xl ${selected.sticker===sticker?'border-white bg-white/20':'border-white/15 bg-white/5'}`}>{sticker}</button>)}</div>
        </section>)}
      </div>}
      {activeTool === 'filter' && <div className="flex flex-wrap gap-2">{FILTERS.map(filter=><button key={filter.id} type="button" onClick={()=>update({colorFilter:filter.id})} className={`rounded-lg border px-3 py-2 text-sm ${(selected.colorFilter||'none')===filter.id?'border-white bg-white/20':'border-white/20'}`}>{filter.label}</button>)}</div>}
      {activeTool === 'volume' && <div className="space-y-4"><label className="block text-sm">Âm lượng tiếng gốc: {selected.originalVolume??100}%<input className="mt-2 w-full" type="range" min="0" max="100" value={selected.originalVolume??100} onChange={e=>update({originalVolume:Number(e.target.value)})}/></label><label className="block text-sm">Âm lượng nhạc nền: {selected.musicVolume??30}%<input className="mt-2 w-full" type="range" min="0" max="100" value={selected.musicVolume??30} onChange={e=>update({musicVolume:Number(e.target.value)})}/></label></div>}
    </div>}
  </div>

  return <div className="mt-4 rounded-2xl border p-3 space-y-4" style={{ borderColor: 'var(--d-border)', background: 'var(--d-surface-2)' }}>
    <div className="flex items-center gap-2 font-bold"><SlidersHorizontal size={17}/> Công cụ chỉnh sửa</div>

    {isVideo && <section className="space-y-3">
      <div className="text-sm font-semibold">Cắt video (15–60 giây)</div>
      <style>{`
        .creator-trim-range-light{position:absolute;inset:0;width:100%;height:36px;margin:0;background:transparent;appearance:none;-webkit-appearance:none;pointer-events:none;touch-action:pan-y}
        .creator-trim-range-light::-webkit-slider-runnable-track{height:6px;background:transparent}
        .creator-trim-range-light::-moz-range-track{height:6px;background:transparent}
        .creator-trim-range-light::-webkit-slider-thumb{appearance:none;-webkit-appearance:none;width:22px;height:22px;margin-top:-8px;border:3px solid #fff;border-radius:999px;background:var(--d-primary);box-shadow:0 1px 5px #0004;pointer-events:auto;cursor:ew-resize}
        .creator-trim-range-light::-moz-range-thumb{width:16px;height:16px;border:3px solid #fff;border-radius:999px;background:var(--d-primary);box-shadow:0 1px 5px #0004;pointer-events:auto;cursor:ew-resize}
      `}</style>
      <div className="flex items-center justify-between gap-3 text-xs d-muted"><span>Kéo hai đầu thanh để cắt</span><strong>{Math.round(start)}s – {Math.round(end)}s</strong></div>
      <div className="relative h-9 touch-pan-y" role="group" aria-label="Thanh kéo cắt video">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full" style={{background:'var(--d-border)'}} />
        <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full" style={{left:`${startPercent}%`,width:`${Math.max(0,endPercent-startPercent)}%`,background:'var(--d-primary)'}} />
        <input aria-label="Điểm bắt đầu video" className="creator-trim-range-light" type="range" min="0" max={duration || 60} step="0.1" value={Math.min(start,duration || 60)} onChange={e=>setTrimStart(e.target.value)} style={{zIndex: start > (duration-end)/2 ? 4 : 3}} />
        <input aria-label="Điểm kết thúc video" className="creator-trim-range-light" type="range" min={Math.min(duration || 60,start+minDuration)} max={duration || 60} step="0.1" value={Math.min(end,duration || 60)} onChange={e=>setTrimEnd(e.target.value)} style={{zIndex:5}} />
      </div>
      <div className="flex justify-between text-[11px] d-muted"><span>0:00</span><span>{duration ? `${Math.floor(duration/60)}:${String(Math.floor(duration%60)).padStart(2,'0')}` : '--:--'}</span></div>
      <p className="text-xs d-muted">{duration ? `Video gốc dài ${duration.toFixed(1)} giây · Đã chọn ${(end-start).toFixed(1)} giây.` : durationError ? 'Không đọc được thời lượng. Hãy chọn lại video hoặc thử tệp MP4/MOV khác.' : 'Đang tải thông tin thời lượng video…'}</p>
      {!trimValid && <p className="text-xs" style={{color:'var(--d-danger)'}}>Chọn đoạn nằm trong video, dài ít nhất 15 giây và không quá 60 giây.</p>}
    </section>}

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
