import { NativeLifecycle } from './native-runtime.js';
import { openAccountDeletion } from './account-deletion.js';
import { BetaOperations, diagnosticsView, buildInfo } from './beta-operations.js';
import { helpView, settingsView, feedbackAdapter } from './beta-feedback.js';
import { ListeningSync } from './listening.js';
import { progressView, accountPrivacyView } from './journey-view.js';
import { validZone } from './progress-model.js';
import { libraryFilter, recentlyAdded, featured, personalLibrary } from './library.js';
import { engagementFor, notificationProvider } from './engagement.js';
import { goals, validGoals, journeyFor, needsOnboarding, recommendations, accessLabel } from './journey.js';
import { CatalogStore } from './data.js';
import { MeditationPlayer, formatTime } from './player.js';
import { affirmations, affirmationCategories, dailyAffirmation, filterAffirmations } from './affirmations.js';
import { communityEpisodes, podcastCategories, visibleEpisodes, validateQuestion } from './community-sessions.js';
import { categories, filterCatalog, artworkFor, mergeProgress, progressSummary, preferencesFor } from './experience.js';

const $ = selector => document.querySelector(selector);
const store = new CatalogStore();
const audio = $('#audio');
const operations = new BetaOperations();
let feedbackContext = null, operationBoundary, appInfo = null, buildState = 'loading', buildRequest;
const diagnosticSnapshot = () => operations.snapshot({info:appInfo,agent:navigator.userAgent,online:navigator.onLine,loggedIn:!!store.session,access});
function refreshDiagnostics() {
  const summary = $('#diagnostic-summary');
  if (summary) summary.textContent = JSON.stringify(diagnosticSnapshot(), null, 2);
}
function errorCode(area) {
  const {code} = operations.record(area); refreshDiagnostics();
  return code ? ` Foutcode: ${code}.` : '';
}
async function loadBuildInfo(retry = false) {
  if (!retry && buildState === 'ready') return;
  if (buildRequest) return buildRequest;
  buildState = 'loading';
  buildRequest = (async () => {
    try {
      const response = await fetch('/api/app-info', {cache:'no-store',signal:AbortSignal.timeout(10000)});
      if (!response.ok) throw Error();
      appInfo = buildInfo(await response.json());
      if (appInfo.version === 'niet beschikbaar') throw Error();
      buildState = 'ready';
    } catch { appInfo = null; buildState = 'error'; }
    finally { buildRequest = null; }
  })();
  return buildRequest;
}
let catalog = [], personal = { favorites: new Set(), progress: {} }, profile = null;
let personalStatus = store.session ? 'loading' : 'guest', profileStatus = personalStatus;
let routeVersion = 0, noticeTimer, local = {}, sessions = [], activeSession = null, currentScope;
let search = '', category = 'all', libraryFilters = { access: 'all', duration: 'all', goal: 'all' }, favoriteSort = 'catalog';
let discoveryStatus = 'loading', discoveryData = { collections: [], coming_soon: [] };
let guestJourney; try { guestJourney = JSON.parse(localStorage.getItem('mym.onboarding.guest')); } catch {}
let selectedGoals = journeyFor(store.session?.user, guestJourney).goals;
let onboardingActive = false, onboardingBusy = false;
let access = { state: 'loading', status: 'free' }, playbackExpiry = null, playbackBusy = false;
const currentJourney = () => journeyFor(store.session?.user, guestJourney);
async function refreshAccess() {
  const owner = scope(), boundary = store.boundary; access = { state: 'loading', status: 'free' };
  if (!store.session) { access = { state: 'ready', status: 'free' }; return; }
  try {
    const result = await store.entitlement();
    if (scope() !== owner || store.boundary !== boundary || result.user_id !== owner) return;
    access = { ...result, state: 'ready' };
  } catch { if (scope() === owner && store.boundary === boundary) access = { state: 'error', status: 'free' }; }
}
async function finishJourney() {
  if (onboardingBusy) return;
  onboardingBusy = true;
  const button = $('[data-goals-next]') || $('[data-finish-journey]'), label = button?.textContent;
  if (button) { button.disabled = true; button.textContent = 'Je doelen worden bewaard…'; }
  try {
    if (store.session) await store.onboarding(selectedGoals);
    else { guestJourney = { complete: true, goals: validGoals(selectedGoals) }; localStorage.setItem('mym.onboarding.guest', JSON.stringify(guestJourney)); }
    onboardingActive = false; if (route() === '/') await render(); else location.hash = '/';
  } catch (error) { notify(error.message); }
  finally { onboardingBusy = false; if (button) { button.disabled = false; button.textContent = label; } }
}
async function togglePlayback() {
  if (!audio.paused || !player.meditation?.is_premium) return player.toggle();
  if (playbackBusy) return;
  playbackBusy = true;
  const med = player.meditation, owner = scope(), boundary = store.boundary;
  try {
    const result = await store.playback(med.id);
    if (scope() !== owner || store.boundary !== boundary || player.meditation?.id !== med.id) return;
    const position = audio.currentTime;
    if (player.meditation.master_audio_url !== result.master_audio_url) {
      await player.persist();
      if (scope() !== owner || store.boundary !== boundary) return;
      player.meditation = null;
      await player.load({ ...med, master_audio_url: result.master_audio_url }, { position_seconds: position });
    }
    if (scope() !== owner || store.boundary !== boundary || player.meditation?.id !== med.id) { if (player.meditation?.id === med.id) clearPlayer(); return; }
    playbackExpiry = result.expires_at;
    await player.toggle();
  } catch (error) { if (store.session && (scope() !== owner || store.boundary !== boundary)) return; audio.pause(); clearPlayer(); await refreshAccess(); await render(); notify(error.message + errorCode('playback')); }
  finally { playbackBusy = false; }
}

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const route = () => location.hash.slice(1) || '/';
const scope = () => store.session?.user.id || 'guest';
const localKey = () => `mym.progress.${currentScope}`;
const sessionsKey = () => `mym.sessions.${currentScope}`;
function readLocal() {
  if (operationBoundary !== store.boundary) {
    operations.reset(); feedbackContext = null; $('#feedback-form')?.reset();
    access = {state:store.session ? 'loading' : 'ready',status:'free'};
  }
  operationBoundary = store.boundary;
  currentScope = scope();
  try { local = JSON.parse(localStorage.getItem(localKey())) || {}; } catch { local = {}; }
  try { sessions = JSON.parse(localStorage.getItem(sessionsKey())) || []; } catch { sessions = []; }
  if (!Array.isArray(sessions)) sessions = [];
  if (!local || typeof local !== 'object' || Array.isArray(local)) local = {};
  activeSession = null; refreshDiagnostics();
}
readLocal();
const listeningSync = new ListeningSync(store,audio);
let serverJourney={state:'guest'}, journeyOwner=null;
let journeyZone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
function readJourneyZone(){
  try {const saved=localStorage.getItem(`mym.journey-zone.${scope()}`);journeyZone=validZone(saved)?saved:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';}catch{}
}
async function loadServerJourney(){
  const owner=scope(),boundary=store.boundary;journeyOwner=owner;readJourneyZone();
  if(!store.session){serverJourney={state:'guest'};return;}
  serverJourney={state:'loading'};
  try {const data=await store.listening(`/api/journey?timezone=${encodeURIComponent(journeyZone)}`);if(scope()===owner&&store.boundary===boundary)serverJourney={state:'ready',data};}
  catch {if(scope()===owner&&store.boundary===boundary){serverJourney={state:'error'};errorCode('journey');}}
}
function yourJourneyView(){
  const continuing=catalog.filter(m=>progressFor(m.id)?.position_seconds>0&&!progressFor(m.id)?.completed).map(card).join('');
  const state=store.session&&journeyOwner===scope()?serverJourney.state:store.session?'loading':'guest';
  return progressView({state,data:serverJourney.data,zone:journeyZone,continuing:continuing?`<div class="cards">${continuing}</div>`:''}) + (state === 'error' && operations.errors.journey?.code ? `<p class="operation-code">Foutcode: ${escape(operations.errors.journey.code)} · <a class="text-link" href="#/diagnostics">Veilige diagnostiek →</a></p>` : '');
}
function notify(message) {
  clearTimeout(noticeTimer); $('#notice').textContent = message; $('#notice').hidden = false;
  noticeTimer = setTimeout(() => { $('#notice').hidden = true; }, 7000);
}
function progressFor(id) { return mergeProgress(personal.progress, local)[id]; }
function saveLocal() {
  try {
    localStorage.setItem(localKey(), JSON.stringify(local));
    localStorage.setItem(sessionsKey(), JSON.stringify(sessions));
  } catch { notify('Je browser kan voortgang niet lokaal bewaren.'); }
}
const player = new MeditationPlayer(audio, {
  context: () => ({ owner: currentScope, boundary: store.boundary }),
  listen: (id, seconds) => {
    if (!activeSession || activeSession.meditation_id !== id) {
      activeSession = { meditation_id: id, started_at: new Date().toISOString(), listened_seconds: 0 };
      sessions.push(activeSession);
    }
    activeSession.listened_seconds += seconds;
    if(player.meditation)listeningSync.sample(player.meditation,seconds);
  },
  save: async (id, position, completed, context) => {
    if (context.owner !== scope() || context.owner !== currentScope || context.boundary !== store.boundary) return;
    local[id] = { position_seconds: Math.floor(position), completed, last_played_at: new Date().toISOString() };
    saveLocal();
    await store.saveProgress(id, position, completed, personal.progress[id]?.table);
  }, update: updatePlayer, error: message => {
    if (!store.session && currentScope !== 'guest') {
      clearPlayer(); personal = { favorites: new Set(), progress: {} }; profile = null;
      personalStatus = profileStatus = 'guest'; readLocal(); render();
      notify('Je sessie is verlopen. Log opnieuw in; je voortgang blijft lokaal bij je account bewaard.');
    } else notify(message + (['De audio kon niet laden. Probeer opnieuw.', 'Afspelen is niet gelukt. Tik op afspelen om opnieuw te proberen.'].includes(message) ? errorCode('playback') : ''));
  },
});



function timeLabel(seconds){return Math.floor(seconds/60)+' min';}
function communitySessionsView() {
  const episodes = visibleEpisodes();
  return `<section class="page-head"><span class="eyebrow">COMMUNITY SESSIONS</span><h1>Jouw vragen.<br><em>Een rustig gesprek.</em></h1><p>Wekelijkse gesprekken rond vragen uit de community. Geen perfecte antwoorden — wel aandacht, ervaring en een volgende stap.</p></section>
  <section class="library"><div class="section-heading"><h2>Community Sessions.</h2></div><p>Conceptvoorbeelden: er is nog geen podcastaudio beschikbaar.</p><div class="podcast-grid">${episodes.map(e => `<article class="podcast-card"><span class="eyebrow">${escape(podcastCategories.find(x => x.id === e.category)?.label || 'Community')}</span><h3>${escape(e.title)}</h3><p>${escape(e.summary)}</p><small>${timeLabel(e.duration_seconds)} · ${e.publication === 'preview' ? 'Conceptvoorbeeld' : 'Aflevering'}</small><h4>Hoofdstukken</h4><ol class="chapter-list" aria-label="Hoofdstukken van ${escape(e.title)}">${e.chapters.map(ch => `<li><span class="chapter-time"><span aria-hidden="true">${Math.floor(ch.seconds / 60)}:${String(ch.seconds % 60).padStart(2, '0')}</span><span class="sr-only">${Math.floor(ch.seconds / 60)} minuten en ${ch.seconds % 60} seconden</span></span><span>${escape(ch.title)}</span></li>`).join('')}</ol>${e.links.map(l => `<a class="text-link" href="${escape(l.href)}">${escape(l.label)} <span aria-hidden="true">↗</span></a>`).join('')}</article>`).join('') || '<p class="small-empty">Er zijn nog geen Community Sessions beschikbaar.</p>'}</div></section>
  <section class="library question-panel" aria-labelledby="question-title"><span class="eyebrow">VRAAG VOOR EEN VOLGENDE SESSIE</span><h2 id="question-title">Wat houdt jou bezig?</h2><p id="question-privacy">Je concept blijft alleen op dit apparaat. Het wordt niet ingestuurd of openbaar geplaatst. Op een gedeeld apparaat kunnen andere gebruikers dit concept terugvinden.</p>
  <form id="community-question" aria-describedby="question-privacy" autocomplete="off" novalidate>
  <label for="question-category">Onderwerp</label><select id="question-category" name="category" required><option value="">Kies een onderwerp</option>${podcastCategories.map(x => `<option value="${x.id}">${escape(x.label)}</option>`).join('')}</select>
  <label for="question-text">Jouw vraag</label><p id="question-text-help">20 tot 1200 tekens. Laat herkenbare privégegevens weg.</p><textarea id="question-text" name="text" minlength="20" maxlength="1200" required aria-describedby="question-text-help"></textarea>
  <label for="question-alias">Alias (optioneel)</label><p id="question-alias-help">Maximaal 40 tekens. Zonder alias blijft je vraag anoniem.</p><input id="question-alias" name="alias" maxlength="40" aria-describedby="question-alias-help">
  <label class="check" for="question-permission"><input id="question-permission" type="checkbox" name="permission" required><span>Mijn vraag mag anoniem of met bovenstaande alias in een Community Session worden behandeld.</span></label>
  <button class="primary" type="submit">Bewaar als privéconcept</button><p id="question-error" role="alert" aria-atomic="true"></p><p id="question-status" role="status" aria-atomic="true"></p></form></section>`;
}
function bindCommunityQuestion() {
  const form = $('#community-question');
  if (!form) return;
  const status = $('#question-status'), error = $('#question-error');
  const fields = [...form.querySelectorAll('input, select, textarea')];
  const clearErrors = () => {
    error.textContent = '';
    for (const field of fields) {
      field.removeAttribute('aria-invalid');
      const description = field.getAttribute('aria-describedby')?.replace(/(?:^| )question-error/g, '').trim();
      if (description) field.setAttribute('aria-describedby', description); else field.removeAttribute('aria-describedby');
    }
  };
  // Read only the private draft key; never pass its content to diagnostics or notices.
  try {
    const raw = localStorage.getItem('mym.community-question-draft');
    if (raw !== null) {
      const draft = JSON.parse(raw);
      if (!draft || typeof draft.text !== 'string' || (draft.alias !== null && typeof draft.alias !== 'string') || typeof draft.anonymous !== 'boolean') throw Error();
      const result = validateQuestion({ ...draft, permission: true });
      if (!result.ok || draft.anonymous !== result.value.anonymous) throw Error();
      form.elements.category.value = result.value.category;
      form.elements.text.value = result.value.text;
      form.elements.alias.value = result.value.alias || '';
      // Legacy drafts were saved only after explicit permission; do not infer it from text.
      form.elements.permission.checked = true;
      status.textContent = 'Je privéconcept is hersteld op dit apparaat. Het is nog niet ingestuurd.';
    }
  } catch {
    error.textContent = 'Het privéconcept kon niet worden hersteld. Je kunt opnieuw een concept bewaren.';
  }
  form.addEventListener('input', () => { clearErrors(); status.textContent = ''; });
  form.onsubmit = event => {
    event.preventDefault(); clearErrors(); status.textContent = '';
    const fd = new FormData(form);
    const result = validateQuestion({ category: fd.get('category'), text: fd.get('text'), alias: fd.get('alias'), permission: fd.get('permission') === 'on' });
    if (!result.ok) {
      const name = !podcastCategories.some(x => x.id === fd.get('category')) ? 'category' : String(fd.get('text') || '').trim().length < 20 || String(fd.get('text') || '').trim().length > 1200 ? 'text' : fd.get('permission') !== 'on' ? 'permission' : 'alias';
      const field = form.elements[name];
      error.textContent = result.error;
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', [field.getAttribute('aria-describedby'), 'question-error'].filter(Boolean).join(' '));
      field.focus();
      return;
    }
    try {
      localStorage.setItem('mym.community-question-draft', JSON.stringify({ ...result.value, saved_at: new Date().toISOString() }));
      status.textContent = 'Privéconcept bewaard op dit apparaat. Het is nog niet ingestuurd.';
    } catch {
      error.textContent = 'Dit apparaat kon het concept niet bewaren. Je tekst blijft in het formulier; probeer opnieuw voordat je deze pagina verlaat.';
    }
  };
}

function affirmationsView(){
  const chosen=currentJourney().goals;const today=dailyAffirmation(affirmations,new Date(),chosen);const active=new URLSearchParams(location.hash.split('?')[1]||'').get('category')||'all';const items=filterAffirmations(active);
  return `<section class="page-head"><span class="eyebrow">DAILY ALIGN</span><h1>Woorden die je<br><em>richting geven.</em></h1><p>Korte affirmaties voor een bewust moment. Geen prestatie, alleen aandacht.</p></section>
  ${today?`<section class="journey forest-panel"><div class="journey-content"><span class="eyebrow">VANDAAG VOOR JOU</span><span class="journey-mark" aria-hidden="true">✧</span><h2>“${escape(today.text)}”</h2><p>Lees rustig. Adem één keer diep in. Neem alleen mee wat vandaag bij je past.</p></div></section>`:''}
  <section class="library"><div class="section-heading"><div><span class="eyebrow">AFFIRMATIES</span><h2>Kies jouw richting.</h2></div></div><div class="filter-row" role="navigation" aria-label="Affirmatiecategorieën"><a class="filter ${active==='all'?'selected':''}" href="#/affirmations">Alles</a>${affirmationCategories.map(x=>`<a class="filter ${active===x.id?'selected':''}" href="#/affirmations?category=${x.id}">${escape(x.label)}</a>`).join('')}</div><div class="affirmation-grid">${items.map(a=>`<article class="affirmation-card"><span class="eyebrow">${escape(affirmationCategories.find(x=>x.id===a.category)?.label||'Affirmatie')}</span><p>“${escape(a.text)}”</p></article>`).join('')}</div></section>`;
}

function welcome() {
  return `<section class="journey forest-panel"><div class="journey-content"><span class="eyebrow">MASTER YOUR MEDITATIONS</span><span class="journey-mark" aria-hidden="true">✧</span><h1>Een moment.<br><em>Helemaal van jou.</em></h1><p>Maak ruimte voor rust, kracht en richting.<br>Jouw ritme begint hier.</p><a class="primary" href="#/goals">Vind jouw ritme ↗</a><span class="journey-footnote">Drie rustige stappen. Op jouw tempo.</span></div></section>`;
}
function goalsView() {
  return `<section class="journey forest-panel"><div class="journey-content"><span class="eyebrow">JOUW RITME · 02 / 03</span><h1>Waar wil je<br><em>ruimte voor maken?</em></h1><p>Kies wat bij je past. Je kunt dit later aanpassen.</p><div class="goal-grid">${goals.map(goal => `<button class="goal-option ${selectedGoals.includes(goal.id) ? 'selected' : ''}" data-goal="${goal.id}" aria-pressed="${selectedGoals.includes(goal.id)}"><span>${goal.label}</span><span aria-hidden="true">${selectedGoals.includes(goal.id) ? '✓' : '+'}</span></button>`).join('')}</div><p class="selection-status" role="status">${selectedGoals.length ? `${selectedGoals.length} doelen gekozen` : 'Je mag ook zonder doelen doorgaan.'}</p><button class="primary" data-goals-next>${onboardingActive ? 'Verder' : 'Doelen bewaren'} ↗</button><a class="text-link" href="${onboardingActive ? '#/welcome' : '#/profile'}">← Terug</a></div></section>`;
}
function onboardingAccount() {
  return `<section class="journey forest-panel"><div class="journey-content"><span class="eyebrow">JOUW RITME · 03 / 03</span><h1>Neem je rust<br><em>met je mee.</em></h1><p>Met je account blijven favorieten, doelen en voortgang bij je — ook op een ander apparaat.</p><button class="primary" data-login>Inloggen met je account ↗</button><button class="secondary" data-create-account>Nieuw account maken</button><button class="text-button" data-finish-journey>Later doorgaan →</button><p class="journey-footnote">Zonder account blijven je doelen op dit apparaat. Geen betaalgegevens nodig.</p><a class="text-link" href="#/goals">← Doelen aanpassen</a></div></section>`;
}
function personalizedHome() {
  const chosen = currentJourney().goals;
  if (!chosen.length) return '<section class="for-you-starter"><span class="eyebrow">FOR YOU</span><h2>Een richting die bij je past.</h2><p>Kies je doelen voor een selectie uit de beschikbare catalogus. Geen verborgen algoritme.</p><a class="secondary" data-edit-goals href="#/goals">Mijn doelen kiezen ↗</a></section>';
  const items = recommendations(catalog, chosen);
  return `<section class="personalized"><span class="eyebrow">RUIMTE VOOR JOU</span><div class="section-heading"><h2>For You · Past bij jouw doelen.</h2><a class="text-link" data-edit-goals href="#/goals">Doelen aanpassen ↗</a></div><p class="goal-summary">${chosen.map(id => escape(goals.find(goal => goal.id === id).label)).join(' · ')}</p>${items.length ? `<p>Transparant geselecteerd: jouw doelen + categorieën + beschikbare meditaties. Geen AI-voorspellingen.</p><div class="cards">${items.map(card).join('')}</div>` : '<div class="small-empty"><h3>Jouw doelen zijn bewaard.</h3><p>Er is nog geen beschikbare meditatie die aansluit. Ontdek hieronder de huidige catalogus.</p></div>'}</section>`;
}
function premiumGate(med, error) {
  const unavailable = error.status !== 403;
  return `<section class="journey forest-panel premium-gate"><div class="journey-content"><span class="eyebrow">${unavailable ? 'EVEN EEN MOMENT' : 'MASTER YOUR MEDITATIONS · PREMIUM'}</span><span class="journey-mark" aria-hidden="true">✧</span><h1>${unavailable ? 'Je toegang kon<br><em>niet worden bevestigd.</em>' : 'Meer ruimte.<br><em>Voor jezelf.</em>'}</h1><p>${unavailable ? 'Verbind met internet en probeer opnieuw. Premium-audio start alleen na een geslaagde servercontrole.' : `${escape(med.title)} hoort bij Premium. Bekijk de mogelijkheden om jouw ritme verder te verdiepen.`}</p>${unavailable ? `<button class="primary" data-retry-playback>Opnieuw controleren ↗</button>` : '<a class="primary" href="#/premium">Ontdek Premium ↗</a>'}${!store.session ? '<button class="secondary" data-login>Al Premium? Log in</button>' : ''}<a class="text-link" href="#/explore">← Ontdek alle meditaties</a><p class="journey-footnote">Je Free-meditaties blijven beschikbaar.</p></div></section>`;
}
function paywall() {
  return `<section class="paywall forest-panel"><div class="paywall-intro"><span class="eyebrow">MASTER YOUR MEDITATIONS · PREMIUM</span><h1>Verdiep je rust.<br><em>Op jouw ritme.</em></h1><p>Een rustige plek voor de momenten die jij nodig hebt.</p><ul class="premium-benefits"><li>Toegang tot beschikbare Premium-meditaties</li><li>Je eigen rituelen, favorieten en bewaarde voortgang</li><li>Een luisterervaring met cinematic forest-artwork</li></ul><p>Het aanbod groeit vanuit onze echte catalogus. Er zijn nog geen abonnementen te koop.</p><a class="text-link" href="#/explore">← Verder ontdekken</a></div><div class="plans-panel"><span class="eyebrow">KIES JE RITME</span><div class="plan-options" role="group" aria-label="Abonnementsperiode"><button class="plan-option selected" data-plan="monthly" aria-pressed="true"><span>Maandelijks</span><strong>Prijs volgt</strong><small>Maandabonnement · nog niet beschikbaar</small></button><button class="plan-option" data-plan="annual" aria-pressed="false"><span>Jaarlijks</span><strong>Prijs volgt</strong><small>Jaarabonnement · nog niet beschikbaar</small></button></div><div class="trial-note"><span aria-hidden="true">✧</span><p>Een eventuele gratis proefperiode wordt later bevestigd. Er start nu geen trial.</p></div><button class="primary" disabled>Abonnementen binnenkort beschikbaar</button><p role="status" id="plan-status">Er is nog geen betaalprovider gekoppeld. Je wordt niet gefactureerd.</p><button class="text-button" data-manage-subscription>Manage subscription</button><p class="journey-footnote">Geen checkout. Geen automatische verlenging. Voorwaarden volgen zodra het aanbod beschikbaar is.</p></div></section>`;
}
function subscriptionPanel() {
  const label = accessLabel(access);
  return `<section class="subscription-panel"><div><span class="eyebrow">JOUW ACCOUNT</span><h2>${escape(label)}</h2><p>${store.session ? 'Ingelogd met je account' : 'Je luistert als gast'}${access.state === 'ready' && access.expires_at ? ` · Geldig tot ${dateText(access.expires_at)}` : ''}${access.expired ? ' · Je eerdere toegang is verlopen.' : ''}</p>${access.state === 'error' ? '<button class="secondary" data-refresh-access>Accountstatus opnieuw laden</button>' : ''}</div><div class="subscription-actions"><a class="secondary" href="#/premium">Ontdek Premium ↗</a><button class="text-button" data-manage-subscription>Manage subscription</button><a class="text-link" data-edit-goals href="#/goals">Mijn doelen aanpassen ↗</a><a class="text-link" href="#/notifications">Notificaties & reminders ↗</a><a class="text-link" href="#/privacy">Privacy & accountinstellingen ↗</a></div></section>`;
}
function privacyView() {
  return `<section class="page-head"><span class="eyebrow">JOUW KEUZES</span><h1>Jouw rust.<br><em>Jouw gegevens.</em></h1></section><section class="library settings-panel privacy-panel"><h2>Privacy & accountinstellingen</h2><p>Je doelen worden als voorkeuren bewaard: bij je account als je ingelogd bent, anders op dit apparaat. Ze geven nooit Premium-toegang.</p><p>Favorieten en voortgang gebruiken de bestaande accountarchitectuur. Your Journey gebruikt nieuwe gemeten serveractiviteit wanneer registratie beschikbaar is. Je hervatpositie blijft apart bewaard.</p><a class="secondary" data-edit-goals href="#/goals">Doelen aanpassen</a><a class="secondary" href="#/profile">Notificaties & marketingvoorkeuren</a><button class="secondary" data-clear-guest>Lokale gastdoelen wissen</button><p>Dit wist geen luistervoortgang of accountgegevens.</p><h3>Gegevens exporteren of account verwijderen</h3><p>Export is nog niet beschikbaar. Voor definitieve accountverwijdering ga je naar accountbeheer.</p><a class="secondary" href="#/account-privacy">Account verwijderen</a><a class="text-link" href="#/profile">← Terug naar je profiel</a></section>`;
}
function bindJourney() {
  document.querySelectorAll('[data-goal]').forEach(button => button.onclick = () => {
    const id = button.dataset.goal; selectedGoals = selectedGoals.includes(id) ? selectedGoals.filter(goal => goal !== id) : [...selectedGoals, id];
    button.classList.toggle('selected', selectedGoals.includes(id)); button.setAttribute('aria-pressed', selectedGoals.includes(id)); button.lastElementChild.textContent = selectedGoals.includes(id) ? '✓' : '+';
    $('.selection-status').textContent = selectedGoals.length ? `${selectedGoals.length} doelen gekozen` : 'Je mag ook zonder doelen doorgaan.';
  });
  if ($('[data-goals-next]')) $('[data-goals-next]').onclick = () => onboardingActive ? location.hash = '/onboarding-account' : finishJourney();
  if ($('[data-finish-journey]')) $('[data-finish-journey]').onclick = finishJourney;
  if ($('[data-retry-playback]')) $('[data-retry-playback]').onclick = render;
  document.querySelectorAll('[data-plan]').forEach(button => button.onclick = () => {
    document.querySelectorAll('[data-plan]').forEach(plan => { const selected = plan === button; plan.classList.toggle('selected', selected); plan.setAttribute('aria-pressed', selected); });
    $('#plan-status').textContent = `${button.dataset.plan === 'annual' ? 'Jaarabonnement' : 'Maandabonnement'} geselecteerd. Nog niet beschikbaar; er wordt niets betaald.`;
  });
}

function discoveryState() {
  if (discoveryStatus === 'loading') return '<div class="small-empty" role="status"><p>Collecties en releases worden geladen…</p></div>';
  if (discoveryStatus === 'error') return '<div class="small-empty" role="status"><h3>Collecties en releases konden niet laden.</h3><p>Je beschikbare meditaties blijven hieronder zichtbaar.</p><button class="secondary" data-retry-discovery>Opnieuw proberen</button></div>';
  return '';
}
function collectionCard(collection) {
  const members = catalog.filter(med => collection.meditation_ids.includes(med.id));
  return `<article class="collection-card"><a href="#/collection/${encodeURIComponent(collection.slug)}"><img src="${escape(artworkFor(members[0]))}" alt="" loading="lazy"><div><span class="eyebrow">COLLECTION · ${members.length} ${members.length === 1 ? 'MEDITATIE' : 'MEDITATIES'}</span><h3>${escape(collection.title)}</h3><p>${escape(collection.description)}</p><span class="text-link">${members.length ? 'Ontdek de collectie ↗' : 'Bekijk deze rustige ruimte ↗'}</span></div></a></article>`;
}
function collectionsView() {
  return `<section class="page-head"><span class="eyebrow">RUIMTE VOOR JE RITME</span><h1>Kleine rituelen.<br><em>Die bij je passen.</em></h1><p>Ontdek je meditatie in thematische collecties.</p></section><section class="library collections-library"><div class="section-heading"><h2>Collections</h2><a class="text-link" href="#/explore">Meditation Library ↗</a></div>${discoveryState() || `<p class="panel-description">${discoveryData.collections_model === 'category' ? 'Deze collecties groeperen de beschikbare catalogus op categorie. Lege collecties bevatten nog geen gepubliceerde meditaties.' : 'Deze collecties brengen beschikbare meditaties samen rond een thema.'}</p><div class="collection-grid">${discoveryData.collections.map(collectionCard).join('') || '<div class="empty"><h3>Nog geen collecties gepubliceerd.</h3><a class="text-link" href="#/explore">Ontdek de catalogus →</a></div>'}</div>`}</section>`;
}
function collectionDetail(slug) {
  const collection = discoveryData.collections.find(row => encodeURIComponent(row.slug) === slug);
  if (discoveryStatus !== 'ready') return `<section class="library">${discoveryState()}</section>`;
  if (!collection) return '<section class="library"><h1>Collectie niet gevonden.</h1><p>Deze collectie is niet gepubliceerd.</p><a class="text-link" href="#/collections">Terug naar Collections →</a></section>';
  const members = catalog.filter(med => collection.meditation_ids.includes(med.id));
  return `<section class="collection-hero forest-panel"><a class="text-link" href="#/collections">← Collections</a><span class="eyebrow">EEN RITUEEL OP JOUW MANIER</span><h1>${escape(collection.title)}</h1><p>${escape(collection.description)}</p><span class="pill-inline">${members.length} ${members.length === 1 ? 'meditatie' : 'meditaties'} beschikbaar</span></section><section class="library collection-detail"><div class="section-heading"><h2>Jouw momenten in deze collectie</h2><a class="text-link" href="#/explore">Alles ontdekken ↗</a></div><div class="cards">${members.map(card).join('') || '<div class="empty"><h3>Hier groeit straks meer rust.</h3><p>Deze collectie bevat nog geen gepubliceerde meditatie. We noemen geen releasedatum zonder echte planning.</p><a class="primary" href="#/explore">Bekijk beschikbare meditaties ↗</a></div>'}</div></section>`;
}
function compactMeditations(items, label) {
  return `<div class="compact-list">${items.map(({meditation: med, progress}) => `<a class="compact-meditation" href="#/${progress && !progress.completed && progress.position_seconds > 0 ? 'player' : 'meditation'}/${encodeURIComponent(med.slug)}"><img src="${escape(artworkFor(med))}" alt="" loading="lazy"><div><h3>${escape(med.title)}</h3><p>${progress ? `${dateText(progress.last_played_at)} · ${progress.completed ? 'Voltooid' : `Positie ${formatTime(progress.position_seconds)}`}` : metadata(med)}</p></div><span class="pill-inline">${med.is_premium ? 'Premium' : 'Free'}</span><span class="round" aria-hidden="true">↗</span></a>`).join('') || `<div class="small-empty"><p>${label}</p></div>`}</div>`;
}
function discoveryHome() {
  const fresh = recentlyAdded(catalog), picks = featured(catalog), history = personalLibrary(catalog, mergeProgress(personal.progress, local), personal.favorites);
  return `<section class="home-discovery"><div class="section-heading"><div><span class="eyebrow">NIEUWE RUIMTE VOOR JEZELF</span><h2>New & Featured</h2></div></div><div class="discovery-columns"><div><h3>Featured</h3>${picks.length ? `<div class="compact-list">${compactMeditations(picks.map(meditation=>({meditation})), '')}</div>` : '<div class="small-empty"><p>Er zijn nog geen featured meditaties ingesteld.</p></div>'}</div><div><h3>Recently Added</h3>${fresh.length ? compactMeditations(fresh.map(meditation=>({meditation})), '') : '<div class="small-empty"><p>Nieuwe meditaties verschijnen hier zodra hun publicatiedatum bekend is.</p></div>'}</div></div><div class="section-heading"><h2>Collections</h2><a class="text-link" href="#/collections">Alle collecties ↗</a></div>${discoveryState() || `<div class="collection-grid home-collections">${discoveryData.collections.slice(0,3).map(collectionCard).join('') || '<p>Nog geen collecties gepubliceerd.</p>'}</div>`}<div class="section-heading"><h2>Coming Soon</h2><a class="text-link" href="#/notifications">Notificatievoorkeuren ↗</a></div>${discoveryStatus === 'ready' ? `<div class="coming-soon-grid">${discoveryData.coming_soon.map(item => `<article class="coming-soon-card"><img src="${escape(artworkFor(item))}" alt="" loading="lazy"><div><span class="eyebrow">GEPLAND · ${dateText(item.scheduled_at)}</span><h3>${escape(item.title)}</h3><p>${escape(item.description)}</p><span class="pill-inline">${escape(item.category)} · ${item.is_premium ? 'Premium' : 'Free'}</span><p class="coming-note">Nog niet beschikbaar om af te spelen.</p></div></article>`).join('') || '<div class="small-empty"><p>Er zijn nog geen releases aangekondigd. Zodra er echte planning is, verschijnt die hier.</p></div>'}</div>` : '<p class="panel-description">Releaseplanning is momenteel niet beschikbaar.</p>'}<div class="section-heading"><h2>Continue Listening</h2><a class="text-link" href="#/profile">Je ritme ↗</a></div>${store.session && personalStatus !== 'ready' ? personalState() : compactMeditations(history.continuing,'Na het starten van een meditatie kun je hier verder luisteren.')}<div class="section-heading"><h2>Recently Played</h2><a class="text-link" href="#/profile">Je voortgang ↗</a></div><p class="panel-description">Het laatste bewaarde luistermoment per beschikbare meditatie.</p>${store.session && personalStatus !== 'ready' ? personalState() : compactMeditations(history.recent,'Je eerste luistermoment verschijnt hier na het afspelen.')}<div class="section-heading"><h2>Jouw Favorites</h2><a class="text-link" href="#/favorites">Alles bewaren ↗</a></div>${!store.session ? '<div class="small-empty"><p>Log in om je favoriete meditaties hier terug te vinden.</p><button class="secondary" data-login>Inloggen ↗</button></div>' : personalState() || compactMeditations(history.favorites.slice(0,4).map(meditation=>({meditation})), 'Bewaar een meditatie met het hartje om haar hier terug te vinden.')}</section>`;
}
function notificationsView() {
  const prefs = engagementFor(store.session?.user), days = ['Zo','Ma','Di','Wo','Do','Vr','Za'];
  return `<section class="page-head"><span class="eyebrow">AANDACHT, OP JOUW TEMPO</span><h1>Een zachte<br><em>herinnering.</em></h1><p>Alleen als jij ervoor kiest. Rust begint met ruimte.</p></section><section class="library notification-library"><div class="notification-intro forest-panel"><span aria-hidden="true">✧</span><div><h2>Jij bepaalt je ritme.</h2><p>Hier bewaar je voorkeuren voor nieuwe meditaties en mindful reminders. E-mail en push zijn nog niet gekoppeld. Er wordt niets verstuurd of ingepland.</p></div></div>${!store.session ? loginCta('Bewaar je keuzes bij je account.', 'Log in om notificatievoorkeuren op je eigen account te bewaren.') : `<section class="settings-panel notification-settings"><form id="engagement-form"><label class="setting-row"><span><strong>Notificaties toestaan</strong><small>Je bestaande opt-in. Deze hoofdschakelaar bepaalt of toekomstige herinneringen mogen worden verstuurd.</small></span><input type="checkbox" name="notifications" ${prefs.notifications ? 'checked' : ''}><span class="switch" aria-hidden="true"></span></label><label class="setting-row"><span><strong>Nieuwe meditaties</strong><small>Voorkeur voor berichten als een echte meditatie beschikbaar wordt.</small></span><input type="checkbox" name="new_meditations" ${prefs.new_meditations ? 'checked' : ''}><span class="switch" aria-hidden="true"></span></label><label class="setting-row"><span><strong>Mindful reminders</strong><small>Een toekomstig moment om even bij jezelf te komen.</small></span><input type="checkbox" name="reminders" ${prefs.reminders ? 'checked' : ''}><span class="switch" aria-hidden="true"></span></label><div class="reminder-fields"><div><label for="reminder-time">Voorkeurstijd</label><input id="reminder-time" name="reminder_time" type="time" value="${prefs.reminder_time}"></div><div><label for="reminder-zone">Tijdzone</label><input id="reminder-zone" name="timezone" maxlength="64" value="${escape(prefs.timezone)}" placeholder="Bijvoorbeeld Europe/Amsterdam"></div></div><fieldset class="weekday-settings"><legend>Voorkeursdagen</legend><div>${days.map((day,index)=>`<label><input name="weekday" type="checkbox" value="${index}" ${prefs.weekdays.includes(index) ? 'checked' : ''}><span>${day}</span></label>`).join('')}</div></fieldset><p id="effective-notifications" role="status">${prefs.notifications ? 'Opt-in staat aan. Je voorkeuren worden pas gebruikt als een provider is gekoppeld.' : 'Opt-in staat uit. Ook geselecteerde voorkeuren geven nu geen toestemming voor verzending.'}</p><button class="primary" type="submit">Voorkeuren bewaren ↗</button><p id="engagement-result" role="status"></p></form><div class="provider-state"><h3>Verzending nog niet beschikbaar</h3><p>Geen provider, geen notificatieverzoek en geen geplande berichten.</p><button class="secondary" data-notification-provider>Bekijk providerstatus</button><p id="notification-provider-result" role="status"></p></div></section>`}<a class="text-link" href="#/profile">← Profiel & marketingvoorkeuren</a></section>`;
}
async function loadDiscovery() {
  discoveryStatus = 'loading';
  try { discoveryData = await store.discovery(); discoveryStatus = 'ready'; }
  catch { discoveryData = { collections: [], coming_soon: [] }; discoveryStatus = 'error'; errorCode('catalog'); }
}
function bindContent() {
  document.querySelectorAll('[data-library-filter]').forEach(select => select.onchange = () => { libraryFilters[select.dataset.libraryFilter] = select.value; updateExplore(); });
  if ($('#favorite-sort')) $('#favorite-sort').onchange = event => { favoriteSort = event.target.value; render(); };
  if ($('#engagement-form')) $('#engagement-form').onsubmit = async event => {
    event.preventDefault(); const form = event.target, button = form.querySelector('button[type="submit"]'), result = form.querySelector('#engagement-result'); button.disabled = true; result.textContent = 'Je voorkeuren worden bewaard…';
    try { await store.updateEngagement({ notifications: form.notifications.checked, new_meditations: form.new_meditations.checked, reminders: form.reminders.checked, reminder_time: form.reminder_time.value, timezone: form.timezone.value, weekdays: [...form.querySelectorAll('[name="weekday"]:checked')].map(input=>Number(input.value)) }); result.textContent = 'Je voorkeuren zijn bewaard. Er wordt niets verstuurd.'; }
    catch (error) { if (!store.session) { await render(); notify(error.message); } else result.textContent = error.message; }
    finally { button.disabled = false; }
  };
  if ($('#engagement-form')) $('#engagement-form').notifications.onchange = event => { $('#effective-notifications').textContent = event.target.checked ? 'Opt-in staat aan. Er wordt niets verstuurd zonder provider.' : 'Opt-in staat uit. Geselecteerde voorkeuren geven geen toestemming voor verzending.'; };
  if ($('[data-notification-provider]')) $('[data-notification-provider]').onclick = async () => { const result = await notificationProvider.register(); $('#notification-provider-result').textContent = result.available ? 'Provider beschikbaar' : 'Provider nog niet gekoppeld. Geen berichten verstuurd.'; };
}

function durationText(seconds) {
  if (!seconds) return 'Duur bij afspelen';
  const minutes = Math.floor(seconds / 60), rest = Math.floor(seconds % 60);
  return `${minutes} min${rest ? ` ${rest} sec` : ''}`;
}
function metadata(med) { return `${escape(med.accent_label || med.category)} <span>•</span> ${durationText(med.duration_seconds)}`; }
function favoriteButton(med) {
  const selected = personal.favorites.has(med.id);
  return `<button class="favorite round ${selected ? 'selected' : ''}" data-favorite="${escape(med.id)}" aria-label="${selected ? 'Verwijderen uit' : 'Toevoegen aan'} favorieten" aria-pressed="${selected}">${selected ? '♥' : '♡'}</button>`;
}
function card(med) {
  const progress = progressFor(med.id);
  return `<article class="meditation-card"><div class="card-art"><img src="${escape(artworkFor(med))}" alt="" loading="lazy">${favoriteButton(med)}<span class="pill">${escape(med.category)} · ${med.is_premium ? 'Premium' : 'Free'}</span><a class="card-open" href="#/meditation/${encodeURIComponent(med.slug)}" aria-label="Bekijk ${escape(med.title)}"><span class="round" aria-hidden="true">↗</span></a></div><div class="card-info"><small>${metadata(med)}</small><h3><a href="#/meditation/${encodeURIComponent(med.slug)}">${escape(med.title)}</a></h3><p>${escape(med.description)}</p>${progress?.position_seconds && !progress.completed ? `<a class="resume" href="#/player/${encodeURIComponent(med.slug)}">Hervatten vanaf ${formatTime(progress.position_seconds)} →</a>` : progress?.completed ? '<span class="completed-label">✓ Meditatie voltooid</span>' : ''}</div></article>`;
}
function loginCta(title, description) {
  return `<div class="account-cta"><span class="cta-mark" aria-hidden="true">✧</span><div><h2>${title}</h2><p>${description}</p><button class="primary" data-login>Inloggen <span aria-hidden="true">↗</span></button><small>Met je bestaande Master Your Meditations-account.</small></div></div>`;
}
function personalState() {
  if (personalStatus === 'loading') return '<div class="empty" role="status"><h3>Je persoonlijke ruimte wordt geladen…</h3><p>Een moment voor jezelf.</p></div>';
  if (personalStatus === 'error') return '<div class="empty error-panel" role="status"><h3>Je gegevens konden niet laden.</h3><p>Je bewaarde meditaties en voortgang blijven veilig. Probeer opnieuw.</p><button class="secondary" data-retry-personal>Opnieuw proberen</button></div>';
  return '';
}
function home() {
  const morning = catalog.find(med => med.slug === 'master-your-morning') || catalog[0];
  const summary = progressSummary(mergeProgress(personal.progress, local), sessions);
  const recent = summary.recent.find(row => !row.completed && row.position_seconds > 0 && catalog.some(med => med.id === row.meditation_id));
  const resumeMed = recent && catalog.find(med => med.id === recent.meditation_id);
  return `<section class="hero"><div class="hero-content"><span class="eyebrow"><i></i> EEN MOMENT VOOR JEZELF</span><h1>Find your calm.<br><em>Master your day.</em></h1><p>Laat de wereld even wachten.<br>Vind rust, kracht en richting — één meditatie tegelijk.</p>${morning ? `<a class="primary" href="#/meditation/${encodeURIComponent(morning.slug)}">Begin je ochtend <span aria-hidden="true">↗</span></a><a class="hero-explore" href="#/explore">Ontdek je meditatie →</a><span class="hero-note">${durationText(morning.duration_seconds)} om bij jezelf te komen</span>` : '<p class="empty">Er zijn nog geen meditaties beschikbaar.</p>'}</div><div class="hero-caption"><span>01 / CINEMATIC FOREST</span><span>Adem in. Je bent hier.</span></div></section>
  <section class="library"><a class="text-link" href="#/for-you">For You · jouw persoonlijke selectie ↗</a>${personalizedHome()}${resumeMed ? `<a class="continue-card" href="#/player/${encodeURIComponent(resumeMed.slug)}"><img src="${escape(artworkFor(resumeMed))}" alt=""><div><span class="eyebrow">GA VERDER WAAR JE WAS</span><h3>${escape(resumeMed.title)}</h3><p>Hervatten vanaf ${formatTime(recent.position_seconds)}</p></div><span class="round" aria-hidden="true">▶</span></a>` : ''}<div class="section-heading"><div><span class="eyebrow">KLEINE RITUELEN. MEER RUIMTE.</span><h2>Jouw moment van rust.</h2></div><a class="text-link" href="#/explore">Alles ontdekken ↗</a></div><div class="cards">${catalog.map(card).join('')}</div><div class="ritual"><span class="ritual-icon" aria-hidden="true">✧</span><div><h3>Je hoeft nergens naartoe.</h3><p>Een rustige plek. Je koptelefoon. Een moment dat helemaal van jou is.</p></div><span class="ritual-end">ADEM IN · ADEM UIT</span></div>${discoveryHome()}</section>`;
}
function explore() {
  return `<section class="page-head explore-head"><span class="eyebrow">VOLG JE AANDACHT</span><h1>Wat heb jij<br><em>vandaag nodig?</em></h1><p>Een rustige start, een heldere focus of ruimte om los te laten.</p></section><section class="library explore-library"><form id="search-form" role="search"><label for="search">Zoek je meditatie</label><div class="search-box"><span aria-hidden="true">⌕</span><input id="search" type="search" autocomplete="off" placeholder="Zoek op titel, categorie of gevoel" value="${escape(search)}"><button type="button" id="clear-search" class="subtle" aria-label="Zoekopdracht wissen">✕</button></div></form><div class="category-chips" aria-label="Categorieën">${categories.map(item => `<button class="category-chip ${item.id === category ? 'active' : ''}" data-category="${item.id}" aria-pressed="${item.id === category}">${item.label}<span>${filterCatalog(catalog, '', item.id).length}</span></button>`).join('')}</div><div class="library-filters"><label for="access-filter">Toegang<select id="access-filter" data-library-filter="access">${[['all','Free & Premium'],['free','Free'],['premium','Premium']].map(([value,label])=>`<option value="${value}" ${libraryFilters.access === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label for="duration-filter">Duur<select id="duration-filter" data-library-filter="duration">${[['all','Elke duur'],['short','Tot 5 minuten'],['medium','5 tot 10 minuten'],['long','Meer dan 10 minuten'],['unknown','Duur nog onbekend']].map(([value,label])=>`<option value="${value}" ${libraryFilters.duration === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label for="goal-filter">Doel<select id="goal-filter" data-library-filter="goal"><option value="all">Alle doelen</option>${goals.map(goal=>`<option value="${goal.id}" ${libraryFilters.goal === goal.id ? 'selected' : ''}>${goal.label}</option>`).join('')}</select></label></div><p class="filter-explanation">Filters combineren titel, categorie, toegang, bekende duur en doel. Premium-audio vraagt geverifieerde toegang.</p><div id="explore-results"></div></section>`;
}
function updateExplore() {
  if (!$('#explore-results')) return;
  const items = libraryFilter(catalog, { search, category, ...libraryFilters });
  $('#explore-results').innerHTML = `<div class="section-heading"><h2>${categories.find(item => item.id === category)?.label || 'Meditaties'}</h2><span class="available" role="status">${items.length} ${items.length === 1 ? 'meditatie' : 'meditaties'} beschikbaar</span></div><div class="cards">${items.map(card).join('') || `<div class="empty"><span class="empty-icon" aria-hidden="true">✧</span><h3>${search ? 'Geen meditatie gevonden.' : 'Hier groeit straks meer rust.'}</h3><p>${search ? 'Probeer een andere zoekterm of bekijk alle categorieën.' : 'In deze categorie is nog geen meditatie beschikbaar. Ontdek ondertussen de huidige catalogus.'}</p><button class="secondary" data-reset-search>Bekijk alle meditaties</button></div>`}</div>`;
}
function favorites() {
  const items = catalog.filter(med => personal.favorites.has(med.id));
  if (favoriteSort === 'title') items.sort((a,b)=>a.title.localeCompare(b.title));
  if (favoriteSort === 'recent') items.sort((a,b)=>(Date.parse(progressFor(b.id)?.last_played_at) || 0) - (Date.parse(progressFor(a.id)?.last_played_at) || 0));
  return `<section class="page-head"><span class="eyebrow">JOUW PERSOONLIJKE SELECTIE</span><h1>Om naar<br><em>terug te keren.</em></h1><p>Bewaar de meditaties die iets voor je doen.</p></section><section class="library favorites-library">${!store.session ? loginCta('Jouw rust, altijd dichtbij.', 'Log in om je favorieten te bewaren en op al je apparaten terug te vinden.') : personalState() || `<div class="section-heading"><h2>Je bewaarde meditaties</h2><label class="favorite-sort" for="favorite-sort">Volgorde<select id="favorite-sort">${[['catalog','Catalogus'],['title','Titel'],['recent','Recent beluisterd']].map(([value,label])=>`<option value="${value}" ${favoriteSort === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><span class="available">${items.length} ${items.length === 1 ? 'favoriet' : 'favorieten'}</span></div><div class="cards">${items.map(card).join('') || '<div class="empty"><span class="empty-icon" aria-hidden="true">♡</span><h3>Een plek voor jouw favorieten.</h3><p>Tik op het hartje bij een meditatie om die hier te bewaren.</p><a class="primary" href="#/explore">Ontdek je meditatie ↗</a></div>'}</div>`}</section>`;
}
function detail(med) {
  const progress = progressFor(med.id);
  return `<section class="detail"><div class="detail-art"><img src="${escape(artworkFor(med))}" alt="Een rustig bos met ochtendlicht"><a href="#${escape(detailOrigin || '/')}" class="back" data-detail-back>← ${!detailOrigin || detailOrigin === '/' ? 'Terug naar Home' : 'Terug naar overzicht'}</a><span class="art-caption">CINEMATIC FOREST / MORNING LIGHT</span></div><div class="detail-content"><span class="eyebrow">${escape(med.accent_label || med.category)} · GUIDED MEDITATION</span><h1>${escape(med.title)}</h1><p class="detail-description">${escape(med.description)}</p><div class="detail-meta"><span>◷ ${durationText(med.duration_seconds)}</span><span>♬ Cinematic forest</span><span>Nederlandse begeleiding</span></div><div class="detail-actions">${med.master_audio_url || med.is_premium ? `<a class="primary" href="#/player/${encodeURIComponent(med.slug)}">${med.is_premium && access.status === 'free' ? 'Ontdek Premium' : progress?.position_seconds && !progress.completed ? `Hervatten · ${formatTime(progress.position_seconds)}` : 'Start je meditatie'} <span aria-hidden="true">▶</span></a>` : '<span class="available">Audio nog niet beschikbaar</span>'}${favoriteButton(med)}</div><a class="text-link" href="#/help" data-audio-feedback="${escape(med.id)}">Audio/voice feedback →</a>${progress?.completed ? '<p class="completed-label">✓ Je hebt deze meditatie voltooid. Je kunt opnieuw beginnen.</p>' : ''}<div class="detail-divider"></div><span class="eyebrow">MAAK DIT MOMENT VAN JOU</span><h3>Begin met een rustige ademhaling.</h3><p>Ga comfortabel zitten, zet je koptelefoon op en geef jezelf de ruimte om even stil te staan.</p><div class="practice"><span>01 <strong>Kom tot rust</strong></span><span>02 <strong>Luister en adem</strong></span><span>03 <strong>Neem het mee</strong></span></div></div></section>`;
}
function playerView(med) {
  return `<section class="player-screen"><div class="player-top"><a class="back" href="#/meditation/${encodeURIComponent(med.slug)}">↓ Terug naar meditatie</a><span class="eyebrow">JOUW MOMENT VAN RUST</span>${favoriteButton(med)}</div><div class="player-center"><div class="forest-disc"><img src="${escape(artworkFor(med))}" alt="Een fotorealistisch bos met rustig ochtendlicht"><svg class="progress-ring" viewBox="0 0 320 320" aria-hidden="true"><circle class="ring-track" cx="160" cy="160" r="153"/><circle id="ring-progress" cx="160" cy="160" r="153" pathLength="100"/></svg><span class="disc-mark" aria-hidden="true">✧</span></div><span class="eyebrow">${escape(med.category)} · CINEMATIC FOREST</span><h1>${escape(med.title)}</h1><p>Adem in. Laat los. Je bent precies waar je moet zijn.</p><div class="transport"><label for="seek" class="sr-only">Luisterpositie</label><input id="seek" type="range" min="0" max="${med.duration_seconds || 0}" value="0" step="0.1" disabled><div class="time-labels"><span id="elapsed">0:00</span><span id="duration">${formatTime(med.duration_seconds)}</span></div><div class="player-buttons"><button class="skip" id="rewind" aria-label="15 seconden terug"><span aria-hidden="true">↶</span><small aria-hidden="true">15</small></button><button class="play-main" id="play" aria-label="Afspelen">▶</button><button class="skip" id="forward" aria-label="15 seconden vooruit"><span aria-hidden="true">↷</span><small aria-hidden="true">15</small></button></div><p id="player-status" class="player-status" role="status">Tik op afspelen om te beginnen.</p></div><span class="headphones">♬ &nbsp; Het mooiste met een koptelefoon</span><a class="text-link" href="#/help" data-audio-feedback="${escape(med.id)}">Audio/voice feedback →</a></div></section>`;
}
function dateText(value) {
  try { return new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium' }).format(new Date(value)); } catch { return 'Datum onbekend'; }
}
function profileView() {
  const summary = progressSummary(mergeProgress(personal.progress, local), sessions), prefs = preferencesFor(store.session?.user);
  const displayName = profile?.display_name || 'Jouw persoonlijke ruimte';
  return `<section class="page-head profile-head"><span class="eyebrow">ELK MOMENT TELT</span><h1>${store.session ? 'Jouw ruimte.' : 'Begin bij jezelf.'}<br><em>Jouw ritme.</em></h1><p>Geen haast. Geen perfectie. Alleen ruimte voor jezelf.</p></section><section class="library profile-library">${!store.session ? loginCta('Neem je rust met je mee.', 'Log in voor je profiel, bewaarde meditaties en voortgang op al je apparaten.') : `<div class="profile-identity"><span class="avatar" aria-hidden="true">${escape((profile?.display_name || store.session.user.email || 'M').slice(0, 1).toUpperCase())}</span><div><h2>${escape(displayName)}</h2><p>${escape(store.session.user.email)}</p></div><span class="pill-inline">JOUW RITUELEN</span></div>`}${store.session ? personalState() : ''}
  <nav class="account-links" aria-label="Accountbeheer"><a class="text-link" href="#/settings">Instellingen ↗</a><a class="text-link" href="#/help">Help & Feedback ↗</a><a class="text-link" href="#/journey">Your Journey & Progress ↗</a><a class="text-link" href="#/goals">Mijn doelen ↗</a><a class="text-link" href="#/notifications">Notification preferences ↗</a><a class="text-link" href="#/account-privacy">Privacy & accountbeheer ↗</a></nav>${subscriptionPanel()}<div class="progress-note"><p>Je echte luistertijd, luisterdagen en mijlpalen vind je in <a href="#/journey">Your Journey</a>. Hervatposities blijven apart bewaard.</p></div><div class="profile-columns"><section class="recent-panel"><span class="eyebrow">RUIMTE DIE JE AL GEMAAKT HEBT</span><h2>Recent beluisterd</h2><p class="panel-description">Het laatste luistermoment per meditatie.</p>${summary.recent.length ? `<ul class="recent-list">${summary.recent.slice(0, 5).map(row => {
    const med = catalog.find(item => item.id === row.meditation_id);
    return `<li>${med ? `<a href="#/meditation/${encodeURIComponent(med.slug)}"><img src="${escape(artworkFor(med))}" alt=""><div><h3>${escape(med.title)}</h3><p>${dateText(row.last_played_at)} · ${row.completed ? 'Voltooid' : `${formatTime(row.position_seconds)} beluisterpositie`}</p></div><span aria-hidden="true">↗</span></a>` : `<div><h3>Meditatie niet meer beschikbaar</h3><p>${dateText(row.last_played_at)}</p></div>`}</li>`;
  }).join('')}</ul>` : '<div class="small-empty"><h3>Je eerste moment begint hier.</h3><p>Na het luisteren verschijnt je meditatie hier.</p><a class="text-link" href="#/explore">Ontdek je meditatie →</a></div>'}</section><section class="settings-panel"><span class="eyebrow">OP JOUW MANIER</span><h2>Profiel & voorkeuren</h2>${store.session ? `${profileStatus === 'error' ? '<p class="inline-error">Je profiel kon niet laden. <button class="text-button" data-retry-personal>Opnieuw proberen</button></p>' : ''}<form id="profile-form"><label for="display-name">Hoe mogen we je noemen?</label><input id="display-name" name="display_name" maxlength="80" autocomplete="nickname" value="${escape(profile?.display_name)}" placeholder="Je voornaam"><button class="secondary" type="submit">Naam bewaren</button><p id="profile-result" role="status"></p></form><form id="preferences-form"><label class="setting-row"><span><strong>Notificaties</strong><small>Voorkeur voor toekomstige herinneringen. Pushmeldingen zijn nog niet beschikbaar.</small></span><input type="checkbox" name="notifications" ${prefs.notifications ? 'checked' : ''}><span class="switch" aria-hidden="true"></span></label><label class="setting-row"><span><strong>Marketing-e-mail</strong><small>Voorkeur voor nieuws en updates. Dit schakelt nog geen e-mailverzending in.</small></span><input type="checkbox" name="marketing_email" ${prefs.marketing_email ? 'checked' : ''}><span class="switch" aria-hidden="true"></span></label><button class="secondary" type="submit">Voorkeuren bewaren</button><p id="preferences-result" role="status"></p></form><button class="text-button logout-button" data-logout>Uitloggen ↗</button>` : '<div class="small-empty"><p>Log in om je naam en accountvoorkeuren te bewaren.</p><button class="secondary" data-login>Inloggen ↗</button></div>'}</section></div></section>`;
}
function durationTextMeasured(seconds) {
  if (seconds < 60) return `${Math.floor(seconds)} sec`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  return `${Math.floor(seconds / 3600)} u ${Math.floor(seconds % 3600 / 60)} min`;
}
async function render() {
  if (scope() !== currentScope) {
    audio.pause(); clearPlayer(); personal = { favorites: new Set(), progress: {} }; profile = null;
    personalStatus = profileStatus = 'guest'; access = { state: 'ready', status: 'free' }; readLocal();
  }
  const version = ++routeVersion, current = route().startsWith('/affirmations?') ? '/affirmations' : route();
  if(current==='/journey'){const task=loadServerJourney();$('#view').innerHTML=yourJourneyView();await task;if(version!==routeVersion)return;if(!store.session&&currentScope!=='guest'){audio.pause();clearPlayer();personal={favorites:new Set(),progress:{}};profile=null;personalStatus=profileStatus='guest';readLocal();}}
  for (const [id, target] of [['home', '/'], ['explore', '/explore'], ['collections', '/collections'], ['favorites', '/favorites'], ['profile', '/profile']]) {
    const link = $(`#${id}-link`), active = current === target || (id === 'collections' && current.startsWith('/collection/')) || (id === 'profile' && ['/settings', '/help', '/diagnostics', '/journey', '/notifications', '/account-privacy', '/goals'].includes(current));
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
  $('#account').textContent = store.session ? 'Uitloggen ↗' : 'Inloggen ↗';
  const pages = { '/diagnostics': diagnosticsView, '/help': helpView, '/settings': settingsView, '/for-you': () => `<section class="page-head"><span class="eyebrow">JOUW RITME</span><h1>For <em>You.</em></h1><p>Ruimte die bij jouw doelen past.</p></section><section class="library">${personalizedHome()}<a class="text-link" href="#/">← Home</a></section>`, '/journey': yourJourneyView, '/account-privacy': accountPrivacyView, '/collections': collectionsView, '/notifications': notificationsView, '/welcome': welcome, '/goals': goalsView, '/onboarding-account': onboardingAccount, '/premium': paywall, '/privacy': privacyView, '/affirmations': affirmationsView, '/community': communitySessionsView, '/': home, '/explore': explore, '/favorites': favorites, '/profile': profileView };
  if (pages[current]) $('#view').innerHTML = pages[current]();
  else if (current.startsWith('/collection/')) $('#view').innerHTML = collectionDetail(current.slice('/collection/'.length));
  else {
    const match = current.match(/^\/(meditation|player)\/([^/]+)$/);
    const med = match && catalog.find(item => encodeURIComponent(item.slug) === match[2]);
    if (!med) $('#view').innerHTML = '<section class="library"><h1>Meditatie niet gevonden.</h1><p>Deze meditatie is niet beschikbaar in de huidige catalogus.</p><a class="text-link" href="#/explore">Terug naar Explore →</a></section>';
    else if (match[1] === 'player' && !med.master_audio_url && !med.is_premium) $('#view').innerHTML = '<section class="library"><h1>Audio nog niet beschikbaar.</h1><a class="text-link" href="#/explore">Terug naar Explore →</a></section>';
    else {
      let playable = med, authorizedExpiry = null, verifiedOwner = null;
      if (match[1] === 'player' && med.is_premium) {
        $('#view').setAttribute('aria-busy', 'true');
        $('#view').innerHTML = '<section class="library" role="status"><h1>Je toegang wordt gecontroleerd…</h1><p>Een moment voor jezelf.</p></section>';
        try {
          const owner = scope(), result = await store.playback(med.id);
          if (version !== routeVersion || scope() !== owner) return;
          verifiedOwner = owner; playable = { ...med, master_audio_url: result.master_audio_url }; authorizedExpiry = result.expires_at;
        } catch (error) {
          if (version !== routeVersion) return;
          if (player.meditation?.is_premium) { audio.pause(); clearPlayer(); }
          errorCode('playback');
          $('#view').innerHTML = premiumGate(med, error); $('#view').setAttribute('aria-busy', 'false'); bindJourney(); updatePlayer(); return;
        }
      }
      if (version !== routeVersion) return;
      $('#view').innerHTML = match[1] === 'player' ? playerView(med) : detail(med);
      if (match[1] === 'player') {
        if (player.meditation?.id !== med.id) activeSession = null;
        let resume = progressFor(med.id);
        if (med.is_premium && player.meditation?.id === med.id && player.meditation.master_audio_url !== playable.master_audio_url) {
          resume = { position_seconds: audio.currentTime }; audio.pause(); await player.persist(); player.meditation = null;
        }
        await player.load(playable, resume);
        if (med.is_premium && scope() !== verifiedOwner) { audio.pause(); clearPlayer(); return; }
        if (med.is_premium) playbackExpiry = authorizedExpiry;
        if (version !== routeVersion) return;
        $('#play').onclick = togglePlayback;
        $('#rewind').onclick = () => player.seek(audio.currentTime - 15);
        $('#forward').onclick = () => player.seek(audio.currentTime + 15);
        $('#seek').oninput = event => player.seek(Number(event.target.value));
      }
    }
  }
  document.title = `${current === '/community' ? 'Community Sessions' : current === '/affirmations' ? 'Daily Align' : current === '/' ? 'Home' : current === '/explore' ? 'Explore' : current === '/favorites' ? 'Favorieten' : current === '/journey' ? 'Your Journey & Progress' : current === '/account-privacy' ? 'Privacy & accountbeheer' : current === '/diagnostics' ? 'Veilige diagnostiek' : current === '/help' ? 'Help & Feedback' : current === '/settings' ? 'Instellingen' : current === '/for-you' ? 'For You' : current === '/profile' ? 'Profiel & voortgang' : current === '/collections' ? 'Collections' : current === '/notifications' ? 'Notificaties & reminders' : catalog.find(item => current.endsWith(encodeURIComponent(item.slug)))?.title || 'Meditatie'} · Master Your Meditations`;
  $('#view').setAttribute('aria-busy', 'false');
  bindForms(); bindJourney(); bindContent(); updatePlayer();
  document.querySelectorAll('img[loading="lazy"]').forEach(img => { img.decoding = "async"; });
  if (current === '/community') bindCommunityQuestion();
  if (current === '/explore') updateExplore();
}
function updatePlayer() {
  const med = player?.meditation;
  if (!med) { $('#mini-player').hidden = true; return; }
  const activePlayer = route() === `/player/${encodeURIComponent(med.slug)}`;
  $('#mini-player').hidden = activePlayer;
  $('#mini-link').href = `#/player/${encodeURIComponent(med.slug)}`;
  $('#mini-title').textContent = med.title;
  $('.mini-art').style.backgroundImage = `url(${JSON.stringify(artworkFor(med))})`;
  $('#mini-play').textContent = audio.paused ? '▶' : 'Ⅱ';
  $('#mini-play').setAttribute('aria-label', audio.paused ? 'Afspelen' : 'Pauzeren');
  $('#mini-time').textContent = formatTime(audio.currentTime);
  if (!activePlayer || !$('#play')) return;
  const duration = Number.isFinite(audio.duration) ? audio.duration : med.duration_seconds || 0;
  const percent = duration ? audio.currentTime / duration * 100 : 0;
  $('#seek').disabled = audio.readyState < 1;
  $('#seek').max = duration; $('#seek').value = audio.currentTime;
  $('#seek').setAttribute('aria-valuetext', `${formatTime(audio.currentTime)} van ${formatTime(duration)}`);
  $('#seek').style.setProperty('--progress', `${percent}%`);
  $('#ring-progress').style.strokeDasharray = `${percent} 100`;
  $('#elapsed').textContent = formatTime(audio.currentTime); $('#duration').textContent = formatTime(duration);
  $('#play').textContent = audio.paused ? '▶' : 'Ⅱ';
  $('#play').setAttribute('aria-label', audio.paused ? 'Afspelen' : 'Pauzeren');
  $('#player-status').textContent = audio.error ? 'Audio niet beschikbaar. Tik op afspelen om opnieuw te proberen.' : audio.ended ? 'Neem deze rust mee in je dag.' : !audio.paused && audio.readyState < 3 ? 'Audio wordt geladen…' : audio.paused ? 'Een moment voor jezelf. Tik op afspelen.' : 'Adem rustig. Je hoeft alleen maar te luisteren.';
}
function openLogin() { $('#signup-mode').checked = false; $('#login-form button').textContent = 'Inloggen'; $('#login-error').textContent = ''; $('#login-dialog').showModal(); }
function clearPlayer() {
  listeningSync.reset(); serverJourney={state:'guest'}; journeyOwner=null;
  playbackExpiry = null; player.reset(); audio.removeAttribute('src'); audio.load(); activeSession = null;
  $('#mini-player').hidden = true;
}
async function loadPersonal(verifyUser = false) {
  if (!store.session) { personalStatus = profileStatus = 'guest'; return; }
  const owner = scope(), boundary = store.boundary;
  personalStatus = profileStatus = 'loading';
  if (verifyUser) {
    try { await store.user(); } catch (error) {
      if (store.session && (scope() !== owner || store.boundary !== boundary)) return;
      personalStatus = profileStatus = store.session ? 'error' : 'guest';
      if (!store.session) { clearPlayer(); personal = { favorites: new Set(), progress: {} }; profile = null; readLocal(); }
      notify(error.message); return;
    }
  }
  if (scope() !== owner || store.boundary !== boundary) return;
  const [userData, profileData] = await Promise.allSettled([store.personal(), store.profile()]);
  if (!store.session) { clearPlayer(); personal = { favorites: new Set(), progress: {} }; profile = null; personalStatus = profileStatus = 'guest'; readLocal(); return; }
  if (scope() !== owner || store.boundary !== boundary) return;
  if (userData.status === 'fulfilled') { personal = userData.value; personalStatus = 'ready'; } else { personalStatus = 'error'; notify(userData.reason.message); }
  if (profileData.status === 'fulfilled') { profile = profileData.value; profileStatus = 'ready'; } else profileStatus = 'error';
}
function bindForms() {
  if ($('#feedback-form')) {
    const form = $('#feedback-form'), result = $('#feedback-result'), preview = $('#feedback-preview');
    const audioFields = $('#audio-feedback-fields');
    const updateAudio = () => {
      audioFields.hidden = form.kind.value !== 'audio';
      $('#feedback-meditation').textContent = form.kind.value === 'audio' && feedbackContext ? `Meditatie: ${feedbackContext}` : '';
    };
    if (feedbackContext) { form.kind.value = 'audio'; form.audio_topic.value = 'general'; }
    updateAudio();
    form.onsubmit = event => {
      event.preventDefault();
      try {
        const draft = feedbackAdapter.prepare({kind:form.kind.value,message:form.message.value,steps:form.steps.value,audio_topic:form.audio_topic.value,meditation_title:feedbackContext || ''});
        preview.textContent = JSON.stringify(draft, null, 2); preview.hidden = false;
        result.textContent = 'Alleen een lokaal voorbeeld. Niets opgeslagen of verstuurd.';
      } catch (error) { preview.hidden = true; result.textContent = error.message; }
    };
    form.onreset = () => { feedbackContext = null; preview.textContent = ''; preview.hidden = true; result.textContent = 'Je bericht is gewist.'; queueMicrotask(updateAudio); };
    form.oninput = () => { preview.textContent = ''; preview.hidden = true; result.textContent = ''; updateAudio(); };
  }
  if ($('#build-info') || $('#diagnostic-summary')) {
    const info = $('#build-info') || $('#diagnostic-build-state'), retry = $('#retry-build') || $('#retry-diagnostic-build');
    const loadInfo = async (force = false) => {
      retry.hidden = true; info.textContent = 'Versie-informatie wordt geladen…';
      await loadBuildInfo(force);
      info.textContent = buildState === 'ready' ? `Versie ${appInfo.version} · Build ${appInfo.build}` : 'Versie-informatie is nu niet beschikbaar.';
      retry.hidden = buildState !== 'error'; refreshDiagnostics();
    };
    retry.onclick = () => loadInfo(true); loadInfo();
  }
  if ($('#diagnostic-summary')) {
    refreshDiagnostics();
    const status = $('#diagnostic-copy-status'), summary = $('#diagnostic-summary');
    $('#clear-diagnostics').onclick = () => { operations.reset(); refreshDiagnostics(); status.textContent = 'Lokale foutcodes gewist.'; };
    $('#copy-diagnostics').onclick = async () => {
      refreshDiagnostics();
      try { await navigator.clipboard.writeText(summary.textContent); status.textContent = 'Veilige samenvatting gekopieerd. Er is niets verstuurd.'; }
      catch { status.textContent = 'Kopiëren is niet gelukt. Selecteer de samenvatting en kopieer die zelf.'; summary.focus(); }
    };
  }
  if ($('#search-form')) {
    $('#search-form').onsubmit = event => event.preventDefault();
    $('#search').oninput = event => { search = event.target.value; updateExplore(); };
    $('#clear-search').onclick = () => { search = ''; $('#search').value = ''; updateExplore(); $('#search').focus(); };
  }
  if ($('#profile-form')) $('#profile-form').onsubmit = async event => {
    event.preventDefault(); const form = event.target, button = form.querySelector('button'), result = form.querySelector('[role="status"]'); button.disabled = true;
    try {
      const saved = await store.updateProfile(form.display_name.value);
      if (!form.isConnected) return;
      profile = saved;
      if ($('.profile-identity h2')) $('.profile-identity h2').textContent = profile.display_name || 'Jouw persoonlijke ruimte';
      if ($('.avatar')) $('.avatar').textContent = (profile.display_name || store.session.user.email || 'M').slice(0, 1).toUpperCase();
      result.textContent = 'Je naam is bewaard.';
    }
    catch (error) { result.textContent = error.message; }
    finally { button.disabled = false; }
  };
  if ($('#preferences-form')) $('#preferences-form').onsubmit = async event => {
    event.preventDefault(); const form = event.target, button = form.querySelector('button'), result = form.querySelector('[role="status"]'); button.disabled = true;
    try { await store.updatePreferences({ notifications: form.notifications.checked, marketing_email: form.marketing_email.checked }); result.textContent = 'Je accountvoorkeuren zijn bewaard.'; }
    catch (error) { result.textContent = error.message; }
    finally { button.disabled = false; }
  };
}
async function logout() {
  try {
    audio.pause(); saveLocal();
    const revocation = store.logout();
    clearPlayer(); readLocal();
    personal = { favorites: new Set(), progress: {} }; profile = null; personalStatus = profileStatus = 'guest';
    // Attach rejection handling before rendering; guest UI does not wait on Auth.
    const result = revocation.then(() => null, error => error);
    await render();
    const error = await result; if (error) throw error;
    personal = { favorites: new Set(), progress: {} }; profile = null; personalStatus = profileStatus = 'guest'; await refreshAccess(); await render(); notify('Je bent uitgelogd.');
  } catch (error) { notify(error.message); if (!store.session) { clearPlayer(); personal = { favorites: new Set(), progress: {} }; profile = null; personalStatus = profileStatus = 'guest'; readLocal(); await render(); } }
}
$('#mini-play').onclick = togglePlayback;
$('#account').onclick = () => store.session ? logout() : openLogin();
$('#close-login').onclick = () => $('#login-dialog').close();
$('.skip-content').onclick = event => { event.preventDefault(); $('#view').focus(); };
document.addEventListener('click', async event => {
  if (event.target.closest('[data-delete-account]')) {
    if (!store.session) { openLogin(); return; }
    openAccountDeletion({ store, onDeleted: async () => {
      clearPlayer(); personal = { favorites: new Set(), progress: {} }; profile = null;
      personalStatus = profileStatus = 'guest'; readLocal(); await refreshAccess(); await render();
      notify('Je account en gekoppelde gegevens zijn verwijderd.');
    } });
    return;
  }
  const feedbackLink = event.target.closest('[data-audio-feedback]');
  if (feedbackLink) {
    const med = catalog.find(item => item.id === feedbackLink.dataset.audioFeedback);
    feedbackContext = med ? String(med.title || '').slice(0,200) : null;
    if (route() === '/help') await render();
  }
  if (event.target.closest('[data-detail-back]') && detailOrigin) { event.preventDefault(); location.hash = detailOrigin; return; }
  if(event.target.closest('[data-retry-journey]'))await render();
  if(event.target.closest('[data-save-zone]')){const zone=$('#journey-zone').value.trim();if(!validZone(zone)){$('#zone-result').textContent='Gebruik een geldige IANA-timezone, bijvoorbeeld Europe/Amsterdam.';return;}localStorage.setItem(`mym.journey-zone.${scope()}`,zone);await render();}
  if (event.target.closest('[data-retry-discovery]')) { const loading = loadDiscovery(); await render(); await loading; await render(); }
  if (event.target.closest('[data-edit-goals]')) { onboardingActive = false; selectedGoals = currentJourney().goals; }
  if (event.target.closest('[data-manage-subscription]')) notify('Abonnementsbeheer is nog niet beschikbaar. Er is geen betaalprovider gekoppeld; er wordt niets gewijzigd.');
  if (event.target.closest('[data-refresh-access]')) { await refreshAccess(); await render(); }
  if (event.target.closest('[data-clear-guest]')) { guestJourney = { complete: true, goals: [] }; localStorage.setItem('mym.onboarding.guest', JSON.stringify(guestJourney)); notify('Je lokale gastdoelen zijn gewist.'); }
  if (event.target.closest('[data-create-account]')) { openLogin(); $('#signup-mode').checked = true; $('#login-form button').textContent = 'Account maken'; }
  if (event.target.closest('[data-login]')) openLogin();
  if (event.target.closest('[data-logout]')) logout();
  if (event.target.closest('[data-retry-personal]')) { const loading = loadPersonal(true); await render(); await loading; await render(); }
  const chip = event.target.closest('[data-category]');
  if (chip) {
    category = chip.dataset.category;
    for (const button of document.querySelectorAll('[data-category]')) { const active = button.dataset.category === category; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); }
    updateExplore();
  }
  if (event.target.closest('[data-reset-search]')) { search = ''; category = 'all'; libraryFilters = { access: 'all', duration: 'all', goal: 'all' }; await render(); $('#search').focus(); }
  const button = event.target.closest('[data-favorite]');
  if (!button) return;
  if (!store.session) { openLogin(); return; }
  if (personalStatus !== 'ready') { notify('Laad eerst je persoonlijke gegevens opnieuw.'); return; }
  const owner = scope(), boundary = store.boundary;
  const id = button.dataset.favorite, enabled = !personal.favorites.has(id); button.disabled = true;
  try {
    await store.favorite(id, enabled);
    if (scope() !== owner || store.boundary !== boundary) return;
    if (enabled) personal.favorites.add(id); else personal.favorites.delete(id);
    await render(); notify(enabled ? 'Bewaard in je favorieten.' : 'Verwijderd uit je favorieten.');
  } catch (error) { notify(error.message); button.disabled = false; if (!store.session) { personal = { favorites: new Set(), progress: {} }; readLocal(); await render(); openLogin(); } }
});
$('#login-form').onsubmit = async event => {
  event.preventDefault(); const form = event.target, button = form.querySelector('button'); button.disabled = true; $('#login-error').textContent = '';
  try {
    audio.pause(); await player.persist(); saveLocal();
    if ($('#signup-mode').checked) {
      await store.signup(form.email.value, form.password.value);
      if (!store.session) { $('#login-error').textContent = 'Controleer je e-mail om je account te bevestigen. Log daarna in, of ga later door.'; return; }
    } else await store.auth('token?grant_type=password', { email: form.email.value, password: form.password.value });
    clearPlayer(); readLocal(); await loadPersonal();
    $('#login-dialog').close(); form.reset(); await refreshAccess(); if (onboardingActive) await finishJourney(); await render(); notify('Je bent ingelogd.');
  } catch (error) { $('#login-error').textContent = error.message; }
  finally { button.disabled = false; }
};
const validDetailOrigin = value => typeof value === 'string' && /^\/(?:$|explore$|favorites$|for-you$|profile$|journey$|collections$|collection\/[^?#]+$)/.test(value);
function savedDetailOrigin(current) {
  const slug = current.match(/^\/(?:meditation|player)\/([^/]+)$/)?.[1];
  if (!slug) return null;
  try { const value = sessionStorage.getItem(`mym.detail-origin.${slug}`); return validDetailOrigin(value) ? value : null; } catch { return null; }
}
let previousRoute = route(), detailOrigin = savedDetailOrigin(previousRoute);
window.addEventListener('hashchange', async () => {
  if (location.hash === '#view') return;
  const next = route();
  if (next.startsWith('/meditation/')) {
    detailOrigin = validDetailOrigin(previousRoute) ? previousRoute : savedDetailOrigin(next);
    if (detailOrigin) { try { sessionStorage.setItem(`mym.detail-origin.${next.slice('/meditation/'.length)}`, detailOrigin); } catch {} }
  }
  previousRoute = next;
  await render();
  if (route() === next) { window.scrollTo(0, 0); $('#view').focus({ preventScroll: true }); }
});
document.addEventListener('visibilitychange', () => { nativeLifecycle.state(!document.hidden); });
window.addEventListener('pagehide', () => { player.sample(); saveLocal(); player.persist(); });
async function boot() {
  try {
    const loads = await Promise.allSettled([store.catalog(), loadDiscovery()]);
    if (loads[0].status === 'rejected') throw loads[0].reason;
    catalog = loads[0].value;
    await loadPersonal(true); readLocal(); await refreshAccess();
    if (route() === '/' && needsOnboarding(store.session?.user, guestJourney, Object.keys(local).length > 0 || sessions.length > 0)) {
      onboardingActive = true; location.hash = '/welcome';
    }
    await render();
  } catch {
    const code = errorCode('catalog');
    if (['/help', '/settings', '/diagnostics'].includes(route())) { await render(); return; }
    $('#view').setAttribute('aria-busy', 'false');
    $('#view').innerHTML = '<section class="library error-page"><span class="eyebrow">WE ZIJN ZO TERUG</span><h1>Even geen verbinding.</h1><p>Controleer je verbinding en probeer opnieuw. Je accountgegevens worden niet gewijzigd.</p><p id="catalog-error-code"></p><a class="text-link" href="#/help">Help & Feedback →</a><button id="retry" class="primary">Opnieuw proberen ↗</button></section>';
    $('#catalog-error-code').textContent = code.trim();
    $('#retry').onclick = () => { $('#view').setAttribute('aria-busy', 'true'); $('#view').innerHTML = '<p class="loading" role="status">Je meditaties worden geladen…</p>'; boot(); };
  }
}
const nativeLifecycle = new NativeLifecycle({
  suspend:()=>{ player.sample(); audio.pause(); saveLocal(); player.persist(); listeningSync.reset(); routeVersion++; },
  reconcile:async({current})=>{ store.syncIfChanged(); readLocal(); await refreshAccess(); if(!current())return; await loadPersonal(true); if(!current())return; await render(); refreshDiagnostics(); },
  failure:()=>notify('De app kon niet veilig hervatten. Probeer opnieuw of start de app opnieuw.'),
});
nativeLifecycle.active=!document.hidden;
boot();

setInterval(() => {
  if (player.meditation?.is_premium && playbackExpiry && Date.parse(playbackExpiry) <= Date.now()) {
    audio.pause(); clearPlayer(); render(); notify('Je beveiligde afspeelsessie is verlopen. Controleer je toegang opnieuw.');
  }
}, 1000);
window.addEventListener('offline', () => { refreshDiagnostics(); notify('Je bent offline. Accountwijzigingen en Premium wachten op verbinding.'); });
window.addEventListener('storage', async event => {
  if (event.key !== 'mym.session' && event.key !== null) return;
  const changed = store.syncSession();
  if (!changed && operationBoundary === store.boundary) return;
  audio.pause(); clearPlayer(); personal = { favorites: new Set(), progress: {} }; profile = null;
  personalStatus = profileStatus = store.session ? 'loading' : 'guest'; readLocal();
  await loadPersonal(true); await refreshAccess(); await render();
});
window.addEventListener('online', async () => { nativeLifecycle.resume(); });

$('#signup-mode').onchange = event => { $('#login-form button').textContent = event.target.checked ? 'Account maken' : 'Inloggen'; };
