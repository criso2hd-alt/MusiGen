import {useState} from 'react';
import {Star} from 'lucide-react';
import {api} from '../../lib/api';
import {useStore} from '../../store';
import type {Track} from '../../lib/types';
export function TrackRating({track}:{track:Track}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const rate=async(rating:number)=>{setBusy(true);setError('');try{const updated=await api.rateTrack(track.id,rating);useStore.setState(s=>({tracks:s.tracks.map(t=>t.id===updated.id?updated:t),current:s.current?.id===updated.id?updated:s.current}));}catch(e){setError(String(e));}finally{setBusy(false);}};
 return <div className="my-2"><div role="group" aria-label={`Rating for ${track.title}`} className="flex gap-1 items-center">
 {[1,2,3,4,5].map(n=><button key={n} disabled={busy} aria-label={`${n} star${n===1?'':'s'}`} aria-pressed={(track.rating??0)===n} title={`Rate ${n} of 5`} onClick={()=>void rate(n)} className="p-1 rounded hover:bg-white/10 text-amber-300"><Star size={17} fill={n<=(track.rating??0)?'currentColor':'none'}/></button>)}
 {!!track.rating&&<button disabled={busy} onClick={()=>void rate(0)} className="text-xs ml-1 text-white/60" aria-label="Clear rating">Clear</button>}</div>{error&&<p role="alert" className="text-xs text-amber-300">{error}</p>}</div>;
}
