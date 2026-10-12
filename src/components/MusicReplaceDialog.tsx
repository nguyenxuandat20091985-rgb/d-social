// @ts-nocheck
import React, { useState } from 'react'
import { Search, Music2, Play } from 'lucide-react'

export function MusicReplaceDialog({ onClose, onSelect }) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const search = async event => {
    event?.preventDefault?.()
    setBusy(true); setError('')
    try {
      const params = new URLSearchParams({ q: query.trim(), order: query.trim() ? 'popular' : 'latest' })
      const response = await fetch('/api/pixabay/audio?' + params.toString())
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Không tải được thư viện nhạc.')
      setHits(data.hits || [])
      if (!data.hits?.length) setError('Không có bản nhạc phù hợp.')
    } catch (e) { setError(e?.message || 'Không kết nối được Pixabay.') }
    finally { setBusy(false) }
  }

  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3" role="dialog" aria-modal="true" aria-label="Đổi bài hát" onClick={e => { if (e.target === e.currentTarget) onClose?.() }}>
    <section className="d-card w-full max-w-lg max-h-[85dvh] overflow-y-auto p-4">
      <div className="flex items-center justify-between gap-2"><h2 className="font-black text-lg"><Music2 size={18} className="inline mr-2"/>Đổi bài hát</h2><button type="button" className="d-icon-btn" onClick={onClose} aria-label="Đóng">×</button></div>
      <p className="text-xs d-muted mt-1 mb-3">Chọn nhạc thay thế. Âm thanh gốc sẽ bị tắt trong trình phát này.</p>
      <form onSubmit={search} className="flex gap-2"><input className="d-input min-w-0 flex-1" value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm nhạc nền…"/><button type="submit" disabled={busy} className="d-btn-primary px-3"><Search size={17}/></button></form>
      {busy && <p className="text-sm d-muted mt-3">Đang tìm…</p>}
      {error && <p className="text-sm mt-3" role="status" style={{ color: 'var(--d-warning)' }}>{error}</p>}
      <div className="mt-3 space-y-2">{hits.map(track => <div key={track.id} className="flex items-center gap-2 rounded-xl border p-2" style={{ borderColor: 'var(--d-border)' }}>
        <audio id={'replace-preview-' + track.id} src={track.previewUrl} preload="none" className="hidden"/>
        <span className="grid h-9 w-9 place-items-center rounded-full" style={{ background: 'var(--d-primary-soft)', color: 'var(--d-primary)' }}><Play size={15}/></span>
        <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{track.title}</div><div className="truncate text-xs d-muted">{track.artist}</div><a href={track.pageUrl} target="_blank" rel="noreferrer" className="text-xs underline">Nguồn Pixabay</a></div>
        <button type="button" className="d-btn-primary px-3 py-2 text-xs" onClick={() => onSelect(track)}>Dùng nhạc</button>
      </div>)}</div>
      <button type="button" className="d-btn w-full mt-4" onClick={onClose}>Đóng</button>
    </section>
  </div>
}
