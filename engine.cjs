const fs = require('node:fs/promises');
const path = require('node:path');
function num(v,min,max,label){v=Number(v);if(!Number.isFinite(v)||v<min||v>max)throw Error(`${label}: ${min}~${max} 범위의 숫자를 입력하세요.`);return v;}
function validate(p){
 if(!p||p.version!==1||!p.video?.path)throw Error('영상이 있는 올바른 프로젝트가 필요합니다.');
 const d=num(p.video.duration,.01,86400,'영상 길이');
 num(p.trim.start,0,d,'시작');num(p.trim.end,p.trim.start+.01,d+.01,'끝');
 if(!Number.isInteger(p.width)||p.width<128||p.width>3840||p.width%2)throw Error('출력 폭은 128~3840의 짝수여야 합니다.');
 if(!Number.isInteger(p.height)||p.height<128||p.height>2160||p.height%2)throw Error('출력 높이는 128~2160의 짝수여야 합니다.');
 num(p.volume,0,1,'원본 음량');if(p.music){if(typeof p.music.path!=='string')throw Error('음악 경로 오류');num(p.music.volume,0,1,'음악 음량');}
 if(!Array.isArray(p.layers)||p.layers.length>100)throw Error('레이어는 최대 100개입니다.');
 for(const l of p.layers){if(!['image','text'].includes(l.type))throw Error('지원하지 않는 레이어입니다.');num(l.start,0,d,'표시 시작');num(l.end,l.start+.01,d+.01,'표시 끝');num(l.x,0,1,'가로 위치');num(l.y,0,1,'세로 위치');if(l.type==='image'){if(typeof l.path!=='string')throw Error('이미지 경로 오류');num(l.width,.02,1,'이미지 크기');num(l.opacity,0,1,'투명도');}else{if(typeof l.text!=='string'||l.text.length>5000)throw Error('자막은 5000자 이내로 입력하세요.');num(l.size,8,200,'글자 크기');if(!/^#[a-f0-9]{6}$/i.test(l.color))throw Error('글자 색 오류');}}
 return p;
}
function assTime(t){const cs=Math.round(t*100);return `${Math.floor(cs/360000)}:${String(Math.floor(cs/6000)%60).padStart(2,'0')}:${String(Math.floor(cs/100)%60).padStart(2,'0')}.${String(cs%100).padStart(2,'0')}`;}
function assText(t){return t.replace(/\\/g,'＼').replace(/{/g,'｛').replace(/}/g,'｝').replace(/\r?\n/g,'\\N');}
async function plan(project,dir){
 const p=validate(project), duration=p.trim.end-p.trim.start;
 const args=['-hide_banner','-y','-filter_complex_threads','1','-ss',String(p.trim.start),'-i',p.video.path];
 const filters=[`[0:v]setpts=PTS-STARTPTS,scale=${p.width}:${p.height}:force_original_aspect_ratio=decrease,pad=${p.width}:${p.height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v0]`];
 let input=1,stage=0;
 // ASS events share the same layer order as the preview, including text/image overlaps.
 for(let k=0;k<p.layers.length;k++){
  const l=p.layers[k],start=Math.max(0,l.start-p.trim.start),end=Math.min(duration,l.end-p.trim.start);if(end<=start)continue;
  const prev=`v${stage}`,next=`v${++stage}`;
  if(l.type==='image'){
   args.push('-loop','1','-i',l.path);
   const w=Math.max(2,Math.round(p.width*l.width/2)*2);
   filters.push(`[${input++}:v]scale=${w}:-1,format=rgba,colorchannelmixer=aa=${l.opacity}[img${k}]`);
   filters.push(`[${prev}][img${k}]overlay=x=${Math.round(l.x*p.width)}:y=${Math.round(l.y*p.height)}:enable='gte(t,${start})*lt(t,${end})':eof_action=repeat[${next}]`);
  }else{
   const c=l.color.slice(1),bgr=c.slice(4,6)+c.slice(2,4)+c.slice(0,2);
   const ass=`[Script Info]\nScriptType: v4.00+\nPlayResX: ${p.width}\nPlayResY: ${p.height}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${process.platform==='win32'?'Malgun Gothic':'DejaVu Sans'},${l.size},&H00${bgr},&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,8,0,0,0,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,${assTime(start)},${assTime(end)},Default,,0,0,0,,{\\an8\\pos(${Math.round(l.x*p.width)},${Math.round(l.y*p.height)})}${assText(l.text)}\n`;
   await fs.writeFile(path.join(dir,`caption${k}.ass`),ass,'utf8');
   filters.push(`[${prev}]subtitles=filename=caption${k}.ass[${next}]`);
  }
 }
 let audio;
 if(p.video.hasAudio){filters.push(`[0:a]asetpts=PTS-STARTPTS,volume=${p.volume}[orig]`);audio='orig';}
 if(p.music){args.push('-stream_loop','-1','-i',p.music.path);filters.push(`[${input}:a]asetpts=PTS-STARTPTS,volume=${p.music.volume}[music]`);if(audio){filters.push('[orig][music]amix=inputs=2:duration=longest:normalize=0[mix]');audio='mix';}else audio='music';}
 args.push('-filter_complex',filters.join(';'),'-map',`[v${stage}]`);if(audio)args.push('-map',`[${audio}]`);
 args.push('-t',String(duration),'-r','30','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p');
 if(audio)args.push('-c:a','aac','-b:a','192k');
 args.push('-movflags','+faststart','-progress','pipe:1','-nostats');
 return {args,duration};
}
module.exports={validate,plan,assTime,assText};
