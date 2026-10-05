// Local, provider-agnostic preview. No storage, requests, account IDs or telemetry.
export const feedbackKinds = ['feedback', 'problem', 'audio', 'ux'];
export const audioTopics = ['voice', 'pace', 'warmth', 'music', 'balance', 'general'];
export function feedbackPreview(kind, message) {
  const text = String(message ?? '').trim();
  if (!feedbackKinds.includes(kind)) throw new Error('Kies een soort bericht.');
  if (!text || text.length > 2000) throw new Error('Schrijf een bericht van 1 tot 2000 tekens.');
  return { schema_version: 1, kind, message: text };
}
export function feedbackDraft({kind, message, steps = '', audio_topic = 'general', meditation_title = ''} = {}) {
  if (typeof message !== 'string') throw new Error('Schrijf een korte omschrijving.');
  const base = feedbackPreview(kind, message);
  if (typeof steps !== 'string' || steps.length > 2000) throw new Error('Gebruik maximaal 2000 tekens voor je stappen.');
  if (typeof meditation_title !== 'string' || meditation_title.length > 200) throw new Error('De meditatietitel is te lang.');
  if (kind === 'audio' && !audioTopics.includes(audio_topic)) throw new Error('Kies een onderwerp voor audiofeedback.');
  return {schema_version:2,kind:base.kind,message:base.message,steps:steps.trim(),
    ...(kind === 'audio' ? {audio_topic, ...(meditation_title ? {meditation_title} : {})} : {})};
}
// Future implementations must preserve this explicit preparation/submission boundary.
// No provider injection, fetch, storage, IDs or success simulation in this adapter.
export const feedbackAdapter = Object.freeze({prepare:feedbackDraft,async submit(draft) {
  feedbackDraft(draft);return {available:false,sent:false,reason:'provider_unavailable'};
}});
export function betaDisclosure() {
  return '<p class="beta-disclosure">Gesloten bèta: dit product is in testfase. Functies kunnen veranderen; feedback is welkom. Betalen is nog niet gekoppeld: de app start geen aankoop of abonnement. Bestaande accounttoegang staat hier los van.</p>';
}
export function helpView() {
  return `<section class="page-head"><span class="eyebrow">WE HELPEN JE OP WEG</span><h1>Help &<br><em>Feedback.</em></h1><p>Gesloten bèta in voorbereiding. Een rustige plek voor je vragen.</p></section>
  <section class="library help-library">${betaDisclosure()}<a class="text-link" href="#/settings">← Instellingen</a><section class="journey-panel"><h2>Veelgestelde vragen</h2>
  <details><summary>Kan ik zonder account luisteren?</summary><p>Je kunt beschikbare Free-meditaties als gast beluisteren. Je hervatpositie blijft op dit apparaat. Met een account kun je Favorites en hervatposities synchroniseren zodra de verbinding beschikbaar is.</p></details>
  <details><summary>Waarom zie ik nog geen Journey-statistieken?</summary><p>Journey gebruikt gemeten luistertijd vanaf de nieuwe luisterregistratie, niet je hervatpositie. Als registratie nog niet beschikbaar is, toont de app geen geschatte statistieken. Probeer later opnieuw.</p><a class="text-link" href="#/journey">Open Your Journey →</a></details>
  <details><summary>Wat doe ik als audio niet start?</summary><p>Controleer je verbinding, volume en audio-uitvoer. Tik opnieuw op afspelen. Premium vereist een geldige account- en toegangscontrole; bij een fout kun je die opnieuw proberen.</p><a class="text-link" href="#/explore">Kies een meditatie →</a></details>
  <details><summary>Werkt de app offline?</summary><p>Er is nog geen downloadfunctie. Reeds geladen audio kan soms doorgaan, maar nieuwe audio en accountsynchronisatie vereisen internet. Offline luistertijd wordt niet achteraf als Journey-activiteit toegevoegd.</p></details>
  <details><summary>Worden notificaties of feedback verstuurd?</summary><p>Notificaties en feedback hebben nog geen aangesloten verzendprovider. Je notificatievoorkeuren geven toestemming voor later; er worden nu geen berichten verstuurd.</p></details>
  <details><summary>Hoe zit het met mijn gegevens?</summary><p>Je account, Favorites en hervatposities zijn accountgebonden. Export is nog niet beschikbaar. Verwijdering via accountbeheer vraagt opnieuw je wachtwoord en backendbevestiging.</p><a class="text-link" href="#/account-privacy">Privacy & accountbeheer →</a></details></section>
  <a class="text-link" href="#/diagnostics">Veilige diagnostiek & foutcodes →</a><section class="journey-panel"><h2>Feedback geven of een probleem melden</h2><p id="feedback-limitations">Verzending is nog niet beschikbaar. Maak hieronder een voorbeeld om te controleren of je niets persoonlijks deelt. Het wordt niet opgeslagen of verstuurd. Neem geen wachtwoorden, e-mailadressen, betaalgegevens of medische informatie op.</p>
  <form id="feedback-form" aria-describedby="feedback-limitations"><label for="feedback-kind">Soort bericht</label><select id="feedback-kind" name="kind"><option value="problem">Bug melden</option><option value="feedback">Suggestie</option><option value="audio">Audio/voice feedback</option><option value="ux">UX feedback</option></select><label for="feedback-message">Je bericht</label><textarea id="feedback-message" name="message" rows="6" maxlength="2000" required placeholder="Wat gebeurde er, wat verwachtte je en hoe kunnen we het verbeteren?"></textarea><label for="feedback-steps">Stappen om het te herhalen (optioneel)</label><textarea id="feedback-steps" name="steps" rows="3" maxlength="2000" placeholder="Bijvoorbeeld: open Explore, kies een meditatie en tik op afspelen."></textarea><div id="audio-feedback-fields" hidden><p id="feedback-meditation"></p><label for="feedback-audio-topic">Audio-onderwerp</label><select id="feedback-audio-topic" name="audio_topic"><option value="voice">Stem</option><option value="pace">Tempo</option><option value="warmth">Warmte/diepte</option><option value="music">Achtergrondmuziek</option><option value="balance">Balans stem/muziek</option><option value="general">Algemeen</option></select></div><div class="help-actions"><button class="secondary" type="submit">Voorbeeld bekijken</button><button class="text-button" type="reset">Bericht wissen</button><button class="secondary" type="button" disabled>Verzenden niet beschikbaar</button></div><p id="feedback-result" role="status"></p><pre id="feedback-preview" tabindex="0" aria-label="Lokaal feedbackvoorbeeld" hidden></pre></form></section>
  <section class="journey-panel"><h2>Appinformatie</h2><p id="build-info" role="status">Versie-informatie wordt geladen…</p><button class="text-button" id="retry-build" hidden>Opnieuw proberen</button></section></section>`;
}
export function settingsView() {
  return `<section class="page-head"><span class="eyebrow">OP JOUW MANIER</span><h1>Jouw<br><em>instellingen.</em></h1><p>Beheer je voorkeuren en vind hulp.</p></section><section class="library"><nav class="settings-links journey-panel" aria-label="Instellingen"><a href="#/profile">Profiel & accountvoorkeuren ↗</a><a href="#/goals" data-edit-goals>Mijn doelen ↗</a><a href="#/notifications">Notificatievoorkeuren ↗</a><a href="#/account-privacy">Privacy & accountbeheer ↗</a><a href="#/help">Help & Feedback ↗</a><a href="#/diagnostics">Veilige diagnostiek ↗</a></nav>${betaDisclosure()}<a class="text-link" href="#/profile">← Profiel</a></section>`;
}
