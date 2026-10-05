export class NativeLifecycle {
  constructor({suspend,reconcile,failure=()=>{}}){this.suspend=suspend;this.reconcile=reconcile;this.failure=failure;this.active=true;this.generation=0;this.inflight=null;this.pending=false;}
  state(active){if(typeof active!=='boolean'||active===this.active)return this.inflight;this.active=active;this.generation++;if(!active){try{this.suspend();}catch{this.failure();}return;}return this.resume();}
  resume(){if(!this.active)return;if(this.inflight){this.pending=true;return this.inflight;}const generation=this.generation;this.inflight=Promise.resolve().then(()=>this.reconcile({current:()=>this.active&&this.generation===generation})).catch(()=>this.failure()).finally(()=>{this.inflight=null;if(this.pending){this.pending=false;this.resume();}});return this.inflight;}
}
