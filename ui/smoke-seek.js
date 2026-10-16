async function frameSmokeSeek(file){
 const wait=async(fn,label)=>{const end=performance.now()+6000;while(performance.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw Error(label);};
 const clips=[0,1].map(i=>({...file,id:'smoke-'+i,in:0,out:2,volume:1,fadeIn:0,fadeOut:0}));
 await load({version:2,width:320,height:180,clips,layers:[],music:null});
 $('play').click();await wait(()=>t>.08,'Initial UI playback stalled');
 function at(time,down=true){const r=$('ruler').getBoundingClientRect();const event={bubbles:true,button:0,pointerId:1,clientX:r.left+72+time*55,clientY:r.top+8};if(down)$('ruler').dispatchEvent(new PointerEvent('pointerdown',event));else document.dispatchEvent(new PointerEvent('pointermove',event));}
 function up(){document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0,pointerId:1}));}
 async function verify(target,red){await wait(()=>{const c=M.locate(p,t),v=assetFor(c.id);return playing&&t>=target&&t<target+.8&&P.ready(v)&&!v.paused;},'UI playback did not recover after seek '+target);const before=t;await wait(()=>t>before+.07,'Timeline clock stopped after seek');const pixel=ctx.getImageData(160,90,1,1).data;if(!(red?pixel[0]>180&&pixel[2]<80:pixel[2]>180&&pixel[0]<80))throw Error('UI canvas wrong frame after seek '+target+': '+pixel);const v=assetFor(M.locate(p,t).id);if(v.muted||v.volume<.9||v.error)throw Error('Audio muted or media failed after seek');if(v.captureStream){const stream=v.captureStream();const hasAudio=stream.getAudioTracks().length>0;stream.getTracks().forEach(track=>track.stop());if(!hasAudio)throw Error('Decoded audio track missing after seek');}}
 for(const [target,red] of [[1.3,true],[.3,false],[3.3,true],[2.3,false]]){at(target);up();await verify(target,red);}
 at(1.4);for(const target of [.2,3.5,.4,2.4])at(target,false);up();await verify(2.4,false);
 // A paused scrub stays paused, and the play button restarts audio/video at that point.
 $('play').click();at(.3);up();await wait(()=>P.ready(assetFor('smoke-0')),'Paused frame never decoded');if(playing)throw Error('Paused scrub unexpectedly started playback');$('play').click();await verify(.3,false);
 stop();for(const a of assets.values())if(a.el instanceof HTMLMediaElement){a.el.removeAttribute('src');a.el.load();}
 console.log('PASS: actual editor repeated forward/back seek, rapid drag, pause/resume, decoded canvas frames and audio tracks');
 return true;
}
