(async () => {
  const $ = (id) => document.getElementById(id);
  const grid = $('grid'), tiles = $('cats'), q = $('q');

  const defs = [
    { slug: 'all', name: 'All channels', blurb: 'Everything available right now' },
    { slug: 'saved', name: 'Saved', blurb: 'Channels you’ve starred' },
    ...CATS,
  ];

  const savedCat = (() => { try { return sessionStorage.getItem('bl:cat'); } catch { return null; } })();
  let all = [];
  let cat = new URLSearchParams(location.search).get('cat') || savedCat || 'all';
  if (!defs.some((d) => d.slug === cat)) cat = 'all';

  const inCat = (c, s) =>
    s === 'all' || (s === 'saved' ? Fav.has(c.slug) : c.category === s);

  function drawTiles() {
    tiles.innerHTML = defs.map((d) => {
      const n = all.filter((c) => inCat(c, d.slug)).length;
      return `<button class="cat${d.slug === cat ? ' on' : ''}" data-c="${d.slug}" type="button">
        <span class="cat-mark">${esc(d.name.charAt(0))}</span>
        <b>${esc(d.name)}</b>
        <span class="cat-blurb">${esc(d.blurb)}</span>
        <em>${n} ${n === 1 ? 'channel' : 'channels'}</em>
      </button>`;
    }).join('');
  }

  function drawGrid() {
    const s = q.value.trim().toLowerCase();
    const rows = all.filter((c) => inCat(c, cat) && (!s || c.name.toLowerCase().includes(s)));
    const active = defs.find((d) => d.slug === cat);
    $('gridTitle').textContent = active.name;
    $('gridSub').textContent = `${rows.length} ${rows.length === 1 ? 'channel' : 'channels'}`;

    grid.innerHTML = rows.length
      ? rows.map((c) => `
          <a class="card" href="/?c=${encodeURIComponent(c.slug)}">
            ${thumb(c)}
            <h3>${esc(c.name)}</h3>
            <p>${esc(catName(c.category))}</p>
          </a>`).join('')
      : `<div class="empty"><strong>${
          cat === 'saved' ? 'No saved channels yet' : 'No channels found'
        }</strong><span>${
          cat === 'saved'
            ? 'Star a channel on the Watch page to see it here.'
            : 'Try a different search or category.'
        }</span></div>`;
  }

  try {
    all = await loadChannels();
  } catch {
    grid.innerHTML = '<div class="empty"><strong>Channels are temporarily unavailable</strong><span>Please refresh in a moment.</span></div>';
    return;
  }

  tiles.addEventListener('click', (e) => {
    const b = e.target.closest('.cat'); if (!b) return;
    cat = b.dataset.c;
    try { sessionStorage.setItem('bl:cat', cat); } catch {}
    try { history.replaceState(null, '', cat === 'all' ? location.pathname : '?cat=' + cat); } catch {}
    drawTiles(); drawGrid();
    if (innerWidth < 1000) $('gridHead').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  q.addEventListener('input', drawGrid);
  drawTiles(); drawGrid();
})();