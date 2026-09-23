"""Read reflective floor/ceiling faces and finish values without saving the source."""
import bpy, json, hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[2]
source=Path(bpy.data.filepath); before=hashlib.sha256(source.read_bytes()).hexdigest()
surfaces=[]
for name in ['Terrazzo floor','Acoustic ceiling.001']:
 obj=bpy.data.objects[name];obj.data.calc_loop_triangles()
 face=max(obj.data.polygons,key=lambda p:p.area)
 material=obj.data.materials[face.material_index]
 shader=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 vertices=[]
 for tri in obj.data.loop_triangles:
  if tri.polygon_index!=face.index:continue
  for index in tri.vertices:
   v=obj.matrix_world@obj.data.vertices[index].co
   vertices.extend([v.x,v.z,-v.y])
 surfaces.append({'name':name,'roughness':shader.inputs['Roughness'].default_value,'positions':vertices})
(root/'frontend/src/components/library/store3d/reflective-surfaces.json').write_text(json.dumps(surfaces,indent=2)+'\n')
assert hashlib.sha256(source.read_bytes()).hexdigest()==before
print('REFLECTIVE_SURFACES',[(s['name'],s['roughness']) for s in surfaces])
