(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.FrameModel=factory();})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const uid=()=>globalThis.crypto?.randomUUID?.()||'id-'+Date.now()+'-'+Math.random().toString(16).slice(2);
 const blank=()=>({version:2,width:1920,height:1080,clips:[],layers:[],music:null});
 const length=c=>Math.max(1,Math.round((c.out-c.in)*30))/30;
 const duration=p=>p.clips.reduce((sum,c)=>sum+length(c),0);
 function sequence(p){let t=0;return p.clips.map(c=>{const item={...c,start:t,end:t+length(c)};t=item.end;return item;});}
 function locate(p,t){const a=sequence(p);return a.find(c=>t>=c.start&&t<c.end)||a.at(-1);}
 function upgrade(p){if(p?.version===2)return p;if(p?.version!==1||!p.video)throw Error('프로젝트 형식을 읽을 수 없습니다.');const d=p.trim.end-p.trim.start;const next={version:2,width:p.width,height:p.height,clips:[{...p.video,id:uid(),in:p.trim.start,out:p.trim.end,volume:p.volume,fadeIn:0,fadeOut:0}],music:p.music,layers:p.layers.map(l=>({...l,start:Math.max(0,l.start-p.trim.start),end:Math.min(d,l.end-p.trim.start),opacity:l.opacity??1,fadeIn:0,fadeOut:0,...(l.type==='text'?{font:'Malgun Gothic',bold:false,anchor:'center'}:{})})).filter(l=>l.end>l.start)};fitLayers(next);return next;}
 function split(p,id,t){t=Math.round(t*30)/30;const a=sequence(p),c=a.find(v=>v.id===id);if(!c||t<=c.start+.04||t>=c.end-.04)return false;const i=p.clips.findIndex(v=>v.id===id),cut=c.in+t-c.start;const left={...p.clips[i],out:cut,fadeOut:0},right={...p.clips[i],id:uid(),in:cut,fadeIn:0};left.fadeIn=Math.min(left.fadeIn,length(left));right.fadeOut=Math.min(right.fadeOut,length(right));p.clips.splice(i,1,left,right);return right.id;}
 function fitLayers(p){const d=duration(p);if(p.music){p.music.fadeIn=Math.min(p.music.fadeIn||0,d);p.music.fadeOut=Math.min(p.music.fadeOut||0,d);}p.layers=p.layers.filter(l=>l.start<d).map(l=>{l.end=Math.min(l.end,d);if(l.type==='video')l.end=Math.min(l.end,l.start+l.duration-l.in);const len=l.end-l.start;l.fadeIn=Math.min(l.fadeIn||0,len);l.fadeOut=Math.min(l.fadeOut||0,len);return l;});}
 function opacity(l,t){const len=l.end-l.start,local=t-l.start;if(local<0||local>=len)return 0;let a=l.opacity??1;if(l.fadeIn>0)a*=Math.min(1,local/l.fadeIn);if(l.fadeOut>0)a*=Math.min(1,(len-local)/l.fadeOut);return a;}
 return {uid,blank,length,duration,sequence,locate,upgrade,split,fitLayers,opacity};
});
