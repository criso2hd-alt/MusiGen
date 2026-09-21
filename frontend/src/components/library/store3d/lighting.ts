import { Color, Material, MeshBasicMaterial, MeshStandardMaterial } from 'three';

/** Blender may export a bake as an emissive PBR material or as unlit base color. */
export function roomLightFader() {
  const materials=new Map<Material,{color:Color; emission:number}>();
  let brightness=1;
  return {
    add(material:Material){
      if(!(material instanceof MeshBasicMaterial || material instanceof MeshStandardMaterial))return;
      if(!materials.has(material))materials.set(material,{color:material.color.clone(),emission:material instanceof MeshStandardMaterial?material.emissiveIntensity:0});
    },
    set(value:number){
      brightness=value;
      for(const [material,base] of materials){
        (material as MeshBasicMaterial).color.copy(base.color).multiplyScalar(value);
        if(material instanceof MeshStandardMaterial)material.emissiveIntensity=base.emission*value;
      }
    },
    get brightness(){return brightness;},
  };
}
