import re
import time
import unicodedata

import requests

PLAYLIST_URL = 'https://iptv-org.github.io/iptv/languages/hin.m3u'
CACHE_TTL = 900
_cache = {'time': 0, 'channels': []}

CATEGORIES = [
    {'slug': 'news', 'name': 'News', 'blurb': 'Headlines and live coverage'},
    {'slug': 'entertainment', 'name': 'Entertainment', 'blurb': 'Shows, serials and variety'},
    {'slug': 'movies', 'name': 'Movies', 'blurb': 'Films around the clock'},
    {'slug': 'music', 'name': 'Music', 'blurb': 'Videos and live music'},
    {'slug': 'sports', 'name': 'Sports', 'blurb': 'Matches and analysis'},
    {'slug': 'kids', 'name': 'Kids', 'blurb': 'Cartoons and learning'},
    {'slug': 'devotional', 'name': 'Devotional', 'blurb': 'Bhajans, aarti and spiritual talks'},
]

_RULES = [
    ('news', ('news',)),
    ('sports', ('sport',)),
    ('music', ('music',)),
    ('devotional', ('religio', 'devotion', 'spiritual', 'bhakti', 'bhajan')),
    ('movies', ('movie', 'film', 'cinema')),
    ('kids', ('kids', 'animation', 'cartoon', 'children')),
]


def slugify(value):
    value = unicodedata.normalize('NFKD', value or '')
    value = ''.join(ch for ch in value if not unicodedata.combining(ch)).lower().strip()
    value = re.sub(r'[^\w\s-]', '', value, flags=re.UNICODE)
    return re.sub(r'[-\s]+', '-', value).strip('-_') or 'channel'


def categorize(group, name):
    group, name = (group or '').lower(), (name or '').lower()
    for text in (group, name):
        for slug, keys in _RULES:
            if any(k in text for k in keys):
                return slug
    return 'entertainment'


def clean_name(name):
    cleaned = re.sub(r'\s*[\(\[][^\)\]]*[\)\]]', '', name).strip()
    return cleaned or name


def parse_m3u(text):
    items, seen, pending = [], {}, None
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith('#EXTINF'):
            attrs = dict(re.findall(r'([\w-]+)="([^"]*)"', line))
            name = line.split(',', 1)[1].strip() if ',' in line else attrs.get('tvg-name', 'Untitled')
            pending = {
                'name': clean_name(name),
                'logo': attrs.get('tvg-logo', ''),
                'category': categorize(attrs.get('group-title', ''), name),
            }
        elif pending and not line.startswith('#'):
            base = slugify(pending['name'])
            seen[base] = seen.get(base, 0) + 1
            pending['slug'] = base if seen[base] == 1 else f'{base}-{seen[base]}'
            pending['stream'] = line
            items.append(pending)
            pending = None
    return items


def get_channels(force=False):
    now = time.time()
    if not force and _cache['channels'] and now - _cache['time'] < CACHE_TTL:
        return _cache['channels']
    try:
        r = requests.get(PLAYLIST_URL, timeout=15, headers={'User-Agent': 'BharatLiveTV/1.0'})
        r.raise_for_status()
        data = parse_m3u(r.text)
        _cache.update(time=now, channels=data)
        return data
    except Exception:
        if _cache['channels']:
            return _cache['channels']
        raise