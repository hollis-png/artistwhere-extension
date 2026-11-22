import { parseNameExists, candidateLabel, candidateReason, withChoice, type NameChoice, type NameCandidate } from './name-choice';
import { brandIconSvg } from '../shared/platform-icons';
import type { ProfileData } from '../shared/types';
import { DEFAULT_CONFIG, loadConfig, isNonAccountByRules, type LinkCategory } from '../shared/config';

declare const __API_BASE__: string;
const API_BASE = __API_BASE__;
// 「前往登入」「前往查看」要跟著建置時的網站位址走，不能寫死 localhost
document.querySelectorAll<HTMLAnchorElement>('a[data-site]').forEach(a => { a.href = API_BASE; });
const MAX_EXPAND_ROUNDS = 10;
// 抓取規則由網站端下發（見 shared/config.ts），init() 一開始載入；載入前用內建預設
let cfg = DEFAULT_CONFIG;

const $ = (id: string) => document.getElementById(id)!;

// 商品頁、貼文、雲端硬碟、網站首頁等「不是帳號」的連結（規則由網站端下發）：歸在這一類，預設不勾選也不能勾選
const NON_ACCOUNT: LinkCategory = { id: 'nonaccount', label: '不是帳號（商品頁、貼文、首頁等，不會加入）', emoji: '🚫', domains: [] };
const isNonAccount = (url: string): boolean => isNonAccountByRules(url, cfg);

function classifyUrl(url: string): LinkCategory {
  if (isNonAccount(url)) return NON_ACCOUNT;
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '').replace(/^m\./, '');
    for (const cat of cfg.categories) {
      if (cat.domains.some(d => hostname === d || hostname.endsWith('.' + d))) return cat;
    }
  } catch { /* ignore */ }
  return { id: 'other', label: '其他', emoji: '📎', domains: [] };
}

// 頁面作者可以放任何字串當「連結」（javascript:、file:、chrome:…）。進到清單與開分頁之前一律只放行 http(s)。
function isWebUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}

function webLinksOnly(urls: readonly string[]): string[] {
  return urls.filter(u => typeof u === 'string' && isWebUrl(u));
}

// 這些圖床有防盜鏈或網址帶簽章，直接在 popup 載入會 403；顯示時改走本站的圖片代理（只影響畫面，送出的仍是原始網址）
const PROXIED_IMAGE_HOSTS = /(^|\.)(pximg\.net|fanbox\.cc|cdninstagram\.com|fbcdn\.net)$/i;
function displayAvatar(url: string): string {
  if (url.startsWith('/')) return API_BASE + url;
  try {
    if (PROXIED_IMAGE_HOSTS.test(new URL(url).hostname)) return `${API_BASE}/api/proxy-image?url=${encodeURIComponent(url)}`;
  } catch { /* 不是合法網址就原樣 */ }
  return url;
}

function openTab(url: string): void {
  if (isWebUrl(url)) chrome.tabs.create({ url, active: false });
}

// 連結前的小圖示：內建的品牌圖示；沒收錄的網站用名稱第一個字母＋依網域固定的顏色。都不對外發請求
function letterIcon(hostname: string, small = false): HTMLElement | SVGSVGElement {
  const brand = brandIconSvg(hostname, small ? 14 : 16);
  if (brand) return brand;
  const host = hostname.replace(/^www\./, '');
  let hash = 0;
  for (const ch of host) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  const el = document.createElement('span');
  el.className = 'letter-icon' + (small ? ' small' : '');
  el.style.background = `hsl(${hash} 45% 38%)`;
  el.textContent = host.charAt(0) || '?';
  el.setAttribute('aria-hidden', 'true');
  return el;
}

function faviconDomain(hostname: string): string {
  if (hostname.endsWith('.fanbox.cc')) return 'fanbox.cc';
  if (hostname.endsWith('.gumroad.com')) return 'gumroad.com';
  return hostname;
}

interface AuthUser { id: string; username: string; avatarUrl: string; isAdmin: boolean; }

interface LinkTree {
  url: string;
  children: LinkTree[];
  expanded: boolean;
}

interface SavedState {
  profile: ProfileData;
  linkTrees: LinkTree[];
  discoveredUrls: string[];
  uncheckedUrls: string[];
  expandedUrls: string[];
}

const EMBED_SKIP_HOSTS = /(^|\.)(archive\.org|archive\.ph|archive\.is|translate\.goog|webcache\.googleusercontent\.com)$/i;

// 有人在「帳號」欄位貼整串網址，網站就把它接在網域後面（instagram.com/https%3A%2F%2F…）；路徑裡有一段本身是完整網址就用它
function unwrapEmbeddedUrl(url: string): string {
  try {
    const u = new URL(url);
    if (EMBED_SKIP_HOSTS.test(u.hostname)) return url;
    for (const seg of u.pathname.split('/')) {
      let decoded: string;
      try { decoded = decodeURIComponent(seg); } catch { continue; }
      if (/^https?:\/\/[^\s/]+/i.test(decoded) && decoded !== url) return decoded;
    }
  } catch { /* 原樣 */ }
  return url;
}

// BOOTH 的 店名.booth.pm/items/123 是商品頁，店鋪首頁 店名.booth.pm 才是身分：十幾件商品收成一條連結
const BOOTH_NON_SHOP = new Set(['www', 'static', 'asset', 'assets', 'accounts', 'api', 'manage', 'help', 'img', 's', 's2', 'booth']);
function boothShopUrl(hostname: string): string | null {
  const m = hostname.toLowerCase().match(/^([a-z0-9][a-z0-9-]*)\.booth\.pm$/);
  return m && !BOOTH_NON_SHOP.has(m[1]) ? `https://${m[1]}.booth.pm` : null;
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(unwrapEmbeddedUrl(url));
    const shop = boothShopUrl(u.hostname);
    if (shop) return shop;
    // http 與 https 是同一個帳號，不統一的話同一個 YouTube 會被當成兩條連結
    if (u.protocol === 'http:') u.protocol = 'https:';
    u.hostname = u.hostname.replace(/^www\./, '');
    u.pathname = u.pathname.replace(/\/$/, '');
    ['fbclid', 'ref', 'ref_src', 'ref_url', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'locale'].forEach(p => u.searchParams.delete(p));
    u.hash = '';
    if (u.hostname === 'discord.com' && u.pathname.startsWith('/invite/')) {
      return `https://discord.gg/${u.pathname.slice(8)}`;
    }
    if (u.hostname === 'twitter.com') {
      u.hostname = 'x.com';
    }
    if (u.hostname === 'pixiv.me') {
      return `https://pixiv.net/users/${u.pathname.slice(1)}`;
    }
    if (u.hostname === 'pixiv.net' && u.pathname.includes('member.php')) {
      const id = u.searchParams.get('id');
      if (id) return `https://pixiv.net/users/${id}`;
    }
    if (u.hostname === 'm.facebook.com') {
      u.hostname = 'facebook.com';
    }
    return u.toString();
  } catch {
    return url;
  }
}

let currentProfile: ProfileData | null = null;
const allDiscoveredUrls = new Set<string>();
const uncheckedUrls = new Set<string>();
const expandedUrls = new Set<string>();
// 各網址在該網站上顯示的名稱，送出時一併帶給伺服器，供瀏覽者挑選卡片顯示哪個名字
const nameByUrl = new Map<string, string>();
let linkTrees: LinkTree[] = [];

function getStorageKey(profileUrl: string): string {
  return 'state_' + normalizeUrl(profileUrl);
}

async function saveState(): Promise<void> {
  if (!currentProfile) return;
  const state: SavedState = {
    profile: currentProfile,
    linkTrees,
    discoveredUrls: [...allDiscoveredUrls],
    uncheckedUrls: [...uncheckedUrls],
    expandedUrls: [...expandedUrls],
  };
  await chrome.storage.session.set({ [getStorageKey(currentProfile.profileUrl)]: state });
}

async function loadState(profileUrl: string): Promise<SavedState | null> {
  const key = getStorageKey(profileUrl);
  const result = await chrome.storage.session.get(key);
  return result[key] ?? null;
}

async function checkAuth(): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
    return await res.json();
  } catch { return null; }
}

// 只在使用者點開擴充功能時才讀頁面：有專屬腳本的網站（X、Facebook、Pixiv、Instagram）由 manifest 載入，
// 其他網站由這裡用 activeTab 當下授權的權限，把通用偵測腳本注入目前分頁。
const SPECIALIZED_SCRIPTS: { host: string; file: string }[] = [
  { host: 'twitter.com', file: 'content/twitter.js' },
  { host: 'x.com', file: 'content/twitter.js' },
  { host: 'facebook.com', file: 'content/facebook.js' },
  { host: 'pixiv.net', file: 'content/pixiv.js' },
  { host: 'instagram.com', file: 'content/instagram.js' },
];

function scriptFileFor(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const hit = SPECIALIZED_SCRIPTS.find(s => host === s.host || host.endsWith('.' + s.host));
    return hit ? hit.file : 'content/generic.js';
  } catch { return 'content/generic.js'; }
}

function askProfile(tabId: number): Promise<ProfileData | null> {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, { type: 'GET_PROFILE' }, (response: { type?: string; data?: ProfileData } | undefined) => {
      if (chrome.runtime.lastError || !response || response.type !== 'PROFILE_DATA') resolve(null);
      else resolve(response.data as ProfileData);
    });
  });
}

async function injectScript(tabId: number, file: string): Promise<boolean> {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [file] });
    return true;
  } catch {
    // chrome://、商店頁、PDF 等頁面不允許注入
    return false;
  }
}

async function fetchProfile(): Promise<ProfileData | null> {
  const tabs: { id?: number; url?: string }[] = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
  const tab = tabs[0];
  if (!tab?.id || !tab.url || !isWebUrl(tab.url)) return null;
  const file = scriptFileFor(tab.url);
  // 專屬腳本的網站通常已經載入好了，先直接問；問不到（例如安裝前就開著的分頁）或通用腳本，就注入再問
  if (file !== 'content/generic.js') {
    const direct = await askProfile(tab.id);
    if (direct) return direct;
  }
  if (!(await injectScript(tab.id, file))) return null;
  return askProfile(tab.id);
}

// DLsite 商品頁（/product_id/RJxxxx）不是繪師的身分，社團頁（/circle/profile/=/maker_id/RGxxxx）才是。
// 由使用者的瀏覽器讀商品頁找出社團連結，伺服器不碰 DLsite。找不到就保留原連結。
const DLSITE_PRODUCT = /^https:\/\/(?:www\.)?dlsite\.com\/[^/]+\/(?:work|announce)\/=\/product_id\/RJ\d+/i;
async function dlsiteCircleOf(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) return null;
    const m = (await res.text()).match(/https?:\/\/(?:www\.)?dlsite\.com\/[^/"']+\/circle\/profile\/=\/maker_id\/(RG\d+)\.html/i);
    return m ? `https://www.dlsite.com/maniax/circle/profile/=/maker_id/${m[1]}.html` : null;
  } catch { return null; }
}

const dlsiteCache = new Map<string, string | null>();

// 把一組網址裡的 DLsite 商品頁換成社團頁並去重；其他網址原樣保留
async function resolveDlsiteLinks(urls: string[]): Promise<string[]> {
  const resolved = await Promise.all(urls.map(async raw => {
    const url = normalizeUrl(raw);
    if (!DLSITE_PRODUCT.test(url)) return raw;
    if (!dlsiteCache.has(url)) dlsiteCache.set(url, await dlsiteCircleOf(url));
    return dlsiteCache.get(url) ?? raw;
  }));
  return [...new Set(resolved)];
}

async function resolveDlsiteCircles(profile: ProfileData): Promise<ProfileData> {
  const [profileUrl] = await resolveDlsiteLinks([profile.profileUrl]);
  return { ...profile, profileUrl, bioLinks: await resolveDlsiteLinks(webLinksOnly(profile.bioLinks)) };
}

function showView(viewId: string): void {
  for (const id of ['loading', 'notProfilePage', 'notLoggedIn', 'profilePreview', 'successView', 'errorView', 'nameChoiceView']) {
    $(id).style.display = id === viewId ? '' : 'none';
  }
}

function formatUrl(url: string): string {
  try { const u = new URL(url); return u.hostname + u.pathname; }
  catch { return url; }
}

function isUnscrapeable(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return cfg.unscrapeAble.some(d => hostname === d || hostname.endsWith('.' + d));
  } catch { return false; }
}

function isIgnored(url: string): boolean {
  try {
    const u = new URL(url);
    const hostname = u.hostname.replace(/^www\./, '');
    if (cfg.ignoreDomains.some(d => hostname === d || hostname.endsWith('.' + d))) return true;
    if (hostname.includes('myacg.com.tw') && !u.pathname.includes('seller_market')) return true;
    // 嵌入播放器網址不是頻道
    if (hostname === 'youtube.com' && u.pathname.startsWith('/embed')) return true;
    return false;
  } catch { return false; }
}

function addDiscoveredUrl(url: string): void {
  if (!isWebUrl(url)) return;
  const normalized = normalizeUrl(url);
  if (isIgnored(normalized)) return;
  if (!allDiscoveredUrls.has(normalized)) {
    allDiscoveredUrls.add(normalized);
    // 不是帳號的連結一律不加入（使用者無法勾選），伺服器也會再擋一次
    if (isNonAccount(normalized)) uncheckedUrls.add(normalized);
  }
}

function collectSubtreeUrls(tree: LinkTree): string[] {
  const urls = [normalizeUrl(tree.url)];
  for (const child of tree.children) {
    urls.push(...collectSubtreeUrls(child));
  }
  return urls;
}

// 子連結的勾選狀態改變時，往上同步祖先節點的勾選框：全勾→勾選、全不勾→不勾選、
// 部分勾選→indeterminate（跟下面「將加入的連結」分類群組已有的邏輯一致）。
function updateAncestorCheckboxes(node: HTMLElement): void {
  let current = node.parentElement?.closest<HTMLElement>('.link-node') ?? null;
  while (current) {
    const parentCheckbox = current.querySelector<HTMLInputElement>(':scope > .link-row > .link-checkbox');
    const childCheckboxes = current.querySelectorAll<HTMLInputElement>(':scope > .child-links > .link-node > .link-row > .link-checkbox');
    if (parentCheckbox && childCheckboxes.length > 0) {
      const checkedCount = [...childCheckboxes].filter(cb => cb.checked).length;
      parentCheckbox.checked = checkedCount === childCheckboxes.length;
      parentCheckbox.indeterminate = checkedCount > 0 && checkedCount < childCheckboxes.length;
    }
    current = current.parentElement?.closest<HTMLElement>('.link-node') ?? null;
  }
}

// 從已儲存的狀態還原樹狀列表時，每個節點的勾選框只會反映自己的狀態，父層的
// indeterminate（部分子連結未勾選）不會自動算出來，所以整棵樹蓋好後由下往上算一次。
// querySelectorAll 回傳的是先序（node 一定排在其所有子孫之前），反過來處理
// 就保證每個節點在它的子孫都算完之後才被計算，等同後序處理。
function syncCheckboxStatesBottomUp(root: HTMLElement): void {
  const nodes = [...root.querySelectorAll<HTMLElement>('.link-node')].reverse();
  for (const current of nodes) {
    const parentCheckbox = current.querySelector<HTMLInputElement>(':scope > .link-row > .link-checkbox');
    const childCheckboxes = current.querySelectorAll<HTMLInputElement>(':scope > .child-links > .link-node > .link-row > .link-checkbox');
    if (parentCheckbox && childCheckboxes.length > 0) {
      const checkedCount = [...childCheckboxes].filter(cb => cb.checked).length;
      parentCheckbox.checked = checkedCount === childCheckboxes.length;
      parentCheckbox.indeterminate = checkedCount > 0 && checkedCount < childCheckboxes.length;
    }
  }
}

function createLinkNode(tree: LinkTree, depth: number): HTMLDivElement {
  const normalized = normalizeUrl(tree.url);
  if (!isIgnored(normalized)) addDiscoveredUrl(normalized);

  const node = document.createElement('div');
  node.className = 'link-node';
  node.dataset.depth = String(depth);

  const row = document.createElement('div');
  row.className = 'link-row';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'link-checkbox';
  checkbox.checked = !uncheckedUrls.has(normalized) && !isNonAccount(normalized);
  if (isNonAccount(normalized)) { checkbox.disabled = true; checkbox.title = '不是帳號（商品頁、貼文、首頁等），不會加入'; }
  checkbox.addEventListener('change', () => {
    // 取消勾選「來源」連結時，底下所有子連結（不限層級）都一併取消加入；
    // 反過來勾選時也一併把子連結都納入，維持跟父層一致的狀態。
    for (const url of collectSubtreeUrls(tree)) {
      if (isNonAccount(url)) continue;
      if (checkbox.checked) uncheckedUrls.delete(url);
      else uncheckedUrls.add(url);
    }
    node.querySelectorAll<HTMLInputElement>('.link-checkbox').forEach(cb => {
      if (cb.disabled) return;
      cb.checked = checkbox.checked;
      cb.indeterminate = false;
    });
    updateAncestorCheckboxes(node);
    updatePreview();
    saveState();
  });
  row.appendChild(checkbox);

  let favicon: HTMLElement | SVGSVGElement;
  try { favicon = letterIcon(new URL(normalized).hostname); } catch { favicon = letterIcon('?'); }
  favicon.classList.add('link-favicon');

  const link = document.createElement('a');
  link.href = normalized;
  link.textContent = formatUrl(normalized);
  link.addEventListener('click', (e) => {
    e.preventDefault();
    openTab(normalized);
  });

  row.appendChild(favicon);
  row.appendChild(link);

  if (isUnscrapeable(normalized)) {
    const badge = document.createElement('span');
    badge.className = 'btn-no-scrape';
    badge.textContent = '🚫';
    badge.title = '此平台無法抓取內嵌連結';
    row.appendChild(badge);
  } else if (!tree.expanded && expandedUrls.has(normalized)) {
    const badge = document.createElement('span');
    badge.className = 'btn-expand done';
    badge.textContent = '✓';
    badge.title = '已在其他節點展開過';
    row.appendChild(badge);
  } else if (tree.expanded && tree.children.length === 0) {
    const badge = document.createElement('span');
    badge.className = 'btn-expand done';
    badge.textContent = '—';
    row.appendChild(badge);
  } else if (tree.expanded) {
    const badge = document.createElement('span');
    badge.className = 'btn-expand done';
    badge.textContent = `${tree.children.length}`;
    row.appendChild(badge);
  } else {
    const expandBtn = document.createElement('button');
    expandBtn.className = 'btn-expand';
    expandBtn.textContent = '↓';
    expandBtn.title = '抓取內嵌連結';
    expandBtn.addEventListener('click', () => onExpand(expandBtn, node, tree, depth));
    row.appendChild(expandBtn);
  }

  node.appendChild(row);

  if (tree.children.length > 0) {
    const childContainer = document.createElement('div');
    childContainer.className = 'child-links';
    for (const child of tree.children) {
      childContainer.appendChild(createLinkNode(child, depth + 1));
    }
    node.appendChild(childContainer);
  }

  return node;
}

// 伺服器抓不到的網站（Booth 擋機器人、Ganknow 是單頁應用、NekoLive 要專屬選擇器）：
// 在背景分頁打開，讓擴充的內容腳本抽取，再關掉分頁。不經過伺服器。
const TAB_EXPAND_HOSTS = ['booth.pm', 'nekolive.net', 'ganknow.com'];
function needsTabExpand(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return TAB_EXPAND_HOSTS.some(d => host === d || host.endsWith('.' + d));
  } catch { return false; }
}

// 背景分頁展開的安全閥：同時最多 2 個、一次開啟 popup 最多 8 個，避免惡意頁面放一堆連結誘導開出大量分頁
const MAX_CONCURRENT_TABS = 2;
const MAX_TABS_PER_SESSION = 8;
let activeTabCount = 0;
let tabsOpenedThisSession = 0;
const activeTabIds = new Set<number>();
const OPEN_TABS_KEY = 'openExpandTabs';

async function persistOpenTabs(): Promise<void> {
  try { await chrome.storage.session.set({ [OPEN_TABS_KEY]: [...activeTabIds] }); } catch { /* 存不了就算了 */ }
}

// popup 被提前關閉時 finally 不會執行；下次開啟時把上次殘留的背景分頁關掉
async function cleanupLeftoverTabs(): Promise<void> {
  try {
    const stored = await chrome.storage.session.get(OPEN_TABS_KEY);
    const ids = (stored[OPEN_TABS_KEY] as number[] | undefined) ?? [];
    for (const id of ids) await chrome.tabs.remove(id).catch(() => {});
    await chrome.storage.session.remove(OPEN_TABS_KEY);
  } catch { /* 沒有就算了 */ }
}

window.addEventListener('pagehide', () => {
  for (const id of activeTabIds) chrome.tabs.remove(id).catch(() => {});
});

async function expandViaTab(url: string): Promise<{ links: string[]; name: string } | null> {
  if (!isWebUrl(url) || !needsTabExpand(url)) return null;
  if (tabsOpenedThisSession >= MAX_TABS_PER_SESSION) return null;
  // 等有空位再開（同時最多 MAX_CONCURRENT_TABS 個）
  while (activeTabCount >= MAX_CONCURRENT_TABS) await new Promise(r => setTimeout(r, 300));
  activeTabCount++;
  tabsOpenedThisSession++;
  let tabId: number | undefined;
  try {
    const tab = await chrome.tabs.create({ url, active: false });
    tabId = tab.id;
    if (tabId === undefined) return null;
    activeTabIds.add(tabId);
    await persistOpenTabs();
    // 單頁應用需要時間渲染：最多等 ~8 秒，每秒看一次；分頁載入完成後注入通用腳本（只有 booth.pm、nekolive.net、
    // ganknow.com 有主機權限），再每秒問一次，拿到有連結的結果就收
    let injected = false;
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const id = tabId;
      if (!injected) {
        const info: { status?: string } | undefined = await new Promise(r => chrome.tabs.get(id, (t: { status?: string }) => r(chrome.runtime.lastError ? undefined : t)));
        if (info?.status !== 'complete') continue;
        injected = await injectScript(id, 'content/generic.js');
        if (!injected) break;
      }
      const res = await askProfile(id);
      if (res && res.bioLinks.length > 0) return { links: webLinksOnly(res.bioLinks), name: res.name };
    }
    return { links: [], name: '' };
  } finally {
    activeTabCount--;
    if (tabId !== undefined) {
      activeTabIds.delete(tabId);
      chrome.tabs.remove(tabId).catch(() => {});
      await persistOpenTabs();
    }
  }
}

// 失敗不算展開過：不寫進狀態，按鈕保持可點，下次「偵測全部」或手動點擊都能重試
function markExpandFailed(btn: HTMLButtonElement, hint: string): void {
  btn.classList.remove('loading');
  btn.textContent = '✗';
  btn.title = hint;
  btn.dataset.failed = '1';
}

async function onExpand(btn: HTMLButtonElement, parentNode: HTMLDivElement, tree: LinkTree, depth: number): Promise<void> {
  if (btn.classList.contains('done') || btn.classList.contains('loading')) return;

  btn.classList.add('loading');
  btn.textContent = '⏳';

  const hint = document.createElement('div');
  hint.className = 'loading-hint';
  hint.textContent = '抓取中...';
  parentNode.appendChild(hint);

  try {
    let rawLinks: string[];
    if (needsTabExpand(tree.url)) {
      const viaTab = await expandViaTab(tree.url);
      hint.remove();
      if (viaTab === null) { markExpandFailed(btn, '無法開啟分頁，點擊重試'); return; }
      if (viaTab.name) nameByUrl.set(normalizeUrl(tree.url), viaTab.name);
      rawLinks = viaTab.links.filter(l => normalizeUrl(l) !== normalizeUrl(tree.url));
    } else {
      const res = await fetch(`${API_BASE}/api/artists/scrape-links`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: [tree.url] }),
      });

      hint.remove();

      if (!res.ok) {
        markExpandFailed(btn, res.status === 429 ? '太頻繁，稍後再試' : `抓取失敗（${res.status}），點擊重試`);
        return;
      }

      const data = await res.json();
      rawLinks = (data.extraLinks as string[]) ?? [];
      for (const [u, n] of Object.entries((data.names ?? {}) as Record<string, string>)) nameByUrl.set(normalizeUrl(u), n);
    }
    const extraLinks = await resolveDlsiteLinks(webLinksOnly(rawLinks));

    btn.classList.remove('loading');
    btn.classList.add('done');
    tree.expanded = true;
    expandedUrls.add(normalizeUrl(tree.url));

    if (extraLinks.length === 0) {
      btn.textContent = '—';
      saveState();
      return;
    }

    btn.textContent = `${extraLinks.length}`;

    const childContainer = document.createElement('div');
    childContainer.className = 'child-links';
    for (const link of extraLinks) {
      const childTree: LinkTree = { url: normalizeUrl(link), children: [], expanded: false };
      tree.children.push(childTree);
      childContainer.appendChild(createLinkNode(childTree, depth + 1));
    }
    parentNode.appendChild(childContainer);
    updatePreview();
    saveState();
  } catch {
    hint.remove();
    markExpandFailed(btn, '抓取失敗，點擊重試');
  }
}

async function smartDetectAll(): Promise<void> {
  const btn = $('btnSmartDetect') as HTMLButtonElement;
  btn.disabled = true;
  let sawNothing = false;

  for (let round = 0; round < MAX_EXPAND_ROUNDS; round++) {
    const expandBtns = [...$('linksList').querySelectorAll('.btn-expand')]
      .filter(b => !b.classList.contains('done') && !b.classList.contains('loading')
        && !(round > 0 && (b as HTMLButtonElement).dataset.failed)) as HTMLButtonElement[];

    if (expandBtns.length === 0) {
      if (round === 0) sawNothing = true;
      break;
    }

    btn.textContent = `⏳ 第${round + 1}輪 (${expandBtns.length}個)`;

    for (const b of expandBtns) b.click();

    await new Promise<void>(resolve => {
      const check = () => {
        const pending = $('linksList').querySelectorAll('.btn-expand.loading');
        if (pending.length === 0) resolve();
        else setTimeout(check, 300);
      };
      setTimeout(check, 500);
    });
  }

  const failed = $('linksList').querySelectorAll('.btn-expand[data-failed]').length;
  btn.textContent = sawNothing ? '沒有可展開的連結' : failed > 0 ? `完成（${failed} 個失敗，可再按重試）` : '✅ 完成';
  btn.disabled = false;
}

function updateCheckedCount(): void {
  $('previewCount').textContent = String([...allDiscoveredUrls].filter(u => !uncheckedUrls.has(u) && !isNonAccount(u)).length);
}

function updatePreview(): void {
  scheduleLookup();
  const list = $('previewList');
  list.innerHTML = '';
  updateCheckedCount();

  if (allDiscoveredUrls.size === 0) {
    $('previewSection').style.display = 'none';
    return;
  }

  $('previewSection').style.display = '';

  const grouped = new Map<string, { cat: LinkCategory; urls: string[] }>();
  for (const url of allDiscoveredUrls) {
    const cat = classifyUrl(url);
    if (!grouped.has(cat.id)) grouped.set(cat.id, { cat, urls: [] });
    grouped.get(cat.id)!.urls.push(url);
  }

  const order = ['social', 'subscribe', 'shop', 'media', 'aggregator', 'community', 'other', 'nonaccount'];
  const sorted = [...grouped.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));

  for (const [, { cat, urls }] of sorted) {
    const group = document.createElement('div');
    group.className = 'preview-group';

    const header = document.createElement('div');
    header.className = 'preview-group-header';

    const groupCheckbox = document.createElement('input');
    groupCheckbox.type = 'checkbox';
    const allChecked = urls.every(u => !uncheckedUrls.has(u));
    const noneChecked = urls.every(u => uncheckedUrls.has(u));
    groupCheckbox.checked = allChecked;
    groupCheckbox.indeterminate = !allChecked && !noneChecked;
    if (cat.id === NON_ACCOUNT.id) { groupCheckbox.checked = false; groupCheckbox.indeterminate = false; groupCheckbox.disabled = true; }

    const label = document.createElement('span');
    label.className = 'preview-group-label';
    label.textContent = `${cat.emoji} ${cat.label} (${urls.length})`;

    header.appendChild(groupCheckbox);
    header.appendChild(label);
    group.appendChild(header);

    const itemCheckboxes: HTMLInputElement[] = [];

    for (const url of urls) {
      const item = document.createElement('div');
      item.className = 'preview-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !uncheckedUrls.has(url);
      if (cat.id === NON_ACCOUNT.id) { checkbox.checked = false; checkbox.disabled = true; checkbox.title = '不是帳號，不會加入'; }
      itemCheckboxes.push(checkbox);

      checkbox.addEventListener('change', () => {
        if (checkbox.checked) uncheckedUrls.delete(url);
        else uncheckedUrls.add(url);
        const checked = itemCheckboxes.filter(c => c.checked).length;
        groupCheckbox.checked = checked === itemCheckboxes.length;
        groupCheckbox.indeterminate = checked > 0 && checked < itemCheckboxes.length;
        updateCheckedCount();
        saveState();
      });

      let icon: HTMLElement | SVGSVGElement;
      try { icon = letterIcon(new URL(url).hostname, true); } catch { icon = letterIcon('?', true); }

      const link = document.createElement('a');
      link.href = url;
      link.textContent = formatUrl(url);
      link.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openTab(url);
      });

      item.appendChild(checkbox);
      item.appendChild(icon);
      item.appendChild(link);
      group.appendChild(item);
    }

    groupCheckbox.addEventListener('change', () => {
      for (const cb of itemCheckboxes) {
        cb.checked = groupCheckbox.checked;
        const url = urls[itemCheckboxes.indexOf(cb)];
        if (groupCheckbox.checked) uncheckedUrls.delete(url);
        else uncheckedUrls.add(url);
      }
      groupCheckbox.indeterminate = false;
      updateCheckedCount();
      saveState();
    });

    list.appendChild(group);
  }
}

function renderFromState(state: SavedState): void {
  currentProfile = state.profile;
  linkTrees = state.linkTrees;
  allDiscoveredUrls.clear();
  uncheckedUrls.clear();
  expandedUrls.clear();
  for (const u of state.discoveredUrls) allDiscoveredUrls.add(u);
  for (const u of state.uncheckedUrls) uncheckedUrls.add(u);
  for (const u of (state.expandedUrls ?? [])) expandedUrls.add(u);

  const avatarImg = $('previewAvatar') as HTMLImageElement;
  if (state.profile.avatarUrl) {
    avatarImg.src = displayAvatar(state.profile.avatarUrl);
  } else {
    avatarImg.replaceWith(Object.assign(document.createElement('div'), {
      className: 'no-avatar', textContent: '無頭像',
    }));
  }

  ($('previewName') as HTMLInputElement).value = state.profile.name || '';
  $('previewUrl').textContent = formatUrl(state.profile.profileUrl);

  const linksList = $('linksList');
  linksList.innerHTML = '';

  if (linkTrees.length === 0) {
    $('linksSection').style.display = 'none';
  } else {
    $('linksSection').style.display = '';
    for (const tree of linkTrees) {
      linksList.appendChild(createLinkNode(tree, 0));
    }
    syncCheckboxStatesBottomUp(linksList);
  }

  showView('profilePreview');
  updatePreview();
}

function renderProfile(profile: ProfileData): void {
  currentProfile = profile;
  allDiscoveredUrls.clear();
  uncheckedUrls.clear();
  expandedUrls.clear();
  nameByUrl.clear();
  if (profile.name) nameByUrl.set(normalizeUrl(profile.profileUrl), profile.name);
  linkTrees = profile.bioLinks.map(url => ({
    url: normalizeUrl(url), children: [], expanded: false,
  }));

  const avatarImg = $('previewAvatar') as HTMLImageElement;
  if (profile.avatarUrl) {
    avatarImg.src = displayAvatar(profile.avatarUrl);
  } else {
    avatarImg.replaceWith(Object.assign(document.createElement('div'), {
      className: 'no-avatar', textContent: '無頭像',
    }));
  }

  ($('previewName') as HTMLInputElement).value = profile.name || '';
  $('previewUrl').textContent = formatUrl(profile.profileUrl);

  const linksList = $('linksList');
  linksList.innerHTML = '';

  if (linkTrees.length === 0) {
    $('linksSection').style.display = 'none';
  } else {
    $('linksSection').style.display = '';
    for (const tree of linkTrees) {
      linksList.appendChild(createLinkNode(tree, 0));
    }
  }

  showView('profilePreview');
  updatePreview();
  saveState();
}

// 顯示網站上已有的那張卡（頭像、名稱、連結、為何判斷可能是同一位），讓使用者核對再決定
function createCandidateCard(c: NameCandidate, reasonText?: string): HTMLElement {
  const card = document.createElement('div');
  card.className = 'candidate-card';

  const head = document.createElement('div');
  head.className = 'candidate-head';
  // 頭像是確認是不是同一位最直接的依據：沒有或載入失敗時用名字第一個字代替，版面不跳動
  const avatarBox = document.createElement('div');
  avatarBox.className = 'candidate-avatar';
  const initial = document.createElement('span');
  initial.textContent = [...c.name][0] ?? '?';
  avatarBox.appendChild(initial);
  if (c.avatarUrl) {
    const img = document.createElement('img');
    img.alt = '';
    img.addEventListener('load', () => { initial.hidden = true; img.hidden = false; });
    img.addEventListener('error', () => img.remove());
    img.hidden = true;
    img.src = displayAvatar(c.avatarUrl);
    avatarBox.appendChild(img);
  }
  head.appendChild(avatarBox);
  const title = document.createElement('div');
  const nameEl = document.createElement('div');
  nameEl.className = 'candidate-name';
  nameEl.textContent = c.name;
  const reason = document.createElement('div');
  reason.className = 'candidate-reason';
  reason.textContent = reasonText ?? candidateReason(c);
  title.append(nameEl);
  if (reason.textContent) title.append(reason);
  head.appendChild(title);
  card.appendChild(head);

  const shared = new Set((c.sharedLinks ?? []).map(normalizeUrl));
  const links = document.createElement('div');
  links.className = 'candidate-links';
  for (const acc of c.accounts ?? []) {
    const row = document.createElement('div');
    row.className = 'candidate-link' + (shared.has(normalizeUrl(acc.url)) ? ' shared' : '');
    const platform = document.createElement('span');
    platform.className = 'candidate-platform';
    platform.textContent = acc.platformName;
    const label = document.createElement('span');
    label.className = 'candidate-url';
    label.textContent = acc.name ?? formatUrl(acc.url);
    label.title = acc.url;
    row.append(platform, label);
    links.appendChild(row);
  }
  card.appendChild(links);
  return card;
}

// ── 打開彈窗就查：網站上是不是已經有這位。有的話先顯示現況，可以直接「加到這張」或加入我的分類 ──
interface MyList { id: string; name: string; artistIds: string[] }
let lookupSignature = '';
let lookupTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleLookup(): void {
  if (!currentProfile) return;
  const links = [...allDiscoveredUrls].filter(u => !uncheckedUrls.has(u) && !isNonAccount(u)).slice(0, 50);
  const signature = JSON.stringify([currentProfile.profileUrl, ($('previewName') as HTMLInputElement).value.trim(), links]);
  if (signature === lookupSignature) return;
  lookupSignature = signature;
  clearTimeout(lookupTimer);
  // 連結一直在變（展開、勾選）時合併成一次查詢
  lookupTimer = setTimeout(() => { void refreshExisting(links); }, 500);
}

async function refreshExisting(links: string[]): Promise<void> {
  const box = $('existingBox');
  if (!currentProfile) return;
  const sig = lookupSignature;
  try {
    const res = await fetch(`${API_BASE}/api/artists/lookup`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: currentProfile.profileUrl, name: ($('previewName') as HTMLInputElement).value.trim() || undefined, links }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const candidates = (await res.json()) as NameCandidate[];
    if (sig !== lookupSignature) return; // 期間連結又變了，交給下一次查詢
    let lists: MyList[] = [];
    if (candidates.length > 0) {
      const lr = await fetch(`${API_BASE}/api/lists`, { credentials: 'include' }).catch(() => null);
      if (lr?.ok) lists = (await lr.json()) as MyList[];
    }
    renderExisting(box, candidates, lists);
  } catch {
    box.style.display = 'none'; // 查不到不影響原本的流程，加入時伺服器仍會把關
  }
}

// 「加入我的分類」：每個分類一顆文字按鈕，亮起代表已在裡面，再按一次取消
function appendListButtons(parent: HTMLElement, artistId: string, lists: MyList[]): void {
  if (lists.length === 0) return;
  const label = document.createElement('div');
  label.className = 'group-label';
  label.textContent = '加入我的分類：';
  parent.appendChild(label);
  for (const l of lists) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'list-btn';
    btn.textContent = l.name;
    const on = (): boolean => l.artistIds.includes(artistId);
    btn.setAttribute('aria-pressed', String(on()));
    btn.addEventListener('click', async () => {
      const adding = !on();
      btn.disabled = true;
      try {
        const r = await fetch(`${API_BASE}/api/lists/${encodeURIComponent(l.id)}/artists/${encodeURIComponent(artistId)}`, { method: adding ? 'PUT' : 'DELETE', credentials: 'include' });
        if (r.ok) l.artistIds = adding ? [...l.artistIds, artistId] : l.artistIds.filter(x => x !== artistId);
      } catch { /* 失敗就維持原樣，使用者可再按一次 */ }
      btn.setAttribute('aria-pressed', String(on()));
      btn.disabled = false;
    });
    parent.appendChild(btn);
  }
}

// 加入成功後：直接看加進去的卡片長怎樣，並可以順手加入我的分類
interface AddedCard { id: string; name: string; avatarUrl?: string; accounts?: { url: string; platformName?: string; name?: string }[] }

async function renderAdded(card: AddedCard | null): Promise<void> {
  const box = $('addedBox');
  box.textContent = '';
  if (!card || typeof card.id !== 'string') { box.style.display = 'none'; return; }
  const siteLink = document.querySelector<HTMLAnchorElement>('#successView a[data-site]');
  if (siteLink) siteLink.href = `${API_BASE}/a/${encodeURIComponent(card.id)}`;
  box.style.display = '';
  const title = document.createElement('div');
  title.className = 'existing-title';
  title.textContent = '加入後的卡片：';
  box.appendChild(title);
  const accounts = (card.accounts ?? []).map(a => ({ url: a.url, platformName: a.platformName ?? 'Link', ...(a.name ? { name: a.name } : {}) }));
  box.appendChild(createCandidateCard({
    id: card.id, name: card.name, avatarUrl: card.avatarUrl ?? '',
    platforms: [...new Set(accounts.map(a => a.platformName))], accounts, sharedLinks: [],
  }, `共 ${accounts.length} 個連結`));
  const actions = document.createElement('div');
  actions.className = 'existing-actions';
  box.appendChild(actions);
  const lr = await fetch(`${API_BASE}/api/lists`, { credentials: 'include' }).catch(() => null);
  if (lr?.ok) appendListButtons(actions, card.id, (await lr.json()) as MyList[]);
}

function renderExisting(box: HTMLElement, candidates: NameCandidate[], lists: MyList[]): void {
  box.textContent = '';
  if (candidates.length === 0) { box.style.display = 'none'; return; }
  box.style.display = '';
  const title = document.createElement('div');
  title.className = 'existing-title';
  title.textContent = '網站上已有可能是同一位：';
  box.appendChild(title);
  for (const c of candidates) {
    const item = document.createElement('div');
    item.className = 'existing-item';
    item.appendChild(createCandidateCard(c));
    const actions = document.createElement('div');
    actions.className = 'existing-actions';

    const merge = document.createElement('button');
    merge.type = 'button';
    merge.className = 'btn secondary';
    merge.textContent = '是同一位：加到這張';
    merge.addEventListener('click', () => { showView('loading'); void submitArtist({ mergeInto: c.id }); });
    const open = document.createElement('a');
    open.href = `${API_BASE}/a/${encodeURIComponent(c.id)}`;
    open.target = '_blank';
    open.rel = 'noopener';
    open.textContent = '在網站上開啟';
    actions.append(merge, open);

    appendListButtons(actions, c.id, lists);
    item.appendChild(actions);
    box.appendChild(item);
  }
}

function showNameChoice(candidates: NameCandidate[]): void {
  const list = $('nameChoiceList');
  list.textContent = '';
  const add = (label: string, choice: NameChoice): void => {
    const btn = document.createElement('button');
    btn.className = 'btn secondary name-choice-btn';
    btn.textContent = label;
    btn.addEventListener('click', () => { showView('loading'); void submitArtist(choice); });
    list.appendChild(btn);
  };
  for (const c of candidates) {
    list.appendChild(createCandidateCard(c));
    add(candidateLabel(c), { mergeInto: c.id });
  }
  add('不是同一位：另外建立新卡', { forceNew: true });
  showView('nameChoiceView');
}

// 伺服器儲存的網址就是送出的網址，所以名稱要用同一個網址當鍵
function namesFor(urls: string[]): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const u of urls) {
    const n = nameByUrl.get(normalizeUrl(u));
    if (n) out[u] = n;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function setSubmitting(submitting: boolean): void {
  const btn = $('btnSubmit') as HTMLButtonElement;
  btn.disabled = submitting;
  btn.textContent = submitting ? '送出中...' : '加入觀測';
}

// 使用者勾選的繪師類型（沒勾＝未標示）；值與伺服器的類型 id 相同
function selectedTypes(): string[] {
  return [...document.querySelectorAll<HTMLElement>('#typePicker .type-btn[aria-pressed="true"]')].map(b => b.dataset.type ?? '').filter(Boolean);
}

document.querySelectorAll<HTMLElement>('#typePicker .type-btn').forEach(btn => {
  btn.addEventListener('click', () => btn.setAttribute('aria-pressed', String(btn.getAttribute('aria-pressed') !== 'true')));
});

async function submitArtist(choice?: NameChoice): Promise<void> {
  if (!currentProfile) return;

  setSubmitting(true);

  const name = ($('previewName') as HTMLInputElement).value.trim() || undefined;
  const checkedLinks = [...allDiscoveredUrls].filter(u => !uncheckedUrls.has(u) && !isNonAccount(u));

  try {
    const res = await fetch(`${API_BASE}/api/artists`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withChoice({
        name,
        url: currentProfile.profileUrl,
        // 只送 http(s) 的圖片網址；其他（空字串、相對路徑、data:）一律不送，伺服器會用別的網站的頭像或名字首字
        avatarUrl: currentProfile.avatarUrl && isWebUrl(currentProfile.avatarUrl) ? currentProfile.avatarUrl : undefined,
        extraLinks: checkedLinks.length > 0 ? checkedLinks : undefined,
        names: namesFor([currentProfile.profileUrl, ...checkedLinks]),
        types: selectedTypes(),
      }, choice)),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '未知錯誤' }));
      // 已有同名繪師：不默默合併，讓使用者選「加到那張」或「另建新卡」
      const candidates = parseNameExists(res.status, err);
      if (candidates) {
        setSubmitting(false);
        showNameChoice(candidates);
        return;
      }
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const added = (await res.json().catch(() => null)) as AddedCard | null;
    await chrome.storage.session.remove(getStorageKey(currentProfile.profileUrl));
    showView('successView');
    void renderAdded(added);
  } catch (err) {
    setSubmitting(false);
    $('errorText').textContent = (err as Error).message;
    showView('errorView');
  }
}

async function init(): Promise<void> {
  cfg = await loadConfig(API_BASE);
  await cleanupLeftoverTabs();
  setSubmitting(false);
  showView('loading');

  const user = await checkAuth();
  if (!user) { showView('notLoggedIn'); return; }

  $('statusBar').textContent = `已登入：${user.username}`;

  const found = await fetchProfile();
  if (!found) { showView('notProfilePage'); return; }
  const profile = await resolveDlsiteCircles(found);

  const saved = await loadState(profile.profileUrl);
  const avatarChanged = saved && profile.avatarUrl && saved.profile.avatarUrl !== profile.avatarUrl;
  if (saved && saved.discoveredUrls.length > 0 && !avatarChanged) {
    saved.profile.avatarUrl = profile.avatarUrl || saved.profile.avatarUrl;
    saved.profile.name = profile.name || saved.profile.name;
    renderFromState(saved);
  } else {
    if (avatarChanged) await chrome.storage.session.remove(getStorageKey(profile.profileUrl));
    renderProfile(profile);
  }
}

document.addEventListener('click', (e) => {
  const btn = (e.target as Element).closest('.btn-collapse') as HTMLButtonElement | null;
  if (!btn) return;
  const targetId = btn.dataset.target;
  if (!targetId) return;
  $(targetId).classList.toggle('collapsed');
  btn.classList.toggle('collapsed');
});

$('btnSubmit').addEventListener('click', () => { void submitArtist(); });
$('btnCancel').addEventListener('click', () => window.close());
$('btnRetry').addEventListener('click', init);
$('btnNameCancel').addEventListener('click', init);
$('btnSmartDetect').addEventListener('click', smartDetectAll);
$('btnRefresh').addEventListener('click', () => {
  chrome.storage.session.clear().then(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) chrome.tabs.reload(tabs[0].id);
    });
    window.location.reload();
  });
});

init();
