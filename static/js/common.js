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

const Channels = (() => {
  let memory = null;
  const KEY = 'bl:channels';
  const TTL = 5 * 60 * 1000;

  async function fetchFromServer(force) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20000);
    try {
      const res = await fetch('/api/channels' + (force ? '?refresh=1' : ''), { signal: ctl.signal });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error('unavailable');
      return data.channels;
    } finally { clearTimeout(timer); }
  }

  return {
    async load(force = false) {
      if (!force && memory) return memory;
      if (!force) {
        try {
          const cached = sessionStorage.getItem(KEY);
          if (cached) {
            const { data, time } = JSON.parse(cached);
            if (Date.now() - time < TTL) { memory = data; return data; }
          }
        } catch {}
      }
      const data = await fetchFromServer(force);
      memory = data;
      try { sessionStorage.setItem(KEY, JSON.stringify({ data, time: Date.now() })); } catch {}
      return data;
    },
    clear() { memory = null; try { sessionStorage.removeItem(KEY); } catch {} },
  };
})();

async function loadChannels(force = false) { return Channels.load(force); }

const thumb = (c) =>
  `<div class="thumb"><span>${esc((c.name || 'T').charAt(0).toUpperCase())}</span>${
    c.logo
      ? `<img src="${esc(c.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
      : ''
  }</div>`;