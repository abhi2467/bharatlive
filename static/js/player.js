(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const video = $('video');
  const veil = $('veil');
  const listEl = $('list');
  const searchEl = $('q');
  const chipsEl = $('chips');
  const liveBadge = $('liveBadge');
  const screenEl = $('screen');

  const FILTERS = [{ slug: 'all', name: 'All' }, { slug: 'saved', name: 'Saved' }, ...CATS];
  const LAST_KEY = 'bl:last';
  const VOL_KEY = 'bl:volume';
  const MUTE_KEY = 'bl:muted';

  let channels = [];
  let current = null;
  let hlsInstance = null;
  let category = 'all';
  let retryCount = 0;

  // Restore video state -------------------------------------------------------
  const savedVol = parseFloat(localStorage.getItem(VOL_KEY));
  if (!Number.isNaN(savedVol)) video.volume = Math.min(1, Math.max(0, savedVol));
  video.muted = localStorage.getItem(MUTE_KEY) === '1';
  video.addEventListener('volumechange', () => {
    try {
      localStorage.setItem(VOL_KEY, String(video.volume));
      localStorage.setItem(MUTE_KEY, video.muted ? '1' : '0');
    } catch {}
  });

  // Icons --------------------------------------------------------------------
  const ICON = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 8v5"/><circle cx="12" cy="16.5" r="1" fill="currentColor" stroke="none"/><path d="M10.3 3.2 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.2a2 2 0 0 0-3.4 0z"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3 2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 9.4l6-.9z"/></svg>',
    starFilled: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 3 2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 9.4l6-.9z"/></svg>',
  };

  // UI helpers ---------------------------------------------------------------
  const say = (title, text, mode = '') => {
    veil.className = 'veil' + (mode ? ' ' + mode : '');
    $('veilTitle').textContent = title;
    $('veilText').textContent = text;
    $('veilIcon').innerHTML = mode === 'error' ? ICON.error : ICON.play;
    $('retry').hidden = mode !== 'error';
  };
  const hideVeil = () => veil.classList.add('gone');
  const setLive = (on) => liveBadge.classList.toggle('on', !!on);

  function stop() {
    if (hlsInstance) { try { hlsInstance.destroy(); } catch {} hlsInstance = null; }
    try { video.pause(); video.removeAttribute('src'); video.load(); } catch {}
    setLive(false);
  }

  function fail(msg) {
    stop();
    say('Stream unavailable', msg || 'This channel is offline or doesn’t allow browser playback. Try another.', 'error');
  }

  function showFav() {
    const on = current && Fav.has(current.slug);
    const btn = $('favBtn');
    btn.classList.toggle('on', !!on);
    btn.querySelector('.ico').outerHTML = (on ? ICON.starFilled : ICON.star).replace('<svg', '<svg class="ico"');
    btn.querySelector('span').textContent = on ? 'Saved' : 'Save';
  }

  function showNow() {
    $('nowName').textContent = current ? current.name : 'No channel selected';
    $('nowMeta').textContent = current ? catName(current.category) : 'Pick a channel from the list';
    $('nowLogo').innerHTML = current ? thumb(current) : '<div class="thumb"><span>TV</span></div>';
    showFav();
  }

  function markActive() {
    const slug = current && current.slug;
    listEl.querySelectorAll('.row').forEach((r) => r.classList.toggle('on', r.dataset.s === slug));
  }

  // Playback -----------------------------------------------------------------
  function play(channel, { autoplay = true } = {}) {
    if (!channel || !channel.stream) return;
    current = channel;
    retryCount = 0;
    showNow();
    markActive();
    stop();
    say('Connecting…', 'Tuning in to ' + channel.name, 'loading');
    try { history.replaceState(null, '', '?c=' + encodeURIComponent(channel.slug)); } catch {}
    try { localStorage.setItem(LAST_KEY, channel.slug); } catch {}

    const beginPlayback = () => {
      hideVeil();
      if (autoplay) video.play().catch(() => {});
    };

    if (window.Hls && Hls.isSupported()) {
      hlsInstance = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        liveSyncDurationCount: 3,
        manifestLoadingMaxRetry: 2,
        levelLoadingMaxRetry: 2,
        fragLoadingMaxRetry: 3,
      });
      hlsInstance.loadSource(channel.stream);
      hlsInstance.attachMedia(video);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, beginPlayback);
      hlsInstance.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && retryCount < 1) {
          retryCount++;
          say('Reconnecting…', 'The stream dropped. Trying again.', 'loading');
          try { hlsInstance.startLoad(); } catch { fail(); }
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && retryCount < 2) {
          retryCount++;
          try { hlsInstance.recoverMediaError(); } catch { fail(); }
        } else fail();
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = channel.stream;
      video.addEventListener('loadedmetadata', beginPlayback, { once: true });
      video.addEventListener('error', () => fail(), { once: true });
    } else {
      fail('This browser can’t play live streams. Try Chrome, Edge, Firefox or Safari.');
    }
  }

  // List rendering -----------------------------------------------------------
  function render() {
    const q = searchEl.value.trim().toLowerCase();
    const saved = Fav.all();
    const rows = channels.filter((c) => {
      const inCat = category === 'all' ||
        (category === 'saved' ? saved.includes(c.slug) : c.category === category);
      return inCat && (!q || c.name.toLowerCase().includes(q));
    });

    $('count').textContent = `${rows.length} ${rows.length === 1 ? 'channel' : 'channels'}`;

    if (!rows.length) {
      listEl.innerHTML = `<div class="empty"><strong>${
        category === 'saved' ? 'No saved channels yet' : 'No channels found'
      }</strong><span>${
        category === 'saved'
          ? 'Press Save on any channel to keep it here.'
          : 'Try a different search or category.'
      }</span></div>`;
      return;
    }

    listEl.innerHTML = rows.map((c) => `
      <button class="row${current && current.slug === c.slug ? ' on' : ''}" data-s="${esc(c.slug)}" type="button">
        ${thumb(c)}
        <span class="row-txt">
          <strong>${esc(c.name)}</strong>
          <small>${esc(catName(c.category))}</small>
        </span>
      </button>`).join('');
  }

  // Init ---------------------------------------------------------------------
  async function init() {
    say('Loading channels…', 'One moment.', 'loading');
    listEl.innerHTML = '<div class="empty">Loading…</div>';
    try {
      channels = await loadChannels();
    } catch {
      listEl.innerHTML = '<div class="empty"><strong>Couldn’t load channels</strong><span>Check your connection and try again.</span></div>';
      say('Channels unavailable', 'We couldn’t reach the channel list. Please try again.', 'error');
      return;
    }

    const params = new URLSearchParams(location.search);
    const wanted = params.get('c') || (() => { try { return localStorage.getItem(LAST_KEY); } catch { return null; } })();
    const start =
      channels.find((c) => c.slug === wanted) ||
      channels.find((c) => c.category === 'news') ||
      channels[0];

    render();
    start ? play(start) : say('No channels right now', 'Please check back shortly.', 'error');
  }

  // Chips + events -----------------------------------------------------------
  chipsEl.innerHTML = FILTERS.map((f) =>
    `<button class="chip${f.slug === category ? ' on' : ''}" data-c="${f.slug}" type="button">${esc(f.name)}</button>`
  ).join('');

  chipsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    category = b.dataset.c;
    chipsEl.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b));
    render();
  });

  listEl.addEventListener('click', (e) => {
    const b = e.target.closest('.row');
    if (!b) return;
    const ch = channels.find((c) => c.slug === b.dataset.s);
    if (ch) play(ch);
  });

  searchEl.addEventListener('input', render);

  $('favBtn').addEventListener('click', () => {
    if (!current) return;
    Fav.toggle(current.slug);
    showFav();
    if (category === 'saved') render();
  });

  $('reloadBtn').addEventListener('click', () => { if (current) play(current); });
  $('retry').addEventListener('click', () => (current ? play(current) : init()));

  // PiP ----------------------------------------------------------------------
  const pipBtn = $('pipBtn');
  if (!document.pictureInPictureEnabled) pipBtn.style.display = 'none';
  pipBtn.addEventListener('click', async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (document.pictureInPictureEnabled) await video.requestPictureInPicture();
    } catch {}
  });

  // Live badge tied to real playback -----------------------------------------
  video.addEventListener('playing', () => { hideVeil(); setLive(true); });
  video.addEventListener('waiting', () => setLive(false));
  video.addEventListener('pause', () => setLive(false));
  video.addEventListener('ended', () => setLive(false));

  // Keyboard shortcuts -------------------------------------------------------
  document.addEventListener('keydown', (e) => {
    const typing = e.target.matches('input, textarea, select, [contenteditable="true"]');
    if (typing && e.key !== 'Escape') return;

    switch (e.key) {
      case ' ': case 'k': case 'K':
        e.preventDefault();
        video.paused ? video.play().catch(() => {}) : video.pause();
        break;
      case 'm': case 'M': video.muted = !video.muted; break;
      case 'f': case 'F':
        if (document.fullscreenElement) document.exitFullscreen();
        else (screenEl || video).requestFullscreen?.().catch(() => {});
        break;
      case 'p': case 'P': pipBtn.click(); break;
      case 'r': case 'R': if (current) play(current); break;
      case '/': e.preventDefault(); searchEl.focus(); break;
      case 'Escape': if (typing) searchEl.blur(); break;
      case 'ArrowUp':
        e.preventDefault();
        video.volume = Math.min(1, video.volume + 0.05);
        break;
      case 'ArrowDown':
        e.preventDefault();
        video.volume = Math.max(0, video.volume - 0.05);
        break;
      case 'ArrowRight':
        if (!video.seekable.length) return;
        try { video.currentTime = Math.min(video.seekable.end(0), video.currentTime + 10); } catch {}
        break;
      case 'ArrowLeft':
        if (!video.seekable.length) return;
        try { video.currentTime = Math.max(video.seekable.start(0), video.currentTime - 10); } catch {}
        break;
    }
  });

  showNow();
  init();
})();