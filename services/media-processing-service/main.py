from __future__ import annotations
import hashlib, os, re, shutil, subprocess, tempfile, logging, json, urllib.request, urllib.error
from pathlib import Path
from typing import Optional
import cv2
import numpy as np
import pytesseract
from pytesseract import Output
from PIL import Image, ImageDraw, ImageFont
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response

logging.basicConfig(level=os.getenv("LOG_LEVEL","INFO"))
log=logging.getLogger("dsocial-media")
app=FastAPI(title="D-Social Media Processing Service", docs_url=None, redoc_url=None)
SUPABASE_URL=os.getenv("SUPABASE_URL","").rstrip("/")
SUPABASE_ANON_KEY=os.getenv("SUPABASE_ANON_KEY","")
MAX_BYTES=int(os.getenv("MAX_UPLOAD_BYTES","33554432"))
BRANDS=("tiktok","tik tok","instagram","facebook","youtube","you tube","capcut","kwai","likee","snapchat","pinterest","douyin","weibo","threads","linkedin","vimeo","triller","twitch","telegram","whatsapp","twitter","x.com","lemon8","bilibili","kuaishou","抖音","快手","小红书")

@app.get("/ready")
def ready():
    ff=shutil.which("ffmpeg") is not None
    tess=shutil.which("tesseract") is not None
    return {"status":"ready" if ff and tess else "degraded","service":"D-Social Media Processing Service","ffmpeg_available":ff,"ocr_available":tess,"configured":bool(SUPABASE_URL and SUPABASE_ANON_KEY)}

def auth(token: Optional[str]):
    if not token or not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise HTTPException(401,"Authenticated Supabase session required")
    request=urllib.request.Request(
        SUPABASE_URL + "/auth/v1/user",
        headers={"apikey":SUPABASE_ANON_KEY,"Authorization":"Bearer "+token,"Accept":"application/json"},
        method="GET"
    )
    try:
        with urllib.request.urlopen(request,timeout=8) as response:
            user=json.loads(response.read().decode("utf-8"))
            if response.status != 200 or not user.get("id"):
                raise HTTPException(401,"Invalid Supabase session")
    except urllib.error.HTTPError as exc:
        raise HTTPException(401,"Invalid Supabase session") from exc
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        raise HTTPException(503,"Supabase session validation unavailable") from exc

def brand_boxes(frame):
    h,w=frame.shape[:2]
    cw,ch=max(1,int(w*.45)),max(1,int(h*.32))
    regions=[(0,0,cw,ch),(w-cw,0,w,ch),(0,h-ch,cw,h),(w-cw,h-ch,w,h)]
    found=[]
    for x1,y1,x2,y2 in regions:
        crop=frame[y1:y2,x1:x2]
        scale=2 if max(crop.shape[:2])<900 else 1
        if scale>1: crop=cv2.resize(crop,None,fx=scale,fy=scale,interpolation=cv2.INTER_CUBIC)
        gray=cv2.cvtColor(crop,cv2.COLOR_BGR2GRAY)
        try: data=pytesseract.image_to_data(gray,config="--psm 11",output_type=Output.DICT,timeout=2)
        except Exception: continue
        for i,raw in enumerate(data.get("text",[])):
            text=re.sub(r"[^a-z0-9.抖音快手小红书]","",(raw or "").lower())
            try: conf=float(data["conf"][i])
            except (ValueError,TypeError): conf=-1
            if conf<30 or not any(b.replace(" ","") in text for b in BRANDS): continue
            bx=int(data["left"][i]/scale)+x1; by=int(data["top"][i]/scale)+y1
            bw=max(1,int(data["width"][i]/scale)); bh=max(1,int(data["height"][i]/scale))
            px=max(8,int(w*.035)); py=max(6,int(h*.025))
            found.append((max(x1,bx-px),max(y1,by-py),min(x2,bx+bw+int(w*.13)),min(y2,by+bh+int(h*.08))))
    merged=[]
    for box in found:
        x1,y1,x2,y2=box
        overlaps=[i for i,(a,b,c,d) in enumerate(merged) if not(x2<a or c<x1 or y2<b or d<y1)]
        if not overlaps: merged.append(box)
        else:
            i=overlaps[0]; a,b,c,d=merged[i]; merged[i]=(min(a,x1),min(b,y1),max(c,x2),max(d,y2))
    return merged

def clean_frame(frame):
    boxes=brand_boxes(frame)
    if boxes:
        mask=np.zeros(frame.shape[:2],dtype=np.uint8)
        for x1,y1,x2,y2 in boxes: cv2.rectangle(mask,(x1,y1),(x2,y2),255,-1)
        frame=cv2.inpaint(frame,mask,5,cv2.INPAINT_TELEA)
    return frame,len(boxes)

def add_brand(frame):
    h,w=frame.shape[:2]
    text=os.getenv("DSOCIAL_WATERMARK_TEXT","D-Social")
    font=cv2.FONT_HERSHEY_SIMPLEX; scale=max(.45,min(1.0,w/1100)); thick=max(1,int(scale*2))
    (tw,th),base=cv2.getTextSize(text,font,scale,thick)
    x=max(8,w-tw-20); y=max(th+base+8,h-18)
    cv2.rectangle(frame,(x-8,y-th-8),(x+tw+8,y+base+5),(0,0,0),-1)
    cv2.putText(frame,text,(x,y),font,scale,(255,255,255),thick,cv2.LINE_AA)
    return frame

def process_video(src:Path,dst:Path,work:Path):
    cap=cv2.VideoCapture(str(src))
    if not cap.isOpened(): raise HTTPException(422,"Video could not be opened")
    fps=cap.get(cv2.CAP_PROP_FPS) or 0; w=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0); h=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    if fps<=0 or not w or not h: cap.release(); raise HTTPException(422,"Invalid video metadata")
    tmp=work/"cleaned.mp4"; writer=cv2.VideoWriter(str(tmp),cv2.VideoWriter_fourcc(*"mp4v"),fps,(w,h))
    if not writer.isOpened(): cap.release(); raise HTTPException(503,"Video encoder unavailable")
    n=0; changed=0; every=max(1,round(fps/2)); active=[]; last=-999
    try:
        while True:
            ok,frame=cap.read()
            if not ok: break
            if n%every==0:
                active=brand_boxes(frame); last=n if active else last
                if n-last>every: active=[]
            if active and n-last<=every:
                mask=np.zeros((h,w),dtype=np.uint8)
                for x1,y1,x2,y2 in active: cv2.rectangle(mask,(x1,y1),(x2,y2),255,-1)
                frame=cv2.inpaint(frame,mask,5,cv2.INPAINT_TELEA); changed+=1
            writer.write(add_brand(frame)); n+=1
    finally: cap.release(); writer.release()
    if not n: raise HTTPException(422,"Video contains no decodable frames")
    # Restore source audio and preserve source dimensions.
    cmd=["ffmpeg","-hide_banner","-loglevel","error","-y","-i",str(tmp),"-i",str(src),"-map","0:v:0","-map","1:a?","-c:v","libx264","-preset","veryfast","-crf","18","-threads","2","-c:a","aac","-b:a","192k","-movflags","+faststart",str(dst)]
    p=subprocess.run(cmd,capture_output=True,timeout=90)
    if p.returncode: raise HTTPException(422,"Video encoding failed; original must not be published as cleaned")
    log.info("video frames=%s frames_with_detected_brand=%s",n,changed)

def process_image(src:Path,dst:Path):
    try:
        with Image.open(src) as im:
            im.load(); rgb=im.convert("RGB"); frame=cv2.cvtColor(np.array(rgb),cv2.COLOR_RGB2BGR)
            frame,count=clean_frame(frame); frame=add_brand(frame)
            out=cv2.cvtColor(frame,cv2.COLOR_BGR2RGB); Image.fromarray(out).save(dst,format="JPEG",quality=95,optimize=True)
            log.info("image detected brand boxes=%s",count)
    except Exception as e: raise HTTPException(422,"Image processing failed") from e

@app.post("/api/v1/media/process-binary")
async def process_binary(file: UploadFile=File(...), rights_confirmed: bool=Form(False),
                         authorization: Optional[str]=Header(None),
                         x_idempotency_key: Optional[str]=Header(None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401,"Authenticated Supabase session required")
    auth(authorization.split(" ",1)[1].strip())
    if not rights_confirmed: raise HTTPException(400,"rights_confirmed=true is required")
    data=await file.read(MAX_BYTES+1)
    if not data or len(data)>MAX_BYTES: raise HTTPException(413,"File is empty or exceeds upload limit")
    name=Path(file.filename or "upload.mp4").name
    ext=Path(name).suffix.lower()
    is_video=ext in {".mp4",".mov",".m4v",".webm"}
    is_image=ext in {".jpg",".jpeg",".png",".webp"}
    if not (is_video or is_image): raise HTTPException(415,"Unsupported media type")
    with tempfile.TemporaryDirectory(prefix="dsocial-") as td:
        work=Path(td); src=work/("input"+ext); dst=work/("output.mp4" if is_video else "output.jpg")
        src.write_bytes(data)
        if is_video: process_video(src,dst,work)
        else: process_image(src,dst)
        output=dst.read_bytes(); digest=hashlib.sha256(output).hexdigest()
        out_ext=".mp4" if is_video else ".jpg"
        return Response(output,media_type="video/mp4" if is_video else "image/jpeg",headers={
            "X-Output-Filename":digest[:24]+out_ext,"X-Output-SHA256":digest,
            "X-Output-Size-Bytes":str(len(output)),"X-Output-Media-Type":"video" if is_video else "image",
            "X-Audio-Preserved":"na","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"
        })
