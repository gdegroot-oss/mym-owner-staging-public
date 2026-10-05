// No offline replay: telemetry only earns bounded credit while the server is reachable.
export class ListeningSync {
  constructor(store, audio, { clock = () => performance.now(), uuid = () => crypto.randomUUID() } = {}) {
    this.store=store;this.audio=audio;this.clock=clock;this.uuid=uuid;this.reset();
    for(const type of ['seeking','seeked','waiting','pause','ended']) audio.addEventListener(type,()=>{
      if(type==='seeking'||type==='seeked') { this.measured=0;this.discontinuity=true; }
      else this.flush();
    });
  }
  reset(){this.generation=(this.generation||0)+1;this.session=null;this.starting=null;this.owner=null;this.med=null;this.measured=0;this.sequence=0;this.discontinuity=true;this.lastFlush=this.clock()-5000;this.inflight=false;this.failed=false;this.retryAt=0;}
  async sample(med,seconds) {
    const owner=this.store.session?.user.id;
    if(!owner)return;
    if(this.owner!==owner||this.med!==med.id)this.reset();
    this.owner=owner;this.med=med.id;
    if(!this.session) {
      if(this.starting||this.clock()<this.retryAt||this.clock()-this.lastFlush<5000)return;
      this.lastFlush=this.clock();const generation=this.generation;
      this.starting=this.store.listening('/api/listening/sessions',{meditation_id:med.id,position:this.audio.currentTime});
      try { const result=await this.starting;if(generation===this.generation&&this.store.session?.user.id===owner){this.session=result.id;this.sequence=0;this.discontinuity=false;this.measured=0;} }
      catch(error) {if(generation===this.generation){this.failed=true;this.retryAt=this.clock()+Math.max(5000,Math.min(60000,(error.retry_after||5)*1000));}} finally{if(generation===this.generation)this.starting=null;}
      return;
    }
    this.measured+=seconds;
    if(this.clock()-this.lastFlush>=5000)this.flush();
  }
  async flush(){
    if(!this.session||this.inflight||this.store.session?.user.id!==this.owner)return;
    const generation=this.generation,owner=this.owner;
    const body={sequence:++this.sequence,position:this.audio.currentTime,seconds:Math.min(15,this.measured),reset:this.discontinuity};
    this.measured=0;this.discontinuity=false;this.lastFlush=this.clock();this.inflight=true;
    try {await this.store.listening(`/api/listening/sessions/${this.session}/pulse`,body);if(generation===this.generation)this.failed=false;this.retryAt=0;}
    catch(error) {if(generation===this.generation){this.retryAt=this.clock()+Math.max(5000,Math.min(60000,(error.retry_after||5)*1000));this.failed=true;this.session=null;this.measured=0;this.discontinuity=true;}}
    finally{if(generation===this.generation&&this.store.session?.user.id===owner)this.inflight=false;}
  }
}
