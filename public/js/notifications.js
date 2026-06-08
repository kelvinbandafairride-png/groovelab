const GrooveNotify = {
  _promoTimer: null,
  _listening: false,
  _banner: null,
  _pushSubscribed: false,

  init() {
    if (this._listening) return;
    this._listening = true;
    this._registerSW();
    setTimeout(() => this._checkStatus(), 1000);
    document.addEventListener('click', () => {
      if (!('Notification' in window)) return;
      if (Notification.permission !== 'default') return;
      Notification.requestPermission().then(r => {
        if (r === 'granted') { this._removeBanner(); this._subscribePush(); }
      });
    }, { once: true });
  },

  async _registerSW() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      if (reg.active) {
        if (Notification.permission === 'granted') this._subscribePush();
      } else {
        reg.addEventListener('activate', () => {
          if (Notification.permission === 'granted') this._subscribePush();
        });
      }
    } catch(e) { console.log('SW registration skipped:', e.message); }
  },

  async _subscribePush() {
    if (this._pushSubscribed) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array('BOq1_NXyYy_yMY94C6ETHOdT7OonzkaovRsyfHaIXZpcaqCFbB62mh84ZdBwF59-0jtnnrw4ZWZLWLJXQ18FMmk')
      });
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub)
      });
      this._pushSubscribed = true;
    } catch(e) { console.log('Push subscribe skipped:', e.message); }
  },

  _checkStatus() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      this.startPromos();
      return;
    }
    if (Notification.permission === 'denied') {
      this._showBanner('blocked');
    } else {
      this._showBanner('default');
    }
  },

  _showBanner(state) {
    if (this._banner) return;
    const bar = document.createElement('div');
    bar.id = 'gl-notify-bar';
    bar.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:9999;background:#1877f2;color:#fff;padding:12px 24px;border-radius:14px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 8px 25px rgba(0,0,0,0.2);display:flex;align-items:center;gap:10px;max-width:90%;font-family:Segoe UI,sans-serif';
    if (state === 'blocked') {
      bar.innerHTML = '<i class="fa-solid fa-bell-slash"></i> Notifications blocked — tap to see how to enable';
      bar.onclick = () => {
        alert('To enable push notifications:\n\n1. Open browser Settings\n2. Find Site Settings / Notifications\n3. Set to "Allow"\n4. Reload the page');
      };
    } else {
      bar.innerHTML = '<i class="fa-solid fa-bell"></i> Enable notifications for alerts outside the app';
      bar.onclick = async () => {
        const r = await Notification.requestPermission();
        if (r === 'granted') { this._removeBanner(); await this._subscribePush(); }
        else if (r === 'denied') { bar.innerHTML = '<i class="fa-solid fa-bell-slash"></i> Notifications blocked — tap to see how to enable'; bar.onclick = () => alert('To enable push notifications:\n\n1. Open browser Settings\n2. Find Site Settings / Notifications\n3. Set to "Allow"\n4. Reload the page'); }
      };
    }
    document.body.appendChild(bar);
    this._banner = bar;
  },

  _removeBanner() {
    if (this._banner) {
      this._banner.remove();
      this._banner = null;
    }
  },

  show(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    new Notification(title, { body, icon: '/icon.svg' });
  },

  async bpm(bpm) {
    const ok = await this._ensureGranted();
    if (ok) this.show('Groove Lab - BPM Tap', `Current tempo: ${bpm} BPM — keep the beat!`);
  },

  async _ensureGranted() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const r = await Notification.requestPermission();
    if (r === 'granted') { this._removeBanner(); await this._subscribePush(); }
    return r === 'granted';
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

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(ch => ch.charCodeAt(0)));
}

GrooveNotify.init();
