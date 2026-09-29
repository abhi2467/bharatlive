const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

async function loadChannels() {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch('/api/channels', { signal: ctl.signal });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error('unavailable');
    return data.channels;
  } finally { clearTimeout(timer); }
}

const thumb = (c) => `<div class="thumb"><b>${esc((c.name || 'T').charAt(0).toUpperCase())}</b>${c.logo ? `<img src="${esc(c.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</div>`;
