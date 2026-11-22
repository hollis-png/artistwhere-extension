import type { ProfileData } from '../shared/types';
import { DEFAULT_CONFIG, readCachedConfig, type ExtensionConfig } from '../shared/config';

// 雜訊網域與假名稱由網站端下發，彈出視窗負責更新快取；沒有快取就用內建預設
let cfg: ExtensionConfig = DEFAULT_CONFIG;

const ERROR_TITLE = /(^|\s)404(\s|$)|\bnot found\b|找不到(頁面|此頁|網頁)|頁面不存在|無法找到此/i;

const AVATAR_HINTS = [
  'img[alt*="avatar" i]', 'img[alt*="profile" i]', 'img[alt*="icon" i]',
  'img[alt*="大頭貼" i]', 'img[alt*="頭像" i]',
  'img[class*="avatar" i]', 'img[class*="profile-pic" i]', 'img[class*="profile-img" i]',
  'img[id*="avatar" i]', 'img[id*="profile" i]',
  'img[data-testid*="avatar" i]', 'img[data-testid*="profile" i]',
];

function genericAvatar(): string {
  const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
  const twitterImage = document.querySelector('meta[name="twitter:image"]')?.getAttribute('content');
  if (ogImage && !ogImage.includes('default')) return ogImage;
  if (twitterImage) return twitterImage;
  for (const sel of AVATAR_HINTS) {
    try {
      const img = document.querySelector(sel) as HTMLImageElement | null;
      if (img?.src && img.naturalWidth >= 48) return img.src;
    } catch { /* ignore */ }
  }
  return '';
}

function genericLinks(currentHost: string): string[] {
  const links: string[] = [];
  document.querySelectorAll('a[href]').forEach(a => {
    const href = (a as HTMLAnchorElement).href;
    if (!href || !href.startsWith('http')) return;
    try {
      const u = new URL(href);
      const host = u.hostname.replace(/^www\./, '');
      if (host === currentHost) return;
      // 同站子網域（例如 patreon.com 頁面裡的 support./privacy.patreon.com 頁尾連結）不是本人的連結
      if (host.endsWith('.' + currentHost) || currentHost.endsWith('.' + host)) return;
      if (cfg.noiseDomains.some(d => host.includes(d))) return;
      const ext = u.pathname.split('.').pop()?.toLowerCase() ?? '';
      if (['png','jpg','jpeg','gif','webp','css','js','svg','woff','woff2'].includes(ext)) return;
      if (u.pathname === '/' || u.pathname === '') return;
      const cleaned = u.origin + u.pathname.replace(/\/$/, '');
      if (!links.includes(cleaned)) links.push(cleaned);
    } catch { /* ignore */ }
  });
  return links;
}

interface SpecializedResult {
  name?: string;
  avatarUrl: string;
  bioLinks: string[];
  matched: boolean;
}

async function trySpecialized(currentHost: string): Promise<SpecializedResult> {
  let avatarUrl = '';
  let name = '';
  const bioLinks: string[] = [];

  function add(url: string) {
    if (url && !bioLinks.includes(url)) bioLinks.push(url);
  }

  if (currentHost.includes('myacg.com.tw')) {
    const sellerImg = document.querySelector('.introduction_content img, a > img[src*="cdn.myacg.com.tw"]') as HTMLImageElement | null;
    if (sellerImg?.src) avatarUrl = sellerImg.src;
    const introText = (document.querySelector('.introduction_text_content') as HTMLElement)?.innerText || '';
    for (const raw of introText.match(/https?:\/\/[^\s,，、。]+/g) || []) {
      try { const u = new URL(raw.replace(/[.]+$/, '')); if (!u.hostname.includes('myacg.com.tw')) add(u.toString().replace(/\/$/, '')); } catch {}
    }
  } else if (currentHost.includes('lit.link')) {
    const img = document.querySelector('img[alt="profile icon"]') as HTMLImageElement | null;
    if (img?.src) avatarUrl = img.src;
    document.querySelectorAll('main a[href]').forEach(a => {
      const href = (a as HTMLAnchorElement).href;
      if (href?.startsWith('http') && !href.includes('lit.link') && !href.includes('prd.storage.lit.link') && !href.includes('prd.resource-api.lit.link')) add(href.replace(/\/$/, ''));
    });
  } else if (currentHost.includes('linktr.ee')) {
    const img = document.querySelector('img[data-testid="ProfileImage"]') as HTMLImageElement | null;
    if (img?.src) avatarUrl = img.src;
    document.querySelectorAll('a[data-testid="LinkClickTriggerLink"]').forEach(a => {
      const href = (a as HTMLAnchorElement).href;
      if (href?.startsWith('http') && !href.includes('linktr.ee')) {
        try { add(new URL(href).toString().replace(/\/$/, '')); } catch {}
      }
    });
  } else if (currentHost.includes('bsky.app')) {
    const img = document.querySelector('img[src*="cdn.bsky.app/img/avatar"]') as HTMLImageElement | null;
    if (img?.src) avatarUrl = img.src;
    document.querySelector('[data-testid="profileHeaderDescription"]')?.querySelectorAll('a[href]').forEach(a => {
      const href = (a as HTMLAnchorElement).href;
      if (href?.startsWith('http') && !href.includes('bsky.app')) add(href);
    });
  } else if (currentHost.includes('plurk.com')) {
    const img = document.querySelector('#profile_pic, img.profile-pic') as HTMLImageElement | null;
    if (img?.src) avatarUrl = img.src;
    document.querySelector('#about_me')?.querySelectorAll('a[href]').forEach(a => {
      const href = (a as HTMLAnchorElement).href;
      if (href?.startsWith('http') && !href.includes('plurk.com') && !href.startsWith('mailto:')) add(href);
    });
  } else if (currentHost.includes('threads.com') || currentHost.includes('threads.net')) {
    const img = document.querySelector('img[alt$="的大頭貼照"], img[alt$="\'s profile picture"]') as HTMLImageElement | null;
    if (img?.src) avatarUrl = img.src;
    const username = window.location.pathname.match(/^\/@?([\w.]+)/)?.[1]?.toLowerCase() || '';
    document.querySelectorAll('a[href*="l.threads.com"]').forEach(a => {
      try { const encoded = new URL((a as HTMLAnchorElement).href).searchParams.get('u'); if (encoded) { const u = new URL(encoded); if (!/^https?:$/.test(u.protocol)) return; ['fbclid','utm_source','utm_medium','utm_campaign','igsh','igshid','e'].forEach(p => u.searchParams.delete(p)); add(u.toString().replace(/\/$/, '')); } } catch {}
    });
    const threadsNoise = ['threads.com', 'threads.net', 'l.threads.com', 'help.instagram.com', 'about.instagram.com', 'about.meta.com'];
    document.querySelectorAll('a[href^="http"][target="_blank"]').forEach(a => {
      const href = (a as HTMLAnchorElement).href;
      if (href && !threadsNoise.some(d => href.includes(d))) add(href.replace(/\/$/, ''));
    });
    document.querySelectorAll('a[href^="/@"]').forEach(a => {
      const m = ((a as HTMLAnchorElement).getAttribute('href') || '').match(/^\/@([\w.]+)\/?$/);
      if (m && m[1].toLowerCase() !== username) add(`https://www.threads.com/@${m[1]}`);
    });
  } else if (currentHost.includes('portaly.cc')) {
    const img = document.querySelector('img[src*="img.portaly.cc"]') as HTMLImageElement | null;
    if (img?.src) avatarUrl = img.src;
    document.querySelectorAll('a[href][target="_blank"]').forEach(a => {
      const href = (a as HTMLAnchorElement).href;
      if (href?.startsWith('http') && !href.includes('portaly.cc') && !href.startsWith('mailto:')) add(href);
    });
  } else if (currentHost.includes('doujin.com.tw')) {
    const img = document.querySelector('.user_img img') as HTMLImageElement | null;
    if (img?.src) avatarUrl = img.src;
    document.querySelectorAll('.authors_social_links a[href]').forEach(a => {
      const href = (a as HTMLAnchorElement).href;
      if (href?.startsWith('http') && !href.includes('doujin.com.tw')) add(href);
    });
  } else if (currentHost.includes('potofu.me')) {
    const img = document.querySelector('img[alt="User Icon"]') as HTMLImageElement | null;
    if (img?.src) avatarUrl = img.src;
    document.querySelectorAll('a[target="_blank"][rel*="nofollow"]').forEach(a => {
      const href = (a as HTMLAnchorElement).href;
      if (href?.startsWith('http') && !href.includes('potofu.me')) add(href);
    });
  } else if (currentHost.includes('booth.pm')) {
    const bg = document.querySelector('.avatar-image') as HTMLElement | null;
    if (bg) { const m = bg.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/); if (m?.[1]) avatarUrl = m[1]; }
    document.querySelector('.booth-description')?.querySelectorAll('a[href]').forEach(a => {
      const href = (a as HTMLAnchorElement).href;
      if (href?.startsWith('http') && !href.includes('booth.pm') && !href.includes('/conversations')) add(href);
    });
  } else if (currentHost.includes('nekolive.net')) {
    // 頁面的 og:image 是宣傳橫幅，真正的頭像是 .user-avatar；標題「榮初涵斗內 -- Nekolive…」要去掉「斗內」
    const img = document.querySelector('img.user-avatar') as HTMLImageElement | null;
    if (img?.src) avatarUrl = img.src;
    name = (document.title.split(/\s*--\s*/)[0] || '').replace(/斗內$/, '').trim();
    document.querySelectorAll('a[href^="http"]').forEach(a => {
      const href = (a as HTMLAnchorElement).href;
      if (!href.includes('nekolive.net')) add(href.replace(/\/$/, ''));
    });
  } else if (currentHost.includes('ganknow.com')) {
    // 單頁應用，標題只有「xxx's profile」；頭像的 alt 是「Avatar of 名稱」
    const img = document.querySelector('img[alt^="Avatar of"]') as HTMLImageElement | null;
    if (img?.src) avatarUrl = img.src;
    name = (img?.alt || '').replace(/^Avatar of\s*/, '').trim();
    // 只讀個人頁本體（article.page-nickname）；頁尾是 Gank 官方的 App 與社群連結，不是繪師的
    document.querySelector('article.page-nickname')?.querySelectorAll('a[href^="http"]').forEach(a => {
      const href = (a as HTMLAnchorElement).href;
      if (!/ganknow\.com|googleusercontent\.com/.test(href)) add(href.replace(/\/$/, ''));
    });
  } else if (currentHost.includes('patreon.com')) {
    const img = document.querySelector('img[data-tag="creator-public-page-avatar"]') as HTMLImageElement | null;
    if (img?.src) avatarUrl = img.src;
    document.querySelectorAll('a[data-tag*="social"]').forEach(a => {
      const href = (a as HTMLAnchorElement).href;
      if (href?.startsWith('http') && !href.includes('patreon.com')) add(href);
    });
  } else if (currentHost.includes('twitch.tv')) {
    const img = (document.querySelector('#offline-channel-main-content img.tw-image-avatar') || document.querySelector('main img.tw-image-avatar')) as HTMLImageElement | null;
    if (img?.src) avatarUrl = img.src.replace('-70x70.', '-300x300.');
    document.querySelectorAll('.social-media-link a[href]').forEach(a => {
      const href = (a as HTMLAnchorElement).href;
      if (href?.startsWith('http') && !href.includes('twitch.tv')) add(href);
    });
  } else if (currentHost.includes('youtube.com')) {
    const img = document.querySelector('#page-header img[src*="yt3.googleusercontent.com"]') as HTMLImageElement | null;
    if (img?.src) avatarUrl = img.src;
    // #page-header 的 redirect 連結是頻道標頭上直接顯示的那一個（不必展開「顯示更多」就看得到）
    const ytLinks = document.querySelectorAll('yt-channel-external-link-view-model a[href], #links-section a[href], #page-header a[href*="youtube.com/redirect"]');
    if (ytLinks.length === 0) {
      console.warn('[DeadLive] YouTube 連結區塊未展開，請先點擊「顯示更多」再重新操作');
    }
    ytLinks.forEach(a => {
      let href = (a as HTMLAnchorElement).href;
      if (!href?.startsWith('http')) return;
      if (href.includes('youtube.com/redirect')) { try { href = new URL(href).searchParams.get('q') || ''; } catch { return; } }
      if (!href || !/^https?:\/\//i.test(href) || href.includes('youtube.com') || href.includes('youtu.be')) return;
      try { const u = new URL(href); ['fs','s','utm_source','utm_medium','utm_campaign'].forEach(p => u.searchParams.delete(p)); add(u.toString().replace(/\/$/, '')); } catch {}
    });
  } else if (currentHost.includes('shopee.tw')) {
    const img = document.querySelector('img.shopee-avatar__img') as HTMLImageElement | null;
    if (img?.src) avatarUrl = img.src;
    const shopDesc = (document.querySelector('.shop-page-shop-description') as HTMLElement)?.innerText || '';
    for (const raw of shopDesc.match(/https?:\/\/[^\s,，、。]+/g) || []) {
      try { const u = new URL(raw.replace(/[.]+$/, '')); if (!u.hostname.includes('shopee')) add(u.toString().replace(/\/$/, '')); } catch {}
    }
  } else if (currentHost.includes('gamer.com.tw')) {
    document.querySelectorAll('.card-padding-bolck a[href]').forEach(a => {
      let href = (a as HTMLAnchorElement).href;
      if (!href?.startsWith('http')) return;
      if (href.includes('ref.gamer.com.tw/redir.php')) { try { href = new URL(href).searchParams.get('url') || ''; } catch { return; } }
      if (href && /^https?:\/\//i.test(href) && !href.includes('gamer.com.tw') && !href.includes('piliapp.com')) add(href);
    });
  } else if (currentHost.includes('misskey.io')) {
    const img = document.querySelector('img[src*="avatar"]') as HTMLImageElement | null;
    if (img?.src) avatarUrl = img.src;
    document.querySelector('.description')?.querySelectorAll('a[href]').forEach(a => {
      const href = (a as HTMLAnchorElement).href;
      if (href?.startsWith('http') && !href.includes('misskey.io')) add(href);
    });
  } else if (currentHost.includes('fantia.jp')) {
    const img = document.querySelector('.fanclub-show-header img.img-circle') as HTMLImageElement | null;
    if (img?.src) avatarUrl = img.src;
    ['.fanclub-comment', '.fanclub-comment + .btns', '.fanclub-comment ~ .btns'].forEach(sel => {
      document.querySelector(sel)?.querySelectorAll('a[href]').forEach(a => {
        const href = (a as HTMLAnchorElement).href;
        if (href?.startsWith('http') && !href.includes('fantia.jp')) add(href);
      });
    });
  } else if (window.location.hostname.endsWith('fanbox.cc')) {
    for (const el of document.querySelectorAll('div[style*="background-image"]')) {
      const bgImg = (el as HTMLElement).style.backgroundImage;
      const m = bgImg.match(/url\(["']?(.*?)["']?\)/);
      if (m?.[1] && m[1].includes('/icon/') && m[1].includes('pximg.net')) {
        avatarUrl = m[1];
        break;
      }
    }
    document.querySelector('div[class*="UserSnsIcons"]')?.querySelectorAll('a[href]').forEach(a => {
      const href = (a as HTMLAnchorElement).href;
      if (href?.startsWith('http')) add(href);
    });
  } else {
    return { avatarUrl, bioLinks, matched: false };
  }

  return { name, avatarUrl, bioLinks, matched: true };
}

async function extractGenericProfile(): Promise<ProfileData | null> {
  const isSPA = ['youtube.com', 'twitch.tv', 'twitter.com', 'x.com'].some(d => window.location.hostname.includes(d));
  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
  const twitterTitle = document.querySelector('meta[name="twitter:title"]')?.getAttribute('content');
  const titleTag = document.title;
  const nameSource = isSPA ? (titleTag || ogTitle || twitterTitle || '') : (ogTitle || twitterTitle || titleTag || '');
  const name = nameSource.replace(/\s*[-|–—｜].*/g, '').trim();

  if (!name) return null;

  // 錯誤頁（404 Not Found）與登入牆的佔位標題（只有網站名）不是個人頁，
  // 否則會把「404 Not Found」「Threads」當成繪師名稱存進資料庫。
  if (ERROR_TITLE.test(titleTag) || ERROR_TITLE.test(name) || cfg.placeholderNames.includes(name.toLowerCase())) return null;

  const profileUrl = window.location.href.split('?')[0].replace(/\/$/, '');
  const currentHost = window.location.hostname.replace(/^www\./, '').replace(/^m\./, '');

  const specialized = await trySpecialized(currentHost);

  if (specialized.matched) {
    if (!specialized.avatarUrl && specialized.bioLinks.length === 0) {
      console.warn(`[DeadLive] ⚠️ ${currentHost} 專屬 handler 回傳空結果，可能選擇器已失效。自動退化到通用 handler。`);
      return {
        name,
        avatarUrl: genericAvatar(),
        profileUrl,
        bioLinks: genericLinks(currentHost),
      };
    }

    if (!specialized.avatarUrl) {
      specialized.avatarUrl = genericAvatar();
    }

    return { name: specialized.name || name, avatarUrl: specialized.avatarUrl, profileUrl, bioLinks: specialized.bioLinks };
  }

  return {
    name,
    avatarUrl: genericAvatar(),
    profileUrl,
    bioLinks: genericLinks(currentHost),
  };
}

// 這支腳本現在是「使用者點開擴充功能時」才由 popup 注入，同一個分頁可能被注入好幾次。
// 每次注入前先移除上一次留下的監聽器，才不會一個請求收到好幾份回應。
type MessageListener = (message: { type?: string }, sender: unknown, sendResponse: (r: unknown) => void) => boolean | void;
const genericWindow = window as unknown as { __deadliveGenericListener?: MessageListener };
if (genericWindow.__deadliveGenericListener) {
  chrome.runtime.onMessage.removeListener(genericWindow.__deadliveGenericListener);
}
const genericListener: MessageListener = (message, _sender, sendResponse) => {
  if (message.type === 'GET_PROFILE') {
    readCachedConfig().then(c => { cfg = c; return extractGenericProfile(); }).then(data => {
      if (data) {
        sendResponse({ type: 'PROFILE_DATA', data });
      } else {
        sendResponse({ type: 'NOT_PROFILE_PAGE' });
      }
    });
    return true;
  }
};
genericWindow.__deadliveGenericListener = genericListener;
chrome.runtime.onMessage.addListener(genericListener);
