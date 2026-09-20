"""Build MusiGen's authored Blender room. Coordinates follow the app: x right, y up, z toward entrance.
Run Blender --background --python assets/store/build_store.py -- [--bake]
"""
import bpy, math, random, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/store'; PUBLIC=ROOT/'frontend/public/store'
OUT.mkdir(parents=True,exist_ok=True);PUBLIC.mkdir(parents=True,exist_ok=True)
random.seed(87)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.threads_mode='FIXED';scene.render.threads=8
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
    for dev in prefs.devices: dev.use=dev.type=='OPTIX'
    if any(d.type=='OPTIX' for d in prefs.devices):scene.cycles.device='GPU'
except Exception:pass
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.07,.085,.12,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.3
scene.view_settings.view_transform='AgX'
static=[];glowing=[]
def p(x,y,z):return (x,-z,y)
def mat(name,color,rough=.5,metal=0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
    return m
wood=mat('Quarter-sawn walnut',(.17,.065,.032),.34)
n=wood.node_tree.nodes;l=wood.node_tree.links;tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=3;tex.inputs['Detail'].default_value=3
coord=n.new('ShaderNodeTexCoord');mapping=n.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(2,2,48);l.new(coord.outputs['Generated'],mapping.inputs[0]);l.new(mapping.outputs[0],tex.inputs['Vector'])
ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.2;ramp.color_ramp.elements[0].color=(.035,.013,.007,1);ramp.color_ramp.elements[1].position=.8;ramp.color_ramp.elements[1].color=(.26,.105,.035,1);l.new(tex.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs[0],n['Principled BSDF'].inputs['Base Color'])
black=mat('Soft black lacquer',(.014,.018,.025),.26);felt=mat('Black felt',(.008,.011,.017),.9);brass=mat('Brushed champagne metal',(.48,.33,.18),.3,.7);chrome=mat('Polished aluminum',(.5,.56,.61),.22,.82);wall=mat('Charcoal plaster',(.038,.031,.05),.86);cream=mat('Warm ivory',(.71,.63,.47),.56);rubber=mat('Speaker rubber',(.007,.009,.013),.62)
floor=mat('Dark terrazzo',(.03,.035,.045),.42,.08)
fn=floor.node_tree.nodes;fl=floor.node_tree.links;noise=fn.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=300;noise.inputs['Detail'].default_value=2
r=fn.new('ShaderNodeValToRGB');r.color_ramp.elements[0].position=.49;r.color_ramp.elements[0].color=(.019,.023,.03,1);r.color_ramp.elements[1].position=.72;r.color_ramp.elements[1].color=(.052,.057,.065,1);fl.new(noise.outputs['Fac'],r.inputs[0]);fl.new(r.outputs[0],fn['Principled BSDF'].inputs['Base Color'])
def emit(name,color,strength=3):
    m=mat(name,color);bs=m.node_tree.nodes['Principled BSDF'];bs.inputs['Emission Color'].default_value=(*color,1);bs.inputs['Emission Strength'].default_value=strength;return m
pink=emit('Rose neon',(.95,.025,.3),4);cyan=emit('Ice neon',(.015,.7,1),4);warm=emit('Warm lamps',(1,.55,.2),5)
def finish(o,name,m,glow=False):
    o.name=name;o.data.materials.append(m);(glowing if glow else static).append(o);return o

def box(name,x,y,z,w,h,d,m,bevel=.015,glow=False):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p(x,y,z));o=bpy.context.object;o.dimensions=(w,d,h);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Crafted edges','BEVEL');mod.width=bevel;mod.segments=3
        bpy.ops.object.modifier_apply(modifier=mod.name)
        for face in o.data.polygons:face.use_smooth=True
        mod=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(o,name,m,glow)
def cyl(name,x,y,z,r,depth,m,axis='y',verts=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=depth,location=p(x,y,z));o=bpy.context.object
    if axis=='z':o.rotation_euler.x=math.pi/2
    if axis=='x':o.rotation_euler.y=math.pi/2
    for f in o.data.polygons:f.use_smooth=True
    return finish(o,name,m)
def tube(name,points,r,m,glow=False):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.bevel_depth=r;curve.bevel_resolution=2;curve.resolution_u=8
    spline=curve.splines.new('POLY');spline.points.add(len(points)-1)
    for v,point in zip(spline.points,points):v.co=(*p(*point),1)
    o=bpy.data.objects.new(name,curve);scene.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o=bpy.context.object;return finish(o,name,m,glow)
def text(name,string,x,y,z,size,m,glow=False):
    curve=bpy.data.curves.new(name,'FONT');curve.body=string;curve.align_x='CENTER';curve.align_y='CENTER';curve.size=size;curve.extrude=.003;curve.bevel_depth=.001;curve.bevel_resolution=1
    o=bpy.data.objects.new(name,curve);scene.collection.objects.link(o);o.location=p(x,y,z);o.rotation_euler=(math.pi/2,0,0);o.data.materials.append(m)
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');(glowing if glow else static).append(o);return o
def area(name,x,y,z,target,power,color,size):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.color=color;data.shape='DISK';data.size=size
    o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=p(x,y,z);o.rotation_euler=(Vector(p(*target))-o.location).to_track_quat('-Z','Y').to_euler()
# Architectural shell and framed panels.
box('Terrazzo floor',0,-.1,0,13,.2,19,floor,.02)
box('Acoustic ceiling',0,3.82,0,13,.18,19,black)
box('Rear wall',0,1.9,-9.4,13,3.8,.18,wall)
box('Front wall',0,1.9,9.4,13,3.8,.18,wall)
for side in [-1,1]:
    box('Side wall',side*6.5,1.9,0,.18,3.8,19,wall)
    box('Walnut wainscot',side*6.36,.53,0,.09,1.06,18.7,wood)
    box('Brass dado rail',side*6.28,1.1,0,.035,.025,18.7,brass,.008)
    for z in [-7,-2,3,8]:
        box('Neon mounting channel',side*6.26,2.4,z,.07,2.75,.1,black)
        tube('Wall neon',[(side*6.2,1.12,z),(side*6.2,3.75,z),(side*4.9,3.75,z)],.013,pink if side<0 else cyan,True)
        area('Neon spill',side*5.8,2.65,z,(side*6.4,2.2,z),65,(1,.045,.3) if side<0 else (.04,.6,1),1.5)
    for z in [-6,-1,4]:
        box('Ceiling track',side*2.6,3.65,z,.06,.05,2.8,black)
        for off in [-.65,.65]:
            cyl('Track spotlight',side*2.6,3.52,z+off,.09,.23,black)
            cyl('Spot lens',side*2.6,3.395,z+off,.074,.015,warm)
            area('Warm display light',side*2.6,3.39,z+off,(side*3.3,.6,z),180,(1,.72,.45),.65)
# Counter with slatted fascia, kick recess and inset desktop.
box('Counter body',0,.56,-7.35,7.6,1.08,1.3,wood,.04)
box('Counter plinth',0,.12,-7.35,7.35,.24,1.08,black)
box('Counter top',0,1.16,-7.35,7.94,.13,1.5,black,.045)
for i in range(65):box('Counter fluted slat',-3.68+i*.115,.64,-6.68,.05,.83,.06,wood,.014)
box('Counter brass edge',0,1.2,-6.6,7.8,.025,.025,brass,.005)
tube('Counter edge neon',[(-3.7,1.08,-6.65),(3.7,1.08,-6.65)],.009,cyan,True)
box('Feature wall',0,2.38,-9.24,9.8,2.65,.12,wood)
text('Store neon name','M U S I G E N',0,3.12,-9.12,.61,pink,True)
text('Neon motto','F I N D   Y O U R   F R E Q U E N C Y',0,2.64,-9.1,.155,cyan,True)
area('Rear rose wash',0,3.1,-8.8,(0,2.8,-9.4),170,(1,.03,.28),4)
box('Visualizer frame',0,1.95,-9.04,5.9,1.4,.1,brass)
box('Visualizer black recess',0,1.95,-8.98,5.72,1.23,.025,felt,.005)
# Cash register with keypad and fluorescent price display.
box('Register base',2.05,1.35,-7.07,.65,.25,.49,cream,.045)
box('Register keypad deck',2.05,1.5,-6.99,.58,.07,.28,black)
for a in range(6):
    for b in range(4):box('Register key',1.84+a*.075,1.545,-6.9-b*.06,.049,.018,.035,cream,.004)
box('Register display',2.05,1.65,-7.22,.52,.2,.1,black)
text('Register price','33.33',2.05,1.65,-7.155,.11,cyan,True)
# Loudspeakers with recessed concentric drivers.
for x in [-3.2,3.2]:
    box('Walnut loudspeaker',x,1.76,-7.7,.66,1.05,.52,wood,.035)
    box('Speaker baffle',x,1.76,-7.423,.6,.98,.035,felt,.01)
    for y,r in [(1.57,.22),(2.0,.105)]:
        cyl('Driver outer rim',x,y,-7.395,r,.026,chrome,'z');cyl('Driver rubber surround',x,y,-7.37,r*.9,.035,rubber,'z');cyl('Driver cone',x,y,-7.347,r*.69,.025,black,'z');cyl('Dust cap',x,y,-7.325,r*.3,.028,rubber,'z')
# Record bins: open wells, tiered shelves, chamfered lips, vertical dividers and lower cubbies.
for row,z in enumerate([3.4,-.6,-4.6]):
    for side in [-1,1]:
        x=side*3.3
        box('Bin plinth',x,.1,z,3.2,.18,1.16,black)
        box('Bin lower carcass',x,.36,z,3.4,.48,1.35,wood,.025)
        box('Bin front recessed panel',x,.36,z+.685,3.2,.29,.025,black,.006)
        box('Bin brass inlay',x,.53,z+.705,3.25,.018,.012,brass,.003)
        for cx in [x-1.05,x,x+1.05]:
            box('Record well felt',cx,.74,z+.2,.97,.045,.6,felt,.008)
            box('Raised rear well',cx,.92,z-.41,.97,.07,.6,wood,.01)
            box('Rear well felt',cx,.96,z-.41,.94,.02,.57,felt,.005)
        for dx in [-1.68,-.525,.525,1.68]:
            box('Bin divider',x+dx,.93,z,.045,.57,1.36,wood,.012)
            box('Divider trim',x+dx,1.22,z,.045,.025,1.34,brass,.005)
        box('Front browsing lip',x,.87,z+.68,3.4,.23,.065,wood,.025)
        box('Front finger rail',x,1.0,z+.715,3.4,.02,.018,brass,.004)
        box('Rear retaining wall',x,1.13,z-.68,3.4,.3,.055,wood,.015)
        # lower door handles and feet
        for dx in [-1.15,0,1.15]:
            box('Storage door',x+dx,.32,z+.701,1.07,.28,.03,wood,.01)
            tube('Door handle',[(x+dx-.13,.37,z+.74),(x+dx+.13,.37,z+.74)],.008,brass)
# Listening credenzas and turntables.
for side in [-1,1]:
    x=side*5.87
    box('Listening cabinet',x,.49,-1,.82,.98,12,wood)
    box('Listening stone top',x,1.02,-1,.97,.09,12,black,.025)
    for z in [4,1,-2,-5]:
        for off in [-.31,.31]:cyl('Turntable isolation foot',x+off,1.1,z,.04,.08,rubber)
        box('Turntable plinth',x,1.18,z,.75,.12,.74,wood,.026)
        box('Turntable brushed top',x,1.25,z,.71,.023,.7,chrome,.015)
        cyl('Platter',x-.045,1.285,z,.272,.034,chrome,verts=48)
        cyl('Vinyl record',x-.045,1.309,z,.251,.009,black,verts=64)
        cyl('Record paper label',x-.045,1.317,z,.068,.003,cream)
        cyl('Spindle',x-.045,1.329,z,.008,.025,chrome)
        tube('Tonearm',[(x+.26,1.34,z-.24),(x+.26,1.34,z+.1),(x+.1,1.34,z+.22)],.012,chrome)
        box('Tonearm cartridge',x+.09,1.31,z+.23,.05,.044,.04,black,.006)
        cyl('Start button',x-.28,1.28,z+.27,.026,.014,pink)
        # headphone stand, bent band and padded ears
        tube('Headphone stand',[(x,1.1,z-.43),(x,1.65,z-.43)],.012,chrome)
        pts=[(x+math.cos(t)*.14,1.63+math.sin(t)*.18,z-.43) for t in [i*math.pi/16 for i in range(17)]]
        tube('Headphone headband',pts,.022,black)
        for dx in [-.14,.14]:box('Headphone ear cushion',x+dx,1.59,z-.43,.07,.14,.11,rubber,.025)
# Floor runner and entrance threshold.
box('Entrance brass threshold',0,.014,8.7,4,.016,.1,brass,.005)
# Framed geometric wall posters with sculpted relief shapes.
postercols=[mat('Poster magenta',(.52,.08,.24),.85),mat('Poster cyan',(.04,.36,.46),.8),mat('Poster ochre',(.61,.3,.09),.8)]
for side in [-1,1]:
    for i,z in enumerate([5,0,-5]):
        # local poster assembled facing front then rotated as a whole to side wall
        before=set(bpy.data.objects)
        box('Poster frame',0,0,0,1.7,2.15,.07,brass,.012);box('Poster mount',0,0,.046,1.63,2.08,.018,black,.004)
        cyl('Graphic sun',0,.3,.065,.5,.012,postercols[i],'z',64)
        for j in range(7):box('Sun stripe',0,.18-j*.07,.083,1.07,.028,.009,black,.001)
        for j in range(5):tube('Graphic mountain',[(-.7,-.45-j*.045,.085),(-.25,.02-j*.07,.085),(.15,-.3-j*.04,.085),(.5,.11-j*.07,.085),(.73,-.49-j*.04,.085)],.004,postercols[i])
        text('Poster title',['AFTER HOURS','ANALOG SOUL','SIDE A / SIDE B'][i],0,-.79,.08,.116,cream)
        objs=set(bpy.data.objects)-before
        from mathutils import Matrix
        angle=math.pi/2 if side<0 else -math.pi/2
        rot=Matrix.Rotation(angle,4,'Z')
        for o in objs:o.matrix_world=Matrix.Translation(Vector(p(side*6.35,2.48,z))) @ rot @ o.matrix_world
# Camera; a first person view matching the app, with a slightly downward gaze.
bpy.ops.object.camera_add(location=p(.15,1.75,7.2));camera=bpy.context.object;camera.name='Entrance render camera';camera.rotation_euler=(Vector(p(0,1.6,-3))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=22;scene.camera=camera
# Broad warm fill softens contrast while retaining pools of neon.
area('Entrance fill',0,3.4,6,(0,1,0),400,(.65,.73,1),4)
area('Counter task light',0,3.5,-6.3,(0,.6,-7),320,(1,.69,.38),3)
# Editable source first, before any destructive joining/baking.
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'neon-boutique.blend'))
scene.render.filepath=str(OUT/'neon-boutique-preview.png');bpy.ops.render.render(write_still=True)
print('PREVIEW_READY',flush=True)
if '--bake' in sys.argv:
    # Join static architecture once, unwrap an atlas, and bake lighting/materials.
    # The texture replaces expensive runtime lights/shadows and preserves the authored look.
    bpy.ops.object.select_all(action='DESELECT')
    for o in static:o.select_set(True)
    bpy.context.view_layer.objects.active=static[0];bpy.ops.object.join();room=bpy.context.object;room.name='Baked boutique architecture'
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.002);bpy.ops.object.mode_set(mode='OBJECT')
    image=bpy.data.images.new('Boutique lighting atlas',width=4096,height=4096,alpha=False)
    for m in room.data.materials:
        if not m:continue
        node=m.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;m.node_tree.nodes.active=node
    scene.cycles.samples=24;scene.render.bake.margin=8
    bpy.ops.object.bake(type='COMBINED',pass_filter={'DIRECT','INDIRECT','DIFFUSE','GLOSSY','TRANSMISSION','EMIT'})
    image.filepath_raw=str(OUT/'boutique-lighting.png');image.file_format='PNG';image.save()
    baked=bpy.data.materials.new('Baked lighting • unlit');baked.use_nodes=True;nodes=baked.node_tree.nodes;nodes.clear()
    tex=nodes.new('ShaderNodeTexImage');tex.image=image;emission=nodes.new('ShaderNodeEmission');output=nodes.new('ShaderNodeOutputMaterial');baked.node_tree.links.new(tex.outputs['Color'],emission.inputs[0]);baked.node_tree.links.new(emission.outputs[0],output.inputs['Surface'])
    room.data.materials.clear();room.data.materials.append(baked)
    for face in room.data.polygons:face.material_index=0
    bpy.ops.object.select_all(action='DESELECT');room.select_set(True)
    for o in glowing:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(PUBLIC/'neon-boutique.glb'),export_format='GLB',use_selection=True,export_lights=False,export_cameras=False,export_apply=True)
    print('EXPORT_READY',PUBLIC/'neon-boutique.glb',flush=True)
