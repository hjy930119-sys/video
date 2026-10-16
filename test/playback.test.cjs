const test=require('node:test'),assert=require('node:assert/strict'),P=require('../ui/playback.js');
class Media extends EventTarget{
 constructor(){super();this.readyState=4;this.duration=30;this.paused=true;this.seeking=false;this.ended=false;this.time=0;this.seeks=[];this.plays=0;}
 get currentTime(){return this.time;}
 set currentTime(t){assert.equal(this.seeking,false,'must not interrupt in-flight seek');this.time=t;this.seeking=true;this.readyState=1;this.seeks.push(t);}
 pause(){this.paused=true;}
 play(){assert.equal(this.seeking,false);assert.ok(this.readyState>=2);this.plays++;this.paused=false;return Promise.resolve();}
 finish(){this.seeking=false;this.readyState=4;this.dispatchEvent(new Event('seeked'));}
}
const sync=(el,time,force=true)=>P.sync(el,{time,active:true,playing:true,volume:1,force,master:true});
test('rapid scrub coalesces targets and resumes only after final decoded frame',async()=>{const el=new Media();sync(el,5);sync(el,9);sync(el,3);assert.deepEqual(el.seeks,[5]);assert.equal(el.plays,0);assert.equal(P.ready(el),false);el.finish();assert.deepEqual(el.seeks,[5,3]);assert.equal(el.plays,0);el.finish();assert.equal(P.ready(el),true);assert.equal(el.plays,1);await Promise.resolve();assert.equal(el.paused,false);});
test('slow decoder is not chased by wall clock; pause wins over pending playback',async()=>{const el=new Media();sync(el,10);for(let i=0;i<300;i++)sync(el,10+i/60,false);assert.deepEqual(el.seeks,[10]);P.pause(el);el.finish();assert.equal(el.paused,true);assert.equal(el.plays,0);sync(el,10);assert.equal(el.plays,1);P.pause(el);await Promise.resolve();assert.equal(el.paused,true);});
test('inactive clips do not seek or play; seek before metadata is retained',()=>{const el=new Media();el.readyState=0;el.duration=NaN;sync(el,7);assert.deepEqual(el.seeks,[]);el.duration=30;el.readyState=1;el.dispatchEvent(new Event('loadedmetadata'));assert.deepEqual(el.seeks,[7]);P.sync(el,{time:25,active:false,playing:true,volume:0});el.finish();assert.equal(el.paused,true);assert.equal(el.plays,0);assert.deepEqual(el.seeks,[7]);});

test('a decoder returning zero after seeking never resets the transport or starts at zero',()=>{const el=new Media(),errors=[];P.sync(el,{time:15,active:true,playing:true,volume:1,force:true,master:true,onError:e=>errors.push(e.message)});el.time=0;el.finish();assert.deepEqual(el.seeks,[15,15]);assert.equal(P.ready(el),false);el.time=0;el.finish();assert.equal(P.ready(el),false);assert.equal(el.plays,0);assert.equal(errors.length,1);});
