(() => {
  const video = $('video'), veil = $('veil'), list = $('list'), q = $('q'), chips = $('chips');
  const filters = [{ slug: 'all', name: 'All' }, { slug: 'saved', name: 'Saved' }, ...CATS];
  let all = [], cur = null, hls = null, cat = 'all', tries = 0;

  const say = (title, text, mode = '') => {
    veil.className = 'veil ' + mode;
    $('veilTitle').textContent = title;
    $('veilText').textContent = text;
    $('veilIcon').textContent = mode === 'loading' ? '…' : mode === 'error' ? '!' : '▶';
    $('retry').hidden = mode !== 'error';
  };
  const ready = () => veil.classList.add('gone');

  function stop() {
    if (hls) { hls.destroy(); hls = null; }
    video.pause(); video.removeAttribute('src'); video.load();
  }
  function fail(msg) {
    stop();
    say('Stream unavailable', msg || 'This channel is offline or doesn’t allow browser playback. Please try another.', 'error');
  }
  function showFav() {
    const on = cur && Fav.has(cur.slug);
    $('favBtn').textContent = on ? '★ Saved' : '☆ Save';
    $('favBtn').classList.toggle('on', !!on);
  }
  function showNow() {
    $('nowName').textContent = cur ? cur.name : 'No channel selected';
    $('nowMeta').textContent = cur ? catName(cur.category) : 'Pick a channel from the list';
    $('nowLogo').innerHTML = cur ? thumb(cur) : '<div class="thumb"><b>TV</b></div>';
    showFav();
  }

  function play(c) {
    if (!c || !c.stream) return;
    cur = c; tries = 0;
    showNow();
    list.querySelectorAll('.row').forEach((r) => r.classList.toggle('on', r.dataset.s === c.slug));
    stop();
    say('Connecting…', 'Tuning in to ' + c.name, 'loading');
    history.replaceState(null, '', '?c=' + encodeURIComponent(c.slug));
    const go = () => { ready(); video.play().catch(() => {}); };

    if (window.Hls && Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 20, manifestLoadingMaxRetry: 2, levelLoadingMaxRetry: 2, fragLoadingMaxRetry: 2 });
      hls.loadSource(c.stream);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, go);
      hls.on(Hls.Events.ERROR, (_, d) => {
        if (!d.fatal) return;
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR && tries < 1) { tries++; say('Reconnecting…', 'The connection dropped. Trying again.', 'loading'); hls.startLoad(); }
        else if (d.type === Hls.ErrorTypes.MEDIA_ERROR && tries < 2) { tries++; hls.recoverMediaError(); }
        else fail();
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = c.stream;
      video.addEventListener('loadedmetadata', go, { once: true });
      video.addEventListener('error', () => fail(), { once: true });
    } else {
      fail('This browser can’t play live streams. Try Chrome, Edge, Firefox or Safari.');
    }
  }

  function render() {
    const s = q.value.trim().toLowerCase(), saved = Fav.all();
    const rows = all.filter((c) =>
      (cat === 'all' || (cat === 'saved' ? saved.includes(c.slug) : c.category === cat)) &&
      (!s || c.name.toLowerCase().includes(s)));
    $('count').textContent = rows.length + (rows.length === 1 ? ' channel' : ' channels');
    list.innerHTML = rows.length
      ? rows.map((c) => `<button class="row${cur && cur.slug === c.slug ? ' on' : ''}" data-s="${esc(c.slug)}">${thumb(c)}<span><strong>${esc(c.name)}</strong><small>${esc(catName(c.category))}</small></span></button>`).join('')
      : `<div class="empty"><strong>${cat === 'saved' ? 'No saved channels yet' : 'No channels found'}</strong>${cat === 'saved' ? 'Press Save on any channel to keep it here.' : 'Try a different search or category.'}</div>`;
  }

  async function init() {
    say('Loading channels…', 'One moment.', 'loading');
    list.innerHTML = '<div class="empty">Loading…</div>';
    try { all = await loadChannels(); }
    catch {
      list.innerHTML = '<div class="empty"><strong>Couldn’t load channels</strong>Check your connection and try again.</div>';
      say('Channels unavailable', 'We couldn’t reach the channel list. Please try again.', 'error');
      return;
    }
    render();
    const want = new URLSearchParams(location.search).get('c');
    const start = all.find((c) => c.slug === want) || all.find((c) => c.category === 'news') || all[0];
    start ? play(start) : say('No channels right now', 'Please check back shortly.', 'error');
  }

  chips.innerHTML = filters.map((f) => `<button class="chip${f.slug === cat ? ' on' : ''}" data-c="${f.slug}">${f.name}</button>`).join('');
  chips.addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    cat = b.dataset.c;
    chips.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b));
    render();
  });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('.row');
    if (b) play(all.find((c) => c.slug === b.dataset.s));
  });
  q.addEventListener('input', render);
  $('favBtn').addEventListener('click', () => { if (!cur) return; Fav.toggle(cur.slug); showFav(); if (cat === 'saved') render(); });
  $('retry').addEventListener('click', () => (cur ? play(cur) : init()));
  video.addEventListener('playing', ready);
  showNow();
  init();
})();
