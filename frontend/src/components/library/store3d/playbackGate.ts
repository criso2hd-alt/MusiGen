/** A cancelled or abandoned landing must never start audio later. */
export function createPlaybackGate<T>(play:(track:T)=>void){
 let pending:T|null=null;
 return {
  request(track:T){pending=track;},
  cancel(){pending=null;},
  get waiting(){return pending!==null;},
  update(settled:boolean){if(settled&&pending!==null){const track=pending;pending=null;play(track);}},
 };
}
