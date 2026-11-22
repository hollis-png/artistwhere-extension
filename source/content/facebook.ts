import type { ProfileData } from '../shared/types';

const MAIL_HOSTS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.com.tw', 'outlook.com', 'hotmail.com',
  'icloud.com', 'proton.me', 'protonmail.com',
]);

function extractFacebookProfile(): ProfileData | null {
  const systemH1 = new Set([
    '通知', 'Notifications', 'Messenger', 'Facebook', '聊天室', '動態消息', 'Chats', 'News Feed', 'Watch', '首頁', 'Home',
    '個人詳細資料', 'About', 'Personal details', '連結', '聯絡資料', 'Links', 'Contact info',
    '相片', 'Photos', '影片', 'Videos', '好友', 'Friends', '更多', 'More', '摯友', 'Close Friends', '洞察報告', 'Insights',
    '全部', 'All',
  ]);
  const pathName = window.location.pathname.replace(/\//g, '').split('?')[0];
  let name = '';

  // 主要判斷依據：姓名旁邊一定有個指回自己個人頁面的連結（跟頭像用同一個
  // a[href$="/{pathName}"] 定位方式）。Facebook 現在常把姓名做成 role="button"
  // 的可點擊元素而非語意化標題，靠黑名單排除 h1/h2/[role="heading"] 治標不治本
  // ——每次都會冒出新的無關標題（通知、個人詳細資料、貼文作者、連結分頁…），
  // 因為真正的姓名元素常常根本不是標題。改成優先找「連到自己個人頁的連結」裡的文字。
  // 個人檔案型網址是 /profile.php?id=123，pathname 對所有人都一樣（profile.php），
  // 真正的身分在 id 參數裡；不能只用 pathName 當定位依據，否則會抓到別人的連結。
  const profileId = window.location.pathname === '/profile.php'
    ? new URLSearchParams(window.location.search).get('id')
    : null;
  if (pathName) {
    const selfSelector = profileId
      ? `a[href*="profile.php?id=${profileId}"]`
      : `a[href$="/${pathName}"], a[href*="/${pathName}?"]`;
    // 頁籤連結（sk=friends_all「114 位朋友」、sk=about…）與留言作者連結（comment_id=）
    // 也指向本人的個人頁，但文字不是姓名，必須排除。
    const isNameCandidate = (a: Element): boolean => {
      const href = a.getAttribute('href') ?? '';
      const text = a.textContent?.trim() ?? '';
      if (/[?&](sk|comment_id)=/.test(href)) return false;
      return !!text && !systemH1.has(text) && text.length < 100 && !/^\d+$/.test(text);
    };
    const candidates = Array.from(document.querySelectorAll(selfSelector)).filter(isNameCandidate);
    // 姓名通常包在標題元素裡，優先採用；沒有才退回第一個候選
    const best = candidates.find(a => a.closest('h1, h2, [role="heading"]')) ?? candidates[0];
    if (best) name = best.textContent?.trim() ?? '';
  }

  // 次要判斷依據：og:title（伺服器端渲染好的 meta tag，登入瀏覽時常常是 null，
  // 但沒有 self-link 可用時仍值得一試）。
  const ogTitle = document.querySelector('meta[property="og:title"]') as HTMLMetaElement | null;
  if (!name && ogTitle?.content) {
    name = ogTitle.content.replace(/\s*[|–—]?\s*Facebook.*$/i, '').trim();
  }

  // 優先在 [role="main"]（主內容區）裡找標題，避開導覽列/通知鈴鐺等隱藏的
  // 螢幕閱讀器區塊標題；[role="main"] 找不到才退回全頁搜尋。
  const mainRegion = document.querySelector('[role="main"]');
  if (!name) {
    const headingCandidates = mainRegion
      ? mainRegion.querySelectorAll('h1, h2, [role="heading"]')
      : document.querySelectorAll('h1, h2, [role="heading"]');
    for (const heading of headingCandidates) {
      // 排除動態消息裡貼文本身的標題（例如分享/轉發貼文作者名稱），
      // 這些標題在 [role="article"] 底下，不是頁面主人自己的姓名。
      if (heading.closest('[role="article"]')) continue;
      const text = heading.textContent?.trim() ?? '';
      if (text && !systemH1.has(text)) {
        name = text;
        break;
      }
    }
  }

  if (!name) {
    name = document.title.replace(/^\(\d+\)\s*/, '').replace(/\s*[|–—]?\s*Facebook.*$/i, '').trim();
  }

  if (!name) {
    const allHeadingTexts = Array.from(document.querySelectorAll('h1, h2, [role="heading"]')).map(el => el.textContent?.trim() ?? '');
    const mainHeadingTexts = mainRegion
      ? Array.from(mainRegion.querySelectorAll('h1, h2, [role="heading"]')).map(el => el.textContent?.trim() ?? '')
      : null;
    const ogTitleDebug = (document.querySelector('meta[property="og:title"]') as HTMLMetaElement | null)?.content ?? null;
    console.warn(
      '[DeadLive] ⚠️ Facebook 找不到頁面名稱，selector 可能已失效。\n' +
      `url: ${window.location.href}\n` +
      `title: ${JSON.stringify(document.title)}\n` +
      `og:title: ${JSON.stringify(ogTitleDebug)}\n` +
      `hasMainRegion: ${!!mainRegion}\n` +
      `mainHeadingTexts: ${JSON.stringify(mainHeadingTexts)}\n` +
      `allHeadingTexts: ${JSON.stringify(allHeadingTexts)}`
    );
    return null;
  }

  let avatarUrl = '';
  if (pathName) {
    const selectors = [
      `a[href*="/photo/?fbid="] image`,
      `a[href$="/${pathName}"] image`,
      `a[href*="/${pathName}?"] image`,
    ];
    for (const sel of selectors) {
      try {
        const img = document.querySelector(sel);
        if (img) {
          avatarUrl = img.getAttribute('xlink:href') || img.getAttribute('href') || '';
          if (avatarUrl) break;
        }
      } catch { /* ignore */ }
    }
  }
  if (!avatarUrl) {
    const ogImage = document.querySelector('meta[property="og:image"]') as HTMLMetaElement | null;
    if (ogImage?.content) avatarUrl = ogImage.content;
  }

  // profile.php?id=123 的 id 就是身分本身，不能像一般網址一樣砍掉 query string
  let profileUrl = profileId
    ? `https://www.facebook.com/profile.php?id=${encodeURIComponent(profileId)}`
    : window.location.href.split('?')[0].replace(/\/$/, '');

  const bioLinks: string[] = [];
  const sectionLabels = ['連結', '聯絡資料', 'Links', 'Contact info'];
  const featuredLabels = ['精選內容詳細資料', 'Featured details', 'Highlights'];

  function cleanUrl(url: string): string {
    try {
      const u = new URL(url);
      u.searchParams.delete('fbclid');
      return u.toString().replace(/\/$/, '');
    } catch {
      return url;
    }
  }

  function resolveHref(href: string): string | null {
    if (!href || href.startsWith('mailto:')) return null;
    if (href.includes('l.facebook.com/l.php')) {
      try {
        return new URL(href).searchParams.get('u');
      } catch { return null; }
    }
    if (!href.startsWith('http')) return null;
    const fbDomains = ['facebook.com', 'fb.com', 'fbcdn.net', 'fb.me'];
    if (fbDomains.some(d => href.includes(d))) return null;
    // 簡介裡的電子郵件會被 FB 自動轉成 https://gmail.com 這類連結，不是帳號，
    // 而且會洩漏「此人有留信箱」，直接排除信箱服務網域。
    try {
      const host = new URL(href).hostname.replace(/^www\./, '');
      if (MAIL_HOSTS.has(host)) return null;
    } catch { return null; }
    return href;
  }

  function addLink(href: string) {
    const raw = resolveHref(href);
    if (!raw) return;
    const cleaned = cleanUrl(raw);
    if (!bioLinks.includes(cleaned)) bioLinks.push(cleaned);
  }

  for (const span of document.querySelectorAll('span[role="list"][aria-label]')) {
    const label = span.getAttribute('aria-label') ?? '';
    if (!featuredLabels.includes(label)) continue;
    span.querySelectorAll('a[href]').forEach(a => {
      addLink((a as HTMLAnchorElement).href);
    });
  }

  // 隱私：個人型檔案（顯示「朋友」而非「追蹤者」）的聯絡資料常常只對朋友可見，
  // 以登入身分讀到後會被公開發布，所以這類檔案不讀「聯絡資料」，只讀「連結」。
  const isPersonalProfile = !!document.querySelector('a[href*="sk=friends"]') && !document.querySelector('a[href*="/followers"]');
  const contactLabels = ['聯絡資料', 'Contact info'];

  for (const h2 of document.querySelectorAll('h2')) {
    const label = h2.textContent?.trim() ?? '';
    if (!sectionLabels.includes(label)) continue;
    if (isPersonalProfile && contactLabels.includes(label)) continue;

    const spanId = h2.querySelector('span[id]')?.id;
    if (!spanId) continue;

    const list = document.querySelector(`[aria-labelledby="${spanId}"]`);
    if (!list) continue;

    list.querySelectorAll('a[href]').forEach(a => {
      addLink((a as HTMLAnchorElement).href);
    });
  }

  // 自我介紹文字段落（例如「推特：https://twitter.com/xxx」）沒有固定的 aria-label
  // 可以定位，但它一定在頁籤列（全部/關於/朋友…）「之前」的個人檔案標頭裡。
  // 只掃標頭，頁籤列之後的動態消息、留言、別人的貼文一律不讀（隱私與誤歸屬）。
  // 找不到頁籤列時寧可不掃，也不退回掃整頁。
  const scanRoot = mainRegion ?? document;
  const tabBar = scanRoot.querySelector('[role="tablist"]');
  if (tabBar) {
    scanRoot.querySelectorAll('a[href]').forEach(a => {
      if (tabBar.contains(a)) return;
      if (!(tabBar.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_PRECEDING)) return;
      addLink((a as HTMLAnchorElement).href);
    });
  }

  // 置頂貼文是本人刻意放在最前面的內容，常放連結；只收有「置頂」標示的那一則。
  for (const article of scanRoot.querySelectorAll('[role="article"]')) {
    if (!/置頂貼文|Pinned post/.test((article as HTMLElement).innerText.slice(0, 200))) continue;
    article.querySelectorAll('a[href]').forEach(a => addLink((a as HTMLAnchorElement).href));
  }

  return { name, avatarUrl, profileUrl, bioLinks };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_PROFILE') {
    const data = extractFacebookProfile();
    if (data && !data.avatarUrl && data.bioLinks.length === 0) {
      console.warn('[DeadLive] ⚠️ Facebook 專屬 handler 回傳空結果，選擇器可能已失效');
    }
    if (data) {
      sendResponse({ type: 'PROFILE_DATA', data });
    } else {
      sendResponse({ type: 'NOT_PROFILE_PAGE' });
    }
  }
  return true;
});
