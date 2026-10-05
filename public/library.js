import { categoryFor, filterCatalog } from './experience.js';
import { recommendations } from './journey.js';
export const collectionTemplates = [
  { slug: 'morning-rituals', title: 'Morning Rituals', description: 'Rust, kracht en richting voor je ochtend.', category_keys: ['morning'], sort_order: 0 },
  { slug: 'sleep-recovery', title: 'Sleep & Recovery', description: 'Maak ruimte om te rusten en herstellen.', category_keys: ['sleep','relaxation'], sort_order: 1 },
  { slug: 'calm-your-mind', title: 'Calm Your Mind', description: 'Ademruimte en ontspanning in je dag.', category_keys: ['stress','relaxation'], sort_order: 2 },
  { slug: 'focus-performance', title: 'Focus & Performance', description: 'Aandacht voor wat voor jou telt.', category_keys: ['focus'], sort_order: 3 },
  { slug: 'confidence', title: 'Confidence', description: 'Een rustig fundament voor vertrouwen.', category_keys: ['confidence'], sort_order: 4 },
];
export function buildCollections(catalog, definitions = collectionTemplates, memberships = []) {
  return definitions.map(definition => {
    const explicit = new Set(memberships.filter(row => row.collection_id === definition.id).map(row => row.meditation_id));
    const ids = catalog.filter(med => explicit.has(med.id) || definition.category_keys?.includes(categoryFor(med))).map(med => med.id);
    return { ...definition, meditation_ids: [...new Set(ids)] };
  }).sort((a,b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.slug.localeCompare(b.slug));
}
export function libraryFilter(catalog, { search = '', category = 'all', access = 'all', duration = 'all', goal = 'all' } = {}) {
  const matches = new Set(goal === 'all' ? catalog.map(med => med.id) : recommendations(catalog, [goal]).map(med => med.id));
  return filterCatalog(catalog, search, category).filter(med => {
    const seconds = Number(med.duration_seconds), known = Number.isFinite(seconds) && seconds > 0;
    return matches.has(med.id) && (access === 'all' || (access === 'premium' ? med.is_premium === true : med.is_premium === false))
      && (duration === 'all' || (duration === 'unknown' ? !known : known && (duration === 'short' ? seconds <= 300 : duration === 'medium' ? seconds > 300 && seconds <= 600 : seconds > 600)));
  });
}
export function recentlyAdded(catalog, now = Date.now()) {
  return catalog.filter(med => Number.isFinite(Date.parse(med.published_at)) && Date.parse(med.published_at) <= now)
    .sort((a,b) => Date.parse(b.published_at) - Date.parse(a.published_at) || a.slug.localeCompare(b.slug)).slice(0,6);
}
export function featured(catalog) { return catalog.filter(med => med.is_featured === true).slice(0,6); }
export function personalLibrary(catalog, progress, favoriteIds) {
  const byId = new Map(catalog.map(med => [med.id,med]));
  const recent = Object.entries(progress).filter(([id,row]) => byId.has(id) && Number.isFinite(Date.parse(row.last_played_at)))
    .sort((a,b) => Date.parse(b[1].last_played_at) - Date.parse(a[1].last_played_at))
    .map(([id,row]) => ({ meditation: byId.get(id), progress: row }));
  return { recent: recent.slice(0,6), continuing: recent.filter(row => row.progress.position_seconds > 0 && !row.progress.completed).slice(0,6), favorites: catalog.filter(med => favoriteIds.has(med.id)) };
}
