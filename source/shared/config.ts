// 抓取規則（哪些網域忽略、哪些不能抓、連結怎麼分類）。內建一份預設，啟動時向網站要最新的並快取，
// 這樣調整規則只要改網站端，不必重新發版。遠端只能給「資料」（網域清單、標籤），不能給程式碼；
// 收到的內容一律逐欄驗證，格式不對的欄位退回內建預設。
export interface LinkCategory {
  id: string;
  label: string;
  emoji: string;
  domains: string[];
}

/** 一條「這個網站上哪些網址不是帳號」的規則，全是資料（沒有程式碼、沒有正規表示式）。 */
export interface NonAccountRule {
  host: string;
  /** 路徑第一段（pixiv 可略過語系前綴）等於其中之一 */
  firstSegments?: string[];
  /** 路徑任何一段等於其中之一 */
  segments?: string[];
  /** 路徑（小寫）包含其中之一 */
  contains?: string[];
  /** 路徑（去掉結尾斜線、小寫）正好等於其中之一 */
  exactPaths?: string[];
  /** 只要有路徑就不是帳號（例如 youtu.be 是影片短網址） */
  anyPath?: boolean;
  /** 路徑第一段可以是語系前綴（en、zh_tw…），比對時略過 */
  skipLang?: boolean;
}

export interface NonAccountConfig {
  /** 整個網域都不是繪師帳號（雲端硬碟、表單、短網址…） */
  hosts: string[];
  rules: NonAccountRule[];
  /** 平台自己的官方帳號，格式「網域/帳號」小寫 */
  officials: string[];
}

export interface ExtensionConfig {
  /** 不能由伺服器代抓的網域（要在使用者的瀏覽器分頁裡展開） */
  unscrapeAble: string[];
  /** 不是繪師帳號的網域（客服、表單、金流…），發現的連結裡直接略過 */
  ignoreDomains: string[];
  /** 通用抓取腳本略過的雜訊網域（子字串比對） */
  noiseDomains: string[];
  /** 登入牆或錯誤頁會出現的假名稱，不當成繪師名稱 */
  placeholderNames: string[];
  categories: LinkCategory[];
  nonAccount: NonAccountConfig;
}

export const DEFAULT_CONFIG: ExtensionConfig = {
  unscrapeAble: ['twitter.com', 'x.com', 'facebook.com', 'fb.com', 'instagram.com', 'patreon.com', 'ci-en.dlsite.com', 'ci-en.net', 'dlsite.com', 'gamer.com.tw', 'gumroad.com'],
  ignoreDomains: ['line.me', 'lin.ee', 'gmail.com', 'ecpay.com.tw', 'opay.tw', 'myship.7-11.com.tw', 'docs.google.com', 'drive.google.com', 'forms.gle', 'sites.google.com'],
  noiseDomains: [
    'cookiebot.com', 'cookie-script.com', 'onesignal.com', 'sentry.io',
    'stripe.com', 'cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com',
    'apps.apple.com', 'play.google.com', 'cdn.', 'api.', 'consent.',
    'gravatar.com', 'wp.com', 'w.org', 'schema.org',
    'help.instagram.com', 'about.instagram.com', 'about.meta.com',
    'piliapp.com',
  ],
  placeholderNames: ['threads', 'instagram', 'facebook', 'tiktok', 'log in', 'login', 'sign in', '登入'],
  nonAccount: {
    hosts: ['drive.google.com', 'docs.google.com', 'forms.gle', 'myship.7-11.com.tw', 'goo.gl', 's.shopee.tw', 'gmail.com', 'ecpay.com.tw', 'opay.tw'],
    rules: [
      { host: 'line.me', firstSegments: ['oauth2'], contains: ['/r/msg', '/r/share'] },
      { host: 'store.line.me', contains: ['/stickershop/product/', '/emojishop/product/', '/themeshop/product/'] },
      { host: 'x.com', segments: ['status', 'intent', 'share', 'hashtag', 'search'], contains: ['favicon'] },
      { host: 'twitter.com', segments: ['status', 'intent', 'share', 'hashtag', 'search'], contains: ['favicon'] },
      { host: 'instagram.com', firstSegments: ['p', 'reel', 'reels', 'explore', 'stories', 'tv'] },
      { host: 'facebook.com', firstSegments: ['events', 'sharer', 'posts', 'photo', 'photos', 'watch', 'story.php', 'permalink.php'], contains: ['/share/p/', '/share/v/', '/share/r/'] },
      { host: 'youtube.com', firstSegments: ['embed', 'watch', 'shorts', 'playlist', 'results', 'live'] },
      { host: 'youtu.be', anyPath: true },
      { host: 'pixiv.net', firstSegments: ['artworks', 'tags', 'novel', 'ranking'], skipLang: true },
      { host: 'myacg.com.tw', contains: ['goods_detail'] },
      { host: 'dlsite.com', contains: ['/work/'] },
      { host: 'jvid.com', firstSegments: ['v'] },
      { host: 'dmm.co.jp', exactPaths: ['/dc/doujin'] },
      { host: 'melonbooks.co.jp', contains: ['/detail/'] },
    ],
    officials: ['plurk.com/clibo', 'facebook.com/artstationhq', 'facebook.com/behance', 'instagram.com/artstationhq', 'twitter.com/artstationhq', 'x.com/artstationhq', 'instagram.com/behance'],
  },
  categories: [
    { id: 'social', label: '社群帳號', emoji: '🎨', domains: [
      'twitter.com', 'x.com', 'facebook.com', 'fb.com', 'instagram.com', 'threads.com', 'threads.net',
      'plurk.com', 'bsky.app', 'misskey.io', 'pawoo.net', 'mastodon.social', 'tumblr.com',
      'pixiv.net', 'pixiv.me', 'home.gamer.com.tw', 'gamer.com.tw',
    ] },
    { id: 'subscribe', label: '贊助/訂閱', emoji: '💰', domains: [
      'fanbox.cc', 'fantia.jp', 'ganknow.com', 'patreon.com', 'ko-fi.com', 'buymeacoffee.com', 'ci-en.dlsite.com', 'ci-en.net',
    ] },
    { id: 'shop', label: '通販/賣場', emoji: '🛒', domains: [
      'myacg.com.tw', 'doujin.com.tw', 'booth.pm', 'clibo.tw', 'furuke.com', 'skeb.jp',
      'dlsite.com', 'dmm.co.jp', 'dmm.com', 'gumroad.com', 'melonbooks.co.jp', 'cxc.today', 'shopee.tw', 'otaku-eden.com',
    ] },
    { id: 'media', label: '直播/影音', emoji: '🎬', domains: [
      'youtube.com', 'youtu.be', 'twitch.tv', 'nekolive.net', 'soundcloud.com', 'bilibili.com', 'tiktok.com',
    ] },
    { id: 'aggregator', label: '連結整合', emoji: '🔗', domains: [
      'linktr.ee', 'lit.link', 'portaly.cc', 'potofu.me', 'solo.to', 'taplink.cc', 'fanme.link',
    ] },
    { id: 'community', label: '社群/通訊', emoji: '💬', domains: [
      'discord.gg', 'discord.com', 'line.me', 'lin.ee', 'clusters.tw',
    ] },
  ],
};

const MAX_ITEMS = 400;
const DOMAIN = /^[a-z0-9][a-z0-9.-]{0,99}$/i;

function stringList(raw: unknown, ok: (s: string) => boolean): string[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_ITEMS) return null;
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string' || !ok(v)) return null;
    out.push(v);
  }
  return out;
}

function categoryList(raw: unknown): LinkCategory[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 20) return null;
  const out: LinkCategory[] = [];
  for (const c of raw) {
    if (!c || typeof c !== 'object') return null;
    const { id, label, emoji, domains } = c as Record<string, unknown>;
    const list = stringList(domains, s => DOMAIN.test(s));
    if (typeof id !== 'string' || !/^[a-z]{1,20}$/.test(id) || typeof label !== 'string' || label.length === 0 || label.length > 20
      || typeof emoji !== 'string' || emoji.length === 0 || emoji.length > 8 || !list) return null;
    out.push({ id, label, emoji, domains: list });
  }
  return out;
}

const SEGMENT = /^[\w.\-]{1,40}$/;

function segmentList(raw: unknown): string[] | undefined | null {
  if (raw === undefined) return undefined;
  return stringList(raw, s => SEGMENT.test(s));
}

function nonAccountConfig(raw: unknown): NonAccountConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const hosts = stringList(r.hosts, s => DOMAIN.test(s));
  const officials = stringList(r.officials, s => /^[a-z0-9.-]+\/[\w.\-]+$/.test(s));
  if (!hosts || !officials || !Array.isArray(r.rules) || r.rules.length > 100) return null;
  const rules: NonAccountRule[] = [];
  for (const x of r.rules) {
    if (!x || typeof x !== 'object') return null;
    const o = x as Record<string, unknown>;
    if (typeof o.host !== 'string' || !DOMAIN.test(o.host)) return null;
    const firstSegments = segmentList(o.firstSegments);
    const segments = segmentList(o.segments);
    const contains = o.contains === undefined ? undefined : stringList(o.contains, s => s.length > 0 && s.length <= 60 && !/[\u0000-\u001f]/.test(s));
    const exactPaths = o.exactPaths === undefined ? undefined : stringList(o.exactPaths, s => /^\/[\w\-./]{0,80}$/.test(s));
    if (firstSegments === null || segments === null || contains === null || exactPaths === null) return null;
    rules.push({
      host: o.host.toLowerCase(),
      ...(firstSegments ? { firstSegments } : {}), ...(segments ? { segments } : {}),
      ...(contains ? { contains } : {}), ...(exactPaths ? { exactPaths } : {}),
      ...(o.anyPath === true ? { anyPath: true } : {}), ...(o.skipLang === true ? { skipLang: true } : {}),
    });
  }
  return { hosts, rules, officials };
}

const LANG_PREFIX = new Set(['en', 'zh', 'zh_tw', 'ja', 'ko']);

/**
 * 這個網址是不是「不是帳號」（商品頁、貼文、雲端硬碟、網站首頁…）。規則來自 cfg，跟伺服器的過濾一致；
 * 擴充用它把這類連結歸到「非帳號」並預設不勾選。
 */
export function isNonAccountByRules(url: string, cfg: ExtensionConfig): boolean {
  const raw = url.trim();
  if (/[<>\s]/.test(raw) || /:$/.test(raw)) return true;
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  const path = u.pathname;
  const lower = path.replace(/\/+$/, '').toLowerCase();
  const bare = (path === '/' || path === '') && !u.search;
  const na = cfg.nonAccount;

  if (/%3f/i.test(path) || /%3c|%3e/i.test(path)) return true;
  if (na.hosts.includes(host)) return true;
  if (na.officials.includes(`${host}${lower}`)) return true;
  // 巴哈姆特：只有某個人的小屋（?owner= 或 /帳號）是帳號；站內其他網址（導覽、登入、信箱、討論板、小屋的設定與子頁…）都不是
  if (host === 'home.gamer.com.tw') return !((u.searchParams.get('owner') && /^[\w-]+$/.test(u.searchParams.get('owner') ?? '')) || (/^\/[\w-]+\/?$/.test(path) && !/^\/(?:setting|profile|creation|sticker|guild|static|assets|img)\/?$/i.test(path)));
  if (host === 'gamer.com.tw' || host.endsWith('.gamer.com.tw')) return true;

  const segs = lower.split('/').filter(Boolean);
  for (const rule of na.rules) {
    if (rule.host !== host) continue;
    if (rule.anyPath && !bare) return true;
    const first = rule.skipLang && segs.length > 1 && LANG_PREFIX.has(segs[0]) ? segs[1] : segs[0];
    if (rule.firstSegments?.includes(first ?? '')) return true;
    if (rule.segments?.some(sg => segs.includes(sg))) return true;
    if (rule.contains?.some(c => lower.includes(c.toLowerCase()) || (path.toLowerCase().includes(c.toLowerCase())))) return true;
    if (rule.exactPaths?.includes(lower)) return true;
  }
  if (!bare) return false;
  // 已知平台的網站首頁（clibo.tw/、plurk.com/）不是某個人的帳號
  return cfg.categories.some(c => c.domains.includes(host));
}

/** 逐欄驗證遠端給的規則，哪一欄格式不對就用 fallback 的那一欄；整體不是物件就全用 fallback。 */
export function parseConfig(raw: unknown, fallback: ExtensionConfig = DEFAULT_CONFIG): ExtensionConfig {
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as Record<string, unknown>;
  return {
    unscrapeAble: stringList(r.unscrapeAble, s => DOMAIN.test(s)) ?? fallback.unscrapeAble,
    ignoreDomains: stringList(r.ignoreDomains, s => DOMAIN.test(s)) ?? fallback.ignoreDomains,
    noiseDomains: stringList(r.noiseDomains, s => DOMAIN.test(s)) ?? fallback.noiseDomains,
    placeholderNames: stringList(r.placeholderNames, s => s.length > 0 && s.length <= 40) ?? fallback.placeholderNames,
    categories: categoryList(r.categories) ?? fallback.categories,
    nonAccount: nonAccountConfig(r.nonAccount) ?? fallback.nonAccount,
  };
}

const STORAGE_KEY = 'ruleConfig';
const TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 2000;

interface Cached { fetchedAt: number; config: ExtensionConfig }

async function readCache(): Promise<Cached | null> {
  try {
    const got = await chrome.storage.local.get(STORAGE_KEY);
    const c = got[STORAGE_KEY] as { fetchedAt?: unknown; config?: unknown } | undefined;
    if (!c || typeof c.fetchedAt !== 'number') return null;
    return { fetchedAt: c.fetchedAt, config: parseConfig(c.config) };
  } catch {
    return null;
  }
}

/** 內容腳本用：只讀快取（由彈出視窗負責更新），沒有就用內建預設。 */
export async function readCachedConfig(): Promise<ExtensionConfig> {
  return (await readCache())?.config ?? DEFAULT_CONFIG;
}

/** 彈出視窗用：快取還新就直接用；過期就向網站要，要不到（離線、逾時、格式錯）就用舊快取，再沒有就用內建預設。 */
export async function loadConfig(apiBase: string): Promise<ExtensionConfig> {
  const cached = await readCache();
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.config;
  try {
    const res = await fetch(`${apiBase}/api/extension-config`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(String(res.status));
    const config = parseConfig(await res.json(), cached?.config ?? DEFAULT_CONFIG);
    try { await chrome.storage.local.set({ [STORAGE_KEY]: { fetchedAt: Date.now(), config } }); } catch { /* 寫不進去就下次再要 */ }
    return config;
  } catch {
    return cached?.config ?? DEFAULT_CONFIG;
  }
}
