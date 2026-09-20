import os,sys,json,time
from pathlib import Path
root=Path(__file__).resolve().parents[1]
os.environ['MUSIGEN_HF_CACHE']=str(root/'installer/dist/models')
os.environ['MUSIGEN_DATA_DIR']=str(root/'data')
sys.path.insert(0,str(root/'backend'))
from app.engines.yue2_engine import YuE2Engine
from app.engines.base import EngineRequest
folder=root/'data/reference-diagnosis/gpu';folder.mkdir(exist_ok=True)
lyrics='[verse]\nMorning light is calling me\nThrough the trees and out to sea\nEvery road will lead me home\nNever have to walk alone\n[chorus]\nWe belong here together\nSinging through the changing weather\nHold the light and let it shine\nYour tomorrow next to mine'
engine=YuE2Engine();last=[None,0]
def progress(e):
 if e.stage!=last[0] or time.time()-last[1]>30:
  print(e.stage,e.message,flush=True);last[:]=[e.stage,time.time()]
try:
 for mode in sys.argv[1:] or ['sing','backing']:
  req=EngineRequest(style='warm folk pop, clear female singing voice, acoustic guitar',lyrics=lyrics,abc=(root/'data/reference-diagnosis/source.abc').read_text(),out_path=folder/(mode+'.flac'),cot='melody',max_duration=110,reference_mode=mode,checkpoint_dir=folder/mode,memory_mode='low')
  result=engine.generate(req,progress,lambda:False)
  (folder/(mode+'.json')).write_text(json.dumps(dict(duration=result.duration,meta=result.meta),indent=2))
  print(mode,result.duration,flush=True)
finally: engine.close()
