import { CubeCamera, WebGLCubeRenderTarget, PMREMGenerator, Mesh, MeshStandardMaterial, PlaneGeometry, HalfFloatType, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';
import surfaces from './reflective-surfaces.json';

/** Local environment probes give rough surfaces a continuous, view-dependent sheen. */
export function createStoreReflections(renderer:WebGLRenderer,scene:Scene,camera:PerspectiveCamera,quality:'balanced'|'low') {
 const size=quality==='low'?128:256;
 const target=new WebGLCubeRenderTarget(size,{type:HalfFloatType});
 const probe=new CubeCamera(.08,40,target);probe.position.set(0,1.8,-1.2);scene.add(probe);
 const filter=new PMREMGenerator(renderer);
 let environment:ReturnType<PMREMGenerator['fromCubemap']>|null=null,lastUpdate=-Infinity;
 const panels=surfaces.map(surface=>{
  const xs=surface.positions.filter((_,i)=>i%3===0),zs=surface.positions.filter((_,i)=>i%3===2),floor=surface.positions[1]<1;
  const material=new MeshStandardMaterial({color:floor?0xb4bbc7:0x9fa9c1,metalness:1,roughness:Math.max(.26,surface.roughness),transparent:true,opacity:floor?.32:.42,depthWrite:false,envMapIntensity:1.2});
  const panel=new Mesh(new PlaneGeometry(Math.max(...xs)-Math.min(...xs),Math.max(...zs)-Math.min(...zs)),material);
  panel.position.set(0,surface.positions[1]+(floor?.006:-.006),0);panel.rotation.x=floor?-Math.PI/2:Math.PI/2;
  panel.name=`Environment reflection ${surface.name}`;panel.raycast=()=>{};scene.add(panel);return panel;
 });
 return {
  render(){
   const now=performance.now();
   if(now-lastUpdate>(quality==='low'?1500:750)){
    lastUpdate=now;
    panels.forEach(p=>p.visible=false);
    const autoClear=renderer.autoClear;
    try{
     renderer.autoClear=true;probe.update(renderer,scene);
     const next=filter.fromCubemap(target.texture);
     panels.forEach(p=>{p.material.envMap=next.texture;p.material.needsUpdate=environment===null;});
     environment?.dispose();environment=next;
    }finally{renderer.autoClear=autoClear;panels.forEach(p=>p.visible=true);}
   }
   renderer.render(scene,camera);
  },
  resize(_width:number,_height:number){},
  dispose(){panels.forEach(p=>{scene.remove(p);p.geometry.dispose();p.material.dispose();});scene.remove(probe);target.dispose();environment?.dispose();filter.dispose();},
 };
}
