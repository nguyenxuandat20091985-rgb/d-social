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
    <div className="absolute left-4 top-[max(12px,env(safe-area-inset-top))] pointer-events-auto">
      {activeTool !== '' && activeTool !== 'trim' && <button type="button" onClick={() => setActiveTool('')} className="rounded-full bg-black/55 px-3 py-2 text-xs font-semibold text-white">Đóng công cụ</button>}
    </div>
    {activeTool === 'adjust' && <div
      aria-label="Kéo một ngón để di chuyển khung hình; chụm hoặc tách hai ngón để phóng to, thu nhỏ"
      className="absolute left-0 top-0 z-10 h-[55dvh] w-full touch-none pointer-events-auto"
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
    {activeTool && activeTool !== 'trim' && <div className="absolute z-20 bottom-[calc(max(88px,env(safe-area-inset-bottom)+82px)+225px)] left-3 right-3 mx-auto max-h-[min(42dvh,calc(100dvh-180px))] w-auto max-w-md overflow-y-auto rounded-t-3xl rounded-b-2xl border border-white/20 bg-black/90 p-3.5 text-white shadow-2xl backdrop-blur-md pointer-events-auto">
      <div className="sticky top-0 z-10 -mx-1 mb-3 flex items-center justify-between gap-3 border-b border-white/10 bg-black/95 px-1 pb-3 pt-1"><div><div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/30"/><strong>{({music:'Âm thanh',theme:'Chỉnh sửa',text:'Văn bản',sticker:'Nhãn dán',overlay:'Lớp phủ',effects:'Hiệu ứng',filter:'Bộ lọc',adjust:'Tùy chỉnh AI',ratio:'Tỷ lệ khung hình',background:'Nền video',avatar:'Chỉnh sửa AI',volume:'Chỉnh âm lượng'})[activeTool]}</strong></div><button type="button" onClick={() => setActiveTool('')} className="rounded-full bg-white/15 px-3 py-1 text-sm">Đóng</button></div>
      {activeTool === 'music' && <div className="space-y-3">
        <div className="flex gap-2"><input className="min-w-0 flex-1 rounded-xl bg-white/10 px-3 py-2 text-white placeholder:text-white/55" value={query} maxLength={100} onChange={e => setQuery(e.target.value)} placeholder="Tìm nhạc: chill, piano…"/><button type="button" disabled={loading} onClick={searchAudio} className="rounded-xl bg-white px-3 text-black"><Search size={17}/></button></div>
        <button type="button" onClick={() => update({audioSource:'original',audioTrackId:null,audioTrackTitle:null,audioTrackUrl:null,isMuted:false})} className="rounded-lg border border-white/25 px-3 py-2 text-sm">Dùng âm thanh gốc</button>
        <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => update({originalVolume:Number(selected.originalVolume??100)>0?0:100})} className="rounded-lg border border-white/20 px-3 py-2 text-xs">{Number(selected.originalVolume??100)>0?'Tắt tiếng gốc':'Bật tiếng gốc'}</button><button type="button" disabled className="cursor-not-allowed rounded-lg border border-white/10 px-3 py-2 text-xs text-white/35">Trích xuất âm thanh · Chưa bật</button><button type="button" disabled className="col-span-2 cursor-not-allowed rounded-lg border border-white/10 px-3 py-2 text-xs text-white/35">Ghi âm voiceover · Chưa có module ghi âm</button></div>
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
        <button type="button" disabled className="cursor-not-allowed rounded-lg border border-white/10 px-3 py-2 text-xs text-white/35">Ghép hình · Chưa bật</button>
      </div>}

      {activeTool === 'theme' && <div className="space-y-3"><p className="text-xs text-white/60">Các chỉnh sửa hỗ trợ sẽ áp dụng lên bản xem trước và file xuất. Điều chỉnh AI tự động chưa có dịch vụ kết nối; các thanh kéo bên dưới là điều chỉnh thủ công.</p><button type="button" onClick={() => setActiveTool('trim')} className="flex w-full items-center gap-2 rounded-xl border border-amber-300/35 bg-amber-300/10 px-3 py-2.5 text-sm font-semibold text-amber-100"><Scissors size={16}/> Cắt trực tiếp trên Timeline</button><label className="block text-xs">Tốc độ phát khi xem trước và xuất file được khóa ở 1.0× để giữ đúng thời gian gốc.</label><label className="block text-xs">Xoay: {selected.rotation||0}°<input className="mt-2 w-full" type="range" min="-180" max="180" step="90" value={selected.rotation||0} onChange={e=>update({rotation:Number(e.target.value)})}/></label><div className="flex flex-wrap gap-2">{FILTERS.map(filter=><button key={filter.id} type="button" onClick={() => update({colorFilter:filter.id})} className={`rounded-lg border px-3 py-2 text-sm ${(selected.colorFilter||'none')===filter.id?'border-white bg-white/20':'border-white/20'}`}>{filter.label}</button>)}</div><div className="grid grid-cols-2 gap-2"><button type="button" disabled className="cursor-not-allowed rounded-lg border border-white/10 px-3 py-2 text-xs text-white/35">Tách clip · Chưa bật</button><button type="button" disabled className="cursor-not-allowed rounded-lg border border-white/10 px-3 py-2 text-xs text-white/35">Cắt bằng AI · Chưa có dịch vụ</button></div><p className="text-[11px] text-white/55">Tách clip và cắt bằng AI cần bộ xử lý clip riêng; em không giả lập hai chức năng này như thể đã hoạt động.</p></div>}{activeTool === 'filter' && <div className="flex flex-wrap gap-2">{FILTERS.map(filter=><button key={filter.id} type="button" onClick={()=>update({colorFilter:filter.id})} className={`rounded-lg border px-3 py-2 text-sm ${(selected.colorFilter||'none')===filter.id?'border-white bg-white/20':'border-white/20'}`}>{filter.label}</button>)}</div>}
      {activeTool === 'adjust' && <div className="space-y-3">
        <section className="space-y-3 rounded-xl border border-white/15 bg-white/5 p-3">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-sm font-semibold">Thu phóng khung hình</p><p className="text-[11px] text-white/55">Áp dụng cho cả ảnh và video · 1× đến 3×</p></div>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Thu nhỏ" disabled={Number(selected.zoom ?? 1) <= 1} onClick={() => update({zoom:Math.max(1,Math.round((Number(selected.zoom ?? 1)-0.1)*10)/10)})} className="grid h-9 w-9 place-items-center rounded-lg border border-white/20 text-lg disabled:opacity-35">−</button>
              <span className="w-10 text-center text-sm font-bold tabular-nums">{Number(selected.zoom ?? 1).toFixed(1)}×</span>
              <button type="button" aria-label="Phóng to" disabled={Number(selected.zoom ?? 1) >= 3} onClick={() => update({zoom:Math.min(3,Math.round((Number(selected.zoom ?? 1)+0.1)*10)/10)})} className="grid h-9 w-9 place-items-center rounded-lg border border-white/20 text-lg disabled:opacity-35">+</button>
            </div>
          </div>
          <input aria-label="Mức thu phóng" className="w-full" type="range" min="1" max="3" step="0.1" value={Math.max(1,Math.min(3,Number(selected.zoom ?? 1)))} onChange={e=>update({zoom:Number(e.target.value)})}/>
          <label className="block text-xs">Di chuyển ngang: {Number(selected.panX ?? 0)}%
            <input aria-label="Di chuyển ngang khung hình" className="mt-1 w-full" type="range" min="-50" max="50" step="1" value={Number(selected.panX ?? 0)} onChange={e=>update({panX:Number(e.target.value)})}/>
          </label>
          <label className="block text-xs">Di chuyển dọc: {Number(selected.panY ?? 0)}%
            <input aria-label="Di chuyển dọc khung hình" className="mt-1 w-full" type="range" min="-50" max="50" step="1" value={Number(selected.panY ?? 0)} onChange={e=>update({panY:Number(e.target.value)})}/>
          </label>
          <button type="button" onClick={()=>update({zoom:1,panX:0,panY:0})} className="w-full rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold">Đặt lại zoom và vị trí</button>
        </section>

        {[['brightness','Độ sáng',-50,50,0],['contrast','Độ tương phản',50,180,100],['saturation','Bão hòa',0,200,100],['hue','HSL / Sắc độ',-180,180,0]].map(([key,label,min,max,initial])=><label key={key} className="block text-xs">{label}: {Number(selected[key] ?? initial)}{key==='hue'?'°':'%'}<input className="mt-1.5 w-full" type="range" min={min} max={max} value={selected[key] ?? initial} onChange={e=>update({[key]:Number(e.target.value)})}/></label>)}
        <button type="button" onClick={()=>update({brightness:0,contrast:100,saturation:100,hue:0})} className="rounded-lg border border-white/20 px-3 py-2 text-xs">Đặt lại màu</button>
        <p className="text-[11px] text-white/55">AI tự động chưa được kết nối; các thanh kéo độ sáng, tương phản, bão hòa và sắc độ bên trên hoạt động thủ công.</p>
      </div>}
      {activeTool === 'ratio' && <div className="space-y-3"><p className="text-xs text-white/60">Chọn tỷ lệ đầu ra và cách lấp đầy khung hình.</p><div className="grid grid-cols-4 gap-2">{['9:16','16:9','1:1','4:5'].map(ratio=><button key={ratio} type="button" onClick={()=>update({aspectRatio:ratio})} className={`rounded-lg border px-2 py-3 text-sm font-semibold ${(selected.aspectRatio||'9:16')===ratio?'border-sky-300 bg-sky-400/20 text-sky-100':'border-white/20'}`}>{ratio}</button>)}</div><div className="flex gap-2"><button type="button" onClick={()=>update({cropMode:'contain'})} className={`flex-1 rounded-lg border px-3 py-2 text-xs ${(selected.cropMode||'contain')==='contain'?'border-white bg-white/15':'border-white/20'}`}>Vừa khung</button><button type="button" onClick={()=>update({cropMode:'cover'})} className={`flex-1 rounded-lg border px-3 py-2 text-xs ${selected.cropMode==='cover'?'border-white bg-white/15':'border-white/20'}`}>Lấp đầy / Crop</button></div></div>}
      {activeTool === 'background' && <div className="space-y-3"><p className="text-xs text-white/60">Chọn màu nền của khung xem trước và file xuất.</p><div className="flex flex-wrap gap-2">{[{value:'#000000',label:'Đen'},{value:'#ffffff',label:'Trắng'},{value:'#172554',label:'Xanh đậm'},{value:'#7c2d12',label:'Nâu'},{value:'#581c87',label:'Tím'},{value:'#166534',label:'Xanh lá'}].map(bg=><button key={bg.value} type="button" onClick={()=>update({backgroundColor:bg.value})} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs ${(selected.backgroundColor||'#000000')===bg.value?'border-white':'border-white/20'}`}><span className="h-4 w-4 rounded-full border border-white/30" style={{background:bg.value}}/>{bg.label}</button>)}</div><label className="flex items-center gap-2 text-xs">Màu tùy chỉnh <input type="color" value={selected.backgroundColor||'#000000'} onChange={e=>update({backgroundColor:e.target.value})} className="h-9 w-12 rounded bg-transparent"/></label><div className="flex gap-2"><button type="button" disabled className="cursor-not-allowed rounded-lg border border-white/10 px-3 py-2 text-xs text-white/35">Nền mờ · Chưa bật</button><button type="button" disabled className="cursor-not-allowed rounded-lg border border-white/10 px-3 py-2 text-xs text-white/35">Mẫu nền · Chưa có thư viện</button></div><p className="text-[11px] text-white/55">Nền mờ và thư viện mẫu nền chưa được nối với bộ xử lý nền riêng.</p></div>}
      {activeTool === 'overlay' && <div className="space-y-2"><p className="text-sm font-semibold">Lớp phủ / Picture-in-Picture</p><p className="text-xs text-white/65">Chức năng nhập video/ảnh lớp phủ chưa được nối vào luồng kết xuất hiện tại. Em không bật nút giả để tránh xuất file thiếu lớp.</p><button type="button" onClick={()=>setActiveTool('text')} className="rounded-lg border border-white/20 px-3 py-2 text-xs">Dùng lớp chữ / sticker đang hỗ trợ</button></div>}
      {activeTool === 'effects' && <div className="space-y-3"><p className="text-xs text-white/60">Hiệu ứng màu áp dụng ngay; chuyển cảnh và hiệu ứng cơ thể cần pipeline nhiều clip/AI riêng.</p><div className="flex flex-wrap gap-2">{FILTERS.filter(x=>x.id!=='none').map(filter=><button key={filter.id} type="button" onClick={()=>update({colorFilter:filter.id})} className={`rounded-lg border px-3 py-2 text-sm ${selected.colorFilter===filter.id?'border-white bg-white/20':'border-white/20'}`}>{filter.label}</button>)}</div><div className="flex flex-wrap gap-2"><button type="button" disabled className="cursor-not-allowed rounded-lg border border-white/10 px-3 py-2 text-xs text-white/35">Hiệu ứng cơ thể · Chưa bật</button><button type="button" disabled className="cursor-not-allowed rounded-lg border border-white/10 px-3 py-2 text-xs text-white/35">Chuyển cảnh · Cần nhiều clip</button></div><p className="text-[11px] text-white/55">Chuyển cảnh / hiệu ứng cơ thể: chưa khả dụng trong bộ xuất một clip.</p></div>}
      {activeTool === 'avatar' && <div className="space-y-2"><p className="text-sm font-semibold">Ảnh đại diện AI / Nhân vật ảo</p><p className="text-xs text-white/65">Chưa có dịch vụ tạo avatar AI kết nối với D-Social. Mục này được hiển thị rõ trạng thái thay vì tạo ảnh giả hoặc báo thành công sai.</p><button type="button" disabled className="w-full cursor-not-allowed rounded-lg border border-white/10 px-3 py-2 text-xs text-white/35">Tạo Avatar AI · Chưa có dịch vụ</button></div>}
      {activeTool === 'text' && <div className="mt-3 border-t border-white/10 pt-3"><p className="mb-2 text-xs font-semibold">Mẫu chữ nghệ thuật</p><div className="flex flex-wrap gap-2">{[{label:'Đậm',font:'Roboto, Arial, sans-serif',color:'#ffffff'},{label:'Cổ điển',font:'Georgia, serif',color:'#ffe4b5'},{label:'Neon',font:'monospace',color:'#67e8f9'}].map(preset=><button key={preset.label} type="button" onClick={()=>update({overlayFont:preset.font,overlayColor:preset.color,overlayText:selected.overlayText||preset.label})} className="rounded-lg border border-white/20 px-3 py-2 text-xs">{preset.label}</button>)}</div><button type="button" disabled className="mt-2 w-full cursor-not-allowed rounded-lg border border-white/10 px-3 py-2 text-xs text-white/35">Phụ đề tự động · Chưa có dịch vụ nhận dạng giọng nói</button><p className="mt-2 text-[11px] text-white/55">Phụ đề tự động cần dịch vụ nhận dạng giọng nói; hiện chưa được kết nối.</p></div>}
      {activeTool === 'volume' && <div className="space-y-4"><label className="block text-sm">Âm lượng tiếng gốc: {selected.originalVolume??100}%<input className="mt-2 w-full" type="range" min="0" max="100" value={selected.originalVolume??100} onChange={e=>update({originalVolume:Number(e.target.value)})}/></label><label className="block text-sm">Âm lượng nhạc nền: {selected.musicVolume??30}%<input className="mt-2 w-full" type="range" min="0" max="100" value={selected.musicVolume??30} onChange={e=>update({musicVolume:Number(e.target.value)})}/></label></div>}
    </div>}
    {(isVideo || (files || []).some(f => f && f.type && (f.type.startsWith('image/') || f.type.startsWith('video/')))) && <div className="absolute bottom-[max(88px,calc(env(safe-area-inset-bottom)+82px))] left-0 right-0 z-30 pointer-events-auto">
      <VideoTimelineEditor file={file} files={files} storyMode={storyMode} onPublishStory={onPublishStory} onContinuePost={onContinuePost} onCloseEditor={onCloseEditor} settings={selected} onChange={onChange} videoRef={videoRef} isPlaying={isPlaying} onTogglePlayback={onTogglePlayback} trimModeActive={activeTool === 'trim'} onOpenTool={tool => { if (tool === 'trim') { setActiveTool('trim'); return } setActiveTool(current => current === tool ? '' : tool); if (tool === 'music' && !hits.length && !loading) searchAudio() }} />
    </div>}
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
