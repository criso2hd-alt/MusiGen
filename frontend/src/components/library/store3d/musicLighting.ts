import {Color, Material, MathUtils} from 'three';
import {speakerEnergy} from './speakers';
import {createLightRhythm,styleLighting} from './lightRhythm';
/** Local real-time color washes layered over the baked room; no shadow maps. */
export function createMusicLighting(){
 const strength={value:0},time={value:0},bass={value:0},high={value:0},color={value:new Color()};
 const materials=new Set<Material>();
 const rhythm=createLightRhythm(); const beat={value:0},styleEnergy={value:1},hue={value:.7};
 return {
  add(material:Material,neon=false){if(materials.has(material))return;materials.add(material);
   material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{musicStrength:strength,musicTime:time,musicBass:bass,musicHigh:high,musicColor:color,musicBeat:beat,musicStyle:styleEnergy,musicHue:hue});
    shader.vertexShader='varying vec3 musicWorld;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','musicWorld=(modelMatrix*vec4(transformed,1.0)).xyz;\n#include <project_vertex>');
    shader.fragmentShader='varying vec3 musicWorld; uniform float musicStrength,musicTime,musicBass,musicHigh,musicBeat,musicStyle,musicHue; uniform vec3 musicColor;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      float stepBeat=floor(musicBeat);
      float mode=mod(floor(musicBeat/16.0),3.0);
      vec3 blendedLight=vec3(0.0);
      float totalWeight=0.0;
      // Overlapping Gaussian light pools: blend each zone's final light output,
      // not its numeric ID, so both color and brightness stay continuous.
      for(int side=0;side<2;side++)for(int row=0;row<5;row++){
        float zone=float(row+side*5);
        vec2 center=vec2(side==0?-4.5:4.5,-7.15+float(row)*3.7);
        vec2 offset=(musicWorld.xz-center)/vec2(3.8,2.6);
        float weight=exp(-0.5*dot(offset,offset));
        float selected=1.0-step(.55,abs(mod(zone-stepBeat+20.0,10.0)));
        float alternate=mod(zone+stepBeat,2.0);
        float sweep=0.5+0.5*sin(musicBeat*1.57-zone*1.2);
        float pattern=mode<1.0?selected:mode<2.0?alternate:sweep;
        vec3 tint=0.5+0.5*cos(6.28318*(musicHue+zone*.115+floor(musicBeat/8.0)*.13+vec3(0.0,.33,.67)));
        float energy=(.18+pattern*.8+musicBass*.7+musicHigh*.35)*musicStyle;
        blendedLight+=tint*energy*weight;
        totalWeight+=weight;
      }
      vec3 zoneColor=blendedLight/max(totalWeight,0.0001);
      float pulse=1.0;
      ${neon?`
      float letterZone=smoothstep(2.45,2.75,musicWorld.y)*(1.0-smoothstep(-8.7,-8.3,musicWorld.z))*(1.0-smoothstep(2.2,2.6,abs(musicWorld.x)));
      float chase=exp(-pow((musicWorld.x-(mod(musicBeat*.65,5.0)-2.5))*2.5,2.0));
      vec3 neonTint=mix(outgoingLight,outgoingLight*zoneColor*3.0,0.85*musicStrength);
      outgoingLight=mix(outgoingLight,neonTint*(1.0+musicStrength*(pulse+letterZone*chase*2.0)),musicStrength);
    `:`
      float sideWash=exp(-pow((abs(musicWorld.x)-5.9)/2.4,2.0));
      float rearWash=exp(-pow((musicWorld.z+8.6)/2.5,2.0));
      float floorPulse=exp(-abs(musicWorld.y)*1.8)*musicBass;
      outgoingLight+=zoneColor*musicStrength*pulse*(sideWash*0.45+rearWash*0.20+floorPulse*0.3);
    `}\n#include <opaque_fragment>`);
   };
   material.customProgramCacheKey=()=>`music-wash-feathered-${neon}`;material.needsUpdate=true;
  },
  update(dt:number,freq:Uint8Array,sampleRate:number,playing:boolean,intensity:number,position:number,bpm:number|null|undefined,style:string,trackId:string){
   const low=speakerEnergy(freq,sampleRate,'big'),treble=speakerEnergy(freq,sampleRate,'small');
   strength.value=MathUtils.damp(strength.value,playing?intensity:0,2,dt);
   bass.value=MathUtils.damp(bass.value,low,8,dt);high.value=MathUtils.damp(high.value,treble,6,dt);
   const profile=styleLighting(style);styleEnergy.value=profile.energy;hue.value=profile.hue;
   if(playing)beat.value=rhythm.update(position,low,bpm,trackId).beat*profile.pace;
   if(playing)time.value+=dt*(0.7+low*.6);
   color.value.setHSL((time.value*.025+.8)%1,.8,.48);
  }
 };
}
