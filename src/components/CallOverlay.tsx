// @ts-nocheck
import React, { useEffect, useRef, useState } from 'react'
import { Phone, Video, Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, X } from 'lucide-react'
import { io } from 'socket.io-client'

const SIGNALING_SERVER = 'https://d-xphone-signaling.onrender.com'
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10,
}

export default function CallOverlay({ userId, peer, conversationId, video = false, onClose, onEnd }) {
  const localVideo = useRef(null), remoteVideo = useRef(null)
  const socketRef = useRef(null), pcRef = useRef(null), streamRef = useRef(null)
  const roomRef = useRef(''), remoteSocketRef = useRef(null), initiatorRef = useRef(false)
  const [status, setStatus] = useState('Đang kết nối...')
  const [mic, setMic] = useState(true)
  const [cam, setCam] = useState(video)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const connectedRef = useRef(false)
  const endedRef = useRef(false)

  useEffect(() => {
    let alive = true
    const rawRoom = conversationId
      ? String(conversationId)
      : [userId, peer.id].sort().map(v => String(v).replace(/[^a-zA-Z0-9_-]/g, '')).join('_')
    const roomId = `dm-${rawRoom.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 57)}`
    roomRef.current = roomId
    let timer = null

    const cleanup = () => {
      if (timer) clearInterval(timer)
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      if (remoteVideo.current?.srcObject) remoteVideo.current.srcObject.getTracks().forEach(t => t.stop())
      remoteVideo.current && (remoteVideo.current.srcObject = null)
      localVideo.current && (localVideo.current.srcObject = null)
      if (pcRef.current) { pcRef.current.close(); pcRef.current = null }
      if (socketRef.current) { socketRef.current.removeAllListeners(); socketRef.current.disconnect(); socketRef.current = null }
    }

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Thiết bị/trình duyệt không hỗ trợ gọi')
        const stream = await navigator.mediaDevices.getUserMedia({
          video: video ? { width:{ideal:1280,max:1920}, height:{ideal:720,max:1080}, facingMode:'user', frameRate:{ideal:24,max:30} } : false,
          audio: { echoCancellation:true, noiseSuppression:true, autoGainControl:true }
        })
        if (!alive) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (localVideo.current) localVideo.current.srcObject = stream
        setCam(video)

        const tokenRes = await fetch(`${SIGNALING_SERVER}/token`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({ userId: String(userId), roomId })
        })
        if (!tokenRes.ok) throw new Error('Máy chủ cuộc gọi không cấp được phiên')
        const token = (await tokenRes.json()).token
        if (!token) throw new Error('Phiên cuộc gọi không hợp lệ')

        const socket = io(SIGNALING_SERVER, {
          transports:['websocket','polling'],
          auth: token ? { token } : {},
          reconnection:true, reconnectionAttempts:8, reconnectionDelay:1000, timeout:15000
        })
        socketRef.current = socket

        const createPc = () => {
          if (pcRef.current) pcRef.current.close()
          const pc = new RTCPeerConnection(ICE_SERVERS)
          pcRef.current = pc
          stream.getTracks().forEach(t => pc.addTrack(t, stream))
          pc.ontrack = e => {
            if (remoteVideo.current && remoteVideo.current.srcObject !== e.streams[0]) remoteVideo.current.srcObject = e.streams[0]
            setStatus('Đã kết nối')
          }
          pc.onicecandidate = e => {
            if (e.candidate) socket.emit('ice-candidate',{roomId,candidate:e.candidate,to:remoteSocketRef.current||undefined})
          }
          pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'connected') {
              setStatus('Đã kết nối')
              connectedRef.current = true
              if (!timer) { const started=Date.now(); timer=setInterval(()=>setElapsed(Math.floor((Date.now()-started)/1000)),1000) }
            } else if (pc.connectionState === 'failed') setStatus('Kết nối thất bại')
            else if (pc.connectionState === 'disconnected') setStatus('Kết nối gián đoạn...')
          }
          return pc
        }
        const sendOffer = async () => {
          const pc = pcRef.current || createPc()
          const offer = await pc.createOffer({ offerToReceiveAudio:true, offerToReceiveVideo:video })
          await pc.setLocalDescription(offer)
          socket.emit('offer',{roomId,offer,to:remoteSocketRef.current||undefined})
        }

        socket.on('connect', () => {
          setStatus('Đang tìm người nhận cuộc gọi...')
          socket.emit('join-room',{roomId,userId})
        })
        socket.on('connect_error', () => setStatus('Không kết nối được máy chủ cuộc gọi'))
        socket.on('room-joined', ({clientsCount,isInitiator}) => {
          initiatorRef.current = isInitiator
          setStatus(clientsCount === 1 ? 'Đang chờ đối phương...' : 'Đang thiết lập...')
          createPc()
        })
        socket.on('user-joined', async ({socketId}) => {
          remoteSocketRef.current = socketId
          setStatus('Đối phương đã vào, đang kết nối...')
          await sendOffer()
        })
        socket.on('offer', async ({offer,from}) => {
          remoteSocketRef.current = from
          const pc = pcRef.current || createPc()
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer))
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            socket.emit('answer',{roomId,answer,to:from})
          } catch(e) { setStatus('Lỗi thiết lập cuộc gọi') }
        })
        socket.on('answer', async ({answer}) => {
          try {
            if (pcRef.current && pcRef.current.signalingState !== 'stable') await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer))
          } catch {}
        })
        socket.on('ice-candidate', async ({candidate}) => {
          try { if (candidate && pcRef.current) await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)) } catch {}
        })
        socket.on('user-left', () => {
          setStatus('Đối phương đã rời cuộc gọi')
          if (remoteVideo.current?.srcObject) { remoteVideo.current.srcObject.getTracks().forEach(t=>t.stop()); remoteVideo.current.srcObject=null }
        })
        socket.on('error', e => setError(e?.message || 'Lỗi cuộc gọi'))
      } catch (e) {
        if (alive) { setError(e?.message || 'Không thể bắt đầu cuộc gọi'); setStatus('Không thể bắt đầu') }
      }
    }
    start()
    return () => { alive=false; cleanup() }
  }, [userId, peer.id, video])

  const toggleMic = () => {
    const next=!mic; setMic(next)
    streamRef.current?.getAudioTracks().forEach(t=>t.enabled=next)
  }
  const toggleCam = () => {
    const next=!cam; setCam(next)
    streamRef.current?.getVideoTracks().forEach(t=>t.enabled=next)
  }
  const hangup = () => {
    if (endedRef.current) return
    endedRef.current = true
    try { socketRef.current?.emit('leave-room',{roomId:roomRef.current}) } catch {}
    const duration = elapsed
    onEnd?.({ status: connectedRef.current ? 'completed' : 'missed', duration, video })
    onClose?.()
  }

  const name = peer.full_name || peer.username || 'Người dùng'
  const clock = `${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(elapsed%60).padStart(2,'0')}`

  return <div style={{position:'fixed',inset:0,zIndex:9999,background:'#080b12',color:'#fff',display:'flex',flexDirection:'column'}}>
    <div style={{position:'absolute',top:0,left:0,right:0,zIndex:3,padding:'14px 16px',display:'flex',alignItems:'center',gap:10,background:'linear-gradient(#080b12cc,transparent)'}}>
      <button onClick={hangup} aria-label="Đóng cuộc gọi" style={{width:38,height:38,borderRadius:20,border:0,background:'#ffffff18',color:'#fff'}}><X size={20}/></button>
      <div><div style={{fontWeight:800}}>{video ? 'Cuộc gọi video' : 'Cuộc gọi thoại'}</div><div style={{fontSize:12,opacity:.75}}>{name} · {clock}</div></div>
    </div>
    {video ? <>
      <video ref={remoteVideo} autoPlay playsInline style={{width:'100%',height:'100%',objectFit:'cover',background:'#111'}} />
      <video ref={localVideo} autoPlay playsInline muted style={{position:'absolute',right:14,top:76,width:120,height:170,objectFit:'cover',borderRadius:14,background:'#151922',border:'1px solid #ffffff25'}} />
    </> : <div style={{flex:1,display:'grid',placeItems:'center'}}><div style={{textAlign:'center'}}><div style={{width:100,height:100,borderRadius:50,margin:'0 auto 16px',display:'grid',placeItems:'center',background:'#6366f1',fontSize:38,fontWeight:900}}>{name.trim().charAt(0).toUpperCase()}</div><div style={{fontSize:22,fontWeight:900}}>{name}</div><div style={{marginTop:8,opacity:.75}}>{status}</div></div><video ref={remoteVideo} autoPlay playsInline style={{display:'none'}}/><video ref={localVideo} autoPlay playsInline muted style={{display:'none'}}/></div>}
    <div style={{position:'absolute',bottom:0,left:0,right:0,padding:'18px 16px 28px',background:'linear-gradient(transparent,#080b12ee)',display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
      {error && <div style={{fontSize:12,color:'#ff8b8b',background:'#ff000018',padding:'7px 10px',borderRadius:10}}>{error}</div>}
      <div style={{fontSize:13,opacity:.8}}>{status}</div>
      <div style={{display:'grid',gridTemplateColumns:video?'repeat(3,58px)':'repeat(2,58px)',alignItems:'center',justifyContent:'center',gap:18,width:'100%'}}>
        <button onClick={toggleMic} title={mic?'Tắt mic':'Bật mic'} aria-label={mic?'Tắt mic':'Bật mic'} style={{width:58,height:58,display:'grid',placeItems:'center',border:0,borderRadius:29,background:'#ffffff18',color:'#fff',padding:0}}>{mic?<Mic size={22}/>:<MicOff size={22}/>}</button>
        {video && <button onClick={toggleCam} title={cam?'Tắt camera':'Bật camera'} aria-label={cam?'Tắt camera':'Bật camera'} style={{width:58,height:58,display:'grid',placeItems:'center',border:0,borderRadius:29,background:'#ffffff18',color:'#fff',padding:0}}>{cam?<VideoIcon size={22}/>:<VideoOff size={22}/>}</button>}
        <button onClick={hangup} title="Kết thúc cuộc gọi" aria-label="Kết thúc cuộc gọi" style={{width:58,height:58,display:'grid',placeItems:'center',border:0,borderRadius:29,background:'#ef4444',color:'#fff',padding:0}}><PhoneOff size={22}/></button>
      </div>
    </div>
  </div>
}
