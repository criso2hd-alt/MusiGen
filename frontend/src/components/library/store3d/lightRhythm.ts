export function styleLighting(style:string){
 const gentle=/ambient|lo-fi|classical|jazz|folk|acoustic/i.test(style);
 const energetic=/dance|house|techno|synthwave|disco|rock|metal|drum and bass|trance/i.test(style);
 return {pace:gentle?.5:energetic?2:1,energy:gentle?.55:energetic?1.35:1,hue:/synthwave|vapor/i.test(style)?.78:/jazz|soul|folk/i.test(style)?.06:.52};
}
/** Onset interval estimate, with saved BPM preferred over noisy audio estimates. */
export function createLightRhythm(){
 let previous=0,lastOnset=-10,estimate=110,average=0,beat=0,lastTime=0,track='';
 const intervals:number[]=[];
 return {update(time:number,energy:number,bpm:number|null|undefined,id:string){
  if(id!==track||time<lastTime-.2){track=id;previous=average=beat=0;lastOnset=-10;intervals.length=0;lastTime=time;estimate=110;}
  const dt=Math.max(0,Math.min(.1,time-lastTime));lastTime=time;
  average+=(energy-average)*(1-Math.exp(-dt*2));
  const onset=energy>average*1.12+.015&&energy-previous>.025&&time-lastOnset>.26;
  if(onset){const gap=time-lastOnset;if(gap>=.3&&gap<=1){intervals.push(gap);if(intervals.length>8)intervals.shift();const sorted=[...intervals].sort((a,b)=>a-b);estimate=60/sorted[Math.floor(sorted.length/2)];}lastOnset=time;}
  previous=energy;
  const tempo=bpm&&bpm>=40&&bpm<=240?bpm:estimate;
  beat+=dt*tempo/60;
  return {beat,tempo,onset};
 }};
}
