// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { exportToBlob, blobToVideoFile } from './timelineExport'
import { AudioLines, Music2, Pause, Play, Type, Scissors, Trash2, ChevronUp, ChevronDown, ImagePlus, Plus } from 'lucide-react'

const clamp = (n, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(n)) ? Number(n) : min))
const fmt = (seconds, tenths = false) => {
  const s = Math.max(0, Number(seconds) || 0)
  const mm = Math.floor(s / 60), ss = Math.floor(s % 60)
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}${tenths ? '.' + Math.floor((s % 1) * 10) : ''}`
}
const makeClip = file => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, kind: file?.type?.startsWith('image/') ? 'image' : 'video', sourceDuration: file?.type?.startsWith('image/') ? 3 : 0, in: 0, out: file?.type?.startsWith('image/') ? 3 : 0 })
const clipLen = c => Math.max(0.1, (Number(c.out) || Number(c.sourceDuration) || 3) - (Number(c.in) || 0))

export function MediaPicker({ onFiles, disabled = false }) {
  const input = useRef(null)
  return <><input ref={input} hidden type="file" accept="image/*,video/*" multiple disabled={disabled} onChange={e => {
    const picked = Array.from(e.currentTarget.files || [])
    const images = picked.filter(f => f.type.startsWith('image/'))
    const videos = picked.filter(f => f.type.startsWith('video/'))
    onFiles?.([...images, ...videos.slice(0, 1)])
    e.currentTarget.value = ''
  }}/><button type="button" disabled={disabled} onClick={() => input.current?.click()} className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 text-xs font-semibold disabled:opacity-40"><ImagePlus size={15}/>Chọn ảnh hoặc video</button></>
}

export function PreviewPlayer({ file, videoRef, isPlaying, onTogglePlayback, settings = {}, onSettingsChange }) {
  const sourceUrl = useMemo(() => file ? URL.createObjectURL(file) : '', [file])
  useEffect(() => () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl) }, [sourceUrl])
  const drag = useRef(false)
  const [position, setPosition] = useState({ x: Number(settings.overlayX ?? 50), y: Number(settings.overlayY ?? 50) })
  useEffect(() => setPosition({ x: Number(settings.overlayX ?? 50), y: Number(settings.overlayY ?? 50) }), [settings.overlayX, settings.overlayY])
  const moveText = e => {
    if (!drag.current) return
    const r = e.currentTarget.getBoundingClientRect()
    const next = { x: clamp((e.clientX-r.left)/r.width*100, 2, 98), y: clamp((e.clientY-r.top)/r.height*100, 4, 96) }
    setPosition(next); onSettingsChange?.({ overlayX: next.x, overlayY: next.y })
  }
  return <div className="relative mx-auto flex aspect-[9/16] max-h-[34vh] w-full max-w-[250px] items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-black">
    {file?.type?.startsWith('video/') ? <video key={sourceUrl} ref={videoRef} src={sourceUrl} playsInline preload="auto" className="h-full w-full object-contain" /> : sourceUrl ? <img src={sourceUrl} alt="Xem trước slideshow" className="h-full w-full object-contain"/> : <span className="text-xs text-white/45">Chọn media để bắt đầu</span>}
    {settings.overlayText && <div onPointerDown={e=>{drag.current=true;e.currentTarget.setPointerCapture?.(e.pointerId)}} onPointerMove={moveText} onPointerUp={()=>{drag.current=false}} onPointerCancel={()=>{drag.current=false}} className="absolute max-w-[90%] cursor-move select-none rounded bg-black/20 px-2 py-1 text-center font-bold drop-shadow-lg touch-none" style={{left:`${position.x}%`,top:`${position.y}%`,transform:'translate(-50%,-50%)',color:settings.overlayColor||'#ffffff',fontSize:`${clamp(settings.overlayFontSize||28,12,72)}px`}}>{settings.overlayText}</div>}
    <button type="button" onClick={onTogglePlayback} className="absolute bottom-2 left-2 grid h-9 w-9 place-items-center rounded-full bg-black/60" aria-label={isPlaying?'Tạm dừng':'Phát'}>{isPlaying?<Pause size={17}/>:<Play size={17}/>}</button>
  </div>
}

export function AudioTrack({ settings = {}, onChange, onOpenTool }) {
  const input = useRef(null), update = patch => onChange?.({...settings,...patch})
  return <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
    <div className="flex items-center gap-2"><Music2 size={15}/><span className="min-w-0 flex-1 truncate text-xs font-semibold">{settings.audioTrackTitle||'Nhạc nền chưa chọn'}</span><input ref={input} hidden type="file" accept="audio/*" onChange={e=>{const f=e.currentTarget.files?.[0];if(f)update({audioTrackTitle:f.name,audioTrackFile:f,audioTrackUrl:URL.createObjectURL(f),audioSource:'upload'});e.currentTarget.value=''}}/><button type="button" onClick={()=>input.current?.click()} className="shrink-0 rounded bg-white/10 px-2 py-1.5 text-[11px]">Tải nhạc</button><button type="button" onClick={()=>onOpenTool?.('music')} className="shrink-0 rounded bg-white/10 px-2 py-1.5 text-[11px]">Thư viện</button></div>
    <label className="flex items-center gap-2 text-[11px] text-white/70">Âm lượng gốc<input aria-label="Âm lượng video gốc" className="min-w-0 flex-1 accent-cyan-400" type="range" min="0" max="100" value={settings.originalVolume??100} onChange={e=>update({originalVolume:Number(e.target.value)})}/><span className="w-8 text-right">{settings.originalVolume??100}%</span></label>
    <label className="flex items-center gap-2 text-[11px] text-white/70">Âm lượng nhạc<input aria-label="Âm lượng nhạc nền" className="min-w-0 flex-1 accent-cyan-400" type="range" min="0" max="100" value={settings.musicVolume??70} onChange={e=>update({musicVolume:Number(e.target.value)})}/><span className="w-8 text-right">{settings.musicVolume??70}%</span></label>
  </div>
}

export function TextOverlayEditor({ settings = {}, onChange }) {
  const update = patch => onChange?.({...settings,...patch})
  return <div className="grid grid-cols-[1fr_auto_auto] gap-2"><input value={settings.overlayText||''} onChange={e=>update({overlayText:e.target.value})} placeholder="+ Thêm văn bản" className="min-w-0 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"/><input aria-label="Màu chữ" type="color" value={settings.overlayColor||'#ffffff'} onChange={e=>update({overlayColor:e.target.value})} className="h-10 w-10 rounded bg-transparent"/><select aria-label="Cỡ chữ" value={settings.overlayFontSize||28} onChange={e=>update({overlayFontSize:Number(e.target.value)})} className="max-w-[88px] rounded-lg bg-[#24262d] px-2 text-xs text-white"><option value="18">18 px</option><option value="24">24 px</option><option value="28">28 px</option><option value="36">36 px</option><option value="48">48 px</option></select></div>
}

export function Toolbar({ onOpenTool, onSplit, onDelete, onMoveUp, onMoveDown, onExport, exporting }) {
  const items=[{id:'split',label:'Tách',icon:<Scissors size={18}/>,action:onSplit},{id:'music',label:'Âm thanh',icon:<Music2 size={18}/>},{id:'text',label:'Văn bản',icon:<Type size={18}/>},{id:'effects',label:'Hiệu ứng',icon:<Plus size={18}/>},{id:'up',label:'Lên',icon:<ChevronUp size={18}/>,action:onMoveUp},{id:'down',label:'Xuống',icon:<ChevronDown size={18}/>,action:onMoveDown},{id:'delete',label:'Xóa',icon:<Trash2 size={18}/>,action:onDelete}]
  return <div className="flex shrink-0 snap-x snap-mandatory gap-1 overflow-x-auto border-t border-white/10 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{items.map(it=><button key={it.id} type="button" onClick={it.action||(()=>onOpenTool?.(it.id))} className="flex w-[68px] shrink-0 snap-start flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11px] text-white/75 active:bg-white/10">{it.icon}<span className="whitespace-nowrap">{it.label}</span></button>)}<button type="button" disabled={exporting} onClick={onExport} className="ml-auto flex shrink-0 items-center rounded-lg bg-cyan-400 px-3 py-2 text-xs font-bold text-black disabled:opacity-50">{exporting?'Đang xuất…':'Xuất'}</button></div>
}

export function Timeline({ clips, activeId, onSelect, onChangeClips, playhead, onSeek, storyMode = false }) {
  const rail=useRef(null), drag=useRef(null)
  const urls=useMemo(()=>new Map(clips.filter(c=>c.kind==='video').map(c=>[c.id,URL.createObjectURL(c.file)])),[clips.map(c=>c.id).join('|')])
  useEffect(()=>()=>urls.forEach(url=>URL.revokeObjectURL(url)),[urls])
  const active=clips.find(c=>c.id===activeId)||clips[0], total=clips.reduce((s,c)=>s+clipLen(c),0)
  const idx=clips.findIndex(c=>c.id===active?.id), activeStart=clips.slice(0,Math.max(0,idx)).reduce((s,c)=>s+clipLen(c),0)
  const startDrag=(e,mode)=>{e.preventDefault();e.stopPropagation();drag.current=mode;e.currentTarget.setPointerCapture?.(e.pointerId)}
  const pointerMove=e=>{
    if(!drag.current||!rail.current)return
    const r=rail.current.getBoundingClientRect(), t=clamp((e.clientX-r.left)/r.width,0,1)*total
    if(drag.current==='playhead'){onSeek(t);return}
    if(!active)return
    const local=clamp(t-activeStart,0,active.sourceDuration||active.out||3), next=clips.slice(), i=next.findIndex(c=>c.id===active.id)
    if(drag.current==='in')next[i]={...active,in:clamp(local,0,Math.max(0,active.out-.25))}
    if(drag.current==='out')next[i]={...active,out:clamp(local,active.in+.25,active.sourceDuration||3)}
    onChangeClips(next)
  }
  return <div className="space-y-2"><div className="flex items-center justify-between gap-2 text-[11px]"><span className="font-mono">{fmt(playhead,true)} / {fmt(total)}</span><span className="text-white/45">Nguồn: {fmt(clips.reduce((m,c)=>Math.max(m,c.sourceDuration||0),0))}</span></div>
    <div ref={rail} onPointerMove={pointerMove} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null} onClick={e=>{if(drag.current)return;const r=rail.current.getBoundingClientRect();onSeek(clamp((e.clientX-r.left)/r.width,0,1)*total)}} className="relative flex h-[76px] touch-none select-none overflow-visible rounded-md bg-[#252730]">
      {clips.map((c,i)=>{const d=clipLen(c);return <button key={c.id} type="button" onClick={e=>{e.stopPropagation();onSelect(c.id);onSeek(clips.slice(0,i).reduce((s,x)=>s+clipLen(x),0))}} className={`relative min-w-0 overflow-hidden border-r border-black/50 text-left ${c.id===activeId?'ring-2 ring-inset ring-amber-300':''}`} style={{width:`${d/Math.max(total,.1)*100}%`}}>{c.kind==='image'?<div className="flex h-full items-center justify-center bg-[#343744] text-[10px] text-white/75"><ImagePlus size={15}/></div>:<video muted playsInline preload="metadata" src={urls.get(c.id)} className="h-full w-full object-cover opacity-75"/>}<span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 text-[9px]">{i+1} · {fmt(d)}</span></button>})}
      {active&&<><div onPointerDown={e=>startDrag(e,'in')} role="slider" aria-label="Trim start" aria-valuenow={active.in} tabIndex={0} className="absolute inset-y-0 z-20 w-3 cursor-ew-resize rounded-l border-2 border-amber-200 bg-amber-300 touch-none" style={{left:`${activeStart/Math.max(total,.1)*100}%`}}/><div onPointerDown={e=>startDrag(e,'out')} role="slider" aria-label="Trim end" aria-valuenow={active.out} tabIndex={0} className="absolute inset-y-0 z-20 w-3 cursor-ew-resize rounded-r border-2 border-amber-200 bg-amber-300 touch-none" style={{left:`${(activeStart+clipLen(active))/Math.max(total,.1)*100}%`}}/></>}
      <div onPointerDown={e=>startDrag(e,'playhead')} role="slider" aria-label="Playhead" aria-valuemin={0} aria-valuemax={total} aria-valuenow={clamp(playhead,0,total)} tabIndex={0} className="absolute inset-y-[-3px] z-30 w-4 -translate-x-1/2 cursor-ew-resize touch-none" style={{left:`${clamp(playhead/Math.max(total,.1),0,1)*100}%`}}><div className="mx-auto h-full w-[2px] bg-white shadow-[0_0_4px_black]"/></div>
    </div>{storyMode&&total>60&&<p role="alert" className="text-xs text-amber-200">Story dài {fmt(total)}. Hãy cắt xuống tối đa 01:00 trước khi xuất.</p>}</div>
}

export function VideoTimelineEditor({ file, files: filesProp, settings, onChange, videoRef, isPlaying, onTogglePlayback, onOpenTool, trimModeActive = false, storyMode = false, onExport, onPublishStory, onContinuePost }) {
  const initialFiles=(filesProp?.length?filesProp:file?[file]:[]).filter(f=>f?.type?.startsWith('image/')||f?.type?.startsWith('video/'))
  const [clips,setClips]=useState(()=>initialFiles.map(makeClip)),[activeId,setActiveId]=useState(null),[playhead,setPlayhead]=useState(0),[error,setError]=useState(''),[exporting,setExporting]=useState(false),[exportedFile,setExportedFile]=useState(null)
  const selected=settings||{},active=clips.find(c=>c.id===activeId)||clips[0]
  const total=clips.reduce((s,c)=>s+clipLen(c),0), activeIndex=clips.findIndex(c=>c.id===active?.id),activeStart=clips.slice(0,Math.max(0,activeIndex)).reduce((s,c)=>s+clipLen(c),0)
  const update=patch=>onChange?.({...selected,...patch})
  useEffect(()=>{if(!activeId&&clips[0])setActiveId(clips[0].id)},[clips,activeId])
  useEffect(()=>{
    let cancelled=false
    clips.filter(c=>c.kind==='video'&&!c.sourceDuration).forEach(c=>{const url=URL.createObjectURL(c.file),v=document.createElement('video');v.preload='metadata';v.src=url;v.onloadedmetadata=()=>{const d=Number(v.duration);if(!cancelled&&Number.isFinite(d)&&d>0)setClips(prev=>prev.map(x=>x.id===c.id?{...x,sourceDuration:d,out:d}:x));URL.revokeObjectURL(url)};v.onerror=()=>URL.revokeObjectURL(url)})
    return()=>{cancelled=true}
  },[clips.map(c=>c.id+':'+c.sourceDuration).join('|')])
  useEffect(()=>{
    const v=videoRef?.current
    if(!v||!active||active.kind!=='video')return
    const sync=()=>{if(Number.isFinite(v.duration)&&v.duration>0)setClips(prev=>prev.map(c=>c.id===active.id?{...c,sourceDuration:v.duration,out:c.out>0?Math.min(c.out,v.duration):v.duration}:c));const t=clamp(activeStart+v.currentTime-active.in,0,total);setPlayhead(t)}
    v.addEventListener('loadedmetadata',sync);v.addEventListener('durationchange',sync);v.addEventListener('timeupdate',sync);v.addEventListener('seeked',sync);sync()
    return()=>{v.removeEventListener('loadedmetadata',sync);v.removeEventListener('durationchange',sync);v.removeEventListener('timeupdate',sync);v.removeEventListener('seeked',sync)}
  },[active?.id,videoRef,activeStart,total])
  useEffect(()=>{const v=videoRef?.current;if(!v||!active||active.kind!=='video')return;const t=clamp(playhead-activeStart+active.in,active.in,active.out||active.sourceDuration||0);if(Number.isFinite(t)&&Math.abs(v.currentTime-t)>.035){try{v.currentTime=t}catch{}}},[playhead,active?.id,activeStart,active?.in,active?.out,videoRef])
  const seek=t=>setPlayhead(clamp(t,0,total))
  const changeClips=next=>{setClips(next);const c=next.find(x=>x.id===activeId);if(c)update({trimStart:c.in,trimEnd:c.out,timelineClips:next})}
  const addFiles=picked=>{const imgs=picked.filter(f=>f.type.startsWith('image/')),vids=picked.filter(f=>f.type.startsWith('video/'));const haveVideo=clips.some(c=>c.kind==='video');const accepted=[...imgs,...(haveVideo?[]:vids.slice(0,1))].map(makeClip);if(!accepted.length){setError('Chỉ hỗ trợ ảnh và tối đa một video trong phiên này.');return}setClips(prev=>[...prev,...accepted]);setError('')}
  const split=()=>{if(!active||active.kind!=='video'){setError('Chọn một video để tách.');return}const local=active.in+playhead-activeStart;if(local<=active.in+.15||local>=active.out-.15){setError('Đưa playhead vào giữa clip rồi chọn Tách.');return}const a={...active,id:makeClip(active.file).id,out:local},b={...active,id:makeClip(active.file).id,in:local};setClips(prev=>[...prev.slice(0,activeIndex),a,b,...prev.slice(activeIndex+1)]);setActiveId(b.id);setError('')}
  const remove=()=>{if(!active)return;const next=clips.filter(c=>c.id!==active.id);setClips(next);setActiveId(next[0]?.id||null);setPlayhead(0)}
  const move=delta=>{const i=clips.findIndex(c=>c.id===activeId),j=i+delta;if(i<0||j<0||j>=clips.length)return;const next=clips.slice();[next[i],next[j]]=[next[j],next[i]];setClips(next)}
  const exportAction=async({forStory=false}={})=>{
    if(!clips.length){setError('Hãy chọn ảnh hoặc video.');return null}
    if((forStory||storyMode)&&total>60){setError('Tin 24 giờ chỉ được dài tối đa 60 giây. Hãy trim timeline rồi thử lại.');return null}
    setExporting(true);setError('')
    try{
      const blob=await exportToBlob(clips,selected,{storyMode:forStory||storyMode})
      const output=blobToVideoFile(blob, 'd-social-edited')
      setExportedFile(output)
      if(onExport) await onExport({blob,file:output,clips,settings:selected,duration:total})
      return output
    }catch(e){setError(e?.message||'Xuất video thất bại. Hãy thử lại bằng Chrome Android mới nhất.');return null}
    finally{setExporting(false)}
  }
  const ensureExported=async forStory=>exportedFile||await exportAction({forStory})
  const publishStory=async()=>{if(exporting)return;const output=await ensureExported(true);if(!output)return;if(!onPublishStory){setError('Chưa kết nối luồng đăng Story trong Composer.');return}setExporting(true);setError('');try{await onPublishStory(output)}catch(e){setError(e?.message||'Không đăng được tin.')}finally{setExporting(false)}}
  const continuePost=async()=>{if(exporting)return;const output=await ensureExported(false);if(!output)return;if(!onContinuePost){onOpenTool?.('publish');return}try{await onContinuePost(output)}catch(e){setError(e?.message||'Không thể chuyển sang bước đăng bài.')}}
  return <section className="pointer-events-auto mx-2 mb-2 max-h-[74vh] space-y-3 overflow-y-auto rounded-t-[18px] border border-white/15 bg-[#101115]/[.98] p-3 text-white shadow-xl">
    <div className="flex items-center justify-between gap-2"><div className="min-w-0"><div className="text-sm font-bold">D-Social Studio</div><div className="text-[11px] text-white/50">Video gốc {fmt(active?.sourceDuration||0)} · Timeline {fmt(total)}</div></div><MediaPicker onFiles={addFiles}/></div>
    <PreviewPlayer file={active?.file||file} videoRef={videoRef} isPlaying={isPlaying} onTogglePlayback={onTogglePlayback} settings={selected} onSettingsChange={update}/>
    <Timeline clips={clips} activeId={active?.id} onSelect={id=>{setActiveId(id);setError('')}} onChangeClips={changeClips} playhead={playhead} onSeek={seek} storyMode={storyMode}/>
    <div className="flex items-center justify-between gap-2 text-[11px] text-white/60"><span className="min-w-0 truncate">{active?.file?.name||'Chưa chọn media'}</span>{active&&<label className="flex shrink-0 items-center gap-1">Ảnh <select disabled={active.kind!=='image'} value={clipLen(active)} onChange={e=>{const d=Number(e.target.value);changeClips(clips.map(c=>c.id===active.id?{...c,out:c.in+d,sourceDuration:c.in+d}:c))}} className="rounded bg-white/10 px-1.5 py-1"><option value="2">2s</option><option value="3">3s</option><option value="4">4s</option><option value="5">5s</option><option value="6">6s</option><option value="8">8s</option></select></label>}</div>
    <AudioTrack settings={selected} onChange={update} onOpenTool={onOpenTool}/><TextOverlayEditor settings={selected} onChange={update}/>
    <Toolbar onOpenTool={onOpenTool} onSplit={split} onDelete={remove} onMoveUp={()=>move(-1)} onMoveDown={()=>move(1)} onExport={exportAction} exporting={exporting}/>
    {error&&<p role="alert" className="break-words rounded-lg border border-red-400/30 bg-red-500/10 p-2 text-xs text-red-100">{error}</p>}
    {exportedFile&&<p className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 p-2 text-xs text-emerald-100">Đã xuất video ({(exportedFile.size/1024/1024).toFixed(1)} MB). Anh có thể xuất lại sau khi chỉnh sửa.</p>}
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3"><button type="button" disabled={exporting||!clips.length||(storyMode&&total>60)} onClick={()=>exportAction()} className="rounded-lg border border-white/15 px-3 py-3 text-sm font-semibold disabled:opacity-40">{exporting?'Đang xuất…':'Xuất video'}</button><button type="button" disabled={exporting||!clips.length||total>60} onClick={publishStory} className="rounded-lg bg-cyan-400 px-3 py-3 text-sm font-bold text-black disabled:opacity-40">{exporting?'Đang xử lý…':'Đăng tin 24h'}</button><button type="button" disabled={exporting||!clips.length} onClick={continuePost} className="rounded-lg border border-white/15 px-3 py-3 text-sm font-semibold disabled:opacity-40">{exporting?'Đang xử lý…':'Tiếp → / Đăng bài viết'}</button></div>
    <p className="text-[10px] leading-4 text-white/40">Video được kết xuất thành WebM/MP4 trong trình duyệt. Âm thanh nền hiện chưa được trộn vào tệp kết xuất.</p>
  </section>
}
