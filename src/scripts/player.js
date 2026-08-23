const msSupported = typeof navigator !== 'undefined' && 'mediaSession' in navigator;

const player = {
  audio: null,
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  volume: 1,
  queueContext: null,

  _updateMediaSession() {
    if (!msSupported) return;
    const track = this.currentTrack;
    const ctx = this.queueContext;
    if (!track || !ctx) {
      try { navigator.mediaSession.metadata = null; } catch {}
      try { navigator.mediaSession.playbackState = 'none'; } catch {}
      return;
    }
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: ctx.band?.name || '',
        album: ctx.album?.title || '',
        artwork: ctx.album?.coverArt ? [{ src: ctx.album.coverArt, sizes: '512x512', type: 'image/jpeg' }] : [],
      });
    } catch {}
  },

  _updatePlaybackState() {
    if (!msSupported) return;
    try { navigator.mediaSession.playbackState = this.audio && !this.audio.paused ? 'playing' : 'paused'; } catch {}
  },

  _updatePositionState() {
    if (!msSupported || !this.audio) return;
    const d = this.audio.duration;
    if (d > 0 && Number.isFinite(d)) {
      try {
        navigator.mediaSession.setPositionState({
          duration: d,
          playbackRate: 1,
          position: Math.min(this.audio.currentTime, d),
        });
      } catch {}
    }
  },

  _setupMediaSession() {
    if (!msSupported) return;
    const wrap = (fn) => (...args) => { try { fn(...args); } catch {} };
    try { navigator.mediaSession.setActionHandler('play', wrap(() => { if (this.audio && this.currentTrack) this.audio.play().catch(() => {}); })); } catch {}
    try { navigator.mediaSession.setActionHandler('pause', wrap(() => this.audio?.pause())); } catch {}
    try { navigator.mediaSession.setActionHandler('previoustrack', wrap(() => this.prev())); } catch {}
    try { navigator.mediaSession.setActionHandler('nexttrack', wrap(() => this.next())); } catch {}
    try { navigator.mediaSession.setActionHandler('seekto', wrap((d) => { if (d.seekTime != null) this.seek(d.seekTime); })); } catch {}
    try { navigator.mediaSession.setActionHandler('seekbackward', wrap((d) => { const o = d.seekOffset ?? 10; this.seek((this.audio?.currentTime || 0) - o); })); } catch {}
    try { navigator.mediaSession.setActionHandler('seekforward', wrap((d) => { const o = d.seekOffset ?? 10; this.seek((this.audio?.currentTime || 0) + o); })); } catch {}
  },

  init() {
    if (this.audio) return;
    this.audio = new Audio();
    this.audio.volume = this.volume;
    this.audio.addEventListener('ended', () => this.next());
    this.audio.addEventListener('timeupdate', () => {
      this._updatePositionState();
      document.dispatchEvent(new CustomEvent('player:timeupdate', {
        detail: {
          currentTime: this.audio.currentTime,
          duration: this.audio.duration || 0,
        }
      }));
    });
    this.audio.addEventListener('durationchange', () => this._updatePositionState());
    this.audio.addEventListener('play', () => this._updatePlaybackState());
    this.audio.addEventListener('pause', () => this._updatePlaybackState());
    this._setupMediaSession();
  },

  _canPlay(url) {
    if (!url || typeof url !== 'string') return false;
    if (!this.audio) return false;
    const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase();
    const mimeMap = { mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', flac: 'audio/flac' };
    const mime = mimeMap[ext] || '';
    return !mime || this.audio.canPlayType(mime) !== '';
  },

  _play() {
    if (!this.audio || !this.currentTrack) return;
    this.audio.src = this.currentTrack.audioUrl;
    this._updateMediaSession();
    this.audio.play().catch((err) => {
      console.warn('player: play() failed', err);
      this._dispatchError(err.message);
    });
  },

  _dispatchError(msg) {
    document.dispatchEvent(new CustomEvent('player:error', { detail: { message: msg } }));
  },

  setVolume(value) {
    const v = Math.min(1, Math.max(0, Number(value)));
    if (!Number.isFinite(v)) return;
    this.volume = v;
    if (this.audio) this.audio.volume = v;
    document.dispatchEvent(new CustomEvent('player:volumechange', { detail: { volume: v } }));
  },

  toggle(track, albumTracks, band, album) {
    if (!track || !track.audioUrl) return;
    this.init();

    if (this.currentTrack && track.audioUrl === this.currentTrack.audioUrl) {
      if (this.audio.paused) {
        this.audio.play().catch((err) => {
          console.warn('player: play() failed', err);
          this._dispatchError(err.message);
        });
        this._updatePlaybackState();
        this._dispatch();
      } else {
        this.audio.pause();
        this._updatePlaybackState();
        this._dispatch();
      }
      return;
    }

    if (!this._canPlay(track.audioUrl)) {
      console.warn('player: unsupported audio format', track.audioUrl);
      this._dispatchError('Formato de audio no soportado');
      return;
    }

    this.currentTrack = track;
    this.queue = albumTracks || [];
    this.queueIndex = this.queue.findIndex(t => t.audioUrl === track.audioUrl);
    if (band || album) this.queueContext = { band: band || null, album: album || null };
    else if (!this.queueContext) this.queueContext = null;
    this._play();
    this._dispatch();
  },

  next() {
    if (!this.audio) return;
    if (this.queueIndex < this.queue.length - 1) {
      this.queueIndex++;
      this.currentTrack = this.queue[this.queueIndex];
      this._play();
      this._dispatch();
    } else {
      this.stop();
    }
  },

  prev() {
    if (!this.audio) return;
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }
    if (this.queueIndex > 0) {
      this.queueIndex--;
      this.currentTrack = this.queue[this.queueIndex];
      this._play();
      this._dispatch();
    }
  },

  stop() {
    if (!this.audio) return;
    this.audio.pause();
    this.audio.currentTime = 0;
    this.currentTrack = null;
    this.queue = [];
    this.queueIndex = -1;
    this.queueContext = null;
    if (msSupported) {
      try { navigator.mediaSession.metadata = null; } catch {}
      try { navigator.mediaSession.playbackState = 'none'; } catch {}
    }
    this._dispatch();
  },

  seek(time) {
    if (!this.audio || !this.currentTrack) return;
    const duration = this.audio.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const t = Math.min(duration, Math.max(0, Number(time)));
    if (!Number.isFinite(t)) return;
    this.audio.currentTime = t;
    this._updatePositionState();
    document.dispatchEvent(new CustomEvent('player:timeupdate', {
      detail: {
        currentTime: t,
        duration: this.audio.duration || 0,
      }
    }));
  },

  getAudio() {
    this.init();
    return this.audio;
  },

  getState() {
    return {
      track: this.currentTrack,
      playing: this.audio ? !this.audio.paused : false,
      queueIndex: this.queueIndex,
      queueLength: this.queue.length,
      volume: this.volume,
    };
  },

  _dispatch() {
    document.dispatchEvent(new CustomEvent('player:statechange', {
      detail: {
        track: this.currentTrack,
        playing: this.audio ? !this.audio.paused : false,
        queueIndex: this.queueIndex,
        queueLength: this.queue.length,
        volume: this.volume,
      }
    }));
  },
};

export default player;
