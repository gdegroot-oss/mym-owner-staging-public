// Served ONLY by tools/visual-review.mjs in place of /data.js. Never imported by production.
const allowed = document.querySelector('meta[name="mym-owner-staging"]')?.content === 'synthetic-v1' && (location.protocol === 'https:' || (location.protocol === 'http:' && ['127.0.0.1','localhost'].includes(location.hostname)));
if (!allowed) throw Error('Synthetic staging unavailable.');
const scenario = new URLSearchParams(location.search).get('review') || 'populated';
if (!['populated','empty','error','guest'].includes(scenario)) throw Error('Unknown review scenario.');
const rows = [
  ['review-morning','synthetic-morning','Een rustige ochtend — synthetische review','Morning',false],
  ['review-focus','synthetic-focus','Ruimte voor aandacht, ook op de dagen waarop je gedachten blijven bewegen','Focus',false],
  ['review-sleep','synthetic-sleep','Avondrust — Premium weergave, audio geblokkeerd','Sleep',true],
].map(([id,slug,title,category,is_premium])=>({id,slug,title,category,is_premium,description:'Synthetische visuele fixture. Geen gepubliceerde meditatie of echte stem. De player gebruikt uitsluitend stilte.',duration_seconds:60,artwork_url:null,master_audio_url:is_premium?null:'/__owner/silence.wav',featured:true,published_at:'2026-01-15T12:00:00Z'}));
const owner = {id:'owner-staging-synthetic',email:'review@example.invalid',user_metadata:{mym_onboarding:{complete:true,goals:['morning','focus']},mym_preferences:{notifications:false,marketing_email:false}}};
export function latestProgress(rows) {return Object.fromEntries(rows.map(row=>[row.meditation_id,row]));}
export class CatalogStore {
  constructor() {
    this.boundary=1;this.session=scenario==='guest'?null:{user:structuredClone(owner)};
    this.favorites=new Set(scenario==='empty'?[]:['review-morning']);this.name='Synthetisch reviewprofiel';
  }
  syncSession(){return false;} syncIfChanged(){} clearSession(){this.session=null;this.boundary++;}
  async user(){return this.session?.user || null;}
  async catalog(){if(scenario==='error')throw Error('Synthetische foutstate.');return scenario==='empty'?[]:structuredClone(rows);}
  async discovery(){return {catalog:await this.catalog(),collections:scenario==='empty'?[]:[{slug:'synthetic-ritual',title:'Kleine rituelen — review',description:'Synthetische collectie voor visuele beoordeling.',meditation_ids:rows.map(row=>row.id)}],coming_soon:[]};}
  async entitlement(){return {user_id:this.session?.user.id || null,status:'free',expires_at:null};}
  async playback(){throw Object.assign(Error('Premium blijft geblokkeerd in deze synthetische review.'),{status:403,code:'premium_required'});}
  async personal(){return {favorites:new Set(this.favorites),progress:{}};}
  async profile(){return this.session?{id:owner.id,display_name:this.name}:null;}
  async favorite(id,enabled){if(!rows.some(row=>row.id===id))throw Error('Unknown fixture');enabled?this.favorites.add(id):this.favorites.delete(id);}
  async saveProgress(){} // Actual player retains its local resume position; no network write.
  async updateProfile(name){this.name=name.trim().slice(0,80);return this.profile();}
  async updatePreferences(value){this.session.user.user_metadata.mym_preferences={notifications:value.notifications===true,marketing_email:value.marketing_email===true};}
  async onboarding(goals){this.session.user.user_metadata.mym_onboarding={complete:true,goals};}
  async updateEngagement(value){this.session.user.user_metadata.mym_engagement=value;return this.user();}
  async listening(path) {
    if(!path.startsWith('/api/journey'))throw Error('Review sends no listening telemetry.');
    return {seconds:0,completed:0,current_streak:0,longest_streak:0,week_days:0,month_days:0,days:{},recent:[],milestones:[],favorite_categories:[]};
  }
  async auth(){throw Error('Echte accounts zijn niet beschikbaar in Owner Staging.');}
  async signup(){throw Error('Echte accounts zijn niet beschikbaar in Owner Staging.');}
  async deleteAccount(){throw Error('Accountverwijdering is niet beschikbaar in Owner Staging.');}
  async logout(){this.clearSession();}
}
