// Configurable provider wrapper. Configure IMAGE_TO_VIDEO_ENDPOINT and IMAGE_TO_VIDEO_API_KEY in Vercel.
export const config = { api: { bodyParser: false } }
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const endpoint = process.env.IMAGE_TO_VIDEO_ENDPOINT, key = process.env.IMAGE_TO_VIDEO_API_KEY
  if (!endpoint || !key) return res.status(501).json({ error: 'AI server chưa cấu hình. Đặt IMAGE_TO_VIDEO_ENDPOINT và IMAGE_TO_VIDEO_API_KEY trong Vercel; Canvas mode vẫn dùng được.' })
  try {
    const { default: Busboy } = await import('busboy')
    const parser = Busboy({ headers: req.headers, limits: { files: 1, fileSize: 20 * 1024 * 1024, fields: 8 } })
    let image: any = null; const fields: Record<string,string> = {}
    await new Promise<void>((resolve,reject) => {
      parser.on('field',(n:string,v:string)=>{fields[n]=v})
      parser.on('file',(n:string,stream:any,info:any)=>{if(n!=='image'){stream.resume();return}const chunks:any[]=[];stream.on('data',(c:any)=>chunks.push(c));stream.on('limit',()=>reject(new Error('Ảnh tối đa 20MB.')));stream.on('end',()=>{image={buffer:Buffer.concat(chunks),filename:info.filename||'image.jpg',mimeType:info.mimeType||'image/jpeg'}})})
      parser.on('error',reject);parser.on('finish',resolve);req.pipe(parser)
    })
    if(!image?.buffer?.length)return res.status(400).json({error:'Thiếu ảnh nguồn.'})
    const form=new FormData();form.append('image',new Blob([image.buffer],{type:image.mimeType}),image.filename);form.append('prompt',fields.prompt||'Animate image with cinematic movement');form.append('preset',fields.preset||'zoom-in');form.append('duration',fields.duration||'4')
    const upstream=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+key},body:form}),body=await upstream.json().catch(()=>({}))
    if(!upstream.ok)return res.status(502).json({error:body.error||body.message||'Nhà cung cấp AI từ chối yêu cầu.'})
    if(!body.url)return res.status(502).json({error:'Provider cần trả JSON { url } của video đã tạo.'})
    return res.status(200).json({url:body.url})
  } catch(e:any) { return res.status(500).json({error:e?.message||'Lỗi máy chủ AI.'}) }
}
