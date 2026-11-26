// 擴充只該在「個人主頁」上使用。這裡用白名單判斷目前分頁是不是某個平台的個人主頁：
// 已知平台的網址要符合該平台的主頁形狀才放行（首頁、貼文、搜尋、設定、子分頁都擋）；
// 沒列在這裡的網站（個人網站、規則還沒蒐集的平台）維持原本行為，只擋網站首頁由呼叫端處理。
// shortcut: 每個平台只認最常見的主頁網址形狀；遇到漏判在 SINGLE_SEGMENT_RESERVED 補名字即可。

/** 「網址第一段就是帳號」的平台，這些名字是站內功能頁，不是帳號。 */
const SINGLE_SEGMENT_RESERVED = new Set([
  'home', 'explore', 'search', 'login', 'logout', 'signup', 'register', 'settings', 'setting', 'notifications', 'activity',
  'messages', 'message', 'inbox', 'direct', 'i', 'intent', 'share', 'hashtag', 'tags', 'tag', 'tagged', 'topics', 'lists',
  'groups', 'watch', 'marketplace', 'events', 'reel', 'reels', 'stories', 'story', 'p', 'post', 'posts', 'photo', 'photos',
  'video', 'videos', 'directory', 'discover', 'following', 'followers', 'saved', 'bookmarks', 'feeds', 'feed', 'trending',
  'top', 'store', 'shop', 'help', 'about', 'terms', 'privacy', 'policy', 'pricing', 'download', 'downloads', 'accounts',
  'account', 'dashboard', 'learning', 'artwork', 'artworks', 'jobs', 'blogs', 'contests', 'charts', 'popular', 'ranking',
  'creators', 'creator', 'categories', 'category', 'new', 'live', 'upload', 'studio', 'premium', 'support', 'api', 'static',
  'l', 's', 'e', 'c', 'u', 'x', 'sitemap', 'robots.txt', 'favicon.ico', 'profile.php', 'public', 'local', 'tos', 'feedback',
]);

/** 第一段是帳號、其後最多只能接這幾種「主頁自己的分頁」（推特的回覆、媒體…）。 */
const X_TABS = new Set(['with_replies', 'media', 'highlights', 'articles', 'likes', 'superfollows']);

function segmentsOf(u: URL): string[] {
  return u.pathname.split('/').filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch { return s; } });
}

function oneAccountSegment(segs: string[], max = 1): boolean {
  return segs.length >= 1 && segs.length <= max && !SINGLE_SEGMENT_RESERVED.has(segs[0].toLowerCase());
}

/** 子網域型平台（a.fanbox.cc、店名.booth.pm）：必須是店家子網域，且網址只能是根目錄。 */
function subdomainRoot(host: string, base: string, segs: string[], notShop: string[] = ['www']): boolean {
  if (!host.endsWith('.' + base)) return false;
  const shop = host.slice(0, -(base.length + 1));
  return !notShop.includes(shop) && !shop.includes('.') && segs.length === 0;
}

type Rule = (u: URL, host: string, segs: string[]) => boolean;

const RULES: Record<string, Rule> = {
  'x.com': (_u, _h, s) => (oneAccountSegment(s, 2) && (s.length === 1 || X_TABS.has(s[1].toLowerCase()))) && /^\w{1,15}$/.test(s[0]),
  'twitter.com': (u, h, s) => RULES['x.com'](u, h, s),
  'pixiv.net': (_u, _h, s) => (s[0] && /^[a-z]{2}$/.test(s[0]) ? s.slice(1) : s)[0] === 'users' && /^\d+$/.test((s[0] === 'users' ? s : s.slice(1))[1] ?? ''),
  'fanbox.cc': (_u, h, s) => (h === 'www.fanbox.cc' ? s.length === 1 && s[0].startsWith('@') : subdomainRoot(h, 'fanbox.cc', s)),
  'facebook.com': (u, _h, s) => (s[0] === 'profile.php' ? s.length === 1 && /^\d{5,}$/.test(u.searchParams.get('id') ?? '') : oneAccountSegment(s)),
  'instagram.com': (_u, _h, s) => oneAccountSegment(s),
  'bsky.app': (_u, _h, s) => s.length === 2 && s[0] === 'profile',
  'threads.com': (_u, _h, s) => s.length === 1 && /^@[\w.]+$/.test(s[0]),
  'threads.net': (u, h, s) => RULES['threads.com'](u, h, s),
  'tiktok.com': (_u, _h, s) => s.length === 1 && /^@[\w.]+$/.test(s[0]),
  'youtube.com': (_u, _h, s) =>
    (/^@[^/]+$/.test(s[0] ?? '') && s.length <= 2) || (['channel', 'c', 'user'].includes(s[0]) && s.length >= 2 && s.length <= 3),
  'twitch.tv': (_u, _h, s) => oneAccountSegment(s),
  'plurk.com': (_u, _h, s) => oneAccountSegment(s),
  'weibo.com': (_u, _h, s) => (s.length === 2 && s[0] === 'u' && /^\d+$/.test(s[1])) || (s.length === 2 && s[0] === 'n') || (s.length === 1 && /^\d{5,}$/.test(s[0])),
  'bilibili.com': (_u, h, s) => h === 'space.bilibili.com' && s.length >= 1 && /^\d+$/.test(s[0]),
  'skeb.jp': (_u, _h, s) => s.length === 1 && /^@\w+$/.test(s[0]),
  'ci-en.net': (_u, _h, s) => s.length === 2 && s[0] === 'creator' && /^\d+$/.test(s[1]),
  'ci-en.dlsite.com': (u, h, s) => RULES['ci-en.net'](u, h, s),
  'patreon.com': (_u, _h, s) => (s.length === 2 && s[0] === 'c') || (s.length === 1 && !SINGLE_SEGMENT_RESERVED.has(s[0].toLowerCase())),
  'fantia.jp': (_u, _h, s) => s.length === 2 && s[0] === 'fanclubs' && /^\d+$/.test(s[1]),
  'ko-fi.com': (_u, _h, s) => oneAccountSegment(s),
  'tumblr.com': (_u, h, s) => (h === 'www.tumblr.com' ? oneAccountSegment(s) : subdomainRoot(h, 'tumblr.com', s)),
  'booth.pm': (_u, h, s) => subdomainRoot(h, 'booth.pm', s, ['www', 'accounts', 'api', 'manage', 'help', 'static', 'asset', 'assets', 'img', 's', 's2']),
  'gumroad.com': (_u, h, s) => subdomainRoot(h, 'gumroad.com', s),
  'soundcloud.com': (_u, _h, s) => oneAccountSegment(s),
  'artstation.com': (_u, _h, s) => oneAccountSegment(s),
  'linktr.ee': (_u, _h, s) => oneAccountSegment(s),
  'lit.link': (_u, _h, s) => oneAccountSegment(s.length === 2 && /^[a-z]{2}$/.test(s[0]) ? s.slice(1) : s),
  'portaly.cc': (_u, _h, s) => oneAccountSegment(s),
  'potofu.me': (_u, _h, s) => oneAccountSegment(s),
  'solo.to': (_u, _h, s) => oneAccountSegment(s),
  'taplink.cc': (_u, _h, s) => oneAccountSegment(s),
  'buymeacoffee.com': (_u, _h, s) => oneAccountSegment(s),
  'mastodon.social': (_u, _h, s) => s.length === 1 && /^@[\w.]+(?:@[\w.-]+)?$/.test(s[0]),
  'pawoo.net': (u, h, s) => RULES['mastodon.social'](u, h, s),
  'misskey.io': (u, h, s) => RULES['mastodon.social'](u, h, s),
  // 巴哈小屋：只有首頁（?owner= 或 /帳號）。創作、動態、好友等子頁（index_creation.php…）不是主頁
  'home.gamer.com.tw': (u, _h, s) =>
    (s.length === 1 && /^(?:homeindex\.php|profile\.php)$/i.test(s[0]) && !!u.searchParams.get('owner')) ||
    (s.length === 2 && s[0].toLowerCase() === 'profile' && s[1].toLowerCase() === 'index.php' && !!u.searchParams.get('owner')) ||
    (s.length === 1 && /^[\w-]+$/.test(s[0]) && !/\.php$/i.test(s[0])),
};

/** 已知「不是個人主頁」的巴哈其他子網域（討論板、動畫瘋…），整個網域都不放行。 */
const BAHAMUT_NON_HOME = /^(?:www|forum|ani|acg|user|m|gnn|wall|haha|guild|i)\.gamer\.com\.tw$|^gamer\.com\.tw$/;

/**
 * 目前分頁是不是可以讓擴充使用的個人主頁。
 * 已知平台：必須符合該平台的主頁形狀。其他網站：回 true（交給後續流程與連結清單過濾）。
 */
export function isProfilePageUrl(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (BAHAMUT_NON_HOME.test(host)) return false;
  const segs = segmentsOf(u);
  // 完整主機名（home.gamer.com.tw、space.bilibili.com）先找，找不到再逐段往上找註冊網域
  const parts = host.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts.slice(i).join('.');
    const rule = RULES[key];
    if (rule) return rule(u, u.hostname.toLowerCase(), segs);
  }
  return true;
}
