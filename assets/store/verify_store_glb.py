"""Check exported geometry, UVs and sampled island overlap directly in the GLB."""
import json, struct
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parents[2]
raw=(root/'frontend/public/store/neon-boutique.glb').read_bytes()
length=struct.unpack_from('<I',raw,12)[0]
g=json.loads(raw[20:20+length]);binary=raw[28+length:]
def accessor(index):
 a=g['accessors'][index];v=g['bufferViews'][a['bufferView']]
 types={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}
 dim={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
 dtype=np.dtype(types[a['componentType']]);offset=v.get('byteOffset',0)+a.get('byteOffset',0)
 return np.ndarray((a['count'],dim),dtype=dtype,buffer=binary,offset=offset,strides=(v.get('byteStride',dim*dtype.itemsize),dtype.itemsize))
primitives=[p for m in g['meshes'] for p in m['primitives']]
report={'primitives':len(primitives),'materials':len(g['materials']),'triangles':0,'uv_out_of_bounds':0,'uv_degenerate_triangles':0,'sampled_overlap_pixels':0}
for p in primitives:
 uv=accessor(p['attributes']['TEXCOORD_0']);indices=accessor(p['indices']).reshape(-1,3)
 tris=uv[indices].astype(np.float64);report['triangles']+=len(tris)
 assert np.isfinite(uv).all()
 report['uv_out_of_bounds']+=int(((uv<-.00001)|(uv>1.00001)).any(axis=1).sum())
 a=tris[:,1]-tris[:,0];b=tris[:,2]-tris[:,0];area=a[:,0]*b[:,1]-a[:,1]*b[:,0]
 report['uv_degenerate_triangles']+=int((np.abs(area)<1e-12).sum())
 occupied=np.zeros((1024,1024),dtype=np.uint16)
 for tri in tris:
  t=tri*1024;lo=np.maximum(0,np.floor(t.min(axis=0)).astype(int));hi=np.minimum(1023,np.ceil(t.max(axis=0)).astype(int))
  if (hi<lo).any():continue
  yy,xx=np.mgrid[lo[1]:hi[1]+1,lo[0]:hi[0]+1];xx=xx+.5;yy=yy+.5
  edges=[]
  for k in range(3):
   start=t[k];end=t[(k+1)%3];edges.append((end[0]-start[0])*(yy-start[1])-(end[1]-start[1])*(xx-start[0]))
  inside=(np.minimum.reduce(edges)>1e-6)|(np.maximum.reduce(edges)<-1e-6)
  occupied[lo[1]:hi[1]+1,lo[0]:hi[0]+1]+=inside
 report['sampled_overlap_pixels']+=int((occupied>1).sum())
assert report['uv_out_of_bounds']==report['uv_degenerate_triangles']==report['sampled_overlap_pixels']==0,report
(root/'assets/store/optimized-export-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
