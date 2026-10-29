const $ = (id) => document.getElementById(id);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const catName = (slug) => (CATS.find((c) => c.slug === slug) || {}).name || 'Live TV';

const Fav = {
  all() { try { return JSON.parse(localStorage.getItem('bl:fav') || '[]'); } catch { return []; } },
  has(slug) { return this.all().includes(slug); },
  toggle(slug) {
    const list = this.all(), i = list.indexOf(slug);
    if (i < 0) list.push(slug); else list.splice(i, 1);
    try { localStorage.setItem('bl:fav', JSON.stringify(list)); } catch {}
    return i < 0;
  },
};

const Source = (() => {
  const KEY = 'bl:source';
  const ids = Object.keys(SOURCES);

  function get() {
    try {
      const s = localStorage.getItem(KEY);
      if (s && SOURCES[s]) return s;
    } catch {}
    return SOURCES[DEFAULT_SOURCE] ? DEFAULT_SOURCE : ids[0];
  }
  function set(id) {
    if (!SOURCES[id]) return;
    try { localStorage.setItem(KEY, id); } catch {}
  }
  return { get, set, ids };
})();

const Channels = (() => {
  const memory = {};
  const TTL = 5 * 60 * 1000;
  const keyFor = (source) => 'bl:channels:' + source;

  async function fetchFromServer(source, force) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20000);
    try {
      const res = await fetch(
        '/api/channels?source=' + encodeURIComponent(source) + (force ? '&refresh=1' : ''),
        { signal: ctl.signal }
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error('unavailable');
      return data.channels;
    } finally { clearTimeout(timer); }
  }

  return {
    async load(force = false) {
      const source = Source.get();
      if (!force && memory[source]) return memory[source];
      if (!force) {
        try {
          const cached = sessionStorage.getItem(keyFor(source));
          if (cached) {
            const { data, time } = JSON.parse(cached);
            if (Date.now() - time < TTL) { memory[source] = data; return data; }
          }
        } catch {}
      }
      const data = await fetchFromServer(source, force);
      memory[source] = data;
      try { sessionStorage.setItem(keyFor(source), JSON.stringify({ data, time: Date.now() })); } catch {}
      return data;
    },
    clear(source) {
      if (source) {
        delete memory[source];
        try { sessionStorage.removeItem(keyFor(source)); } catch {}
      } else {
        Object.keys(memory).forEach((k) => delete memory[k]);
        try {
          Object.keys(sessionStorage)
            .filter((k) => k.startsWith('bl:channels:'))
            .forEach((k) => sessionStorage.removeItem(k));
        } catch {}
      }
    },
  };
})();

async function loadChannels(force = false) { return Channels.load(force); }

const thumb = (c) =>
  `<div class="thumb"><span>${esc((c.name || 'T').charAt(0).toUpperCase())}</span>${
    c.logo
      ? `<img src="${esc(c.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
      : ''
  }</div>`;

// Source switcher (header button bar) ----------------------------------------
(function initSourceBar() {
  const bar = $('sourceBar');
  if (!bar) return;
  const current = Source.get();

  // Mark the right button active on load (localStorage may differ from the
  // server-rendered default), and scroll it into view so it's visible even
  // when the bar overflows.
  bar.querySelectorAll('.src-chip').forEach((b) => b.classList.toggle('on', b.dataset.id === current));
  const active = bar.querySelector('.src-chip.on');
  if (active) active.scrollIntoView({ inline: 'center', block: 'nearest' });

  bar.addEventListener('click', (e) => {
    const b = e.target.closest('.src-chip');
    if (!b) return;
    const id = b.dataset.id;
    if (id === current || !SOURCES[id]) return;
    Source.set(id);
    location.reload();
  });
})();