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
const STICKERS = ['✨', '❤️', '🔥', '😂', '🎉', '🌿']

export function CreatorMediaTools({ file, settings, onChange, mode = 'post' }) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState([])
  const [loading, setLoading] = useState(false)
  const [audioError, setAudioError] = useState('')
  const [playingId, setPlayingId] = useState('')
  const [activeTool, setActiveTool] = useState('music')
  const [duration, setDuration] = useState(0)
  const selected = settings || {}
  const update = patch => onChange?.({ ...selected, ...patch })
  const isVideo = file?.type?.startsWith('video/')

  useEffect(() => {
    if (!file || !isVideo) { setDuration(0); return }
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      const actualDuration = Number.isFinite(video.duration) ? video.duration : 0
      setDuration(actualDuration)
      const currentEnd = Number(settings?.trimEnd || 60)
      if (actualDuration > 0 && (currentEnd > actualDuration || currentEnd > 60)) {
        onChange?.({ ...settings, trimEnd: Math.floor(Math.min(60, actualDuration)) })
      }
      URL.revokeObjectURL(url)
    }
    video.onerror = () => URL.revokeObjectURL(url)
    video.src = url
    return () => { video.src = ''; URL.revokeObjectURL(url) }
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

  const selectTrack = track => update({
    audioSource: 'pixabay',
    audioTrackId: track.id,
    audioTrackTitle: track.title,
    audioTrackArtist: track.artist,
    audioTrackUrl: track.previewUrl,
    audioTrackPageUrl: track.pageUrl,
    isMuted: false,
  })

  const start = Number(selected.trimStart || 0)
  const maxStart = Math.max(0, duration - 15)
  const end = Number(selected.trimEnd || Math.min(60, duration || 60))
  const trimValid = !isVideo || (duration > 0 && end - start >= 15 && end - start <= 60 && end <= duration)

  if (mode === 'fullscreen') return <div className="absolute inset-0 z-20 pointer-events-none">
    <div className="absolute top-[max(18px,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 pointer-events-auto">
      <button type="button" onClick={() => setActiveTool(activeTool === 'music' ? '' : 'music')} className="flex items-center gap-2 rounded-full bg-black/70 px-5 py-3 text-sm font-bold text-white shadow-lg border border-white/25"><Music2 size={18}/> Thêm âm thanh <span className="text-[10px] text-white/70">v2.0 Fullscreen</span></button>
    </div>
    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-4 pointer-events-auto">
      {[
        {id:'trim', label:'Cắt', icon:<Scissors size={22}/>},
        {id:'text', label:'Chữ', icon:<Type size={22}/>},
        {id:'sticker', label:'Sticker', icon:<Sticker size={22}/>},
        {id:'filter', label:'Bộ lọc', icon:<Palette size={22}/>},
        {id:'volume', label:'Âm lượng', icon:<Volume2 size={22}/>},
      ].map(item => <button key={item.id} type="button" onClick={() => setActiveTool(activeTool === item.id ? '' : item.id)} className={`flex w-[58px] flex-col items-center gap-1 rounded-xl px-1 py-2 text-white drop-shadow-lg ${activeTool === item.id ? 'bg-white/30 ring-1 ring-white' : 'bg-black/35'}`}><span>{item.icon}</span><span className="text-[10px] font-semibold">{item.label}</span></button>)}
    </div>
    {activeTool && <div className="absolute bottom-[max(96px,calc(env(safe-area-inset-bottom)+88px))] left-3 right-3 max-h-[42dvh] overflow-y-auto rounded-2xl border border-white/20 bg-black/85 p-4 text-white shadow-2xl pointer-events-auto">
      <div className="mb-3 flex items-center justify-between"><strong>{({music:'Thêm âm thanh · Pixabay',trim:'Cắt video (15–60 giây)',text:'Chèn chữ',sticker:'Sticker',filter:'Bộ lọc màu',volume:'Chỉnh âm lượng'})[activeTool]}</strong><button type="button" onClick={() => setActiveTool('')} className="rounded-full bg-white/15 px-3 py-1 text-sm">Đóng</button></div>
      {activeTool === 'music' && <div className="space-y-3">
        <div className="flex gap-2"><input className="min-w-0 flex-1 rounded-xl bg-white/10 px-3 py-2 text-white placeholder:text-white/55" value={query} maxLength={100} onChange={e => setQuery(e.target.value)} placeholder="Tìm nhạc: chill, piano…"/><button type="button" disabled={loading} onClick={searchAudio} className="rounded-xl bg-white px-3 text-black"><Search size={17}/></button></div>
        <button type="button" onClick={() => update({audioSource:'original',audioTrackId:null,audioTrackTitle:null,audioTrackUrl:null,isMuted:false})} className="rounded-lg border border-white/25 px-3 py-2 text-sm">Dùng âm thanh gốc</button>
        {loading && <p className="text-xs text-white/70">Đang tìm nhạc…</p>}{audioError && <p role="status" className="text-xs text-amber-300">{audioError}</p>}
        {hits.map(track => <div key={track.id} className="flex items-center gap-2 rounded-xl bg-white/10 p-2"><button type="button" onClick={() => {const audio=document.getElementById('pixabay-preview-'+track.id);if(!audio)return;if(playingId===track.id){audio.pause();setPlayingId('')}else{document.querySelectorAll('[data-pixabay-preview]').forEach(el=>el.pause());audio.play().then(()=>setPlayingId(track.id)).catch(()=>setAudioError('Không phát được bản xem trước này.'))}}} className="rounded-full bg-white/15 p-2"><Play size={15}/></button><audio id={'pixabay-preview-'+track.id} data-pixabay-preview src={track.previewUrl} preload="none" className="hidden"/><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{track.title}</div><div className="text-xs text-white/60">{track.artist}</div></div><button type="button" onClick={() => selectTrack(track)} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-black">Chọn</button></div>)}
        {selected.audioTrackTitle && <p className="text-xs text-emerald-300">Đã chọn: {selected.audioTrackTitle}</p>}
        <p className="text-[11px] text-white/60">Nguồn Pixabay · Kiểm tra quyền sử dụng của bản nhạc trước khi đăng.</p>
      </div>}
      {activeTool === 'trim' && <div className="space-y-3"><div className="grid grid-cols-2 gap-3"><label className="text-xs text-white/75">Bắt đầu (giây)<input className="mt-1 w-full rounded-lg bg-white/10 p-2 text-white" type="number" min="0" max={maxStart} value={selected.trimStart ?? 0} onChange={e=>update({trimStart:Math.max(0,Number(e.target.value)||0})}/></label><label className="text-xs text-white/75">Kết thúc (giây)<input className="mt-1 w-full rounded-lg bg-white/10 p-2 text-white" type="number" min="15" max={Math.min(60,duration||60)} value={selected.trimEnd ?? Math.min(60,duration||60)} onChange={e=>update({trimEnd:Math.max(0,Number(e.target.value)||0})}/></label></div><p className="text-xs text-white/65">{duration ? `Video dài ${Math.round(duration)} giây · Đoạn chọn ${Math.max(0,end-start)} giây` : 'Đang đọc thời lượng video…'}</p>{!trimValid && <p className="text-xs text-amber-300">Đoạn video phải dài 15–60 giây và nằm trong video gốc.</p>}</div>}
      {activeTool === 'text' && <input className="w-full rounded-xl bg-white/10 px-3 py-3 text-white placeholder:text-white/50" maxLength={120} value={selected.overlayText||''} onChange={e=>update({overlayText:e.target.value})} placeholder="Nhập chữ hiển thị trên media"/>}
      {activeTool === 'sticker' && <div className="flex flex-wrap gap-2">{STICKERS.map(sticker=><button key={sticker} type="button" onClick={()=>update({sticker:selected.sticker===sticker?'':sticker})} className={`rounded-xl border px-3 py-2 text-2xl ${selected.sticker===sticker?'border-white bg-white/20':'border-white/20'}`}>{sticker}</button>)}</div>}
      {activeTool === 'filter' && <div className="flex flex-wrap gap-2">{FILTERS.map(filter=><button key={filter.id} type="button" onClick={()=>update({colorFilter:filter.id})} className={`rounded-lg border px-3 py-2 text-sm ${(selected.colorFilter||'none')===filter.id?'border-white bg-white/20':'border-white/20'}`}>{filter.label}</button>)}</div>}
      {activeTool === 'volume' && <div className="space-y-4"><label className="block text-sm">Âm lượng tiếng gốc: {selected.originalVolume??100}%<input className="mt-2 w-full" type="range" min="0" max="100" value={selected.originalVolume??100} onChange={e=>update({originalVolume:Number(e.target.value)})}/></label><label className="block text-sm">Âm lượng nhạc nền: {selected.musicVolume??30}%<input className="mt-2 w-full" type="range" min="0" max="100" value={selected.musicVolume??30} onChange={e=>update({musicVolume:Number(e.target.value)})}/></label></div>}
    </div>}
  </div>

  return <div className="mt-4 rounded-2xl border p-3 space-y-4" style={{ borderColor: 'var(--d-border)', background: 'var(--d-surface-2)' }}>
    <div className="flex items-center gap-2 font-bold"><SlidersHorizontal size={17}/> Công cụ chỉnh sửa</div>

    {isVideo && <section className="space-y-2">
      <div className="text-sm font-semibold">Cắt video (15–60 giây)</div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs d-muted">Bắt đầu (giây)
          <input className="d-input mt-1 w-full" type="number" min="0" max={maxStart} step="1" value={selected.trimStart ?? 0} onChange={e => update({ trimStart: Math.max(0, Number(e.target.value) || 0) })}/>
        </label>
        <label className="text-xs d-muted">Kết thúc (giây)
          <input className="d-input mt-1 w-full" type="number" min="15" max={Math.min(60, duration || 60)} step="1" value={selected.trimEnd ?? Math.min(60, duration || 60)} onChange={e => update({ trimEnd: Math.max(0, Number(e.target.value) || 0) })}/>
        </label>
      </div>
      <p className="text-xs d-muted">{duration ? `Video gốc dài ${Math.round(duration)} giây. Đoạn chọn: ${Math.max(0, end - start)} giây.` : 'Đang đọc thời lượng video…'} Cắt thực tế cần được xử lý khi xuất media.</p>
      {!trimValid && <p className="text-xs" style={{ color: 'var(--d-danger)' }}>Chọn đoạn nằm trong video, dài ít nhất 15 giây và không quá 60 giây.</p>}
    </section>}

    <section className="space-y-2">
      <div className="text-sm font-semibold">Âm thanh</div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => update({ audioSource: 'original', audioTrackId: null, audioTrackTitle: null, audioTrackUrl: null, isMuted: false })} className="rounded-xl border px-3 py-2 text-sm font-semibold" style={{ borderColor: selected.audioSource !== 'pixabay' ? 'var(--d-primary)' : 'var(--d-border)', background: selected.audioSource !== 'pixabay' ? 'var(--d-primary-soft)' : 'var(--d-surface)' }}>Âm thanh gốc</button>
        <button type="button" onClick={() => { update({ audioSource: 'pixabay' }); searchAudio() }} className="rounded-xl border px-3 py-2 text-sm font-semibold" style={{ borderColor: selected.audioSource === 'pixabay' ? 'var(--d-primary)' : 'var(--d-border)', background: selected.audioSource === 'pixabay' ? 'var(--d-primary-soft)' : 'var(--d-surface)' }}><Music2 size={15} className="inline mr-1"/>Nhạc Pixabay</button>
      </div>
      <label className="block text-xs d-muted">Âm lượng tiếng gốc: {selected.originalVolume ?? 100}%
        <input className="w-full mt-1" type="range" min="0" max="100" value={selected.originalVolume ?? 100} onChange={e => update({ originalVolume: Number(e.target.value) })}/>
      </label>
      <label className="block text-xs d-muted">Âm lượng nhạc nền: {selected.musicVolume ?? 30}%
        <input className="w-full mt-1" type="range" min="0" max="100" value={selected.musicVolume ?? 30} onChange={e => update({ musicVolume: Number(e.target.value) })}/>
      </label>
      {selected.audioTrackTitle && <div className="rounded-xl p-2 text-sm" style={{ background: 'var(--d-surface)' }}><div className="font-semibold">{selected.audioTrackTitle}</div><div className="text-xs d-muted">{selected.audioTrackArtist || 'Pixabay'}</div><a className="text-xs underline" href={selected.audioTrackPageUrl || 'https://pixabay.com/'} target="_blank" rel="noreferrer">Nguồn Pixabay</a></div>}
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
