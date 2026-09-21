import * as THREE from 'three';
import { foreground } from './foreground';
import { canvasTexture } from './textures';

/** A small listening deck, attached to the inspection camera and driven by the real player. */
export function createListeningDeck(camera: THREE.Camera) {
  const owned: Array<{dispose:()=>void}>=[];
  const own=<T extends {dispose:()=>void}>(v:T)=>{owned.push(v);return v;};
  const rig=new THREE.Group();camera.add(rig);rig.visible=false;rig.rotation.x=.28;
  const mat=(color:string,metalness=0)=>own(new THREE.MeshStandardMaterial({color,metalness,roughness:metalness?.28:.5}));
  const walnut=mat('#533124'),silver=mat('#b8c3ce',.6),black=mat('#14151b'),rubber=mat('#07080b'),gold=mat('#d5b777',.45);
  const cube=own(new THREE.BoxGeometry(1,1,1));
  const box=(parent:THREE.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,m:THREE.Material)=>{const o=new THREE.Mesh(cube,m);o.position.set(x,y,z);o.scale.set(w,h,d);parent.add(o);return o;};
  const cylinder=(parent:THREE.Object3D,r:number,h:number,m:THREE.Material,x=0,y=0,z=0)=>{const o=new THREE.Mesh(own(new THREE.CylinderGeometry(r,r,h,64)),m);o.position.set(x,y,z);parent.add(o);return o;};
  box(rig,0,-.04,0,1.12,.13,.82,walnut);box(rig,0,.031,0,1.08,.015,.78,silver);
  for(const x of [-.43,.43])for(const z of [-.29,.29])cylinder(rig,.065,.06,rubber,x,-.125,z);
  cylinder(rig,.352,.03,silver,-.13,.055,0);cylinder(rig,.341,.012,rubber,-.13,.075,0);
  box(rig,.4,.054,.29,.11,.025,.05,black);
  const led=own(new THREE.MeshBasicMaterial({color:'#43efca'}));box(rig,.46,.069,.29,.012,.005,.012,led);
  const record=new THREE.Group();camera.add(record);record.visible=false;
  const grooves=own(canvasTexture(512,512,c=>{
    c.fillStyle='#101117';c.fillRect(0,0,512,512);
    for(let r=82;r<250;r+=2){c.beginPath();c.arc(256,256,r,0,Math.PI*2);c.strokeStyle=r%6?'#272931':'#41434a';c.lineWidth=.6;c.stroke();}
    const sheen=c.createLinearGradient(0,0,512,512);sheen.addColorStop(0,'#ffffff00');sheen.addColorStop(.45,'#ffffff00');sheen.addColorStop(.5,'#ffffff25');sheen.addColorStop(.55,'#ffffff00');sheen.addColorStop(1,'#ffffff00');c.fillStyle=sheen;c.fillRect(0,0,512,512);
  }));
  cylinder(record,.327,.012,black);
  const face=new THREE.Mesh(own(new THREE.CircleGeometry(.327,96)),own(new THREE.MeshBasicMaterial({map:grooves,toneMapped:false})));face.rotation.x=-Math.PI/2;face.position.y=.007;record.add(face);
  const labelMat=own(new THREE.MeshBasicMaterial({color:'#efb3cc',toneMapped:false}));
  const label=new THREE.Mesh(own(new THREE.CircleGeometry(.103,48)),labelMat);label.rotation.x=-Math.PI/2;label.position.y=.009;record.add(label);
  cylinder(record,.009,.018,black,0,.012);cylinder(rig,.005,.04,silver,-.13,.092,0);
  const pivot=new THREE.Group();pivot.position.set(.38,.09,-.27);rig.add(pivot);
  cylinder(pivot,.048,.08,black);cylinder(pivot,.027,.09,silver);
  const arm=new THREE.Group();arm.position.y=.05;pivot.add(arm);
  box(arm,0,0,.18,.018,.018,.43,silver);box(arm,0,0,-.08,.07,.06,.07,black);box(arm,-.015,-.01,.397,.043,.024,.07,gold);
  foreground(rig);foreground(record);
  let requested=false,progress=0,spin=0,armAngle=0;
  const discStart=new THREE.Vector3(-.53,.07,-1.43),discClear=new THREE.Vector3(.08,.1,-1.4),platter=new THREE.Vector3();
  const upright=new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2,0,0));
  const spinRotation=new THREE.Quaternion(),axis=new THREE.Vector3(0,1,0);
  const smooth=(a:number,b:number,v:number)=>{const t=THREE.MathUtils.clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
  return {
    start(art:THREE.Texture|null){labelMat.map=art;labelMat.color.set(art?'#ffffff':'#efb3cc');labelMat.needsUpdate=true;requested=true;},
    close(){requested=false;},
    update(dt:number,playing:boolean){
      progress=THREE.MathUtils.clamp(progress+dt*(requested?1:-5),0,2.8);rig.visible=progress>0;
      const deck=smooth(0,.65,progress),lift=smooth(.35,1.15,progress),land=smooth(1.15,2,progress);
      rig.position.set(.12,THREE.MathUtils.lerp(-1.6,-.43,deck),-1.28);
      // Withdraw from behind the sleeve, then lower onto the arriving deck.
      platter.set(-.13,.09,0).applyQuaternion(rig.quaternion).add(rig.position);
      record.position.lerpVectors(discStart,discClear,lift).lerp(platter,land);
      record.scale.setScalar(THREE.MathUtils.lerp(.72,1,land));
      record.quaternion.slerpQuaternions(upright,rig.quaternion,land);
      record.visible=progress>.35;
      const engaged=requested&&playing&&progress>=2;
      armAngle=THREE.MathUtils.damp(armAngle,engaged?-.57:0,6,dt);pivot.rotation.y=armAngle;
      arm.rotation.x=THREE.MathUtils.damp(arm.rotation.x,engaged&&armAngle<-.5?0:-.13,7,dt);
      if(engaged)spin+=dt*Math.PI*2*(33+1/3)/60;
      spinRotation.setFromAxisAngle(axis,spin);record.quaternion.multiply(spinRotation);
      return {open:deck,settled:progress>=2.5,spinning:engaged,angle:spin};
    },
    dispose(){camera.remove(rig,record);owned.forEach(v=>v.dispose());},
  };
}
