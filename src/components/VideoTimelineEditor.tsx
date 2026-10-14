// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AudioLines, Music2, Pause, Play, Volume2, VolumeX } from 'lucide-react'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const clock = (seconds, tenths = false) => {
  const safe = Math.max(0, Number(seconds) || 0)
  const mins = Math.floor(safe / 60)
  const secs = Math.floor(safe % 60)
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}${tenths ? '.' + Math.floor((safe % 1) * 10) : ''}`
}

async function seekTo(video, time) {
  if (!video || !Number.isFinite(time)) return
  if (Math.abs(video.currentTime - time) < 0.04) return
  await new Promise(resolve => {
    let timer
    const done = () => {
      clearTimeout(timer)
      video.removeEventListener('seeked', done)
      resolve()
    }
    video.addEventListener('seeked', done, { once: true })
    timer = setTimeout(done, 1200)
    try { video.currentTime = time } catch { done() }
  })
}

export function VideoTimelineEditor({ file, settings, onChange, videoRef, isPlaying, onTogglePlayback, onOpenTool }) {
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [thumbnails, setThumbnails] = useState([])
  const trackRef = useRef(null)
  const dragRef = useRef(null)
  const selected = settings || {}
  const update = patch => onChange?.({ ...selected, ...patch })
  const start = clamp(Number(selected.trimStart) || 0, 0, Math.max(0, duration))
  const end = clamp(Number(selected.trimEnd) || Math.min(60, duration || 60), start, Math.min(60, duration || 60))
  const minClip = Math.min(15, duration || 15)
  const startPct = duration > 0 ? start / duration * 100 : 0
  const endPct = duration > 0 ? end / duration * 100 : 100
  const playPct = duration > 0 ? clamp(currentTime / duration * 100, 0, 100) : 0
  const clipDuration = Math.max(0, end - start)

  useEffect(() => {
    const video = videoRef?.current
    if (!video || !file?.type?.startsWith('video/')) return
    const sync = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) setDuration(video.duration)
      setCurrentTime(Number(video.currentTime) || 0)
    }
    video.addEventListener('loadedmetadata', sync)
    video.addEventListener('durationchange', sync)
    video.addEventListener('timeupdate', sync)
    video.addEventListener('seeked', sync)
    sync()
    return () => {
      video.removeEventListener('loadedmetadata', sync)
      video.removeEventListener('durationchange', sync)
      video.removeEventListener('timeupdate', sync)
      video.removeEventListener('seeked', sync)
    }
  }, [file, videoRef])

  useEffect(() => {
    if (!file || !file.type.startsWith('video/')) { setThumbnails([]); return }
    let cancelled = false
    const url = URL.createObjectURL(file)
    const source = document.createElement('video')
    source.preload = 'metadata'
    source.muted = true
    source.playsInline = true
    source.src = url
    const frames = []
    const makeFrames = async () => {
      try {
        await new Promise((resolve, reject) => {
          source.onloadedmetadata = resolve
          source.onerror = () => reject(new Error('metadata'))
          source.load()
        })
        const total = Number(source.duration)
        if (!Number.isFinite(total) || total <= 0) throw new Error('duration')
        if (!cancelled) setDuration(total)
        const canvas = document.createElement('canvas')
        canvas.width = 96
        canvas.height = 144
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const count = 9
        for (let i = 0; i < count; i += 1) {
          if (cancelled) return
          const target = Math.min(Math.max(0, total - 0.08), total * (i / count) + Math.min(0.08, total / 100))
          await new Promise(resolve => {
            let timer
            const done = () => {
              clearTimeout(timer)
              source.removeEventListener('seeked', done)
              resolve()
            }
            source.addEventListener('seeked', done, { once: true })
            timer = setTimeout(done, 900)
            try { source.currentTime = target } catch { done() }
          })
          if (cancelled) return
          try {
            const ratio = Math.max(canvas.width / (source.videoWidth || 1), canvas.height / (source.videoHeight || 1))
            const w = canvas.width / ratio
            const h = canvas.height / ratio
            ctx.fillStyle = '#101114'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(source, ((source.videoWidth || w) - w) / 2, ((source.videoHeight || h) - h) / 2, w, h, 0, 0, canvas.width, canvas.height)
            frames.push(canvas.toDataURL('image/jpeg', 0.58))
            if (!cancelled) setThumbnails([...frames])
          } catch { /* A frame may not be exportable on every mobile browser. */ }
        }
      } catch {
        if (!cancelled) setThumbnails([])
      } finally {
        source.pause()
        source.removeAttribute('src')
        source.load()
        URL.revokeObjectURL(url)
      }
    }
    makeFrames()
    return () => { cancelled = true; source.onloadedmetadata = null; source.onerror = null; source.pause(); source.removeAttribute('src'); source.load(); URL.revokeObjectURL(url) }
  }, [file])

  const seekFromPointer = useCallback((event, mode) => {
    const bounds = trackRef.current?.getBoundingClientRect()
    if (!bounds || !duration) return
    const percent = clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
    const time = percent * duration
    if (mode === 'start') {
      const next = clamp(time, 0, Math.max(0, end - minClip))
      update({ trimStart: next, trimEnd: end })
    } else if (mode === 'end') {
      const next = clamp(time, start + minClip, Math.min(duration, start + 60))
      update({ trimStart: start, trimEnd: next })
    } else {
      const video = videoRef?.current
      if (video) {
        try { video.currentTime = time } catch {}
        setCurrentTime(time)
      }
    }
  }, [duration, end, minClip, onChange, selected, start, videoRef])

  const beginDrag = (event, mode) => {
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = mode
    event.currentTarget.setPointerCapture?.(event.pointerId)
    seekFromPointer(event, mode)
  }
  const moveDrag = event => {
    if (dragRef.current) seekFromPointer(event, dragRef.current)
  }
  const endDrag = () => { dragRef.current = null }

  const waveform = useMemo(() => Array.from({ length: 72 }, (_, i) => 18 + ((i * 29 + (selected.audioTrackTitle || 'D-Social').length * 17 + (i % 9) * 13) % 78)), [selected.audioTrackTitle])
  const originalOn = Number(selected.originalVolume ?? 100) > 0
  const toggleOriginal = () => update({ originalVolume: originalOn ? 0 : 100 })

  return <section className="pointer-events-auto mx-2 mb-2 rounded-[20px] border border-white/15 bg-[#101115]/95 p-3 text-white shadow-[0_16px_50px_rgba(0,0,0,.5)] backdrop-blur-xl" aria-label="Timeline dựng video">
    <div className="mb-2 flex items-center justify-between gap-2">
      <button type="button" onClick={onTogglePlayback} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-black shadow" aria-label={isPlaying ? 'Tạm dừng' : 'Phát'}>
        {isPlaying ? <Pause size={17} fill="currentColor"/> : <Play size={17} fill="currentColor" className="ml-0.5"/>}
      </button>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[12px] font-semibold tracking-wide">{clock(Math.max(0, currentTime - start), true)} <span className="text-white/45">/ {clock(clipDuration)}</span></div>
        <div className="mt-0.5 text-[10px] text-white/45">{duration ? `Video gốc ${clock(duration)} · Kéo mép vàng để cắt` : 'Đang tạo dải khung hình…'}</div>
      </div>
      <button type="button" onClick={() => onOpenTool?.('music')} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-sky-300/40 bg-sky-400/15 px-3 text-[11px] font-semibold text-sky-100">
        <Music2 size={14}/>{selected.audioTrackTitle ? 'Đổi nhạc' : '+ Thêm nhạc'}
      </button>
    </div>

    <div className="mb-1.5 flex items-center gap-2">
      <button type="button" onClick={toggleOriginal} aria-pressed={originalOn} className={`flex w-[82px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-[10px] font-semibold ${originalOn ? 'border-emerald-300/35 bg-emerald-400/10 text-emerald-100' : 'border-white/10 bg-white/5 text-white/45'}`}>
        {originalOn ? <Volume2 size={16}/> : <VolumeX size={16}/>}<span>Âm thanh gốc</span><span className="text-[9px]">{originalOn ? 'BẬT' : 'TẮT'}</span>
      </button>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-[.12em] text-white/45"><span>VIDEO</span><span>{clock(start)}–{clock(end)}</span></div>
        <div ref={trackRef} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onClick={event => { if (!dragRef.current && !event.target.closest('[role="slider"]')) seekFromPointer(event, 'playhead') }} className="relative h-[56px] select-none overflow-visible rounded-md bg-[#24262d] touch-pan-y">
          <div className="absolute inset-0 flex overflow-hidden rounded-md">
            {thumbnails.length ? thumbnails.map((src, index) => <img key={index} src={src} draggable="false" alt="" className="h-full min-w-0 flex-1 object-cover" />) : Array.from({ length: 9 }, (_, index) => <div key={index} className="h-full min-w-0 flex-1 animate-pulse border-r border-white/10 bg-gradient-to-b from-[#30333c] to-[#1a1c21]"/>)}
          </div>
          <div className="absolute inset-y-0 left-0 rounded-l-md bg-black/55" style={{ width: `${startPct}%` }}/>
          <div className="absolute inset-y-0 right-0 rounded-r-md bg-black/55" style={{ width: `${Math.max(0, 100-endPct)}%` }}/>
          <div className="absolute inset-y-[-3px] rounded-md border-[2px] border-amber-300 shadow-[0_0_0_1px_rgba(0,0,0,.5)]" style={{ left: `${startPct}%`, width: `${Math.max(0, endPct-startPct)}%`, pointerEvents:'none' }}/>
          <div onPointerDown={event => beginDrag(event, 'start')} role="slider" aria-label="Đầu cắt bắt đầu" aria-valuemin={0} aria-valuemax={Math.max(0,end-minClip)} aria-valuenow={start} tabIndex={0} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); seekFromPointer({clientX: (trackRef.current?.getBoundingClientRect().left || 0) + clamp(start + (event.key === 'ArrowRight' ? .5 : -.5),0,duration) / Math.max(duration,1) * (trackRef.current?.getBoundingClientRect().width || 1), preventDefault(){}, stopPropagation(){} }, 'start') } }} className="absolute inset-y-[-4px] z-20 w-3 cursor-ew-resize rounded-l-md border-2 border-amber-200 bg-amber-300 shadow-[0_1px_8px_#000b] touch-none" style={{ left: `calc(${startPct}% - 2px)` }}/>
          <div onPointerDown={event => beginDrag(event, 'end')} role="slider" aria-label="Đầu cắt kết thúc" aria-valuemin={Math.min(duration,start+minClip)} aria-valuemax={Math.min(duration,start+60)} aria-valuenow={end} tabIndex={0} className="absolute inset-y-[-4px] z-20 w-3 cursor-ew-resize rounded-r-md border-2 border-amber-200 bg-amber-300 shadow-[0_1px_8px_#000b] touch-none" style={{ left: `calc(${endPct}% - 10px)` }}/>
          <div onPointerDown={event => beginDrag(event, 'playhead')} role="slider" aria-label="Đầu đọc thời gian" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={currentTime} tabIndex={0} className="absolute inset-y-[-9px] z-30 w-5 -translate-x-1/2 cursor-ew-resize touch-none" style={{ left: `${playPct}%` }}>
            <div className="mx-auto h-2.5 w-2.5 rounded-full border border-black/60 bg-white shadow"/>
            <div className="mx-auto h-full w-[2px] bg-white shadow-[0_0_5px_#000]"/>
          </div>
        </div>
      </div>
    </div>

    <div className="flex items-center gap-2 border-t border-white/10 pt-2">
      <div className="flex w-[82px] shrink-0 items-center justify-center gap-1 text-[10px] font-semibold text-white/55"><AudioLines size={14}/> ÂM THANH</div>
      <button type="button" onClick={() => onOpenTool?.('music')} className="relative flex h-8 min-w-0 flex-1 items-center gap-[2px] overflow-hidden rounded-md border border-sky-300/25 bg-sky-500/10 px-2">
        {selected.audioTrackTitle ? <><div className="absolute inset-0 flex items-center justify-around opacity-60">{waveform.map((height, i) => <span key={i} className="w-[2px] shrink-0 rounded-full bg-sky-300" style={{height: `${height}%`}}/>)}</div><span className="relative z-10 max-w-[85%] truncate rounded bg-[#10232c]/90 px-1.5 py-0.5 text-[10px] font-semibold text-sky-100">{selected.audioTrackTitle}</span></> : <span className="relative z-10 flex items-center gap-1 text-[10px] font-semibold text-sky-200"><Music2 size={13}/> + Thêm nhạc nền</span>}
      </button>
    </div>

    <div className="mt-2 flex items-center justify-between gap-1 border-t border-white/10 pt-2">
      {[
        {id:'theme', label:'Chủ đề', glyph:'✦'},
        {id:'trim', label:'Tạo/Cắt', glyph:'✂'},
        {id:'music', label:'Âm nhạc', glyph:'♫'},
        {id:'text', label:'Chữ', glyph:'T'},
        {id:'sticker', label:'Sticker', glyph:'☺'},
        {id:'filter', label:'Bộ lọc', glyph:'◐'},
      ].map(tool => <button key={tool.id} type="button" onClick={() => onOpenTool?.(tool.id)} className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-medium ${tool.id === 'trim' || tool.id === 'music' ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5'}`}><span className="grid h-5 place-items-center text-[17px] leading-none">{tool.glyph}</span><span className="truncate">{tool.label}</span></button>)}
    </div>
  </section>
}
