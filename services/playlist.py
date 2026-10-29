import logging
import re
import time
import unicodedata

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)

SOURCES = {
    'hin': {'name': 'Hindi',      'url': 'https://iptv-org.github.io/iptv/languages/hin.m3u'},
    'eng': {'name': 'English',    'url': 'https://iptv-org.github.io/iptv/languages/eng.m3u'},
    'tam': {'name': 'Tamil',      'url': 'https://iptv-org.github.io/iptv/languages/tam.m3u'},
    'tel': {'name': 'Telugu',     'url': 'https://iptv-org.github.io/iptv/languages/tel.m3u'},
    'ben': {'name': 'Bengali',    'url': 'https://iptv-org.github.io/iptv/languages/ben.m3u'},
    'mar': {'name': 'Marathi',    'url': 'https://iptv-org.github.io/iptv/languages/mar.m3u'},
    'guj': {'name': 'Gujarati',   'url': 'https://iptv-org.github.io/iptv/languages/guj.m3u'},
    'pan': {'name': 'Punjabi',    'url': 'https://iptv-org.github.io/iptv/languages/pan.m3u'},
    'kan': {'name': 'Kannada',    'url': 'https://iptv-org.github.io/iptv/languages/kan.m3u'},
    'mal': {'name': 'Malayalam',  'url': 'https://iptv-org.github.io/iptv/languages/mal.m3u'},
    'urd': {'name': 'Urdu',       'url': 'https://iptv-org.github.io/iptv/languages/urd.m3u'},
    'asm': {'name': 'Assamese',   'url': 'https://iptv-org.github.io/iptv/languages/asm.m3u'},
    'in':  {'name': 'All India',  'url': 'https://iptv-org.github.io/iptv/countries/in.m3u'},
}
DEFAULT_SOURCE = 'hin'

# iptv-org.github.io is served from the gh-pages branch of iptv-org/iptv, so
# the same generated files are also reachable straight off raw.githubusercontent.com.
# Some networks block one host but not the other, so each source is tried as a
# small chain of mirrors instead of a single URL.
def _mirrors(url):
    urls = [url]
    if 'iptv-org.github.io/iptv/' in url:
        urls.append(url.replace(
            'https://iptv-org.github.io/iptv/',
            'https://raw.githubusercontent.com/iptv-org/iptv/gh-pages/',
        ))
    return urls


CACHE_TTL = 900
STALE_GRACE = 24 * 60 * 60  # serve a stale cached list for up to a day rather than erroring
REQUEST_TIMEOUT = 20

_session = requests.Session()
_session.headers.update({'User-Agent': 'BharatLiveTV/1.0'})
_retry = Retry(total=2, backoff_factor=0.5, status_forcelist=(429, 500, 502, 503, 504))
_session.mount('https://', HTTPAdapter(max_retries=_retry))
_session.mount('http://', HTTPAdapter(max_retries=_retry))

_cache = {}  # source id -> {'time': ..., 'channels': [...]}

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


def _fetch(source):
    """Try each mirror for a source in turn; return parsed channels or raise
    the last error with every attempt's reason logged."""
    errors = []
    for url in _mirrors(SOURCES[source]['url']):
        try:
            r = _session.get(url, timeout=REQUEST_TIMEOUT)
            r.raise_for_status()
            data = parse_m3u(r.text)
            if not data:
                raise ValueError('playlist fetched but contained no channels')
            return data
        except Exception as e:
            errors.append(f'{url} -> {type(e).__name__}: {e}')
    logger.warning("Couldn't fetch source '%s':\n  %s", source, '\n  '.join(errors))
    raise RuntimeError(f"all mirrors failed for source '{source}'")


def get_channels(source=DEFAULT_SOURCE, force=False):
    if source not in SOURCES:
        source = DEFAULT_SOURCE

    now = time.time()
    entry = _cache.setdefault(source, {'time': 0, 'channels': []})
    if not force and entry['channels'] and now - entry['time'] < CACHE_TTL:
        return entry['channels']
    try:
        data = _fetch(source)
        entry['time'], entry['channels'] = now, data
        return data
    except Exception:
        # Network hiccup or a mirror down: keep serving the last good list
        # for a while rather than showing "unavailable" over a transient blip.
        if entry['channels'] and now - entry['time'] < STALE_GRACE:
            return entry['channels']
        raise