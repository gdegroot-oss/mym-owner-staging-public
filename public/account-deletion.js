export function openAccountDeletion({ store, onDeleted }) {
  const owner = store.session?.user.id;
  if (!owner) return;
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-labelledby', 'delete-account-title');
  dialog.innerHTML = '<form id="delete-account-form"><h2 id="delete-account-title">Account definitief verwijderen?</h2><p>Verwijder je account, profiel, doelen, voorkeuren, favorieten, hervatposities en luistergeschiedenis definitief. Je sessies worden afgemeld.</p><p>Tokens en audiolinks kunnen tot hun vervaldatum geldig blijven. Back-ups en wettelijke bewaartermijnen worden apart afgehandeld. Gastgegevens en je lokale privéconcept blijven staan.</p><label for="delete-account-password">Bevestig met je huidige wachtwoord</label><input id="delete-account-password" type="password" autocomplete="current-password" required maxlength="1024"><label for="delete-account-confirm"><input id="delete-account-confirm" type="checkbox" required> Ik wil mijn account definitief verwijderen.</label><p id="delete-account-error" role="alert"></p><button type="button" id="delete-account-cancel" class="secondary">Annuleren</button><button type="submit" class="primary">Definitief verwijderen</button></form>';
  document.body.append(dialog);
  const form = dialog.querySelector('form'), password = dialog.querySelector('input[type=password]');
  let busy = false;
  const close = () => { password.value = ''; dialog.close(); dialog.remove(); };
  dialog.querySelector('#delete-account-cancel').onclick = close;
  dialog.addEventListener('cancel', event => { event.preventDefault(); if (!busy) close(); });
  form.onsubmit = async event => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    if (store.session?.user.id !== owner) { close(); return; }
    busy = true;
    const credential = password.value; password.value = '';
    form.querySelectorAll('button,input').forEach(control => { control.disabled = true; });
    dialog.querySelector('#delete-account-error').textContent = '';
    try {
      await store.deleteAccount(credential);
      close(); await onDeleted();
    } catch (error) {
      dialog.querySelector('#delete-account-error').textContent = error.message;
    } finally {
      busy = false;
      form.querySelectorAll('button,input').forEach(control => { control.disabled = false; });
      if (dialog.isConnected) password.focus();
    }
  };
  dialog.showModal(); password.focus();
}
