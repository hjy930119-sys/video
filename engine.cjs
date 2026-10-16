const fs=require('node:fs/promises'),path=require('node:path');
const M=require('./ui/model.js');
function num(v,min,max,label){if(typeof v!=='number'||!Number.isFinite(v)||v<min-1e-6||v>max+1e-6)throw Error(`${label}: ${min.toFixed(2)}~${max.toFixed(2)} 범위로 지정하세요.`);return v;}
function fades(o,len){num(o.fadeIn||0,0,len,'페이드인');num(o.fadeOut||0,0,len,'페이드아웃');}
function validate(p){
 if(!p||p.version!==2||!Array.isArray(p.clips)||!p.clips.length||p.clips.length>100)throw Error('영상을 한 개 이상 추가하세요. 클립은 최대 100개입니다.');
 for(const [key,max] of [['width',3840],['height',2160]])if(!Number.isInteger(p[key])||p[key]<128||p[key]>max||p[key]%2)throw Error('출력 크기는 지원 범위 안의 짝수여야 합니다.');
 for(const c of p.clips){if(typeof c.path!=='string'||!c.path)throw Error('원본 영상 경로 오류');num(c.duration,.04,86400,'원본 길이');num(c.in,0,c.duration-.04,'자르기 시작');num(c.out,c.in+.04,c.duration+.01,'자르기 끝');num(c.volume,0,1,'클립 음량');fades(c,M.length(c));}
 const d=num(M.duration(p),.04,86400,'전체 길이');
 if(p.music){if(typeof p.music.path!=='string')throw Error('음악 경로 오류');num(p.music.volume,0,1,'음악 음량');fades(p.music,d);}
 if(!Array.isArray(p.layers)||p.layers.length>100)throw Error('레이어는 최대 100개입니다.');
 for(const l of p.layers){if(!['image','text','video'].includes(l.type))throw Error('레이어 종류 오류');num(l.start,0,d-.01,'표시 시작');num(l.end,l.start+.01,d+.01,'표시 끝');num(l.x,0,1,'가로 위치');num(l.y,0,1,'세로 위치');num(l.opacity??1,0,1,'불투명도');fades(l,l.end-l.start);
  if(l.type==='text'){if(typeof l.text!=='string'||l.text.length>5000)throw Error('자막은 5000자 이내로 입력하세요.');num(l.size,8,200,'글자 크기');if(!/^#[a-f0-9]{6}$/i.test(l.color))throw Error('글자 색 오류');if(typeof l.font!=='string'||l.font.length>150||/[,\r\n\\{}]/.test(l.font))throw Error('글꼴 이름 오류');}
  else{if(typeof l.path!=='string'||!l.path)throw Error('레이어 파일 오류');num(l.width,.02,1,'레이어 폭');if(l.type==='video'){num(l.duration,.04,86400,'삽입 영상 길이');num(l.in,0,l.duration-.01,'삽입 영상 시작');if(l.end-l.start>l.duration-l.in+.02)throw Error('삽입 영상 표시 시간이 원본 길이보다 깁니다.');num(l.volume??0,0,1,'삽입 영상 음량');}}
 }
 return p;
}
const assTime=t=>{const n=Math.round(t*100);return `${Math.floor(n/360000)}:${String(Math.floor(n/6000)%60).padStart(2,'0')}:${String(Math.floor(n/100)%60).padStart(2,'0')}.${String(n%100).padStart(2,'0')}`;};
const assText=t=>t.replace(/\\/g,'＼').replace(/{/g,'｛').replace(/}/g,'｝').replace(/\r?\n/g,'\\N');
function fadeFilters(o,len,type,alpha=false){const a=[];if(o.fadeIn>0)a.push(`${type}=t=in:st=0:d=${o.fadeIn}${alpha?':alpha=1':''}`);if(o.fadeOut>0)a.push(`${type}=t=out:st=${Math.max(0,len-o.fadeOut)}:d=${o.fadeOut}${alpha?':alpha=1':''}`);return a.length?','+a.join(','):'';}
async function plan(project,dir){
 const p=validate(project),duration=M.duration(p),args=['-hide_banner','-y','-filter_complex_threads','1'],f=[],audios=[];let input=0;
 const clipInputs=p.clips.map(c=>{args.push('-ss',String(c.in),'-t',String(M.length(c)),'-i',c.path);return input++;});
 for(let i=0;i<p.clips.length;i++){const c=p.clips[i],len=M.length(c);
  f.push(`[${clipInputs[i]}:v]setpts=PTS-STARTPTS,scale=${p.width}:${p.height}:force_original_aspect_ratio=decrease,pad=${p.width}:${p.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p,tpad=stop_mode=clone:stop_duration=0.1,trim=end_frame=${Math.round(len*30)},setpts=N/(30*TB)${fadeFilters(c,len,'fade')}[cv${i}]`);
  if(c.hasAudio)f.push(`[${clipInputs[i]}:a]asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume=${c.volume},apad,atrim=duration=${len}${fadeFilters(c,len,'afade')}[ca${i}]`);
  else f.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${len},asetpts=PTS-STARTPTS[ca${i}]`);
 }
 f.push(p.clips.map((_,i)=>`[cv${i}][ca${i}]`).join('')+`concat=n=${p.clips.length}:v=1:a=1[v0][original]`);audios.push('original');let stage=0;
 await fs.mkdir(path.join(dir,'fonts'),{recursive:true});
 for(let k=0;k<p.layers.length;k++){
  const l=p.layers[k],prev=`v${stage}`,next=`v${++stage}`,len=l.end-l.start;
  if(l.type==='text'){
   const c=l.color.slice(1),bgr=c.slice(4)+c.slice(2,4)+c.slice(0,2),alpha=Math.round((1-(l.opacity??1))*255).toString(16).padStart(2,'0');
   const ass=`[Script Info]\nScriptType: v4.00+\nPlayResX: ${p.width}\nPlayResY: ${p.height}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${l.font},${l.size},&H${alpha}${bgr},&H00FFFFFF,&H${alpha}000000,&H${alpha}000000,${l.bold?-1:0},0,0,0,100,100,0,0,1,2,1,${l.anchor==='center'?8:7},0,0,0,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,${assTime(l.start)},${assTime(l.end)},Default,,0,0,0,,{\\pos(${Math.round(l.x*p.width)},${Math.round(l.y*p.height)})\\fad(${Math.round((l.fadeIn||0)*1000)},${Math.round((l.fadeOut||0)*1000)})}${assText(l.text)}\n`;
   await fs.writeFile(path.join(dir,`caption${k}.ass`),ass,'utf8');f.push(`[${prev}]subtitles=filename=caption${k}.ass:fontsdir=fonts[${next}]`);
  }else{
   const n=input++,w=Math.max(2,Math.round(l.width*p.width/2)*2);
   if(l.type==='image')args.push('-loop','1','-i',l.path);else args.push('-ss',String(l.in),'-t',String(len),'-i',l.path);
   f.push(`[${n}:v]setpts=PTS-STARTPTS,scale=${w}:-2,setsar=1,fps=30,format=rgba,colorchannelmixer=aa=${l.opacity??1}${fadeFilters(l,len,'fade',true)},setpts=PTS+${l.start}/TB[overlay${k}]`);
   f.push(`[${prev}][overlay${k}]overlay=x=${Math.round(l.x*p.width)}:y=${Math.round(l.y*p.height)}:enable='gte(t,${l.start})*lt(t,${l.end})':eof_action=pass[${next}]`);
   if(l.type==='video'&&l.hasAudio&&(l.volume??0)>0){f.push(`[${n}:a]asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume=${l.volume},apad,atrim=duration=${len}${fadeFilters(l,len,'afade')},adelay=${Math.round(l.start*1000)}:all=1[la${k}]`);audios.push(`la${k}`);}
  }
 }
 if(p.music){const n=input++;args.push('-stream_loop','-1','-i',p.music.path);f.push(`[${n}:a]asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume=${p.music.volume},atrim=duration=${duration}${fadeFilters(p.music,duration,'afade')}[music]`);audios.push('music');}
 f.push(audios.map(a=>`[${a}]`).join('')+`amix=inputs=${audios.length}:duration=longest:normalize=0,alimiter=limit=0.95:level=false:latency=true,atrim=duration=${duration}[audio]`);
 args.push('-filter_complex',f.join(';'),'-map',`[v${stage}]`,'-map','[audio]','-t',String(duration),'-r','30','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','-progress','pipe:1','-nostats');
 return {args,duration};
}
module.exports={validate,plan,assTime,assText,...M};
