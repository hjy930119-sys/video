const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process'),E=require('../engine.cjs'),ffmpeg=process.env.FRAME_FFMPEG||require('ffmpeg-static');
function run(args,cwd){const r=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-threads','1',...args],{cwd,encoding:'utf8',maxBuffer:10e6});assert.equal(r.status,0,r.stderr);return r;}
function raw(file,time,filter){const r=spawnSync(ffmpeg,['-v','error','-ss',String(time),'-i',file,'-vf',filter,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-threads','1','pipe:1']);assert.equal(r.status,0,r.stderr.toString());return r.stdout;}
const pixel=(file,time,x=10,y=10)=>[...raw(file,time,`crop=2:2:${x}:${y}`).slice(0,3)];
const clip=(file,duration,hasAudio=false)=>({id:E.uid(),path:file,duration,in:0,out:duration,hasAudio,volume:1,fadeIn:0,fadeOut:0});
const base=()=>({...E.blank(),width:320,height:180,clips:[clip('blue.mp4',3)]});
test('project migration preserves trimmed overlay times; split preserves source and fades',()=>{const p=E.upgrade({version:1,video:{path:'a.mp4',duration:10,hasAudio:true},trim:{start:2,end:8},volume:.7,width:320,height:180,music:null,layers:[{id:'x',type:'text',text:'Hi',start:3,end:5,x:.5,y:.8,size:32,color:'#ffffff'}]});assert.equal(E.duration(p),6);assert.equal(p.layers[0].start,1);assert.equal(p.layers[0].end,3);E.validate(p);p.clips[0].fadeIn=.5;p.clips[0].fadeOut=.5;const id=E.split(p,p.clips[0].id,3);assert.ok(id);assert.equal(p.clips.length,2);assert.equal(p.clips[0].out,5);assert.equal(p.clips[1].in,5);assert.equal(p.clips[0].fadeOut,0);assert.equal(p.clips[1].fadeIn,0);assert.equal(E.duration(p),6);assert.equal(E.locate(p,4).id,id);assert.equal(E.assText('{\\pos(1,1)}\nHello'),'｛＼pos(1,1)｝\\NHello');});
test('reject invalid times, media overrun, ASS font injection and fades',()=>{assert.throws(()=>E.validate({...base(),width:321}));const p=base();p.clips[0].in=4;assert.throws(()=>E.validate(p));const q=base();q.layers=[{type:'video',path:'p.mp4',duration:1,in:0,start:0,end:2,x:0,y:0,width:.2,opacity:1,volume:0}];assert.throws(()=>E.validate(q));q.layers=[{type:'text',text:'x',font:'Bad\nfont',size:32,color:'#ffffff',x:0,y:0,start:0,end:1,opacity:1}];assert.throws(()=>E.validate(q));assert.equal(E.opacity({start:1,end:3,opacity:.8,fadeIn:.5,fadeOut:.5},1.25),.4);});
test('real concatenation, silent/audio clips, timed PIP, image, caption, fades and music',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"frame-v2-' space-"));
 try{
  const blue=path.join(dir,'blue clip.mp4'),green=path.join(dir,'green.mp4'),pip=path.join(dir,'pip.mp4'),image=path.join(dir,'logo.png'),music=path.join(dir,'music.wav');
  run(['-f','lavfi','-i','color=c=blue:s=320x180:r=30:d=1.5','-c:v','libx264','-pix_fmt','yuv420p',blue]);
  run(['-f','lavfi','-i','color=c=lime:s=240x240:r=24:d=1.5','-f','lavfi','-i','sine=frequency=220:duration=1.5','-c:v','libx264','-c:a','aac','-shortest',green]);
  run(['-f','lavfi','-i','color=c=red:s=80x80:r=30:d=2','-f','lavfi','-i','sine=frequency=660:duration=2','-c:v','libx264','-c:a','aac','-shortest',pip]);
  run(['-f','lavfi','-i','color=c=white:s=40x40','-frames:v','1','-threads','1',image]);run(['-f','lavfi','-i','sine=frequency=440:duration=0.3',music]);
  const p={...base(),clips:[{...clip(blue,1.5),fadeIn:.4},{...clip(green,1.5,true),fadeOut:.4}],music:{path:music,volume:.1,fadeIn:.1,fadeOut:.1},layers:[
   {id:'pip',type:'video',path:pip,duration:2,in:.2,start:.5,end:1.2,x:0,y:0,width:.25,opacity:1,volume:.1,hasAudio:true,fadeIn:.1,fadeOut:.1},
   {id:'img',type:'image',path:image,start:1.7,end:2.2,x:.7,y:.1,width:.2,opacity:1,fadeIn:0,fadeOut:0},
   {id:'text',type:'text',text:'TEST',font:process.platform==='win32'?'Arial':'DejaVu Sans',size:32,color:'#ffffff',bold:true,x:.3,y:.5,opacity:1,start:.5,end:1.2,fadeIn:.1,fadeOut:.1}]
  };
  const {args}=await E.plan(p,dir),out=path.join(dir,'out.mp4');run([...args,out],dir);
  assert.ok(pixel(out,.1)[2]<120,'video fade in');assert.ok(pixel(out,.45)[2]>200,'blue before overlay');assert.ok(pixel(out,.8)[0]>200,'PIP red visible');assert.ok(pixel(out,1.3)[2]>200,'PIP gone');
  const g=pixel(out,2,150,20);assert.ok(g[1]>200&&g[0]<40,'second differently sized clip is green');assert.ok(pixel(out,2.9,150,20)[1]<120,'video fade out');const img=pixel(out,1.9,230,25);assert.ok(img.every(v=>v>200),'image visible in second clip');
  const text=raw(out,.8,'crop=200:70:80:80');let white=0;for(let i=0;i<text.length;i+=3)if(text[i]>180&&text[i+1]>180&&text[i+2]>180)white++;assert.ok(white>30,'caption rendered');
  const fractional={...base(),clips:[{...clip(blue,1.5),out:.83},{...clip(green,1.5,true),out:1.16}]};const fj=await E.plan(fractional,dir),fo=path.join(dir,'fractional.mp4');run([...fj.args,fo],dir);assert.ok(Math.abs(E.duration(fractional)-2)<1e-6,'cuts align to output frames');assert.ok(pixel(fo,.8,150,20)[2]>200,'frame before cut blue');assert.ok(pixel(fo,.9,150,20)[1]>200,'frame after cut green');
  const probe=spawnSync(ffmpeg,['-hide_banner','-i',out],{encoding:'utf8'}).stderr;assert.match(probe,/Duration: 00:00:03\.00/);assert.match(probe,/Audio: aac/);
  const audio=spawnSync(ffmpeg,['-v','error','-ss','2.4','-i',out,'-t','0.1','-vn','-f','s16le','pipe:1']);assert.equal(audio.status,0);assert.ok(audio.stdout.some(v=>v!==0),'audio and music at end');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
