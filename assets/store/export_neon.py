"""Export only neon faces from the opened source, without altering the .blend."""
import bpy, bmesh
from pathlib import Path
root=Path(__file__).resolve().parents[2]
selected=[]
for original in list(bpy.context.scene.objects):
 if original.type!='MESH' or original.hide_render:continue
 keep={i for i,m in enumerate(original.data.materials) if m and m.name in {'Rose neon','Ice neon','redLight'}}
 if not keep:continue
 obj=original.copy();obj.data=original.data.copy();bpy.context.collection.objects.link(obj)
 bm=bmesh.new();bm.from_mesh(obj.data)
 bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.material_index not in keep],context='FACES')
 bm.to_mesh(obj.data);bm.free()
 if len(obj.data.polygons):selected.append(obj)
bpy.ops.object.select_all(action='DESELECT')
for obj in selected:obj.hide_set(False);obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(root/'frontend/public/store/neon-fixtures.glb'),export_format='GLB',use_selection=True,export_lights=False,export_cameras=False,export_apply=True)
