import React, { useState } from 'react'
import { Share2, Link2, Facebook } from 'lucide-react'
import { sharePost, facebookShareUrl, zaloShareUrl, copyLink, postPublicUrl } from '../lib/share'

type Props = { postId: string; text?: string | null; author?: string | null }

export function ShareMenu({ postId, text, author }: Props) {
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState('')
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2000) }
  const onNative = async () => {
    const r = await sharePost({ postId, text, author })
    if (r.ok) { setOpen(false); return }
    setOpen(true)
  }
  const onCopy = async () => {
    const ok = await copyLink(postId)
    showToast(ok ? 'Đã sao chép liên kết' : 'Không sao chép được')
    setOpen(false)
  }
  return (
    <div className="relative">
      <button type="button" onClick={onNative} className="flex gap-2 items-center text-slate-400 hover:text-white" aria-label="Chia sẻ">
        <Share2 size={19} /><span className="text-sm hidden sm:inline">Chia sẻ</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 bottom-full mb-2 z-40 w-56 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-xl">
            <a href={facebookShareUrl(postId)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-800" onClick={() => setOpen(false)}>
              <Facebook size={16} /> Facebook
            </a>
            <a href={zaloShareUrl(postId)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-800" onClick={() => setOpen(false)}>
              <span className="w-4 h-4 grid place-items-center font-bold text-blue-400">Z</span> Zalo
            </a>
            <button type="button" onClick={onCopy} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-800">
              <Link2 size={16} /> Sao chép liên kết
            </button>
            <p className="px-3 pt-1 text-[10px] text-slate-500 break-all">{postPublicUrl(postId)}</p>
          </div>
        </>
      )}
      {toast && <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 rounded-full bg-emerald-600 px-4 py-2 text-sm shadow-lg">{toast}</div>}
    </div>
  )
}
