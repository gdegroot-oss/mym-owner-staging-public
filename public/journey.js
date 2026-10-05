import { categoryFor } from './experience.js';
export const goals = [
  { id: 'sleep', label: 'Beter slapen' }, { id: 'stress', label: 'Minder stress' },
  { id: 'focus', label: 'Meer focus' }, { id: 'confidence', label: 'Meer zelfvertrouwen' },
  { id: 'morning', label: 'Sterke ochtendroutine' }, { id: 'relax', label: 'Ontspanning' },
];
export function validGoals(value) {
  return Array.isArray(value) ? [...new Set(value.filter(id => goals.some(goal => goal.id === id)))].slice(0, 6) : [];
}
export function journeyFor(user, guest) {
  // Editable preference data only, never Premium authority. Account data never falls back to another user's local preferences.
  const data = user ? user.user_metadata?.mym_onboarding : guest;
  return { complete: data?.complete === true, goals: validGoals(data?.goals) };
}
export function needsOnboarding(user, guest, hasLegacyActivity = false) {
  return !user && guest?.complete !== true && !hasLegacyActivity;
}
export function recommendations(catalog, selected) {
  const ids = validGoals(selected);
  return catalog.filter(med => ids.includes(categoryFor(med)) || (ids.includes('relax') && ['stress','relaxation'].includes(categoryFor(med))));
}
export function accessLabel(access) {
  if (!access || access.state === 'loading') return 'Accountstatus wordt geladen…';
  if (access.state === 'error') return 'Accountstatus tijdelijk niet beschikbaar';
  return access.status === 'premium' ? 'Premium' : access.status === 'trial' ? 'Proefperiode' : 'Free';
}
