export const affirmationCategories = Object.freeze([
  {id:'calm',label:'Rust'}, {id:'confidence',label:'Vertrouwen'}, {id:'focus',label:'Focus'},
  {id:'self-worth',label:'Eigenwaarde'}, {id:'letting-go',label:'Loslaten'}, {id:'gratitude',label:'Dankbaarheid'}
]);

export const affirmations = Object.freeze([
  {id:'calm-01',category:'calm',goals:['stress','sleep'],text:'Ik hoef dit moment niet op te lossen. Ik mag er eerst in landen.'},
  {id:'calm-02',category:'calm',goals:['stress'],text:'Rust begint niet straks. Ik maak er nu een beetje ruimte voor.'},
  {id:'confidence-01',category:'confidence',goals:['confidence','growth'],text:'Ik vertrouw erop dat ik mijn volgende stap kan dragen.'},
  {id:'confidence-02',category:'confidence',goals:['confidence'],text:'Ik hoef niet perfect te zijn om stevig te staan.'},
  {id:'focus-01',category:'focus',goals:['focus','growth'],text:'Mijn aandacht mag vandaag naar één ding tegelijk.'},
  {id:'focus-02',category:'focus',goals:['focus'],text:'Ik kies bewust waar ik mijn energie aan geef.'},
  {id:'self-worth-01',category:'self-worth',goals:['confidence'],text:'Mijn waarde hoeft vandaag niet bewezen te worden.'},
  {id:'self-worth-02',category:'self-worth',goals:['confidence','stress'],text:'Ik mag vriendelijk met mezelf omgaan, ook als iets nog niet lukt.'},
  {id:'letting-go-01',category:'letting-go',goals:['stress','sleep'],text:'Ik laat los wat ik op dit moment niet hoef te dragen.'},
  {id:'letting-go-02',category:'letting-go',goals:['sleep'],text:'Deze dag mag eindigen zonder dat alles af hoeft te zijn.'},
  {id:'gratitude-01',category:'gratitude',goals:['growth'],text:'Ik merk op wat vandaag al goed en waardevol is.'},
  {id:'gratitude-02',category:'gratitude',goals:[],text:'Er is iets kleins in dit moment waarvoor ik dankbaar kan zijn.'}
]);

export function dailyAffirmation(items=affirmations,date=new Date(),goals=[]){
 const pool=goals.length?items.filter(a=>!a.goals.length||a.goals.some(g=>goals.includes(g))):items;
 const safe=pool.length?pool:items;if(!safe.length)return null;
 const day=Math.floor(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate())/86400000);
 return safe[((day%safe.length)+safe.length)%safe.length];
}
export function filterAffirmations(category='all',items=affirmations){return category==='all'?items:items.filter(a=>a.category===category);}
