// Strict projections, not redaction of arbitrary errors. Memory only; no transport.
const labels = {catalog:'Catalogus kon niet worden geladen.',journey:'Journey kon niet worden geladen.',playback:'Audio kon niet worden afgespeeld.'};
const prefixes = {catalog:'CAT',journey:'JRN',playback:'AUD'};
const errorId = value => typeof value === 'string' && /^MYM-(CAT|JRN|AUD)-[A-F0-9]{12}$/.test(value || '') ? value : null;
export function buildInfo(value = {}) {
  return {version:typeof value?.version === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value?.version || '') ? value.version : 'niet beschikbaar',
    build:typeof value?.build === 'string' && /^[a-f0-9]{7,40}$/i.test(value?.build || '') ? value.build.slice(0,12).toLowerCase() : 'niet beschikbaar'};
}
export function clientInfo(agent = '') {
  // Never expose raw UA/platform strings, extensions, device model or client hints.
  const ua = typeof agent === 'string' ? agent : '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\/|FxiOS\//.test(ua) ? 'Firefox' : /Chrome\/|CriOS\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Onbekend';
  const platform = /iPhone|iPad|iPod/.test(ua) ? 'iOS/iPadOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Macintosh|Mac OS/.test(ua) ? 'macOS/iPadOS' : /Linux/.test(ua) ? 'Linux' : 'Onbekend';
  return {browser,platform};
}
export class BetaOperations {
  constructor({uuid = () => globalThis.crypto.randomUUID()} = {}) { this.uuid=uuid; this.errors={}; }
  record(area) {
    if(!Object.hasOwn(labels,area))throw Error('Unknown error area');
    let suffix;try{suffix=this.uuid().replaceAll('-','').slice(0,12).toUpperCase()}catch{}
    // If secure randomness is unavailable, show the generic recovery message, not a fake ID.
    const code=errorId(`MYM-${prefixes[area]}-${suffix}`);
    this.errors[area]={code,message:labels[area]};return this.errors[area];
  }
  reset() { this.errors={}; }
  snapshot({info,agent,online,loggedIn,access} = {}) {
    const errors={};
    for(const area of Object.keys(labels)) {
      const item=this.errors[area];errors[area]=item?{code:errorId(item.code),message:labels[area]}:null;
    }
    return {schema_version:1,beta:true,...buildInfo(info),...clientInfo(agent),connection:online===true?'Online':'Offline',
      login:loggedIn===true?'Ingelogd':'Gast',premium:access?.state==='ready'&&['free','trial','premium'].includes(access.status)?{free:'Free',trial:'Trial',premium:'Premium'}[access.status]:'Niet beschikbaar',errors};
  }
}
export function diagnosticsView() {
 return `<section class="page-head"><span class="eyebrow">GESLOTEN BÈTA</span><h1>Veilige<br><em>diagnostiek.</em></h1><p>Een korte samenvatting om een probleem beter te beschrijven.</p></section><section class="library help-library"><a class="text-link" href="#/help">← Help & Feedback</a><section class="journey-panel"><h2>Jouw testsessie</h2><p>Alleen algemene browser- en appstatus. Geen e-mailadres, account-ID, token, audio-URL of foutdetails. Foutcodes zijn lokaal; er is nog geen koppeling met serverlogs.</p><p id="diagnostic-build-state" role="status"></p><button class="text-button" id="retry-diagnostic-build" hidden>Build opnieuw laden</button><pre id="diagnostic-summary" tabindex="0" aria-label="Veilige diagnostische samenvatting"></pre><div class="help-actions"><button class="secondary" id="copy-diagnostics">Samenvatting kopiëren</button><button class="text-button" id="clear-diagnostics">Lokale foutcodes wissen</button></div><p id="diagnostic-copy-status" role="status"></p><p>Deze status wordt niet opgeslagen of verstuurd. Kopiëren plaatst alleen deze samenvatting op je klembord. Controleer met wie je die deelt.</p></section><a class="text-link" href="#/settings">Terug naar Instellingen →</a></section>`;
}
