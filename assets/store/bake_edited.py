"""Bake the opened, user-edited scene without saving over its .blend source.
Blender --background assets/store/neon-boutique.blend --python assets/store/bake_edited.py
"""
import bpy, math, json, hashlib, sys
from pathlib import Path
root=Path(__file__).resolve().parents[2]
out=root/'assets/store'
scene=bpy.context.scene
source=Path(bpy.data.filepath)
source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
meshes=[o for o in scene.objects if o.type=='MESH' and not o.hide_render]
report={'source_sha256':source_hash,'source_triangles':0,'objects':len(meshes),'missing_images':[]}
for image in bpy.data.images:
 if image.source=='FILE' and not image.packed_file and not Path(bpy.path.abspath(image.filepath)).exists():report['missing_images'].append(image.filepath)
assert not report['missing_images'],report['missing_images']
# Pin existing implicit UV texture coordinates before a new bake UV becomes active.
for o in meshes:
 o.data.calc_loop_triangles();report['source_triangles']+=len(o.data.loop_triangles)
 if not o.data.uv_layers:o.data.uv_layers.new(name='UVMap')
 original=o.data.uv_layers.active.name
 # Preserve Generated coordinates, which otherwise change when meshes are joined.
 lo=[min(v.co[i] for v in o.data.vertices) for i in range(3)]
 hi=[max(v.co[i] for v in o.data.vertices) for i in range(3)]
 attr=o.data.attributes.new(name='OriginalGenerated',type='FLOAT_VECTOR',domain='POINT')
 for v,value in zip(o.data.vertices,attr.data):value.vector=tuple((v.co[i]-lo[i])/(hi[i]-lo[i]) if hi[i]>lo[i] else 0 for i in range(3))
 for mat in o.data.materials:
  if not mat or not mat.use_nodes:continue
  nodes=mat.node_tree.nodes;links=mat.node_tree.links
  for node in list(nodes):
   if node.type in {'TEX_NOISE','TEX_VORONOI','TEX_WAVE','TEX_MUSGRAVE','TEX_GRADIENT','TEX_CHECKER'} and not node.inputs['Vector'].is_linked:
    attribute=nodes.new('ShaderNodeAttribute');attribute.attribute_name='OriginalGenerated';links.new(attribute.outputs['Vector'],node.inputs['Vector'])
   if node.type=='TEX_IMAGE' and not node.inputs['Vector'].is_linked:
    uv=nodes.new('ShaderNodeUVMap');uv.uv_map=original;links.new(uv.outputs['UV'],node.inputs['Vector'])
   elif node.type=='TEX_COORD':
    for link in list(node.outputs['Generated'].links):
     attribute=nodes.new('ShaderNodeAttribute');attribute.attribute_name='OriginalGenerated';links.new(attribute.outputs['Vector'],link.to_socket)
    for link in list(node.outputs['UV'].links):
     uv=nodes.new('ShaderNodeUVMap');uv.uv_map=original;links.new(uv.outputs['UV'],link.to_socket)
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.threads_mode='FIXED';scene.render.threads=8
try:
 prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
 for device in prefs.devices:device.use=device.type=='OPTIX'
 if any(d.type=='OPTIX' for d in prefs.devices):scene.cycles.device='GPU'
except Exception:pass
if '--uv-only' not in sys.argv:
 scene.render.filepath=str(out/'optimized-source-preview.png');bpy.ops.render.render(write_still=True)
print('SOURCE_PREVIEW_READY',flush=True)
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.hide_set(False);o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();room=bpy.context.object;room.name='Optimized baked boutique'
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
uv=room.data.uv_layers.new(name='Lightmap');room.data.uv_layers.active=uv;uv.active_render=True
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.001)
bpy.ops.object.mode_set(mode='OBJECT')
room.data.calc_loop_triangles()
uv=room.data.uv_layers['Lightmap']
coords=[tuple(item.uv) for item in uv.data]
report['export_triangles']=len(room.data.loop_triangles)
report['uv_out_of_bounds']=sum(not(-.00001<=u<=1.00001 and -.00001<=v<=1.00001) for u,v in coords)
report['uv_degenerate_triangles']=0
for tri in room.data.loop_triangles:
 a,b,c=[coords[i] for i in tri.loops]
 if abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))<1e-12:report['uv_degenerate_triangles']+=1
report['zero_area_geometry']=sum(t.area<1e-12 for t in room.data.loop_triangles)
print('UV_AUDIT',json.dumps(report),flush=True)
assert not report['uv_out_of_bounds'],report
if '--uv-only' in sys.argv:
 (out/'optimized-uv-report.json').write_text(json.dumps(report,indent=2))
 raise SystemExit(0)
image=bpy.data.images.new('Optimized boutique lightmap',width=8192,height=8192,alpha=False)
for mat in room.data.materials:
 if not mat:continue
 node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;mat.node_tree.nodes.active=node
scene.cycles.samples=48;scene.render.bake.margin=4;scene.render.bake.use_selected_to_active=False
bpy.ops.object.bake(type='COMBINED',pass_filter={'DIRECT','INDIRECT','DIFFUSE','GLOSSY','TRANSMISSION','EMIT'})
image.filepath_raw=str(out/'boutique-lighting.png');image.file_format='PNG';image.save()
material=bpy.data.materials.new('Optimized baked lighting');material.use_nodes=True
nodes=material.node_tree.nodes;nodes.clear();links=material.node_tree.links
tex=nodes.new('ShaderNodeTexImage');tex.image=image
uvnode=nodes.new('ShaderNodeUVMap');uvnode.uv_map='Lightmap';links.new(uvnode.outputs['UV'],tex.inputs['Vector'])
emission=nodes.new('ShaderNodeEmission');output=nodes.new('ShaderNodeOutputMaterial')
links.new(tex.outputs['Color'],emission.inputs[0]);links.new(emission.outputs[0],output.inputs['Surface'])
room.data.materials.clear();room.data.materials.append(material)
for face in room.data.polygons:face.material_index=0
# Keep only the export UV after baking; source UVs remain untouched in the .blend.
for layer in list(room.data.uv_layers):
 if layer.name!='Lightmap':room.data.uv_layers.remove(layer)
scene.render.filepath=str(out/'optimized-baked-preview.png');bpy.ops.render.render(write_still=True)
bpy.ops.export_scene.gltf(filepath=str(root/'frontend/public/store/neon-boutique.glb'),export_format='GLB',use_selection=True,export_lights=False,export_cameras=False,export_apply=True)
assert hashlib.sha256(source.read_bytes()).hexdigest()==source_hash
(out/'optimized-bake-report.json').write_text(json.dumps(report,indent=2))
print('BAKE_EXPORT_COMPLETE',json.dumps(report),flush=True)
