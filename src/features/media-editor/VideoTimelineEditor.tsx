// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowLeft, AudioLines, Check, ChevronDown, ChevronUp, CircleHelp, Clapperboard, Copy,
  Crop, Download, Film, ImagePlus, Layers, Music2, Pause, Play, Plus, RotateCcw,
  Scissors, SlidersHorizontal, Sparkles, Sticker, Trash2, Type, Volume2, WandSparkles,
  X, MoveHorizontal, Clock3, Palette, RectangleHorizontal, UserRound, Undo2, Redo2, Maximize2, Send, Clock
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
  useEffect(() => {
    const video = videoRef && videoRef.current
    if (!video || !file || !file.type || !file.type.startsWith('video/')) return
    if (isPlaying) {
      const result = video.play()
      if (result && typeof result.catch === 'function') result.catch(() => setLocalPlaying(false))
    } else {
      video.pause()
    }
  }, [isPlaying, file, sourceUrl, videoRef])

  const ratio = settings.aspectRatio || '9:16'
  const ratioClass = ratio === '16:9' ? 'aspect-video' : ratio === '1:1' ? 'aspect-square' : ratio === '4:5' ? 'aspect-[4/5]' : 'aspect-[9/16]'
  const visualStyle = {
    transform: 'translate(' + Number(settings.panX || 0) + '%, ' + Number(settings.panY || 0) + '%) scale(' + clamp(settings.zoom || 1, 1, 3) + ') rotate(' + Number(settings.rotation || 0) + 'deg)',
    filter: filterCss(settings.colorFilter) + ' brightness(' + (100 + Number(settings.brightness || 0)) + '%) contrast(' + Number(settings.contrast ?? 100) + '%) saturate(' + Number(settings.saturation ?? 100) + '%) hue-rotate(' + Number(settings.hue || 0) + 'deg)',
    objectFit: settings.cropMode === 'cover' ? 'cover' : 'contain',
  }
  return <div className="relative flex h-full w-full items-center justify-center">
    <div className={'relative ' + ratioClass + ' h-full max-h-full max-w-full overflow-hidden rounded-[18px] border border-white/10 shadow-2xl'} style={{ aspectRatio: ratio.replace(':', ' / '), background: settings.backgroundColor || '#000', maxWidth: '100%' }}>
      {file && file.type && file.type.startsWith('video/') ? <video key={sourceUrl} ref={videoRef} src={sourceUrl} playsInline preload="auto" onPlay={() => setLocalPlaying(true)} onPause={() => setLocalPlaying(false)} onEnded={() => { setLocalPlaying(false); if (isPlaying && onTogglePlayback) onTogglePlayback() }} className="h-full w-full" style={visualStyle} /> : sourceUrl ? <img src={sourceUrl} alt="Xem trước video" className="h-full w-full" style={visualStyle} /> : <div className="grid h-full place-items-center text-sm text-white/45">Thêm video hoặc ảnh để bắt đầu</div>}
      {settings.sticker && <div className="pointer-events-none absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 text-4xl drop-shadow-lg">{settings.sticker}</div>}
      {settings.overlayText && <div onPointerDown={e => { drag.current = true; e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId) }} onPointerMove={moveText} onPointerUp={() => { drag.current = false }} onPointerCancel={() => { drag.current = false }} className="absolute max-w-[90%] cursor-move select-none rounded px-2 py-1 text-center font-bold drop-shadow-lg touch-none" style={{ left: position.x + '%', top: position.y + '%', transform: 'translate(-50%,-50%)', color: settings.overlayColor || '#ffffff', fontSize: clamp(settings.overlayFontSize || 28, 12, 72) + 'px', fontFamily: settings.overlayFont || 'Arial,sans-serif', textShadow: '0 2px 5px #000' }}>{settings.overlayText}</div>}
      
      <div className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold text-white/80 backdrop-blur">Xem trước</div>
    </div>
  </div>
}

function Timeline({ clips, activeId, onSelect, onChangeClips, playhead, onSeek, settings, storyMode }) {
  const viewport=useRef(null),drag=useRef(null),lastX=useRef(0),suppress=useRef(false)
  const pps=44,pad=180,total=clips.reduce((s,c)=>s+clipLen(c),0),active=clips.find(c=>c.id===activeId)||clips[0]
  const idx=clips.findIndex(c=>c.id===active?.id),start=clips.slice(0,Math.max(0,idx)).reduce((s,c)=>s+clipLen(c),0)
  const width=Math.max(520,total*pps+pad*2)
  const urls=useMemo(()=>new Map(clips.map(c=>[c.id,URL.createObjectURL(c.file)])),[clips.map(c=>c.id).join('|')])
  useEffect(()=>()=>urls.forEach(URL.revokeObjectURL),[urls])
  const seekCenter=()=>{const el=viewport.current;if(el&&!suppress.current)onSeek(clamp((el.scrollLeft+el.clientWidth/2-pad)/pps,0,total))}
  const trim=(e,kind)=>{e.preventDefault();e.stopPropagation();drag.current=kind;e.currentTarget.setPointerCapture?.(e.pointerId)}
  const pointerMove=e=>{const el=viewport.current;if(!drag.current||!el)return;if(drag.current==='scrub'){el.scrollLeft=clamp(el.scrollLeft+lastX.current-e.clientX,0,Math.max(0,width-el.clientWidth));lastX.current=e.clientX;seekCenter();return}if(!active)return;const r=el.getBoundingClientRect(),t=clamp((el.scrollLeft+e.clientX-r.left-pad)/pps,0,total),local=clamp(t-start+active.in,0,active.sourceDuration||active.out||3),next=clips.slice(),i=next.findIndex(x=>x.id===active.id);if(drag.current==='in')next[i]={...active,in:clamp(local,0,Math.max(0,active.out-.25))};if(drag.current==='out')next[i]={...active,out:clamp(local,active.in+.25,active.sourceDuration||3)};onChangeClips(next)}
  const scrollTo=t=>{const el=viewport.current;if(!el)return;suppress.current=true;el.scrollLeft=clamp(pad+t*pps-el.clientWidth/2,0,Math.max(0,width-el.clientWidth));requestAnimationFrame(()=>{suppress.current=false})}
  const rows=[{id:'video',label:'Video/Ảnh',icon:Film},{id:'audio',label:'+ Âm thanh',icon:AudioLines},{id:'text',label:'+ Văn bản',icon:Type}]
  let elapsed=0;const positions=clips.map(c=>{const x=elapsed;elapsed+=clipLen(c);return x})
  return <div className="space-y-1">
    <div className="flex items-center justify-between px-1 text-[10px] text-white/55"><span className="font-mono text-white">{fmt(playhead,true)} / {fmt(total)}</span><span>{clips.length} clip</span></div>
    <div className="flex gap-2">
      <div className="w-10 shrink-0 pt-5">{rows.map(row=>{const Icon=row.icon;return <div key={row.id} className="flex h-9 flex-col items-center justify-center gap-0.5 border-b border-white/[.04] text-[8px] text-white/40"><Icon size={12}/>{row.label}</div>})}</div>
      <div className="relative min-w-0 flex-1">
        <div ref={viewport} onScroll={seekCenter} onPointerDown={e=>{drag.current='scrub';lastX.current=e.clientX;e.currentTarget.setPointerCapture?.(e.pointerId)}} onPointerMove={pointerMove} onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}} className="overflow-x-auto overflow-y-hidden touch-pan-y select-none [scrollbar-width:thin]">
          <div className="relative" style={{width,minHeight:rows.length*36+20}}>
            <div className="sticky top-0 z-10 h-5 border-b border-white/10 bg-[#0e0f14]">{Array.from({length:Math.ceil(width/pps)+1},(_,i)=><span key={i} className="absolute top-0 h-5 border-l border-white/15 pl-1 text-[8px] leading-5 text-white/40" style={{left:pad+i*pps}}>{fmt(i)}</span>)}</div>
            {rows.map(row=><div key={row.id} className="relative h-9 border-b border-white/[.04]">
              {row.id==='video'&&clips.map((clip,i)=>{const d=clipLen(clip),left=pad+positions[i]*pps,w=Math.max(12,d*pps);return <button key={clip.id} type="button" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onSelect(clip.id);onSeek(positions[i]);scrollTo(positions[i]+d/2)}} className={'absolute inset-y-0 overflow-hidden rounded border border-white/10 '+(clip.id===activeId?'z-[5] border-white ring-2 ring-inset ring-white shadow-[0_0_0_1px_rgba(255,255,255,.45)]':'border-white/15')} style={{left,width:w,background:'#20242a'}}>{clip.kind==='image'?<img src={urls.get(clip.id)} alt="" className="h-full w-full object-cover"/>:<video muted playsInline preload="metadata" src={urls.get(clip.id)} className="h-full w-full object-cover"/>}<span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 text-left text-[8px] leading-3 text-white">{i+1} · {fmt(d)}</span></button>})}
              {row.id==='audio'&&<div className="absolute inset-y-1 left-0 flex items-center gap-[2px] overflow-hidden rounded bg-violet-400/15 px-1" style={{left:pad,width:Math.max(0,total*pps)}}>{Array.from({length:Math.max(1,Math.floor(total*2))},(_,i)=><span key={i} className="min-w-[2px] flex-1 rounded-sm bg-violet-300/70" style={{height:(20+(i*17)%65)+'%'}}/>)}<span className="absolute left-2 text-[8px] text-violet-100">{settings.audioTrackTitle||'Âm thanh'}</span></div>}
              {row.id==='text'&&<div className="absolute inset-y-1 left-0 flex items-center rounded bg-amber-300/20 px-2 text-[9px] text-amber-50" style={{left:pad,width:Math.max(40,total*pps)}}>{settings.sticker||''} {settings.overlayText||'Nhãn dán'}</div>}
              {row.id==='video'&&active&&<><button type="button" onPointerDown={e=>trim(e,'in')} aria-label="Trim đầu clip" className="absolute inset-y-0 z-20 w-6 touch-none border-l-2 border-white bg-white/20" style={{left:pad+start*pps}}/><button type="button" onPointerDown={e=>trim(e,'out')} aria-label="Trim cuối clip" className="absolute inset-y-0 z-20 w-6 touch-none border-r-2 border-white bg-white/20" style={{left:pad+(start+clipLen(active))*pps-24}}/></>}
            </div>)}
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-0 left-1/2 top-0 z-30 w-px bg-white shadow-[0_0_6px_rgba(255,255,255,.8)]"><span className="absolute -left-[3px] top-5 h-2 w-[7px] rounded-sm bg-white"/></div>
      </div>
    </div>
    {storyMode&&total>60&&<p className="text-[10px] text-amber-100">Tin 24 giờ tối đa 60 giây.</p>}
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
  const [toolbarMode, setToolbarMode] = useState('main')
  const [studioOpen, setStudioOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [musicQuery, setMusicQuery] = useState('')
  const [musicHits, setMusicHits] = useState([])
  const [musicLoading, setMusicLoading] = useState(false)
  const [musicError, setMusicError] = useState('')
  const mediaInput = useRef(null)
  const audioInput = useRef(null)
  const historyRef = useRef({ past: [], future: [], last: null, ignore: false })
  const selected = settings || {}
  const active = clips.find(c => c.id === activeId) || clips[0]
  const total = clips.reduce((s, c) => s + clipLen(c), 0)
  const activeIndex = clips.findIndex(c => c.id === active?.id)
  const activeStart = clips.slice(0, Math.max(0, activeIndex)).reduce((s, c) => s + clipLen(c), 0)
  const update = patch => { setExportedFile(null); onChange && onChange({ ...selected, ...patch }) }

  useEffect(() => { if (!activeId && clips[0]) setActiveId(clips[0].id) }, [clips, activeId])
  useEffect(() => { const h=historyRef.current; if(h.last && h.last!==clips && !h.ignore){h.past.push(h.last);if(h.past.length>30)h.past.shift();h.future=[]}h.last=clips;h.ignore=false },[clips])
  const undoClips=()=>{const h=historyRef.current;if(!h.past.length)return;h.future.push(clips);const prev=h.past.pop();h.ignore=true;h.last=prev;setClips(prev);setExportedFile(null)}
  const redoClips=()=>{const h=historyRef.current;if(!h.future.length)return;h.past.push(clips);const next=h.future.pop();h.ignore=true;h.last=next;setClips(next);setExportedFile(null)}
  const toggleFullscreen=async()=>{try{if(!document.fullscreenElement){await document.documentElement.requestFullscreen?.();setFullscreen(true)}else{await document.exitFullscreen?.();setFullscreen(false)}}catch{setFullscreen(false)}}
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

  const searchMusic = async () => {
    setMusicLoading(true); setMusicError('')
    try {
      const params = new URLSearchParams({ q: musicQuery.trim(), order: musicQuery.trim() ? 'popular' : 'latest' })
      const response = await fetch('/api/pixabay/audio?' + params.toString())
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Không tải được kho nhạc.')
      setMusicHits(Array.isArray(data.hits) ? data.hits : [])
      if (!data.hits?.length) setMusicError('Không tìm thấy nhạc. Thử từ khóa khác.')
    } catch (e) {
      setMusicHits([]); setMusicError(e?.message || 'Kho nhạc chưa kết nối.')
    } finally { setMusicLoading(false) }
  }
  const chooseMusic = track => {
    if (!track?.previewUrl) { setMusicError('Bản nhạc này chưa có tệp nghe thử.'); return }
    update({ audioSource:'pixabay', audioTrackId:track.id, audioTrackTitle:track.title, audioTrackArtist:track.artist, audioTrackUrl:track.previewUrl, audioTrackPageUrl:track.pageUrl, isMuted:false })
    setMusicError('')
  }

  const activeToolData = TOOL_ITEMS.find(x => x.id === activeTool)
  const totalLabel = fmt(total)
  const toolClick = id => {
    if (id === 'adjust' && onOpenTool) onOpenTool('adjust')
    setToolbarMode('main')
    setActiveTool(current => current === id ? '' : id)
  }
  const actionButton = 'flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 text-xs font-bold disabled:opacity-40'
  const rangeClass = 'w-full accent-cyan-300'
  return createPortal(<><section className="pointer-events-auto fixed inset-0 z-[9999] flex flex-col overflow-hidden bg-[#08090d] text-white" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-1.5 border-b border-white/10 px-2">
      <button type="button" onClick={() => onCloseEditor ? onCloseEditor() : setActiveTool('')} aria-label="Đóng trình chỉnh sửa" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-white/10"><ArrowLeft size={21} /></button>
      <div className="min-w-0 flex-1"><div className="text-[13px] font-bold tracking-wide">D-Social Studio</div><div className="text-[9px] text-white/45">Trình chỉnh sửa video</div></div>
      <div className="hidden rounded-lg bg-white/[0.06] px-2 py-1.5 text-[10px] font-semibold text-white/70 sm:block">{totalLabel}</div>
      <input ref={mediaInput} hidden type="file" accept="video/*,image/*" multiple onChange={e => { addFiles(Array.from(e.currentTarget.files || [])); e.currentTarget.value = '' }} />
      <button type="button" onClick={() => mediaInput.current?.click()} aria-label="Thêm video hoặc ảnh vào Timeline" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/15 bg-white/[0.06] text-white"><Plus size={17}/></button>
      <button type="button" disabled={exporting || !clips.length || total>60} onClick={publishStory} aria-label="Đăng tin 24h" className="flex h-9 shrink-0 items-center gap-1 rounded-lg bg-white/[0.07] px-2 text-[10px] font-bold text-white disabled:opacity-40"><Clock size={14}/><span>Tin 24h</span></button>
      <button type="button" disabled={exporting || !clips.length} onClick={continuePost} aria-label="Đăng ngay lên bảng tin" className="flex h-9 shrink-0 items-center gap-1 rounded-lg bg-white/[0.07] px-2 text-[10px] font-bold text-white disabled:opacity-40"><Send size={14}/><span>Đăng ngay</span></button>
      <button type="button" disabled={exporting || !clips.length} onClick={() => exportAction()} className="flex h-9 shrink-0 items-center gap-1 rounded-lg bg-cyan-300 px-2.5 text-[10px] font-extrabold text-black disabled:opacity-40"><Check size={14}/> {exporting ? 'Đang xuất' : 'Xuất video'}</button>
    </header>

    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative flex min-h-0 flex-[1_1_0%] items-center justify-center overflow-hidden px-2 py-1">
        <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: 'radial-gradient(ellipse at center, #242630 0%, #111217 48%, #08090d 78%)' }} />
        <div className="relative z-10 h-full w-full"><PreviewPlayer file={active ? active.file : file} videoRef={videoRef} isPlaying={isPlaying} onTogglePlayback={onTogglePlayback} settings={selected} onSettingsChange={update} /></div>
        <div className="absolute bottom-2 left-3 right-3 z-20 truncate text-[10px] text-white/50">{active ? active.file.name : 'Chưa chọn media'}</div>
      </div>

      <div className="shrink-0 border-t border-white/10 bg-[#0e0f14] px-2 pb-2 pt-1">
        <div className="mb-2 flex h-8 items-center justify-center gap-5 border-b border-white/[.06]">
          <button type="button" onClick={onTogglePlayback} aria-label={isPlaying?'Tạm dừng':'Phát'} className="grid h-8 w-8 place-items-center rounded-full text-white/90">{isPlaying ? <Pause size={15}/> : <Play size={15} fill="currentColor"/>}</button>
          <button type="button" onClick={undoClips} disabled={!historyRef.current.past.length} aria-label="Hoàn tác" className="grid h-8 w-8 place-items-center text-white/70 disabled:opacity-25"><Undo2 size={17}/></button>
          <button type="button" onClick={redoClips} disabled={!historyRef.current.future.length} aria-label="Làm lại" className="grid h-8 w-8 place-items-center text-white/70 disabled:opacity-25"><Redo2 size={17}/></button>
          <button type="button" onClick={toggleFullscreen} aria-label="Toàn màn hình" className="grid h-8 w-8 place-items-center text-white/70"><Maximize2 size={16}/></button>
        </div>
        <Timeline clips={clips} activeId={active && active.id} onSelect={id => { setActiveId(id); setToolbarMode('clip'); setActiveTool('trim'); setError('') }} onChangeClips={changeClips} playhead={playhead} onSeek={seek} settings={selected} storyMode={storyMode} />
      </div>
      {activeTool && <div className="pointer-events-auto absolute bottom-[calc(220px+env(safe-area-inset-bottom))] left-2 right-2 z-[240] max-h-[min(26dvh,calc(100dvh-300px))] overflow-hidden rounded-2xl border border-white/15 bg-[#15161d]/95 px-3 py-2 shadow-2xl backdrop-blur-xl">
        <div className="mb-2 flex items-center justify-between"><div className="text-xs font-bold">{activeToolData ? activeToolData.label : 'Công cụ'}</div><button type="button" onClick={() => setActiveTool('')} aria-label="Đóng công cụ" className="grid h-7 w-7 place-items-center rounded-full bg-white/10"><X size={14} /></button></div>
        <div className="max-h-[calc(26dvh-44px)] space-y-2 overflow-y-auto text-xs">
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" style={{ touchAction: 'pan-x' }}>
            {(activeTool === 'trim' ? [{label:'Tách clip',run:split},{label:'Tốc độ',run:()=>update({playbackSpeed: selected.playbackSpeed === 2 ? 1 : (selected.playbackSpeed || 1) + 0.25})},{label:'Âm lượng',run:()=>setActiveTool('music')},{label:'Xóa nền',run:()=>setError('Xóa nền AI cần dịch vụ xử lý ảnh/video; hiện chưa kết nối.')},{label:'Bộ lọc',run:()=>setActiveTool('filter')},{label:'Animate',run:()=>update({animate:!selected.animate})},{label:'Lật/Xoay',run:()=>update({flipHorizontal:!selected.flipHorizontal,rotation:(Number(selected.rotation||0)+90)%360})},{label:'Xóa clip',run:remove}] : activeTool === 'music' ? [{label:'Thêm nhạc nền',run:()=>audioInput.current?.click()},{label:'Ghi âm',run:()=>setError('Ghi âm voiceover chưa được cấp quyền/kết nối trong phiên bản này.')},{label:'Hiệu ứng âm thanh',run:()=>setError('Chọn tệp âm thanh trong mục Thêm nhạc nền để thêm hiệu ứng.')},{label:'Tách tiếng video',run:()=>{update({audioSource:'extract-video'});setError('Đã chọn nguồn tiếng gốc; tách thành tệp riêng cần bộ xử lý media.')}}] : activeTool === 'text' ? [{label:'Thêm chữ',run:()=>document.getElementById('studio-overlay-text')?.focus()},{label:'Phụ đề tự động',run:()=>setError('Phụ đề tự động cần dịch vụ nhận dạng giọng nói; hiện chưa kết nối.')},{label:'Chữ nghệ thuật',run:()=>update({overlayFont:'Georgia,serif',overlayFontSize:36,overlayColor:'#fef08a'})}] : activeTool === 'effects' ? [{label:'Hiệu ứng video',run:()=>setActiveTool('filter')},{label:'Hiệu ứng cơ thể',run:()=>setError('Hiệu ứng cơ thể cần mô hình AI chưa được kết nối.')},{label:'Chuyển cảnh',run:()=>update({transition:selected.transition==='fade'?'none':'fade'})}] : [] ).map(item=><button key={item.label} type="button" onClick={item.run} className="min-h-9 shrink-0 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-[10px] font-semibold text-white active:bg-white/20">{item.label}</button>)}
          </div>
          {activeTool === 'trim' && <div className="grid grid-cols-2 gap-2"><button type="button" onClick={split} className={actionButton + ' bg-white/10'}><Scissors size={15} /> Tách tại playhead</button><button type="button" onClick={remove} className={actionButton + ' bg-red-400/10 text-red-100'}><Trash2 size={15} /> Xóa đoạn chọn</button><label className="col-span-2 flex items-center gap-2 text-white/65">Thời lượng ảnh<select disabled={!active || active.kind !== 'image'} value={active && active.kind === 'image' ? clipLen(active) : 3} onChange={e => { const d = Number(e.target.value); changeClips(clips.map(c => c.id === active.id ? { ...c, out: c.in + d, sourceDuration: c.in + d } : c)) }} className="ml-auto rounded-lg bg-white/10 px-2 py-1.5 text-white"><option value="2">2 giây</option><option value="3">3 giây</option><option value="4">4 giây</option><option value="5">5 giây</option><option value="6">6 giây</option><option value="8">8 giây</option></select></label></div>}
          {activeTool === 'music' && <div className="space-y-3"><div className="flex gap-2"><input value={musicQuery} onChange={e=>setMusicQuery(e.target.value)} placeholder="Tìm nhạc nền: chill, piano..." className="min-w-0 flex-1 rounded-lg bg-white/10 px-3 py-2 text-xs text-white"/><button type="button" disabled={musicLoading} onClick={searchMusic} className="rounded-lg bg-white px-3 text-xs font-bold text-black disabled:opacity-50">{musicLoading?'...':'Tìm'}</button></div>{musicError&&<p role="status" className="text-[10px] text-amber-200">{musicError}</p>}<div className="max-h-24 space-y-1 overflow-y-auto">{musicHits.map(track=><div key={track.id} className="flex items-center gap-2 rounded-lg bg-white/[.05] p-2"><div className="min-w-0 flex-1"><div className="truncate text-[10px] font-semibold">{track.title}</div><div className="truncate text-[9px] text-white/50">{track.artist}</div></div><button type="button" onClick={()=>{const audio=new Audio(track.previewUrl);audio.play().catch(()=>setMusicError('Không phát được bản nghe thử.'))}} className="rounded bg-white/10 px-2 py-1 text-[10px]">Nghe</button><button type="button" onClick={()=>chooseMusic(track)} className="rounded bg-cyan-300 px-2 py-1 text-[10px] font-bold text-black">Chọn</button></div>)}</div><label className="flex items-center gap-2 rounded-lg bg-white/[0.05] p-2"><Music2 size={15} /><span className="min-w-0 flex-1 truncate">{selected.audioTrackTitle || 'Chưa chọn nhạc nền'}</span><input ref={audioInput} type="file" accept="audio/*,video/*" className="max-w-[150px] text-[10px]" onChange={e => { const f = e.currentTarget.files && e.currentTarget.files[0]; if (f) update({ audioTrackTitle: f.name, audioTrackFile: f, audioTrackUrl: URL.createObjectURL(f), audioSource: f.type.startsWith('video/') ? 'extract-video' : 'upload' }); e.currentTarget.value = '' }} /></label><label className="block text-white/70">Âm lượng tiếng gốc · {selected.originalVolume ?? 100}%<input className={rangeClass} type="range" min="0" max="100" value={selected.originalVolume ?? 100} onChange={e => update({ originalVolume: Number(e.target.value) })} /></label><label className="block text-white/70">Âm lượng nhạc · {selected.musicVolume ?? 30}%<input className={rangeClass} type="range" min="0" max="100" value={selected.musicVolume ?? 30} onChange={e => update({ musicVolume: Number(e.target.value) })} /></label><p className="text-[10px] text-amber-100/70">Âm thanh gốc và nhạc nền sẽ được trộn khi trình duyệt hỗ trợ Web Audio. Nếu xuất lỗi, hãy thử Chrome Android mới nhất.</p></div>}
          {activeTool === 'text' && <div className="space-y-2"><input id="studio-overlay-text" maxLength={120} value={selected.overlayText || ''} onChange={e => update({ overlayText: e.target.value })} placeholder="Nhập văn bản trên video" className="w-full rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-sm" /><div className="grid grid-cols-3 gap-2"><label className="text-white/60">Màu chữ<input type="color" value={selected.overlayColor || '#ffffff'} onChange={e => update({ overlayColor: e.target.value })} className="mt-1 h-8 w-full rounded bg-transparent" /></label><label className="text-white/60">Cỡ chữ<select value={selected.overlayFontSize || 28} onChange={e => update({ overlayFontSize: Number(e.target.value) })} className="mt-1 w-full rounded bg-white/10 px-2 py-2 text-white"><option value="18">18</option><option value="24">24</option><option value="28">28</option><option value="36">36</option><option value="48">48</option></select></label><label className="text-white/60">Kiểu chữ<select value={selected.overlayFont || 'Arial,sans-serif'} onChange={e => update({ overlayFont: e.target.value })} className="mt-1 w-full rounded bg-white/10 px-2 py-2 text-white"><option value="Arial,sans-serif">Đậm</option><option value="Georgia,serif">Cổ điển</option><option value="monospace">Neon</option></select></label></div></div>}
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

      <nav className="relative z-20 shrink-0 border-t border-white/10 bg-[#101116] px-1 pb-2 pt-2">
        <div className="grid grid-cols-6 gap-1">
          <button type="button" onClick={()=>{setToolbarMode('clip');setActiveTool('trim')}} className={'flex touch-manipulation min-h-11 flex-col items-center justify-center gap-1 rounded-xl py-2 text-[10px] '+(activeTool==='trim'?'bg-white/10 text-white':'text-white/55')}><Scissors size={19}/><span>Chỉnh sửa</span></button>
          <button type="button" onClick={()=>toolClick('music')} className={'flex touch-manipulation min-h-11 flex-col items-center justify-center gap-1 rounded-xl py-2 text-[10px] '+(activeTool==='music'?'bg-white/10 text-white':'text-white/55')}><Music2 size={19}/><span>Âm thanh</span></button>
          <button type="button" onClick={()=>toolClick('text')} className={'flex touch-manipulation min-h-11 flex-col items-center justify-center gap-1 rounded-xl py-2 text-[10px] '+(activeTool==='text'?'bg-white/10 text-white':'text-white/55')}><Type size={19}/><span>Văn bản</span></button>
          <button type="button" onClick={()=>toolClick('effects')} className={'flex touch-manipulation min-h-11 flex-col items-center justify-center gap-1 rounded-xl py-2 text-[10px] '+(activeTool==='effects'?'bg-white/10 text-white':'text-white/55')}><Sparkles size={19}/><span>Hiệu ứng</span></button>
          <button type="button" onClick={()=>setStudioOpen(true)} className="flex touch-manipulation min-h-11 flex-col items-center justify-center gap-1 rounded-xl py-2 text-[10px] text-cyan-200"><WandSparkles size={19}/><span>Video AI</span></button>
          <button type="button" onClick={()=>setStudioOpen(true)} className="flex touch-manipulation min-h-11 flex-col items-center justify-center gap-1 rounded-xl py-2 text-[10px] text-white/55"><Film size={19}/><span>Mẫu</span></button>
        </div>
      </nav>
    </div>
    {studioOpen && <StudioCreationTools initialImage={active?.kind === 'image' ? active.file : null} onInsert={insertGenerated} onClose={() => setStudioOpen(false)} />}
    {error && <div role="alert" className="absolute left-3 right-3 top-16 z-[220] rounded-xl border border-red-300/30 bg-[#321b20] px-3 py-2 text-xs text-red-100 shadow-lg">{error}<button type="button" onClick={() => setError('')} className="ml-2 underline">Đóng</button></div>}
    {exportedFile && <div className="absolute left-3 right-3 top-16 z-[210] rounded-xl border border-emerald-300/25 bg-[#12251e] px-3 py-2 text-xs text-emerald-100">Đã xuất video · {(exportedFile.size / 1024 / 1024).toFixed(1)} MB</div>}
  </section></>, document.body)
}
