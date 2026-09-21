import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { foreground, FOREGROUND_LAYER, renderStore } from './foreground';
import { createListeningDeck } from './turntable';
import type { Track } from '../../../lib/types';
import { audioEngine } from '../../../lib/audio';
import { BINS, canStand } from './layout';
import { signTexture, sleeveTexture, woodTexture } from './textures';

export type Visit = { x: number; z: number; yaw: number; pitch: number };
export type StoreTarget = { title: string; track?: Track; action?: 'visualizer' };
export type StoreControls = { exit: (complete:()=>void) => void; capture: () => void; freeLook: () => void; inspect: () => void; play: () => void; flip: () => void; home: () => void; dispose: () => void };
export function createStoreScene(host: HTMLDivElement, tracks: Track[], shelfName: string, visit: Visit, quality: 'balanced' | 'low', callbacks: {
  target: (target: StoreTarget | null) => void; inspection: (track: Track | null) => void; capture: (locked: boolean) => void;
  playing: (id: string) => boolean; play: (track: Track) => void; visualizer: () => void; error: (message: string) => void;
}): StoreControls {
  const renderer=new THREE.WebGLRenderer({antialias:quality==='balanced',powerPreference:'low-power'});
  renderer.info.autoReset=false;
  renderer.setPixelRatio(Math.min(devicePixelRatio,quality==='balanced'?1.5:1));
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.4;
  const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label','3D record store. Shift captures mouse; WASD walks; F inspects; Space plays.');
  canvas.style.cssText='width:100%;height:100%;display:block;outline:none;';host.appendChild(canvas);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#11111a');scene.fog=new THREE.Fog('#11111a',14,30);
  const camera=new THREE.PerspectiveCamera(65,1,.04,50);camera.rotation.order='YXZ';camera.position.set(visit.x,1.65,visit.z);camera.rotation.set(visit.pitch,visit.yaw,0);scene.add(camera);
  const resources=new Set<{dispose:()=>void}>();let disposed=false;
  const own=<T extends {dispose:()=>void}>(value:T)=>{resources.add(value);return value;};
  const material=(color:string,extra:THREE.MeshStandardMaterialParameters={})=>own(new THREE.MeshStandardMaterial({color,roughness:.65,...extra}));
  const wood=own(woodTexture());wood.wrapS=wood.wrapT=THREE.RepeatWrapping;
  const walnut=material('#b5a091',{map:wood}),dark=material('#12131a'),cream=material('#cdc0a3');
  const cubeGeometry=own(new THREE.BoxGeometry(1,1,1));const planeGeometry=own(new THREE.PlaneGeometry(1,1));
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,mat:THREE.Material,parent:THREE.Object3D=scene)=>{const mesh=new THREE.Mesh(cubeGeometry,mat);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);parent.add(mesh);return mesh;};
  const panel=(texture:THREE.Texture,x:number,y:number,z:number,w:number,h:number,rotation=0,parent:THREE.Object3D=scene)=>{own(texture);const mat=own(new THREE.MeshBasicMaterial({map:texture,toneMapped:false}));const mesh=new THREE.Mesh(planeGeometry,mat);mesh.position.set(x,y,z);mesh.scale.set(w,h,1);mesh.rotation.y=rotation;parent.add(mesh);return mesh;};
  const fillLight=new THREE.HemisphereLight('#d7e2ff','#88654f',2.8);fillLight.layers.enable(FOREGROUND_LAYER);scene.add(fillLight);
  const keyLight=new THREE.DirectionalLight('#ffe3bf',2);keyLight.position.set(0,4,5);keyLight.layers.enable(FOREGROUND_LAYER);scene.add(keyLight);
  // The room is authored in Blender. Its lightmap preserves the lighting without runtime shadows.
  host.dataset.loading='true';
  const roomMaterials=new Set<THREE.MeshBasicMaterial>();let lightsReady=false,lightsTime=0;let exitComplete:(()=>void)|null=null,exitTime=0,exitBrightness=1;
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  new GLTFLoader().load('/store/neon-boutique.glb',gltf=>{
    const assets=new Set<{dispose:()=>void}>();
    gltf.scene.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      assets.add(object.geometry);
      for(const mat of Array.isArray(object.material)?object.material:[object.material]){
        assets.add(mat);
        if(mat instanceof THREE.MeshBasicMaterial){roomMaterials.add(mat);mat.color.setScalar(reducedMotion?1:.08);}
        for(const value of Object.values(mat))if(value instanceof THREE.Texture){assets.add(value);value.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());}
      }
    });
    if(disposed){assets.forEach(asset=>asset.dispose());return;}
    assets.forEach(asset=>resources.add(asset));scene.add(gltf.scene);
    new GLTFLoader().load('/store/neon-fixtures.glb',neon=>{
      neon.scene.traverse(object=>{
        if(!(object instanceof THREE.Mesh))return;
        if(disposed){object.geometry.dispose();for(const m of Array.isArray(object.material)?object.material:[object.material])m.dispose();return;}
        own(object.geometry);
        const convert=(m:THREE.MeshStandardMaterial)=>{own(m);return own(new THREE.MeshBasicMaterial({color:m.emissive.clone().multiplyScalar(m.emissiveIntensity),polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));};
        object.material=Array.isArray(object.material)?object.material.map(convert):convert(object.material);
      });
      if(disposed)return;
      scene.add(neon.scene);lightsReady=true;host.dataset.loading='false';
    },undefined,()=>{if(!disposed){lightsReady=true;host.dataset.loading='false';}});
  },undefined,()=>{if(!disposed){host.dataset.loading='false';callbacks.error('The store model could not load. Exit the store and try again.');}});
  const screenCanvas=document.createElement('canvas');screenCanvas.width=768;screenCanvas.height=256;const screenCtx=screenCanvas.getContext('2d')!;const screenTexture=own(new THREE.CanvasTexture(screenCanvas));screenTexture.colorSpace=THREE.SRGBColorSpace;
  const screen=panel(screenTexture,0,1.95,-8.945,5.7,1.23);screen.userData.target={title:'Open full-screen visualizer',action:'visualizer'} satisfies StoreTarget;
  // Every sleeve faces the entrance, with raised rows visible above those in front.
  const actionMeshes:THREE.Object3D[]=[screen];
  const textureLoader=new THREE.TextureLoader();let trackIndex=0;
  const sleeveGeometry=own(new THREE.BoxGeometry(.82,.82,.045));
  for(const [binIndex,bin] of BINS.entries()){
    panel(signTexture(shelfName.toUpperCase(),`CRATE ${String(binIndex+1).padStart(2,'0')} • MUSIGEN`,'#eee0c8'),bin.x,.42,bin.z+bin.depth/2+.03,2.8,.48);
    for(let row=0;row<2;row++)for(let col=0;col<3;col++){
      const x=bin.x+(col-1)*1.05,z=bin.z+.25-row*.62,y=1.13+row*.28;
      const track=tracks[trackIndex++];
      for(let layer=0;layer<(track?5:0);layer++){const jacket=box(x,y-.06+layer*.012,z-.04-layer*.045,.79,.73,.025,layer%2?dark:walnut);jacket.rotation.x=-.13;}
      if(!track){panel(signTexture((binIndex+col)%2?'COMING SOON':'SOLD OUT','YOUR NEXT DISCOVERY','#d5bf98'),x,y,z+.015,.82,.38);continue;}
      const front=own(sleeveTexture(track)),back=own(sleeveTexture(track,true));
      const frontMat=own(new THREE.MeshBasicMaterial({map:front,toneMapped:false}));const backMat=own(new THREE.MeshBasicMaterial({map:back,toneMapped:false}));
      const record=new THREE.Mesh(sleeveGeometry,[cream,cream,cream,cream,frontMat,backMat]);record.position.set(x,y,z+.015);record.rotation.x=-.13;record.userData.target={title:track.title,track} satisfies StoreTarget;
      scene.add(record);actionMeshes.push(record);
      if(track.cover_url){textureLoader.load(track.cover_url,loaded=>{if(disposed){loaded.dispose();return;}loaded.colorSpace=THREE.SRGBColorSpace;loaded.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());own(loaded);frontMat.map=loaded;frontMat.needsUpdate=true;},undefined,()=>{/* Keep the procedural sleeve on missing art. */});}
    }
  }
  const keys=new Set<string>();const raycaster=new THREE.Raycaster();raycaster.far=4.2;
  let target:THREE.Object3D|null=null,inspected:THREE.Mesh|null=null,inspection:THREE.Mesh|null=null,locked=false,drag=false,dragDistance=0;
  let yaw=camera.rotation.y,pitch=camera.rotation.x,rotation=0,frame=0,lastTime=0,lastScreen=0,lastTarget='';
  const release=()=>{if(document.pointerLockElement===canvas)document.exitPointerLock();};
  const capture=()=>{canvas.focus();if(document.pointerLockElement===canvas){release();return;}try{const request=canvas.requestPointerLock();request?.catch(()=>callbacks.error('Mouse capture was blocked. Click Enter / capture mouse and try again.'));}catch{callbacks.error('Mouse capture is unavailable. You can still point at records and click to inspect.');}};
  const deck=createListeningDeck(camera);
  let phase:'idle'|'lifting'|'held'|'returning'='idle',transition=0,deckRequested=false;
  const startPosition=new THREE.Vector3(),startQuaternion=new THREE.Quaternion();
  const homePosition=new THREE.Vector3(),homeQuaternion=new THREE.Quaternion(),inverseCamera=new THREE.Quaternion();
  const sleeveHome=()=>{
    if(!inspected)return;
    camera.updateMatrixWorld();inspected.getWorldPosition(homePosition);camera.worldToLocal(homePosition);
    camera.getWorldQuaternion(inverseCamera).invert();inspected.getWorldQuaternion(homeQuaternion);homeQuaternion.premultiply(inverseCamera);
  };
  const finishReturn=()=>{if(inspected)inspected.visible=true;if(inspection)camera.remove(inspection);inspection=null;inspected=null;phase='idle';deckRequested=false;callbacks.inspection(null);};
  const returnRecord=()=>{if(!inspection||phase==='returning')return;deck.close();deckRequested=false;phase='returning';transition=0;startPosition.copy(inspection.position);startQuaternion.copy(inspection.quaternion);};
  const inspect=()=>{
    if(exitComplete)return;
    if(inspected){returnRecord();return;}
    const data=target?.userData.target as StoreTarget|undefined;if(!data)return;
    if(data.action==='visualizer'){release();callbacks.visualizer();return;}
    inspected=target as THREE.Mesh;inspection=inspected.clone();foreground(inspection);camera.add(inspection);sleeveHome();inspection.position.copy(homePosition);inspection.quaternion.copy(homeQuaternion);startPosition.copy(homePosition);startQuaternion.copy(homeQuaternion);inspection.scale.setScalar(1);rotation=0;phase='lifting';transition=0;inspected.visible=false;callbacks.inspection(data.track!);
  };
  const play=()=>{
    if(exitComplete||phase==='returning')return;
    const data=(inspected||target)?.userData.target as StoreTarget|undefined;
    if(data?.track){
      if(!inspected)inspect();
      const mats=inspection?.material;
      deck.start(Array.isArray(mats)?(mats[4] as THREE.MeshBasicMaterial).map:null);deckRequested=true;rotation=0;
      callbacks.play(data.track);
    }else if(data?.action==='visualizer'){release();callbacks.visualizer();}
  };
  const updateTarget=()=>{
    if(inspected)return;
    const intersections=raycaster.intersectObjects(scene.children,true);
    const hit=intersections.find((entry)=>{ const mat=(entry.object as THREE.Mesh).material; return entry.object.visible && (!mat || Array.isArray(mat) || !mat.transparent); });
    const next=hit && actionMeshes.includes(hit.object)?hit.object:null;
    target=next;const title=next?.uuid||'';if(title!==lastTarget){lastTarget=title;callbacks.target((next?.userData.target as StoreTarget)||null);}
  };
  const keydown=(e:KeyboardEvent)=>{
    if(exitComplete)return;
    if(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement)return;
    if(!locked && document.activeElement!==canvas)return;
    if(['KeyW','KeyA','KeyS','KeyD','KeyF','Space','ShiftLeft','ShiftRight','Escape'].includes(e.code))e.preventDefault();
    if(e.repeat)return;
    keys.add(e.code);
    if(e.code==='ShiftLeft'||e.code==='ShiftRight')capture();
    if(e.code==='KeyF')inspect();if(e.code==='Space')play();
    if(e.code==='Escape'){returnRecord();release();}
  };
  const keyup=(e:KeyboardEvent)=>keys.delete(e.code);
  const mousemove=(e:MouseEvent)=>{
    if(exitComplete)return;
    if(locked){if(inspection){rotation+=e.movementX*.008;inspection.rotation.x=THREE.MathUtils.clamp(inspection.rotation.x+e.movementY*.005,-.7,.7);}else{yaw-=e.movementX*.0022;pitch=THREE.MathUtils.clamp(pitch-e.movementY*.0022,-1.2,1.2);}}
    else if(drag&&!inspection){yaw-=e.movementX*.0022;pitch=THREE.MathUtils.clamp(pitch-e.movementY*.0022,-1.2,1.2);dragDistance+=Math.abs(e.movementX)+Math.abs(e.movementY);}
    else if(drag&&inspection){rotation+=e.movementX*.008;inspection.rotation.x=THREE.MathUtils.clamp(inspection.rotation.x+e.movementY*.005,-.7,.7);dragDistance+=Math.abs(e.movementX)+Math.abs(e.movementY);}
    else if(e.target===canvas){const bounds=canvas.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((e.clientX-bounds.left)/bounds.width*2-1,-(e.clientY-bounds.top)/bounds.height*2+1),camera);updateTarget();}
  };
  const mousedown=(e:MouseEvent)=>{if(e.target!==canvas)return;canvas.focus();if(e.button===2){e.preventDefault();if(!locked&&!inspected){const b=canvas.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1),camera);updateTarget();}play();return;}if(e.button===0){drag=true;dragDistance=0;}};
  const mouseup=(e:MouseEvent)=>{if(e.button!==0)return;if(drag&&dragDistance<6&&(e.target===canvas||locked)){if(!locked&&!inspected){const bounds=canvas.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((e.clientX-bounds.left)/bounds.width*2-1,-(e.clientY-bounds.top)/bounds.height*2+1),camera);updateTarget();}inspect();}drag=false;};
  const pointerchange=()=>{locked=document.pointerLockElement===canvas;keys.clear();drag=false;callbacks.capture(locked);};
  const pointererror=()=>callbacks.error('Mouse capture was not allowed. Try Enable mouse capture again, or use Browse without capture: drag to look, WASD to walk.');
  const blur=()=>{keys.clear();drag=false;release();};
  const contextmenu=(e:Event)=>e.preventDefault();
  const contextlost=(e:Event)=>{e.preventDefault();callbacks.error('The graphics device was interrupted. Exit the store and enter again to reload it.');release();};
  canvas.addEventListener('contextmenu',contextmenu);canvas.addEventListener('webglcontextlost',contextlost);
  window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('mousemove',mousemove);window.addEventListener('mousedown',mousedown);window.addEventListener('mouseup',mouseup);window.addEventListener('blur',blur);
  document.addEventListener('pointerlockchange',pointerchange);document.addEventListener('pointerlockerror',pointererror);
  const resize=()=>{const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(host);resize();
  const forward=new THREE.Vector3(),right=new THREE.Vector3(),movement=new THREE.Vector3();
  const drawScreen=()=>{
    screenCtx.fillStyle='#040711';screenCtx.fillRect(0,0,768,256);
    const playing=!audioEngine.el.paused&&!audioEngine.el.ended;
    const {freq,wave}=audioEngine.sample();
    if(playing&&freq.length){
      const gradient=screenCtx.createLinearGradient(0,20,0,235);gradient.addColorStop(0,'#f5a5e5');gradient.addColorStop(.45,'#a668f7');gradient.addColorStop(1,'#26d9ed');
      screenCtx.fillStyle=gradient;
      for(let i=0;i<64;i++){
        const first=Math.floor(Math.pow(i/64,1.8)*freq.length*.8),end=Math.max(first+1,Math.floor(Math.pow((i+1)/64,1.8)*freq.length*.8));
        let amplitude=0;for(let j=first;j<end;j++)amplitude=Math.max(amplitude,freq[j]||0);
        const height=amplitude/255*190;screenCtx.fillRect(17+i*11.5,230-height,8,Math.max(2,height));
      }
      screenCtx.strokeStyle='#ddffff';screenCtx.lineWidth=1.5;screenCtx.beginPath();
      for(let x=0;x<736;x+=3){const y=95+((wave[Math.floor(x/736*wave.length)]??128)-128)/128*65;if(x===0)screenCtx.moveTo(x+16,y);else screenCtx.lineTo(x+16,y);}screenCtx.stroke();
    }else{
      screenCtx.textAlign='center';screenCtx.fillStyle='#77deea';screenCtx.font='500 35px sans-serif';screenCtx.fillText('MUSIGEN • LIVE SOUND',384,118);
      screenCtx.fillStyle='#a8a4bd';screenCtx.font='19px sans-serif';screenCtx.fillText('Pick a record. Find your frequency.',384,159);
    }
    screenTexture.needsUpdate=true;
  };
  const animate=(time:number)=>{
    if(disposed)return;frame=requestAnimationFrame(animate);
    if(document.hidden){keys.clear();return;}
    if(time-lastTime<1000/(quality==='low'?30:45))return;
    const delta=Math.min((time-lastTime)/1000,.05);lastTime=time;
    if((locked || document.activeElement===canvas)&&!inspection){forward.set(-Math.sin(yaw),0,-Math.cos(yaw));right.set(Math.cos(yaw),0,-Math.sin(yaw));movement.set(0,0,0);if(keys.has('KeyW'))movement.add(forward);if(keys.has('KeyS'))movement.sub(forward);if(keys.has('KeyD'))movement.add(right);if(keys.has('KeyA'))movement.sub(right);movement.normalize().multiplyScalar(delta*2.8);
      const x=camera.position.x+movement.x,z=camera.position.z+movement.z;if(canStand(x,camera.position.z))camera.position.x=x;if(canStand(camera.position.x,z))camera.position.z=z;
    }
    camera.rotation.set(pitch,yaw,0);camera.updateMatrixWorld();
    if(locked&&!inspection){raycaster.setFromCamera(new THREE.Vector2(0,0),camera);updateTarget();}
    const data=inspected?.userData.target as StoreTarget|undefined;
    const deckState=deck.update(delta,Boolean(data?.track&&callbacks.playing(data.track.id)));
    if(inspection){
      transition+=delta;
      if(phase==='lifting'){
        const t=THREE.MathUtils.smoothstep(transition,0,.5);
        inspection.position.lerpVectors(startPosition,new THREE.Vector3(0,-.03,-1.15),t);
        inspection.quaternion.slerpQuaternions(startQuaternion,new THREE.Quaternion(),t);
        if(t===1)phase='held';
      }else if(phase==='returning'){
        sleeveHome();const t=THREE.MathUtils.smoothstep(transition,0,.6);
        inspection.position.lerpVectors(startPosition,homePosition,t);inspection.quaternion.slerpQuaternions(startQuaternion,homeQuaternion,t);inspection.scale.lerp(new THREE.Vector3(1,1,1),t);
        if(t===1)finishReturn();
      }else{
        inspection.position.lerp(new THREE.Vector3(deckRequested?-.53:0,deckRequested?.07:-.03,deckRequested?-1.4:-1.15),.12);
        inspection.scale.setScalar(THREE.MathUtils.lerp(inspection.scale.x,deckRequested?.72:1,.12));
        inspection.rotation.y=THREE.MathUtils.lerp(inspection.rotation.y,rotation,.18);
      }
    }
    host.dataset.vinylSpinning=String(deckState.spinning);host.dataset.vinylAngle=String(deckState.angle);
    host.dataset.recordState=phase;host.dataset.deckState=deckRequested?(deckState.settled?'playing-position':'loading-record'):'stowed';
    if(exitComplete){exitTime+=delta;const t=THREE.MathUtils.smoothstep(exitTime,0,1.4);for(const mat of roomMaterials)mat.color.setScalar(THREE.MathUtils.lerp(exitBrightness,.08,t));host.dataset.lights='dimming';}
    else if(lightsReady){lightsTime+=delta;const t=reducedMotion?1:THREE.MathUtils.smoothstep(lightsTime,.35,2.8);for(const mat of roomMaterials)mat.color.setScalar(.08+.92*t);host.dataset.lights=t===1?'on':'warming';}
    if(time-lastScreen>1000/(quality==='low'?15:30)){drawScreen();lastScreen=time;}
    renderer.info.reset();renderStore(renderer,scene,camera);
    if(exitComplete&&exitTime>=1.4){const complete=exitComplete;exitComplete=null;complete();return;}
    host.dataset.drawCalls=String(renderer.info.render.calls);host.dataset.triangles=String(renderer.info.render.triangles);
  };drawScreen();frame=requestAnimationFrame(animate);
  return {exit:(complete)=>{if(exitComplete)return;if(reducedMotion||!lightsReady){complete();return;}release();keys.clear();drag=false;returnRecord();exitBrightness=roomMaterials.values().next().value?.color.r??1;exitTime=0;exitComplete=complete;},capture,freeLook:()=>canvas.focus(),inspect,play,flip:()=>{rotation+=Math.PI;if(inspection){inspection.rotation.y=rotation;renderStore(renderer,scene,camera);}},home:()=>{deck.close();finishReturn();camera.position.set(0,1.65,6.5);yaw=0;pitch=-.12;},dispose:()=>{
    disposed=true;Object.assign(visit,{x:camera.position.x,z:camera.position.z,yaw,pitch});cancelAnimationFrame(frame);release();observer.disconnect();
    canvas.removeEventListener('contextmenu',contextmenu);canvas.removeEventListener('webglcontextlost',contextlost);
    window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('mousemove',mousemove);window.removeEventListener('mousedown',mousedown);window.removeEventListener('mouseup',mouseup);window.removeEventListener('blur',blur);
    document.removeEventListener('pointerlockchange',pointerchange);document.removeEventListener('pointerlockerror',pointererror);
    deck.dispose();for(const resource of resources)resource.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove();
  }};
}
