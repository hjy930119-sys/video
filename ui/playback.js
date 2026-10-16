(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.FramePlayback=factory();})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const states=new WeakMap();
 function stateFor(el){let s=states.get(el);if(s)return s;s={active:false,wantPlay:false,target:null,expected:null,retries:0,playPromise:null,blocked:false,onError:()=>{}};states.set(el,s);for(const event of ['loadedmetadata','loadeddata','canplay'])el.addEventListener(event,()=>pump(el,s));el.addEventListener('seeked',()=>{if(s.expected!==null){if(s.target!==null){s.expected=null;s.retries=0;}else if(Math.abs(el.currentTime-s.expected)>.08){if(s.retries++<1){s.target=s.expected;s.expected=null;}else{s.blocked=true;el.pause();s.onError(Error('요청한 영상 위치를 읽지 못했습니다. 처음으로 되돌아가지 않고 현재 위치를 유지합니다.'));return;}}else{s.expected=null;s.retries=0;}}pump(el,s);});return s;}
 function pump(el,s){
  if(!s.active){if(!el.paused)el.pause();return;}
  if(!s.wantPlay&&!el.paused)el.pause();
  // Finish the in-flight decode before applying the most recent scrub position.
  if(el.seeking||el.readyState<1||!Number.isFinite(el.duration))return;
  if(s.expected!==null&&s.target===null)return;
  if(s.target!==null){s.expected=null;const target=Math.min(Math.max(0,s.target),Math.max(0,el.duration-.002));s.target=null;if(Math.abs(el.currentTime-target)>.002){el.pause();s.expected=target;el.currentTime=target;return;}}
  if(s.wantPlay&&el.readyState>=2&&!el.ended&&el.paused&&!s.playPromise&&!s.blocked){
   let result;try{result=el.play();}catch(e){s.blocked=true;s.onError(e);return;}
   s.playPromise=Promise.resolve(result).then(()=>{s.playPromise=null;if(!s.active||!s.wantPlay)el.pause();},e=>{s.playPromise=null;if(e.name!=='AbortError'){s.blocked=true;s.onError(e);}});
  }
 }
 function sync(el,{time,active,playing,volume=1,force=false,master=false,onError}){
  if(!el)return;const s=stateFor(el),entering=active&&!s.active;s.active=active;s.wantPlay=active&&playing;if(onError)s.onError=onError;el.volume=Math.max(0,Math.min(1,volume));
  if(!active){s.target=null;s.expected=null;pump(el,s);return;}
  if(force||entering){s.target=time;s.blocked=false;s.retries=0;}
  else if(!master&&playing&&s.target===null&&!el.seeking&&Math.abs(el.currentTime-time)>.3)s.target=time;
  pump(el,s);
 }
 function pause(el){const s=stateFor(el);s.wantPlay=false;el.pause();}
 function ready(el){const s=el&&states.get(el);return !!(s?.active&&!s.blocked&&s.expected===null&&s.target===null&&!el.seeking&&el.readyState>=2);}
 return {sync,pause,ready};
});
