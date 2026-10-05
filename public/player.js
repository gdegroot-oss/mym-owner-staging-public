export function formatTime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

export class MeditationPlayer {
  constructor(audio, { save, update, error, listen = () => {}, clock = () => performance.now(), context }) {
    this.context = context; this.loadVersion = 0; this.saveVersion = 0;
    this.audio = audio; this.save = save; this.update = update; this.error = error;
    this.queue = Promise.resolve(); this.pending = 0; this.lastSave = 0;
    this.listen = listen; this.clock = clock; this.measuring = false;
    for (const event of ['play', 'pause', 'timeupdate', 'loadedmetadata', 'ended', 'waiting', 'playing', 'error', 'seeking', 'seeked']) {
      audio.addEventListener(event, () => this.event(event));
    }
  }
  event(event) {
    if (event === 'seeking' || event === 'seeked') this.mark();
    else this.sample();
    if (event === 'loadedmetadata') {
      this.audio.currentTime = Math.min(this.pending, Math.max(0, this.audio.duration - 1)); this.pending = 0;
    }
    if (event === 'error') this.error('De audio kon niet laden. Probeer opnieuw.');
    if (event === 'timeupdate' && Date.now() - this.lastSave >= 10000) this.persist();
    if (event === 'pause' || event === 'ended') this.persist();
    this.measuring = ['play', 'playing'].includes(event) || (this.measuring && !['pause', 'ended', 'waiting', 'error', 'loadedmetadata'].includes(event));
    this.mark();
    this.update();
  }
  mark() { this.mediaMark = this.audio.currentTime; this.wallMark = this.clock(); }
  sample() {
    const delta = this.audio.currentTime - (this.mediaMark || 0);
    const elapsed = (this.clock() - (this.wallMark ?? this.clock())) / 1000;
    if (this.measuring && this.meditation && !this.audio.seeking && delta > 0 && delta <= elapsed * (this.audio.playbackRate || 1) + 1) this.listen(this.meditation.id, Math.min(delta / (this.audio.playbackRate || 1), elapsed));
    this.mark();
  }
  reset() { this.loadVersion++; this.saveVersion++; this.meditation = null; this.pending = 0; this.measuring = false; this.nextSave = null; }
  async load(meditation, progress) {
    if (this.meditation?.id === meditation.id) return;
    const version = ++this.loadVersion;
    this.audio.pause(); await this.persist();
    if (version !== this.loadVersion) return;
    this.meditation = meditation;
    this.pending = progress?.completed ? 0 : Math.max(0, progress?.position_seconds || 0);
    this.lastSave = Date.now();
    this.audio.src = meditation.master_audio_url; this.audio.load(); this.update();
  }
  async toggle() {
    try {
      if (this.audio.paused) {
        if (this.audio.error) {
          this.pending = this.audio.currentTime || 0;
          this.audio.load();
        }
        if (this.audio.ended) this.audio.currentTime = 0;
        await this.audio.play();
      } else this.audio.pause();
    } catch { this.error('Afspelen is niet gelukt. Tik op afspelen om opnieuw te proberen.'); this.update(); }
  }
  seek(seconds) {
    if (!Number.isFinite(this.audio.duration)) return;
    this.sample(); this.pending = 0;
    this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, seconds));
    this.mark();
    this.persist(); this.update();
  }
  persist() {
    if (!this.meditation || this.audio.readyState < 1) return this.queue;
    this.lastSave = Date.now();
    const id = this.meditation.id, position = this.audio.currentTime, completed = this.audio.ended;
    const version = this.saveVersion, context = this.context?.();
    // One running write + the newest pending position. A seek burst must not
    // retain an unbounded promise chain or replay hundreds of obsolete writes.
    this.nextSave = {id,position,completed,version,context};
    if (!this.saving) {
      this.saving = true;
      this.queue = (async () => {
        try { while (this.nextSave) {
          const next = this.nextSave; this.nextSave = null;
          if (next.version !== this.saveVersion) continue;
          try { await (next.context === undefined ? this.save(next.id,next.position,next.completed) : this.save(next.id,next.position,next.completed,next.context)); }
          catch { if (next.version === this.saveVersion) this.error('Je voortgang is lokaal bewaard; synchroniseren is niet gelukt.'); }
        } } finally { this.saving = false; }
      })();
    }
    return this.queue;
  }
}
