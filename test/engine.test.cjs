const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');const {plan,validate,assText}=require('../engine.cjs');
const ffmpeg=process.env.FRAME_FFMPEG||require('ffmpeg-static');
function run(args,cwd){const r=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-threads','1',...args],{cwd,encoding:'utf8',maxBuffer:10e6});assert.equal(r.status,0,r.stderr);return r;}
function pixel(file,t,x,y){const r=spawnSync(ffmpeg,['-v','error','-ss',String(t),'-i',file,'-vf',`crop=2:2:${x}:${y}`,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-threads','1','pipe:1']);assert.equal(r.status,0,r.stderr?.toString());return [...r.stdout.slice(0,3)];}
const base=()=>({version:1,video:{path:'source.mp4',duration:3,hasAudio:false},trim:{start:1,end:3},width:320,height:180,volume:1,music:null,layers:[]});
test('invalid times, geometry and malicious subtitle overrides are handled',()=>{assert.throws(()=>validate({...base(),trim:{start:2,end:1}}));assert.throws(()=>validate({...base(),width:321}));assert.equal(assText('{\\pos(1,1)}\nhello'),'｛＼pos(1,1)｝\\Nhello');});
test('real MP4 export: trim, timed image, subtitle and looped audio',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'frame-test-'));
 try{
 run(['-f','lavfi','-i','color=c=blue:s=320x180:r=30:d=3','-c:v','libx264','-pix_fmt','yuv420p',path.join(dir,'source.mp4')]);
 run(['-f','lavfi','-i','color=c=red:s=40x40','-frames:v','1','-threads','1',path.join(dir,'image.png')]);
 run(['-f','lavfi','-i','sine=frequency=440:duration=0.3',path.join(dir,'music.wav')]);
 const p=base();p.video.path=path.join(dir,'source.mp4');p.music={path:path.join(dir,'music.wav'),volume:.2};
 p.layers=[{id:'i',type:'image',path:path.join(dir,'image.png'),start:1.5,end:2.5,x:0,y:0,width:.25,opacity:1},{id:'t',type:'text',text:'TEST',start:1.5,end:2.5,x:.5,y:.4,size:32,color:'#ffffff'}];
 const job=await plan(p,dir),out=path.join(dir,'result.mp4');run([...job.args,out],dir);
 const pre=pixel(out,.2,10,10),during=pixel(out,.8,10,10),post=pixel(out,1.8,10,10);
 assert.ok(pre[2]>200&&pre[0]<40,`before ${pre}`);assert.ok(during[0]>200&&during[2]<40,`during ${during}`);assert.ok(post[2]>200&&post[0]<40,`after ${post}`);
 const caption=spawnSync(ffmpeg,['-v','error','-ss','0.8','-i',out,'-vf','crop=120:50:100:70','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-threads','1','pipe:1']);
 let white=0;for(let i=0;i<caption.stdout.length;i+=3)if(caption.stdout[i]>180&&caption.stdout[i+1]>180&&caption.stdout[i+2]>180)white++;assert.ok(white>30,'subtitle rendered');
 const probe=spawnSync(ffmpeg,['-hide_banner','-i',out],{encoding:'utf8'}).stderr;assert.match(probe,/Duration: 00:00:02\.00/);assert.match(probe,/Audio: aac/);
 const raw=spawnSync(ffmpeg,['-v','error','-ss','1.7','-i',out,'-t','0.1','-vn','-f','s16le','pipe:1']);assert.ok(raw.stdout.length>100,'music continues after looping');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('original audio survives export, silent video exports without audio',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'frame-audio-'));try{
 run(['-f','lavfi','-i','color=c=black:s=320x180:r=30:d=3','-f','lavfi','-i','sine=frequency=220:duration=3','-c:v','libx264','-c:a','aac','-shortest',path.join(dir,'source.mp4')]);
 const p=base();p.video={...p.video,path:path.join(dir,'source.mp4'),hasAudio:true};const job=await plan(p,dir);run([...job.args,path.join(dir,'out.mp4')],dir);
 const probe=spawnSync(ffmpeg,['-hide_banner','-i',path.join(dir,'out.mp4')],{encoding:'utf8'}).stderr;assert.match(probe,/Audio: aac/);
 p.video.hasAudio=false;const silent=await plan(p,dir);run([...silent.args,path.join(dir,'silent.mp4')],dir);const info=spawnSync(ffmpeg,['-hide_banner','-i',path.join(dir,'silent.mp4')],{encoding:'utf8'}).stderr;assert.doesNotMatch(info,/Audio:/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
