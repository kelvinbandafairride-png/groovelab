const GrooveNotify = {
  _promoTimer: null,
  _listening: false,

  init() {
    if (this._listening) return;
    this._listening = true;
    document.addEventListener('click', () => {
      if (!('Notification' in window)) return;
      if (Notification.permission !== 'default') return;
      Notification.requestPermission();
    }, { once: true });
  },

  async request() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  },

  show(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    new Notification(title, { body, icon: '/favicon.ico' });
  },

  async bpm(bpm) {
    const ok = await this.request();
    if (ok) this.show('Groove Lab - BPM Tap', `Current tempo: ${bpm} BPM — keep the beat!`);
  },

  startPromos() {
    if (this._promoTimer) return;
    if (Notification.permission !== 'granted') return;
    const msgs = [
      'Create your own beats in Loop Studio!',
      'Learn new drum patterns in Lessons!',
      'Share your music in the Community forum!',
      'Use the metronome to improve your timing!',
      'Discover drum covers from around the world!',
      'Track your progress in the Practice section!',
      'Challenge yourself with new rhythms daily!',
      'Groove Lab — your personal drum coach!',
      'Tap BPM to find the tempo of any song!',
      'Upload and listen to your favourite tracks!',
    ];
    const pick = () => msgs[Math.floor(Math.random() * msgs.length)];
    if (this._promoTimer) clearInterval(this._promoTimer);
    this._promoTimer = setInterval(() => {
      this.show('Groove Lab', pick());
    }, 300000);
  },

  stopPromos() {
    if (this._promoTimer) {
      clearInterval(this._promoTimer);
      this._promoTimer = null;
    }
  },

  setupMediaSession(title, artist, art) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title || 'No Track',
      artist: artist || 'Groove Lab',
      album: 'Groove Lab',
      artwork: [
        { src: art || 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?q=80&w=512&auto=format&fit=crop', sizes: '512x512', type: 'image/jpeg' }
      ]
    });
  },

  setMediaActions(playFn, pauseFn, prevFn, nextFn) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler('play', () => playFn && playFn());
      navigator.mediaSession.setActionHandler('pause', () => pauseFn && pauseFn());
      navigator.mediaSession.setActionHandler('previoustrack', () => prevFn && prevFn());
      navigator.mediaSession.setActionHandler('nexttrack', () => nextFn && nextFn());
    } catch(e) {}
  }
};

GrooveNotify.init();
