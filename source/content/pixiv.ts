import type { ProfileData } from '../shared/types';

async function extractPixivProfile(): Promise<ProfileData | null> {
  const userId = window.location.pathname.match(/\/users\/(\d+)/)?.[1];
  if (!userId) return null;

  let name = '';
  let avatarUrl = '';

  try {
    const res = await fetch(`/ajax/user/${userId}?full=1`);
    const json = await res.json();
    const body = json?.body;
    if (body?.name) name = body.name;
    if (body?.imageBig) avatarUrl = body.imageBig;
  } catch { /* ignore */ }

  if (!name) {
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
    name = (ogTitle || document.title || '').replace(/\s*[-|–—].*/g, '').trim();
  }

  if (!name) return null;

  const profileUrl = `https://www.pixiv.net/users/${userId}`;

  const bioLinks: string[] = [];
  const skipDomains = ['pixiv.net', 'pximg.net', 'pixiv.help'];

  document.querySelectorAll('a[href*="jump.php"]').forEach(a => {
    const href = (a as HTMLAnchorElement).href;
    try {
      const encoded = new URL(href).searchParams.get('url');
      if (encoded && /^https?:\/\//i.test(encoded) && !bioLinks.includes(encoded)) bioLinks.push(encoded);
    } catch { /* ignore */ }
  });

  document.querySelectorAll('ul a[href^="http"]').forEach(a => {
    const href = (a as HTMLAnchorElement).href;
    if (!href || href.includes('jump.php')) return;
    if (skipDomains.some(d => href.includes(d))) return;
    try {
      const u = new URL(href);
      u.search = '';
      const cleaned = u.toString().replace(/\/$/, '');
      if (!bioLinks.includes(cleaned)) bioLinks.push(cleaned);
    } catch { /* ignore */ }
  });

  return { name, avatarUrl, profileUrl, bioLinks };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_PROFILE') {
    extractPixivProfile().then(data => {
      if (data) {
        sendResponse({ type: 'PROFILE_DATA', data });
      } else {
        sendResponse({ type: 'NOT_PROFILE_PAGE' });
      }
    });
    return true;
  }
});
