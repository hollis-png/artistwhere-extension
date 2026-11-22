import type { ProfileData } from '../shared/types';

function resolveIgLink(href: string): string | null {
  try {
    const encoded = new URL(href).searchParams.get('u');
    if (!encoded) return null;
    const u = new URL(encoded);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    ['fbclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'igsh', 'igshid'].forEach(p => u.searchParams.delete(p));
    return u.toString().replace(/\/$/, '');
  } catch { return null; }
}

async function extractInstagramProfile(): Promise<ProfileData | null> {
  const header = document.querySelector('main header') || document.querySelector('header');
  if (!header) return null;

  const username = window.location.pathname.split('/').filter(Boolean)[0];
  if (!username) return null;

  let name = '';
  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
  if (ogTitle) {
    const m = ogTitle.match(/^(.+?)\s*\(@/);
    name = m ? m[1].trim() : ogTitle.replace(/\s*[•·|–—].*/g, '').trim();
  }
  if (!name) {
    name = document.title.replace(/\s*[•·|–—].*/g, '').replace(/\(@?\w+\)/g, '').trim();
  }
  if (!name) return null;

  let avatarUrl = '';
  const avatarSelectors = [
    'img[alt$="的大頭貼照"]',
    "img[alt$=\"'s profile picture\"]",
    'img[alt$="のプロフィール写真"]',
    'img[alt$="profile photo"]',
    `img[alt*="${username}"]`,
  ];
  for (const sel of avatarSelectors) {
    try {
      const img = header.querySelector(sel) as HTMLImageElement | null;
      if (img?.src) {
        avatarUrl = img.src;
        break;
      }
    } catch { /* ignore */ }
  }

  const profileUrl = `https://www.instagram.com/${username}`;
  const bioLinks: string[] = [];
  const lowerUsername = username.toLowerCase();
  const systemPaths = ['explore', 'accounts', 'directory', 'about', 'legal', 'p', 'reel', 'reels', 'stories', 'direct', 'nametag'];

  function addLink(url: string) {
    if (url && !bioLinks.includes(url)) bioLinks.push(url);
  }

  function extractLinksFrom(root: Element) {
    root.querySelectorAll('a[href^="http"]').forEach(a => {
      const href = (a as HTMLAnchorElement).href;
      if (!href) return;

      if (href.includes('l.instagram.com')) {
        const resolved = resolveIgLink(href);
        if (resolved) addLink(resolved);
        return;
      }

      try {
        const u = new URL(href);
        if (u.hostname.includes('instagram.com')) return;
        ['ref', 'fbclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'xmt'].forEach(p => u.searchParams.delete(p));
        addLink(u.toString().replace(/\/$/, ''));
      } catch { /* ignore */ }
    });
  }

  // Extract from header (single link + threads)
  extractLinksFrom(header);

  // @mentions in bio
  header.querySelectorAll('a[role="link"][href^="/"]').forEach(a => {
    const path = (a as HTMLAnchorElement).getAttribute('href') || '';
    const m = path.match(/^\/([\w.]+)\/?$/);
    if (!m) return;
    const target = m[1].toLowerCase();
    if (target === lowerUsername || systemPaths.includes(target)) return;
    addLink(`https://www.instagram.com/${m[1]}`);
  });

  // Multi-link button: click to open dialog, extract, then close
  const linkBtn = header.querySelector('svg[aria-label*="連結"], svg[aria-label*="Link"]');
  const btn = linkBtn?.closest('button') as HTMLButtonElement | null;
  if (btn) {
    btn.click();
    await new Promise(r => setTimeout(r, 600));
    const dialog = document.querySelector('div[role="dialog"]');
    if (dialog) {
      extractLinksFrom(dialog);
      const closeBtn = dialog.querySelector('[aria-label="關閉"], [aria-label="Close"], [aria-label="閉じる"]') as HTMLElement | null;
      closeBtn?.click();
    }
  }

  // Parse bio plain text for URLs and platform handles
  const bioText = (header as HTMLElement).innerText || '';

  const urlMatches = bioText.match(/https?:\/\/[^\s,，、。!！?？)）\]】​]+/g) || [];
  for (const raw of urlMatches) {
    try {
      const u = new URL(raw.replace(/[.]+$/, ''));
      if (u.hostname.includes('instagram.com')) continue;
      addLink(u.toString().replace(/\/$/, ''));
    } catch { /* ignore */ }
  }

  const fanboxMatches = bioText.match(/[\w-]+\.fanbox\.cc/g) || [];
  for (const m of fanboxMatches) addLink(`https://${m}`);

  for (const m of bioText.matchAll(/(?:twitter|推特|𝕏)\s*[：:]\s*@?([\w]+)/gi)) {
    addLink(`https://x.com/${m[1]}`);
  }

  for (const m of bioText.matchAll(/(?:pixiv|piviv)\s*[：:]\s*(?:https?:\/\/\S+\/users\/)?(\d+)/gi)) {
    addLink(`https://www.pixiv.net/users/${m[1]}`);
  }

  for (const m of bioText.matchAll(/(?:plurk)\s*[：:]\s*@?([\w]+)/gi)) {
    addLink(`https://www.plurk.com/${m[1]}`);
  }

  return { name, avatarUrl, profileUrl, bioLinks };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_PROFILE') {
    extractInstagramProfile().then(data => {
      if (data && !data.avatarUrl && data.bioLinks.length === 0) {
        console.warn('[DeadLive] ⚠️ Instagram 專屬 handler 回傳空結果，選擇器可能已失效');
      }
      if (data) {
        sendResponse({ type: 'PROFILE_DATA', data });
      } else {
        sendResponse({ type: 'NOT_PROFILE_PAGE' });
      }
    });
    return true;
  }
});
