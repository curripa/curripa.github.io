const player = {
  audio: null,
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  volume: 1,

  init() {
    if (this.audio) return;
    this.audio = new Audio();
    this.audio.volume = this.volume;
    this.audio.addEventListener('ended', () => this.next());
    this.audio.addEventListener('timeupdate', () => {
      document.dispatchEvent(new CustomEvent('player:timeupdate', {
        detail: {
          currentTime: this.audio.currentTime,
          duration: this.audio.duration || 0,
        }
      }));
    });
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

  toggle(track, albumTracks) {
    if (!track || !track.audioUrl) return;
    this.init();

    if (this.currentTrack && track.audioUrl === this.currentTrack.audioUrl) {
      if (this.audio.paused) {
        this.audio.play().catch((err) => {
          console.warn('player: play() failed', err);
          this._dispatchError(err.message);
        });
        this._dispatch();
      } else {
        this.audio.pause();
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
    this._dispatch();
  },

  seek(time) {
    if (!this.audio || !this.currentTrack) return;
    const duration = this.audio.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const t = Math.min(duration, Math.max(0, Number(time)));
    if (!Number.isFinite(t)) return;
    this.audio.currentTime = t;
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
