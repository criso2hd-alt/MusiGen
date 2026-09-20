import * as THREE from "three";
import type { Track } from "../../../lib/types";

export function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas'); canvas.width=width; canvas.height=height;
  draw(canvas.getContext('2d')!);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
export function words(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, line: number, max = 8) {
  const parts = text.split(/\s+/); let row = '', count = 0;
  for (const word of parts) {
    if (ctx.measureText(row+' '+word).width > width && row) { ctx.fillText(row,x,y); y+=line; row=word; if(++count >= max) { ctx.fillText('…',x,y); return; } }
    else row += (row ? ' ' : '')+word;
  }
  ctx.fillText(row,x,y);
}
export function signTexture(title: string, subtitle = '', color='#6feaff', neon=false) {
  return canvasTexture(1024,256,(c)=>{
    c.fillStyle='#10121b'; c.fillRect(0,0,1024,256);
    c.strokeStyle='#3b414d'; c.lineWidth=2; c.strokeRect(8,8,1008,240);
    c.textAlign='center'; c.font='500 76px sans-serif'; c.fillStyle=color;
    if(neon){c.shadowColor=color;c.shadowBlur=22;}
    c.fillText(title,512,132,950); c.shadowBlur=0;
    c.font='22px sans-serif'; c.fillStyle='#e0d3c4'; c.fillText(subtitle,512,203,950);
  });
}
export function woodTexture() {
  return canvasTexture(512,512,c=>{
    c.fillStyle='#35231f'; c.fillRect(0,0,512,512);
    for(let i=0;i<430;i++){const x=(i*137.3)%512; c.strokeStyle=`rgba(${i%2?'185,123,65':'4,1,0'},${.03+(i%7)*.014})`; c.beginPath(); c.moveTo(x,0); c.bezierCurveTo(x+8,170,x-12,320,x+4,512); c.stroke();}
    for(let i=0;i<4;i++){c.fillStyle='#191216';c.fillRect(i*128,0,2,512);}
  });
}
export function floorTexture() {
  return canvasTexture(512,512,c=>{
    c.fillStyle='#16191e'; c.fillRect(0,0,512,512);
    let seed=93; const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
    for(let i=0;i<7000;i++){c.fillStyle=['#49454b','#60554e','#222e37','#a8947d'][i%4];c.globalAlpha=.2+random()*.5;c.fillRect(random()*512,random()*512,random()*3+1,random()*2+1);} c.globalAlpha=1;
    c.strokeStyle='#080d14';c.strokeRect(0,0,512,512);
  });
}
export function posterTexture(index: number) {
  return canvasTexture(512,768,c=>{
    const colors=['#ff81bf','#56cfe6','#e4a261']; const color=colors[index%3];
    c.fillStyle='#141723';c.fillRect(0,0,512,768);
    c.strokeStyle=color;c.lineWidth=3;c.strokeRect(23,23,466,722);
    const grad=c.createLinearGradient(0,130,0,500);grad.addColorStop(0,color);grad.addColorStop(1,'#2c1f4a');c.fillStyle=grad;
    c.beginPath();c.arc(256,290,150,0,Math.PI*2);c.fill();
    c.fillStyle='#141723';for(let i=0;i<9;i++)c.fillRect(80,290+i*19,355,5+i);
    c.strokeStyle=color;for(let i=0;i<9;i++){c.beginPath();c.moveTo(30,535+i*8);c.lineTo(140,405+i*9);c.lineTo(280,500+i*5);c.lineTo(400,379+i*13);c.lineTo(490,548+i*7);c.stroke();}
    c.fillStyle='#efe6d8';c.textAlign='center';c.font='bold 42px sans-serif';c.fillText(['AFTER HOURS','SIDE A / SIDE B','ANALOG SOUL'][index%3],256,650);
    c.font='17px sans-serif';c.fillText('MUSIGEN  •  LISTEN / DISCOVER / REPEAT',256,704);
  });
}
export function sleeveTexture(track: Track, back=false) {
  return canvasTexture(768,768,c=>{
    let hash=0;for(const ch of track.id)hash=(hash*31+ch.charCodeAt(0))>>>0;
    const hue=hash%360;
    c.fillStyle=back?'#161720':`hsl(${hue},40%,14%)`;c.fillRect(0,0,768,768);
    if(!back){
      const g=c.createLinearGradient(0,0,768,768);g.addColorStop(0,`hsl(${hue},65%,55%)`);g.addColorStop(1,`hsl(${(hue+100)%360},65%,20%)`);c.fillStyle=g;
      for(let i=0;i<9;i++){c.beginPath();c.arc(384,340,290-i*26,Math.PI*.1,Math.PI*1.9);c.lineWidth=13;c.strokeStyle=`hsl(${(hue+i*11)%360},65%,${40+i*4}%)`;c.stroke();}
      c.fillStyle='#fff';c.font='bold 44px sans-serif';words(c,track.title,45,605,680,53,2);
    } else {
      c.fillStyle='#60e3ed';c.font='bold 38px sans-serif';words(c,track.title,45,68,678,44,2);
      c.fillStyle='#ded7ce';c.font='23px sans-serif';words(c,track.style || 'An original MusiGen recording',45,215,678,33,5);
      c.fillStyle='#a49cbb';c.font='22px monospace';
      c.fillText(`SEED  ${track.seed}`,45,470);c.fillText(`DURATION  ${Math.floor(track.duration/60)}:${Math.floor(track.duration%60).toString().padStart(2,'0')}`,45,510);
      c.fillText(`ENGINE  ${track.engine.toUpperCase()}`,45,550);
      c.fillStyle='#6b6174';c.fillRect(45,594,678,2);c.fillStyle='#e4d9c8';c.font='18px sans-serif';c.fillText('MUSIGEN RECORDS  /  YOUR SOUND, YOUR COLLECTION',45,645);
      c.font='16px monospace';c.fillText(track.id.slice(0,40),45,698);
    }
  });
}
