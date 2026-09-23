import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useStore } from '../../../store';
import { usePreferences } from '../../../lib/preferences';
import { api } from '../../../lib/api';
import type { Job, SystemStatus, Track } from '../../../lib/types';
import { playbackTracks } from '../../../lib/playbackQueue';
import { generationBlock, RECORDS_PER_ROOM } from './layout';
import { createStoreScene, type StoreControls, type StoreTarget, type Visit } from './scene';
import './store.css';

function Room({tracks, label, quality, visit, onExit, exitRef}: {tracks:Track[]; label:string; quality:'balanced'|'low'; visit:Visit; onExit:()=>void; exitRef:RefObject<(()=>void)|null>}) {
  const lighting=usePreferences();
  const host=useRef<HTMLDivElement>(null), controls=useRef<StoreControls|null>(null);
  const [ready,setReady]=useState(false), [browsed,setBrowsed]=useState(false);
  const [target,setTarget]=useState<StoreTarget|null>(null), [inspection,setInspection]=useState<Track|null>(null), [captured,setCaptured]=useState(false), [error,setError]=useState(''), [freeLook,setFreeLook]=useState(false);
  useEffect(()=>{
    if(!host.current)return;
    setReady(false);
    try { controls.current=createStoreScene(host.current,tracks,visit,quality,{
      target:setTarget,inspection:setInspection,capture:(locked)=>{setCaptured(locked);if(locked)setBrowsed(true);},ready:setReady,error:setError,
      playing:(id)=>{const state=useStore.getState();return state.current?.id===id&&state.isPlaying;},
      play:(track)=>{setError('');void useStore.getState().playTrack(track).catch((e)=>setError(`Could not play: ${String(e)}`));},
      toggle:(track)=>{const state=useStore.getState();if(state.current?.id===track.id)state.togglePlay();else void state.playTrack(track).catch(e=>setError(String(e)));},
      visualizer:()=>useStore.getState().setPlayerExpanded(true),
    }); } catch(e){setError(`The 3D store could not start: ${String(e)}. Use Compact or Full view on this device.`);}
    exitRef.current=()=>{if(controls.current)controls.current.exit(onExit);else onExit();};
    return ()=>{exitRef.current=null;controls.current?.dispose();controls.current=null;};
  },[tracks,label,quality,visit,onExit,exitRef]);
  return <div className="vinyl-room">
    <div ref={host} className="vinyl-canvas" />
    <div className="vinyl-room-top">
      <div><span className="vinyl-kicker">MUSIGEN RECORDS / EST. 1987</span><strong>{label}</strong></div>
      <div className="vinyl-actions"><label><input type="checkbox" checked={lighting.musicLighting} onChange={e=>lighting.update({musicLighting:e.target.checked})}/> Music lighting</label>{lighting.musicLighting&&<input aria-label="Music lighting intensity" title="Music lighting intensity" type="range" min="0" max="1" step="0.05" value={lighting.musicLightIntensity} onChange={e=>lighting.update({musicLightIntensity:Number(e.target.value)})} style={{width:80}}/>}{ready && !captured && <button onClick={()=>controls.current?.capture()}>Enable mouse capture</button>}<button onClick={()=>controls.current?.home()}>Return to entrance</button><button onClick={()=>exitRef.current?.()}>Exit store</button></div>
    </div>
    <div className={`vinyl-reticle ${(target && captured && !inspection)?'is-actionable':''}`} aria-hidden="true"><span /></div>
    {target && !inspection && <div className="vinyl-target" role="status"><strong>{target.title}</strong><span>{target.track?'Left click / F — inspect · Right click / Space — play':'Left click / F — open visualizer'}</span></div>}
    {inspection && <div className="vinyl-inspect-info"><span className="vinyl-kicker">NOW IN YOUR HANDS</span><strong>{inspection.title}</strong><p>{Math.floor(inspection.duration/60)}:{Math.floor(inspection.duration%60).toString().padStart(2,'0')} · Seed {inspection.seed}</p><p>Drag or move the mouse to rotate. Space / right-click: play or pause. F / click: return record. Esc: release mouse.</p><div className="vinyl-actions"><button onClick={()=>controls.current?.flip()}>Flip sleeve</button><button onClick={()=>controls.current?.play()}>Play / pause</button><button onClick={()=>controls.current?.inspect()}>Return record</button></div></div>}
    {ready && !browsed && !captured && !inspection && !error && !freeLook && <div className="vinyl-entry"><span className="vinyl-kicker">TAKE YOUR TIME. FIND YOUR SOUND.</span><h2>Stay for one more track.</h2><p>Wander the aisles. Every sleeve is a song from your collection.</p><div className="vinyl-entry-actions"><button onClick={()=>controls.current?.capture()}>Enter / capture mouse</button><button onClick={()=>{setBrowsed(true);setFreeLook(true);controls.current?.freeLook();}}>Browse without capture</button></div><small>WASD to walk · Mouse to look · Shift toggles capture · Esc releases</small></div>}
    {ready && <div className="vinyl-help">{inspection?'Click / F returns sleeve · Right click / Space: play / pause':'WASD walk · Mouse look · Left click / F inspect · Right click / Space play'}<span>{freeLook && !captured?"Drag to look · ":""}Shift — {captured?'release':'capture'} mouse · Esc — release</span></div>}
    {error && <div role="alert" className="vinyl-error">{error}<button onClick={()=>setError('')}>Dismiss</button></div>}
  </div>;
}

export default function RecordStore() {
  const tracks=useStore(s=>s.tracks), playlists=useStore(s=>s.playlists), selected=useStore(s=>s.activePlaylist), liveJobs=useStore(s=>s.jobs), expanded=useStore(s=>s.playerExpanded);
  const update=usePreferences(s=>s.update);
  const exitRef=useRef<(()=>void)|null>(null);
  const [entered,setEntered]=useState(false),[quality,setQuality]=useState<'balanced'|'low'>('balanced'),[page,setPage]=useState(0);
  const [snapshot,setSnapshot]=useState<{system:SystemStatus; jobs:Job[]; checked:number}|null>(null),[connectionError,setConnectionError]=useState('');
  const [visit]=useState<Visit>(()=>({x:0,z:6.5,yaw:0,pitch:-.12}));
  useEffect(()=>{
    let disposed=false;let timer:ReturnType<typeof setTimeout>;let deadline:ReturnType<typeof setTimeout>;
    const poll=async()=>{try{const [system,jobs]=await Promise.race([Promise.all([api.system(),api.jobs()]),new Promise<never>((_,reject)=>{deadline=setTimeout(()=>reject(new Error("Status timeout")),8000);})]);if(!disposed){setSnapshot({system,jobs,checked:Date.now()});setConnectionError('');}}catch{if(!disposed)setConnectionError('Cannot check generation status. The 3D store is resting until the connection returns.');}clearTimeout(deadline);if(!disposed)timer=setTimeout(poll,2000);};
    void poll();return()=>{disposed=true;clearTimeout(timer);clearTimeout(deadline);};
  },[]);
  const collection=useMemo(()=>playbackTracks(tracks,playlists,selected),[tracks,playlists,selected]);
  const count=Math.max(1,Math.ceil(collection.length/RECORDS_PER_ROOM)), safePage=Math.min(page,count-1);
  const visible=useMemo(()=>collection.slice(safePage*RECORDS_PER_ROOM,(safePage+1)*RECORDS_PER_ROOM),[collection,safePage]);
  const label=playlists.find(p=>p.id===selected)?.name || (selected?'Playlist unavailable':'The collection');
  // Socket updates stop rendering immediately; the fresh HTTP snapshot also covers reconnects.
  const latestJobs=snapshot?.jobs.map(job=>liveJobs[job.id]?.updated_at>job.updated_at?liveJobs[job.id]:job)||[];
  const block=connectionError || (!snapshot?'Checking generation status…':generationBlock(latestJobs,snapshot.system)) || generationBlock(Object.values(liveJobs).filter(j=>!snapshot?.jobs.some(s=>s.id===j.id)),null);
  const exit=useCallback(()=>{setEntered(false);update({libraryView:'compact'});},[update]);
  return <section className="vinyl-store" aria-label="3D record store">
    <div className="vinyl-toolbar"><div><span className="vinyl-kicker">THE NEON BOUTIQUE</span><strong>{label} <small>{collection.length} records</small></strong></div><div className="vinyl-actions">
      <select aria-label="Store playlist" value={selected||''} onChange={e=>{useStore.getState().setActivePlaylist(e.target.value||null);setPage(0);}}><option value="">All Tracks</option>{playlists.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <label>Graphics <select aria-label="Store graphics quality" value={quality} onChange={e=>setQuality(e.target.value as 'balanced'|'low')}><option value="balanced">Balanced · 45 FPS</option><option value="low">Low · 30 FPS</option></select></label>
      {count>1&&<><button disabled={!safePage} onClick={()=>setPage(safePage-1)}>Previous crates</button><span>{safePage+1} / {count}</span><button disabled={safePage>=count-1} onClick={()=>setPage(safePage+1)}>Next crates</button></>}
      <button onClick={()=>exitRef.current?exitRef.current():exit()}>Back to library</button>
    </div></div>
    {entered&&!block&&!expanded ? <Room key={`${selected}:${safePage}:${quality}`} tracks={visible} label={label} quality={quality} visit={visit} onExit={exit} exitRef={exitRef} /> : <div className="vinyl-lobby">
      <div className="vinyl-lobby-copy"><span className="vinyl-kicker">YOUR OWN AFTER-HOURS RECORD SHOP</span><h1>Find your<br/><em>frequency.</em></h1><p>Neon light. Walnut crates. Your collection, sleeve by sleeve.</p>
        {block?<div role="status" className="vinyl-notice"><strong>{entered?'The store is taking a break.':'The store will open when the GPU is free.'}</strong><p>{block}</p><p>3D graphics share the GPU with AI generation. The room stays unloaded to keep generation responsive. Music playback remains available.</p></div>:expanded?<p>Store rendering is paused while the full-screen visualizer is open.</p>:<><button className="vinyl-enter" onClick={()=>setEntered(true)}>Step inside the store</button></>}
      </div><div className="vinyl-lobby-art" aria-hidden="true"><div className="vinyl-neon-sign">MUSIGEN</div><div className="vinyl-lobby-disc" /><span>33⅓ RPM / OPEN LATE</span></div>
    </div>}
  </section>;
}
