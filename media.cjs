const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path');
const {Readable,Transform}=require('node:stream');
const mime={'.mp4':'video/mp4','.m4v':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.mkv':'video/x-matroska','.avi':'video/x-msvideo','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.bmp':'image/bmp','.mp3':'audio/mpeg','.m4a':'audio/mp4','.wav':'audio/wav','.ogg':'audio/ogg','.flac':'audio/flac','.aac':'audio/aac'};
function rangeFor(value,size){if(!value)return {start:0,end:size-1,status:200};const m=value.trim().match(/^bytes=(\d*)-(\d*)$/);if(!m||(!m[1]&&!m[2])||!size)return null;let start,end;if(!m[1]){const suffix=Number(m[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return null;start=Math.max(0,size-suffix);end=size-1;}else{start=Number(m[1]);end=m[2]?Number(m[2]):size-1;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||start>end)return null;end=Math.min(end,size-1);}return {start,end,status:206};}
async function serveFile(request,file,{delayMs=0,onRequest}={}){
 const headers=new Headers({'Accept-Ranges':'bytes','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','Access-Control-Allow-Headers':'Range','Access-Control-Expose-Headers':'Accept-Ranges, Content-Range, Content-Length','Content-Type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(!['GET','HEAD'].includes(request.method)){headers.set('Allow','GET, HEAD, OPTIONS');return new Response(null,{status:405,headers});}
 let stat;try{stat=await fsp.stat(file);}catch{return new Response(null,{status:404,headers});}if(!stat.isFile())return new Response(null,{status:404,headers});
 const range=rangeFor(request.headers.get('range'),stat.size);if(!range){headers.set('Content-Range',`bytes */${stat.size}`);headers.set('Content-Length','0');return new Response(null,{status:416,headers});}
 const {start,end,status}=range;headers.set('Content-Length',String(Math.max(0,end-start+1)));if(status===206)headers.set('Content-Range',`bytes ${start}-${end}/${stat.size}`);onRequest?.({start,end,status,size:stat.size});
 if(request.method==='HEAD'||!stat.size)return new Response(null,{status,headers});
 const input=fs.createReadStream(file,{start,end,highWaterMark:64*1024});let stream=input;
 // Only the smoke test simulates a slower disk to force seeks into unread bytes.
 if(delayMs){const throttle=new Transform({transform(chunk,_encoding,done){setTimeout(()=>done(null,chunk),delayMs);}});input.on('error',e=>throttle.destroy(e));throttle.on('close',()=>input.destroy());stream=input.pipe(throttle);}
 const abort=()=>stream.destroy();request.signal?.addEventListener('abort',abort,{once:true});stream.on('close',()=>request.signal?.removeEventListener('abort',abort));
 return new Response(Readable.toWeb(stream,{strategy:{highWaterMark:256*1024,size:chunk=>chunk.byteLength}}),{status,headers});
}
module.exports={rangeFor,serveFile};
