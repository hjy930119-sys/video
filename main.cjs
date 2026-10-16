const {app,BrowserWindow,ipcMain,dialog,protocol,net}=require('electron');
const {spawn}=require('node:child_process');const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const {pathToFileURL}=require('node:url');const {plan,validate}=require('./engine.cjs');
const ffmpeg=process.env.FRAME_FFMPEG||require('ffmpeg-static').replace('app.asar','app.asar.unpacked');
let win,job;const allowed=new Set();
protocol.registerSchemesAsPrivileged([{scheme:'media',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,bypassCSP:false}}]);
const mediaUrl=p=>'media://local/'+encodeURIComponent(p);
async function grant(p){await fs.access(p);allowed.add(path.resolve(p));return mediaUrl(p);}
function run(args){return new Promise((resolve,reject)=>{const c=spawn(ffmpeg,args,{windowsHide:true});let stderr='';c.stderr.on('data',d=>stderr+=d);c.on('error',reject);c.on('close',code=>resolve({code,stderr}));});}
async function probe(p){const r=await run(['-hide_banner','-i',p]);const d=r.stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);if(!d)throw Error('미디어 길이를 읽을 수 없습니다. MP4(H.264), MP3 또는 WAV 파일을 사용하세요.');return {duration:+d[1]*3600 + +d[2]*60 + +d[3],hasAudio:/Stream.*Audio:/.test(r.stderr)};}
async function hydrate(p){validate(p);const paths=[p.video.path,...p.layers.filter(l=>l.type==='image').map(l=>l.path),...(p.music?[p.music.path]:[])];for(const f of paths)await grant(f);p.video.url=mediaUrl(p.video.path);for(const l of p.layers)if(l.type==='image')l.url=mediaUrl(l.path);if(p.music)p.music.url=mediaUrl(p.music.path);return p;}
app.whenReady().then(()=>{
 protocol.handle('media',request=>{try{const u=new URL(request.url);const p=decodeURIComponent(u.pathname.slice(1));if(u.host!=='local'||!allowed.has(path.resolve(p)))return new Response('Forbidden',{status:403});return net.fetch(pathToFileURL(p).href,{headers:request.headers});}catch{return new Response('Bad request',{status:400});}});
 win=new BrowserWindow({show:!process.argv.includes('--smoke-test'),width:1440,height:940,minWidth:1100,minHeight:760,backgroundColor:'#101218',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.webContents.on('will-prevent-unload',e=>{const choice=dialog.showMessageBoxSync(win,{type:'question',buttons:['계속 편집','저장하지 않고 종료'],defaultId:0,cancelId:0,message:'저장하지 않은 변경이 있습니다. 종료할까요?'});if(choice===1)e.preventDefault();});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.loadFile('ui/index.html');
 if(process.argv.includes('--smoke-test')){
  const timer=setTimeout(()=>{console.error('UI smoke test timed out');app.exit(1);},20000);
  win.webContents.once('did-finish-load',async()=>{try{const ok=await win.webContents.executeJavaScript("document.title==='Frame Studio' && typeof window.studio?.export==='function' && !!document.getElementById('canvas')");const probe=await run(['-version']);if(!ok||probe.code!==0)throw Error('UI or bundled FFmpeg unavailable');clearTimeout(timer);console.log('PASS: Electron window, preload bridge and FFmpeg');app.exit(0);}catch(e){console.error(e);app.exit(1);}});
 }
 win.on('close',e=>{if(job){e.preventDefault();dialog.showMessageBox(win,{message:'내보내기를 취소한 후 종료하세요.'});}});
});
app.on('window-all-closed',()=>app.quit());
ipcMain.handle('pick',async(_e,kind)=>{const types={video:['mp4','mov','m4v','webm'],image:['png','jpg','jpeg','webp'],music:['mp3','wav','m4a','ogg']};if(!types[kind])throw Error('파일 종류 오류');const r=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:kind,extensions:types[kind]}]});if(r.canceled)return null;const p=r.filePaths[0],url=await grant(p);return {path:p,url,name:path.basename(p),...(kind==='image'?{}:await probe(p))};});
ipcMain.handle('save',async(_e,p)=>{validate(p);const r=await dialog.showSaveDialog(win,{defaultPath:'내 프로젝트.frame.json',filters:[{name:'Frame 프로젝트',extensions:['json']}]});if(r.canceled)return false;await fs.writeFile(r.filePath,JSON.stringify(p,null,2),'utf8');return true;});
ipcMain.handle('open',async()=>{const r=await dialog.showOpenDialog(win,{filters:[{name:'Frame 프로젝트',extensions:['json']}],properties:['openFile']});if(r.canceled)return null;try{return await hydrate(JSON.parse(await fs.readFile(r.filePaths[0],'utf8')));}catch(e){throw Error('프로젝트를 열 수 없습니다. 원본 파일이 이동되었거나 형식이 잘못되었습니다. '+e.message);}});
ipcMain.handle('cancel',()=>{if(job){job.canceled=true;job.child.kill();}});
ipcMain.handle('export',async(_e,p)=>{
 if(job)throw Error('이미 내보내는 중입니다.');validate(p);
 for(const f of [p.video.path,...p.layers.filter(l=>l.type==='image').map(l=>l.path),...(p.music?[p.music.path]:[])]){if(!allowed.has(path.resolve(f)))throw Error('앱에서 파일을 다시 불러오세요.');}
 const r=await dialog.showSaveDialog(win,{defaultPath:'완성 영상.mp4',filters:[{name:'MP4 영상',extensions:['mp4']}]});if(r.canceled)return {canceled:true};
 const output=r.filePath;
 if([p.video.path,p.music?.path,...p.layers.map(l=>l.path)].filter(Boolean).some(f=>path.resolve(f).toLowerCase()===path.resolve(output).toLowerCase()))throw Error('원본 파일과 다른 이름으로 저장하세요.');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'frame-'));const temp=path.join(path.dirname(output),`.frame-${Date.now()}.mp4`);
 try{
  const {args,duration}=await plan(p,dir);
  return await new Promise((resolve,reject)=>{
   const child=spawn(ffmpeg,[...args,temp],{cwd:dir,windowsHide:true});const current={child,canceled:false};job=current;let log='',buf='';
   child.stdout.on('data',d=>{buf+=d;const lines=buf.split('\n');buf=lines.pop();for(const line of lines){const m=line.match(/^out_time_us=(\d+)/);if(m&&!win.isDestroyed())win.webContents.send('progress',Math.min(99,Math.round(+m[1]/1e6/duration*100)));}});
   child.stderr.on('data',d=>log=(log+d).slice(-6000));
   child.once('error',reject);child.once('close',async code=>{try{if(current.canceled)resolve({canceled:true});else if(code!==0)reject(Error('영상 저장 실패: '+log.slice(-1800)));else{await fs.rename(temp,output);resolve({path:output});}}catch(e){reject(e);}});
  });
 }finally{job=null;await fs.rm(dir,{recursive:true,force:true});await fs.rm(temp,{force:true}).catch(()=>{});}
});
