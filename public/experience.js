export const categories = [
  { id: 'all', label: 'Alles', description: 'Vind jouw moment' },
  { id: 'morning', label: 'Morning', description: 'Een rustige start' },
  { id: 'sleep', label: 'Sleep', description: 'Ruimte om te rusten' },
  { id: 'stress', label: 'Anxiety / Stress', description: 'Ademruimte in je dag' },
  { id: 'focus', label: 'Focus', description: 'Aandacht voor wat telt' },
  { id: 'gratitude', label: 'Gratitude', description: 'Stilstaan bij het goede' },
  { id: 'relaxation', label: 'Relaxation', description: 'Ruimte om los te laten' },
  { id: 'confidence', label: 'Confidence', description: 'Rust in jezelf' },
];

export function categoryFor(meditation) {
  const match = raw => {
    const value = String(raw || '').toLowerCase();
    if (/gratitude|dankbaar/.test(value)) return 'gratitude';
    if (/morning|ochtend/.test(value)) return 'morning';
    if (/sleep|slaap/.test(value)) return 'sleep';
    if (/relax|ontspan/.test(value)) return 'relaxation';
    if (/stress|anxiety|calm|angst|reset/.test(value)) return 'stress';
    if (/focus/.test(value)) return 'focus';
    if (/confidence|zelfvertrouwen/.test(value)) return 'confidence';
    return 'other';
  };
  const category = match(meditation.category);
  return category !== 'other' ? category : match(meditation.slug);
}

export function filterCatalog(catalog, search = '', category = 'all') {
  const words = search.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  return catalog.filter(meditation => {
    const haystack = `${meditation.title || ''} ${meditation.description || ''} ${meditation.category || ''}`.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return (category === 'all' || categoryFor(meditation) === category) && words.every(word => haystack.includes(word));
  });
}

export function artworkFor(meditation) {
  try {
    const url = new URL(meditation?.artwork_url);
    if (url.protocol === 'https:') return url.href;
  } catch {}
  return '/assets/forest-cinematic.webp';
}

export function mergeProgress(remote = {}, local = {}) {
  const result = { ...remote };
  for (const [id, cached] of Object.entries(local)) {
    const existing = result[id];
    if (!existing || Date.parse(cached.last_played_at) > Date.parse(existing.last_played_at)) result[id] = { ...existing, ...cached };
  }
  return result;
}

export function progressSummary(progress, sessions = [], now = new Date()) {
  const rows = Object.entries(progress).filter(([, row]) => Number.isFinite(Date.parse(row.last_played_at)));
  const recent = rows.map(([id, row]) => ({ ...row, meditation_id: id })).sort((a, b) => Date.parse(b.last_played_at) - Date.parse(a.last_played_at));
  const completed = Object.values(progress).filter(row => row.completed).length;
  const seconds = sessions.reduce((sum, row) => sum + Math.max(0, Number(row.listened_seconds) || 0), 0);
  const day = date => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  // Only measured listening sessions count. A seek or progress save is not a listen day.
  const days = new Set(sessions.filter(row => row.listened_seconds >= 1 && Number.isFinite(Date.parse(row.started_at))).map(row => day(new Date(row.started_at))));
  const cursor = new Date(now); cursor.setHours(12, 0, 0, 0);
  if (!days.has(day(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(day(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }
  return { seconds, completed, recent, streak, days: days.size };
}

export function preferencesFor(user) {
  const prefs = user?.user_metadata?.mym_preferences || {};
  return { notifications: prefs.notifications === true, marketing_email: prefs.marketing_email === true };
}
