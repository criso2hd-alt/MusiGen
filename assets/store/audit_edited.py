import bpy, json
from pathlib import Path
out=Path(__file__).parent
report={'objects':[], 'images':[]}
for o in bpy.context.scene.objects:
 if o.type!='MESH':continue
 o.data.calc_loop_triangles()
 report['objects'].append({'name':o.name,'triangles':len(o.data.loop_triangles),'hidden':o.hide_render,'uv':[u.name for u in o.data.uv_layers],'materials':[m.name if m else None for m in o.data.materials],'modifiers':[m.type for m in o.modifiers]})
for i in bpy.data.images:
 report['images'].append({'name':i.name,'path':bpy.path.abspath(i.filepath),'packed':bool(i.packed_file),'size':list(i.size),'source':i.source})
(out/'edited-audit.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report),flush=True)
