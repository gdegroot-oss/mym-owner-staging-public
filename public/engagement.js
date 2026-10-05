import { preferencesFor } from './experience.js';
export function normalizeEngagement(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  const time = typeof value.reminder_time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.reminder_time) ? value.reminder_time : '08:00';
  let timezone = typeof value.timezone === 'string' && value.timezone.length <= 64 ? value.timezone : 'UTC';
  try { new Intl.DateTimeFormat('nl-NL',{timeZone:timezone}); } catch { timezone='UTC'; }
  const days = Array.isArray(value.weekdays) ? [...new Set(value.weekdays.filter(day => Number.isInteger(day) && day>=0 && day<=6))].sort() : [1,2,3,4,5];
  return { new_meditations: value.new_meditations === true, reminders: value.reminders === true, reminder_time: time, weekdays: days, timezone };
}
export function engagementFor(user) {
  const preferences = preferencesFor(user), settings = normalizeEngagement(user?.user_metadata?.mym_engagement);
  return { ...settings, notifications: preferences.notifications, effective_new_meditations: preferences.notifications && settings.new_meditations,
    effective_reminders: preferences.notifications && settings.reminders && settings.weekdays.length > 0 };
}
// A provider port, not a scheduler. No Notification API, permission request, service
// worker, background timers, network, push or email delivery is used.
export const notificationProvider = Object.freeze({
  capabilities: () => ({ available: false, push: false, email: false, scheduling: false }),
  async register() { return { available: false, sent: false, reason: 'provider_unavailable' }; },
});
