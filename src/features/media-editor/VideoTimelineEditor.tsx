// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, AudioLines, Check, ChevronDown, ChevronUp, CircleHelp, Clapperboard, Copy,
  Crop, Download, Film, ImagePlus, Layers, Music2, Pause, Play, Plus, RotateCcw,
  Scissors, SlidersHorizontal, Sparkles, Sticker, Trash2, Type, Volume2, WandSparkles,
  X, MoveHorizontal, Clock3, Palette, RectangleHorizontal, UserRound
} from 'lucide-react'
import { exportToBlob, blobToVideoFile } from './timelineExport'
import { StudioCreationTools } from './StudioCreationTools'

const clamp = (n, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(n)) ? Number(n) : min))
const fmt = (seconds, tenths = false) => {
  const s = Math.max(0, Number(seconds) || 0)
  const mm = Math.floor(s / 60), ss = Math.floor(s % 60)
  return String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0') + (tenths ? '.' + Math.floor((s % 1) * 10) : '')
}
const makeClip = file => ({ id: String(Date.now()) + '-' + Math.random().toString(36).slice(2), file, kind: file && file.type && file.type.startsWith('image/') ? 'image' : 'video', sourceDuration: file && file.type && file.type.startsWith('image/') ? 3 : 0, in: 0, out: file && file.type && file.type.startsWith('image/') ? 3 : 0 })
const clipLen = c => Math.max(0.1, (Number(c.out) || Number(c.sourceDuration) || 3) - (Number(c.in) || 0))

const TOOL_ITEMS = [
  { id: 'trim', label: 'Chỉnh sửa', icon: Scissors },
  { id: 'music', label: 'Âm thanh', icon: Music2 },
  { id: 'text', label: 'Văn bản', icon: Type },
  { id: 'sticker', label: 'Nhãn dán', icon: Sticker },
  { id: 'overlay', label: 'Lớp phủ', icon: Layers },
  { id: 'effects', label: 'Hiệu ứng', icon: Sparkles },
  { id: 'filter', label: 'Bộ lọc', icon: Palette },
  { id: 'adjust', label: 'Tùy chỉnh', icon: SlidersHorizontal },
  { id: 'ratio', label: 'Tỷ lệ', icon: Crop },
  { id: 'background', label: 'Nền', icon: RectangleHorizontal },
  { id: 'avatar', label: 'Ảnh đại diện AI', icon: UserRound },
]
const FILTERS = [
  { id: 'none', label: 'Gốc', css: 'none' },
  { id: 'warm', label: 'Ấm', css: 'saturate(1.15) sepia(.18)' },
  { id: 'mono', label: 'Đen trắng', css: 'grayscale(1)' },
  { id: 'vivid', label: 'Rực rỡ', css: 'saturate(1.45) contrast(1.05)' },
  { id: 'cool', label: 'Lạnh', css: 'saturate(.9) hue-rotate(12deg)' },
]
const filterCss = id => { const css = (FILTERS.find(x => x.id === id) || FILTERS[0]).css; return css === 'none' ? '' : css }

export function MediaPicker({ onFiles, disabled = false }) {
  const input = useRef(null)
  return <>
    <input ref={input} hidden type="file" accept="image/*,video/*" multiple disabled={disabled} onChange={e => {
      const picked = Array.from(e.currentTarget.files || [])
      const images = picked.filter(f => f.type.startsWith('image/'))
      const videos = picked.filter(f => f.type.startsWith('video/'))
      onFiles && onFiles([...images, ...videos])
      e.currentTarget.value = ''
    }} />
    <button type="button" disabled={disabled} onClick={() => input.current && input.current.click()} aria-label="Thêm ảnh hoặc video" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-white hover:bg-white/15 disabled:opacity-40"><Plus size={20} /></button>
  </>
}

function PreviewPlayer({ file, videoRef, isPlaying, onTogglePlayback, settings = {}, onSettingsChange }) {
  const sourceUrl = useMemo(() => file ? URL.createObjectURL(file) : '', [file])
  useEffect(() => () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl) }, [sourceUrl])
  const drag = useRef(false)
  const [localPlaying, setLocalPlaying] = useState(false)
  const [position, setPosition] = useState({ x: Number(settings.overlayX ?? 50), y: Number(settings.overlayY ?? 50) })
  useEffect(() => setPosition({ x: Number(settings.overlayX ?? 50), y: Number(settings.overlayY ?? 50) }), [settings.overlayX, settings.overlayY])
  const moveText = e => {
    if (!drag.current) return
    const r = e.currentTarget.getBoundingClientRect()
    const next = { x: clamp((e.clientX - r.left) / r.width * 100, 2, 98), y: clamp((e.clientY - r.top) / r.height * 100, 4, 96) }
    setPosition(next)
    onSettingsChange && onSettingsChange({ overlayX: next.x, overlayY: next.y })
  }
  const ratio = settings.aspectRatio || '9:16'
  const ratioClass = ratio === '16:9' ? 'aspect-video' : ratio === '1:1' ? 'aspect-square' : ratio === '4:5' ? 'aspect-[4/5]' : 'aspect-[9/16]'
  const visualStyle = {
    transform: 'translate(' + Number(settings.panX || 0) + '%, ' + Number(settings.panY || 0) + '%) scale(' + clamp(settings.zoom || 1, 1, 3) + ') rotate(' + Number(settings.rotation || 0) + 'deg)',
    filter: filterCss(settings.colorFilter) + ' brightness(' + (100 + Number(settings.brightness || 0)) + '%) contrast(' + Number(settings.contrast ?? 100) + '%) saturate(' + Number(settings.saturation ?? 100) + '%) hue-rotate(' + Number(settings.hue || 0) + 'deg)',
    objectFit: settings.cropMode === 'cover' ? 'cover' : 'contain',
  }
  return <div className="relative flex h-full w-full items-center justify-center">
    <div className={'relative ' + ratioClass + ' h-full max-h-full max-w-full overflow-hidden rounded-[18px] border border-white/10 shadow-2xl'} style={{ aspectRatio: ratio.replace(':', ' / '), background: settings.backgroundColor || '#000', maxWidth: '100%' }}>
      {file && file.type && file.type.startsWith('video/') ? <video key={sourceUrl} ref={videoRef} src={sourceUrl} playsInline preload="auto" onPlay={() => setLocalPlaying(true)} onPause={() => setLocalPlaying(false)} className="h-full w-full" style={visualStyle} /> : sourceUrl ? <img src={sourceUrl} alt="Xem trước video" className="h-full w-full" style={visualStyle} /> : <div className="grid h-full place-items-center text-sm text-white/45">Thêm video hoặc ảnh để bắt đầu</div>}
      {settings.sticker && <div className="pointer-events-none absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 text-4xl drop-shadow-lg">{settings.sticker}</div>}
      {settings.overlayText && <div onPointerDown={e => { drag.current = true; e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId) }} onPointerMove={moveText} onPointerUp={() => { drag.current = false }} onPointerCancel={() => { drag.current = false }} className="absolute max-w-[90%] cursor-move select-none rounded px-2 py-1 text-center font-bold drop-shadow-lg touch-none" style={{ left: position.x + '%', top: position.y + '%', transform: 'translate(-50%,-50%)', color: settings.overlayColor || '#ffffff', fontSize: clamp(settings.overlayFontSize || 28, 12, 72) + 'px', fontFamily: settings.overlayFont || 'Arial,sans-serif', textShadow: '0 2px 5px #000' }}>{settings.overlayText}</div>}
      <button type="button" onClick={() => { const v = videoRef && videoRef.current; if (v && file && file.type && file.type.startsWith('video/')) { if (v.paused) v.play().catch(() => {}); else v.pause() } else if (onTogglePlayback) onTogglePlayback() }} className="absolute bottom-3 left-3 grid h-10 w-10 place-items-center rounded-full bg-black/65 text-white backdrop-blur" aria-label={localPlaying ? 'Tạm dừng' : 'Phát'}>{localPlaying ? <Pause size={19} /> : <Play size={19} fill="currentColor" />}</button>
      <div className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold text-white/80 backdrop-blur">Xem trước</div>
    </div>
  </div>
}

function Timeline({ clips, activeId, onSelect, onChangeClips, playhead, onSeek, settings, storyMode }) {
  const rail = useRef(null)
  const trackRef = useRef(null)
  const drag = useRef(null)
  const urls = useMemo(() => new Map(clips.map(c => [c.id, URL.createObjectURL(c.file)])), [clips.map(c => c.id).join('|')])
  useEffect(() => () => urls.forEach(url => URL.revokeObjectURL(url)), [urls])
  const active = clips.find(c => c.id === activeId) || clips[0]
  const total = clips.reduce((s, c) => s + clipLen(c), 0)
  const activeIndex = clips.findIndex(c => c.id === active?.id)
  const activeStart = clips.slice(0, Math.max(0, activeIndex)).reduce((s, c) => s + clipLen(c), 0)
  const pct = t => clamp(t / Math.max(total, .1) * 100, 0, 100)
  const startDrag = (e, mode) => { e.preventDefault(); e.stopPropagation(); drag.current = mode; e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId) }
  const pointerMove = e => {
    if (!drag.current || !rail.current) return
    const r = (trackRef.current || rail.current).getBoundingClientRect()
    const t = clamp((e.clientX - r.left) / r.width, 0, 1) * total
    if (drag.current === 'playhead') { onSeek(t); return }
    if (!active) return
    const local = clamp(t - activeStart + active.in, 0, active.sourceDuration || active.out || 3)
    const next = clips.slice(), i = next.findIndex(c => c.id === active.id)
    if (drag.current === 'in') next[i] = { ...active, in: clamp(local, 0, Math.max(0, active.out - .25)) }
    if (drag.current === 'out') next[i] = { ...active, out: clamp(local, active.in + .25, active.sourceDuration || 3) }
    onChangeClips(next)
  }
  const trackClick = e => {
    if (drag.current || !rail.current) return
    const r = e.currentTarget.getBoundingClientRect()
    onSeek(clamp((e.clientX - r.left) / r.width, 0, 1) * total)
  }
  const trackRows = [
    { id: 'video', label: 'Video', icon: Film, color: 'bg-emerald-400/15', visible: true },
    { id: 'audio', label: 'Âm thanh', icon: AudioLines, color: 'bg-violet-400/15', visible: !!(settings.audioTrackTitle || settings.audioTrackFile || settings.audioTrackUrl || settings.audioSource === 'pixabay') },
    { id: 'text', label: 'Văn bản', icon: Type, color: 'bg-amber-300/15', visible: !!(settings.overlayText || settings.sticker) },
  ].filter(row => row.id === 'video' || row.visible)
  return <div className="space-y-1.5">
    <div className="flex items-center justify-between text-[10px] text-white/65"><span className="font-mono text-white">{fmt(playhead, true)} <span className="text-white/35">/</span> {fmt(total)}</span><span>{clips.length} đoạn · {fmt(total)}</span></div>
    <div className="relative">
      <div className="mb-0.5 flex items-center justify-between px-1 text-[9px] text-white/35"><span>TIMELINE</span><span>KÉO ĐỂ TUA · CHỌN ĐOẠN ĐỂ SỬA</span></div>
      <div ref={rail} className="relative space-y-1.5 touch-none select-none" onPointerMove={pointerMove} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
        {trackRows.map(row => {
          const Icon = row.icon
          return <div key={row.id} className="flex min-h-[48px] items-stretch gap-2">
            <div className="flex w-[54px] shrink-0 flex-col justify-center gap-1 rounded-lg bg-white/[0.035] px-1.5 text-[9px] text-white/50"><Icon size={13} /><span>{row.label}</span></div>
            <div ref={row.id === 'video' ? trackRef : undefined} onClick={trackClick} className={'relative flex min-w-0 flex-1 items-stretch overflow-hidden rounded-lg border border-white/[0.07] ' + row.color}>
              {row.id === 'video' && clips.map((c, i) => {
                const d = clipLen(c)
                return <button key={c.id} type="button" onClick={e => { e.stopPropagation(); onSelect(c.id); onSeek(clips.slice(0, i).reduce((s, x) => s + clipLen(x), 0)) }} className={'relative min-w-0 overflow-hidden border-r border-black/35 ' + (c.id === activeId ? 'ring-2 ring-inset ring-cyan-300' : '')} style={{ width: (d / Math.max(total, .1) * 100) + '%' }}>
                  {c.kind === 'image' ? <img src={urls.get(c.id)} alt="" className="h-full w-full object-cover" /> : <video muted playsInline preload="metadata" src={urls.get(c.id)} className="h-full w-full object-cover" />}
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-1 py-0.5 text-[8px] text-white">{i + 1} · {fmt(d)}</span>
                </button>
              })}
              {row.id === 'video' && active && <><div onPointerDown={e => startDrag(e, 'in')} className="absolute bottom-0 top-0 z-10 w-2 cursor-ew-resize border-l-2 border-cyan-100 bg-cyan-300/35" style={{ left: pct(activeStart) + '%' }} aria-label="Kéo điểm đầu clip" /><div onPointerDown={e => startDrag(e, 'out')} className="absolute bottom-0 top-0 z-10 w-2 cursor-ew-resize border-r-2 border-cyan-100 bg-cyan-300/35" style={{ left: pct(activeStart + clipLen(active)) + '%' }} aria-label="Kéo điểm cuối clip" /></>}
              {row.id === 'audio' && <div className="flex h-12 w-full items-center gap-[2px] overflow-hidden px-1.5">{Array.from({ length: 96 }, (_, i) => <span key={i} className="min-w-[2px] flex-1 rounded-sm bg-violet-300/80" style={{ height: (18 + ((i * 17 + 11) % 25)) + '%' }} />)}{!row.visible && <span className="absolute inset-0 grid place-items-center bg-[#1b1925]/80 text-[10px] text-white/35">+ Thêm âm thanh</span>}{row.visible && <span className="absolute left-2 top-1 rounded bg-black/35 px-1.5 py-0.5 text-[9px] text-violet-100">{settings.audioTrackTitle || 'Âm thanh gốc'}</span>}</div>}
              {row.id === 'text' && <div className="flex h-12 w-full items-center px-1.5">{row.visible ? <div className="flex h-6 w-full items-center rounded-md border border-amber-200/30 bg-amber-300/25 px-2 text-[10px] text-amber-50">{settings.sticker ? settings.sticker + ' ' : ''}{settings.overlayText || 'Nhãn dán'}</div> : <span className="w-full text-center text-[10px] text-white/35">+ Thêm văn bản</span>}</div>}
            </div>
          </div>
        })}
        <div className="pointer-events-none absolute bottom-0 left-[62px] right-0 top-0 z-20">
          <div className="absolute bottom-0 top-0 w-[2px] bg-white shadow-[0_0_6px_rgba(255,255,255,.65)]" style={{ left: (clamp(playhead / Math.max(total, .1), 0, 1) * 100) + '%' }}>
            <div className="absolute -left-[3px] -top-1 h-2 w-2 rounded-sm bg-white" />
          </div>
        </div>
      </div>
      {active && <div className="mt-2 flex items-center gap-2">
        <span className="w-[54px] shrink-0 text-[9px] text-white/40">CẮT</span>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-white/[0.035] px-2 py-1.5">
          <span className="text-[10px] text-white/45">Đầu</span>
          <input aria-label="Điểm bắt đầu clip" type="range" min="0" max={Math.max(.25, active.sourceDuration || active.out || 3)} step=".05" value={active.in} onChange={e => { const next = clips.map(c => c.id === active.id ? { ...c, in: Math.min(Number(e.target.value), c.out - .25) } : c); onChangeClips(next) }} className="min-w-0 flex-1 accent-cyan-300" />
          <span className="w-10 text-right font-mono text-[10px]">{fmt(active.in, true)}</span>
          <span className="text-[10px] text-white/45">Cuối</span>
          <input aria-label="Điểm kết thúc clip" type="range" min={active.in + .25} max={Math.max(active.in + .25, active.sourceDuration || active.out || 3)} step=".05" value={Math.min(active.out || active.sourceDuration || 3, active.sourceDuration || active.out || 3)} onChange={e => onChangeClips(clips.map(c => c.id === active.id ? { ...c, out: Number(e.target.value) } : c))} className="min-w-0 flex-1 accent-cyan-300" />
          <span className="w-10 text-right font-mono text-[10px]">{fmt(active.out, true)}</span>
        </div>
      </div>}
    </div>
    {storyMode && total > 60 && <p role="alert" className="rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-100">Tin 24 giờ tối đa 60 giây. Timeline hiện dài {fmt(total)}.</p>}
  </div>
}

export function VideoTimelineEditor({ file, files: filesProp, settings, onChange, videoRef, isPlaying, onTogglePlayback, onOpenTool, onCloseEditor, trimModeActive = false, storyMode = false, onExport, onPublishStory, onContinuePost }) {
  const initialFiles = (filesProp && filesProp.length ? filesProp : file ? [file] : []).filter(f => f && f.type && (f.type.startsWith('image/') || f.type.startsWith('video/')))
  const [clips, setClips] = useState(() => initialFiles.map(makeClip))
  const [activeId, setActiveId] = useState(null)
  const [playhead, setPlayhead] = useState(0)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportedFile, setExportedFile] = useState(null)
  const [activeTool, setActiveTool] = useState(trimModeActive ? 'trim' : '')
  const [toolbarMode, setToolbarMode] = useState('clip')
  const [studioOpen, setStudioOpen] = useState(false)
  const selected = settings || {}
  const active = clips.find(c => c.id === activeId) || clips[0]
  const total = clips.reduce((s, c) => s + clipLen(c), 0)
  const activeIndex = clips.findIndex(c => c.id === active?.id)
  const activeStart = clips.slice(0, Math.max(0, activeIndex)).reduce((s, c) => s + clipLen(c), 0)
  const update = patch => { setExportedFile(null); onChange && onChange({ ...selected, ...patch }) }

  useEffect(() => { if (!activeId && clips[0]) setActiveId(clips[0].id) }, [clips, activeId])
  useEffect(() => {
    let cancelled = false
    clips.filter(c => c.kind === 'video' && !c.sourceDuration).forEach(c => {
      const url = URL.createObjectURL(c.file), v = document.createElement('video')
      v.preload = 'metadata'; v.src = url
      v.onloadedmetadata = () => {
        const d = Number(v.duration)
        if (!cancelled && Number.isFinite(d) && d > 0) setClips(prev => prev.map(x => x.id === c.id ? { ...x, sourceDuration: d, out: d } : x))
        URL.revokeObjectURL(url)
      }
      v.onerror = () => URL.revokeObjectURL(url)
    })
    return () => { cancelled = true }
  }, [clips.map(c => c.id + ':' + c.sourceDuration).join('|')])
  useEffect(() => {
    const v = videoRef && videoRef.current
    if (!v || !active || active.kind !== 'video') return
    const sync = () => {
      if (Number.isFinite(v.duration) && v.duration > 0) setClips(prev => prev.map(c => c.id === active.id ? { ...c, sourceDuration: v.duration, out: c.out > 0 ? Math.min(c.out, v.duration) : v.duration } : c))
      setPlayhead(clamp(activeStart + v.currentTime - active.in, 0, total))
    }
    v.addEventListener('loadedmetadata', sync); v.addEventListener('durationchange', sync); v.addEventListener('timeupdate', sync); v.addEventListener('seeked', sync); sync()
    return () => { v.removeEventListener('loadedmetadata', sync); v.removeEventListener('durationchange', sync); v.removeEventListener('timeupdate', sync); v.removeEventListener('seeked', sync) }
  }, [active && active.id, videoRef, activeStart, total])
  useEffect(() => {
    const v = videoRef && videoRef.current
    if (!v || !active || active.kind !== 'video') return
    const t = clamp(playhead - activeStart + active.in, active.in, active.out || active.sourceDuration || 0)
    if (Number.isFinite(t) && Math.abs(v.currentTime - t) > .035) { try { v.currentTime = t } catch {} }
  }, [playhead, active && active.id, activeStart, active && active.in, active && active.out, videoRef])
  const seek = t => {
    const next = clamp(t, 0, total)
    setPlayhead(next)
    let elapsed = 0
    for (const clip of clips) {
      if (next <= elapsed + clipLen(clip) + 0.001) { setActiveId(clip.id); break }
      elapsed += clipLen(clip)
    }
  }
  const changeClips = next => {
    setExportedFile(null); setClips(next)
    const c = next.find(x => x.id === activeId)
    if (c) update({ trimStart: c.in, trimEnd: c.out, timelineClips: next })
  }
  const insertGenerated = async generatedFile => {
    setExportedFile(null)
    const generated = makeClip(generatedFile)
    const list = clips.slice()
    let elapsed = 0, targetIndex = list.length, local = 0
    for (let i = 0; i < list.length; i++) {
      const end = elapsed + clipLen(list[i])
      if (playhead <= end + 0.001) { targetIndex = i; local = clamp(playhead - elapsed, 0, clipLen(list[i])); break }
      elapsed = end
    }
    let next = list
    if (targetIndex < list.length && local > 0.05 && local < clipLen(list[targetIndex]) - 0.05) {
      const current = list[targetIndex]
      const splitAt = clamp((Number(current.in) || 0) + local, (Number(current.in) || 0) + 0.05, (Number(current.out) || Number(current.sourceDuration) || 3) - 0.05)
      const left = { ...current, id: makeClip(current.file).id, out: splitAt }
      const right = { ...current, id: makeClip(current.file).id, in: splitAt }
      next = [...list.slice(0, targetIndex), left, generated, right, ...list.slice(targetIndex + 1)]
    } else {
      next = [...list.slice(0, targetIndex), generated, ...list.slice(targetIndex)]
    }
    const insertAt = next.findIndex(c => c.id === generated.id)
    setClips(next); setActiveId(generated.id)
    const before = next.slice(0, insertAt).reduce((sum, c) => sum + clipLen(c), 0)
    setPlayhead(before)
    setToolbarMode('clip'); setActiveTool(''); setError('')
    update({ timelineClips: next })
  }
  const addFiles = picked => {
    setExportedFile(null)
    const imgs = picked.filter(f => f.type.startsWith('image/')), vids = picked.filter(f => f.type.startsWith('video/'))
    const accepted = [...imgs, ...vids].map(makeClip)
    if (!accepted.length) { setError('Hãy chọn ít nhất một ảnh hoặc video hợp lệ.'); return }
    setClips(prev => [...prev, ...accepted]); setError('')
  }
  const split = () => {
    setExportedFile(null)
    if (!active || active.kind !== 'video') { setError('Chọn một video để tách.'); return }
    const local = active.in + playhead - activeStart
    if (local <= active.in + .15 || local >= active.out - .15) { setError('Đưa playhead vào giữa clip rồi chọn Tách.'); return }
    const a = { ...active, id: makeClip(active.file).id, out: local }
    const b = { ...active, id: makeClip(active.file).id, in: local }
    setClips(prev => [...prev.slice(0, activeIndex), a, b, ...prev.slice(activeIndex + 1)])
    setActiveId(b.id); setError('')
  }
  const remove = () => {
    setExportedFile(null)
    if (!active) return
    const next = clips.filter(c => c.id !== active.id)
    setClips(next); setActiveId(next[0] ? next[0].id : null); setPlayhead(0)
  }
  const move = delta => {
    setExportedFile(null)
    const i = clips.findIndex(c => c.id === activeId), j = i + delta
    if (i < 0 || j < 0 || j >= clips.length) return
    const next = clips.slice(); [next[i], next[j]] = [next[j], next[i]]; setClips(next)
  }
  const exportAction = async ({ forStory = false } = {}) => {
    if (!clips.length) { setError('Hãy chọn ảnh hoặc video.'); return null }
    if ((forStory || storyMode) && total > 60) { setError('Tin 24 giờ chỉ được dài tối đa 60 giây. Hãy cắt timeline rồi thử lại.'); return null }
    setExporting(true); setError('')
    try {
      const blob = await exportToBlob(clips, selected, { storyMode: forStory || storyMode })
      const output = blobToVideoFile(blob, 'd-social-edited', total)
      setExportedFile(output)
      if (onExport) await onExport({ blob, file: output, clips, settings: selected, duration: total })
      return output
    } catch (e) { setError(e && e.message ? e.message : 'Xuất video thất bại. Hãy thử lại bằng Chrome Android mới nhất.'); return null }
    finally { setExporting(false) }
  }
  const ensureExported = async forStory => exportedFile || await exportAction({ forStory })
  const publishStory = async () => {
    if (exporting) return
    const output = await ensureExported(true)
    if (!output) return
    if (!onPublishStory) { setError('Chưa kết nối luồng đăng Story trong Composer.'); return }
    setExporting(true); setError('')
    try { await onPublishStory(output) } catch (e) { setError(e && e.message ? e.message : 'Không đăng được tin.') }
    finally { setExporting(false) }
  }
  const continuePost = async () => {
    if (exporting) return
    const output = await ensureExported(false)
    if (!output) return
    if (!onContinuePost) { onOpenTool && onOpenTool('publish'); return }
    try { await onContinuePost(output) } catch (e) { setError(e && e.message ? e.message : 'Không thể chuyển sang bước đăng bài.') }
  }

  const activeToolData = TOOL_ITEMS.find(x => x.id === activeTool)
  const totalLabel = fmt(total)
  const toolClick = id => {
    if (id === 'music' && onOpenTool) {
      setActiveTool('')
      onOpenTool('music')
      return
    }
    if (id === 'adjust' && onOpenTool) onOpenTool('adjust')
    setActiveTool(current => current === id ? '' : id)
  }
  const actionButton = 'flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 text-xs font-bold disabled:opacity-40'
  const rangeClass = 'w-full accent-cyan-300'
  return <section className="pointer-events-auto fixed inset-0 z-[200] flex flex-col overflow-hidden bg-[#08090d] text-white" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-3">
      <button type="button" onClick={() => onCloseEditor ? onCloseEditor() : setActiveTool('')} aria-label="Đóng trình chỉnh sửa" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-white/10"><ArrowLeft size={21} /></button>
      <div className="min-w-0 flex-1"><div className="text-sm font-bold tracking-wide">D-Social Studio</div><div className="text-[10px] text-white/45">Trình chỉnh sửa video</div></div>
      <div className="rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-[10px] font-semibold text-white/70">{totalLabel}</div>
      <button type="button" disabled={exporting || !clips.length} onClick={() => exportAction()} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-cyan-300 px-4 text-xs font-extrabold text-black disabled:opacity-40"><Check size={15} /> {exporting ? 'Đang xuất' : 'Xuất'}</button>
    </header>

    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative flex min-h-0 flex-[1_1_0%] items-center justify-center overflow-hidden px-2 py-1">
        <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: 'radial-gradient(ellipse at center, #242630 0%, #111217 48%, #08090d 78%)' }} />
        <div className="relative z-10 h-full w-full"><PreviewPlayer file={active ? active.file : file} videoRef={videoRef} isPlaying={isPlaying} onTogglePlayback={onTogglePlayback} settings={selected} onSettingsChange={update} /></div>
        <div className="absolute bottom-3 left-4 right-4 z-20 flex items-center justify-between">
          <div className="rounded-full bg-black/45 px-2.5 py-1 text-[10px] text-white/65 backdrop-blur">{active ? active.file.name : 'Chưa chọn media'}</div>
          <div className="flex items-center gap-1.5"><button type="button" onClick={() => update({ zoom: 1, panX: 0, panY: 0, rotation: 0 })} className="grid h-8 w-8 place-items-center rounded-full bg-black/45 text-white/80" aria-label="Đặt lại khung hình"><RotateCcw size={14} /></button><span className="rounded-full bg-black/45 px-2 py-1 text-[10px] text-white/65">{selected.aspectRatio || '9:16'}</span></div>
        </div>
      </div>

      <div className="shrink-0 border-t border-white/10 bg-[#0e0f14] px-2 pb-1 pt-1">
        <div className="mb-1 flex items-center justify-between"><div className="flex items-center gap-2 text-[11px] font-bold"><Clapperboard size={14} className="text-cyan-300" /> Timeline</div><div className="flex items-center gap-1.5"><button type="button" disabled={activeIndex <= 0} onClick={() => move(-1)} className="grid h-7 w-7 place-items-center rounded-md bg-white/[0.06] disabled:opacity-25" aria-label="Di chuyển clip lên trước"><ChevronUp size={15} /></button><button type="button" disabled={activeIndex < 0 || activeIndex >= clips.length - 1} onClick={() => move(1)} className="grid h-7 w-7 place-items-center rounded-md bg-white/[0.06] disabled:opacity-25" aria-label="Di chuyển clip ra sau"><ChevronDown size={15} /></button><button type="button" disabled={!active} onClick={split} className="grid h-7 w-7 place-items-center rounded-md bg-white/[0.06] disabled:opacity-25" aria-label="Tách clip"><Scissors size={14} /></button><button type="button" disabled={!active} onClick={remove} className="grid h-7 w-7 place-items-center rounded-md bg-white/[0.06] text-red-200 disabled:opacity-25" aria-label="Xóa clip"><Trash2 size={14} /></button><MediaPicker onFiles={addFiles} disabled={exporting} /></div></div>
        <Timeline clips={clips} activeId={active && active.id} onSelect={id => { setActiveId(id); setError('') }} onChangeClips={changeClips} playhead={playhead} onSeek={seek} settings={selected} storyMode={storyMode} />
      </div>

      {activeTool && <div className="absolute bottom-[calc(90px+env(safe-area-inset-bottom))] left-2 right-2 z-[180] max-h-[min(24dvh,calc(100dvh-210px))] overflow-hidden rounded-2xl border border-white/15 bg-[#15161d]/95 px-3 py-2 shadow-2xl backdrop-blur-xl">
        <div className="mb-2 flex items-center justify-between"><div className="text-xs font-bold">{activeToolData ? activeToolData.label : 'Công cụ'}</div><button type="button" onClick={() => setActiveTool('')} aria-label="Đóng công cụ" className="grid h-7 w-7 place-items-center rounded-full bg-white/10"><X size={14} /></button></div>
        <div className="max-h-[calc(24dvh-44px)] space-y-2 overflow-y-auto text-xs">
          {activeTool === 'trim' && <div className="grid grid-cols-2 gap-2"><button type="button" onClick={split} className={actionButton + ' bg-white/10'}><Scissors size={15} /> Tách tại playhead</button><button type="button" onClick={remove} className={actionButton + ' bg-red-400/10 text-red-100'}><Trash2 size={15} /> Xóa đoạn chọn</button><label className="col-span-2 flex items-center gap-2 text-white/65">Thời lượng ảnh<select disabled={!active || active.kind !== 'image'} value={active && active.kind === 'image' ? clipLen(active) : 3} onChange={e => { const d = Number(e.target.value); changeClips(clips.map(c => c.id === active.id ? { ...c, out: c.in + d, sourceDuration: c.in + d } : c)) }} className="ml-auto rounded-lg bg-white/10 px-2 py-1.5 text-white"><option value="2">2 giây</option><option value="3">3 giây</option><option value="4">4 giây</option><option value="5">5 giây</option><option value="6">6 giây</option><option value="8">8 giây</option></select></label></div>}
          {activeTool === 'music' && <div className="space-y-3"><label className="flex items-center gap-2 rounded-lg bg-white/[0.05] p-2"><Music2 size={15} /><span className="min-w-0 flex-1 truncate">{selected.audioTrackTitle || 'Chưa chọn nhạc nền'}</span><input type="file" accept="audio/*" className="max-w-[150px] text-[10px]" onChange={e => { const f = e.currentTarget.files && e.currentTarget.files[0]; if (f) update({ audioTrackTitle: f.name, audioTrackFile: f, audioTrackUrl: URL.createObjectURL(f), audioSource: 'upload' }); e.currentTarget.value = '' }} /></label><label className="block text-white/70">Âm lượng tiếng gốc · {selected.originalVolume ?? 100}%<input className={rangeClass} type="range" min="0" max="100" value={selected.originalVolume ?? 100} onChange={e => update({ originalVolume: Number(e.target.value) })} /></label><label className="block text-white/70">Âm lượng nhạc · {selected.musicVolume ?? 30}%<input className={rangeClass} type="range" min="0" max="100" value={selected.musicVolume ?? 30} onChange={e => update({ musicVolume: Number(e.target.value) })} /></label><p className="text-[10px] text-amber-100/70">Âm thanh gốc và nhạc nền sẽ được trộn khi trình duyệt hỗ trợ Web Audio. Nếu xuất lỗi, hãy thử Chrome Android mới nhất.</p></div>}
          {activeTool === 'text' && <div className="space-y-2"><input maxLength={120} value={selected.overlayText || ''} onChange={e => update({ overlayText: e.target.value })} placeholder="Nhập văn bản trên video" className="w-full rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-sm" /><div className="grid grid-cols-3 gap-2"><label className="text-white/60">Màu chữ<input type="color" value={selected.overlayColor || '#ffffff'} onChange={e => update({ overlayColor: e.target.value })} className="mt-1 h-8 w-full rounded bg-transparent" /></label><label className="text-white/60">Cỡ chữ<select value={selected.overlayFontSize || 28} onChange={e => update({ overlayFontSize: Number(e.target.value) })} className="mt-1 w-full rounded bg-white/10 px-2 py-2 text-white"><option value="18">18</option><option value="24">24</option><option value="28">28</option><option value="36">36</option><option value="48">48</option></select></label><label className="text-white/60">Kiểu chữ<select value={selected.overlayFont || 'Arial,sans-serif'} onChange={e => update({ overlayFont: e.target.value })} className="mt-1 w-full rounded bg-white/10 px-2 py-2 text-white"><option value="Arial,sans-serif">Đậm</option><option value="Georgia,serif">Cổ điển</option><option value="monospace">Neon</option></select></label></div></div>}
          {activeTool === 'sticker' && <div className="flex flex-wrap gap-2">{['❤️', '✨', '🔥', '⭐', '😂', '🥰', '🎉', '🌈', '🎵', '💯', '🐱', '🌸'].map(s => <button key={s} type="button" onClick={() => update({ sticker: selected.sticker === s ? '' : s })} className={'grid h-10 w-10 place-items-center rounded-lg border text-xl ' + (selected.sticker === s ? 'border-cyan-300 bg-cyan-300/15' : 'border-white/10 bg-white/[0.04]')}>{s}</button>)}</div>}
          {activeTool === 'overlay' && <div className="space-y-2"><p className="text-white/65">Lớp phủ video/ảnh bổ sung chưa được kết nối với bộ xuất. Anh vẫn có thể thêm chữ hoặc nhãn dán ở các công cụ tương ứng.</p><button type="button" onClick={() => setActiveTool('text')} className={actionButton + ' bg-white/10'}><Type size={15} /> Thêm văn bản</button></div>}
          {activeTool === 'effects' && <div className="space-y-2"><p className="text-white/65">Hiệu ứng màu có thể chọn tại đây. Hiệu ứng AI/chuyển cảnh nâng cao chưa được kết nối.</p><div className="flex flex-wrap gap-2">{FILTERS.filter(x => x.id !== 'none').map(f => <button key={f.id} type="button" onClick={() => update({ colorFilter: f.id })} className={'rounded-lg border px-3 py-2 ' + (selected.colorFilter === f.id ? 'border-cyan-300 bg-cyan-300/10' : 'border-white/10 bg-white/[0.04]')}>{f.label}</button>)}</div></div>}
          {activeTool === 'filter' && <div className="flex flex-wrap gap-2">{FILTERS.map(f => <button key={f.id} type="button" onClick={() => update({ colorFilter: f.id })} className={'rounded-lg border px-3 py-2 ' + ((selected.colorFilter || 'none') === f.id ? 'border-cyan-300 bg-cyan-300/10' : 'border-white/10 bg-white/[0.04]')}>{f.label}</button>)}</div>}
          {activeTool === 'adjust' && <div className="space-y-3"><div className="flex items-center justify-between"><span>Thu phóng · {Number(selected.zoom || 1).toFixed(1)}×</span><button type="button" onClick={() => update({ zoom: 1, panX: 0, panY: 0, rotation: 0, brightness: 0, contrast: 100, saturation: 100, hue: 0 })} className="flex items-center gap-1 text-white/55"><RotateCcw size={12} /> Đặt lại</button></div><input aria-label="Thu phóng" className={rangeClass} type="range" min="1" max="3" step=".1" value={selected.zoom || 1} onChange={e => update({ zoom: Number(e.target.value) })} /><label className="block text-white/65">Di chuyển ngang · {selected.panX || 0}%<input className={rangeClass} type="range" min="-50" max="50" value={selected.panX || 0} onChange={e => update({ panX: Number(e.target.value) })} /></label><label className="block text-white/65">Di chuyển dọc · {selected.panY || 0}%<input className={rangeClass} type="range" min="-50" max="50" value={selected.panY || 0} onChange={e => update({ panY: Number(e.target.value) })} /></label><div className="grid grid-cols-2 gap-3"><label className="text-white/65">Độ sáng · {selected.brightness || 0}<input className={rangeClass} type="range" min="-50" max="50" value={selected.brightness || 0} onChange={e => update({ brightness: Number(e.target.value) })} /></label><label className="text-white/65">Tương phản · {selected.contrast ?? 100}<input className={rangeClass} type="range" min="50" max="180" value={selected.contrast ?? 100} onChange={e => update({ contrast: Number(e.target.value) })} /></label><label className="text-white/65">Bão hòa · {selected.saturation ?? 100}<input className={rangeClass} type="range" min="0" max="200" value={selected.saturation ?? 100} onChange={e => update({ saturation: Number(e.target.value) })} /></label><label className="text-white/65">Xoay · {selected.rotation || 0}°<input className={rangeClass} type="range" min="-180" max="180" step="90" value={selected.rotation || 0} onChange={e => update({ rotation: Number(e.target.value) })} /></label></div></div>}
          {activeTool === 'ratio' && <div className="grid grid-cols-4 gap-2">{['9:16', '16:9', '1:1', '4:5'].map(r => <button key={r} type="button" onClick={() => update({ aspectRatio: r })} className={'rounded-lg border px-2 py-3 font-semibold ' + ((selected.aspectRatio || '9:16') === r ? 'border-cyan-300 bg-cyan-300/10' : 'border-white/10 bg-white/[0.04]')}>{r}</button>)}</div>}
          {activeTool === 'background' && <div className="flex flex-wrap items-center gap-2">{[{ value: '#000000', label: 'Đen' }, { value: '#ffffff', label: 'Trắng' }, { value: '#172554', label: 'Xanh' }, { value: '#581c87', label: 'Tím' }, { value: '#166534', label: 'Xanh lá' }].map(b => <button key={b.value} type="button" onClick={() => update({ backgroundColor: b.value })} className={'rounded-lg border px-3 py-2 ' + ((selected.backgroundColor || '#000000') === b.value ? 'border-cyan-300' : 'border-white/10')}>{b.label}</button>)}<input aria-label="Màu nền tùy chỉnh" type="color" value={selected.backgroundColor || '#000000'} onChange={e => update({ backgroundColor: e.target.value })} className="h-9 w-10 rounded bg-transparent" /></div>}
          {activeTool === 'avatar' && <p className="text-white/60">Ảnh đại diện AI chưa có dịch vụ tạo ảnh kết nối. Công cụ được đánh dấu rõ ràng thay vì giả lập hoạt động.</p>}
        </div>
      </div>}

      <nav className="shrink-0 border-t border-white/10 bg-[#101116] pb-1 pt-1">
        <div className="flex items-center gap-0.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {active && toolbarMode === 'clip' ? <>
            <button type="button" onClick={split} className="flex min-w-[52px] shrink-0 flex-col items-center gap-0.5 rounded-lg px-1.5 py-1 text-[9px] text-white/85"><Scissors size={18}/><span>Tách</span></button>
            <button type="button" disabled className="flex min-w-[52px] shrink-0 flex-col items-center gap-0.5 rounded-lg px-1.5 py-1 text-[9px] text-white/35" title="Tốc độ chưa được hỗ trợ trong bộ xuất hiện tại"><MoveHorizontal size={18}/><span>Tốc độ</span></button>
            <button type="button" onClick={() => toolClick('music')} className="flex min-w-[52px] shrink-0 flex-col items-center gap-0.5 rounded-lg px-1.5 py-1 text-[9px] text-white/85"><Volume2 size={18}/><span>Âm lượng</span></button>
            <button type="button" onClick={() => toolClick('effects')} className="flex min-w-[62px] shrink-0 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[9px] text-white/85"><Sparkles size={18}/><span>Hiệu ứng</span></button>
            <button type="button" disabled className="flex min-w-[52px] shrink-0 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[9px] text-white/35" title="Xóa nền cần mô hình xử lý nền riêng"><WandSparkles size={18}/><span>Xóa nền</span></button>
            <button type="button" onClick={() => toolClick('filter')} className="flex min-w-[52px] shrink-0 flex-col items-center gap-0.5 rounded-lg px-1.5 py-1 text-[9px] text-white/85"><Palette size={18}/><span>Bộ lọc</span></button>
            <button type="button" onClick={() => toolClick('adjust')} className="flex min-w-[60px] shrink-0 flex-col items-center gap-0.5 rounded-lg px-1.5 py-1 text-[9px] text-white/85"><SlidersHorizontal size={18}/><span>Điều chỉnh</span></button>
            <button type="button" onClick={duplicate} className="flex min-w-[52px] shrink-0 flex-col items-center gap-0.5 rounded-lg px-1.5 py-1 text-[9px] text-white/85"><Copy size={18}/><span>Nhân bản</span></button>
            <button type="button" onClick={remove} className="flex min-w-[52px] shrink-0 flex-col items-center gap-0.5 rounded-lg px-1.5 py-1 text-[9px] text-red-200"><Trash2 size={18}/><span>Xóa</span></button>
            <button type="button" onClick={() => setToolbarMode('main')} className="flex min-w-[58px] shrink-0 flex-col items-center gap-0.5 rounded-lg border border-white/10 px-1.5 py-1 text-[9px] text-white/75"><Layers size={18}/><span>Thêm</span></button>
          </> : <>
            {TOOL_ITEMS.map(item => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => toolClick(item.id)} aria-pressed={activeTool === item.id} className={'flex min-w-[60px] shrink-0 flex-col items-center gap-0.5 rounded-lg px-1.5 py-1 text-[9px] ' + (activeTool === item.id ? 'bg-cyan-300/15 text-cyan-200' : 'text-white/65 hover:bg-white/[0.05]')}><Icon size={18} /><span className="whitespace-nowrap">{item.label}</span></button> })}
            <button type="button" onClick={() => setStudioOpen(true)} className="flex min-w-[72px] shrink-0 flex-col items-center gap-0.5 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[9px] text-cyan-100"><Sparkles size={18}/><span className="whitespace-nowrap">Tạo video AI</span></button>
            <button type="button" onClick={() => { setStudioOpen(true); }} className="flex min-w-[66px] shrink-0 flex-col items-center gap-0.5 rounded-lg border border-white/10 px-2 py-1 text-[9px] text-white/80"><Film size={18}/><span className="whitespace-nowrap">Mẫu Video</span></button>
            <button type="button" onClick={() => setToolbarMode('clip')} className="flex min-w-[52px] shrink-0 flex-col items-center gap-0.5 rounded-lg border border-white/10 px-1.5 py-1 text-[9px] text-white/75"><Film size={18}/><span>Clip</span></button>
          </>}
        </div>
        <div className={'grid gap-1.5 px-2 pb-1 pt-1 ' + (storyMode ? 'grid-cols-1' : 'grid-cols-2')}>
          {storyMode ? (
            <button type="button" disabled={exporting || !clips.length || total > 60} onClick={publishStory} className={actionButton + ' min-h-9 bg-cyan-300 text-black'}>{exporting ? 'Đang xử lý…' : 'Đăng tin 24h'}</button>
          ) : <>
            <button type="button" disabled={exporting || !clips.length || total > 60} onClick={publishStory} className={actionButton + ' min-h-9 border border-white/15 bg-white/[0.04]'}>{exporting ? 'Đang xử lý…' : 'Đăng tin 24h'}</button>
            <button type="button" disabled={exporting || !clips.length} onClick={continuePost} className={actionButton + ' min-h-9 bg-cyan-300 text-black'}>{exporting ? 'Đang xử lý…' : 'Tiếp → Đăng bài'}</button>
          </>}
        </div>
      </nav>
    </div>
    {studioOpen && <StudioCreationTools onInsert={insertGenerated} onClose={() => setStudioOpen(false)} />}
    {error && <div role="alert" className="absolute left-3 right-3 top-16 z-[220] rounded-xl border border-red-300/30 bg-[#321b20] px-3 py-2 text-xs text-red-100 shadow-lg">{error}<button type="button" onClick={() => setError('')} className="ml-2 underline">Đóng</button></div>}
    {exportedFile && <div className="absolute left-3 right-3 top-16 z-[210] rounded-xl border border-emerald-300/25 bg-[#12251e] px-3 py-2 text-xs text-emerald-100">Đã xuất video · {(exportedFile.size / 1024 / 1024).toFixed(1)} MB</div>}
  </section>
}
