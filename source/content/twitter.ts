import type { ProfileData } from '../shared/types';

function resolveTcoUrl(url: string): Promise<string | null> {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'RESOLVE_TCO_URL', url }, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(response?.resolvedUrl ?? null);
    });
  });
}

// X 改版後的個人頁沒有 data-testid（UserName、UserAvatar-Container 等都不見了）。
// 新版的辦法：頭像連結 /帳號/photo 與「正在跟隨」連結都在個人檔案的標頭區塊裡，從頭像連結往上找到同時含有「正在跟隨」連結的那一層，就是標頭；
// 名稱取自頁面標題「名稱 (@帳號) / X」。
function findNewLayoutHeader(lowerUsername: string): Element | null {
  const photo = Array.from(document.querySelectorAll('a[href$="/photo"]'))
    .find(a => (a.getAttribute('href') ?? '').toLowerCase() === `/${lowerUsername}/photo`);
  let node: Element | null = photo?.parentElement ?? null;
  for (let i = 0; node && i < 10; i++, node = node.parentElement) {
    const hasFollowing = Array.from(node.querySelectorAll('a[href$="/following"]'))
      .some(a => (a.getAttribute('href') ?? '').toLowerCase() === `/${lowerUsername}/following`);
    if (hasFollowing) return node;
  }
  return null;
}

function nameFromTitle(): string {
  return /^(.*)\s\(@[^)]+\)\s\/\sX$/.exec(document.title.trim())?.[1]?.trim() ?? '';
}

async function extractTwitterProfile(): Promise<ProfileData | null> {
  const username = window.location.pathname.split('/').filter(Boolean)[0];
  const userNameEl = document.querySelector('[data-testid="UserName"]');
  const newHeader = userNameEl || !username ? null : findNewLayoutHeader(username.toLowerCase());
  if (!userNameEl && !newHeader) return null;

  const name = userNameEl ? (userNameEl.querySelectorAll('span')[0]?.textContent?.trim() ?? '') : nameFromTitle();

  let avatarUrl = '';

  function pickAvatar(root: Element | Document): string {
    const img = root.querySelector('img[src*="pbs.twimg.com/profile_images"]') as HTMLImageElement | null;
    if (img?.src) return img.src.replace(/_(?:normal|200x200|bigger|reasonably_small)\./, '_400x400.');
    const bgDiv = root.querySelector('[style*="profile_images"]') as HTMLElement | null;
    if (bgDiv) {
      const m = bgDiv.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/);
      if (m?.[1]) return m[1].replace(/_(?:normal|200x200|bigger|reasonably_small)\./, '_400x400.');
    }
    return '';
  }

  if (username) {
    // 網址裡的帳號大小寫可能和頁面上的不同（頁面用帳號本來的大小寫），所以不能直接拿網址的寫法去組選擇器，改成逐一比對小寫
    const lower = username.toLowerCase();
    const container = Array.from(document.querySelectorAll('[data-testid^="UserAvatar-Container-"]'))
      .find(el => el.getAttribute('data-testid')!.slice('UserAvatar-Container-'.length).toLowerCase() === lower);
    if (container) avatarUrl = pickAvatar(container);
    if (!avatarUrl) {
      const photoLink = Array.from(document.querySelectorAll('a[href$="/photo"]'))
        .find(a => (a.getAttribute('href') ?? '').toLowerCase() === `/${lower}/photo`);
      if (photoLink) avatarUrl = pickAvatar(photoLink);
    }
    // 最後手段：個人檔案頭像一定是頁面上第一張 profile_images（時間軸別人的頭像都在後面）
    if (!avatarUrl) {
      const main = document.querySelector('main') ?? document;
      avatarUrl = pickAvatar(main);
    }
  }

  const profileUrl = window.location.href.split('?')[0];

  const bioLinks: string[] = [];

  const lowerUsername = username?.toLowerCase() ?? '';
  const systemPaths = ['home', 'explore', 'search', 'notifications', 'messages', 'settings', 'i', 'tos', 'privacy', 'hashtag'];

  async function resolveLink(a: Element): Promise<string | null> {
    const href = (a as HTMLAnchorElement).href;
    if (!href || !href.startsWith('http')) return null;

    if (href.includes('t.co/')) {
      // X.com 現在的版面已經不提供 data-expanded-url/data-ultimate-url 屬性，顯示文字
      // 長度超過限制時也會被截斷成「…」（導致 query string 遺失，如 ?id=12345）。
      // 唯一可靠的方式是實際發請求解析 t.co 的跳轉目的地，交給背景 service worker
      // 處理（不受 content script 的頁面 CORS 限制）。
      const resolved = await resolveTcoUrl(href);
      if (resolved && resolved.startsWith('http') && !resolved.includes('t.co')) {
        return resolved.replace(/\/$/, '');
      }

      const text = a.textContent?.trim() ?? '';
      const cleaned = text.replace(/^https?:\/\//, '').replace(/…$/, '');
      if (cleaned && !cleaned.includes('t.co')) {
        return 'https://' + cleaned;
      }
      return null;
    }

    if (href.includes('twitter.com') || href.includes('x.com')) {
      try {
        const u = new URL(href);
        const target = u.pathname.split('/').filter(Boolean)[0]?.toLowerCase();
        if (!target || target === lowerUsername) return null;
        if (systemPaths.includes(target)) return null;
        return `https://x.com/${target}`;
      } catch { return null; }
    }

    return href;
  }

  const headerItems = document.querySelector('[data-testid="UserProfileHeader_Items"]');
  if (headerItems) {
    for (const a of Array.from(headerItems.querySelectorAll('a[href]'))) {
      const url = await resolveLink(a);
      if (url && !bioLinks.includes(url)) bioLinks.push(url);
    }
  }

  // 新版版面：標頭區塊裡的所有連結（t.co 簡介連結、網址欄）逐一解析；站內連結（跟隨數、日期、主題標籤）resolveLink 會自動濾掉
  if (newHeader) {
    for (const a of Array.from(newHeader.querySelectorAll('a[href]'))) {
      const url = await resolveLink(a);
      if (url && !bioLinks.includes(url)) bioLinks.push(url);
    }
  }

  const userDescription = document.querySelector('[data-testid="UserDescription"]');
  if (userDescription) {
    for (const a of Array.from(userDescription.querySelectorAll('a[href]'))) {
      if ((a as Element).closest('.immersive-translate-target-wrapper')) continue;
      const url = await resolveLink(a);
      if (url && !bioLinks.includes(url)) bioLinks.push(url);
    }
  }

  return { name, avatarUrl, profileUrl, bioLinks };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_PROFILE') {
    extractTwitterProfile().then(data => {
      if (data && !data.avatarUrl && data.bioLinks.length === 0) {
        console.warn('[DeadLive] ⚠️ Twitter 專屬 handler 回傳空結果，選擇器可能已失效');
      }
      if (data) {
        sendResponse({ type: 'PROFILE_DATA', data });
      } else {
        sendResponse({ type: 'NOT_PROFILE_PAGE' });
      }
    });
    return true;
  }
  return true;
});
